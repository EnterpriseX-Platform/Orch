-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "tenant_id" TEXT;


-- AlterTable
ALTER TABLE "data_catalogs" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "flow_integrations" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "repo_connections" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "repo_folders" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "repo_tables" ADD COLUMN     "tenant_id" TEXT;

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_members" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_features" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "feature_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_features_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenant_members_user_id_idx" ON "tenant_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_members_tenant_id_user_id_key" ON "tenant_members"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_features_tenant_id_feature_key_key" ON "tenant_features"("tenant_id", "feature_key");

-- CreateIndex
CREATE INDEX "api_keys_tenant_id_idx" ON "api_keys"("tenant_id");

-- CreateIndex
CREATE INDEX "data_catalogs_tenant_id_idx" ON "data_catalogs"("tenant_id");

-- CreateIndex
CREATE INDEX "flow_integrations_tenant_id_idx" ON "flow_integrations"("tenant_id");

-- CreateIndex
CREATE INDEX "projects_tenant_id_idx" ON "projects"("tenant_id");

-- CreateIndex
CREATE INDEX "repo_connections_tenant_id_idx" ON "repo_connections"("tenant_id");

-- CreateIndex
CREATE INDEX "repo_folders_tenant_id_idx" ON "repo_folders"("tenant_id");

-- CreateIndex
CREATE INDEX "repo_tables_tenant_id_idx" ON "repo_tables"("tenant_id");

-- AddForeignKey
ALTER TABLE "data_catalogs" ADD CONSTRAINT "data_catalogs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_integrations" ADD CONSTRAINT "flow_integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_folders" ADD CONSTRAINT "repo_folders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_tables" ADD CONSTRAINT "repo_tables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_connections" ADD CONSTRAINT "repo_connections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_features" ADD CONSTRAINT "tenant_features_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one default tenant owns all existing data; every existing user joins it.
INSERT INTO "tenants" ("id","slug","name","description","is_active","created_at","updated_at")
VALUES ('tenant_default','default','Default','Tenant created by the multi-tenant migration',true,now(),now())
ON CONFLICT DO NOTHING;
UPDATE "projects"          SET "tenant_id"='tenant_default' WHERE "tenant_id" IS NULL;
UPDATE "data_catalogs"     SET "tenant_id"='tenant_default' WHERE "tenant_id" IS NULL;
UPDATE "flow_integrations" SET "tenant_id"='tenant_default' WHERE "tenant_id" IS NULL;
UPDATE "repo_folders"      SET "tenant_id"='tenant_default' WHERE "tenant_id" IS NULL;
UPDATE "repo_tables"       SET "tenant_id"='tenant_default' WHERE "tenant_id" IS NULL;
UPDATE "repo_connections"  SET "tenant_id"='tenant_default' WHERE "tenant_id" IS NULL;
UPDATE "api_keys"          SET "tenant_id"='tenant_default' WHERE "tenant_id" IS NULL;
INSERT INTO "tenant_members" ("id","tenant_id","user_id","role","created_at")
SELECT 'tm_' || u."id", 'tenant_default', u."id",
       CASE WHEN 'admin' = ANY(u."roles") THEN 'owner' ELSE 'member' END, now()
FROM "users" u
ON CONFLICT DO NOTHING;
