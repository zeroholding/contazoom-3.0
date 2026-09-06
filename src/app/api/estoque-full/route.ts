/**
 * GET /api/estoque-full — leitura do Estoque Full.
 *
 * Os números de estoque vêm do snapshot que o sync grava; as vendas de 30 dias e
 * a cobertura são calculadas na leitura. Ver `src/lib/estoque-full-data.ts`.
 */

import { NextRequest, NextResponse } from "next/server";

import { assertSessionToken } from "@/lib/auth";
import { cache, createCacheKey } from "@/lib/cache";
import { backfillVariacaoAte } from "@/lib/estoque-full-backfill";
import {
  buscarEstoqueFull,
  type FiltrosFull,
  type OrdemFull,
} from "@/lib/estoque-full-data";
import type { SituacaoEstoque } from "@/lib/estoque-full-cobertura";

export const runtime = "nodejs";

/**
 * 30s.
 *
 * Bem menor que o TTL das outras telas porque estoque é o dado mais perecível do
 * sistema, e a tela é usada para decidir reposição. Mostrar "2 unidades" num item
 * que já esgotou faz alguém deixar de comprar.
 */
const TTL_MS = 30_000;

const ORDENS: OrdemFull[] = ["aptas", "vendas", "medio", "caminho", "naoaptas", "cobertura"];
const SITUACOES: SituacaoEstoque[] = ["parado", "repor", "alto", "saudavel"];

function inteiro(v: string | null, padrao: number, min: number, max: number): number {
  const n = Number.parseInt(v ?? "", 10);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(Math.max(n, min), max);
}

function texto(v: string | null, max = 120): string {
  return (v ?? "").trim().slice(0, max);
}

function lista(v: string | null, max = 50): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

function lerFiltros(url: URL): FiltrosFull {
  const ordemBruta = url.searchParams.get("ordem") as OrdemFull | null;
  const situacaoBruta = texto(url.searchParams.get("situacao"), 20) as SituacaoEstoque;
  const estoqueBruto = texto(url.searchParams.get("estoque"), 5);

  return {
    contas: lista(url.searchParams.get("contas")),
    busca: texto(url.searchParams.get("busca")),
    situacao: SITUACOES.includes(situacaoBruta) ? situacaoBruta : "",
    estoque: estoqueBruto === "com" || estoqueBruto === "sem" ? estoqueBruto : "",
    hierarquia1: texto(url.searchParams.get("hierarquia1")),
    hierarquia2: texto(url.searchParams.get("hierarquia2")),
    // Padrão "aptas" e não "vendas": a pergunta que traz alguém a esta tela é
    // "o que tenho em estoque", e quem quer o giro clica na coluna de vendas.
    ordem: ordemBruta && ORDENS.includes(ordemBruta) ? ordemBruta : "aptas",
    direcao: url.searchParams.get("direcao") === "asc" ? "asc" : "desc",
    pagina: inteiro(url.searchParams.get("pagina"), 1, 1, 100_000),
    // Faixa e não lista fechada: um link com `porPagina=30` deve abrir com 30, e
    // não ser trocado por 25 em silêncio. O teto é a proteção que importa.
    porPagina: inteiro(url.searchParams.get("porPagina"), 50, 1, 200),
  };
}

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("session")?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let session;
  try {
    session = await assertSessionToken(sessionCookie);
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const filtros = lerFiltros(url);

    const chave = createCacheKey(
      "estoque-full",
      session.sub,
      filtros.contas.join("|"),
      filtros.busca,
      filtros.situacao,
      filtros.estoque,
      filtros.hierarquia1,
      filtros.hierarquia2,
      filtros.ordem,
      filtros.direcao,
      String(filtros.pagina),
      String(filtros.porPagina),
    );

    // `?atualizar=1` (o botão da tela) pula o cache. Sem essa saída, quem acabou
    // de sincronizar veria o número velho por meio minuto e concluiria que o
    // sync não funcionou.
    const semCache = url.searchParams.get("atualizar") === "1";
    if (!semCache) {
      const emCache = cache.get(chave, TTL_MS);
      if (emCache) return NextResponse.json(emCache);
    }

    // Backfill da variação, em fatia curta e best-effort.
    //
    // Sem `variation_id` o join de vendas não casa e a cobertura sai vazia. Exigir
    // que alguém rode um script à mão para a tela funcionar seria transformar
    // detalhe de implementação em tarefa do usuário. Falhar aqui não derruba a
    // resposta: a tela mostra quantas vendas ainda faltam associar.
    try {
      await backfillVariacaoAte(4_000, session.sub);
    } catch (err) {
      console.warn("[estoque-full] backfill de variação não rodou:", err);
    }

    const resultado = await buscarEstoqueFull(session.sub, filtros);
    const payload = { ...resultado, filtros };

    cache.set(chave, payload);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("Erro ao buscar estoque Full:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
