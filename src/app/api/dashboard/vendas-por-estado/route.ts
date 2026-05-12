import { NextRequest, NextResponse } from "next/server";
import { assertSessionToken } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getStatusWhere, getCanalWhere, getTipoAnuncioWhere, getModalidadeWhere } from "@/lib/dashboard-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getNowInBrazil(): { year: number; month: number; day: number } {
  const now = new Date();
  const s = now.toLocaleString("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [month, day, year] = s.split("/").map(Number);
  return { year, month, day };
}

function getPeriodRange(periodoParam: string | null, dataInicioParam: string | null, dataFimParam: string | null) {
  if (dataInicioParam && dataFimParam) {
    const start = new Date(dataInicioParam);
    const end = new Date(new Date(dataFimParam).getTime() + 86400000 - 1);
    return { start, end, useRange: true };
  }
  const b = getNowInBrazil();
  switch (periodoParam) {
    case "hoje": {
      const start = new Date(Date.UTC(b.year, b.month - 1, b.day, 3, 0, 0, 0));
      const end = new Date(Date.UTC(b.year, b.month - 1, b.day + 1, 2, 59, 59, 999));
      return { start, end, useRange: true };
    }
    case "ontem": {
      const start = new Date(Date.UTC(b.year, b.month - 1, b.day - 1, 3, 0, 0, 0));
      const end = new Date(Date.UTC(b.year, b.month - 1, b.day, 2, 59, 59, 999));
      return { start, end, useRange: true };
    }
    case "ultimos_7d": {
      const from = new Date(b.year, b.month - 1, b.day - 6);
      const start = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate(), 3, 0, 0, 0));
      const end = new Date(Date.UTC(b.year, b.month - 1, b.day + 1, 2, 59, 59, 999));
      return { start, end, useRange: true };
    }
    case "ultimos_30d": {
      const from = new Date(b.year, b.month - 1, b.day - 29);
      const start = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate(), 3, 0, 0, 0));
      const end = new Date(Date.UTC(b.year, b.month - 1, b.day + 1, 2, 59, 59, 999));
      return { start, end, useRange: true };
    }
    case "este_mes": {
      const lastDay = new Date(b.year, b.month, 0).getDate();
      const start = new Date(Date.UTC(b.year, b.month - 1, 1, 3, 0, 0, 0));
      const end = new Date(Date.UTC(b.year, b.month - 1, lastDay + 1, 2, 59, 59, 999));
      return { start, end, useRange: true };
    }
    case "mes_passado": {
      const lastMonthDate = new Date(b.year, b.month - 2, 1);
      const lastDay = new Date(b.year, b.month - 1, 0).getDate();
      const start = new Date(Date.UTC(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), 1, 3, 0, 0, 0));
      const end = new Date(Date.UTC(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), lastDay + 1, 2, 59, 59, 999));
      return { start, end, useRange: true };
    }
    case "ultimos_12m": {
      const from = new Date(b.year, b.month - 13, b.day);
      const start = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate(), 3, 0, 0, 0));
      const end = new Date(Date.UTC(b.year, b.month - 1, b.day + 1, 2, 59, 59, 999));
      return { start, end, useRange: true };
    }
    default:
      return { start: new Date(0), end: new Date(), useRange: false };
  }
}

// Mapeamento de coordenadas para UF usando bounding boxes dos estados brasileiros
// [minLat, maxLat, minLon, maxLon, UF]
const STATE_BOUNDS: [number, number, number, number, string][] = [
  [-33.75, -27.08, -53.80, -48.98, "RS"],
  [-29.35, -25.95, -53.84, -48.05, "SC"],
  [-26.72, -22.51, -54.62, -48.03, "PR"],
  [-24.01, -19.77, -53.11, -44.16, "SP"],
  [-23.37, -20.76, -44.89, -40.96, "RJ"],
  [-21.29, -17.87, -41.87, -39.63, "ES"],
  [-22.92, -14.24, -51.04, -39.87, "MG"],
  [-18.35, -7.36, -46.62, -37.15, "BA"],
  [-11.42, -6.63, -38.24, -34.79, "SE"],
  [-10.50, -8.81, -38.24, -36.27, "AL"],
  [-9.48, -7.15, -35.62, -34.79, "PB"],
  [-9.48, -6.27, -37.65, -34.79, "PE"],
  [-6.48, -2.75, -41.42, -34.81, "RN"],
  [-7.59, -2.75, -41.42, -40.19, "CE"],
  [-10.92, -2.75, -45.99, -40.99, "PI"],
  [-10.21, -1.04, -48.21, -41.80, "MA"],
  [-6.06, -0.04, -52.39, -49.98, "AP"],
  [-13.69, -0.04, -52.39, -44.20, "PA"],
  [-5.27, 5.27, -73.81, -56.10, "AM"],
  [-1.65, 5.27, -64.40, -59.91, "RR"],
  [-16.36, -7.97, -65.39, -59.78, "RO"],
  [-18.04, -7.97, -63.65, -57.56, "MT"],
  [-24.06, -17.18, -58.16, -50.62, "MS"],
  [-19.50, -12.39, -53.22, -45.93, "GO"],
  [-16.05, -14.82, -48.30, -45.82, "DF"],
  [-13.46, -2.73, -49.35, -45.88, "TO"],
];

function latLonToUF(lat: number, lon: number): string | null {
  // Verificar limites do Brasil
  if (lat < -33.75 || lat > 5.27 || lon < -73.81 || lon > -34.79) return null;
  
  for (const [minLat, maxLat, minLon, maxLon, uf] of STATE_BOUNDS) {
    if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) {
      return uf;
    }
  }
  return null;
}

const NOMES_ESTADOS: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins",
};

const REGIOES: Record<string, string> = {
  AC: "Norte", AM: "Norte", AP: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte",
  AL: "Nordeste", BA: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste",
  PE: "Nordeste", PI: "Nordeste", RN: "Nordeste", SE: "Nordeste",
  DF: "Centro-Oeste", GO: "Centro-Oeste", MS: "Centro-Oeste", MT: "Centro-Oeste",
  ES: "Sudeste", MG: "Sudeste", RJ: "Sudeste", SP: "Sudeste",
  PR: "Sul", RS: "Sul", SC: "Sul",
};

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
    const periodoParam = url.searchParams.get("periodo");
    const dataInicioParam = url.searchParams.get("dataInicio");
    const dataFimParam = url.searchParams.get("dataFim");
    const canalParam = url.searchParams.get("canal");
    const statusParam = url.searchParams.get("status");
    const tipoAnuncioParam = url.searchParams.get("tipoAnuncio");
    const modalidadeParam = url.searchParams.get("modalidade");
    const accountPlatformParam = url.searchParams.get("accountPlatform");
    const accountIdParam = url.searchParams.get("accountId");

    const { start, end, useRange } = getPeriodRange(periodoParam, dataInicioParam, dataFimParam);
    const statusWhere = getStatusWhere(statusParam);
    const canalWhere = getCanalWhere(canalParam);
    const tipoWhere = getTipoAnuncioWhere(tipoAnuncioParam);
    const modalidadeWhere = getModalidadeWhere(modalidadeParam);

    const [vendasMeli, vendasShopee] = await Promise.all([
      canalParam === "shopee" ? [] : prisma.meliVenda.findMany({
        where: useRange
          ? { userId: session.sub, dataVenda: { gte: start, lte: end },
              ...statusWhere, ...tipoWhere, ...modalidadeWhere,
              ...(accountPlatformParam === "meli" && accountIdParam ? { meliAccountId: accountIdParam } : {}) }
          : { userId: session.sub, ...statusWhere, ...tipoWhere, ...modalidadeWhere,
              ...(accountPlatformParam === "meli" && accountIdParam ? { meliAccountId: accountIdParam } : {}) },
        select: { orderId: true, valorTotal: true, quantidade: true, latitude: true, longitude: true },
        distinct: ["orderId"],
      }),
      canalParam === "mercado_livre" ? [] : prisma.shopeeVenda.findMany({
        where: useRange
          ? { userId: session.sub, dataVenda: { gte: start, lte: end }, ...statusWhere,
              ...(accountPlatformParam === "shopee" && accountIdParam ? { shopeeAccountId: accountIdParam } : {}) }
          : { userId: session.sub, ...statusWhere,
              ...(accountPlatformParam === "shopee" && accountIdParam ? { shopeeAccountId: accountIdParam } : {}) },
        select: { orderId: true, valorTotal: true, quantidade: true, latitude: true, longitude: true },
        distinct: ["orderId"],
      }),
    ]);

    const todas = [...vendasMeli, ...vendasShopee];
    const mapaEstados = new Map<string, { quantidade: number; valor: number }>();

    let semCoordenadas = 0;
    for (const v of todas) {
      const lat = v.latitude ? Number(v.latitude) : null;
      const lon = v.longitude ? Number(v.longitude) : null;
      if (!lat || !lon) { semCoordenadas++; continue; }

      const uf = latLonToUF(lat, lon);
      if (!uf) { semCoordenadas++; continue; }

      const atual = mapaEstados.get(uf) ?? { quantidade: 0, valor: 0 };
      mapaEstados.set(uf, {
        quantidade: atual.quantidade + 1,
        valor: atual.valor + Number(v.valorTotal),
      });
    }

    const totalVendas = Array.from(mapaEstados.values()).reduce((acc, e) => acc + e.quantidade, 0);
    const totalValor = Array.from(mapaEstados.values()).reduce((acc, e) => acc + e.valor, 0);

    // Agrupar por região
    const mapaRegioes = new Map<string, { quantidade: number; valor: number }>();
    for (const [uf, data] of mapaEstados.entries()) {
      const regiao = REGIOES[uf] ?? "Outros";
      const atual = mapaRegioes.get(regiao) ?? { quantidade: 0, valor: 0 };
      mapaRegioes.set(regiao, {
        quantidade: atual.quantidade + data.quantidade,
        valor: atual.valor + data.valor,
      });
    }

    const estados = Array.from(mapaEstados.entries())
      .map(([uf, data]) => ({
        uf,
        nome: NOMES_ESTADOS[uf] ?? uf,
        regiao: REGIOES[uf] ?? "Outros",
        quantidade: data.quantidade,
        valor: Math.round(data.valor * 100) / 100,
        percentual: totalVendas > 0 ? (data.quantidade / totalVendas) * 100 : 0,
        percentualValor: totalValor > 0 ? (data.valor / totalValor) * 100 : 0,
      }))
      .sort((a, b) => b.quantidade - a.quantidade);

    const regioes = Array.from(mapaRegioes.entries())
      .map(([nome, data]) => ({
        nome,
        quantidade: data.quantidade,
        valor: Math.round(data.valor * 100) / 100,
        percentual: totalVendas > 0 ? (data.quantidade / totalVendas) * 100 : 0,
      }))
      .sort((a, b) => b.quantidade - a.quantidade);

    return NextResponse.json({
      estados,
      regioes,
      totals: {
        vendas: totalVendas,
        valor: Math.round(totalValor * 100) / 100,
        semCoordenadas,
        totalProcessadas: todas.length,
      },
    });
  } catch (err) {
    console.error("[vendas-por-estado] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
