/**
 * GET /api/anuncios — ranking de anúncios: mais vendidos e mortos.
 *
 * Uma rota para os dois modos, porque são a mesma agregação com corte diferente
 * (ver `src/lib/anuncios-data.ts`). Rotas separadas garantiriam que um dia os
 * dois lados deixassem de bater entre si.
 *
 * O ESTOQUE é consultado ao vivo no Mercado Livre — o banco não guarda estoque, e
 * não deveria: muda a cada venda, então número persistido nasce velho.
 */

import { NextRequest, NextResponse } from "next/server";

import { assertSessionToken } from "@/lib/auth";
import { cache, createCacheKey } from "@/lib/cache";
import {
  buscarAnuncios,
  type FiltrosAnuncios,
  type ModoAnuncio,
  type OrdemAnuncio,
} from "@/lib/anuncios-data";
import { backfillItemIdAte } from "@/lib/anuncios-backfill";

export const runtime = "nodejs";

/**
 * 60s.
 *
 * Curto porque estoque é o dado mais perecível da tela: cachear por muito tempo
 * mostraria "2 unidades" num anúncio que já esgotou, e a pessoa decidiria repor
 * ou não com base num número vencido.
 */
const TTL_MS = 60_000;

const ORDENS: OrdemAnuncio[] = [
  "faturamento_desc",
  "unidades_desc",
  "dias_desc",
  "dias_asc",
  "ultima_venda_asc",
];
const STATUS_ACEITOS = ["active", "paused", "closed", "under_review"];

function inteiro(v: string | null, padrao: number, min: number, max: number): number {
  const n = Number.parseInt(v ?? "", 10);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(Math.max(n, min), max);
}

function decimal(v: string | null, padrao: number): number {
  const n = Number.parseFloat((v ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : padrao;
}

/** Trunca e tira espaço. Impede filtro gigante virar ILIKE absurdo. */
function texto(v: string | null, max = 120): string {
  return (v ?? "").trim().slice(0, max);
}

function lerFiltros(url: URL): FiltrosAnuncios {
  const modo: ModoAnuncio = url.searchParams.get("modo") === "mortos" ? "mortos" : "mais_vendidos";
  const ordemBruta = url.searchParams.get("ordem") as OrdemAnuncio | null;

  return {
    modo,
    // Mais vendidos olha os últimos 30 dias — "campeão de vendas" é uma pergunta
    // sobre o presente. Mortos olha o histórico todo, porque o que qualifica o
    // anúncio é justamente ter vendido bem ANTES de parar; cortar em 30 dias
    // esconderia exatamente os casos que interessam.
    janelaDias: inteiro(url.searchParams.get("janelaDias"), modo === "mortos" ? 0 : 30, 0, 3650),
    diasSemVenda: inteiro(url.searchParams.get("diasSemVenda"), 30, 1, 3650),
    minUnidades: inteiro(url.searchParams.get("minUnidades"), modo === "mortos" ? 10 : 0, 0, 1_000_000),
    minFaturamento: decimal(url.searchParams.get("minFaturamento"), modo === "mortos" ? 1000 : 0),
    meliAccountId: texto(url.searchParams.get("contaId"), 40),
    busca: texto(url.searchParams.get("busca")),
    hierarquia1: texto(url.searchParams.get("hierarquia1")),
    hierarquia2: texto(url.searchParams.get("hierarquia2")),
    status: STATUS_ACEITOS.includes(texto(url.searchParams.get("status")))
      ? texto(url.searchParams.get("status"))
      : "",
    estoque: ["com", "sem"].includes(texto(url.searchParams.get("estoque")))
      ? texto(url.searchParams.get("estoque"))
      : "",
    ordem:
      ordemBruta && ORDENS.includes(ordemBruta)
        ? ordemBruta
        : modo === "mortos"
          ? "faturamento_desc"
          : "unidades_desc",
    pagina: inteiro(url.searchParams.get("pagina"), 1, 1, 100_000),
    // Faixa e não lista fechada.
    //
    // A tela oferece 20/50/100 no seletor, mas uma lista fechada aqui trocaria
    // silenciosamente qualquer outro valor por 20 — então um link compartilhado
    // com `porPagina=25` abriria mostrando 20 sem dizer nada a quem o abriu. O
    // clamp já é a proteção que importa: impede `porPagina=100000` derrubar a
    // resposta, que era o motivo real da lista existir.
    porPagina: inteiro(url.searchParams.get("porPagina"), 20, 1, 100),
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
      "anuncios",
      session.sub,
      filtros.modo,
      String(filtros.janelaDias),
      String(filtros.diasSemVenda),
      String(filtros.minUnidades),
      String(filtros.minFaturamento),
      filtros.meliAccountId,
      filtros.busca,
      filtros.hierarquia1,
      filtros.hierarquia2,
      filtros.status,
      filtros.estoque,
      filtros.ordem,
      String(filtros.pagina),
      String(filtros.porPagina),
    );

    // `?atualizar=1` (botão da tela) pula o cache. Sem essa saída, quem acabou de
    // repor estoque veria o número velho por um minuto e concluiria que a
    // reposição não valeu.
    const semCache = url.searchParams.get("atualizar") === "1";
    if (!semCache) {
      const emCache = cache.get(chave, TTL_MS);
      if (emCache) return NextResponse.json(emCache);
    }

    // O backfill do `item_id` roda aqui, em fatia curta e best-effort.
    //
    // Sem ele a tela nasceria vazia num banco que já tem anos de venda, e exigir
    // que alguém rode um script à mão para a tela funcionar é transformar um
    // detalhe de implementação em tarefa do usuário. Falhar aqui não pode
    // derrubar a resposta: a consulta cai no JSON como reserva de qualquer forma.
    try {
      await backfillItemIdAte(4_000, session.sub);
    } catch (err) {
      console.warn("[anuncios] backfill de item_id não rodou:", err);
    }

    const resultado = await buscarAnuncios(session.sub, filtros);
    const payload = { ...resultado, filtros };

    cache.set(chave, payload);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("Erro ao buscar anúncios:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
