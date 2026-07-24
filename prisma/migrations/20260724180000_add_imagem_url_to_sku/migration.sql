-- AlterTable: adiciona coluna de imagem/miniatura ao SKU (aditiva)
ALTER TABLE "sku" ADD COLUMN IF NOT EXISTS "imagem_url" TEXT;
