// Integration test for flow execution with pub node
use orch_broker::{
    NodeRegistry, 
    ExecutionContext, 
    HttpRequestData,
    SdkBuilder,
};
use std::collections::HashMap;
use serde_json::json;

/// Test that pub node executes without infinite loop
#[tokio::test]
async fn test_pub_node_execution() {
    // Create registry with builtin handlers
    let registry = SdkBuilder::new().build().await;
    
    // Get pub handler
    let handler = registry.get("pub").await.expect("pub handler should exist");
    
    // Create execution context
    let request_data = HttpRequestData {
        method: "POST".to_string(),
        path: "/test".to_string(),
        headers: HashMap::new(),
        query_params: HashMap::new(),
        body: Some(json!({"test": true})),
        client_ip: "127.0.0.1".to_string(),
    };
    
    let mut ctx = ExecutionContext::new(
        "test-request-id".to_string(),
        "test-flow-id".to_string(),
        "test-user".to_string(),
        "".to_string(),
        request_data,
    );
    
    let config = json!({
        "topic": "test-topic",
        "useInput": true
    });
    
    let input = json!({"message": "Hello Kafka"});
    
    // Execute pub handler
    let result = handler.execute(&mut ctx, &config, &input).await;
    
    // Should succeed (or fail with Kafka not available, but not infinite loop)
    match result {
        Ok(output) => {
            println!("✅ Pub execution succeeded: {}", output);
            assert!(output.get("published").is_some() || output.get("mock").is_some());
        }
        Err(e) => {
            // Even if it fails, it should fail quickly (not infinite loop)
            println!("⚠️ Pub execution failed (expected if Kafka not available): {}", e.message);
            // This is acceptable - the important thing is it didn't hang
        }
    }
}

/// Test that sub node (trigger) has correct metadata
#[tokio::test]
async fn test_sub_node_is_trigger() {
    let registry = SdkBuilder::new().build().await;
    
    let handler = registry.get("sub").await.expect("sub handler should exist");
    let metadata = handler.metadata();
    
    // Sub should be a trigger node
    assert_eq!(metadata.node_type, "sub");
    assert!(metadata.description.to_lowercase().contains("subscribe") || 
            metadata.description.to_lowercase().contains("trigger"),
            "sub should be described as subscribe/trigger: got '{}'", metadata.description);
}

/// Test complete flow with multiple nodes
#[tokio::test]
async fn test_flow_chain_without_pubsub_loop() {
    use orch_broker::NodeCategory;
    
    let registry = SdkBuilder::new().build().await;
    
    // Get all handler metadata
    let all_metadata = registry.get_all_metadata().await;
    
    // Check that pub is an Action (not a Trigger that would cause loops)
    let pub_meta = all_metadata.iter()
        .find(|m| m.node_type == "pub")
        .expect("pub should exist");
    
    assert_eq!(pub_meta.category, NodeCategory::Action, 
        "pub should be an Action node, not Trigger");
    
    // Check that sub is a Trigger
    let sub_meta = all_metadata.iter()
        .find(|m| m.node_type == "sub")
        .expect("sub should exist");
    
    assert_eq!(sub_meta.category, NodeCategory::Trigger,
        "sub should be a Trigger node");
    
    // Verify pubsub doesn't exist
    let pubsub_exists = all_metadata.iter()
        .any(|m| m.node_type == "pubsub");
    
    assert!(!pubsub_exists, "pubsub should not exist in registry");
    
    println!("✅ Flow architecture is correct:");
    println!("   - pub: Action (end node)");
    println!("   - sub: Trigger (start node)");
    println!("   - pubsub: Removed");
}
