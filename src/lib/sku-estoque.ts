import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { diaSP, inicioDoDiaSP } from "./sku-custo-periodo";
import { linhasVendasEstoque } from "./sku-estoque-vendas";

const DIA_MS = 86_400_000;
export const MOVIMENTOS_POR_PAGINA = 30;

export class EstoqueErro extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function somarDias(dia: string, dias: number): string {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

export function dataDeEstoque(valor: unknown): valor is string {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00Z`);
  return valor >= "1900-01-01" && !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

export type LinhaEstoque = {
  id: string;
  sku: string;
  produto: string;
  ativo: boolean;
  inicioEstoque: string | null;
  saldo: number | null;
  custo: number;
  valorEstoque: number | null;
  vendidos: number;
  custoVendas: number;
  media30: number;
  cobertura: number | null;
  esgotamento: string | null;
};

export type MovimentoEstoque = {
  id: string;
  tipo: string;
  quantidade: number;
  data: string;
  canal: string | null;
  pedidoId: string | null;
  observacao: string | null;
};

export async function consultarEstoque(userId: string, de: string, ate: string, agora = new Date()): Promise<LinhaEstoque[]> {
  const hoje = diaSP(agora);
  const inicio30 = inicioDoDiaSP(somarDias(hoje, -29));
  const inicio = inicioDoDiaSP(de);
  const fim = inicioDoDiaSP(somarDias(ate, 1));
  const inicioConsulta = inicio < inicio30 ? inicio : inicio30;

  const rows = await prisma.$queryRaw<Array<{
    id: string; sku: string; produto: string; ativo: boolean; custo: Prisma.Decimal;
    saldo: bigint | null; abertura: string | null; vendidos: bigint; vendidos30: bigint;
  }>>(Prisma.sql`
    WITH vendas AS (${linhasVendasEstoque(userId, inicioConsulta, agora)}),
    demanda AS (
      SELECT sku,
        COALESCE(SUM(quantidade) FILTER (WHERE data_venda >= ${inicio} AND data_venda < ${fim}), 0)::bigint AS vendidos,
        COALESCE(SUM(quantidade) FILTER (WHERE data_venda >= ${inicio30}), 0)::bigint AS vendidos30
      FROM vendas WHERE quantidade > 0 AND sku IS NOT NULL GROUP BY sku
    ),
    saldos AS (
      SELECT m.sku_id, SUM(m.quantidade)::bigint AS saldo,
        MIN(m.data_base) FILTER (WHERE m.tipo = 'inicial')::text AS abertura
      FROM sku_estoque_movimento m JOIN sku s ON s.id = m.sku_id AND s.user_id = ${userId}
      GROUP BY m.sku_id
    )
    SELECT s.id, s.sku, s.produto, s.ativo, s.custo_unitario AS custo, b.saldo, b.abertura,
      COALESCE(d.vendidos, 0) AS vendidos, COALESCE(d.vendidos30, 0) AS vendidos30
    FROM sku s LEFT JOIN saldos b ON b.sku_id = s.id LEFT JOIN demanda d ON d.sku = s.sku
    WHERE s.user_id = ${userId} ORDER BY s.sku, s.id
  `);

  return rows.map((r) => {
    const saldo = r.saldo === null ? null : Number(r.saldo);
    const vendidos = Number(r.vendidos);
    const media30 = Number(r.vendidos30) / 30;
    const cobertura = saldo === null ? null : saldo <= 0 ? 0 : media30 > 0 ? saldo / media30 : null;
    // Datas fora da faixa suportada pela interface não são exibidas.
    const esgotamento = cobertura !== null && cobertura < 365_000 ? somarDias(hoje, Math.ceil(cobertura)) : null;
    return {
      id: r.id, sku: r.sku, produto: r.produto, ativo: r.ativo,
      inicioEstoque: r.abertura, saldo, custo: Number(r.custo), vendidos,
      valorEstoque: saldo === null ? null : r.custo.times(Math.max(saldo, 0)).toNumber(),
      custoVendas: r.custo.times(vendidos).toNumber(),
      media30, cobertura, esgotamento,
    };
  });
}

export async function historicoEstoque(userId: string, skuId: string, pagina: number) {
  const where = { skuId, sku: { userId } };
  const [sku, rows, total] = await prisma.$transaction([
    prisma.sKU.findFirst({ where: { id: skuId, userId }, select: { id: true } }),
    prisma.skuEstoqueMovimento.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (pagina - 1) * MOVIMENTOS_POR_PAGINA, take: MOVIMENTOS_POR_PAGINA,
    }),
    prisma.skuEstoqueMovimento.count({ where }),
  ]);
  if (!sku) throw new EstoqueErro("SKU não encontrado.", 404);
  const movimentos: MovimentoEstoque[] = rows.map((r) => ({
    id: r.id, tipo: r.tipo, quantidade: Number(r.quantidade), data: r.dataBase.toISOString().slice(0, 10),
    canal: r.canal, pedidoId: r.pedidoId, observacao: r.observacao,
  }));
  return { movimentos, total, porPagina: MOVIMENTOS_POR_PAGINA };
}

async function bloquearEstoque(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('sku-estoque'), hashtext(${userId}))::text`;
}

export async function movimentarEstoque(userId: string, mov: {
  id: string; skuId: string; tipo: "inicial" | "entrada" | "saida";
  quantidade: number; data: string; observacao: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    await bloquearEstoque(tx, userId);
    const sku = await tx.sKU.findFirst({ where: { id: mov.skuId, userId }, select: { id: true } });
    if (!sku) throw new EstoqueErro("SKU não encontrado.", 404);

    const anterior = await tx.skuEstoqueMovimento.findUnique({ where: { id: mov.id } });
    const quantidade = BigInt(mov.tipo === "saida" ? -mov.quantidade : mov.quantidade);
    const dataBase = new Date(`${mov.data}T00:00:00Z`);
    if (anterior) {
      if (anterior.skuId === sku.id && anterior.tipo === mov.tipo && anterior.quantidade === quantidade &&
          anterior.dataBase.getTime() === dataBase.getTime() && anterior.observacao === mov.observacao) return;
      throw new EstoqueErro("Este lançamento já foi enviado com outros dados.", 409);
    }

    const abertura = await tx.skuEstoqueMovimento.findFirst({ where: { skuId: sku.id, tipo: "inicial" } });
    if ((mov.tipo === "inicial") === Boolean(abertura)) {
      throw new EstoqueErro(abertura ? "O saldo inicial deste SKU já foi registrado." : "Informe o saldo inicial antes de movimentar.", 409);
    }
    if (abertura && dataBase < abertura.dataBase) throw new EstoqueErro("A data da movimentação é anterior à abertura do estoque.");
    if (mov.tipo === "saida") {
      const { _sum } = await tx.skuEstoqueMovimento.aggregate({ where: { skuId: sku.id }, _sum: { quantidade: true } });
      if ((_sum.quantidade ?? BigInt(0)) < -quantidade) throw new EstoqueErro("Saldo insuficiente para esta saída.", 409);
    }
    await tx.skuEstoqueMovimento.create({
      data: { id: mov.id, skuId: sku.id, tipo: mov.tipo, quantidade, dataBase, observacao: mov.observacao },
    });
  });
}

export async function processarVendasEstoque(userId: string, agora = new Date()) {
  return prisma.$transaction(async (tx) => {
    await bloquearEstoque(tx, userId);
    const inicio = await tx.skuEstoqueMovimento.findFirst({
      where: { tipo: "inicial", sku: { userId } }, orderBy: { dataBase: "asc" }, select: { dataBase: true },
    });
    if (!inicio) throw new EstoqueErro("Cadastre o saldo inicial de pelo menos um SKU.", 409);

    const [resultado] = await tx.$queryRaw<Array<{ movimentos: number; unidades: bigint; semEstoqueAberto: number }>>(Prisma.sql`
      WITH linhas AS (${linhasVendasEstoque(userId, inicioDoDiaSP(inicio.dataBase.toISOString().slice(0, 10)), agora)}),
      agrupadas AS (
        SELECT canal, pedido_id, sku, MIN(data_venda) AS data_venda, SUM(quantidade)::bigint AS quantidade
        FROM linhas WHERE quantidade > 0 GROUP BY canal, pedido_id, sku
      ),
      candidatas AS (
        SELECT a.*, s.id AS sku_id, i.data_base AS abertura,
          (a.data_venda AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS dia
        FROM agrupadas a
        LEFT JOIN sku s ON s.user_id = ${userId} AND s.sku = a.sku
        LEFT JOIN sku_estoque_movimento i ON i.sku_id = s.id AND i.tipo = 'inicial'
      ),
      baixas AS (
        INSERT INTO sku_estoque_movimento (id, sku_id, tipo, quantidade, data_base, canal, pedido_id)
        SELECT gen_random_uuid()::text, sku_id, 'venda', -quantidade, dia, canal, pedido_id
        FROM candidatas WHERE dia >= abertura
        ON CONFLICT (sku_id, canal, pedido_id) DO NOTHING
        RETURNING quantidade
      )
      SELECT COUNT(*)::int AS movimentos, COALESCE(-SUM(quantidade), 0)::bigint AS unidades,
        (SELECT COUNT(*)::int FROM candidatas WHERE abertura IS NULL) AS "semEstoqueAberto"
      FROM baixas
    `);
    return { ...resultado, unidades: Number(resultado.unidades) };
  }, { timeout: 60_000 });
}
