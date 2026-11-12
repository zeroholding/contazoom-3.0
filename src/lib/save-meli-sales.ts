import type { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { calculateMargemContribuicao } from "@/utils/calc-margem-contribuicao";
import { ratearFreteMeli } from "./meli-freight-allocation";
import { devePreservarPrazoMeli } from "./prazo-despacho";
import prisma from "./prisma";

type VendaPreparada = {
  orderId: string;
  createData: Prisma.MeliVendaUncheckedCreateInput;
  updateData: Prisma.MeliVendaUncheckedUpdateInput;
};

type Envio = { meliAccountId: string; shippingId: string | null };

function chaveEnvio({ meliAccountId, shippingId }: Envio) {
  return JSON.stringify([meliAccountId, shippingId]);
}

function freteOriginal(rawData: Prisma.JsonValue, logisticType: string | null) {
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) return null;
  const freight = rawData.freight;
  if (!freight || typeof freight !== "object" || Array.isArray(freight)) return null;

  const tipo = (logisticType ?? "").toLowerCase();
  const custoVendedor = freight.sellerShippingCost;
  if (tipo !== "flex" && tipo !== "self_service" && typeof custoVendedor === "number") {
    return { valor: new Decimal(custoVendedor).negated().toDecimalPlaces(2), real: true };
  }

  return typeof freight.adjustedCost === "number"
    ? { valor: new Decimal(freight.adjustedCost).toDecimalPlaces(2), real: false }
    : null;
}

export async function salvarLoteVendasMeli(userId: string, vendas: VendaPreparada[]) {
  return prisma.$transaction(async (tx) => {
    // Os dois fluxos de sync podem receber partes do mesmo envio em lotes
    // diferentes. Leia e rateie o grupo após gravar o lote, sob o mesmo lock.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('meli-freight'), hashtext(${userId}))::text`;
    const existentes = await tx.meliVenda.findMany({
      where: { orderId: { in: vendas.map(({ orderId }) => orderId) } },
      select: {
        orderId: true, userId: true, prazoDespachoOrigem: true,
        meliAccountId: true, shippingId: true,
      },
    });
    const porPedido = new Map(existentes.map((venda) => [venda.orderId, venda]));
    const novas = vendas.filter(({ orderId }) => !porPedido.has(orderId));
    const atualizadas = vendas.filter(({ orderId }) => porPedido.get(orderId)?.userId === userId);
    const ignoradas = vendas.length - novas.length - atualizadas.length;
    if (ignoradas > 0) {
      console.warn(`[ML Sync] ${ignoradas} pedido(s) pertencem a outro usuário e foram ignorados.`);
    }

    const criadas = novas.length
      ? (await tx.meliVenda.createMany({ data: novas.map(({ createData }) => createData), skipDuplicates: true })).count
      : 0;
    await Promise.all(atualizadas.map(({ orderId, updateData }) => {
      const data = { ...updateData, atualizadoEm: new Date() };
      if (devePreservarPrazoMeli(
        porPedido.get(orderId)?.prazoDespachoOrigem ?? null,
        String(data.prazoDespachoOrigem ?? ""),
      )) {
        delete data.prazoDespacho;
        delete data.prazoDespachoOrigem;
      }
      return tx.meliVenda.update({ where: { orderId, userId }, data, select: { id: true } });
    }));

    const gravadas = [...novas, ...atualizadas];
    const pedidosDoLote = new Set(gravadas.map(({ orderId }) => orderId));
    const envios = new Map<string, Envio>();
    for (const venda of gravadas) {
      const anterior = porPedido.get(venda.orderId);
      const atual = {
        meliAccountId: anterior?.meliAccountId ?? venda.createData.meliAccountId,
        shippingId: venda.createData.shippingId ?? null,
      };
      for (const envio of [anterior, atual]) {
        if (envio?.shippingId) envios.set(chaveEnvio(envio), {
          meliAccountId: envio.meliAccountId, shippingId: envio.shippingId,
        });
      }
    }
    if (envios.size === 0) return criadas + atualizadas.length;

    const linhas = await tx.meliVenda.findMany({
      where: { userId, OR: [...envios.values()] },
      orderBy: { orderId: "asc" },
      select: {
        orderId: true, meliAccountId: true, shippingId: true, logisticType: true,
        rawData: true, valorTotal: true, taxaPlataforma: true, cmv: true, frete: true,
      },
    });
    const grupos = new Map<string, typeof linhas>();
    for (const linha of linhas) {
      const chave = chaveEnvio(linha);
      const grupo = grupos.get(chave) ?? [];
      grupo.push(linha);
      grupos.set(chave, grupo);
    }

    for (const grupo of grupos.values()) {
      if (grupo.length === 1 && pedidosDoLote.has(grupo[0].orderId)) continue;
      const custos = grupo.flatMap((linha) => {
        const custo = freteOriginal(linha.rawData, linha.logisticType);
        return custo ? [{ ...custo, recente: pedidosDoLote.has(linha.orderId) }] : [];
      });
      // Priorize o custo informado pelo endpoint /costs. Entre valores da
      // mesma fonte, priorize os recém-consultados.
      custos.sort((a, b) => Number(b.real) - Number(a.real)
        || Number(b.recente) - Number(a.recente));
      const total = custos[0]?.valor;
      if (!total) continue;

      const parcelas = ratearFreteMeli(total, grupo.map(({ valorTotal }) => valorTotal));
      await Promise.all(grupo.map((linha, indice) => {
        const frete = parcelas[indice];
        if (frete.eq(linha.frete)) return;
        const margem = calculateMargemContribuicao(
          linha.valorTotal.toNumber(), linha.taxaPlataforma?.toNumber() ?? null,
          frete.toNumber(), linha.cmv?.toNumber() ?? null,
        );
        return tx.meliVenda.update({
          where: { orderId: linha.orderId, userId },
          data: { frete, margemContribuicao: margem.valor, isMargemReal: margem.isMargemReal },
          select: { id: true },
        });
      }));
    }
    return criadas + atualizadas.length;
  }, { isolationLevel: "ReadCommitted", timeout: 30_000 });
}
