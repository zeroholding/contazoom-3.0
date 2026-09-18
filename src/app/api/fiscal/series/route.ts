/**
 * GET/PUT /api/fiscal/series?empresaId=
 *
 * O mapa série da nota -> canal de venda.
 *
 * POR QUE ISTO É CONFIGURAÇÃO E NÃO DADO: a NF-e não tem campo de marketplace.
 * O canal é convenção do emissor, que reserva uma série por canal. Deduzir do nome
 * do arquivo ou do CFOP erraria em silêncio, então o escritório DECLARA e a tela
 * mostra um dado que alguém afirmou.
 *
 * O GET devolve também as séries que APARECEM nos documentos e ainda não foram
 * mapeadas. Sem isso, configurar exigiria adivinhar quais séries o cliente usa —
 * e é justamente a informação que o sistema já tem.
 */

import { NextRequest, NextResponse } from "next/server";
import { PAPEL, requirePapel, requireInterno } from "@/lib/api-guard";
import prisma from "@/lib/prisma";
import { CANAIS_ORDEM, CANAL_LABEL, ehCanalValido, normalizarSerie } from "@/lib/faturamento-canais";

export const runtime = "nodejs";

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

  const empresaId = texto(new URL(req.url).searchParams.get("empresaId"));
  if (!empresaId) return erro("Informe a empresa.", 400, "EMPRESA_OBRIGATORIA");

  const [mapeadas, encontradas] = await Promise.all([
    prisma.empresaSerieCanal.findMany({
      where: { empresaId },
      orderBy: { serie: "asc" },
      select: { id: true, serie: true, canal: true },
    }),
    prisma.documentoFiscal.groupBy({
      by: ["serie"],
      where: { empresaId },
      _count: { _all: true },
    }),
  ]);

  const jaMapeadas = new Set(mapeadas.map((linha) => normalizarSerie(linha.serie)));

  return NextResponse.json({
    series: mapeadas.map((linha) => ({
      ...linha,
      serie: normalizarSerie(linha.serie),
      canalLabel: CANAL_LABEL[linha.canal as keyof typeof CANAL_LABEL] ?? linha.canal,
    })),
    /** Séries que existem em nota e ninguém declarou. É a lista de pendências. */
    naoMapeadas: encontradas
      .map((grupo) => ({ serie: normalizarSerie(grupo.serie), notas: grupo._count._all }))
      .filter((item) => !jaMapeadas.has(item.serie))
      .sort((a, b) => b.notas - a.notas),
    canaisDisponiveis: CANAIS_ORDEM.map((canal) => ({ valor: canal, texto: CANAL_LABEL[canal] })),
  });
}

/**
 * PUT substitui o mapa inteiro da empresa.
 *
 * Substituição e não merge: o mapa é pequeno (uma série, na base real) e a tela
 * edita a lista toda de uma vez. Merge exigiria a tela informar o que REMOVER, e
 * "remover" num merge implícito é a operação que ninguém acerta na primeira vez.
 *
 * Exige ADMIN ou CONTABIL: mudar o mapa reclassifica o canal de todo o histórico
 * da empresa na tela.
 */
export async function PUT(req: NextRequest) {
  const sessao = await requirePapel(req, [PAPEL.ADMIN, PAPEL.CONTABIL]);
  if (sessao instanceof NextResponse) return sessao;

  const corpo = await req.json().catch(() => null);
  if (!corpo || typeof corpo !== "object") {
    return erro("Corpo inválido.", 400, "CORPO_INVALIDO");
  }

  const { empresaId, series } = corpo as { empresaId?: unknown; series?: unknown };

  const empresa = texto(empresaId);
  if (!empresa) return erro("Informe a empresa.", 400, "EMPRESA_OBRIGATORIA");

  if (!Array.isArray(series)) {
    return erro("Informe a lista de séries.", 400, "SERIES_OBRIGATORIAS");
  }

  const normalizadas: Array<{ serie: string; canal: string }> = [];
  const vistas = new Set<string>();

  for (const item of series) {
    if (!item || typeof item !== "object") {
      return erro("Cada série precisa de série e canal.", 400, "SERIE_INVALIDA");
    }
    const { serie, canal } = item as { serie?: unknown; canal?: unknown };

    const serieLimpa = normalizarSerie(serie);
    if (!serieLimpa) {
      return erro("Série vazia.", 400, "SERIE_INVALIDA");
    }
    if (serieLimpa.length > 3) {
      return erro(`Série "${serieLimpa}" tem mais de 3 caracteres.`, 400, "SERIE_INVALIDA");
    }
    if (!ehCanalValido(canal)) {
      return erro(`Canal inválido para a série ${serieLimpa}.`, 400, "CANAL_INVALIDO");
    }

    // Duas linhas para a mesma série fariam a mesma nota ser contada em dois
    // canais, e o total por canal deixaria de fechar com o total da competência.
    if (vistas.has(serieLimpa)) {
      return erro(`A série ${serieLimpa} aparece mais de uma vez.`, 400, "SERIE_DUPLICADA");
    }
    vistas.add(serieLimpa);

    normalizadas.push({ serie: serieLimpa, canal });
  }

  try {
    await prisma.$transaction([
      prisma.empresaSerieCanal.deleteMany({ where: { empresaId: empresa } }),
      ...normalizadas.map((item) =>
        prisma.empresaSerieCanal.create({
          data: { empresaId: empresa, serie: item.serie, canal: item.canal },
        }),
      ),
    ]);

    return NextResponse.json({ series: normalizadas });
  } catch (falha) {
    console.error("Erro ao salvar mapa de séries:", falha);
    return erro("Erro interno ao salvar o mapa de séries.", 500);
  }
}
