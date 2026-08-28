/**
 * Log de alterações do módulo de tarefas, filtrável e paginado.
 *
 * GET /api/tarefas/log
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seções 13.3 e 16.4.
 *
 * Mesma estrutura de `src/app/api/admin/auditoria-documentos/route.ts`: filtros
 * por querystring, `{logs, pagination}` na resposta, mais recente primeiro. O
 * CONTAZOOM já tem essa tela para documentos, e a de tarefas é a mesma tela com
 * outra fonte — inventar um segundo formato obrigaria a escrever um segundo
 * componente de auditoria.
 *
 * Somente leitura. `tarefa_log` é append-only: não existe PATCH nem DELETE aqui
 * nem em nenhuma outra rota, porque log editável não é prova de nada.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireInterno } from "@/lib/api-guard";

const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 200;

export async function GET(req: NextRequest) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  try {
    const { searchParams } = new URL(req.url);

    const apuracaoId = searchParams.get("apuracaoId");
    const processoId = searchParams.get("processoId");
    const autorId = searchParams.get("autorId");
    const acao = searchParams.get("acao");
    const empresaId = searchParams.get("empresaId");
    const dataInicio = searchParams.get("dataInicio");
    const dataFim = searchParams.get("dataFim");

    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const limitBruto =
      Number(searchParams.get("limit") ?? String(LIMITE_PADRAO)) ||
      LIMITE_PADRAO;
    const limit = Math.min(LIMITE_MAXIMO, Math.max(1, limitBruto));
    const skip = (page - 1) * limit;

    const where: Prisma.TarefaLogWhereInput = {};

    if (apuracaoId) where.apuracaoId = apuracaoId;
    if (processoId) where.processoId = processoId;
    if (autorId) where.autorId = autorId;
    if (acao) where.acao = acao;

    // A empresa está no pai, não no log: um evento pertence a uma apuração ou a
    // um processo de legalização, e os dois apontam para a empresa.
    if (empresaId) {
      where.OR = [
        { apuracao: { empresaId } },
        { processo: { empresaId } },
      ];
    }

    if (dataInicio || dataFim) {
      const intervalo: Prisma.DateTimeFilter = {};
      if (dataInicio) {
        const inicio = new Date(dataInicio);
        if (Number.isNaN(inicio.getTime())) {
          return NextResponse.json(
            { error: "Data inicial inválida.", code: "data_invalida" },
            { status: 400 }
          );
        }
        inicio.setHours(0, 0, 0, 0);
        intervalo.gte = inicio;
      }
      if (dataFim) {
        const fim = new Date(dataFim);
        if (Number.isNaN(fim.getTime())) {
          return NextResponse.json(
            { error: "Data final inválida.", code: "data_invalida" },
            { status: 400 }
          );
        }
        fim.setHours(23, 59, 59, 999);
        intervalo.lte = fim;
      }
      where.createdAt = intervalo;
    }

    const [logs, total] = await Promise.all([
      prisma.tarefaLog.findMany({
        where,
        include: {
          // O autor congelado (`autorNome`, `autorPapel`) já vem na própria linha;
          // o join serve só para a tela poder linkar o usuário quando ele ainda
          // existe. Quem saiu da empresa continua nomeado no log.
          autor: { select: { id: true, name: true, email: true, role: true } },
          apuracao: {
            select: {
              id: true,
              ano: true,
              mes: true,
              regime: true,
              status: true,
              empresa: {
                select: {
                  id: true,
                  cnpj: true,
                  razaoSocial: true,
                  nomeFantasia: true,
                },
              },
            },
          },
          processo: {
            select: {
              id: true,
              tipo: true,
              status: true,
              identificacaoProvisoria: true,
              empresa: {
                select: {
                  id: true,
                  cnpj: true,
                  razaoSocial: true,
                  nomeFantasia: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.tarefaLog.count({ where }),
    ]);

    return NextResponse.json({
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Erro ao buscar log de tarefas:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}
