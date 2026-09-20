/**
 * GET /api/fiscal/xml
 *
 * Lista os documentos fiscais importados, paginada e filtrada. É a tabela de notas
 * da tela de Faturamento (XML).
 *
 * Formato da resposta espelha `api/tarefas/apuracao/route.ts`:
 * `{ documentos, pagination: { total, page, limit, totalPages } }`.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireInterno } from "@/lib/api-guard";
import prisma from "@/lib/prisma";
import { carregarMapaSerieCanal, resolverCanal } from "@/lib/faturamento-consulta";
import { SEM_SERIE_MAPEADA, ehCanalValido, normalizarSerie } from "@/lib/faturamento-canais";
import {
  MOTIVO_EXCLUSAO,
  MOTIVO_EXCLUSAO_LABEL,
  type MotivoExclusao,
} from "@/lib/faturamento-regras";
import { parseCompetencia } from "@/lib/tarefa-status";

export const runtime = "nodejs";

const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 100;

const SITUACOES = ["AUTORIZADA", "CANCELADA", "DENEGADA"];

const erro = (mensagem: string, status: number, code?: string) =>
  NextResponse.json({ error: mensagem, code }, { status });

function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo ? limpo : null;
}

export async function GET(req: NextRequest) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  const { searchParams } = new URL(req.url);

  const empresaId = texto(searchParams.get("empresaId"));
  if (!empresaId) return erro("Informe a empresa.", 400, "EMPRESA_OBRIGATORIA");

  const competenciaParam = texto(searchParams.get("competencia"));
  const competencia = competenciaParam ? parseCompetencia(competenciaParam) : null;
  if (competenciaParam && !competencia) {
    return erro("Competência inválida. Use o formato AAAA-MM.", 400, "COMPETENCIA_INVALIDA");
  }

  const situacao = texto(searchParams.get("situacao"));
  if (situacao && !SITUACOES.includes(situacao)) {
    return erro("Situação inválida.", 400, "SITUACAO_INVALIDA");
  }

  const canal = texto(searchParams.get("canal"));
  if (canal && canal !== SEM_SERIE_MAPEADA && !ehCanalValido(canal)) {
    return erro("Canal inválido.", 400, "CANAL_INVALIDO");
  }

  const contaParam = texto(searchParams.get("conta"));
  const motivoExclusao = texto(searchParams.get("motivoExclusao"));
  if (
    motivoExclusao &&
    !(Object.values(MOTIVO_EXCLUSAO) as string[]).includes(motivoExclusao)
  ) {
    return erro("Motivo de exclusão inválido.", 400, "MOTIVO_INVALIDO");
  }
  const busca = texto(searchParams.get("busca"));

  const pageRaw = Number(searchParams.get("page") ?? 1);
  const limitRaw = Number(searchParams.get("limit") ?? LIMITE_PADRAO);
  if (!Number.isInteger(pageRaw) || pageRaw < 1) {
    return erro("Página inválida.", 400, "PAGINA_INVALIDA");
  }
  if (!Number.isInteger(limitRaw) || limitRaw < 1) {
    return erro("Limite inválido.", 400, "LIMITE_INVALIDO");
  }
  const page = pageRaw;
  const limit = Math.min(LIMITE_MAXIMO, limitRaw);
  const skip = (page - 1) * limit;

  const mapa = await carregarMapaSerieCanal(empresaId);

  const where: Prisma.DocumentoFiscalWhereInput = { empresaId };

  if (competencia) {
    where.ano = competencia.ano;
    where.mes = competencia.mes;
  }
  if (situacao) where.situacao = situacao;
  if (contaParam === "sim") where.contaFaturamento = true;
  if (contaParam === "nao") where.contaFaturamento = false;
  if (motivoExclusao) where.motivoExclusao = motivoExclusao;
  if (texto(searchParams.get("conferencia")) === "sim") where.precisaConferencia = true;

  /*
   * Filtro por canal traduzido para SÉRIE.
   *
   * O canal não é coluna: é derivado da série pelo mapa que o escritório declara.
   * Traduzir aqui mantém a paginação correta — filtrar em memória depois do `take`
   * devolveria "50 registros" com menos de 50 linhas visíveis, e o total da
   * paginação passaria a não ter relação com o que a tela mostra.
   */
  if (canal) {
    const seriesDoCanal = [...mapa.entries()]
      .filter(([, valor]) => valor === canal)
      .map(([serie]) => serie);

    if (canal === SEM_SERIE_MAPEADA) {
      const mapeadas = [...mapa.keys()];
      // `notIn` de lista vazia é sempre verdadeiro, que é o certo: sem nenhuma
      // série mapeada, TODA nota está sem série mapeada.
      where.serie = mapeadas.length > 0 ? { notIn: mapeadas } : undefined;
    } else if (seriesDoCanal.length === 0) {
      // Canal existe no vocabulário mas nenhuma série aponta para ele: o resultado
      // é vazio de verdade, e devolver vazio é mais honesto que ignorar o filtro.
      return NextResponse.json({
        documentos: [],
        pagination: { total: 0, page: 1, limit, totalPages: 1 },
      });
    } else {
      where.serie = { in: seriesDoCanal };
    }
  }

  if (busca) {
    const digitos = busca.replace(/\D/g, "");
    const alternativas: Prisma.DocumentoFiscalWhereInput[] = [
      { nomeDestinatario: { contains: busca, mode: "insensitive" } },
      { nomeEmitente: { contains: busca, mode: "insensitive" } },
      { naturezaOperacao: { contains: busca, mode: "insensitive" } },
    ];

    if (digitos.length >= 3) {
      alternativas.push({ chave: { contains: digitos } });
      alternativas.push({ pedidoMarketplace: { contains: digitos } });
      alternativas.push({ documentoDestinatario: { contains: digitos } });
      const comoNumero = Number(digitos);
      if (Number.isSafeInteger(comoNumero)) {
        alternativas.push({ numero: comoNumero });
      }
    }

    where.OR = alternativas;
  }

  const [linhas, total] = await Promise.all([
    prisma.documentoFiscal.findMany({
      where,
      orderBy: [{ emitidoEm: "desc" }, { numero: "desc" }],
      skip,
      take: limit,
      select: {
        id: true,
        chave: true,
        modelo: true,
        serie: true,
        numero: true,
        emitidoEm: true,
        situacao: true,
        valorTotal: true,
        cfops: true,
        nomeDestinatario: true,
        documentoDestinatario: true,
        tipoDocumentoDestinatario: true,
        contaFaturamento: true,
        motivoExclusao: true,
        precisaConferencia: true,
        pedidoMarketplace: true,
        canceladoEm: true,
      },
    }),
    prisma.documentoFiscal.count({ where }),
  ]);

  const documentos = linhas.map((linha) => ({
    ...linha,
    valorTotal: Number(linha.valorTotal),
    serie: normalizarSerie(linha.serie),
    canal: resolverCanal(linha.serie, mapa),
    /** CFOP principal, para a coluna. A lista inteira vai junto para o detalhe. */
    cfop: linha.cfops[0] ?? null,
    motivoExclusaoLabel: linha.motivoExclusao
      ? MOTIVO_EXCLUSAO_LABEL[linha.motivoExclusao as MotivoExclusao] ?? linha.motivoExclusao
      : null,
  }));

  return NextResponse.json({
    documentos,
    pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}
