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
  type CanalAnuncio,
  type CanalFiltroAnuncio,
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
  const bruto = (v ?? "").trim();
  if (!bruto || !/^(?:R\$\s*)?[\d.,\s]+$/.test(bruto)) return padrao;

  const valor = bruto.replace(/^R\$\s*/, "").replace(/\s+/g, "");
  let normalizado: string;

  if (/^\d+$/.test(valor)) {
    normalizado = valor;
  } else if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(valor)) {
    // pt-BR: pontos agrupam milhares e a vírgula marca os centavos.
    normalizado = valor.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+,\d+$/.test(valor)) {
    normalizado = valor.replace(",", ".");
  } else if (/^\d+\.\d+$/.test(valor)) {
    normalizado = valor;
  } else if (/^\d{1,3}(?:,\d{3})+\.\d+$/.test(valor)) {
    // en-US só é aceito quando o ponto decimal elimina a ambiguidade.
    normalizado = valor.replace(/,/g, "");
  } else {
    return padrao;
  }

  const n = Number(normalizado);
  return Number.isFinite(n) && n >= 0 ? n : padrao;
}

/** Trunca e tira espaço. Impede filtro gigante virar ILIKE absurdo. */
function texto(v: string | null, max = 120): string {
  return (v ?? "").trim().slice(0, max);
}

function lerConta(
  valor: string | null,
  canal: CanalFiltroAnuncio,
): { accountCanal?: CanalAnuncio; accountId: string; meliAccountId: string } {
  const contaBruta = texto(valor, 43);
  const prefixada = /^(ML|SP|TT):(.*)$/.exec(contaBruta);
  const accountId = texto(prefixada?.[2] ?? contaBruta, 40);
  const accountCanal = accountId
    ? ((prefixada?.[1] as CanalAnuncio | undefined) ?? (canal === "todos" ? "ML" : canal))
    : undefined;

  return {
    accountCanal,
    accountId,
    meliAccountId: accountCanal === "ML" ? accountId : "",
  };
}

function lerFiltros(url: URL): FiltrosAnuncios {
  const modo: ModoAnuncio = url.searchParams.get("modo") === "mortos" ? "mortos" : "mais_vendidos";
  const ordemBruta = url.searchParams.get("ordem") as OrdemAnuncio | null;
  const canalBruto = url.searchParams.get("canal");
  // Compatibilidade: Mortos e consumidores antigos não enviam canal e continuam ML.
  const canal: CanalFiltroAnuncio = ["todos", "ML", "SP", "TT"].includes(canalBruto ?? "")
    ? (canalBruto as CanalFiltroAnuncio)
    : "ML";
  const conta = lerConta(url.searchParams.get("contaId"), canal);
  // Situação e estoque atuais são capacidades ML. Em Todos/SP/TT são limpos em
  // vez de filtrar silenciosamente só uma parte do conjunto.
  const permiteFiltrosMl = canal === "ML";
  const statusBruto = texto(url.searchParams.get("status"));
  const estoqueBruto = texto(url.searchParams.get("estoque"));
  const relevanciaBruta = url.searchParams.get("relevancia");
  // Em Mortos, E é o padrão para que aumentar qualquer mínimo realmente corte
  // a lista. OU continua disponível, mas precisa ser uma escolha explícita.
  const relevancia: "ou" | "e" =
    relevanciaBruta === "ou" || relevanciaBruta === "e"
      ? relevanciaBruta
      : modo === "mortos"
        ? "e"
        : "ou";

  return {
    modo,
    canal,
    accountCanal: conta.accountCanal,
    accountId: conta.accountId,
    meliAccountId: conta.meliAccountId,
    // Mais vendidos olha os últimos 30 dias; Mortos mantém o histórico inteiro.
    janelaDias: inteiro(url.searchParams.get("janelaDias"), modo === "mortos" ? 0 : 30, 0, 3650),
    diasSemVenda: inteiro(url.searchParams.get("diasSemVenda"), 30, 1, 3650),
    minUnidades: inteiro(url.searchParams.get("minUnidades"), modo === "mortos" ? 10 : 0, 0, 1_000_000),
    minFaturamento: decimal(url.searchParams.get("minFaturamento"), modo === "mortos" ? 1000 : 0),
    relevancia,
    busca: texto(url.searchParams.get("busca")),
    hierarquia1: texto(url.searchParams.get("hierarquia1")),
    hierarquia2: texto(url.searchParams.get("hierarquia2")),
    status: permiteFiltrosMl && STATUS_ACEITOS.includes(statusBruto) ? statusBruto : "",
    estoque: permiteFiltrosMl && ["com", "sem"].includes(estoqueBruto) ? estoqueBruto : "",
    ordem:
      ordemBruta && ORDENS.includes(ordemBruta)
        ? ordemBruta
        : modo === "mortos"
          ? "faturamento_desc"
          : "unidades_desc",
    pagina: inteiro(url.searchParams.get("pagina"), 1, 1, 100_000),
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
      filtros.relevancia,
      filtros.canal ?? "ML",
      filtros.accountCanal ?? "",
      filtros.accountId ?? filtros.meliAccountId,
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

    // O backfill continua estritamente ML e roda apenas quando o resultado inclui
    // esse canal. Falhas permanecem best-effort e não derrubam os demais ramos.
    const incluiMl =
      (filtros.canal === "ML" || filtros.canal === "todos") &&
      (!filtros.accountCanal || filtros.accountCanal === "ML");
    if (incluiMl) {
      try {
        await backfillItemIdAte(4_000, session.sub);
      } catch (err) {
        console.warn("[anuncios] backfill de item_id não rodou:", err);
      }
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
