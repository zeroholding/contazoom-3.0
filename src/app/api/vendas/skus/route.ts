import { NextRequest, NextResponse } from "next/server";
import { assertSessionToken } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATAFORMAS = ["geral", "meli", "shopee", "tiktok"] as const;
type Plataforma = (typeof PLATAFORMAS)[number];

type LinhaSku = { sku: string | null; _count: { _all: number } };

/**
 * GET /api/vendas/skus?plataforma=geral|meli|shopee|tiktok
 *
 * Faceta do filtro múltiplo de SKU. A fonte são as próprias VENDAS, não o
 * cadastro de SKU: venda com custo ainda não cadastrado também precisa poder ser
 * filtrada. Retorna todos os códigos distintos do usuário, com a quantidade de
 * linhas em que aparecem. Geral une e deduplica as três plataformas.
 */
export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = (await assertSessionToken(req.cookies.get("session")?.value)).sub;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const valor = (req.nextUrl.searchParams.get("plataforma") || "geral").toLowerCase();
  if (!PLATAFORMAS.includes(valor as Plataforma)) {
    return NextResponse.json(
      { error: "Plataforma inválida. Use geral, meli, shopee ou tiktok." },
      { status: 400 },
    );
  }
  const plataforma = valor as Plataforma;
  const onde = { userId, sku: { not: null } } as const;

  try {
    const [meli, shopee, tiktok] = await Promise.all([
      plataforma === "geral" || plataforma === "meli"
        ? prisma.meliVenda.groupBy({ by: ["sku"], where: onde, _count: { _all: true } })
        : Promise.resolve([] as LinhaSku[]),
      plataforma === "geral" || plataforma === "shopee"
        ? prisma.shopeeVenda.groupBy({ by: ["sku"], where: onde, _count: { _all: true } })
        : Promise.resolve([] as LinhaSku[]),
      plataforma === "geral" || plataforma === "tiktok"
        ? prisma.tiktokVenda.groupBy({ by: ["sku"], where: onde, _count: { _all: true } })
        : Promise.resolve([] as LinhaSku[]),
    ]);

    const porSku = new Map<string, number>();
    for (const linha of [...meli, ...shopee, ...tiktok]) {
      const sku = linha.sku;
      if (!sku?.trim()) continue;
      porSku.set(sku, (porSku.get(sku) ?? 0) + linha._count._all);
    }

    const items = [...porSku.entries()]
      .map(([sku, count]) => ({ sku, count }))
      .sort((a, b) => a.sku.localeCompare(b.sku, "pt-BR", { numeric: true, sensitivity: "base" }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("[vendas][skus] Falha ao carregar opções:", error);
    return NextResponse.json({ error: "Não foi possível carregar a lista de SKUs." }, { status: 500 });
  }
}
