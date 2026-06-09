-- CreateEnum
CREATE TYPE "ConfigValueType" AS ENUM ('string', 'number', 'boolean', 'json', 'url', 'secret');

-- CreateEnum
CREATE TYPE "ConfigCategory" AS ENUM ('general', 'backend_urls', 'kafka', 'audit', 'security', 'performance', 'alerts', 'feature_flags', 'ui_branding', 'project');

-- DropIndex (was unique on key alone)
DROP INDEX IF EXISTS "system_configs_key_key";

-- AlterTable system_configs: add new columns, change category type
ALTER TABLE "system_configs"
  ADD COLUMN "value_type"    "ConfigValueType" NOT NULL DEFAULT 'string',
  ADD COLUMN "label"         TEXT,
  ADD COLUMN "group"         TEXT,
  ADD COLUMN "is_secret"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "is_required"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "is_read_only"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "validation"    JSONB,
  ADD COLUMN "default_value" JSONB,
  ADD COLUMN "project_id"    TEXT,
  ADD COLUMN "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Convert category column from text to enum
ALTER TABLE "system_configs"
  ALTER COLUMN "category" DROP DEFAULT,
  ALTER COLUMN "category" TYPE "ConfigCategory" USING (
    CASE
      WHEN "category" IN ('general','backend_urls','kafka','audit','security','performance','alerts','feature_flags','ui_branding','project')
        THEN "category"::"ConfigCategory"
      ELSE 'general'::"ConfigCategory"
    END
  ),
  ALTER COLUMN "category" SET DEFAULT 'general';

-- Unique on (key, project_id) — allows global + per-project overrides
CREATE UNIQUE INDEX "system_configs_key_project_id_key" ON "system_configs"("key", "project_id");
CREATE INDEX "system_configs_category_idx" ON "system_configs"("category");
CREATE INDEX "system_configs_project_id_idx" ON "system_configs"("project_id");

-- CreateTable system_config_history
CREATE TABLE "system_config_history" (
    "id"         TEXT NOT NULL,
    "config_key" TEXT NOT NULL,
    "project_id" TEXT,
    "old_value"  JSONB,
    "new_value"  JSONB NOT NULL,
    "changed_by" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason"     TEXT,

    CONSTRAINT "system_config_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "system_config_history_config_key_idx" ON "system_config_history"("config_key");
CREATE INDEX "system_config_history_changed_at_idx" ON "system_config_history"("changed_at");
