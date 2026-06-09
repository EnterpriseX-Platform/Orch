-- AlterTable
ALTER TABLE "api_logs" ALTER COLUMN "partition_key" SET DEFAULT to_char(now(), 'YYYYMM');

-- CreateTable
CREATE TABLE "repo_folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repo_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repo_tables" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT,
    "description" TEXT,
    "category" "data_category" NOT NULL DEFAULT 'other',
    "folder_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "schema_json" JSONB NOT NULL DEFAULT '[]',
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "last_alter_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repo_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repo_api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT 'read',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repo_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repo_folders_parent_id_idx" ON "repo_folders"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "repo_tables_name_key" ON "repo_tables"("name");

-- CreateIndex
CREATE INDEX "repo_tables_folder_id_idx" ON "repo_tables"("folder_id");

-- CreateIndex
CREATE INDEX "repo_tables_category_idx" ON "repo_tables"("category");

-- CreateIndex
CREATE UNIQUE INDEX "repo_api_keys_key_hash_key" ON "repo_api_keys"("key_hash");

-- AddForeignKey
ALTER TABLE "repo_folders" ADD CONSTRAINT "repo_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "repo_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_tables" ADD CONSTRAINT "repo_tables_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "repo_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
