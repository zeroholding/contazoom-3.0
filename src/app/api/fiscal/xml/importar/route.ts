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
import { PAPEL, requirePapel } from "@/lib/api-guard";
import {
  ErroImportacaoFiscal,
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

/**
 * Teto agregado do multipart.
 *
 * `request.formData()` materializa o corpo antes de conseguirmos olhar cada
 * arquivo. Sem este corte pelo Content-Length, 300 arquivos no teto individual
 * de 1 MiB permitiriam um corpo de 300 MiB num container sem limite de memória.
 * Os lotes reais de 300 XMLs ficam perto de 2–4 MiB; 32 MiB deixa folga para
 * notas enormes sem abrir a porta para a pior combinação possível.
 *
 * A soma é conferida de novo depois do parser, cobrindo cliente que mentiu no
 * header. Requisição chunked sem Content-Length chega à segunda barreira; o
 * proxy de produção deve manter seu próprio limite de corpo como primeira.
 */
export const TAMANHO_MAXIMO_ENVIO = 32 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const sessao = await requirePapel(req, [
    PAPEL.ADMIN,
    PAPEL.CONTABIL,
    PAPEL.CONTABIL_ASSISTENTE,
  ]);
  if (sessao instanceof NextResponse) return sessao;

  const tamanhoDeclarado = Number(req.headers.get("content-length"));
  if (Number.isFinite(tamanhoDeclarado) && tamanhoDeclarado > TAMANHO_MAXIMO_ENVIO) {
    return erro(
      `O envio passa de ${TAMANHO_MAXIMO_ENVIO / 1024 / 1024} MB. Divida os XMLs em mais lotes.`,
      413,
      "ENVIO_GRANDE",
    );
  }

  let formulario: FormData;
  try {
    formulario = await req.formData();
  } catch {
    return erro("Não foi possível ler o envio.", 400, "CORPO_INVALIDO");
  }

  // `getAll`: é o comportamento natural de selecionar a pasta toda no navegador.
  const empresaId = String(formulario.get("empresaId") ?? "").trim();
  const sessaoId = String(formulario.get("sessaoId") ?? "").trim();
  const ultimoLote = String(formulario.get("ultimoLote") ?? "") === "1";
  if (!empresaId) {
    return erro("Selecione a empresa antes de importar.", 400, "EMPRESA_OBRIGATORIA");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessaoId)) {
    return erro("Sessão de importação inválida.", 400, "SESSAO_INVALIDA");
  }

  const enviados = formulario.getAll("arquivos").filter((item): item is File => item instanceof File);
  const origens = formulario.getAll("origens");

  if (enviados.length === 0) {
    return erro("Envie ao menos um arquivo XML.", 400, "ARQUIVO_OBRIGATORIO");
  }

  const tamanhoReal = enviados.reduce((total, arquivo) => total + arquivo.size, 0);
  if (tamanhoReal > TAMANHO_MAXIMO_ENVIO) {
    return erro(
      `Os XMLs somam ${(tamanhoReal / 1024 / 1024).toFixed(1)} MB; o limite por envio é ${TAMANHO_MAXIMO_ENVIO / 1024 / 1024} MB.`,
      413,
      "ENVIO_GRANDE",
    );
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
  for (const [indice, arquivo] of enviados.entries()) {
    const nome = (arquivo.name || "arquivo.xml").slice(0, 255);
    const origemBruta = origens[indice];
    const origem =
      typeof origemBruta === "string"
        ? origemBruta.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 600)
        : nome;

    /**
     * Erro INDIVIDUAL, não erro do multipart.
     *
     * Antes, qualquer uma destas três condições dava `return`: 299 XMLs bons +
     * 1 vazio resultavam em ZERO processados. Além de perder trabalho, isso fazia
     * a pessoa suspeitar do mapa série/canal, porque a tela só mostrava uma falha
     * genérica do envio. Agora o serviço grava a rejeição no relatório da sessão
     * e continua com os demais arquivos.
     *
     * O Buffer do rejeitado fica vazio de propósito. `request.formData()` já
     * materializou o multipart, mas não há motivo para criar mais uma cópia de um
     * XML que sabemos que não será lido. Os limites AGREGADOS acima continuam
     * abortando o request inteiro para proteger a memória do container.
     */
    let erroPrevalidacao: ArquivoParaImportar["erroPrevalidacao"];
    if (!nome.toLowerCase().endsWith(".xml")) {
      erroPrevalidacao = {
        code: "TIPO_NAO_ACEITO",
        motivo: `"${nome}" não é um arquivo .xml. Envie apenas XML de nota fiscal.`,
      };
    } else if (arquivo.size <= 0) {
      erroPrevalidacao = {
        code: "ARQUIVO_VAZIO",
        motivo: `"${nome}" está vazio.`,
      };
    } else if (arquivo.size > TAMANHO_MAXIMO_XML) {
      erroPrevalidacao = {
        code: "ARQUIVO_GRANDE",
        motivo: `"${nome}" tem ${(arquivo.size / 1024).toFixed(0)} KB e o limite por XML é ${TAMANHO_MAXIMO_XML / 1024} KB.`,
      };
    }

    arquivos.push({
      nome,
      origem,
      bytes: erroPrevalidacao
        ? Buffer.alloc(0)
        : Buffer.from(await arquivo.arrayBuffer()),
      erroPrevalidacao,
    });
  }

  try {
    const resumo = await importarXmlFiscal(arquivos, {
      usuarioId: sessao.userId,
      usuarioNome: sessao.nome || sessao.email,
      empresaId,
      sessaoId,
      ultimoLote,
    });

    return NextResponse.json(resumo, { status: 201 });
  } catch (falha) {
    if (falha instanceof ErroImportacaoFiscal) {
      return erro(falha.message, falha.status, falha.code);
    }
    console.error("Erro ao importar XML fiscal:", falha);
    return erro("Erro interno ao importar os arquivos.", 500);
  }
}
