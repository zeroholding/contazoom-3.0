import prisma from "@/lib/prisma";

/** `tipoAlteracao` das linhas criadas por "Usar custo em vendas passadas". */
export const TIPO_CUSTO_RETROATIVO = "retroativo";

/**
 * Uma linha de `sku_custo_historico`, só com o que a resolução do custo usa.
 *
 * - Sem `vigenciaInicio`: mudança comum de custo. Vale de `createdAt` em diante.
 * - Com `vigenciaInicio`: custo usado em vendas PASSADAS. Vale para as vendas de
 *   `[vigenciaInicio, vigenciaFim)` e nunca depois de `createdAt` (o momento em
 *   que foi aplicado), então não mexe no custo das vendas futuras.
 */
export type LinhaHistoricoCusto = {
  custoNovo: number | { toString(): string };
  createdAt: Date | string;
  vigenciaInicio?: Date | string | null;
  vigenciaFim?: Date | string | null;
};

type PontoDaLinhaDoTempo = { desde: number; custo: number };
type CustoNoPassado = { inicio: number; fim: number; custo: number; decididoEm: number };

const ms = (valor: Date | string) => new Date(valor).getTime();

/**
 * Monta a função "custo deste SKU na data da venda".
 *
 * A linha do tempo das mudanças comuns segue a regra de sempre: vale o último
 * custo lançado até a data; venda anterior ao primeiro custo usa o primeiro;
 * custos zerados antes do primeiro custo real são ignorados; sem histórico, o
 * custo atual vale para qualquer data.
 *
 * Por cima dela entram os custos usados no passado. Para cada venda vence a
 * decisão MAIS RECENTE que cobre a data: um custo aplicado no passado vence a
 * mudança comum que estava valendo naquela data se foi decidido depois dela; uma
 * mudança comum feita depois volta a valer daí em diante. Assim corrigir o
 * primeiro custo errado ("desde o início") troca o CMV de todo o histórico, e um
 * período só troca o CMV daquele período.
 */
export function montarResolvedorDeCusto(
  custoAtual: number,
  historico: LinhaHistoricoCusto[],
): (dataVenda: Date) => number {
  const comuns: PontoDaLinhaDoTempo[] = historico
    .filter((linha) => !linha.vigenciaInicio)
    .map((linha) => ({ desde: ms(linha.createdAt), custo: Number(linha.custoNovo) }))
    .sort((a, b) => a.desde - b.desde);

  const primeiroCustoReal = comuns.findIndex((ponto) => ponto.custo > 0);
  let linhaDoTempo = primeiroCustoReal > 0 ? comuns.slice(primeiroCustoReal) : comuns;
  if (primeiroCustoReal === -1 && custoAtual > 0) linhaDoTempo = [];

  // Sem histórico: o custo atual vale para todas as datas. Não é uma decisão
  // datada, então qualquer custo aplicado no passado passa por cima dele.
  const semHistorico = linhaDoTempo.length === 0;
  if (semHistorico) linhaDoTempo = [{ desde: 0, custo: custoAtual }];

  const noPassado: CustoNoPassado[] = historico
    .filter((linha) => linha.vigenciaInicio)
    .map((linha) => {
      const decididoEm = ms(linha.createdAt);
      const fimInformado = linha.vigenciaFim ? ms(linha.vigenciaFim) : Infinity;
      return {
        inicio: ms(linha.vigenciaInicio as Date | string),
        fim: Math.min(fimInformado, decididoEm),
        custo: Number(linha.custoNovo),
        decididoEm,
      };
    })
    .filter((ajuste) => ajuste.fim > ajuste.inicio && Number.isFinite(ajuste.custo))
    // Mais recente primeiro: o primeiro que cobre a data é o que vale.
    .sort((a, b) => b.decididoEm - a.decididoEm);

  return (dataVenda: Date) => {
    const t = dataVenda.getTime();

    // Último custo comum lançado até a data (busca binária).
    let lo = 0;
    let hi = linhaDoTempo.length - 1;
    let achado = -1;
    while (lo <= hi) {
      const meio = (lo + hi) >> 1;
      if (linhaDoTempo[meio].desde <= t) {
        achado = meio;
        lo = meio + 1;
      } else {
        hi = meio - 1;
      }
    }

    // Venda anterior ao primeiro custo: o primeiro custo vale para trás, mas
    // sem data de decisão (perde para qualquer custo aplicado no passado).
    const custoComum = achado >= 0 ? linhaDoTempo[achado].custo : linhaDoTempo[0].custo;
    const decididoEm = achado >= 0 && !semHistorico ? linhaDoTempo[achado].desde : -Infinity;

    for (const ajuste of noPassado) {
      if (ajuste.decididoEm <= decididoEm) break;
      if (t >= ajuste.inicio && t < ajuste.fim) return ajuste.custo;
    }
    return custoComum;
  };
}

/**
 * Custo de cada SKU na data de cada venda, para um conjunto de códigos.
 *
 * Lê `sku_custo_historico` uma vez e devolve `getCostAtDate`, usado por todas as
 * telas que calculam CMV (vendas, dashboard, DRE, top produtos) e pelo sync do
 * TikTok. Vendas passadas usam o custo que valia na data delas, não o atual.
 */
export async function buildHistoricalCostMap(userId: string, skuCodes: string[]) {
  if (skuCodes.length === 0) {
    return {
      getCostAtDate: () => 0,
      getCurrentCost: () => 0,
    };
  }

  const skus = await prisma.sKU.findMany({
    where: { userId, sku: { in: skuCodes } },
    select: {
      sku: true,
      custoUnitario: true,
      custoHistorico: {
        orderBy: { createdAt: "asc" },
        select: { custoNovo: true, createdAt: true, vigenciaInicio: true, vigenciaFim: true },
      },
    },
  });

  const resolvedores = new Map<string, (dataVenda: Date) => number>();
  const currentCosts = new Map<string, number>();

  for (const sku of skus) {
    const currentCost = Number(sku.custoUnitario) || 0;
    currentCosts.set(sku.sku, currentCost);
    resolvedores.set(sku.sku, montarResolvedorDeCusto(currentCost, sku.custoHistorico));
  }

  return {
    /** Custo que valia para o SKU na data da venda (0 se o SKU não existe). */
    getCostAtDate(skuCode: string, saleDate: Date): number {
      const resolver = resolvedores.get(skuCode);
      return resolver ? resolver(saleDate) : 0;
    },

    /** Custo atual do SKU. */
    getCurrentCost(skuCode: string): number {
      return currentCosts.get(skuCode) || 0;
    },
  };
}
