import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const contas = await prisma.shopeeAccount.findMany();
    let totalAtualizado = 0;
    const logs = [];

    const partnerId = process.env.SHOPEE_PARTNER_ID || process.env.SHOPEE_CLIENT_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY || process.env.SHOPEE_CLIENT_SECRET;

    if (!partnerId || !partnerKey) {
      return NextResponse.json({ error: "Missing Shopee credentials in .env" }, { status: 500 });
    }

    for (const conta of contas) {
      let shopName = conta.shop_name;

      // Se o nome da loja estiver nulo, tenta buscar da API da Shopee agora mesmo!
      if (!shopName) {
        try {
          const pathShopInfo = "/api/v2/shop/get_shop_info";
          const ts2 = Math.floor(Date.now() / 1000);
          const baseString2 = `${partnerId}${pathShopInfo}${ts2}${conta.access_token}${conta.shop_id}`;
          const sign2 = crypto.createHmac("sha256", partnerKey).update(baseString2).digest("hex");
          const shopInfoUrl = `https://partner.shopeemobile.com${pathShopInfo}?partner_id=${partnerId}&timestamp=${ts2}&access_token=${conta.access_token}&shop_id=${conta.shop_id}&sign=${sign2}`;
          
          const infoRes = await fetch(shopInfoUrl);
          const infoData = await infoRes.json();
          
          const shopNameFromApi = infoData?.shop_name || infoData?.response?.shop_name;
          if (shopNameFromApi) {
            shopName = shopNameFromApi;
            
            // Atualiza o cadastro da conta com o nome encontrado
            await prisma.shopeeAccount.update({
              where: { id: conta.id },
              data: { shop_name: shopName }
            });
            logs.push(`Nome recuperado na API para a loja ${conta.shop_id}: ${shopName}`);
          } else {
            logs.push(`API não retornou nome para a loja ${conta.shop_id}. Resposta: ${JSON.stringify(infoData)}`);
          }
        } catch (err) {
          logs.push(`Erro ao buscar nome da loja ${conta.shop_id} na API: ${err}`);
        }
      }

      // Atualiza todas as vendas dessa conta com o nome correto
      const nomeAmigavel = shopName ?? conta.shop_id;
      
      const updateResult = await prisma.shopeeVenda.updateMany({
        where: { shopeeAccountId: conta.id },
        data: { conta: nomeAmigavel }
      });

      totalAtualizado += updateResult.count;
      logs.push(`Vendas atualizadas para a conta ${nomeAmigavel}: ${updateResult.count}`);
    }

    return NextResponse.json({
      success: true,
      message: `Tudo corrigido! Total de vendas atualizadas: ${totalAtualizado}`,
      logs
    });

  } catch (error) {
    console.error("Erro ao consertar contas da Shopee:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}
