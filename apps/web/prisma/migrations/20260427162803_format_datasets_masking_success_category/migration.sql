-- AlterEnum
ALTER TYPE "data_category" ADD VALUE 'operation';

-- AlterTable
ALTER TABLE "api_logs" ALTER COLUMN "partition_key" SET DEFAULT to_char(now(), 'YYYYMM');

-- AlterTable
ALTER TABLE "message_formats" ADD COLUMN     "mask_paths" JSONB;

-- CreateTable
CREATE TABLE "_MessageFormatDatasets" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MessageFormatDatasets_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_MessageFormatDatasets_B_index" ON "_MessageFormatDatasets"("B");

-- AddForeignKey
ALTER TABLE "_MessageFormatDatasets" ADD CONSTRAINT "_MessageFormatDatasets_A_fkey" FOREIGN KEY ("A") REFERENCES "data_catalogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MessageFormatDatasets" ADD CONSTRAINT "_MessageFormatDatasets_B_fkey" FOREIGN KEY ("B") REFERENCES "message_formats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
