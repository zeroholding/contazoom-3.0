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

function getNowInBrazil(): { year: number; month: number; day: number } {
  const now = new Date();
  const brazilDateString = now.toLocaleString('en-US', { 
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const [month, day, year] = brazilDateString.split('/').map(Number);
  return { year, month, day };
}

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("session")?.value;
  let session;
  try {
    session = await assertSessionToken(sessionCookie);
  } catch (error) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const startParam = url.searchParams.get("start");
    const endParam = url.searchParams.get("end");
    const periodoParam = url.searchParams.get("periodo");
    const dataInicioParam = url.searchParams.get("dataInicio");
    const dataFimParam = url.searchParams.get("dataFim");
    const tipo = url.searchParams.get("tipo") || "despesas"; // despesas | receitas
    const tipoData = url.searchParams.get("tipoData") || "caixa"; // caixa | competencia
    const now = new Date();

    // Determinar período
    let start: Date;
    let end: Date;
    let useRange = false;

    if (dataInicioParam && dataFimParam) {
      start = new Date(dataInicioParam);
      const endBase = new Date(dataFimParam);
      end = new Date(endBase.getTime() + (24 * 60 * 60 * 1000 - 1));
      useRange = true;
    } else if (periodoParam) {
      switch (periodoParam) {
        case "hoje": {
          const brazilToday = getNowInBrazil();
          start = new Date(Date.UTC(brazilToday.year, brazilToday.month - 1, brazilToday.day, 3, 0, 0, 0));
          end = new Date(Date.UTC(brazilToday.year, brazilToday.month - 1, brazilToday.day + 1, 2, 59, 59, 999));
          useRange = true;
          break;
        }
        case "ontem": {
          const brazilToday = getNowInBrazil();
          const brazilYesterday = { ...brazilToday, day: brazilToday.day - 1 };
          start = new Date(Date.UTC(brazilYesterday.year, brazilYesterday.month - 1, brazilYesterday.day, 3, 0, 0, 0));
          end = new Date(Date.UTC(brazilYesterday.year, brazilYesterday.month - 1, brazilYesterday.day + 1, 2, 59, 59, 999));
          useRange = true;
          break;
        }
        case "ultimos_7d": {
          const brazilToday = getNowInBrazil();
          const sevenDaysAgo = new Date(brazilToday.year, brazilToday.month - 1, brazilToday.day - 6);
          start = new Date(Date.UTC(sevenDaysAgo.getFullYear(), sevenDaysAgo.getMonth(), sevenDaysAgo.getDate(), 3, 0, 0, 0));
          end = new Date(Date.UTC(brazilToday.year, brazilToday.month - 1, brazilToday.day + 1, 2, 59, 59, 999));
          useRange = true;
          break;
        }
        case "ultimos_30d": {
          const brazilToday = getNowInBrazil();
          const thirtyDaysAgo = new Date(brazilToday.year, brazilToday.month - 1, brazilToday.day - 29);
          start = new Date(Date.UTC(thirtyDaysAgo.getFullYear(), thirtyDaysAgo.getMonth(), thirtyDaysAgo.getDate(), 3, 0, 0, 0));
          end = new Date(Date.UTC(brazilToday.year, brazilToday.month - 1, brazilToday.day + 1, 2, 59, 59, 999));
          useRange = true;
          break;
        }
        case "ultimos_12m": {
          const brazilToday = getNowInBrazil();
          const twelveMonthsAgo = new Date(brazilToday.year, brazilToday.month - 13, brazilToday.day);
          start = new Date(Date.UTC(twelveMonthsAgo.getFullYear(), twelveMonthsAgo.getMonth(), twelveMonthsAgo.getDate(), 3, 0, 0, 0));
          end = new Date(Date.UTC(brazilToday.year, brazilToday.month - 1, brazilToday.day + 1, 2, 59, 59, 999));
          useRange = true;
          break;
        }
        case "mes_passado": {
          const brazilToday = getNowInBrazil();
          const lastMonthDate = new Date(brazilToday.year, brazilToday.month - 2, 1);
          const lastDayOfLastMonth = new Date(brazilToday.year, brazilToday.month - 1, 0).getDate();
          start = new Date(Date.UTC(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), 1, 3, 0, 0, 0));
          end = new Date(Date.UTC(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), lastDayOfLastMonth + 1, 2, 59, 59, 999));
          useRange = true;
          break;
        }
        case "este_mes": {
          const brazilToday = getNowInBrazil();
          const lastDayOfMonth = new Date(brazilToday.year, brazilToday.month, 0).getDate();
          start = new Date(Date.UTC(brazilToday.year, brazilToday.month - 1, 1, 3, 0, 0, 0));
          end = new Date(Date.UTC(brazilToday.year, brazilToday.month - 1, lastDayOfMonth + 1, 2, 59, 59, 999));
          useRange = true;
          break;
        }
        case "todos":
        default: {
          start = new Date(0);
          end = new Date();
          useRange = false;
          break;
        }
      }
    } else if (startParam || endParam) {
      start = startParam ? new Date(startParam) : new Date(now.getFullYear(), now.getMonth(), 1);
      end = endParam ? new Date(endParam) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      useRange = true;
    } else {
      start = new Date(0);
      end = new Date();
      useRange = false;
    }

    // Definir a query com base no tipoData e tipo
    const isDespesa = tipo === "despesas";
    const dbModel = isDespesa ? prisma.contaPagar : prisma.contaReceber;
    const catTipo = isDespesa ? "DESPESA" : "RECEITA";
    
    let whereQuery: any = { userId: session.sub, categoria: { tipo: catTipo } };
    
    if (useRange) {
      if (tipoData === "caixa") {
        whereQuery = { ...whereQuery, status: "pago", dataPagamento: { gte: start, lte: end } };
      } else {
        whereQuery = { ...whereQuery, OR: [{ dataCompetencia: { gte: start, lte: end } }, { dataCompetencia: null, dataVencimento: { gte: start, lte: end } }] };
      }
    } else if (tipoData === "caixa") {
      whereQuery = { ...whereQuery, status: "pago" };
    }

    const records = await (dbModel as any).findMany({
      where: whereQuery,
      include: { categoria: true },
      orderBy: { dataVencimento: "asc" }
    });

    const categoriesSet = new Set<string>();
    const groupedData = new Map<string, Record<string, number>>();

    // Determine granularity
    const diffDays = useRange ? (end.getTime() - start.getTime()) / (1000 * 3600 * 24) : 999;
    const isMonthly = diffDays > 31;

    for (const record of records) {
      const d = (tipoData === "caixa" ? record.dataPagamento : record.dataCompetencia) || record.dataVencimento;
      if (!d) continue;

      let dateKey = "";
      if (isMonthly) {
        dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      } else {
        dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }

      const catName = record.categoria?.nome || "Sem Categoria";
      categoriesSet.add(catName);

      if (!groupedData.has(dateKey)) {
        groupedData.set(dateKey, { date: dateKey });
      }

      const currentGroup = groupedData.get(dateKey)!;
      currentGroup[catName] = (currentGroup[catName] as number || 0) + toNumber(record.valor);
    }

    const categories = Array.from(categoriesSet);
    const sortedDates = Array.from(groupedData.keys()).sort();
    
    const data = sortedDates.map(date => {
      const obj: any = { date };
      // Ensure all categories exist with at least 0
      for (const cat of categories) {
        obj[cat] = (groupedData.get(date) as any)[cat] || 0;
      }
      return obj;
    });

    return NextResponse.json({
      categories,
      data
    });
  } catch (err) {
    console.error("❌ [Series Categorias] Erro ao calcular series:", err);
    return NextResponse.json({ error: "Erro ao calcular series", message: err instanceof Error ? err.message : "Erro desconhecido" }, { status: 500 });
  }
}
