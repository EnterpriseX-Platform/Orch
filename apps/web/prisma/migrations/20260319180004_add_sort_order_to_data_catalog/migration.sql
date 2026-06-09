-- AlterTable
ALTER TABLE "api_logs" ALTER COLUMN "partition_key" SET DEFAULT to_char(now(), 'YYYYMM');

-- AlterTable
ALTER TABLE "data_catalogs" ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;
