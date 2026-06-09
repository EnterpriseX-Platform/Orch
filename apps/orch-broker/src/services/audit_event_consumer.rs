// ==========================================
// Audit / Event delivery consumer (§5 mandatory delivery)
//
// Flow audit/event nodes publish their records to the durable Kafka topics
// `audit-events` and `event-logs`. This consumer drains both and delivers
// each record to the web API (POST /api/audit | /api/events) with bounded
// retry, so a transient web outage can't silently lose an audit/event.
//
// When Kafka isn't connected the nodes fall back to a direct HTTP POST, so
// this consumer is simply absent (no-op) in that configuration.
// ==========================================

use std::time::Duration;

use rdkafka::{
    config::ClientConfig,
    consumer::{Consumer, StreamConsumer},
    Message,
};
use tracing::{error, info, warn};

use crate::sdk::handlers::{send_audit_to_orch, send_event_to_orch};

const AUDIT_TOPIC: &str = "audit-events";
const EVENT_TOPIC: &str = "event-logs";
const MAX_ATTEMPTS: u32 = 8;

/// Spawn the audit/event delivery consumer in the background. Never blocks
/// startup; if the consumer can't be created it logs and exits (the nodes
/// keep their direct-HTTP fallback).
pub fn start(brokers: &str) {
    let brokers = brokers.to_string();
    tokio::spawn(async move {
        match build(&brokers) {
            Ok(consumer) => {
                info!(
                    "✅ Audit/Event consumer subscribed to '{}' + '{}'",
                    AUDIT_TOPIC, EVENT_TOPIC
                );
                run(consumer).await;
            }
            Err(e) => error!(
                "❌ Audit/Event consumer failed to start: {} (nodes will use HTTP fallback)",
                e
            ),
        }
    });
}

fn build(brokers: &str) -> anyhow::Result<StreamConsumer> {
    let consumer: StreamConsumer = ClientConfig::new()
        .set("group.id", "orch-audit-event-consumer")
        .set("bootstrap.servers", brokers)
        .set("auto.offset.reset", "earliest")
        .set("enable.auto.commit", "true")
        .set("auto.commit.interval.ms", "5000")
        .create()?;
    consumer.subscribe(&[AUDIT_TOPIC, EVENT_TOPIC])?;
    Ok(consumer)
}

async fn run(consumer: StreamConsumer) {
    loop {
        match consumer.recv().await {
            Ok(msg) => {
                let topic = msg.topic().to_string();
                let payload = match msg.payload_view::<str>() {
                    Some(Ok(s)) => s.to_string(),
                    _ => {
                        warn!("audit/event consumer: empty/undecodable payload on '{}'", topic);
                        continue;
                    }
                };
                let record: serde_json::Value = match serde_json::from_str(&payload) {
                    Ok(v) => v,
                    Err(e) => {
                        warn!("audit/event consumer: invalid JSON on '{}': {}", topic, e);
                        continue;
                    }
                };
                deliver_with_retry(&topic, &record).await;
                tokio::task::yield_now().await;
            }
            Err(e) => {
                error!("audit/event consumer recv error: {}", e);
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }
}

/// Deliver one record to the web API, retrying transient failures with
/// capped backoff. Logs and gives up after MAX_ATTEMPTS (rare — only when
/// the web API is unreachable for the whole window).
async fn deliver_with_retry(topic: &str, record: &serde_json::Value) {
    for attempt in 1..=MAX_ATTEMPTS {
        let res = if topic == EVENT_TOPIC {
            send_event_to_orch(record).await
        } else {
            send_audit_to_orch(record).await
        };
        match res {
            Ok(()) => return,
            Err(e) => {
                warn!(
                    "audit/event deliver attempt {}/{} on '{}' failed: {}",
                    attempt, MAX_ATTEMPTS, topic, e
                );
                let backoff = std::cmp::min(attempt as u64, 8) * 500;
                tokio::time::sleep(Duration::from_millis(backoff)).await;
            }
        }
    }
    error!(
        "audit/event consumer: gave up delivering a '{}' record after {} attempts",
        topic, MAX_ATTEMPTS
    );
}
