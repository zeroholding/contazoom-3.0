import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import {
  normalizeDiscoveredSku,
  registerDiscoveredSkus,
  type SkuDiscoveryCandidate,
} from "@/lib/sku-discovery";
import { buildPendingSkuSummary } from "@/lib/sku-pending";

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    const summary = await buildPendingSkuSummary(session.sub);

    return NextResponse.json(summary);
  } catch (error) {
    console.error("Erro ao buscar SKUs pendentes:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    const body = await request.json();
    const skus = Array.isArray(body?.skus) ? body.skus : [];

    const candidates: SkuDiscoveryCandidate[] = skus
      .map((sku: any) => {
        const normalizedSku = normalizeDiscoveredSku(sku?.sku);
        if (!normalizedSku) return null;

        return {
          sku: normalizedSku,
          produto: sku?.produto || `SKU ${normalizedSku}`,
          plataforma:
            sku?.plataforma === "Shopee" ? "Shopee" : "Mercado Livre",
          conta: sku?.conta || null,
          externalId: sku?.externalId || null,
        } satisfies SkuDiscoveryCandidate;
      })
      .filter(Boolean) as SkuDiscoveryCandidate[];

    const result = await registerDiscoveredSkus(session.sub, candidates);

    return NextResponse.json({
      results: {
        success: result.created,
        existing: result.existing,
        failed: result.skipped,
        found: result.found,
      },
    });
  } catch (error) {
    console.error("Erro ao criar SKUs pendentes:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 },
    );
  }
}
