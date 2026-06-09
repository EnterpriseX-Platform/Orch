-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "data_category" AS ENUM ('transactional', 'reserved', 'transfer', 'performance', 'expenditure', 'procurement', 'master_data', 'other');

-- CreateEnum
CREATE TYPE "data_status" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "app_status" AS ENUM ('ACTIVE', 'INACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "auth_scheme" AS ENUM ('NONE', 'JWT', 'API_KEY', 'OAUTH2', 'BASIC', 'CUSTOM');

-- CreateEnum
CREATE TYPE "oauth2_flow" AS ENUM ('authorization_code', 'client_credentials', 'implicit', 'password');

-- CreateEnum
CREATE TYPE "api_key_location" AS ENUM ('header', 'query', 'cookie');

-- CreateEnum
CREATE TYPE "header_direction" AS ENUM ('request', 'response');

-- CreateEnum
CREATE TYPE "header_action" AS ENUM ('set', 'append', 'remove', 'passthrough');

-- CreateEnum
CREATE TYPE "discriminator_source" AS ENUM ('none', 'body', 'header');

-- CreateEnum
CREATE TYPE "message_format_type" AS ENUM ('standard', 'microflow', 'batch', 'notification');

-- CreateEnum
CREATE TYPE "http_method" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

-- CreateEnum
CREATE TYPE "auth_type" AS ENUM ('NONE', 'JWT', 'API_KEY', 'OAUTH2', 'BASIC');

-- CreateEnum
CREATE TYPE "api_status" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "api_type" AS ENUM ('REST', 'MICROFLOW');

-- CreateEnum
CREATE TYPE "trigger_type" AS ENUM ('http', 'kafka_consumer', 'scheduler', 'webhook', 'message_queue');

-- CreateEnum
CREATE TYPE "flow_category" AS ENUM ('api_gateway', 'consumer', 'hybrid');

-- CreateEnum
CREATE TYPE "execution_mode" AS ENUM ('sync', 'async');

-- CreateEnum
CREATE TYPE "execution_status" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'VIEW', 'EXPORT', 'APPROVE', 'REJECT');

-- CreateEnum
CREATE TYPE "worker_job_status" AS ENUM ('pending', 'queued', 'processing', 'success', 'failed', 'retrying', 'cancelled');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "department" TEXT,
    "roles" TEXT[] DEFAULT ARRAY['user']::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_catalogs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "description" TEXT,
    "source" TEXT NOT NULL,
    "category" "data_category" NOT NULL DEFAULT 'transactional',
    "sub_category" TEXT,
    "schema" JSONB,
    "sample_data" JSONB,
    "update_frequency" TEXT,
    "data_owner" TEXT,
    "contact_info" TEXT,
    "status" "data_status" NOT NULL DEFAULT 'DRAFT',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "parent_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "theme_color" TEXT NOT NULL DEFAULT '#60A5FA',
    "project_group" TEXT,
    "agency" TEXT,
    "tags" JSONB,
    "base_url" TEXT NOT NULL,
    "path_prefix" TEXT,
    "auth_type" "auth_type" NOT NULL DEFAULT 'NONE',
    "api_key" TEXT,
    "api_key_header" TEXT,
    "oidc_enabled" BOOLEAN NOT NULL DEFAULT false,
    "oidc_issuer_url" TEXT,
    "oidc_client_id" TEXT,
    "oidc_jwks_url" TEXT,
    "oidc_required_scopes" JSONB,
    "openapi_spec" JSONB,
    "openapi_spec_updated_at" TIMESTAMP(3),
    "owner" TEXT,
    "contact_email" TEXT,
    "status" "app_status" NOT NULL DEFAULT 'ACTIVE',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_registrations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "endpoint" TEXT NOT NULL,
    "method" "http_method" NOT NULL DEFAULT 'GET',
    "backend_url" TEXT NOT NULL,
    "api_type" "api_type" NOT NULL DEFAULT 'REST',
    "project_id" TEXT NOT NULL,
    "auth_type" "auth_type",
    "api_key" TEXT,
    "api_key_header" TEXT,
    "data_catalog_id" TEXT,
    "rate_limit_per_min" INTEGER NOT NULL DEFAULT 1000,
    "flow_id" TEXT,
    "timeout" INTEGER NOT NULL DEFAULT 30,
    "retries" INTEGER NOT NULL DEFAULT 3,
    "version" TEXT,
    "tags" JSONB,
    "terms_of_service" TEXT,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_url" TEXT,
    "license" TEXT,
    "deprecated" BOOLEAN NOT NULL DEFAULT false,
    "status" "api_status" NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_auth_configs" (
    "id" TEXT NOT NULL,
    "api_registration_id" TEXT NOT NULL,
    "auth_scheme" "auth_scheme" NOT NULL DEFAULT 'NONE',
    "jwt_issuer" TEXT,
    "jwt_audience" TEXT,
    "jwt_claims" JSONB,
    "jwt_algorithm" TEXT,
    "oauth2_auth_url" TEXT,
    "oauth2_token_url" TEXT,
    "oauth2_scopes" JSONB,
    "oauth2_flow" "oauth2_flow",
    "api_key_location" "api_key_location",
    "api_key_name" TEXT,
    "api_key_value" TEXT,
    "basic_username" TEXT,
    "basic_password" TEXT,
    "custom_auth_config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_auth_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_header_mappings" (
    "id" TEXT NOT NULL,
    "api_registration_id" TEXT NOT NULL,
    "direction" "header_direction" NOT NULL,
    "header_name" TEXT NOT NULL,
    "header_value" TEXT NOT NULL,
    "action" "header_action" NOT NULL DEFAULT 'set',
    "condition" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_header_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_formats" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "api_registration_id" TEXT NOT NULL,
    "discriminator_source" "discriminator_source" NOT NULL DEFAULT 'none',
    "discriminator_field" TEXT,
    "discriminator_value" TEXT,
    "format_type" "message_format_type" NOT NULL DEFAULT 'standard',
    "audit_enabled" BOOLEAN NOT NULL DEFAULT true,
    "audit_fields" JSONB,
    "pk_xpath" TEXT,
    "extraction_config" JSONB,
    "field_mappings" JSONB,
    "ref_id_path" TEXT,
    "ref_no_path" TEXT,
    "user_id_path" TEXT,
    "source_page" TEXT,
    "source_function" TEXT,
    "source_button" TEXT,
    "source_system" TEXT,
    "status" "api_status" NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_formats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_integrations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger_type" "trigger_type" NOT NULL DEFAULT 'http',
    "execution_mode" "execution_mode" NOT NULL DEFAULT 'sync',
    "flow_category" "flow_category" NOT NULL DEFAULT 'api_gateway',
    "execution_strategy" TEXT NOT NULL DEFAULT 'fast',
    "custom_queue_config" JSONB,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "trigger_config" JSONB,
    "settings" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "last_executed_at" TIMESTAMP(3),
    "execution_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_executions" (
    "id" TEXT NOT NULL,
    "flow_id" TEXT NOT NULL,
    "trigger_api_id" TEXT,
    "request_id" TEXT,
    "status" "execution_status" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "duration" INTEGER,
    "input_data" JSONB,
    "output_data" JSONB,
    "error_message" TEXT,
    "node_results" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flow_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_logs" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "api_id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_ip" TEXT,
    "user_agent" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "query_params" JSONB,
    "request_headers" JSONB,
    "request_body" JSONB,
    "status_code" INTEGER NOT NULL,
    "response_headers" JSONB,
    "response_body" JSONB,
    "duration" INTEGER NOT NULL,
    "extracted_data" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partition_key" TEXT NOT NULL DEFAULT to_char(now(), 'YYYYMM'),

    CONSTRAINT "api_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_logs" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT,
    "data" JSONB,
    "flow_id" TEXT,
    "flow_name" TEXT,
    "request_id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_ip" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "audit_action" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_ip" TEXT,
    "old_values" JSONB,
    "new_values" JSONB,
    "changes" JSONB,
    "description" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_logs" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "flow_id" TEXT,
    "flow_name" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "query_params" JSONB,
    "headers" JSONB,
    "status_code" INTEGER,
    "response_headers" JSONB,
    "response_body" JSONB,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "api_id" TEXT,
    "api_name" TEXT,
    "api_endpoint" TEXT,
    "user_ip" TEXT,
    "user_agent" TEXT,
    "node_id" TEXT,
    "node_type" TEXT,
    "execution_status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "entity_name" TEXT,
    "flow_id" TEXT,
    "flow_name" TEXT,
    "node_id" TEXT,
    "node_type" TEXT,
    "description" TEXT,
    "old_values" JSONB,
    "new_values" JSONB,
    "changes" JSONB,
    "request_id" TEXT,
    "method" TEXT,
    "path" TEXT,
    "user_id" TEXT,
    "username" TEXT,
    "user_first_name" TEXT,
    "user_last_name" TEXT,
    "user_ip" TEXT,
    "user_agent" TEXT,
    "execution_status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "error_message" TEXT,
    "source_system" TEXT NOT NULL DEFAULT 'ORCH_BROKER',
    "source_ip" TEXT,
    "metadata" JSONB,
    "session_id" TEXT,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "flow_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_jobs" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "flow_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "node_type" TEXT NOT NULL,
    "queue_name" TEXT NOT NULL DEFAULT 'default',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "worker_job_status" NOT NULL DEFAULT 'pending',
    "input_data" JSONB NOT NULL,
    "output_data" JSONB,
    "config" JSONB,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "kafka_offset" TEXT,
    "kafka_partition" TEXT,

    CONSTRAINT "worker_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_flow_mappings" (
    "id" TEXT NOT NULL,
    "api_id" TEXT NOT NULL,
    "api_name" TEXT NOT NULL,
    "path_pattern" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'ANY',
    "flow_id" TEXT NOT NULL,
    "flow_name" TEXT,
    "domain" TEXT,
    "base_path" TEXT,
    "upstream_url" TEXT,
    "strip_prefix" BOOLEAN NOT NULL DEFAULT true,
    "preserve_host" BOOLEAN NOT NULL DEFAULT false,
    "add_headers" JSONB,
    "remove_headers" TEXT[],
    "request_transform" JSONB,
    "response_transform" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_flow_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_configs" (
    "id" TEXT NOT NULL,
    "worker_cuid" TEXT,
    "worker_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "auto_restart" BOOLEAN NOT NULL DEFAULT true,
    "enable_logging" BOOLEAN NOT NULL DEFAULT true,
    "high_priority" BOOLEAN NOT NULL DEFAULT false,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "timeout" INTEGER NOT NULL DEFAULT 30000,
    "settings" JSONB,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "data_catalogs_parent_id_idx" ON "data_catalogs"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "projects_project_group_idx" ON "projects"("project_group");

-- CreateIndex
CREATE INDEX "projects_slug_idx" ON "projects"("slug");

-- CreateIndex
CREATE INDEX "projects_path_prefix_idx" ON "projects"("path_prefix");

-- CreateIndex
CREATE INDEX "api_registrations_project_id_idx" ON "api_registrations"("project_id");

-- CreateIndex
CREATE INDEX "api_registrations_endpoint_method_idx" ON "api_registrations"("endpoint", "method");

-- CreateIndex
CREATE INDEX "api_registrations_status_idx" ON "api_registrations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "api_auth_configs_api_registration_id_key" ON "api_auth_configs"("api_registration_id");

-- CreateIndex
CREATE INDEX "api_header_mappings_api_registration_id_idx" ON "api_header_mappings"("api_registration_id");

-- CreateIndex
CREATE INDEX "api_header_mappings_direction_idx" ON "api_header_mappings"("direction");

-- CreateIndex
CREATE INDEX "message_formats_api_registration_id_idx" ON "message_formats"("api_registration_id");

-- CreateIndex
CREATE INDEX "message_formats_discriminator_source_discriminator_field_di_idx" ON "message_formats"("discriminator_source", "discriminator_field", "discriminator_value");

-- CreateIndex
CREATE UNIQUE INDEX "api_logs_request_id_key" ON "api_logs"("request_id");

-- CreateIndex
CREATE INDEX "api_logs_api_id_timestamp_idx" ON "api_logs"("api_id", "timestamp");

-- CreateIndex
CREATE INDEX "api_logs_user_id_timestamp_idx" ON "api_logs"("user_id", "timestamp");

-- CreateIndex
CREATE INDEX "api_logs_partition_key_idx" ON "api_logs"("partition_key");

-- CreateIndex
CREATE INDEX "api_logs_timestamp_idx" ON "api_logs"("timestamp");

-- CreateIndex
CREATE INDEX "event_logs_event_type_timestamp_idx" ON "event_logs"("event_type", "timestamp");

-- CreateIndex
CREATE INDEX "event_logs_flow_id_timestamp_idx" ON "event_logs"("flow_id", "timestamp");

-- CreateIndex
CREATE INDEX "event_logs_request_id_idx" ON "event_logs"("request_id");

-- CreateIndex
CREATE INDEX "event_logs_timestamp_idx" ON "event_logs"("timestamp");

-- CreateIndex
CREATE INDEX "event_logs_level_idx" ON "event_logs"("level");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_timestamp_idx" ON "audit_logs"("user_id", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_key_key" ON "system_configs"("key");

-- CreateIndex
CREATE INDEX "execution_logs_request_id_idx" ON "execution_logs"("request_id");

-- CreateIndex
CREATE INDEX "execution_logs_flow_id_idx" ON "execution_logs"("flow_id");

-- CreateIndex
CREATE INDEX "execution_logs_created_at_idx" ON "execution_logs"("created_at");

-- CreateIndex
CREATE INDEX "execution_logs_method_idx" ON "execution_logs"("method");

-- CreateIndex
CREATE INDEX "execution_logs_status_code_idx" ON "execution_logs"("status_code");

-- CreateIndex
CREATE INDEX "execution_logs_api_id_idx" ON "execution_logs"("api_id");

-- CreateIndex
CREATE INDEX "execution_logs_user_ip_idx" ON "execution_logs"("user_ip");

-- CreateIndex
CREATE INDEX "flow_audit_logs_created_at_idx" ON "flow_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "flow_audit_logs_action_idx" ON "flow_audit_logs"("action");

-- CreateIndex
CREATE INDEX "flow_audit_logs_entity_type_entity_id_idx" ON "flow_audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "flow_audit_logs_user_id_idx" ON "flow_audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "flow_audit_logs_request_id_idx" ON "flow_audit_logs"("request_id");

-- CreateIndex
CREATE INDEX "flow_audit_logs_flow_id_idx" ON "flow_audit_logs"("flow_id");

-- CreateIndex
CREATE INDEX "worker_jobs_status_queue_name_idx" ON "worker_jobs"("status", "queue_name");

-- CreateIndex
CREATE INDEX "worker_jobs_flow_id_node_id_idx" ON "worker_jobs"("flow_id", "node_id");

-- CreateIndex
CREATE INDEX "worker_jobs_request_id_idx" ON "worker_jobs"("request_id");

-- CreateIndex
CREATE INDEX "worker_jobs_created_at_idx" ON "worker_jobs"("created_at");

-- CreateIndex
CREATE INDEX "worker_jobs_scheduled_at_idx" ON "worker_jobs"("scheduled_at");

-- CreateIndex
CREATE INDEX "api_flow_mappings_path_pattern_idx" ON "api_flow_mappings"("path_pattern");

-- CreateIndex
CREATE INDEX "api_flow_mappings_flow_id_idx" ON "api_flow_mappings"("flow_id");

-- CreateIndex
CREATE INDEX "api_flow_mappings_is_active_idx" ON "api_flow_mappings"("is_active");

-- CreateIndex
CREATE INDEX "api_flow_mappings_priority_idx" ON "api_flow_mappings"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "api_flow_mappings_path_pattern_method_key" ON "api_flow_mappings"("path_pattern", "method");

-- CreateIndex
CREATE UNIQUE INDEX "worker_configs_worker_cuid_key" ON "worker_configs"("worker_cuid");

-- CreateIndex
CREATE INDEX "worker_configs_queue_idx" ON "worker_configs"("queue");

-- CreateIndex
CREATE INDEX "worker_configs_worker_id_idx" ON "worker_configs"("worker_id");

-- CreateIndex
CREATE INDEX "worker_configs_worker_cuid_idx" ON "worker_configs"("worker_cuid");

-- AddForeignKey
ALTER TABLE "data_catalogs" ADD CONSTRAINT "data_catalogs_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "data_catalogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_catalogs" ADD CONSTRAINT "data_catalogs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_registrations" ADD CONSTRAINT "api_registrations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_registrations" ADD CONSTRAINT "api_registrations_data_catalog_id_fkey" FOREIGN KEY ("data_catalog_id") REFERENCES "data_catalogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_registrations" ADD CONSTRAINT "api_registrations_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "flow_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_registrations" ADD CONSTRAINT "api_registrations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_auth_configs" ADD CONSTRAINT "api_auth_configs_api_registration_id_fkey" FOREIGN KEY ("api_registration_id") REFERENCES "api_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_header_mappings" ADD CONSTRAINT "api_header_mappings_api_registration_id_fkey" FOREIGN KEY ("api_registration_id") REFERENCES "api_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_formats" ADD CONSTRAINT "message_formats_api_registration_id_fkey" FOREIGN KEY ("api_registration_id") REFERENCES "api_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_formats" ADD CONSTRAINT "message_formats_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_integrations" ADD CONSTRAINT "flow_integrations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_executions" ADD CONSTRAINT "flow_executions_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "flow_integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_logs" ADD CONSTRAINT "api_logs_api_id_fkey" FOREIGN KEY ("api_id") REFERENCES "api_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

