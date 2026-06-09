// ==========================================
// Kafka Pipeline Service
// Producer and Consumer for event-driven execution
// ==========================================

use rdkafka::{
    config::ClientConfig,
    producer::{FutureProducer, FutureRecord},
    consumer::{Consumer, StreamConsumer},
    Message,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;
use tracing::{error, info, warn};

/// Kafka Producer for sending events
#[derive(Clone)]
pub struct KafkaProducer {
    producer: Option<FutureProducer>,
}

impl KafkaProducer {
    /// Create new producer
    pub async fn new(brokers: &str) -> anyhow::Result<Self> {
        let producer: FutureProducer = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("message.timeout.ms", "5000")
            .set("metadata.max.age.ms", "10000")
            .set("topic.metadata.refresh.interval.ms", "30000")
            .set("client.dns.lookup", "use_all_dns_ips")
            .create()?;

        // Test connection
        let test_record = FutureRecord::to("test-topic")
            .key("test")
            .payload(b"test");
        
        match producer.send(test_record, Duration::from_secs(5)).await {
            Ok(_) | Err((rdkafka::error::KafkaError::MessageProduction(_), _)) => {
                // MessageProduction error is expected since topic might not exist
                info!("✅ Kafka producer connected to {}", brokers);
            }
            Err((e, _)) => {
                return Err(anyhow::anyhow!("Kafka connection failed: {}", e));
            }
        }

        Ok(Self {
            producer: Some(producer),
        })
    }

    /// Create noop producer (when Kafka is unavailable)
    pub fn noop() -> Self {
        Self { producer: None }
    }

    /// Check if producer is connected to Kafka (not noop)
    pub fn is_connected(&self) -> bool {
        self.producer.is_some()
    }

    /// Flush any in-flight messages and drop the producer (for graceful shutdown).
    /// rdkafka flushes on drop, but this gives us an explicit bounded flush point.
    pub async fn shutdown(&self) {
        if let Some(producer) = &self.producer {
            // Use rdkafka's Producer::flush (blocking), run on blocking pool
            let producer = producer.clone();
            let _ = tokio::task::spawn_blocking(move || {
                use rdkafka::producer::Producer;
                let _ = producer.flush(Duration::from_secs(10));
            })
            .await;
            info!("Kafka producer: flush complete");
        }
    }

    /// Send message to topic
    pub async fn send(&self, topic: &str, key: &str, payload: &str) -> anyhow::Result<()> {
        if let Some(producer) = &self.producer {
            let record = FutureRecord::to(topic)
                .key(key)
                .payload(payload.as_bytes());

            producer.send(record, Duration::from_secs(5)).await
                .map_err(|(e, _)| anyhow::anyhow!("Kafka send failed: {}", e))?;
            
            Ok(())
        } else {
            // Noop mode - just log
            info!("[NOOP] Would send to {}: {}", topic, payload);
            Ok(())
        }
    }

    /// Send event log
    pub async fn log_event(&self, request_id: &str, level: &str, message: &str, data: Value) -> anyhow::Result<()> {
        let event = serde_json::json!({
            "type": "EVENT_LOG",
            "level": level,
            "requestId": request_id,
            "message": message,
            "data": data,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        });

        self.send("event-logs", request_id, &event.to_string()).await
    }

    /// Send audit event
    pub async fn audit(&self, request_id: &str, action: &str, entity_type: &str, entity_id: &str, changes: Value) -> anyhow::Result<()> {
        let event = serde_json::json!({
            "type": "AUDIT",
            "action": action,
            "entityType": entity_type,
            "entityId": entity_id,
            "requestId": request_id,
            "changes": changes,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        });

        self.send("audit-events", request_id, &event.to_string()).await
    }

    /// Send generic message to any topic and return partition/offset
    pub async fn send_message(&self, topic: &str, key: &str, payload: &str) -> anyhow::Result<(i32, i64)> {
        if let Some(producer) = &self.producer {
            let record = FutureRecord::to(topic)
                .key(key)
                .payload(payload.as_bytes());

            match producer.send(record, Duration::from_secs(5)).await {
                Ok((partition, offset)) => {
                    info!("Message sent to {}: partition={}, offset={}", topic, partition, offset);
                    Ok((partition, offset))
                }
                Err((e, _)) => Err(anyhow::anyhow!("Kafka send failed: {}", e))
            }
        } else {
            // Noop mode
            info!("[NOOP] Would send to {}: key={}, payload={}", topic, key, payload);
            Ok((-1, -1))
        }
    }

    /// Send WorkerJob to worker queue topic
    pub async fn send_worker_job(&self, queue_name: &str, job: &crate::models::WorkerJob) -> anyhow::Result<(i32, i64)> {
        let topic = format!("orch-worker-{}", queue_name);
        let key = job.id.clone();
        let payload = serde_json::to_string(job)?;
        
        self.send_message(&topic, &key, &payload).await
    }
}

use std::sync::OnceLock;
use tokio::sync::OnceCell;

static GLOBAL_KAFKA_PRODUCER: OnceCell<KafkaProducer> = OnceCell::const_new();

/// Initialize global Kafka producer (lazy async initialization)
pub async fn init_global_kafka_producer(brokers: &str) -> anyhow::Result<()> {
    GLOBAL_KAFKA_PRODUCER
        .get_or_init(|| async {
            KafkaProducer::new(brokers).await.unwrap_or_else(|_| KafkaProducer::noop())
        })
        .await;
    Ok(())
}

/// Get global Kafka producer (returns cloned instance)
pub fn get_kafka_producer() -> Option<KafkaProducer> {
    GLOBAL_KAFKA_PRODUCER.get().cloned()
}

/// Kafka Consumer for receiving events
pub struct KafkaConsumer {
    consumer: StreamConsumer,
}

impl KafkaConsumer {
    /// Create new consumer
    pub fn new(brokers: &str, group_id: &str, topics: &[&str]) -> anyhow::Result<Self> {
        let consumer: StreamConsumer = ClientConfig::new()
            .set("group.id", group_id)
            .set("bootstrap.servers", brokers)
            .set("auto.offset.reset", "earliest")
            .create()?;

        let topics_owned: Vec<String> = topics.iter().map(|t| t.to_string()).collect();
        consumer.subscribe(&topics_owned.iter().map(|s| s.as_str()).collect::<Vec<_>>())?;

        info!("✅ Kafka consumer subscribed to topics: {:?}", topics);

        Ok(Self { consumer })
    }

    /// Start consuming messages
    pub async fn run<F>(&self, handler: F) -> anyhow::Result<()>
    where
        F: Fn(&str, &str, &str) -> anyhow::Result<()>,
    {
        loop {
            match self.consumer.recv().await {
                Ok(msg) => {
                    let topic = msg.topic().to_string();
                    let key = msg.key_view::<str>()
                        .unwrap_or(Ok(""))
                        .unwrap_or("")
                        .to_string();
                    let payload = msg.payload_view::<str>()
                        .unwrap_or(Ok(""))
                        .unwrap_or("")
                        .to_string();

                    if let Err(e) = handler(&topic, &key, &payload) {
                        error!("Message handler error: {}", e);
                    }
                }
                Err(e) => {
                    error!("Kafka consumer error: {}", e);
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }
            }
        }
    }
}

/// HttpResponse for returning to client
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpResponse {
    pub status_code: u16,
    pub headers: std::collections::HashMap<String, String>,
    pub body: Value,
}
