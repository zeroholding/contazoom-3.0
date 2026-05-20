-- AlterTable: Add parentId to document_folder for subfolder support
ALTER TABLE "document_folder" ADD COLUMN "parent_id" TEXT;

-- AddForeignKey
ALTER TABLE "document_folder" ADD CONSTRAINT "document_folder_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "document_folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "document_folder_parent_id_idx" ON "document_folder"("parent_id");
