/**
 * GET /api/fiscal/xml/[id]
 *
 * Baixa o XML original da nota.
 *
 * ROTA AUTENTICADA, nunca arquivo estático. O XML tem CNPJ e endereço do cliente
 * e o CPF do comprador — na base analisada, 329 CPFs num único mês de uma única
 * conta. Servir isso por caminho público seria vazamento de dado pessoal por
 * conveniência de implementação.
 *
 * E o arquivo é a PROVA do número: quando o banco questionar a declaração de
 * faturamento, o que responde é este download.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { requireInterno } from "@/lib/api-guard";
import prisma from "@/lib/prisma";
import { caminhoAbsolutoDoXml } from "@/lib/fiscal-xml-disco";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const erro = (mensagem: string, status: number, code?: string) =>
  NextResponse.json({ error: mensagem, code }, { status });

export async function GET(req: NextRequest, { params }: Params) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  const { id } = await params;

  const documento = await prisma.documentoFiscal.findUnique({
    where: { id },
    select: { chave: true, arquivo: true, arquivoBytes: true, arquivoHash: true },
  });
  if (!documento) {
    return erro("Documento não encontrado.", 404, "NAO_ENCONTRADO");
  }

  // O caminho vem do banco, e o banco não é fronteira de confiança para caminho.
  const caminho = caminhoAbsolutoDoXml(documento.arquivo);
  if (!caminho) {
    return erro("Caminho do arquivo é inválido.", 400, "ARQUIVO_INVALIDO");
  }

  let conteudo: Buffer;
  try {
    // Uma leitura só: `stat` seguido de `readFile` tinha janela em que o arquivo
    // podia sumir entre as duas chamadas e virar 500.
    conteudo = await readFile(caminho);
  } catch {
    /*
     * 410 e não 404: o REGISTRO existe, o arquivo se perdeu.
     *
     * Mesma distinção de `api/tarefas/anexos/[id]`. Acontece quando o volume de
     * upload não está montado — o compose registra que isso já aconteceu. 404
     * mandaria quem investiga procurar a nota no lugar errado.
     */
    return erro(
      "O arquivo não está mais no disco, embora a nota siga registrada.",
      410,
      "ARQUIVO_AUSENTE",
    );
  }

  /*
   * O XML é chamado de "prova" do número, então é conferido NO DOWNLOAD, não só
   * na entrada. Volume pode corromper, alguém pode substituir arquivo à mão e
   * backup pode restaurar versão errada. Entregar bytes diferentes como original
   * seria pior que falhar: daria aparência de evidência a um documento adulterado.
   */
  const hash = createHash("sha256").update(conteudo).digest("hex");
  if (conteudo.length !== documento.arquivoBytes || hash !== documento.arquivoHash) {
    console.error(
      `[FISCAL] Integridade do XML ${documento.chave} falhou: ` +
        `bytes ${conteudo.length}/${documento.arquivoBytes}, hash ${hash}/${documento.arquivoHash}`,
    );
    return erro(
      "O arquivo armazenado não confere com o original importado. O download foi bloqueado.",
      409,
      "ARQUIVO_CORROMPIDO",
    );
  }

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Length": String(conteudo.length),
      // `attachment`: XML aberto inline vira árvore no navegador e o operador acha
      // que abriu a coisa errada. Ele quer o arquivo, para guardar ou reenviar.
      "Content-Disposition": `attachment; filename="${documento.chave}.xml"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=60",
    },
  });
}
