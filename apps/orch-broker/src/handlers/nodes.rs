// ==========================================
// Node Registry Handlers
// List available node types and metadata
// ==========================================

use axum::{
    extract::{Path, State},
    response::Json,
    http::StatusCode,
};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::AppState;

/// GET /nodes - List all registered node types
pub async fn list_node_types(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, StatusCode> {
    let metadata = state.node_registry.get_all_metadata().await;
    
    let node_types: Vec<Value> = metadata.iter().map(|m| {
        json!({
            "nodeType": m.node_type,
            "category": m.category.as_str(),
            "label": m.label,
            "description": m.description,
            "icon": m.icon,
            "color": m.color,
            "version": m.version,
        })
    }).collect();
    
    Ok(Json(json!({
        "nodeTypes": node_types,
        "total": node_types.len(),
    })))
}

/// GET /nodes/:node_type - Get specific node type details
pub async fn get_node_type(
    State(state): State<Arc<AppState>>,
    Path(node_type): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let metadata = state.node_registry.get_metadata(&node_type).await
        .ok_or(StatusCode::NOT_FOUND)?;
    
    let schema = state.node_registry.get_config_schema(&node_type).await;
    
    Ok(Json(json!({
        "nodeType": metadata.node_type,
        "category": metadata.category.as_str(),
        "label": metadata.label,
        "description": metadata.description,
        "icon": metadata.icon,
        "color": metadata.color,
        "version": metadata.version,
        "configSchema": schema,
    })))
}

/// POST /nodes/:node_type/validate - Validate node configuration
pub async fn validate_node_config(
    State(state): State<Arc<AppState>>,
    Path(node_type): Path<String>,
    axum::extract::Json(config): axum::extract::Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    if !state.node_registry.has(&node_type).await {
        return Err(StatusCode::NOT_FOUND);
    }
    
    match state.node_registry.validate_config(&node_type, &config).await {
        Ok(()) => Ok(Json(json!({
            "valid": true,
            "nodeType": node_type,
        }))),
        Err(errors) => Ok(Json(json!({
            "valid": false,
            "nodeType": node_type,
            "errors": errors.iter().map(|e| {
                json!({
                    "field": e.field,
                    "message": e.message,
                })
            }).collect::<Vec<_>>(),
        }))),
    }
}

/// GET /nodes/categories - List node categories with counts
pub async fn list_categories(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, StatusCode> {
    let stats = state.node_registry.stats().await;
    
    let categories: Value = stats.by_category.iter().map(|(k, v)| {
        json!({
            "name": k,
            "count": v,
        })
    }).collect::<Vec<_>>().into();
    
    Ok(Json(json!({
        "categories": categories,
        "total": stats.total_handlers,
    })))
}

/// GET /nodes/export - Export all node types for frontend
pub async fn export_nodes(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, StatusCode> {
    let export = state.node_registry.export().await;
    
    Ok(Json(json!(export)))
}
