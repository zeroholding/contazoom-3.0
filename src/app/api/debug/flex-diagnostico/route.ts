import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { assertSessionToken } from "@/lib/auth";
import { loadActiveFlexShippingConfig } from "@/lib/flex-shipping-config";
import { calculateMeliFlexShipping } from "@/lib/flex-shipping";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("session")?.value;
  let session;
  try {
    session = await assertSessionToken(sessionCookie);
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const flexConfig = await loadActiveFlexShippingConfig(session.sub);

  // Buscar 10 vendas Flex para diagnóstico
  const vendas = await prisma.meliVenda.findMany({
    where: { userId: session.sub },
    select: {
      orderId: true,
      logisticType: true,
      envioMode: true,
      frete: true,
      quantidade: true,
      comprador: true,
    },
    orderBy: { dataVenda: "desc" },
    take: 50,
  });

  const diagnostico = vendas.map((v) => {
    const flex = calculateMeliFlexShipping({
      frete: v.frete,
      quantidade: v.quantidade,
      logisticType: v.logisticType,
      config: flexConfig,
    });

    return {
      orderId: v.orderId,
      comprador: v.comprador,
      logisticType: v.logisticType,
      logisticType_typeof: typeof v.logisticType,
      logisticType_raw: JSON.stringify(v.logisticType),
      envioMode: v.envioMode,
      frete: Number(v.frete),
      quantidade: v.quantidade,
      flex_isFlex: flex.isFlex,
      flex_configApplied: flex.configApplied,
      flex_receitaFlex: flex.receitaFlex,
      flex_custoFlex: flex.custoFlex,
      flex_freteLiquidoFlex: flex.freteLiquidoFlex,
    };
  });

  // Agrupar logisticType únicos
  const logisticTypes = Array.from(new Set(vendas.map((v) => v.logisticType)));
  const envioModes = Array.from(new Set(vendas.map((v) => v.envioMode)));

  return NextResponse.json({
    flexConfig,
    logisticTypesUnicos: logisticTypes,
    envioModesUnicos: envioModes,
    totalVendas: vendas.length,
    diagnostico,
  });
}
