-- Notificações do painel (sino) e do e-mail (Brevo).
-- Tabela nova, sem tocar nas existentes: o aviso nasce quando o administrador
-- envia um documento para o cliente. Ver `Notificacao` em schema.prisma.

-- CreateTable
CREATE TABLE "public"."notificacao" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "link" TEXT,
    "documento_id" TEXT,
    "dados" JSONB,
    "lida_em" TIMESTAMP(3),
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email_status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "email_enviar_apos" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email_lote" TEXT,
    "email_tentativas" INTEGER NOT NULL DEFAULT 0,
    "email_enviado_em" TIMESTAMP(3),
    "email_message_id" TEXT,
    "email_erro" TEXT,

    CONSTRAINT "notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificacao_user_id_lida_em_idx" ON "public"."notificacao"("user_id", "lida_em");

-- CreateIndex
CREATE INDEX "notificacao_user_id_criada_em_idx" ON "public"."notificacao"("user_id", "criada_em" DESC);

-- CreateIndex
CREATE INDEX "notificacao_email_status_email_enviar_apos_idx" ON "public"."notificacao"("email_status", "email_enviar_apos");

-- CreateIndex
CREATE INDEX "notificacao_email_lote_idx" ON "public"."notificacao"("email_lote");

-- CreateIndex
CREATE INDEX "notificacao_documento_id_idx" ON "public"."notificacao"("documento_id");

-- AddForeignKey
ALTER TABLE "public"."notificacao" ADD CONSTRAINT "notificacao_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notificacao" ADD CONSTRAINT "notificacao_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "public"."documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
