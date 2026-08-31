/**
 * Download de um documento do formulário de abertura.
 *
 * GET /api/formulario/documento/[id]
 *
 * SÓ GET. Não existe DELETE nesta rota, e não é esquecimento — é a regra:
 * documento entregue pelo cliente nunca é excluído. `TarefaAnexo` tem rota de
 * remoção porque lá o anexo é material de trabalho interno; aqui é o RG e o
 * comprovante de residência que sustentam um contrato social. O banco reforça com
 * `ON DELETE RESTRICT` na chave estrangeira.
 *
 * O download passa por aqui, com sessão conferida, e nunca por arquivo estático.
 * Servir `/uploads/x.pdf` direto deixaria qualquer pessoa que descobrisse o nome
 * baixar o documento de um cliente — e nomes vazam em log, histórico do navegador
 * e print de tela.
 *
 * Guard `requireInterno`: o cliente não baixa por aqui. Ele já tem os próprios
 * arquivos, e a consulta pública por token mostra o nome e o tamanho sem oferecer
 * o conteúdo, justamente para o link encaminhado sem pensar não virar
 * distribuidor de documento de identidade.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import prisma from "@/lib/prisma";
import { requireInterno } from "@/lib/api-guard";
import { contentDisposition, ehImagem } from "@/lib/tarefa-anexo";
import { caminhoDoDocumento } from "@/lib/formulario-disco";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

function erro(mensagem: string, status: number, code?: string): NextResponse {
  return NextResponse.json(
    code ? { error: mensagem, code } : { error: mensagem },
    { status }
  );
}

export async function GET(req: NextRequest, { params }: Params) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  const { id } = await params;

  try {
    const documento = await prisma.formularioAberturaDocumento.findUnique({
      where: { id },
      select: {
        arquivo: true,
        nomeOriginal: true,
        tipoMime: true,
        dono: true,
        rotulo: true,
      },
    });
    if (!documento) return erro("Documento não encontrado.", 404, "NAO_ENCONTRADO");

    const caminho = caminhoDoDocumento(documento.arquivo);
    if (!caminho) {
      // Linha com nome que tenta sair da pasta. Não deveria existir, e se existe é
      // dado corrompido, não pedido legítimo.
      console.error(
        "[formulario][documento] nome de arquivo suspeito:",
        documento.arquivo
      );
      return erro("Documento inválido.", 400, "ARQUIVO_INVALIDO");
    }

    /**
     * Arquivo ausente é 410, não 404.
     *
     * A diferença importa para quem lê: 404 diz "esse documento não existe", e o
     * operador conclui que alguém apagou. 410 com este texto diz a verdade — o
     * registro existe, o arquivo se perdeu. Aqui o cenário é o volume de uploads
     * não ter sido montado no deploy.
     */
    try {
      await stat(caminho);
    } catch {
      return erro(
        `O registro de "${documento.rotulo}" de ${documento.dono} existe, mas o arquivo não está no servidor. Peça ao cliente para enviar novamente.`,
        410,
        "ARQUIVO_AUSENTE"
      );
    }

    const conteudo = await readFile(caminho);

    // Imagem e PDF abrem no navegador; o resto baixa. Abrir uma planilha inline só
    // faz o navegador baixar de qualquer jeito, com nome pior.
    const embutir =
      ehImagem(documento.tipoMime) || documento.tipoMime === "application/pdf";

    return new NextResponse(new Uint8Array(conteudo), {
      status: 200,
      headers: {
        "Content-Type": documento.tipoMime,
        "Content-Length": String(conteudo.byteLength),
        "Content-Disposition": contentDisposition(documento.nomeOriginal, embutir),
        // `nosniff` para o navegador não reinterpretar o conteúdo e executar algo
        // que o Content-Type diz que não é.
        "X-Content-Type-Options": "nosniff",
        // Privado e curto: é documento de cliente, não pode ficar em cache
        // compartilhado, e quem reabre a tela em seguida aproveita.
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    console.error("[formulario][documento] falha ao baixar:", e);
    return erro("Erro ao baixar o documento.", 500);
  }
}
