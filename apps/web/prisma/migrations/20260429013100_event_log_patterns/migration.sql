-- EventLogPattern: rules that mirror request traffic into
-- event_logs based on URL pattern (+ optional body match) without
-- requiring a full ApiRegistration. Used for observability /
-- "log every payments/* call" use cases.
--
-- enum EventLogCapture { SUMMARY | FULL_BODY | NONE }
--   SUMMARY   write event_logs with method, path, status, duration
--   FULL_BODY also include request + response body
--   NONE      pattern matched but no row written (useful for
--             dashboard "I saw this" markers via level=warn)

CREATE TYPE "event_log_capture" AS ENUM ('SUMMARY', 'FULL_BODY', 'NONE');

CREATE TABLE "event_log_patterns" (
    "id"           TEXT NOT NULL,
    "project_id"   TEXT,
    "name"         TEXT NOT NULL,
    "description"  TEXT,
    "path_pattern" TEXT NOT NULL,
    "method_match" TEXT NOT NULL DEFAULT 'ANY',
    "body_match"   JSONB,
    "capture"      "event_log_capture" NOT NULL DEFAULT 'SUMMARY',
    "level"        TEXT NOT NULL DEFAULT 'info',
    "enabled"      BOOLEAN NOT NULL DEFAULT true,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_log_patterns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "event_log_patterns_project_id_enabled_idx" ON "event_log_patterns"("project_id", "enabled");

ALTER TABLE "event_log_patterns" ADD CONSTRAINT "event_log_patterns_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
