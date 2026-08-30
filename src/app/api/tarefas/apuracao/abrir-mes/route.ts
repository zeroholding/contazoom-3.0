/**
 * Abertura do mês: cria a competência para as empresas com plano ativo.
 *
 * POST /api/tarefas/apuracao/abrir-mes
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seções 16.5 e 17.
 *
 * Sem corpo, abre a competência ANTERIOR: a apuração de janeiro é feita em
 * fevereiro. É a rotina mensal, e o botão manual existe porque cron falha e
 * ninguém pode esperar o mês seguinte para trabalhar.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { PAPEL, requirePapel } from "@/lib/api-guard";
import { criarApuracao } from "@/lib/tarefa-service";
import {
  PLANOS_QUE_GERAM_COMPETENCIA,
  REGIMES_VALIDOS,
} from "@/lib/tarefa-etapas";
import { competenciaAnterior, competenciaLabel } from "@/lib/tarefa-status";

type CorpoAbrirMes = { ano?: unknown; mes?: unknown };

type Falha = {
  empresaId: string;
  cnpj: string;
  razaoSocial: string;
  erro: string;
};

export async function POST(req: NextRequest) {
  // Abrir o mês cria trabalho para a carteira inteira. Assistente não faz isso.
  const sessao = await requirePapel(req, [
    PAPEL.ADMIN,
    PAPEL.COMERCIAL,
    PAPEL.CONTABIL,
  ]);
  if (sessao instanceof NextResponse) return sessao;

  try {
    const { searchParams } = new URL(req.url);
    const dryRun =
      searchParams.get("dryRun") === "1" ||
      searchParams.get("dryRun") === "true";

    const corpo = (await req.json().catch(() => null)) as CorpoAbrirMes | null;

    let ano: number;
    let mes: number;
    if (corpo && corpo.ano !== undefined && corpo.mes !== undefined) {
      ano = Number(corpo.ano);
      mes = Number(corpo.mes);
      if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
        return NextResponse.json(
          { error: "Ano inválido.", code: "ano_invalido" },
          { status: 400 }
        );
      }
      if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
        return NextResponse.json(
          {
            error: "Mês inválido. Use um valor de 1 a 12.",
            code: "mes_invalido",
          },
          { status: 400 }
        );
      }
    } else {
      const anterior = competenciaAnterior();
      ano = anterior.ano;
      mes = anterior.mes;
    }

    const competencia = {
      ano,
      mes,
      chave: `${ano}-${String(mes).padStart(2, "0")}`,
      label: competenciaLabel(ano, mes),
    };

    /**
     * Quem gera competência é o PLANO INTERNO, não mais a situação.
     *
     * Plano Simples e Plano Presumido geram; Standby e "sem plano — suspensa" não.
     * Standby é cliente parado que paga só para manter o cadastro, e sem plano é
     * cliente que saiu: abrir competência para os dois criaria 12 tarefas por ano
     * que ninguém trabalha e que sujariam todo indicador de atraso do painel.
     *
     * O CNPJ nulo também exclui, e por um motivo diferente: empresa em abertura
     * não tem número para apurar. Antes isso vinha de graça porque `situacao` era
     * EM_ABERTURA; agora é explícito, porque plano e CNPJ são independentes — dá
     * para ter uma empresa em abertura já contratada no Plano Presumido.
     */
    const empresas = await prisma.empresa.findMany({
      where: {
        planoInterno: { in: PLANOS_QUE_GERAM_COMPETENCIA },
        cnpj: { not: null },
      },
      select: {
        id: true,
        cnpj: true,
        razaoSocial: true,
        regime: true,
        tributoLocal: true,
        responsavelId: true,
      },
      orderBy: { razaoSocial: "asc" },
    });

    const jaAbertas = await prisma.tarefaApuracao.findMany({
      where: { ano, mes, empresaId: { in: empresas.map((e) => e.id) } },
      select: { empresaId: true },
    });
    const conjuntoJaAberto = new Set(jaAbertas.map((t) => t.empresaId));

    if (dryRun) {
      const criaria = empresas.filter(
        (e) => !conjuntoJaAberto.has(e.id) && REGIMES_VALIDOS.includes(e.regime)
      );
      const invalidas: Falha[] = empresas
        .filter(
          (e) =>
            !conjuntoJaAberto.has(e.id) && !REGIMES_VALIDOS.includes(e.regime)
        )
        .map((e) => ({
          empresaId: e.id,
          // O `where` já exclui CNPJ nulo, mas o tipo do Prisma não sabe disso.
          // `?? ""` em vez de `!`: se um dia o filtro mudar, o relatório mostra
          // um CNPJ vazio em vez de explodir na renderização.
          cnpj: e.cnpj ?? "",
          razaoSocial: e.razaoSocial,
          erro: `Regime inválido no cadastro: ${e.regime}`,
        }));

      return NextResponse.json({
        dryRun: true,
        competencia,
        empresasAtivas: empresas.length,
        criadas: criaria.length,
        jaExistiam: conjuntoJaAberto.size,
        falhas: invalidas,
        criaria: criaria.map((e) => ({
          empresaId: e.id,
          cnpj: e.cnpj ?? "",
          razaoSocial: e.razaoSocial,
          regime: e.regime,
        })),
      });
    }

    let criadas = 0;
    let jaExistiam = 0;
    const falhas: Falha[] = [];

    // Uma transação POR EMPRESA, em série.
    //
    // Não é uma transação gigante de propósito: com 31 empresas, uma empresa com
    // regime corrompido no cadastro derrubaria a abertura das outras 30, e o
    // operador ficaria sem nenhuma competência aberta por causa de um cadastro
    // errado. Cada empresa é uma unidade de trabalho independente — o que precisa
    // ser atômico é "tarefa + etapas + log" de UMA competência.
    //
    // Em série, e não Promise.all: 31 transações simultâneas esgotam o pool de
    // conexões do Postgres, e abrir o mês é operação de uma vez por mês, não de
    // caminho crítico.
    for (const empresa of empresas) {
      if (conjuntoJaAberto.has(empresa.id)) {
        jaExistiam += 1;
        continue;
      }
      if (!REGIMES_VALIDOS.includes(empresa.regime)) {
        falhas.push({
          empresaId: empresa.id,
          cnpj: empresa.cnpj ?? "",
          razaoSocial: empresa.razaoSocial,
          erro: `Regime inválido no cadastro: ${empresa.regime}`,
        });
        continue;
      }

      try {
        await prisma.$transaction((tx) =>
          criarApuracao(tx, {
            empresa,
            ano,
            mes,
            sessao,
            // Herda o responsável da empresa, quando houver: a carteira já tem
            // dono, e obrigar a redistribuir 31 tarefas todo mês é trabalho
            // inventado.
            responsavelId: empresa.responsavelId,
          })
        );
        criadas += 1;
      } catch (error) {
        // P2002 = violação do unique (empresaId, ano, mes).
        //
        // É a idempotência de verdade. A leitura acima resolve o caso comum, mas
        // dois operadores clicando ao mesmo tempo passam os dois pela leitura. O
        // banco recusa a segunda, e recusa é a resposta correta: a competência
        // existe, que é exatamente o que se queria. Contar como "já existia" e
        // seguir, em vez de abortar o lote inteiro.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          jaExistiam += 1;
          continue;
        }
        falhas.push({
          empresaId: empresa.id,
          cnpj: empresa.cnpj ?? "",
          razaoSocial: empresa.razaoSocial,
          erro: error instanceof Error ? error.message : "Erro desconhecido",
        });
      }
    }

    return NextResponse.json({
      competencia,
      empresasAtivas: empresas.length,
      criadas,
      jaExistiam,
      falhas,
    });
  } catch (error) {
    console.error("Erro ao abrir o mês:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}
