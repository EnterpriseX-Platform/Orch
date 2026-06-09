// ==========================================
// Message Queue Abstraction
// Supports: None, Kafka, RabbitMQ, etc.
// ==========================================

use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

/// Message Queue Provider Type
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqProvider {
    /// No message queue - synchronous processing only
    None,
    /// Apache Kafka
    Kafka,
    /// RabbitMQ
    RabbitMq,
    /// AWS SQS
    Sqs,
    /// Google Pub/Sub
    PubSub,
}

impl std::str::FromStr for MqProvider {
    type Err = String;
    
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "none" | "disabled" | "" => Ok(MqProvider::None),
            "kafka" => Ok(MqProvider::Kafka),
            "rabbitmq" | "amqp" => Ok(MqProvider::RabbitMq),
            "sqs" | "aws_sqs" => Ok(MqProvider::Sqs),
            "pubsub" | "gcp_pubsub" => Ok(MqProvider::PubSub),
            _ => Err(format!("Unknown MQ provider: {}", s)),
        }
    }
}

/// Message Queue Message
#[derive(Debug, Clone)]
pub struct MqMessage {
    pub topic: String,
    pub key: String,
    pub payload: Value,
    pub headers: HashMap<String, String>,
}

/// Message Queue Handler Result
type MqResult<T> = Result<T, String>;

/// Message Queue Client Trait
pub trait MqClient: Send + Sync {
    /// Send message to a topic/queue
    fn send<'a>(&'a self, message: MqMessage) -> Pin<Box<dyn Future<Output = MqResult<()>> + Send + 'a>>;
    
    /// Subscribe to a topic/queue with handler
    fn subscribe<'a>(
        &'a self, 
        topic: &'a str, 
        handler: Arc<dyn Fn(MqMessage) -> Pin<Box<dyn Future<Output = MqResult<()>> + Send>> + Send + Sync>
    ) -> Pin<Box<dyn Future<Output = MqResult<()>> + Send + 'a>>;
    
    /// Close connection
    fn close<'a>(&'a self) -> Pin<Box<dyn Future<Output = MqResult<()>> + Send + 'a>>;
}

/// No-op MQ Client (when MQ is disabled)
pub struct NoopMqClient;

impl MqClient for NoopMqClient {
    fn send<'a>(&'a self, _message: MqMessage) -> Pin<Box<dyn Future<Output = MqResult<()>> + Send + 'a>> {
        Box::pin(async move {
            tracing::debug!("MQ disabled - message dropped");
            Ok(())
        })
    }
    
    fn subscribe<'a>(
        &'a self, 
        _topic: &'a str, 
        _handler: Arc<dyn Fn(MqMessage) -> Pin<Box<dyn Future<Output = MqResult<()>> + Send>> + Send + Sync>
    ) -> Pin<Box<dyn Future<Output = MqResult<()>> + Send + 'a>> {
        Box::pin(async move {
            tracing::debug!("MQ disabled - subscribe ignored");
            Ok(())
        })
    }
    
    fn close<'a>(&'a self) -> Pin<Box<dyn Future<Output = MqResult<()>> + Send + 'a>> {
        Box::pin(async move { Ok(()) })
    }
}

/// MQ Configuration
#[derive(Debug, Clone)]
pub struct MqConfig {
    pub provider: MqProvider,
    pub brokers: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub max_retries: u32,
    pub retry_delay_ms: u64,
}

impl Default for MqConfig {
    fn default() -> Self {
        Self {
            provider: MqProvider::None,
            brokers: String::new(),
            username: None,
            password: None,
            max_retries: 3,
            retry_delay_ms: 1000,
        }
    }
}

/// RabbitMQ-specific configuration (Phase 2)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RabbitMqConfig {
    pub url: String,
    pub exchange: String,
    pub queue_prefix: String,
    pub durable: bool,
}

/// AWS SQS-specific configuration (Phase 2)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SqsConfig {
    pub region: String,
    pub queue_url_prefix: String,
    pub access_key_id: Option<String>,
    pub secret_access_key: Option<String>,
}

/// MQ Client Factory
pub struct MqClientFactory;

impl MqClientFactory {
    /// Create MQ client from environment config
    pub async fn create_from_env() -> Arc<dyn MqClient> {
        let provider = std::env::var("MQ_PROVIDER")
            .unwrap_or_else(|_| "none".to_string())
            .parse::<MqProvider>()
            .unwrap_or(MqProvider::None);
        
        match provider {
            MqProvider::None => {
                tracing::info!("📭 Message Queue: Disabled (synchronous mode)");
                Arc::new(NoopMqClient)
            }
            MqProvider::Kafka => {
                let brokers = std::env::var("KAFKA_BROKERS")
                    .unwrap_or_else(|_| "localhost:9047".to_string());
                tracing::info!("📨 Message Queue: Kafka ({})", brokers);
                // Return Kafka client here when implemented
                Arc::new(NoopMqClient)
            }
            MqProvider::RabbitMq => {
                let brokers = std::env::var("RABBITMQ_URL")
                    .unwrap_or_else(|_| "amqp://localhost:5672".to_string());
                tracing::info!("📨 Message Queue: RabbitMQ ({})", brokers);
                // Return RabbitMQ client here when implemented
                Arc::new(NoopMqClient)
            }
            _ => {
                tracing::warn!("📨 Message Queue: {:?} not yet implemented, using noop", provider);
                Arc::new(NoopMqClient)
            }
        }
    }
}

/// Global MQ Client instance
use std::sync::OnceLock;

static MQ_CLIENT: OnceLock<Arc<dyn MqClient>> = OnceLock::new();

pub fn init_mq_client(client: Arc<dyn MqClient>) {
    let _ = MQ_CLIENT.set(client);
}

pub fn get_mq_client() -> Option<&'static Arc<dyn MqClient>> {
    MQ_CLIENT.get()
}

/// Send audit/event message to MQ (non-blocking)
pub async fn send_to_mq(topic: &str, key: &str, payload: Value) {
    if let Some(client) = get_mq_client() {
        let message = MqMessage {
            topic: topic.to_string(),
            key: key.to_string(),
            payload,
            headers: HashMap::new(),
        };
        
        if let Err(e) = client.send(message).await {
            tracing::warn!("Failed to send to MQ: {}", e);
        }
    }
}