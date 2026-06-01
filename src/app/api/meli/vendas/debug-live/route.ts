import { NextRequest, NextResponse } from "next/server";
import { assertSessionToken } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sessionCookie = req.cookies.get("session")?.value;
    const session = await assertSessionToken(sessionCookie);
    
    const account = await prisma.meliAccount.findFirst({
      where: { userId: session.sub, nickname: 'ELIDELU' }
    });

    if (!account) return NextResponse.json({ error: "Account not found" });

    // Force fetch from Mercado Livre directly
    const MELI_API_BASE = process.env.MELI_API_BASE?.replace(/\/$/, "") || "https://api.mercadolibre.com";
    
    const orderRes = await fetch(`${MELI_API_BASE}/orders/2000016719270888`, {
      headers: { Authorization: `Bearer ${account.access_token}` }
    });
    
    if (!orderRes.ok) return NextResponse.json({ error: "Failed to fetch order", status: orderRes.status });
    
    const order = await orderRes.json();
    
    const sid = order?.shipping?.id;
    let shipment = null;
    let costsData = null;
    
    if (sid) {
      const shipRes = await fetch(`${MELI_API_BASE}/shipments/${sid}`, {
        headers: { Authorization: `Bearer ${account.access_token}` }
      });
      if (shipRes.ok) shipment = await shipRes.json();
      
      const costsRes = await fetch(`${MELI_API_BASE}/shipments/${sid}/costs`, {
        headers: { Authorization: `Bearer ${account.access_token}` }
      });
      if (costsRes.ok) costsData = await costsRes.json();
    }

    return NextResponse.json({
      orderId: '2000016719270888',
      orderFreightData: order?.shipping,
      shipmentFreightData: shipment?.shipping_option,
      shipmentBaseCost: shipment?.base_cost,
      shipmentCost: shipment?.cost,
      costsData: costsData
    });

  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
