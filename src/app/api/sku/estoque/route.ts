import { NextResponse, type NextRequest } from "next/server";
import { tryVerifySessionToken } from "@/lib/auth";
import { diaSP } from "@/lib/sku-custo-periodo";
import { consultarEstoque, dataDeEstoque, EstoqueErro, historicoEstoque, movimentarEstoque, processarVendasEstoque } from "@/lib/sku-estoque";

function erro(error: unknown) {
  if (error instanceof EstoqueErro) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("[SKU Estoque]", error);
  return NextResponse.json({ error: "O estoque não pôde ser atualizado. Tente novamente." }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session?.sub) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  try {
    const params = req.nextUrl.searchParams;
    const skuId = params.get("skuId");
    if (skuId) {
      const pagina = Number(params.get("pagina") ?? 1);
      if (!Number.isInteger(pagina) || pagina < 1 || pagina > 1_000_000) throw new EstoqueErro("Página inválida.");
      return NextResponse.json(await historicoEstoque(session.sub, skuId, pagina));
    }

    const de = params.get("de");
    const ate = params.get("ate");
    const agora = new Date();
    if (!dataDeEstoque(de) || !dataDeEstoque(ate) || de > ate || ate > diaSP(agora)) {
      throw new EstoqueErro("Informe um período válido até hoje.");
    }
    return NextResponse.json({ linhas: await consultarEstoque(session.sub, de, ate, agora) });
  } catch (error) {
    return erro(error);
  }
}

export async function POST(req: NextRequest) {
  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session?.sub) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  try {
    const body = await req.json().catch(() => null);
    if (body?.acao === "processar") {
      return NextResponse.json(await processarVendasEstoque(session.sub));
    }
    const { id, skuId, tipo, quantidade, data, observacao } = body ?? {};
    if (typeof id !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) ||
        typeof skuId !== "string" || !skuId || (tipo !== "inicial" && tipo !== "entrada" && tipo !== "saida")) {
      throw new EstoqueErro("Movimentação inválida.");
    }
    if (!Number.isInteger(quantidade) || quantidade < (tipo === "inicial" ? 0 : 1) || quantidade > 1_000_000_000) {
      throw new EstoqueErro(tipo === "inicial" ? "Informe um saldo inicial inteiro de 0 a 1 bilhão." : "Informe uma quantidade inteira de 1 a 1 bilhão.");
    }
    if (!dataDeEstoque(data) || data > diaSP(new Date())) throw new EstoqueErro("Informe uma data válida até hoje.");
    if (observacao != null && (typeof observacao !== "string" || observacao.length > 300)) {
      throw new EstoqueErro("A observação deve ter até 300 caracteres.");
    }
    await movimentarEstoque(session.sub, { id, skuId, tipo, quantidade, data, observacao: observacao?.trim() || null });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return erro(error);
  }
}
