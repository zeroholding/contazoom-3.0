import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import { listTaxAccounts } from "@/lib/aliquota-imposto";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get("session")?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let userId: string;
  try {
    const session = await verifySessionToken(sessionCookie);
    userId = session.sub;
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const contas = await listTaxAccounts(userId);

    return NextResponse.json({ data: contas });
  } catch (error) {
    console.error("Erro ao buscar contas para alíquotas:", error);
    return NextResponse.json(
      { error: "Erro ao buscar contas autenticadas" },
      { status: 500 },
    );
  }
}
