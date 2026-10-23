import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSessao } from "@/lib/api-guard";
import { iniciarVarreduraEmails } from "@/lib/notificacoes/despacho";
import {
  STATUS_EMAIL,
  infoTipoNotificacao,
  type NotificacaoItem,
  type RespostaNotificacoes,
} from "@/lib/notificacoes/tipos";

/**
 * Sino do painel.
 *
 * GET   /api/notificacoes?limite=30  → contagem por tipo + as mais recentes
 * PATCH /api/notificacoes            → marca como lida(s)
 *   { ids: string[] }                  as escolhidas
 *   { documentoIds: string[] }         as que falam desses documentos
 *   { todas: true, tipo?: string }     todas (ou todas de um tipo)
 *
 * Sempre do usuário da sessão: nenhum parâmetro escolhe de quem são.
 */

export const runtime = "nodejs";

const LIMITE_PADRAO = 30;
const LIMITE_MAXIMO = 100;
const IDS_POR_PEDIDO = 200;

const VAZIO: RespostaNotificacoes = { naoLidas: 0, porTipo: [], itens: [] };

/**
 * Deploy no meio: o código novo pode subir segundos antes da migração. Sem a
 * tabela o sino fica vazio em vez de quebrar o cabeçalho de todas as telas.
 */
function tabelaAusente(erro: unknown): boolean {
  return typeof erro === "object" && erro !== null && (erro as { code?: string }).code === "P2021";
}

async function resumoDoUsuario(userId: string, limite: number): Promise<RespostaNotificacoes> {
  const [itens, naoLidasPorTipo] = await Promise.all([
    prisma.notificacao.findMany({
      where: { userId },
      orderBy: { criadaEm: "desc" },
      take: limite,
      select: {
        id: true,
        tipo: true,
        titulo: true,
        mensagem: true,
        link: true,
        documentoId: true,
        dados: true,
        lidaEm: true,
        criadaEm: true,
        emailStatus: true,
      },
    }),
    prisma.notificacao.groupBy({
      by: ["tipo"],
      where: { userId, lidaEm: null },
      _count: { _all: true },
    }),
  ]);

  // Tipos com não lida E tipos presentes na lista: a aba de um tipo continua
  // existindo depois que tudo nele foi lido.
  const contagem = new Map(naoLidasPorTipo.map((grupo) => [grupo.tipo, grupo._count._all]));
  for (const item of itens) if (!contagem.has(item.tipo)) contagem.set(item.tipo, 0);

  const porTipo = [...contagem.entries()]
    .map(([tipo, naoLidas]) => {
      const info = infoTipoNotificacao(tipo);
      return { tipo, rotulo: info.rotulo, rotuloCurto: info.rotuloCurto, naoLidas, ordem: info.ordem };
    })
    .sort((a, b) => a.ordem - b.ordem || a.rotulo.localeCompare(b.rotulo, "pt-BR"))
    .map((grupo) => ({
      tipo: grupo.tipo,
      rotulo: grupo.rotulo,
      rotuloCurto: grupo.rotuloCurto,
      naoLidas: grupo.naoLidas,
    }));

  return {
    naoLidas: naoLidasPorTipo.reduce((total, grupo) => total + grupo._count._all, 0),
    porTipo,
    itens: itens.map(
      (item): NotificacaoItem => ({
        id: item.id,
        tipo: item.tipo,
        titulo: item.titulo,
        mensagem: item.mensagem,
        link: item.link,
        documentoId: item.documentoId,
        dados: (item.dados as NotificacaoItem["dados"]) ?? null,
        lida: item.lidaEm !== null,
        criadaEm: item.criadaEm.toISOString(),
        emailEnviado: item.emailStatus === STATUS_EMAIL.ENVIADO,
      }),
    ),
  };
}

export async function GET(req: NextRequest) {
  const sessao = await requireSessao(req);
  if (sessao instanceof NextResponse) return sessao;

  // Garante a varredura da fila de e-mail neste processo (idempotente). Cobre
  // o caso de o servidor ter subido sem passar por `instrumentation.ts`.
  iniciarVarreduraEmails();

  const pedido = Number(req.nextUrl.searchParams.get("limite"));
  const limite = Number.isInteger(pedido) && pedido > 0 ? Math.min(pedido, LIMITE_MAXIMO) : LIMITE_PADRAO;

  try {
    const resposta = await resumoDoUsuario(sessao.userId, limite);
    return NextResponse.json(resposta, { headers: { "Cache-Control": "no-store" } });
  } catch (erro) {
    if (tabelaAusente(erro)) return NextResponse.json(VAZIO, { headers: { "Cache-Control": "no-store" } });
    console.error("[notificacoes] Erro ao listar:", erro);
    return NextResponse.json({ error: "Não foi possível carregar as notificações." }, { status: 500 });
  }
}

function listaDeTextos(valor: unknown): string[] | null {
  if (valor === undefined) return null;
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 64)
    .slice(0, IDS_POR_PEDIDO);
}

export async function PATCH(req: NextRequest) {
  const sessao = await requireSessao(req);
  if (sessao instanceof NextResponse) return sessao;

  let corpo: Record<string, unknown>;
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  if (!corpo || typeof corpo !== "object") {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const ids = listaDeTextos(corpo.ids);
  const documentoIds = listaDeTextos(corpo.documentoIds);
  const todas = corpo.todas === true;
  const tipo = typeof corpo.tipo === "string" && corpo.tipo.length <= 64 ? corpo.tipo : null;

  if (!todas && !ids?.length && !documentoIds?.length) {
    return NextResponse.json(
      { error: "Informe `ids`, `documentoIds` ou `todas: true`." },
      { status: 400 },
    );
  }

  const filtro = todas
    ? { ...(tipo ? { tipo } : {}) }
    : {
        OR: [
          ...(ids?.length ? [{ id: { in: ids } }] : []),
          ...(documentoIds?.length ? [{ documentoId: { in: documentoIds } }] : []),
        ],
      };

  try {
    const { count } = await prisma.notificacao.updateMany({
      where: { userId: sessao.userId, lidaEm: null, ...filtro },
      data: { lidaEm: new Date() },
    });
    const naoLidas = await prisma.notificacao.count({ where: { userId: sessao.userId, lidaEm: null } });
    return NextResponse.json({ marcadas: count, naoLidas });
  } catch (erro) {
    if (tabelaAusente(erro)) return NextResponse.json({ marcadas: 0, naoLidas: 0 });
    console.error("[notificacoes] Erro ao marcar como lida:", erro);
    return NextResponse.json({ error: "Não foi possível atualizar as notificações." }, { status: 500 });
  }
}
