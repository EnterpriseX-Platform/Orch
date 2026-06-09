// ==========================================
// Kafka Admin - Topic Management
// Auto-create topics from flow config during deploy
// ==========================================

use rdkafka::admin::{AdminClient, AdminOptions, NewTopic, TopicReplication};
use rdkafka::client::DefaultClientContext;
use rdkafka::config::ClientConfig;
use tracing::{info, warn, error};

pub struct KafkaAdmin {
    admin_client: AdminClient<DefaultClientContext>,
}

impl KafkaAdmin {
    /// Create new KafkaAdmin with bootstrap brokers
    pub fn new(brokers: &str) -> Result<Self, rdkafka::error::KafkaError> {
        let admin_client = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("request.timeout.ms", "5000")
            .create()?;
        
        Ok(Self { admin_client })
    }

    /// Create topic if it doesn't exist
    pub async fn create_topic_if_not_exists(
        &self,
        topic: &str,
        num_partitions: i32,
        replication_factor: i32,
    ) -> Result<bool, rdkafka::error::KafkaError> {
        // Check if topic exists
        match self.topic_exists(topic).await {
            Ok(true) => {
                info!("✅ Topic '{}' already exists", topic);
                return Ok(false);
            }
            Ok(false) => {
                // Topic doesn't exist, create it
            }
            Err(e) => {
                warn!("⚠️  Could not check topic existence: {}", e);
                // Continue to try create anyway
            }
        }

        // Create topic
        let new_topic = NewTopic::new(
            topic,
            num_partitions,
            TopicReplication::Fixed(replication_factor),
        );

        let opts = AdminOptions::new()
            .operation_timeout(Some(std::time::Duration::from_secs(10)));

        match self.admin_client.create_topics(&[new_topic], &opts).await {
            Ok(results) => {
                let mut has_error = false;
                for result in results {
                    match result {
                        Ok(created_topic) => {
                            info!("✅ Successfully created topic: {}", created_topic);
                        }
                        Err((err, topic_name)) => {
                            // Check if topic already exists (race condition) by error message
                            let err_str = format!("{}", err);
                            if err_str.contains("already exists") || err_str.contains("TopicAlreadyExists") {
                                info!("ℹ️  Topic '{}' already exists (race condition)", topic_name);
                            } else {
                                error!("❌ Failed to create topic '{}': {}", topic_name, err);
                                has_error = true;
                            }
                        }
                    }
                }
                if has_error {
                    // Return a generic error since we already logged the specific one
                    return Err(rdkafka::error::KafkaError::ClientCreation(
                        format!("Failed to create topic '{}'", topic)
                    ));
                }
                Ok(true)
            }
            Err(e) => {
                error!("❌ Failed to create topic '{}': {}", topic, e);
                Err(e)
            }
        }
    }

    /// Check if topic exists
    async fn topic_exists(&self, topic: &str) -> Result<bool, rdkafka::error::KafkaError> {
        let metadata = self.admin_client
            .inner()
            .fetch_metadata(None, std::time::Duration::from_secs(5))?;
        
        for t in metadata.topics() {
            if t.name() == topic {
                return Ok(true);
            }
        }
        Ok(false)
    }

    /// Extract Kafka topics from flow nodes and create them
    pub async fn ensure_topics_from_flow(
        &self,
        flow_id: &str,
        nodes: &serde_json::Value,
    ) -> Result<Vec<String>, String> {
        let mut created_topics = Vec::new();
        
        let nodes_array = match nodes.as_array() {
            Some(arr) => arr,
            None => return Ok(created_topics),
        };

        for node in nodes_array {
            // Check if this is a Kafka node (trigger or regular)
            let node_type = node
                .get("type")
                .and_then(|t| t.as_str())
                .or_else(|| node
                    .get("data")
                    .and_then(|d| d.get("type"))
                    .and_then(|t| t.as_str()));

            let is_kafka = match node_type {
                Some(t) => t == "kafka" || t == "kafka_consumer" || t == "kafka_producer" || t == "kafka_trigger",
                None => false,
            };

            if !is_kafka {
                continue;
            }

            // Extract topic from config
            let config = node
                .get("data")
                .and_then(|d| d.get("config"));

            let topic = config
                .and_then(|c| c.get("topic"))
                .and_then(|t| t.as_str());

            if let Some(topic_name) = topic {
                if topic_name.is_empty() {
                    warn!("⚠️  Empty topic name in node for flow {}", flow_id);
                    continue;
                }

                info!("🔍 Ensuring Kafka topic '{}' for flow '{}'", topic_name, flow_id);
                
                // Parse partitions/replication from config or use defaults
                let partitions = config
                    .and_then(|c| c.get("partitions"))
                    .and_then(|p| p.as_i64())
                    .map(|p| p as i32)
                    .unwrap_or(3);

                let replication = config
                    .and_then(|c| c.get("replicationFactor"))
                    .and_then(|r| r.as_i64())
                    .map(|r| r as i32)
                    .unwrap_or(1);

                match self.create_topic_if_not_exists(topic_name, partitions, replication).await {
                    Ok(true) => {
                        created_topics.push(topic_name.to_string());
                        info!("✅ Created topic '{}' for flow '{}'", topic_name, flow_id);
                    }
                    Ok(false) => {
                        info!("ℹ️  Topic '{}' already exists for flow '{}'", topic_name, flow_id);
                    }
                    Err(e) => {
                        warn!("⚠️  Failed to create topic '{}' for flow '{}': {}", topic_name, flow_id, e);
                        // Don't fail the deployment, just log the warning
                    }
                }
            } else {
                warn!("⚠️  Kafka node without topic config in flow {}", flow_id);
            }
        }

        Ok(created_topics)
    }
}

/// Global admin instance (lazy init)
use std::sync::OnceLock;

static KAFKA_ADMIN: OnceLock<KafkaAdmin> = OnceLock::new();

pub fn init_kafka_admin(brokers: &str) -> Result<(), rdkafka::error::KafkaError> {
    let admin = KafkaAdmin::new(brokers)?;
    KAFKA_ADMIN.set(admin).map_err(|_| {
        rdkafka::error::KafkaError::ClientCreation(
            "KafkaAdmin already initialized".into()
        )
    })
}

pub fn get_kafka_admin() -> Option<&'static KafkaAdmin> {
    KAFKA_ADMIN.get()
}