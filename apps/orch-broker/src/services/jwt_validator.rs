// ==========================================
// JWT / OIDC Token Validator
// Validates Bearer tokens against OIDC provider (Keycloak, etc.)
// Supports RS256 (JWKS) and HS256 (shared secret)
// ==========================================

use dashmap::DashMap;
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{debug, error, info, warn};

/// OIDC configuration for a project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OidcConfig {
    pub issuer_url: String,
    pub client_id: String,
    pub jwks_url: Option<String>,
    pub required_scopes: Vec<String>,
}

/// JWT Claims extracted from token
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JwtClaims {
    // Standard claims
    pub sub: Option<String>,
    pub iss: Option<String>,
    pub aud: Option<Value>,
    pub exp: Option<u64>,
    pub iat: Option<u64>,

    // Common Keycloak claims
    pub preferred_username: Option<String>,
    pub email: Option<String>,
    pub name: Option<String>,
    pub realm_access: Option<Value>,
    pub resource_access: Option<Value>,
    pub scope: Option<String>,

    // All claims as raw JSON
    pub raw: Value,
}

/// Validation result
#[derive(Debug, Clone)]
pub struct ValidationResult {
    pub valid: bool,
    pub claims: Option<JwtClaims>,
    pub error: Option<String>,
}

/// Cached JWKS keys
struct JwksCache {
    keys: Vec<JwkKey>,
    fetched_at: Instant,
}

/// Individual JWK key
#[derive(Debug, Clone, Deserialize)]
struct JwkKey {
    kid: Option<String>,
    kty: String,
    #[serde(rename = "use")]
    use_: Option<String>,
    n: Option<String>,
    e: Option<String>,
    alg: Option<String>,
}

/// JWT Validator with JWKS caching
pub struct JwtValidator {
    /// Cache: issuer_url → JWKS keys
    jwks_cache: DashMap<String, JwksCache>,
    /// HTTP client for fetching JWKS
    http_client: reqwest::Client,
    /// Cache duration (default 1 hour)
    cache_duration: Duration,
}

impl JwtValidator {
    pub fn new() -> Self {
        Self {
            jwks_cache: DashMap::new(),
            http_client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
            cache_duration: Duration::from_secs(3600), // 1 hour
        }
    }

    /// Validate a Bearer token against OIDC config
    pub async fn validate_token(
        &self,
        token: &str,
        config: &OidcConfig,
    ) -> ValidationResult {
        // 1. Decode header to get algorithm and kid
        let header = match decode_header(token) {
            Ok(h) => h,
            Err(e) => {
                return ValidationResult {
                    valid: false,
                    claims: None,
                    error: Some(format!("Invalid token header: {}", e)),
                };
            }
        };

        debug!("JWT header: alg={:?}, kid={:?}", header.alg, header.kid);

        // 2. Get decoding key based on algorithm
        let decoding_key = match header.alg {
            Algorithm::RS256 | Algorithm::RS384 | Algorithm::RS512 => {
                // Fetch JWKS from provider
                match self.get_rsa_key(config, &header).await {
                    Ok(key) => key,
                    Err(e) => {
                        return ValidationResult {
                            valid: false,
                            claims: None,
                            error: Some(format!("Failed to get JWKS key: {}", e)),
                        };
                    }
                }
            }
            Algorithm::HS256 | Algorithm::HS384 | Algorithm::HS512 => {
                // For HMAC, use client_id as secret (common pattern)
                DecodingKey::from_secret(config.client_id.as_bytes())
            }
            alg => {
                return ValidationResult {
                    valid: false,
                    claims: None,
                    error: Some(format!("Unsupported algorithm: {:?}", alg)),
                };
            }
        };

        // 3. Set up validation
        let mut validation = Validation::new(header.alg);
        validation.set_audience(&[&config.client_id]);
        validation.set_issuer(&[&config.issuer_url]);
        // Allow some clock skew (30 seconds)
        validation.leeway = 30;

        // 4. Decode and validate token
        match decode::<Value>(token, &decoding_key, &validation) {
            Ok(token_data) => {
                let raw = token_data.claims;

                // 5. Extract standard claims
                let claims = JwtClaims {
                    sub: raw["sub"].as_str().map(|s| s.to_string()),
                    iss: raw["iss"].as_str().map(|s| s.to_string()),
                    aud: raw.get("aud").cloned(),
                    exp: raw["exp"].as_u64(),
                    iat: raw["iat"].as_u64(),
                    preferred_username: raw["preferred_username"].as_str().map(|s| s.to_string()),
                    email: raw["email"].as_str().map(|s| s.to_string()),
                    name: raw["name"].as_str().map(|s| s.to_string()),
                    realm_access: raw.get("realm_access").cloned(),
                    resource_access: raw.get("resource_access").cloned(),
                    scope: raw["scope"].as_str().map(|s| s.to_string()),
                    raw: raw.clone(),
                };

                // 6. Validate required scopes
                if !config.required_scopes.is_empty() {
                    if let Some(ref scope_str) = claims.scope {
                        let token_scopes: Vec<&str> = scope_str.split_whitespace().collect();
                        for required in &config.required_scopes {
                            if !token_scopes.contains(&required.as_str()) {
                                return ValidationResult {
                                    valid: false,
                                    claims: Some(claims),
                                    error: Some(format!("Missing required scope: {}", required)),
                                };
                            }
                        }
                    } else {
                        return ValidationResult {
                            valid: false,
                            claims: Some(claims),
                            error: Some("Token has no scopes but scopes are required".to_string()),
                        };
                    }
                }

                debug!("JWT validated: sub={:?}, username={:?}",
                    claims.sub, claims.preferred_username);

                ValidationResult {
                    valid: true,
                    claims: Some(claims),
                    error: None,
                }
            }
            Err(e) => {
                ValidationResult {
                    valid: false,
                    claims: None,
                    error: Some(format!("Token validation failed: {}", e)),
                }
            }
        }
    }

    /// Get RSA decoding key from JWKS endpoint
    async fn get_rsa_key(
        &self,
        config: &OidcConfig,
        header: &jsonwebtoken::Header,
    ) -> anyhow::Result<DecodingKey> {
        // Determine JWKS URL
        let jwks_url = match &config.jwks_url {
            Some(url) => url.clone(),
            None => {
                // Standard OIDC discovery: {issuer}/.well-known/openid-configuration
                // Or directly: {issuer}/protocol/openid-connect/certs (Keycloak)
                let issuer = config.issuer_url.trim_end_matches('/');
                if issuer.contains("/realms/") {
                    // Keycloak format
                    format!("{}/protocol/openid-connect/certs", issuer)
                } else {
                    format!("{}/.well-known/jwks.json", issuer)
                }
            }
        };

        // Check cache
        let kid = header.kid.as_deref();
        if let Some(cached) = self.jwks_cache.get(&jwks_url) {
            if cached.fetched_at.elapsed() < self.cache_duration {
                if let Some(key) = self.find_key_in_set(&cached.keys, kid) {
                    return Ok(key);
                }
            }
        }

        // Fetch JWKS
        info!("Fetching JWKS from: {}", jwks_url);
        let resp = self.http_client.get(&jwks_url).send().await?;
        let jwks: Value = resp.json().await?;

        let keys: Vec<JwkKey> = serde_json::from_value(
            jwks.get("keys")
                .ok_or_else(|| anyhow::anyhow!("No 'keys' field in JWKS response"))?
                .clone()
        )?;

        // Cache the keys
        self.jwks_cache.insert(jwks_url.clone(), JwksCache {
            keys: keys.clone(),
            fetched_at: Instant::now(),
        });

        // Find matching key
        self.find_key_in_set(&keys, kid)
            .ok_or_else(|| anyhow::anyhow!(
                "No matching key found in JWKS (kid: {:?})", kid
            ))
    }

    /// Find a matching RSA key from the JWKS set
    fn find_key_in_set(&self, keys: &[JwkKey], kid: Option<&str>) -> Option<DecodingKey> {
        for key in keys {
            // Match by kid if provided
            if let Some(target_kid) = kid {
                if key.kid.as_deref() != Some(target_kid) {
                    continue;
                }
            }

            // Only use RSA keys for signing
            if key.kty != "RSA" {
                continue;
            }
            if key.use_.as_deref() == Some("enc") {
                continue; // Skip encryption keys
            }

            // Build decoding key from n + e
            if let (Some(n), Some(e)) = (&key.n, &key.e) {
                match DecodingKey::from_rsa_components(n, e) {
                    Ok(decoding_key) => return Some(decoding_key),
                    Err(e) => {
                        warn!("Failed to build RSA key: {}", e);
                        continue;
                    }
                }
            }
        }
        None
    }

    /// Extract Bearer token from Authorization header
    pub fn extract_bearer_token(auth_header: &str) -> Option<&str> {
        if auth_header.starts_with("Bearer ") || auth_header.starts_with("bearer ") {
            Some(auth_header[7..].trim())
        } else {
            None
        }
    }
}
