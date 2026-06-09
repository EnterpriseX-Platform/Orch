-- CreateEnum
CREATE TYPE "username_source" AS ENUM ('body_path', 'header', 'jwt_claim', 'session', 'static');

-- CreateEnum
CREATE TYPE "detection_source" AS ENUM ('referer', 'header', 'body_path', 'query', 'manual');

-- AlterTable
ALTER TABLE "api_logs" ALTER COLUMN "partition_key" SET DEFAULT to_char(now(), 'YYYYMM');

-- AlterTable
ALTER TABLE "message_formats" ADD COLUMN     "audit_config_id" TEXT,
ADD COLUMN     "field_mapping_id" TEXT,
ADD COLUMN     "is_default" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ref_name_path" TEXT,
ADD COLUMN     "ref_type" TEXT,
ADD COLUMN     "username_field" TEXT,
ADD COLUMN     "username_source" "username_source",
ADD COLUMN     "username_static" TEXT;

-- CreateTable
CREATE TABLE "field_mappings_lib" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ref_type" TEXT,
    "ref_id_path" TEXT,
    "ref_no_path" TEXT,
    "ref_name_path" TEXT,
    "pk_xpath" TEXT,
    "username_source" "username_source",
    "username_field" TEXT,
    "username_static" TEXT,
    "project_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_mappings_lib_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_configs_lib" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "extract_fields" JSONB,
    "audit_fields" JSONB,
    "project_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_configs_lib_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screens" (
    "id" TEXT NOT NULL,
    "system" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "project_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "screens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screen_buttons" (
    "id" TEXT NOT NULL,
    "screen_id" TEXT NOT NULL,
    "tab_name" TEXT,
    "button_label" TEXT NOT NULL,
    "action_type" TEXT,
    "message_format_id" TEXT,
    "detection_source" "detection_source",
    "detection_field" TEXT,
    "detection_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "screen_buttons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_mappings_lib_project_id_idx" ON "field_mappings_lib"("project_id");

-- CreateIndex
CREATE INDEX "audit_configs_lib_project_id_idx" ON "audit_configs_lib"("project_id");

-- CreateIndex
CREATE INDEX "screens_project_id_idx" ON "screens"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "screens_system_code_key" ON "screens"("system", "code");

-- CreateIndex
CREATE INDEX "screen_buttons_screen_id_idx" ON "screen_buttons"("screen_id");

-- CreateIndex
CREATE INDEX "screen_buttons_message_format_id_idx" ON "screen_buttons"("message_format_id");

-- CreateIndex
CREATE INDEX "screen_buttons_action_type_idx" ON "screen_buttons"("action_type");

-- CreateIndex
CREATE INDEX "message_formats_field_mapping_id_idx" ON "message_formats"("field_mapping_id");

-- CreateIndex
CREATE INDEX "message_formats_audit_config_id_idx" ON "message_formats"("audit_config_id");

-- AddForeignKey
ALTER TABLE "message_formats" ADD CONSTRAINT "message_formats_field_mapping_id_fkey" FOREIGN KEY ("field_mapping_id") REFERENCES "field_mappings_lib"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_formats" ADD CONSTRAINT "message_formats_audit_config_id_fkey" FOREIGN KEY ("audit_config_id") REFERENCES "audit_configs_lib"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_mappings_lib" ADD CONSTRAINT "field_mappings_lib_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_configs_lib" ADD CONSTRAINT "audit_configs_lib_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screens" ADD CONSTRAINT "screens_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screen_buttons" ADD CONSTRAINT "screen_buttons_screen_id_fkey" FOREIGN KEY ("screen_id") REFERENCES "screens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screen_buttons" ADD CONSTRAINT "screen_buttons_message_format_id_fkey" FOREIGN KEY ("message_format_id") REFERENCES "message_formats"("id") ON DELETE SET NULL ON UPDATE CASCADE;
