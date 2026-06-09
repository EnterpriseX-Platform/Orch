-- CreateEnum
CREATE TYPE "route_type" AS ENUM ('dedicated', 'shared_endpoint');

-- AlterTable
ALTER TABLE "api_logs" ALTER COLUMN "partition_key" SET DEFAULT to_char(now(), 'YYYYMM');

-- AlterTable
ALTER TABLE "api_registrations" ADD COLUMN     "route_type" "route_type" NOT NULL DEFAULT 'dedicated',
ADD COLUMN     "routing_key" TEXT;

-- AlterTable
ALTER TABLE "message_formats" ADD COLUMN     "flow_id" TEXT;

-- AddForeignKey
ALTER TABLE "message_formats" ADD CONSTRAINT "message_formats_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "flow_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
