-- Project: split display URL (base_url) from internal proxy target
-- (proxy_target_url). Level 2 fallback routing prefers
-- proxy_target_url; null falls back to base_url for backward compat.
ALTER TABLE "projects" ADD COLUMN "proxy_target_url" TEXT;
