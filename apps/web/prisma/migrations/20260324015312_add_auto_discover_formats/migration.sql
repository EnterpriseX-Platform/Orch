-- AlterTable
ALTER TABLE "api_logs" ALTER COLUMN "partition_key" SET DEFAULT to_char(now(), 'YYYYMM');

-- AlterTable
ALTER TABLE "api_registrations" ADD COLUMN     "auto_discover_formats" BOOLEAN NOT NULL DEFAULT false;
