// ==========================================
// IP Filter Middleware
// Applies whitelist / blacklist IP rules read from:
//   DB (system_configs security.ipWhitelist / security.ipBlacklist)
//   → env IP_WHITELIST / IP_BLACKLIST
//   → empty (pass-through)
//
// Rules are comma-separated and may be either a
// single IP ("1.2.3.4") or a CIDR ("10.0.0.0/8").
//
// Parsed rules are cached for 60s. Admins editing the rules via
// the web UI should also click "Reload Cache" to purge immediately
// — otherwise they take effect within 60s per pod.
//
// Client IP resolution order:
//   1. X-Forwarded-For (first hop)
//   2. X-Real-IP
//   3. Socket peer address (ConnectInfo)
// ==========================================

use std::net::{IpAddr, SocketAddr};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::{
    extract::{ConnectInfo, Request},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use ipnetwork::IpNetwork;
use once_cell::sync::Lazy;
use tracing::warn;

#[derive(Debug, Clone)]
enum Rule {
    Single(IpAddr),
    Network(IpNetwork),
}

impl Rule {
    fn parse(s: &str) -> Option<Self> {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            return None;
        }
        if trimmed.contains('/') {
            trimmed.parse::<IpNetwork>().ok().map(Rule::Network)
        } else {
            trimmed.parse::<IpAddr>().ok().map(Rule::Single)
        }
    }

    fn matches(&self, ip: &IpAddr) -> bool {
        match self {
            Rule::Single(addr) => addr == ip,
            Rule::Network(net) => net.contains(*ip),
        }
    }
}

#[derive(Clone)]
struct Rules {
    whitelist: Vec<Rule>,
    blacklist: Vec<Rule>,
}

fn parse_rules(raw: &str) -> Vec<Rule> {
    raw.split(',')
        .filter_map(Rule::parse)
        .collect()
}

const RULES_TTL: Duration = Duration::from_secs(60);

struct CachedRules {
    rules: Rules,
    expires_at: Instant,
}

static CACHE: Lazy<Mutex<Option<CachedRules>>> = Lazy::new(|| Mutex::new(None));

async fn load_rules() -> Rules {
    let whitelist_raw = crate::config::system::ip_whitelist().await;
    let blacklist_raw = crate::config::system::ip_blacklist().await;
    Rules {
        whitelist: parse_rules(&whitelist_raw),
        blacklist: parse_rules(&blacklist_raw),
    }
}

async fn current_rules() -> Rules {
    // Fast path: fresh cached value
    {
        let guard = CACHE.lock().unwrap();
        if let Some(cached) = guard.as_ref() {
            if cached.expires_at > Instant::now() {
                return cached.rules.clone();
            }
        }
    }
    // Slow path: fetch + cache
    let rules = load_rules().await;
    let mut guard = CACHE.lock().unwrap();
    *guard = Some(CachedRules {
        rules: rules.clone(),
        expires_at: Instant::now() + RULES_TTL,
    });
    rules
}

/// Extract the client IP from the incoming request.
fn extract_client_ip(request: &Request) -> Option<IpAddr> {
    // 1. X-Forwarded-For (first entry is the original client).
    if let Some(xff) = request
        .headers()
        .get("x-forwarded-for")
        .and_then(|h| h.to_str().ok())
    {
        if let Some(first) = xff.split(',').next() {
            if let Ok(ip) = first.trim().parse::<IpAddr>() {
                return Some(ip);
            }
        }
    }

    // 2. X-Real-IP
    if let Some(real) = request
        .headers()
        .get("x-real-ip")
        .and_then(|h| h.to_str().ok())
    {
        if let Ok(ip) = real.trim().parse::<IpAddr>() {
            return Some(ip);
        }
    }

    // 3. Socket peer address (ConnectInfo<SocketAddr>).
    if let Some(ConnectInfo(addr)) = request.extensions().get::<ConnectInfo<SocketAddr>>() {
        return Some(addr.ip());
    }

    None
}

pub async fn ip_filter_middleware(request: Request, next: Next) -> Response {
    let rules = current_rules().await;

    // Fast path: nothing configured.
    if rules.whitelist.is_empty() && rules.blacklist.is_empty() {
        return next.run(request).await;
    }

    let client_ip = match extract_client_ip(&request) {
        Some(ip) => ip,
        None => {
            // If we can't determine the IP and a whitelist is set, deny.
            if !rules.whitelist.is_empty() {
                warn!("IP filter: unable to resolve client IP — denying");
                return (StatusCode::FORBIDDEN, "Forbidden").into_response();
            }
            return next.run(request).await;
        }
    };

    // Blacklist takes priority.
    if rules.blacklist.iter().any(|r| r.matches(&client_ip)) {
        warn!("IP filter: blacklisted client {}", client_ip);
        return (StatusCode::FORBIDDEN, "Forbidden").into_response();
    }

    // If a whitelist is configured, IP must be on it.
    if !rules.whitelist.is_empty()
        && !rules.whitelist.iter().any(|r| r.matches(&client_ip))
    {
        warn!("IP filter: client {} not on whitelist", client_ip);
        return (StatusCode::FORBIDDEN, "Forbidden").into_response();
    }

    next.run(request).await
}
