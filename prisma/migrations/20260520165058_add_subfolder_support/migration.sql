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

-- AlterTable: Add folder_id to documento table if it doesn't have it yet
ALTER TABLE "documento" ADD COLUMN IF NOT EXISTS "folder_id" TEXT;

-- CreateIndex for documento.folder_id
CREATE INDEX IF NOT EXISTS "documento_folder_id_idx" ON "documento"("folder_id");

-- AddForeignKey: documento.folder_id -> document_folder
DO $$ BEGIN
    ALTER TABLE "documento" ADD CONSTRAINT "documento_folder_id_fkey"
        FOREIGN KEY ("folder_id") REFERENCES "document_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
