import { NextRequest, NextResponse } from "next/server";
import { assertSessionToken } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getDashboardFiltersWhere } from "@/lib/dashboard-filters";
import { cache, createCacheKey } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toNumber(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getNowInBrazil(): { year: number; month: number; day: number } {
  const now = new Date();
  const s = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  const [month, day, year] = s.split("/").map(Number);
  return { year, month, day };
}

function getDateRange(periodo: string): { start: Date; end: Date; useRange: boolean } {
  const b = getNowInBrazil();
  switch (periodo) {
    case "hoje": return { start: new Date(Date.UTC(b.year, b.month - 1, b.day, 3, 0, 0, 0)), end: new Date(Date.UTC(b.year, b.month - 1, b.day + 1, 2, 59, 59, 999)), useRange: true };
    case "ontem": return { start: new Date(Date.UTC(b.year, b.month - 1, b.day - 1, 3, 0, 0, 0)), end: new Date(Date.UTC(b.year, b.month - 1, b.day, 2, 59, 59, 999)), useRange: true };
    case "ultimos_7d": return { start: new Date(Date.UTC(b.year, b.month - 1, b.day - 6, 3, 0, 0, 0)), end: new Date(Date.UTC(b.year, b.month - 1, b.day + 1, 2, 59, 59, 999)), useRange: true };
    case "ultimos_30d": return { start: new Date(Date.UTC(b.year, b.month - 1, b.day - 29, 3, 0, 0, 0)), end: new Date(Date.UTC(b.year, b.month - 1, b.day + 1, 2, 59, 59, 999)), useRange: true };
    case "este_mes": { const last = new Date(b.year, b.month, 0).getDate(); return { start: new Date(Date.UTC(b.year, b.month - 1, 1, 3, 0, 0, 0)), end: new Date(Date.UTC(b.year, b.month - 1, last + 1, 2, 59, 59, 999)), useRange: true }; }
    case "mes_passado": { const lm = new Date(b.year, b.month - 2, 1); const ld = new Date(b.year, b.month - 1, 0).getDate(); return { start: new Date(Date.UTC(lm.getFullYear(), lm.getMonth(), 1, 3, 0, 0, 0)), end: new Date(Date.UTC(lm.getFullYear(), lm.getMonth(), ld + 1, 2, 59, 59, 999)), useRange: true }; }
    case "ultimos_12m": { const ref = new Date(b.year, b.month - 13, b.day); return { start: new Date(Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate(), 3, 0, 0, 0)), end: new Date(Date.UTC(b.year, b.month - 1, b.day + 1, 2, 59, 59, 999)), useRange: true }; }
    default: return { start: new Date(0), end: new Date(), useRange: false };
  }
}

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("session")?.value;
  let session;
  try { session = await assertSessionToken(sessionCookie); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  try {
    const url = new URL(req.url);
    const periodoParam = url.searchParams.get("periodo") || "todos";
    const dataInicioParam = url.searchParams.get("dataInicio");
    const dataFimParam = url.searchParams.get("dataFim");
    const canalParam = url.searchParams.get("canal");
    const statusParam = url.searchParams.get("status");
    const tipoAnuncioParam = url.searchParams.get("tipoAnuncio");
    const modalidadeParam = url.searchParams.get("modalidade");
    const accountPlatformParam = url.searchParams.get("accountPlatform");
    const accountIdParam = url.searchParams.get("accountId");

    // Cache em memória por usuário + combinação de filtros (TTL 60s)
    const cacheKey = createCacheKey(
      "dashboard-faturamento-por-conta",
      session.sub,
      periodoParam ?? "",
      dataInicioParam ?? "",
      dataFimParam ?? "",
      canalParam ?? "",
      statusParam ?? "",
      tipoAnuncioParam ?? "",
      modalidadeParam ?? "",
      accountPlatformParam ?? "",
      accountIdParam ?? "",
    );
    const cached = cache.get(cacheKey, 300000);
    if (cached) {
      return NextResponse.json(cached);
    }

    let start: Date, end: Date, useRange: boolean;
    if (dataInicioParam && dataFimParam) {
      start = new Date(dataInicioParam);
      end = new Date(new Date(dataFimParam).getTime() + 86400000 - 1);
      useRange = true;
    } else {
      ({ start, end, useRange } = getDateRange(periodoParam));
    }

    const dashboardWhereMeli = getDashboardFiltersWhere({
      status: statusParam,
      canal: canalParam,
      tipoAnuncio: tipoAnuncioParam,
      modalidade: modalidadeParam,
    });
    const dashboardWhereShopee = getDashboardFiltersWhere({
      status: statusParam,
      canal: canalParam,
    });

    const whereMeli = {
      userId: session.sub,
      ...(useRange ? { dataVenda: { gte: start, lte: end } } : {}),
      ...(accountPlatformParam === "meli" && accountIdParam ? { meliAccountId: accountIdParam } : {}),
      ...dashboardWhereMeli,
    };

    const whereShopee = {
      userId: session.sub,
      ...(useRange ? { dataVenda: { gte: start, lte: end } } : {}),
      ...(accountPlatformParam === "shopee" && accountIdParam ? { shopeeAccountId: accountIdParam } : {}),
      ...dashboardWhereShopee,
    };

    // Agregação no banco via groupBy (substitui findMany + loop em JS).
    // orderId é @unique em cada tabela, então não há duplicatas para deduplicar.
    const [gruposMeli, gruposShopee] = await Promise.all([
      canalParam === "shopee" ? [] : prisma.meliVenda.groupBy({
        by: ["conta"],
        where: whereMeli,
        _sum: { valorTotal: true, quantidade: true },
        _count: { _all: true },
      }),
      canalParam === "mercado_livre" ? [] : prisma.shopeeVenda.groupBy({
        by: ["conta"],
        where: whereShopee,
        _sum: { valorTotal: true, quantidade: true },
        _count: { _all: true },
      }),
    ]);

    // Agrupar por conta (mescla meli + shopee por nome de conta)
    const mapa = new Map<string, { faturamento: number; quantidade: number }>();
    let totalVendas = 0;

    for (const g of [...gruposMeli, ...gruposShopee]) {
      const conta = g.conta?.trim() || "Sem conta";
      const atual = mapa.get(conta) ?? { faturamento: 0, quantidade: 0 };
      mapa.set(conta, {
        faturamento: atual.faturamento + toNumber(g._sum.valorTotal),
        quantidade: atual.quantidade + (g._sum.quantidade ?? 0),
      });
      totalVendas += g._count._all;
    }

    const totalFaturamento = Array.from(mapa.values()).reduce((acc, v) => acc + v.faturamento, 0);

    const contas = Array.from(mapa.entries())
      .map(([conta, data]) => ({
        conta,
        faturamento: Math.round(data.faturamento * 100) / 100,
        quantidade: data.quantidade,
        percentual: totalFaturamento > 0 ? Math.round((data.faturamento / totalFaturamento) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.faturamento - a.faturamento);

    const response = {
      contas,
      totalFaturamento: Math.round(totalFaturamento * 100) / 100,
      totalVendas,
    };

    cache.set(cacheKey, response);
    return NextResponse.json(response);
  } catch (err) {
    console.error("[faturamento-por-conta] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
