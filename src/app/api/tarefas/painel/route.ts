/**
 * KPIs do painel de tarefas.
 *
 * GET /api/tarefas/painel?competencia=AAAA-MM
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seções 15.3 e 16.4.
 *
 * Tudo agregado no banco, com `count` e `groupBy`. Trazer as tarefas para a
 * memória e contar em JavaScript funcionaria com 31 clientes e passaria a ser o
 * gargalo da tela inicial no dia em que a carteira crescer — e é a primeira tela
 * que todo mundo abre.
 *
 * Sem `competencia`, usa a competência ANTERIOR: a apuração de janeiro é feita em
 * fevereiro, então o mês que interessa em fevereiro é janeiro.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireInterno } from "@/lib/api-guard";
import {
  PLANOS_QUE_GERAM_COMPETENCIA,
  REGIMES_VALIDOS,
} from "@/lib/tarefa-etapas";
import {
  STATUS_VALIDOS,
  competenciaAnterior,
  competenciaLabel,
  diasEmBloqueio,
  parseCompetencia,
} from "@/lib/tarefa-status";

export async function GET(req: NextRequest) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  try {
    const { searchParams } = new URL(req.url);
    const informada = searchParams.get("competencia");

    let ano: number;
    let mes: number;
    if (informada) {
      const parsed = parseCompetencia(informada);
      if (!parsed) {
        return NextResponse.json(
          {
            error: "Competência inválida. Use o formato AAAA-MM.",
            code: "competencia_invalida",
          },
          { status: 400 }
        );
      }
      ano = parsed.ano;
      mes = parsed.mes;
    } else {
      const anterior = competenciaAnterior();
      ano = anterior.ano;
      mes = anterior.mes;
    }

    const daCompetencia: Prisma.TarefaApuracaoWhereInput = { ano, mes };

    const hoje = new Date();
    const inicioDeHoje = new Date(
      Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate())
    );

    const [
      competenciasAbertas,
      empresasAtivas,
      emAndamento,
      bloqueadas,
      atrasadas,
      concluidas,
      porStatusBruto,
      porRegimeBruto,
      bloqueiosAbertos,
    ] = await Promise.all([
      prisma.tarefaApuracao.count({ where: daCompetencia }),
      // Empresas que geram trabalho todo mês: mesmo critério de `abrir-mes`, que
      // agora é o plano interno (Simples ou Presumido) mais ter CNPJ. Se este
      // número divergisse de lá, o painel diria "12 empresas ativas" e a abertura
      // criaria 9 competências, sem explicação.
      prisma.empresa.count({
        where: {
          planoInterno: { in: PLANOS_QUE_GERAM_COMPETENCIA },
          cnpj: { not: null },
        },
      }),
      // Em andamento = tem trabalho para fazer agora: nem encerrada, nem travada.
      prisma.tarefaApuracao.count({
        where: { ...daCompetencia, concluidaEm: null, bloqueada: false },
      }),
      prisma.tarefaApuracao.count({
        where: { ...daCompetencia, bloqueada: true, concluidaEm: null },
      }),
      prisma.tarefaApuracao.count({
        where: {
          ...daCompetencia,
          concluidaEm: null,
          prazoEntrega: { lt: inicioDeHoje },
        },
      }),
      prisma.tarefaApuracao.count({
        where: { ...daCompetencia, concluidaEm: { not: null } },
      }),
      prisma.tarefaApuracao.groupBy({
        by: ["status"],
        where: daCompetencia,
        _count: { _all: true },
      }),
      prisma.tarefaApuracao.groupBy({
        by: ["regime"],
        where: daCompetencia,
        _count: { _all: true },
      }),
      // Só as datas das tarefas travadas, para a média de dias do cartão de
      // bloqueio. Postgres não faz média de intervalo de data por aqui sem SQL
      // cru, e o conjunto é pequeno por definição: bloqueio é exceção.
      prisma.tarefaApuracao.findMany({
        where: { ...daCompetencia, bloqueada: true, concluidaEm: null },
        select: { bloqueioDesde: true },
      }),
    ]);

    // Todas as chaves presentes com zero: gráfico e coluna de Kanban que somem
    // quando o valor é zero fazem a tela mudar de forma a cada filtro.
    const porStatus: Record<string, number> = {};
    for (const status of STATUS_VALIDOS) porStatus[status] = 0;
    for (const linha of porStatusBruto) {
      porStatus[linha.status] = linha._count._all;
    }

    const porRegime: Record<string, number> = {};
    for (const regime of REGIMES_VALIDOS) porRegime[regime] = 0;
    for (const linha of porRegimeBruto) {
      porRegime[linha.regime] = linha._count._all;
    }

    const dias = bloqueiosAbertos
      .map((t) => diasEmBloqueio(t.bloqueioDesde, hoje))
      .filter((d): d is number => d !== null);
    const mediaDiasBloqueio = dias.length
      ? Math.round(dias.reduce((soma, d) => soma + d, 0) / dias.length)
      : 0;

    return NextResponse.json({
      competencia: {
        ano,
        mes,
        chave: `${ano}-${String(mes).padStart(2, "0")}`,
        label: competenciaLabel(ano, mes),
      },
      competenciasAbertas,
      empresasAtivas,
      emAndamento,
      bloqueadas,
      atrasadas,
      concluidas,
      mediaDiasBloqueio,
      porStatus,
      porRegime,
    });
  } catch (error) {
    console.error("Erro ao montar painel de tarefas:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}
