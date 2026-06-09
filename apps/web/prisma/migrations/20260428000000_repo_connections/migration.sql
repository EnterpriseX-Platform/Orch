-- Add RepoConnection table + 2 columns on repo_tables.
-- Repo physical tables (`repo_<slug>`) are managed by application
-- DDL (lib/repo-physical.ts) and intentionally NOT dropped here —
-- Prisma's auto diff would remove them; we override.

ALTER TABLE "repo_tables"
    ADD COLUMN "connection_id"        TEXT,
    ADD COLUMN "external_table_name"  TEXT;

CREATE TABLE "repo_connections" (
    "id"             TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "type"           TEXT NOT NULL,
    "config"         JSONB NOT NULL DEFAULT '{}',
    "status"         TEXT NOT NULL DEFAULT 'Disconnected',
    "last_tested_at" TIMESTAMP(3),
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "repo_connections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "repo_tables_connection_id_idx" ON "repo_tables"("connection_id");

ALTER TABLE "repo_tables"
    ADD CONSTRAINT "repo_tables_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "repo_connections"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
