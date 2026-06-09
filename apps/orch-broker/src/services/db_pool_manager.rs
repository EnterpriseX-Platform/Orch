// ==========================================
// Database Pool Manager
// Global connection pool cache for dynamic DB queries
// Pattern: same as kafka_pipeline global producer
// ==========================================

use dashmap::DashMap;
use sqlx::postgres::PgPool;
use std::sync::OnceLock;
use tracing::{info, warn};

static GLOBAL_DB_POOL_MANAGER: OnceLock<DbPoolManager> = OnceLock::new();

pub struct DbPoolManager {
    pools: DashMap<String, PgPool>,
}

impl DbPoolManager {
    pub fn new() -> Self {
        Self {
            pools: DashMap::new(),
        }
    }

    /// Get or create a connection pool for the given name.
    /// Connection string resolved from env: DB_CONN_{NAME}_URL, fallback to DATABASE_URL
    pub async fn get_or_create(&self, connection_name: &str) -> anyhow::Result<PgPool> {
        // Return cached pool if exists
        if let Some(pool) = self.pools.get(connection_name) {
            return Ok(pool.clone());
        }

        // Resolve connection string
        let env_key = format!("DB_CONN_{}_URL", connection_name.to_uppercase());
        let conn_str = std::env::var(&env_key)
            .or_else(|_| std::env::var("DATABASE_URL"))
            .map_err(|_| anyhow::anyhow!(
                "No connection string found. Set {} or DATABASE_URL", env_key
            ))?;

        info!("Creating DB pool for '{}' connection", connection_name);

        let pool = PgPool::connect_lazy(&conn_str)?;

        self.pools.insert(connection_name.to_string(), pool.clone());
        Ok(pool)
    }
}

/// Initialize global DB pool manager
pub fn init_global_db_pool_manager() {
    let _ = GLOBAL_DB_POOL_MANAGER.set(DbPoolManager::new());
    info!("✅ Global DB Pool Manager initialized");
}

/// Get global DB pool manager
pub fn get_db_pool_manager() -> Option<&'static DbPoolManager> {
    GLOBAL_DB_POOL_MANAGER.get()
}
