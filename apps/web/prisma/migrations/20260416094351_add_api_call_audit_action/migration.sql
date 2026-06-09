-- AlterEnum
ALTER TYPE "audit_action" ADD VALUE 'API_CALL';

-- AlterTable
ALTER TABLE "api_logs" ALTER COLUMN "partition_key" SET DEFAULT to_char(now(), 'YYYYMM');
