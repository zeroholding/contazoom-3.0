import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // O código original de sincronização da Shopee estava comentado pois as funções
  // da API da Shopee (getShopeeOrderList, etc) ainda não foram implementadas no lib/shopee.ts.
  // Retornando 501 Not Implemented para evitar Erro 405 e quebrar o build.
  
  return NextResponse.json(
    { 
      success: false, 
      message: "A sincronização de vendas da Shopee ainda está em desenvolvimento." 
    },
    { status: 501 }
  );
}
