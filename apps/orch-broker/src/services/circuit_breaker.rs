// ==========================================
// Circuit Breaker Service
// Simple state machine: Closed -> Open -> HalfOpen -> Closed
// Key = target URL host
// ==========================================

use std::sync::OnceLock;
use std::time::{Duration, Instant};
use dashmap::DashMap;
use tracing::{info, warn};

/// Failure threshold before opening the circuit
pub const DEFAULT_FAILURE_THRESHOLD: u32 = 5;
/// Recovery window after which to allow a trial call
pub const DEFAULT_RECOVERY_TIMEOUT: Duration = Duration::from_secs(30);
/// Rolling window for counting failures
pub const DEFAULT_FAILURE_WINDOW: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    Closed,
    Open,
    HalfOpen,
}

#[derive(Debug)]
struct BreakerEntry {
    state: CircuitState,
    failures: Vec<Instant>,
    opened_at: Option<Instant>,
}

impl BreakerEntry {
    fn new() -> Self {
        Self {
            state: CircuitState::Closed,
            failures: Vec::new(),
            opened_at: None,
        }
    }
}

pub struct CircuitBreaker {
    entries: DashMap<String, BreakerEntry>,
    failure_threshold: u32,
    recovery_timeout: Duration,
    failure_window: Duration,
}

impl CircuitBreaker {
    pub fn new() -> Self {
        Self {
            entries: DashMap::new(),
            failure_threshold: DEFAULT_FAILURE_THRESHOLD,
            recovery_timeout: DEFAULT_RECOVERY_TIMEOUT,
            failure_window: DEFAULT_FAILURE_WINDOW,
        }
    }

    /// Extract host from URL to use as key
    pub fn key_from_url(url: &str) -> String {
        // Parse URL to extract host (scheme + host + port for granular keys)
        if let Ok(parsed) = reqwest::Url::parse(url) {
            match (parsed.host_str(), parsed.port()) {
                (Some(h), Some(p)) => format!("{}:{}", h, p),
                (Some(h), None) => h.to_string(),
                _ => url.to_string(),
            }
        } else {
            url.to_string()
        }
    }

    /// Check if request is allowed. Returns current state after check.
    /// If Open and recovery window hasn't elapsed, returns Open (deny).
    /// If Open and recovery elapsed, transitions to HalfOpen and allows.
    pub fn check(&self, key: &str) -> CircuitState {
        let mut entry = self.entries.entry(key.to_string()).or_insert_with(BreakerEntry::new);
        match entry.state {
            CircuitState::Closed => CircuitState::Closed,
            CircuitState::HalfOpen => CircuitState::HalfOpen,
            CircuitState::Open => {
                if let Some(opened_at) = entry.opened_at {
                    if opened_at.elapsed() >= self.recovery_timeout {
                        entry.state = CircuitState::HalfOpen;
                        info!("Circuit Breaker [{}]: Open -> HalfOpen (trial)", key);
                        CircuitState::HalfOpen
                    } else {
                        CircuitState::Open
                    }
                } else {
                    CircuitState::Open
                }
            }
        }
    }

    /// Record a successful call — resets failures and closes circuit
    pub fn record_success(&self, key: &str) {
        if let Some(mut entry) = self.entries.get_mut(key) {
            let prev = entry.state;
            entry.state = CircuitState::Closed;
            entry.failures.clear();
            entry.opened_at = None;
            if prev != CircuitState::Closed {
                info!("Circuit Breaker [{}]: {:?} -> Closed", key, prev);
            }
        }
    }

    /// Record a failed call — may open the circuit
    pub fn record_failure(&self, key: &str) {
        let mut entry = self.entries.entry(key.to_string()).or_insert_with(BreakerEntry::new);
        let now = Instant::now();
        // Prune failures outside the window
        let window = self.failure_window;
        entry.failures.retain(|t| now.duration_since(*t) <= window);
        entry.failures.push(now);

        match entry.state {
            CircuitState::HalfOpen => {
                // Trial failed — reopen
                entry.state = CircuitState::Open;
                entry.opened_at = Some(now);
                warn!("Circuit Breaker [{}]: HalfOpen -> Open (trial failed)", key);
            }
            CircuitState::Closed => {
                if entry.failures.len() as u32 >= self.failure_threshold {
                    entry.state = CircuitState::Open;
                    entry.opened_at = Some(now);
                    warn!(
                        "Circuit Breaker [{}]: Closed -> Open ({} failures in window)",
                        key,
                        entry.failures.len()
                    );
                }
            }
            CircuitState::Open => {
                // Already open, just update opened_at to now
                entry.opened_at = Some(now);
            }
        }
    }

    pub fn get_state(&self, key: &str) -> CircuitState {
        self.entries
            .get(key)
            .map(|e| e.state)
            .unwrap_or(CircuitState::Closed)
    }

    /// Snapshot all circuits for metrics export
    /// Returns Vec<(host, state_value)> where 0=Closed, 1=HalfOpen, 2=Open
    pub fn snapshot(&self) -> Vec<(String, u8)> {
        self.entries
            .iter()
            .map(|e| {
                let val = match e.value().state {
                    CircuitState::Closed => 0,
                    CircuitState::HalfOpen => 1,
                    CircuitState::Open => 2,
                };
                (e.key().clone(), val)
            })
            .collect()
    }
}

impl Default for CircuitBreaker {
    fn default() -> Self {
        Self::new()
    }
}

static GLOBAL_CIRCUIT_BREAKER: OnceLock<CircuitBreaker> = OnceLock::new();

pub fn global() -> &'static CircuitBreaker {
    GLOBAL_CIRCUIT_BREAKER.get_or_init(CircuitBreaker::new)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_closed_to_open() {
        let cb = CircuitBreaker::new();
        let key = "test.example.com";
        for _ in 0..5 {
            cb.record_failure(key);
        }
        assert_eq!(cb.get_state(key), CircuitState::Open);
    }

    #[test]
    fn test_success_resets() {
        let cb = CircuitBreaker::new();
        let key = "test2.example.com";
        cb.record_failure(key);
        cb.record_failure(key);
        cb.record_success(key);
        assert_eq!(cb.get_state(key), CircuitState::Closed);
    }

    #[test]
    fn test_key_from_url() {
        assert_eq!(CircuitBreaker::key_from_url("http://api.example.com/foo"), "api.example.com");
        assert_eq!(CircuitBreaker::key_from_url("http://localhost:8080/foo"), "localhost:8080");
    }
}
