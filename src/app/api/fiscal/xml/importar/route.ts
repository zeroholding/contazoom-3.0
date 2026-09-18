/**
 * POST /api/fiscal/xml/importar
 *
 * Recebe N arquivos XML de nota fiscal, grava em disco, cria uma linha por
 * documento e reapura as competências tocadas. Devolve o relatório por arquivo.
 *
 * A rota é fina de propósito: a lógica inteira mora em `src/lib/fiscal-xml-import.ts`,
 * que é onde a corretude foi escrita e comentada. Aqui ficam guard, leitura do
 * multipart e tradução de erro para HTTP.
 *
 * SEM PREVIEW/COMMIT, diferente do importador de planilha.
 *
 * Planilha tem ambiguidade de coluna que só uma pessoa resolve, e por isso vale a
 * tela de conferência antes de gravar. XML não tem: ou é nota válida, ou não é. O
 * relatório vem DEPOIS, e o que ele relata já é fato. E há um segundo motivo, mais
 * prático: o preview exigiria segurar 822 arquivos entre duas requisições.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireInterno } from "@/lib/api-guard";
import {
  MAX_ARQUIVOS_POR_LOTE,
  importarXmlFiscal,
  type ArquivoParaImportar,
} from "@/lib/fiscal-xml-import";
import { TAMANHO_MAXIMO_XML } from "@/lib/nfe-xml";

export const runtime = "nodejs";
/** Mesmo teto que o projeto já usa em importação pesada (`sku/import`). */
export const maxDuration = 300;

const erro = (mensagem: string, status: number, code?: string) =>
  NextResponse.json({ error: mensagem, code }, { status });

export async function POST(req: NextRequest) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  let formulario: FormData;
  try {
    formulario = await req.formData();
  } catch {
    return erro("Não foi possível ler o envio.", 400, "CORPO_INVALIDO");
  }

  // `getAll`: é o comportamento natural de selecionar a pasta toda no navegador.
  const enviados = formulario.getAll("arquivos").filter((item): item is File => item instanceof File);

  if (enviados.length === 0) {
    return erro("Envie ao menos um arquivo XML.", 400, "ARQUIVO_OBRIGATORIO");
  }

  if (enviados.length > MAX_ARQUIVOS_POR_LOTE) {
    /*
     * Recusa antes de ler os bytes.
     *
     * O serviço também trata a sobra (devolve NAO_PROCESSADO), mas aceitar um
     * corpo gigante para depois dizer que metade não caberia é desperdício de
     * memória num container sem limite declarado. A tela envia em lotes.
     */
    return erro(
      `Envie no máximo ${MAX_ARQUIVOS_POR_LOTE} arquivos por vez. Você enviou ${enviados.length}.`,
      413,
      "LOTE_GRANDE",
    );
  }

  const arquivos: ArquivoParaImportar[] = [];
  for (const arquivo of enviados) {
    const nome = (arquivo.name || "arquivo.xml").slice(0, 255);

    // Extensão, e não MIME: o navegador manda `text/xml`, `application/xml` ou
    // string vazia para o mesmo arquivo, dependendo do sistema operacional.
    if (!nome.toLowerCase().endsWith(".xml")) {
      return erro(
        `"${nome}" não é um arquivo .xml. Envie apenas XML de nota fiscal.`,
        415,
        "TIPO_NAO_ACEITO",
      );
    }

    if (arquivo.size <= 0) {
      return erro(`"${nome}" está vazio.`, 400, "ARQUIVO_VAZIO");
    }

    if (arquivo.size > TAMANHO_MAXIMO_XML) {
      return erro(
        `"${nome}" tem ${(arquivo.size / 1024).toFixed(0)} KB e o limite por XML é ${TAMANHO_MAXIMO_XML / 1024} KB.`,
        413,
        "ARQUIVO_GRANDE",
      );
    }

    arquivos.push({ nome, bytes: Buffer.from(await arquivo.arrayBuffer()) });
  }

  try {
    const resumo = await importarXmlFiscal(arquivos, {
      usuarioId: sessao.userId,
      usuarioNome: sessao.nome || sessao.email,
    });

    return NextResponse.json(resumo, { status: 201 });
  } catch (falha) {
    console.error("Erro ao importar XML fiscal:", falha);
    return erro("Erro interno ao importar os arquivos.", 500);
  }
}
