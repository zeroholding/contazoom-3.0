/**
 * Lista e criação de competências de apuração.
 *
 * GET  /api/tarefas/apuracao — a consulta que alimenta o Kanban e a lista
 * POST /api/tarefas/apuracao — abre UMA competência para UMA empresa
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seção 16.2.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { PAPEL, requireInterno, requirePapel } from "@/lib/api-guard";
import { criarApuracao } from "@/lib/tarefa-service";
import {
  REGIMES_VALIDOS,
  SITUACAO_ETAPA,
  totalEtapasApuracao,
} from "@/lib/tarefa-etapas";
import {
  DIAS_ALERTA_PRAZO,
  STATUS_VALIDOS,
  contagemPrazo,
  diasEmBloqueio,
  parseCompetencia,
  situacaoPrazo,
} from "@/lib/tarefa-status";

const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 100;

/** Meia-noite UTC do dia de referência. Prazo é "dia 20", não "dia 20 às 00h". */
function inicioDoDiaUTC(referencia = new Date()): Date {
  return new Date(
    Date.UTC(
      referencia.getUTCFullYear(),
      referencia.getUTCMonth(),
      referencia.getUTCDate()
    )
  );
}

export async function GET(req: NextRequest) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  try {
    const { searchParams } = new URL(req.url);

    const competencia = searchParams.get("competencia");
    const regime = searchParams.get("regime");
    const status = searchParams.get("status");
    const responsavelId = searchParams.get("responsavelId");
    const bloqueada = searchParams.get("bloqueada");
    const prazo = searchParams.get("prazo");
    const empresaId = searchParams.get("empresaId");
    const busca = searchParams.get("busca")?.trim();

    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const limitBruto =
      Number(searchParams.get("limit") ?? String(LIMITE_PADRAO)) ||
      LIMITE_PADRAO;
    const limit = Math.min(LIMITE_MAXIMO, Math.max(1, limitBruto));
    const skip = (page - 1) * limit;

    const where: Prisma.TarefaApuracaoWhereInput = {};

    if (competencia) {
      const parsed = parseCompetencia(competencia);
      if (!parsed) {
        return NextResponse.json(
          {
            error: "Competência inválida. Use o formato AAAA-MM.",
            code: "competencia_invalida",
          },
          { status: 400 }
        );
      }
      where.ano = parsed.ano;
      where.mes = parsed.mes;
    }

    if (regime) {
      if (!REGIMES_VALIDOS.includes(regime)) {
        return NextResponse.json(
          { error: "Regime inválido.", code: "regime_invalido" },
          { status: 400 }
        );
      }
      where.regime = regime;
    }

    if (status) {
      if (!STATUS_VALIDOS.includes(status)) {
        return NextResponse.json(
          { error: "Status inválido.", code: "status_invalido" },
          { status: 400 }
        );
      }
      where.status = status;
    }

    if (responsavelId) where.responsavelId = responsavelId;
    if (empresaId) where.empresaId = empresaId;
    if (bloqueada === "true") where.bloqueada = true;
    if (bloqueada === "false") where.bloqueada = false;

    if (prazo === "atrasado" || prazo === "vence_breve") {
      // Tarefa concluída não atrasa nem vence: o prazo já foi cumprido ou
      // perdido, e manter no filtro de cobrança poluiria a lista de ação.
      where.concluidaEm = null;
      const hoje = inicioDoDiaUTC();
      if (prazo === "atrasado") {
        where.prazoEntrega = { lt: hoje };
      } else {
        const limiteAlerta = new Date(hoje);
        limiteAlerta.setUTCDate(limiteAlerta.getUTCDate() + DIAS_ALERTA_PRAZO);
        limiteAlerta.setUTCHours(23, 59, 59, 999);
        where.prazoEntrega = { gte: hoje, lte: limiteAlerta };
      }
    }

    if (busca) {
      const digitos = busca.replace(/\D/g, "");
      const alternativas: Prisma.EmpresaWhereInput[] = [
        { razaoSocial: { contains: busca, mode: "insensitive" } },
        { nomeFantasia: { contains: busca, mode: "insensitive" } },
      ];
      if (digitos.length >= 3) {
        alternativas.push({ cnpj: { contains: digitos } });
      }
      where.empresa = { OR: alternativas };
    }

    const [tarefas, total] = await Promise.all([
      prisma.tarefaApuracao.findMany({
        where,
        select: {
          id: true,
          ano: true,
          mes: true,
          regime: true,
          etapaAtual: true,
          status: true,
          bloqueada: true,
          bloqueioMotivo: true,
          bloqueioDesde: true,
          bloqueioResponsavel: true,
          prazoEntrega: true,
          iniciadaEm: true,
          concluidaEm: true,
          responsavelId: true,
          observacoes: true,
          updatedAt: true,
          empresa: {
            select: {
              id: true,
              razaoSocial: true,
              nomeFantasia: true,
              cnpj: true,
              regime: true,
              planoInterno: true,
            },
          },
          responsavel: { select: { id: true, name: true, email: true } },
          // Contagem, não a lista: o cartão só precisa mostrar "3 anexos", e
          // trazer trinta linhas de metadado por cartão para exibir um número
          // seria carregar a página inteira à toa.
          _count: { select: { anexos: true } },
        },
        orderBy: [
          { ano: "desc" },
          { mes: "desc" },
          { empresa: { razaoSocial: "asc" } },
        ],
        skip,
        take: limit,
      }),
      prisma.tarefaApuracao.count({ where }),
    ]);

    // Uma consulta para as etapas da página inteira, em vez de uma por tarefa.
    // O título vem da linha materializada e não da definição do fluxo: é o texto
    // congelado na criação, o único que descreve o trabalho realmente feito.
    const ids = tarefas.map((t) => t.id);
    const etapas = ids.length
      ? await prisma.tarefaApuracaoEtapa.findMany({
          where: { tarefaId: { in: ids } },
          select: {
            tarefaId: true,
            numero: true,
            titulo: true,
            situacao: true,
          },
        })
      : [];

    type ResumoEtapas = {
      total: number;
      concluidas: number;
      tituloAtual: string | null;
    };
    const porTarefa = new Map<string, ResumoEtapas>();
    for (const etapa of etapas) {
      const atual =
        porTarefa.get(etapa.tarefaId) ??
        ({ total: 0, concluidas: 0, tituloAtual: null } as ResumoEtapas);
      atual.total += 1;
      if (
        etapa.situacao === SITUACAO_ETAPA.CONCLUIDA ||
        etapa.situacao === SITUACAO_ETAPA.NAO_APLICAVEL
      ) {
        atual.concluidas += 1;
      }
      porTarefa.set(etapa.tarefaId, atual);
    }
    for (const etapa of etapas) {
      const tarefa = tarefas.find((t) => t.id === etapa.tarefaId);
      if (tarefa && tarefa.etapaAtual === etapa.numero) {
        const resumo = porTarefa.get(etapa.tarefaId);
        if (resumo) resumo.tituloAtual = etapa.titulo;
      }
    }

    const agora = new Date();
    const lista = tarefas.map((tarefa) => {
      const resumo = porTarefa.get(tarefa.id);
      const totalEtapas = resumo?.total ?? totalEtapasApuracao(tarefa.regime);
      const prazoInfo = situacaoPrazo(
        tarefa.prazoEntrega,
        Boolean(tarefa.concluidaEm),
        agora
      );
      return {
        id: tarefa.id,
        ano: tarefa.ano,
        mes: tarefa.mes,
        competencia: `${tarefa.ano}-${String(tarefa.mes).padStart(2, "0")}`,
        regime: tarefa.regime,
        status: tarefa.status,
        etapaAtual: tarefa.etapaAtual,
        totalEtapas,
        etapasConcluidas: resumo?.concluidas ?? 0,
        tituloEtapaAtual: resumo?.tituloAtual ?? null,
        empresa: tarefa.empresa,
        responsavel: tarefa.responsavel,
        prazoEntrega: tarefa.prazoEntrega,
        prazo: { situacao: prazoInfo.situacao, dias: prazoInfo.dias },
        // Dias úteis e corridos calculados no SERVIDOR, e não na tela.
        //
        // O escritório usa as duas contagens: corridos é o que o cliente cobra
        // ("faz 15 dias que mandei"), úteis é o que dá para trabalhar. Vindo de
        // cá, a lista, o cartão e o detalhe mostram o mesmo número — feito no
        // cliente, cada tela dependeria do relógio e do fuso da máquina de quem
        // olha, e dois operadores veriam prazos diferentes para a mesma tarefa.
        contagemPrazo: contagemPrazo(
          tarefa.prazoEntrega,
          Boolean(tarefa.concluidaEm),
          agora
        ),
        bloqueada: tarefa.bloqueada,
        bloqueioMotivo: tarefa.bloqueioMotivo,
        bloqueioResponsavel: tarefa.bloqueioResponsavel,
        bloqueioDesde: tarefa.bloqueioDesde,
        diasEmBloqueio: tarefa.bloqueada
          ? diasEmBloqueio(tarefa.bloqueioDesde, agora)
          : null,
        iniciadaEm: tarefa.iniciadaEm,
        concluidaEm: tarefa.concluidaEm,
        observacoes: tarefa.observacoes,
        anexos: tarefa._count.anexos,
        atualizadaEm: tarefa.updatedAt,
      };
    });

    return NextResponse.json({
      tarefas: lista,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Erro ao listar apurações:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}

/* -------------------------------------------------------------------------- */

type CorpoCriacao = {
  empresaId?: unknown;
  ano?: unknown;
  mes?: unknown;
  prazoEntrega?: unknown;
  responsavelId?: unknown;
};

export async function POST(req: NextRequest) {
  // Mesmo conjunto de papéis de `abrir-mes`: criar uma competência à mão é o
  // mesmo ato de abrir o mês, só com escopo de uma empresa.
  const sessao = await requirePapel(req, [
    PAPEL.ADMIN,
    PAPEL.COMERCIAL,
    PAPEL.CONTABIL,
  ]);
  if (sessao instanceof NextResponse) return sessao;

  try {
    const corpo = (await req.json().catch(() => null)) as CorpoCriacao | null;
    if (!corpo || typeof corpo !== "object") {
      return NextResponse.json(
        { error: "Corpo da requisição inválido." },
        { status: 400 }
      );
    }

    const empresaId =
      typeof corpo.empresaId === "string" ? corpo.empresaId.trim() : "";
    if (!empresaId) {
      return NextResponse.json(
        { error: "Informe a empresa.", code: "empresa_obrigatoria" },
        { status: 400 }
      );
    }

    const ano = Number(corpo.ano);
    const mes = Number(corpo.mes);
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
      return NextResponse.json(
        { error: "Ano inválido.", code: "ano_invalido" },
        { status: 400 }
      );
    }
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      return NextResponse.json(
        { error: "Mês inválido. Use um valor de 1 a 12.", code: "mes_invalido" },
        { status: 400 }
      );
    }

    let prazoEntrega: Date | null = null;
    if (corpo.prazoEntrega) {
      const data = new Date(String(corpo.prazoEntrega));
      if (Number.isNaN(data.getTime())) {
        return NextResponse.json(
          { error: "Prazo de entrega inválido.", code: "prazo_invalido" },
          { status: 400 }
        );
      }
      prazoEntrega = data;
    }

    const responsavelId =
      typeof corpo.responsavelId === "string" && corpo.responsavelId.trim()
        ? corpo.responsavelId.trim()
        : null;

    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: {
        id: true,
        razaoSocial: true,
        regime: true,
        tributoLocal: true,
      },
    });
    if (!empresa) {
      return NextResponse.json(
        { error: "Empresa não encontrada.", code: "empresa_nao_encontrada" },
        { status: 404 }
      );
    }
    if (!REGIMES_VALIDOS.includes(empresa.regime)) {
      return NextResponse.json(
        {
          error:
            "A empresa está com regime inválido no cadastro. Corrija o regime antes de abrir a competência.",
          code: "regime_invalido",
        },
        { status: 400 }
      );
    }

    // Verificação antes da transação para devolver 409 com mensagem boa no caso
    // comum. A trava de verdade continua sendo o unique do banco, tratado abaixo:
    // entre esta leitura e a escrita cabe outra requisição.
    const existente = await prisma.tarefaApuracao.findUnique({
      where: { empresa_competencia: { empresaId: empresa.id, ano, mes } },
      select: { id: true },
    });
    if (existente) {
      return NextResponse.json(
        {
          error: "Esta competência já foi aberta para esta empresa.",
          code: "competencia_duplicada",
          tarefaId: existente.id,
        },
        { status: 409 }
      );
    }

    const criada = await prisma.$transaction((tx) =>
      criarApuracao(tx, {
        empresa,
        ano,
        mes,
        sessao,
        prazoEntrega,
        responsavelId,
      })
    );

    return NextResponse.json({ tarefa: criada }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error: "Esta competência já foi aberta para esta empresa.",
          code: "competencia_duplicada",
        },
        { status: 409 }
      );
    }
    console.error("Erro ao criar apuração:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}
