use crate::config::RouteConfig;
use dashmap::DashMap;
use std::sync::Arc;

pub struct RouteCache {
    cache: DashMap<String, Arc<RouteConfig>>,
}

impl RouteCache {
    pub fn new() -> Self {
        Self {
            cache: DashMap::new(),
        }
    }

    pub fn get(&self, path: &str, method: &str) -> Option<Arc<RouteConfig>> {
        let key = format!("{}:{}", method, path);
        self.cache.get(&key).map(|entry| entry.clone())
    }

    pub fn set(&self, path: &str, method: &str, config: Arc<RouteConfig>) {
        let key = format!("{}:{}", method, path);
        self.cache.insert(key, config);
    }

    pub fn invalidate(&self, path: &str, method: &str) {
        let key = format!("{}:{}", method, path);
        self.cache.remove(&key);
    }

    pub fn clear(&self) {
        self.cache.clear();
    }
}
