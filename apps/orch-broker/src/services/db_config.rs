// ==========================================
// Database Configuration Service
// Reads API Registration and Flow Config from PostgreSQL
// ==========================================

use crate::config::{FlowConfig, FlowNode, FlowEdge, AsyncConfig};
use serde_json::Value;
use sqlx::{postgres::PgPoolOptions, Pool, Postgres, Row};
use std::collections::HashMap;
use tracing::{error, info};

/// API Registration from database
#[derive(Debug, Clone)]
pub struct ApiRegistration {
    pub id: String,
    pub name: String,
    pub endpoint: String,      // Path pattern: /api/v1/payments, /service-center/*
    pub method: String,        // GET, POST, PUT, DELETE, ANY
    pub backend_url: String,   // Upstream URL
    pub flow_id: Option<String>,
    pub auth_type: String,
    pub api_key: Option<String>,
    pub extraction_config: Option<Value>,
    pub rate_limit_per_min: i32,
    pub audit_enabled: bool,
    pub status: String,        // ACTIVE, DRAFT, etc.
}

/// Database Configuration Manager
pub struct DbConfigManager {
    pool: Pool<Postgres>,
}

impl DbConfigManager {
    /// Create new database config manager
    pub async fn new(database_url: &str) -> anyhow::Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(10)
            .connect(database_url)
            .await?;

        info!("✅ Database config manager connected");
        Ok(Self { pool })
    }

    /// Load all active API registrations with flows
    pub async fn load_api_registrations(&self) -> anyhow::Result<Vec<ApiRegistration>> {
        let rows = sqlx::query(
            r#"
            SELECT 
                ar.id, ar.name, ar.endpoint, ar.method::text, ar.backend_url,
                ar.flow_id, ar.auth_type::text, ar.api_key, ar.extraction_config,
                ar.rate_limit_per_min, ar.audit_enabled, ar.status::text
            FROM api_registrations ar
            WHERE ar.status = 'ACTIVE'
            AND ar.flow_id IS NOT NULL
            ORDER BY ar.created_at DESC
            "#
        )
        .fetch_all(&self.pool)
        .await?;

        let mut registrations = Vec::new();
        for row in rows {
            registrations.push(ApiRegistration {
                id: row.get("id"),
                name: row.get("name"),
                endpoint: row.get("endpoint"),
                method: row.get::<String, _>("method").to_uppercase(),
                backend_url: row.get("backend_url"),
                flow_id: row.get("flow_id"),
                auth_type: row.get::<String, _>("auth_type").to_uppercase(),
                api_key: row.get("api_key"),
                extraction_config: row.get("extraction_config"),
                rate_limit_per_min: row.get("rate_limit_per_min"),
                audit_enabled: row.get("audit_enabled"),
                status: row.get::<String, _>("status"),
            });
        }

        info!("📋 Loaded {} active API registrations with flows", registrations.len());
        Ok(registrations)
    }

    /// Load specific flow by ID
    pub async fn load_flow(&self, flow_id: &str) -> anyhow::Result<Option<FlowConfig>> {
        let row = sqlx::query(
            r#"
            SELECT 
                fi.id, fi.name, fi.description, fi.execution_mode::text,
                fi.trigger_type::text, fi.flow_category::text,
                fi.nodes, fi.edges, fi.is_active, fi.async_config
            FROM flow_integrations fi
            WHERE fi.id = $1 AND fi.is_active = true
            "#
        )
        .bind(flow_id)
        .fetch_optional(&self.pool)
        .await?;

        match row {
            Some(row) => {
                let nodes: Vec<FlowNode> = serde_json::from_value(
                    row.get::<Value, _>("nodes")
                )?;
                let edges: Vec<FlowEdge> = serde_json::from_value(
                    row.get::<Value, _>("edges")
                )?;
                let async_config: Option<AsyncConfig> = row
                    .get::<Option<Value>, _>("async_config")
                    .and_then(|v| serde_json::from_value(v).ok());

                Ok(Some(FlowConfig {
                    id: row.get("id"),
                    name: row.get("name"),
                    description: row.get("description"),
                    flow_type: row.get::<String, _>("flow_category"),
                    execution_mode: row.get::<String, _>("execution_mode").to_lowercase(),
                    async_config,
                    nodes,
                    edges,
                    is_active: row.get("is_active"),
                    deployed_at: None,
                }))
            }
            None => Ok(None),
        }
    }

    /// Load all active flows
    pub async fn load_all_flows(&self) -> anyhow::Result<HashMap<String, FlowConfig>> {
        let rows = sqlx::query(
            r#"
            SELECT 
                fi.id, fi.name, fi.description, fi.execution_mode::text,
                fi.trigger_type::text, fi.flow_category::text,
                fi.nodes, fi.edges, fi.is_active, fi.async_config
            FROM flow_integrations fi
            WHERE fi.is_active = true
            "#
        )
        .fetch_all(&self.pool)
        .await?;

        let mut flows = HashMap::new();
        for row in rows {
            let id: String = row.get("id");
            
            let nodes: Vec<FlowNode> = match serde_json::from_value(
                row.get::<Value, _>("nodes")
            ) {
                Ok(n) => n,
                Err(e) => {
                    error!("Failed to parse nodes for flow {}: {}", id, e);
                    continue;
                }
            };
            
            let edges: Vec<FlowEdge> = match serde_json::from_value(
                row.get::<Value, _>("edges")
            ) {
                Ok(e) => e,
                Err(e) => {
                    error!("Failed to parse edges for flow {}: {}", id, e);
                    continue;
                }
            };

            let async_config: Option<AsyncConfig> = row
                .get::<Option<Value>, _>("async_config")
                .and_then(|v| serde_json::from_value(v).ok());

            flows.insert(id.clone(), FlowConfig {
                id,
                name: row.get("name"),
                description: row.get("description"),
                flow_type: row.get::<String, _>("flow_category"),
                execution_mode: row.get::<String, _>("execution_mode").to_lowercase(),
                async_config,
                nodes,
                edges,
                is_active: row.get("is_active"),
                deployed_at: None,
            });
        }

        info!("⚡ Loaded {} active flows from database", flows.len());
        Ok(flows)
    }

    /// Match path to API registration
    pub fn match_path(
        &self,
        path: &str,
        method: &str,
        registrations: &[ApiRegistration],
    ) -> Option<ApiRegistration> {
        for reg in registrations {
            // Check method match
            if reg.method != "ANY" && reg.method != method.to_uppercase() {
                continue;
            }

            // Check path pattern match
            // Support: exact match (/api/v1/payments) or wildcard (/api/v1/*)
            let pattern = &reg.endpoint;
            let matched = if pattern.ends_with("/*") {
                let prefix = &pattern[..pattern.len() - 1];
                path.starts_with(prefix)
            } else if pattern.contains("/:") {
                // Handle path params like /api/v1/payments/:id
                // Simplified: check prefix before first param
                let base = pattern.split("/:").next().unwrap_or(pattern);
                path.starts_with(base) || path == base
            } else {
                path == pattern
            };

            if matched {
                return Some(reg.clone());
            }
        }
        None
    }

    /// Log event to database
    pub async fn log_event(
        &self,
        request_id: &str,
        flow_id: Option<&str>,
        method: &str,
        path: &str,
        status_code: Option<i32>,
        duration_ms: i32,
        user_ip: Option<&str>,
        metadata: Option<Value>,
    ) -> anyhow::Result<()> {
        sqlx::query(
            r#"
            INSERT INTO event_logs 
                (request_id, flow_id, method, path, status_code, duration_ms, user_ip, metadata, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            "#
        )
        .bind(request_id)
        .bind(flow_id)
        .bind(method)
        .bind(path)
        .bind(status_code)
        .bind(duration_ms)
        .bind(user_ip)
        .bind(metadata)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Log audit to database
    pub async fn log_audit(
        &self,
        action: &str,
        entity_type: &str,
        entity_id: Option<&str>,
        flow_id: Option<&str>,
        user_id: Option<&str>,
        changes: Option<Value>,
        metadata: Option<Value>,
    ) -> anyhow::Result<()> {
        sqlx::query(
            r#"
            INSERT INTO flow_audit_logs 
                (action, entity_type, entity_id, flow_id, user_id, changes, metadata, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            "#
        )
        .bind(action)
        .bind(entity_type)
        .bind(entity_id)
        .bind(flow_id)
        .bind(user_id)
        .bind(changes)
        .bind(metadata)
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_matching() {
        let registrations = vec![
            ApiRegistration {
                id: "1".to_string(),
                name: "Payments".to_string(),
                endpoint: "/api/v1/payments".to_string(),
                method: "POST".to_string(),
                backend_url: "http://backend:8080/payments".to_string(),
                flow_id: Some("flow-1".to_string()),
                auth_type: "JWT".to_string(),
                api_key: None,
                extraction_config: None,
                rate_limit_per_min: 1000,
                audit_enabled: true,
                status: "ACTIVE".to_string(),
            },
            ApiRegistration {
                id: "2".to_string(),
                name: "Orders".to_string(),
                endpoint: "/api/v1/orders/*".to_string(),
                method: "ANY".to_string(),
                backend_url: "http://backend:8080/orders".to_string(),
                flow_id: Some("flow-2".to_string()),
                auth_type: "JWT".to_string(),
                api_key: None,
                extraction_config: None,
                rate_limit_per_min: 500,
                audit_enabled: true,
                status: "ACTIVE".to_string(),
            },
        ];

        let manager = DbConfigManager { pool: todo!() }; // Mock
        
        // Should match exact
        // assert!(manager.match_path("/api/v1/payments", "POST", &registrations).is_some());
        
        // Should match wildcard
        // assert!(manager.match_path("/api/v1/orders/expense", "GET", &registrations).is_some());
    }
}
