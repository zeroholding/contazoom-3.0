/**
 * Criação de notificações a partir dos eventos do sistema.
 *
 * Hoje há um evento: o administrador enviou um documento para o cliente
 * (`POST /api/documents`). A notificação aparece no sino na hora; o e-mail vai
 * para a fila e sai agrupado com os outros documentos que chegarem em seguida
 * (ver `despacho.ts`).
 */

import prisma from "@/lib/prisma";
import { agendarProcessamento, horarioDoLote, iniciarVarreduraEmails } from "./despacho";
import { montarNotificacaoDocumento } from "./documento-novo";
import { STATUS_EMAIL, infoTipoNotificacao } from "./tipos";

/**
 * Notifica o dono do documento. Devolve `null` quando não há o que avisar:
 * documento sumiu, ou quem enviou foi o próprio dono.
 *
 * Quem chama trata erro: o envio do arquivo já deu certo e não pode falhar por
 * causa do aviso.
 */
export async function notificarDocumentoNovo({
  documentoId,
  autorId,
}: {
  documentoId: string;
  autorId: string;
}): Promise<{ id: string } | null> {
  const documento = await prisma.document.findUnique({
    where: { id: documentoId },
    select: {
      id: true,
      userId: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      category: true,
      subFolder: true,
      folderId: true,
    },
  });
  if (!documento || documento.userId === autorId) return null;

  const pastas = await prisma.documentFolder.findMany({
    where: { userId: documento.userId },
    select: { id: true, name: true, parentId: true },
  });

  const montada = montarNotificacaoDocumento({ documento, pastas });
  const vaiPorEmail = infoTipoNotificacao(montada.tipo).email;
  const agora = new Date();

  const criada = await prisma.$transaction(async (tx) => {
    const maisAntiga = vaiPorEmail
      ? await tx.notificacao.findFirst({
          where: { userId: documento.userId, emailStatus: STATUS_EMAIL.PENDENTE },
          orderBy: { criadaEm: "asc" },
          select: { criadaEm: true },
        })
      : null;
    const enviarApos = horarioDoLote(agora, maisAntiga?.criadaEm ?? null);

    const nova = await tx.notificacao.create({
      data: {
        userId: documento.userId,
        tipo: montada.tipo,
        titulo: montada.titulo,
        mensagem: montada.mensagem,
        link: montada.link,
        documentoId: documento.id,
        dados: montada.dados,
        emailStatus: vaiPorEmail ? STATUS_EMAIL.PENDENTE : STATUS_EMAIL.NAO_SE_APLICA,
        emailEnviarApos: enviarApos,
      },
      select: { id: true },
    });

    // As pendentes do cliente andam juntas: todas passam a sair no horário
    // do lote, e o e-mail leva todos os documentos de uma vez.
    if (vaiPorEmail) {
      await tx.notificacao.updateMany({
        where: { userId: documento.userId, emailStatus: STATUS_EMAIL.PENDENTE },
        data: { emailEnviarApos: enviarApos },
      });
    }

    return { id: nova.id, enviarApos };
  });

  if (vaiPorEmail) {
    agendarProcessamento(criada.enviarApos.getTime() - Date.now() + 1_000);
    // Rede de segurança do temporizador: se este processo reiniciar antes do
    // horário do lote, a varredura do próximo processo envia.
    iniciarVarreduraEmails();
  }
  return { id: criada.id };
}
