use crate::models::AuditEvent;
use rdkafka::{
    config::ClientConfig,
    producer::{FutureProducer, FutureRecord},
    util::Timeout,
};
use std::sync::Arc;
use tracing::{error, info};

pub struct KafkaProducer {
    producer: Arc<FutureProducer>,
    topic: String,
}

impl KafkaProducer {
    pub async fn new(brokers: &str) -> anyhow::Result<Self> {
        let producer: FutureProducer = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("message.timeout.ms", "5000")
            .set("acks", "all")
            .set("retries", "3")
            .create()?;

        info!("Connected to Kafka at {}", brokers);

        Ok(Self {
            producer: Arc::new(producer),
            topic: "audit-events".to_string(),
        })
    }

    pub async fn send_audit_event(&self, event: &AuditEvent) -> anyhow::Result<()> {
        let payload = serde_json::to_string(event)?;
        let key = event.id.to_string();

        let record = FutureRecord::to(&self.topic)
            .key(&key)
            .payload(&payload);

        match self.producer.send(record, Timeout::Never).await {
            Ok((partition, offset)) => {
                info!(
                    "Audit event sent to Kafka: partition={}, offset={}",
                    partition, offset
                );
                Ok(())
            }
            Err((e, _)) => {
                error!("Failed to send audit event to Kafka: {}", e);
                Err(e.into())
            }
        }
    }

    pub async fn send_flow_event(
        &self,
        flow_id: &str,
        step: &str,
        data: serde_json::Value,
    ) -> anyhow::Result<()> {
        let event = serde_json::json!({
            "flow_id": flow_id,
            "step": step,
            "data": data,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        });

        let payload = serde_json::to_string(&event)?;

        let record = FutureRecord::to(&format!("flow-{}", flow_id))
            .key(flow_id)
            .payload(&payload);

        match self.producer.send(record, Timeout::Never).await {
            Ok((partition, offset)) => {
                info!(
                    "Flow event sent: flow={}, partition={}, offset={}",
                    flow_id, partition, offset
                );
                Ok(())
            }
            Err((e, _)) => {
                error!("Failed to send flow event: {}", e);
                Err(e.into())
            }
        }
    }

    /// Send generic message to any topic
    pub async fn send_message(
        &self,
        topic: &str,
        key: &str,
        payload: &str,
    ) -> anyhow::Result<(i32, i64)> {
        let record = FutureRecord::to(topic)
            .key(key)
            .payload(payload);

        match self.producer.send(record, Timeout::After(std::time::Duration::from_secs(5))).await {
            Ok((partition, offset)) => {
                info!(
                    "Message sent to Kafka: topic={}, partition={}, offset={}",
                    topic, partition, offset
                );
                Ok((partition, offset))
            }
            Err((e, _)) => {
                error!("Failed to send message to Kafka: {}", e);
                Err(e.into())
            }
        }
    }

    /// Send WorkerJob to worker queue topic
    pub async fn send_worker_job(
        &self,
        queue_name: &str,
        job: &crate::models::WorkerJob,
    ) -> anyhow::Result<(i32, i64)> {
        let topic = format!("orch-worker-{}", queue_name);
        let key = job.id.clone();
        let payload = serde_json::to_string(job)?;
        
        self.send_message(&topic, &key, &payload).await
    }
}

use std::sync::OnceLock;

static KAFKA_PRODUCER: OnceLock<Arc<KafkaProducer>> = OnceLock::new();

/// Initialize global Kafka producer
pub fn init_kafka_producer(brokers: &str) -> anyhow::Result<()> {
    let runtime = tokio::runtime::Handle::try_current()?;
    let producer = runtime.block_on(KafkaProducer::new(brokers))?;
    KAFKA_PRODUCER.set(Arc::new(producer))
        .map_err(|_| anyhow::anyhow!("Kafka producer already initialized"))?;
    Ok(())
}

/// Get global Kafka producer
pub fn get_kafka_producer() -> Option<Arc<KafkaProducer>> {
    KAFKA_PRODUCER.get().cloned()
}
