import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { assertSessionToken } from "@/lib/auth";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await assertSessionToken(req.cookies.get("session")?.value);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const partnerId = process.env.SHOPEE_PARTNER_ID || process.env.SHOPEE_CLIENT_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY || process.env.SHOPEE_CLIENT_SECRET;

    if (!partnerId || !partnerKey) {
      return NextResponse.json({ error: "Credenciais Shopee não configuradas" }, { status: 500 });
    }

    const accounts = await prisma.$queryRaw<Array<{
      id: string;
      shop_id: string;
      access_token: string;
    }>>`
      SELECT id, shop_id, access_token 
      FROM shopee_account 
      WHERE user_id = ${session.sub} AND (shop_name IS NULL OR shop_name = '')
    `;

    let updated = 0;

    for (const acc of accounts) {
      try {
        const pathShopInfo = "/api/v2/shop/get_shop_info";
        const ts2 = Math.floor(Date.now() / 1000);
        const baseString2 = `${partnerId}${pathShopInfo}${ts2}${acc.access_token}${acc.shop_id}`;
        const sign2 = crypto.createHmac("sha256", partnerKey).update(baseString2).digest("hex");
        const shopInfoUrl = `https://partner.shopeemobile.com${pathShopInfo}?partner_id=${partnerId}&timestamp=${ts2}&access_token=${acc.access_token}&shop_id=${acc.shop_id}&sign=${sign2}`;
        
        const infoRes = await fetch(shopInfoUrl);
        const infoData = await infoRes.json();
        
        if (infoData?.response?.shop_name) {
          await prisma.$executeRaw`
            UPDATE shopee_account 
            SET shop_name = ${infoData.response.shop_name} 
            WHERE id = ${acc.id}
          `;
          updated++;
        }
      } catch (err) {
        console.error("Erro ao atualizar nome da conta Shopee:", acc.id, err);
      }
    }

    return NextResponse.json({ success: true, results: { updated } });
  } catch (error) {
    console.error("Erro ao processar update-shop-names:", error);
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500 }
    );
  }
}
