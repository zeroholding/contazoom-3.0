-- CreateTable: documento (creates table if it doesn't exist, for prod databases that never ran db push)
CREATE TABLE IF NOT EXISTS "documento" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "sub_folder" TEXT,
    "folder_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_pkey" PRIMARY KEY ("id")
);

-- Backfill columns for prod databases that already had documento from db push/manual SQL.
ALTER TABLE "documento" ADD COLUMN IF NOT EXISTS "folder_id" TEXT;

-- CreateTable: document_folder (creates table if it doesn't exist, for prod databases that never ran db push)
CREATE TABLE IF NOT EXISTS "document_folder" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "parent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_folder_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add parent_id column if table already existed without it
ALTER TABLE "document_folder" ADD COLUMN IF NOT EXISTS "parent_id" TEXT;

-- AlterTable: Add updated_at default if it existed without default (safety)
-- (no-op if column already has correct type)

-- CreateIndex
CREATE INDEX IF NOT EXISTS "document_folder_user_id_idx" ON "document_folder"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "document_folder_parent_id_idx" ON "document_folder"("parent_id");

-- AddForeignKey: user_id -> usuario
DO $$ BEGIN
    ALTER TABLE "document_folder" ADD CONSTRAINT "document_folder_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: parent_id -> document_folder (self-referential for subfolders)
DO $$ BEGIN
    ALTER TABLE "document_folder" ADD CONSTRAINT "document_folder_parent_id_fkey"
        FOREIGN KEY ("parent_id") REFERENCES "document_folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateTable: document_log (creates table if it doesn't exist, for prod databases that never ran db push)
CREATE TABLE IF NOT EXISTS "document_log" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "documento_user_id_idx" ON "documento"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "documento_category_idx" ON "documento"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "documento_sub_folder_idx" ON "documento"("sub_folder");

-- CreateIndex for documento.folder_id
CREATE INDEX IF NOT EXISTS "documento_folder_id_idx" ON "documento"("folder_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "document_log_document_id_idx" ON "document_log"("document_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "document_log_user_id_idx" ON "document_log"("user_id");

-- AddForeignKey: documento.user_id -> usuario
DO $$ BEGIN
    ALTER TABLE "documento" ADD CONSTRAINT "documento_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: documento.folder_id -> document_folder
DO $$ BEGIN
    ALTER TABLE "documento" ADD CONSTRAINT "documento_folder_id_fkey"
        FOREIGN KEY ("folder_id") REFERENCES "document_folder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: document_log.document_id -> documento
DO $$ BEGIN
    ALTER TABLE "document_log" ADD CONSTRAINT "document_log_document_id_fkey"
        FOREIGN KEY ("document_id") REFERENCES "documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: document_log.user_id -> usuario
DO $$ BEGIN
    ALTER TABLE "document_log" ADD CONSTRAINT "document_log_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
