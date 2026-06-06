import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      disabled: true,
      message:
        "Rota desativada: ela usava rawData.freight.adjustedCost antigo e podia desfazer o cálculo correto de frete. Use a sincronização normal ou /api/fix-flex.",
    },
    { status: 410 },
  );
}
