/**
 * Download e remoção de um anexo de tarefa.
 *
 * GET    /api/tarefas/anexos/[id]  — devolve o arquivo
 * DELETE /api/tarefas/anexos/[id]  — remove a linha e o arquivo
 *
 * O download passa por aqui, com sessão conferida, e nunca por arquivo estático.
 * Servir `/uploads/x.pdf` direto deixaria qualquer pessoa que descobrisse o nome
 * baixar o contrato social de um cliente — e os nomes vazam em log, histórico do
 * navegador e print de tela.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile, stat, unlink } from "fs/promises";
import prisma from "@/lib/prisma";
import { PAPEL, requireInterno } from "@/lib/api-guard";
import { ACAO_LOG } from "@/lib/tarefa-etapas";
import { contentDisposition, ehImagem } from "@/lib/tarefa-anexo";
import { caminhoDoAnexo } from "@/lib/tarefa-anexo-disco";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

function erro(mensagem: string, status: number, code?: string): NextResponse {
  return NextResponse.json(
    code ? { error: mensagem, code } : { error: mensagem },
    { status }
  );
}

/* -------------------------------------------------------------------------- */
/*                                    GET                                     */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest, { params }: Params) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  const { id } = await params;

  try {
    const anexo = await prisma.tarefaAnexo.findUnique({
      where: { id },
      select: {
        arquivo: true,
        nomeOriginal: true,
        tipoMime: true,
        tamanhoBytes: true,
      },
    });
    if (!anexo) return erro("Anexo não encontrado.", 404, "NAO_ENCONTRADO");

    const caminho = caminhoDoAnexo(anexo.arquivo);
    if (!caminho) {
      // Linha com nome que tenta sair da pasta. Não deveria existir, e se existe
      // é dado corrompido, não pedido legítimo.
      console.error("[anexos][GET] nome de arquivo suspeito:", anexo.arquivo);
      return erro("Anexo inválido.", 400, "ARQUIVO_INVALIDO");
    }

    /**
     * Arquivo ausente é 410, não 404.
     *
     * A diferença importa para quem lê a mensagem: 404 diz "esse anexo não
     * existe", e o operador conclui que apagou sem querer. 410 com este texto diz
     * a verdade — o registro existe, o arquivo se perdeu. É o cenário de um
     * anexo enviado antes de o volume de uploads existir no compose.
     */
    try {
      await stat(caminho);
    } catch {
      return erro(
        "O registro do anexo existe, mas o arquivo não está mais no servidor. Envie o arquivo novamente.",
        410,
        "ARQUIVO_AUSENTE"
      );
    }

    const conteudo = await readFile(caminho);

    // Imagem e PDF abrem no navegador (`inline`), o resto baixa. Abrir uma
    // planilha inline só faz o navegador baixar de qualquer jeito, com nome pior.
    const embutir = ehImagem(anexo.tipoMime) || anexo.tipoMime === "application/pdf";

    return new NextResponse(new Uint8Array(conteudo), {
      status: 200,
      headers: {
        "Content-Type": anexo.tipoMime,
        "Content-Length": String(conteudo.byteLength),
        "Content-Disposition": contentDisposition(anexo.nomeOriginal, embutir),
        // `nosniff` para o navegador não reinterpretar o conteúdo e executar algo
        // que o Content-Type diz que não é.
        "X-Content-Type-Options": "nosniff",
        // Privado e curto: é documento de cliente, não pode ficar em cache
        // compartilhado, e o operador que reabre a tela em seguida aproveita.
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    console.error("[anexos][GET id] falha ao baixar:", e);
    return erro("Erro ao baixar o anexo.", 500);
  }
}

/* -------------------------------------------------------------------------- */
/*                                   DELETE                                   */
/* -------------------------------------------------------------------------- */

export async function DELETE(req: NextRequest, { params }: Params) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  const { id } = await params;

  try {
    const anexo = await prisma.tarefaAnexo.findUnique({
      where: { id },
      select: {
        id: true,
        apuracaoId: true,
        processoId: true,
        arquivo: true,
        nomeOriginal: true,
        enviadoPorId: true,
      },
    });
    if (!anexo) return erro("Anexo não encontrado.", 404, "NAO_ENCONTRADO");

    /**
     * Quem remove: quem enviou, ou administrador.
     *
     * Anexo é prova de trabalho. Deixar qualquer papel interno apagar o anexo de
     * qualquer colega é o tipo de permissão que só aparece quando o documento que
     * importava sumiu. Quem enviou pode desfazer o próprio envio errado; para o
     * resto existe administrador, que já é quem destrava operação no módulo.
     */
    if (anexo.enviadoPorId !== sessao.userId && sessao.papel !== PAPEL.ADMIN) {
      return erro(
        "Somente quem enviou o anexo, ou um administrador, pode removê-lo.",
        403,
        "SEM_PERMISSAO"
      );
    }

    // Banco primeiro, disco depois.
    //
    // Se o disco falhar, sobra um arquivo órfão que só ocupa espaço. Na ordem
    // inversa, uma falha no banco deixaria linha apontando para arquivo que não
    // existe — e a tela ofereceria um download quebrado para sempre.
    await prisma.$transaction(async (tx) => {
      await tx.tarefaAnexo.delete({ where: { id } });
      await tx.tarefaLog.create({
        data: {
          apuracaoId: anexo.apuracaoId,
          processoId: anexo.processoId,
          acao: ACAO_LOG.ANEXO_REMOVIDO,
          de: anexo.nomeOriginal,
          autorId: sessao.userId,
          autorNome: sessao.nome || sessao.email,
          autorPapel: sessao.papel,
        },
      });
    });

    const caminho = caminhoDoAnexo(anexo.arquivo);
    if (caminho) {
      await unlink(caminho).catch((falha) => {
        // Arquivo já ausente é o caso comum aqui, e não é erro do ponto de vista
        // de quem pediu a remoção: o que ele queria já aconteceu.
        console.warn("[anexos][DELETE] arquivo não removido do disco:", falha);
      });
    }

    return NextResponse.json({ removido: true, id });
  } catch (e) {
    console.error("[anexos][DELETE] falha ao remover:", e);
    return erro("Erro ao remover o anexo.", 500);
  }
}
