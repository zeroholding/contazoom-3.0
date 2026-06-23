import { NextRequest, NextResponse } from "next/server";
import { assertSessionToken } from "@/lib/auth";
import { loadActiveFlexShippingConfig } from "@/lib/flex-shipping-config";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("session")?.value;
  let session;
  try {
    session = await assertSessionToken(sessionCookie);
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Fetch from the actual endpoint to see what the frontend receives
  const origin = req.nextUrl.origin;
  const res = await fetch(`${origin}/api/meli/vendas`, {
    headers: {
      cookie: `session=${sessionCookie}`
    }
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch api/meli/vendas", status: res.status });
  }

  const data = await res.json();

  const flexVendas = (data.vendas || []).filter((v: any) => v.logisticType === "FLEX" || v.logisticType === "self_service").slice(0, 5);

  return NextResponse.json({
    flexConfigFromApiMeliVendas: data.flexConfig,
    flexVendas: flexVendas.map((v: any) => ({
      id: v.id,
      frete: v.frete,
      logisticType: v.logisticType,
      receitaFlex: v.receitaFlex,
      custoFlex: v.custoFlex,
      freteLiquidoFlex: v.freteLiquidoFlex,
      flexConfigApplied: v.flexConfigApplied
    }))
  });
}
