-- CreateEnum
CREATE TYPE "action_type" AS ENUM ('read', 'search', 'create', 'update', 'delete', 'clone', 'submit', 'approve', 'reject', 'signoff', 'export', 'download', 'comment', 'notify', 'other');

-- AlterTable
ALTER TABLE "api_logs" ALTER COLUMN "partition_key" SET DEFAULT to_char(now(), 'YYYYMM');

-- AlterTable
ALTER TABLE "message_formats" ADD COLUMN     "action_label" TEXT,
ADD COLUMN     "action_type" "action_type",
ADD COLUMN     "format_code" TEXT,
ADD COLUMN     "screen_code" TEXT,
ADD COLUMN     "screen_name" TEXT,
ADD COLUMN     "system" TEXT,
ADD COLUMN     "tab_name" TEXT,
ADD COLUMN     "tech_hints" JSONB;

-- CreateIndex
CREATE INDEX "message_formats_api_registration_id_format_code_idx" ON "message_formats"("api_registration_id", "format_code");

-- CreateIndex
CREATE INDEX "message_formats_system_screen_code_idx" ON "message_formats"("system", "screen_code");

-- CreateIndex
CREATE INDEX "message_formats_action_type_idx" ON "message_formats"("action_type");
