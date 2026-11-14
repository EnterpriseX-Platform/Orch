
-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "repo_api_keys" ADD COLUMN     "tenant_id" TEXT;

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "repo_api_keys_tenant_id_idx" ON "repo_api_keys"("tenant_id");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_api_keys" ADD CONSTRAINT "repo_api_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill existing rows into the default tenant created by 20261113152120_multi_tenant.
UPDATE "audit_logs"    SET "tenant_id"='tenant_default' WHERE "tenant_id" IS NULL;
UPDATE "repo_api_keys" SET "tenant_id"='tenant_default' WHERE "tenant_id" IS NULL;
