import { NextRequest, NextResponse } from "next/server";
import { assertSessionToken } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toNumber(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("session")?.value;
  let session;
  try {
    session = await assertSessionToken(sessionCookie);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const mesesParam = url.searchParams.get("meses") || "";
    const tipoData = url.searchParams.get("tipo") || "caixa"; // caixa | competencia
    const catsParam = url.searchParams.get("categorias"); // opcional

    if (!mesesParam) {
      return NextResponse.json({ error: "Meses não informados" }, { status: 400 });
    }

    const mesesStr = mesesParam.split(","); // Ex: ["2024-01", "2024-02"]
    
    // Preparar metadados dos meses
    const months = mesesStr.map(m => {
      const [y, mStr] = m.split("-");
      const ano = parseInt(y, 10);
      const mes = parseInt(mStr, 10);
      return {
        key: m,
        label: `${MONTH_LABELS[mes - 1]}/${y.substring(2)}`,
        ano,
        mes
      };
    });

    // Encontrar range de datas (menor primeiro dia, maior último dia)
    let minDate = new Date("2999-01-01");
    let maxDate = new Date("1970-01-01");
    const monthRanges: Record<string, { start: Date, end: Date }> = {};

    for (const m of months) {
      // 🌍 Usar offset de 3 horas para alinhar com o horário do Brasil (assim como o dashboard/stats)
      const start = new Date(Date.UTC(m.ano, m.mes - 1, 1, 3, 0, 0, 0));
      const lastDayOfMonth = new Date(m.ano, m.mes, 0).getDate();
      const end = new Date(Date.UTC(m.ano, m.mes - 1, lastDayOfMonth + 1, 2, 59, 59, 999));
      if (start < minDate) minDate = start;
      if (end > maxDate) maxDate = end;
      monthRanges[m.key] = { start, end };
    }

    const { buildHistoricalCostMap } = await import("@/lib/sku-cost-history");

    // Buscar Vendas (Apenas Pagos para receita)
    const paidOnly = {
      OR: [
        { status: { contains: "paid", mode: "insensitive" as const } },
        { status: { contains: "payment_approved", mode: "insensitive" as const } },
        { status: { contains: "delivered", mode: "insensitive" as const } },
        { status: { contains: "completed", mode: "insensitive" as const } },
        { status: { contains: "shipped", mode: "insensitive" as const } },
        { status: { contains: "ready_to_ship", mode: "insensitive" as const } },
        { status: { contains: "to_ship", mode: "insensitive" as const } },
        { status: { contains: "to_confirm_receive", mode: "insensitive" as const } },
        { status: { contains: "processed", mode: "insensitive" as const } },
        { status: { contains: "packed", mode: "insensitive" as const } },
        { status: { contains: "retry_ship", mode: "insensitive" as const } },
        { status: { contains: "pickup_done", mode: "insensitive" as const } },
        { status: { contains: "arranging_shipment", mode: "insensitive" as const } },
        { status: { contains: "first_mile_arrived", mode: "insensitive" as const } },
      ]
    };

    const [vendasMeli, vendasShopee] = await Promise.all([
      prisma.meliVenda.findMany({
        where: { userId: session.sub, dataVenda: { gte: minDate, lte: maxDate }, ...paidOnly },
        select: { orderId: true, valorTotal: true, taxaPlataforma: true, frete: true, quantidade: true, sku: true, dataVenda: true },
        distinct: ['orderId'],
      }),
      prisma.shopeeVenda.findMany({
        where: { userId: session.sub, dataVenda: { gte: minDate, lte: maxDate }, ...paidOnly },
        select: { orderId: true, valorTotal: true, taxaPlataforma: true, frete: true, quantidade: true, sku: true, dataVenda: true },
        distinct: ['orderId'],
      })
    ]);

    // Calcular custos
    const skusUnicos = Array.from(new Set([...vendasMeli, ...vendasShopee].map(v => v.sku).filter(Boolean))) as string[];
    const costMap = await buildHistoricalCostMap(session.sub, skusUnicos);

    // Inicializar objetos de resposta
    const receitaBrutaMeliPorMes: Record<string, number> = {};
    const receitaBrutaShopeePorMes: Record<string, number> = {};
    const deducoesMeliPorMes: Record<string, number> = {};
    const deducoesShopeePorMes: Record<string, number> = {};
    const taxasMeliPorMes: Record<string, number> = {};
    const taxasShopeePorMes: Record<string, number> = {};
    const freteMeliPorMes: Record<string, number> = {};
    const freteShopeePorMes: Record<string, number> = {};
    const cmvPorMes: Record<string, number> = {};
    
    // Iniciar com 0 para todos os meses solicitados
    for (const m of mesesStr) {
      receitaBrutaMeliPorMes[m] = 0;
      receitaBrutaShopeePorMes[m] = 0;
      deducoesMeliPorMes[m] = 0; // Se precisarmos de deduções de devoluções no futuro
      deducoesShopeePorMes[m] = 0;
      taxasMeliPorMes[m] = 0;
      taxasShopeePorMes[m] = 0;
      freteMeliPorMes[m] = 0;
      freteShopeePorMes[m] = 0;
      cmvPorMes[m] = 0;
    }

    const orderIdsVistos = new Set<string>();

    const processarVendas = (vendas: any[], plataforma: "meli" | "shopee") => {
      for (const v of vendas) {
        if (!v.dataVenda) continue;
        
        // Deduplicação em JavaScript (garantir que orderIds não sejam somados duplamente)
        const orderId = v.orderId;
        if (orderId) {
          if (orderIdsVistos.has(orderId)) continue;
          orderIdsVistos.add(orderId);
        }

        const d = new Date(v.dataVenda);
        // Converter de volta para horário do Brasil (-3h) para saber a qual mês pertence
        const brazilDate = new Date(d.getTime() - 3 * 60 * 60 * 1000);
        const mKey = `${brazilDate.getUTCFullYear()}-${String(brazilDate.getUTCMonth() + 1).padStart(2, "0")}`;
        
        if (!mesesStr.includes(mKey)) continue; // Venda fora dos meses selecionados exatos

        const vt = toNumber(v.valorTotal);
        const taxa = Math.abs(toNumber(v.taxaPlataforma)); // Taxa sempre como despesa (valor absoluto)
      let fr = toNumber(v.frete) || 0;
        const cmv = (v.sku ? costMap.getCostAtDate(v.sku, d) : 0) * toNumber(v.quantidade);

        if (plataforma === "meli") {
          receitaBrutaMeliPorMes[mKey] += vt;
          taxasMeliPorMes[mKey] += taxa;
          freteMeliPorMes[mKey] += fr;
        } else {
          receitaBrutaShopeePorMes[mKey] += vt;
          taxasShopeePorMes[mKey] += taxa;
          freteShopeePorMes[mKey] += fr;
        }
        cmvPorMes[mKey] += cmv;
      }
    };

    processarVendas(vendasMeli, "meli");
    processarVendas(vendasShopee, "shopee");

    // Buscar Contas a Pagar (Despesas)
    let whereQuery: any = { userId: session.sub, categoria: { tipo: "DESPESA" } };
    if (tipoData === "caixa") {
      whereQuery = { ...whereQuery, status: "pago", dataPagamento: { gte: minDate, lte: maxDate } };
    } else {
      whereQuery = { ...whereQuery, OR: [{ dataCompetencia: { gte: minDate, lte: maxDate } }, { dataCompetencia: null, dataVencimento: { gte: minDate, lte: maxDate } }] };
    }

    if (catsParam) {
      const catIds = catsParam.split(",");
      if (catIds.length > 0) {
        whereQuery.categoriaId = { in: catIds };
      }
    }

    const contasPagar = await prisma.contaPagar.findMany({
      where: whereQuery,
      include: { categoria: true },
    });

    const despesasPorMes: Record<string, number> = {};
    const valoresPorCategoriaMes: Record<string, Record<string, number>> = {};
    const categoriasMap = new Map<string, any>();

    for (const m of mesesStr) {
      despesasPorMes[m] = 0;
    }

    for (const cp of contasPagar) {
      const d = (tipoData === "caixa" ? cp.dataPagamento : cp.dataCompetencia) || cp.dataVencimento;
      if (!d) continue;
      
      const brazilDate = new Date(d.getTime() - 3 * 60 * 60 * 1000);
      const mKey = `${brazilDate.getUTCFullYear()}-${String(brazilDate.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!mesesStr.includes(mKey)) continue;

      const valor = toNumber(cp.valor);
      despesasPorMes[mKey] += valor;

      if (cp.categoriaId && cp.categoria) {
        if (!categoriasMap.has(cp.categoriaId)) {
          categoriasMap.set(cp.categoriaId, { id: cp.categoria.id, nome: cp.categoria.nome, descricao: cp.categoria.descricao });
        }
        if (!valoresPorCategoriaMes[cp.categoriaId]) {
          valoresPorCategoriaMes[cp.categoriaId] = {};
          for (const mk of mesesStr) valoresPorCategoriaMes[cp.categoriaId][mk] = 0;
        }
        valoresPorCategoriaMes[cp.categoriaId][mKey] += valor;
      }
    }

    const categorias = Array.from(categoriasMap.values());

    // Calcular Totais
    const totals = {
      receitaBrutaMeli: 0, receitaBrutaShopee: 0, receitaBrutaTotal: 0,
      deducoesMeli: 0, deducoesShopee: 0, deducoesTotal: 0,
      taxasMeli: 0, taxasShopee: 0, taxasTotal: 0,
      freteMeli: 0, freteShopee: 0, freteTotal: 0,
      cmv: 0, despesas: 0
    };

    for (const m of mesesStr) {
      totals.receitaBrutaMeli += receitaBrutaMeliPorMes[m];
      totals.receitaBrutaShopee += receitaBrutaShopeePorMes[m];
      totals.deducoesMeli += deducoesMeliPorMes[m];
      totals.deducoesShopee += deducoesShopeePorMes[m];
      totals.taxasMeli += taxasMeliPorMes[m];
      totals.taxasShopee += taxasShopeePorMes[m];
      totals.freteMeli += freteMeliPorMes[m];
      totals.freteShopee += freteShopeePorMes[m];
      totals.cmv += cmvPorMes[m];
      totals.despesas += despesasPorMes[m];
    }
    
    totals.receitaBrutaTotal = totals.receitaBrutaMeli + totals.receitaBrutaShopee;
    totals.deducoesTotal = totals.deducoesMeli + totals.deducoesShopee;
    totals.taxasTotal = totals.taxasMeli + totals.taxasShopee;
    totals.freteTotal = totals.freteMeli + totals.freteShopee;

    return NextResponse.json({
      months,
      categorias,
      valoresPorCategoriaMes,
      receitaBrutaMeliPorMes,
      receitaBrutaShopeePorMes,
      deducoesMeliPorMes,
      deducoesShopeePorMes,
      taxasMeliPorMes,
      taxasShopeePorMes,
      freteMeliPorMes,
      freteShopeePorMes,
      despesasPorMes,
      cmvPorMes,
      totals
    });
  } catch (err) {
    console.error("❌ [DRE Series] Erro:", err);
    return NextResponse.json({ error: "Erro ao calcular DRE" }, { status: 500 });
  }
}
