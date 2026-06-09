-- AlterTable
ALTER TABLE "api_logs" ALTER COLUMN "partition_key" SET DEFAULT to_char(now(), 'YYYYMM');

-- AlterTable
ALTER TABLE "field_mappings_lib" ADD COLUMN     "clob_path" TEXT,
ADD COLUMN     "transaction_key_fields" JSONB;
