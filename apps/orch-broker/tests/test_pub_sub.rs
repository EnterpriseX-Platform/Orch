// Integration test for pub/sub nodes
use orch_broker::{NodeRegistry, NodeHandler, NodeCategory};
use serde_json::json;

#[tokio::test]
async fn test_pub_handler_registered() {
    let registry = NodeRegistry::new();
    registry.register_builtin_handlers().await;
    
    let handler = registry.get("pub").await;
    assert!(handler.is_some(), "pub handler should be registered");
    
    let metadata = handler.unwrap().metadata();
    assert_eq!(metadata.node_type, "pub");
    assert_eq!(metadata.category, NodeCategory::Action);
}

#[tokio::test]
async fn test_sub_handler_registered() {
    let registry = NodeRegistry::new();
    registry.register_builtin_handlers().await;
    
    let handler = registry.get("sub").await;
    assert!(handler.is_some(), "sub handler should be registered");
    
    let metadata = handler.unwrap().metadata();
    assert_eq!(metadata.node_type, "sub");
    assert_eq!(metadata.category, NodeCategory::Trigger);
}

#[tokio::test]
async fn test_pubsub_handler_removed() {
    let registry = NodeRegistry::new();
    registry.register_builtin_handlers().await;
    
    // pubsub should NOT exist anymore
    let handler = registry.get("pubsub").await;
    assert!(handler.is_none(), "pubsub handler should NOT be registered (removed)");
}

#[tokio::test]
async fn test_pub_validation() {
    let registry = NodeRegistry::new();
    registry.register_builtin_handlers().await;
    
    let handler = registry.get("pub").await.unwrap();
    
    // Valid config
    let valid_config = json!({"topic": "test-topic"});
    assert!(handler.validate(&valid_config).is_ok());
    
    // Invalid config - missing topic
    let invalid_config = json!({"message": "test"});
    assert!(handler.validate(&invalid_config).is_err());
}

#[tokio::test]
async fn test_sub_validation() {
    let registry = NodeRegistry::new();
    registry.register_builtin_handlers().await;
    
    let handler = registry.get("sub").await.unwrap();
    
    // Valid config
    let valid_config = json!({"topic": "test-topic"});
    assert!(handler.validate(&valid_config).is_ok());
    
    // Invalid config - missing topic
    let invalid_config = json!({"other": "value"});
    assert!(handler.validate(&invalid_config).is_err());
}
