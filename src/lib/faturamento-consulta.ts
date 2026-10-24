/**
 * Consultas da apuração fiscal: o que as duas rotas de leitura compartilham.
 *
 * Existe para o mapa série -> canal ser resolvido de UM jeito só. Ele é usado no
 * resumo (agrupar valor por canal) e na lista (mostrar o logo em cada linha); se
 * cada rota resolvesse por conta própria, o total do painel e a soma das linhas
 * poderiam divergir — e divergência de centavo entre dois pedaços da mesma tela é
 * o tipo de defeito que ninguém consegue reproduzir.
 */

import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { MOTIVO_QUE_ABATE } from "./faturamento-regras";
import {
  CANAL_COR,
  CANAL_LABEL,
  CANAL_LOGO,
  CANAIS_ORDEM,
  SEM_SERIE_MAPEADA,
  SEM_SERIE_MAPEADA_COR,
  SEM_SERIE_MAPEADA_LABEL,
  normalizarSerie,
  type Canal,
} from "./faturamento-canais";

/* -------------------------------------------------------------------------- */
/*                         Total da competência                               */
/* -------------------------------------------------------------------------- */

export type TotaisCompetencia = {
  /** Soma das notas de venda que contam: o bruto do mês. */
  vendas: Prisma.Decimal;
  notasVenda: number;
  /** Soma das devoluções de venda emitidas no mês, que abatem o bruto. */
  devolucoes: Prisma.Decimal;
  notasDevolucao: number;
  /** vendas − devoluções, nunca abaixo de zero. É o valor apurado. */
  liquido: Prisma.Decimal;
  /** Quanto as devoluções passaram das vendas. Zero no caso normal. */
  excedenteDevolucao: Prisma.Decimal;
  /** Documentos que compõem o líquido: vendas e devoluções. */
  documentos: number;
};

/** Cliente do Prisma ou transação: a apuração calcula sob o lock da competência. */
type LeitorDocumentos = Pick<Prisma.TransactionClient, "documentoFiscal">;

/**
 * O total apurado de uma competência. ÚNICA fonte da conta: a apuração mensal, o
 * resumo da tela e o valor manual com origem XML chamam esta função, para os três
 * números nunca divergirem.
 *
 * Devolução abate no mês EM QUE FOI EMITIDA, não no mês da venda original: é o mês
 * em que a receita foi desfeita, e o mês da venda pode já estar numa declaração
 * emitida. Se as devoluções passam das vendas, o mês fica em zero — o banco não
 * aceita faturamento negativo — e o excedente volta à parte, para a tela avisar.
 *
 * As duas consultas são sequenciais de propósito: dentro de transação interativa
 * o Prisma não paraleliza, e `Promise.all` só esconderia a ordem.
 */
export async function totaisDaCompetencia(
  db: LeitorDocumentos,
  empresaId: string,
  ano: number,
  mes: number,
): Promise<TotaisCompetencia> {
  const base = { empresaId, ano, mes, assinaturaValida: true };

  const vendas = await db.documentoFiscal.aggregate({
    where: { ...base, contaFaturamento: true },
    _sum: { valorTotal: true },
    _count: { _all: true },
  });
  const devolucoes = await db.documentoFiscal.aggregate({
    where: { ...base, motivoExclusao: MOTIVO_QUE_ABATE },
    _sum: { valorTotal: true },
    _count: { _all: true },
  });

  const totalVendas = vendas._sum.valorTotal ?? new Prisma.Decimal(0);
  const totalDevolucoes = devolucoes._sum.valorTotal ?? new Prisma.Decimal(0);
  const diferenca = totalVendas.minus(totalDevolucoes);
  const zero = new Prisma.Decimal(0);

  return {
    vendas: totalVendas,
    notasVenda: vendas._count._all,
    devolucoes: totalDevolucoes,
    notasDevolucao: devolucoes._count._all,
    liquido: diferenca.isNegative() ? zero : diferenca,
    excedenteDevolucao: diferenca.isNegative() ? diferenca.negated() : zero,
    documentos: vendas._count._all + devolucoes._count._all,
  };
}

/** Série normalizada -> canal declarado pelo escritório. */
export type MapaSerieCanal = Map<string, Canal>;

export async function carregarMapaSerieCanal(empresaId: string): Promise<MapaSerieCanal> {
  const linhas = await prisma.empresaSerieCanal.findMany({
    where: { empresaId },
    select: { serie: true, canal: true },
  });

  const mapa: MapaSerieCanal = new Map();
  for (const linha of linhas) {
    mapa.set(normalizarSerie(linha.serie), linha.canal as Canal);
  }
  return mapa;
}

/**
 * Canal de uma nota, a partir da série.
 *
 * Devolve `SEM_SERIE_MAPEADA` — que não é um canal — quando ninguém declarou a
 * série. Cair em "Outro canal" esconderia a falta de configuração: o escritório
 * nunca saberia que falta mapear, e o resumo por canal mentiria por omissão.
 */
export function resolverCanal(serie: string, mapa: MapaSerieCanal): Canal | typeof SEM_SERIE_MAPEADA {
  return mapa.get(normalizarSerie(serie)) ?? SEM_SERIE_MAPEADA;
}

export type ResumoCanal = {
  chave: Canal | typeof SEM_SERIE_MAPEADA;
  rotulo: string;
  logo: "ML" | "SP" | "TT" | null;
  cor: string;
  /** Notas de venda que somam. */
  notas: number;
  /** Líquido do canal: vendas menos devoluções da mesma série. */
  valor: number;
  /** Devoluções de venda do canal, já descontadas de `valor`. */
  notasDevolucao: number;
  devolucoes: number;
  series: string[];
};

/**
 * Agrupa o faturamento da competência por canal.
 *
 * Agrupa em SQL por série e resolve o canal em memória, em vez de fazer uma
 * consulta por canal: são poucas séries por empresa (uma, na base real), e o mapa
 * série -> canal vive na aplicação. Um GROUP BY por canal exigiria JOIN com a
 * tabela de mapa e repetiria a regra de normalização de série dentro do SQL.
 */
export async function resumirPorCanal(
  empresaId: string,
  ano: number,
  mes: number,
  mapa: MapaSerieCanal,
): Promise<ResumoCanal[]> {
  // Devolução sai da mesma série da venda (no Mercado Livre, série 2 nas duas),
  // então o canal da devolução é o canal da venda que ela desfaz, e a soma dos
  // canais continua batendo com o apurado do mês.
  const base = { empresaId, ano, mes, assinaturaValida: true };
  const [porSerie, devolucoesPorSerie] = await Promise.all([
    prisma.documentoFiscal.groupBy({
      by: ["serie"],
      where: { ...base, contaFaturamento: true },
      _sum: { valorTotal: true },
      _count: { _all: true },
    }),
    prisma.documentoFiscal.groupBy({
      by: ["serie"],
      where: { ...base, motivoExclusao: MOTIVO_QUE_ABATE },
      _sum: { valorTotal: true },
      _count: { _all: true },
    }),
  ]);

  type Acumulado = {
    notas: number;
    vendasCentavos: number;
    notasDevolucao: number;
    devolucoesCentavos: number;
    series: Set<string>;
  };
  const acumulado = new Map<Canal | typeof SEM_SERIE_MAPEADA, Acumulado>();
  const doCanal = (serie: string) => {
    const canal = resolverCanal(serie, mapa);
    const atual = acumulado.get(canal) ?? {
      notas: 0,
      vendasCentavos: 0,
      notasDevolucao: 0,
      devolucoesCentavos: 0,
      series: new Set<string>(),
    };
    atual.series.add(normalizarSerie(serie));
    acumulado.set(canal, atual);
    return atual;
  };
  // Em centavos inteiros: somar reais em ponto flutuante e depois subtrair deixava
  // resto de 0,0000001 que aparecia como "-R$ 0,00".
  const centavos = (valor: Prisma.Decimal | null) =>
    Math.round(Number(valor ?? 0) * 100);

  for (const linha of porSerie) {
    const atual = doCanal(linha.serie);
    atual.notas += linha._count._all;
    atual.vendasCentavos += centavos(linha._sum.valorTotal);
  }
  for (const linha of devolucoesPorSerie) {
    const atual = doCanal(linha.serie);
    atual.notasDevolucao += linha._count._all;
    atual.devolucoesCentavos += centavos(linha._sum.valorTotal);
  }

  /*
   * Canal declarado aparece mesmo com zero nota.
   *
   * Se o escritório mapeou a série 3 para a Shopee e a Shopee não faturou no mês,
   * a linha com zero é informação: "está configurado e não veio nada" é diferente
   * de "não está configurado". A maquete já se comportava assim, mostrando Shopee
   * e TikTok zerados.
   */
  const canaisDeclarados = new Set<Canal>(mapa.values());

  const resultado: ResumoCanal[] = [];

  for (const canal of CANAIS_ORDEM) {
    const dados = acumulado.get(canal);
    if (!dados && !canaisDeclarados.has(canal)) continue;

    const seriesDoCanal = [...mapa.entries()]
      .filter(([, valor]) => valor === canal)
      .map(([serie]) => serie)
      .sort((a, b) => Number(a) - Number(b));

    resultado.push({
      chave: canal,
      rotulo: CANAL_LABEL[canal],
      logo: CANAL_LOGO[canal],
      cor: CANAL_COR[canal],
      notas: dados?.notas ?? 0,
      valor: dados ? (dados.vendasCentavos - dados.devolucoesCentavos) / 100 : 0,
      notasDevolucao: dados?.notasDevolucao ?? 0,
      devolucoes: dados ? dados.devolucoesCentavos / 100 : 0,
      series: seriesDoCanal,
    });
  }

  const semSerie = acumulado.get(SEM_SERIE_MAPEADA);
  if (semSerie) {
    resultado.push({
      chave: SEM_SERIE_MAPEADA,
      rotulo: SEM_SERIE_MAPEADA_LABEL,
      logo: null,
      cor: SEM_SERIE_MAPEADA_COR,
      notas: semSerie.notas,
      valor: (semSerie.vendasCentavos - semSerie.devolucoesCentavos) / 100,
      notasDevolucao: semSerie.notasDevolucao,
      devolucoes: semSerie.devolucoesCentavos / 100,
      series: [...semSerie.series].sort((a, b) => Number(a) - Number(b)),
    });
  }

  return resultado;
}

export type LinhaForaDoFaturamento = {
  code: string;
  quantos: number;
  valor: number;
};

/**
 * O que entrou e não somou, agrupado pelo motivo.
 *
 * Este é o painel mais importante da tela, e não é enfeite: 822 arquivos
 * importados com 366 somando parece arquivo perdido. Sem o agrupamento por motivo,
 * a diferença não tem explicação e o operador conclui que o sistema comeu nota.
 *
 * Devolução de venda NÃO entra aqui: ela não fica fora da conta, ela subtrai. Tem
 * painel próprio, com o valor abatido.
 */
export async function resumirForaDoFaturamento(
  empresaId: string,
  ano: number,
  mes: number,
): Promise<LinhaForaDoFaturamento[]> {
  const [documentos, ignorados, eventos] = await Promise.all([
    prisma.documentoFiscal.groupBy({
      by: ["motivoExclusao"],
      where: {
        empresaId,
        ano,
        mes,
        contaFaturamento: false,
        motivoExclusao: { not: MOTIVO_QUE_ABATE },
      },
      _sum: { valorTotal: true },
      _count: { _all: true },
    }),
    prisma.arquivoFiscalIgnorado.groupBy({
      by: ["motivoExclusao"],
      where: { empresaId, ano, mes },
      _sum: { valorTotal: true },
      _count: { _all: true },
    }),
    prisma.eventoFiscal.count({ where: { empresaId, ano, mes } }),
  ]);

  const acumulado = new Map<string, LinhaForaDoFaturamento>();
  for (const grupo of [...documentos, ...ignorados]) {
    if (!grupo.motivoExclusao) continue;
    const atual = acumulado.get(grupo.motivoExclusao) ?? {
      code: grupo.motivoExclusao,
      quantos: 0,
      valor: 0,
    };
    atual.quantos += grupo._count._all;
    atual.valor += Number(grupo._sum.valorTotal ?? 0);
    acumulado.set(grupo.motivoExclusao, atual);
  }
  if (eventos > 0) {
    acumulado.set("ARQUIVO_EVENTO", {
      code: "ARQUIVO_EVENTO",
      quantos: eventos,
      valor: 0,
    });
  }

  return [...acumulado.values()].sort((a, b) => b.quantos - a.quantos);
}

/**
 * Competências que têm documento OU valor mensal definido.
 *
 * O código anterior consultava só `documento_fiscal`. Isso tornava o caminho
 * manual inalcançável: o PUT criava o mês sem XML, mas ele não aparecia no
 * seletor e sumia na próxima carga — exatamente o caso de empresa de serviço e
 * mês anterior à adoção do sistema.
 */
export async function competenciasComDocumento(
  empresaId: string,
): Promise<Array<{ ano: number; mes: number }>> {
  const [documentos, ignorados, eventos, mensais] = await Promise.all([
    prisma.documentoFiscal.groupBy({
      by: ["ano", "mes"],
      where: { empresaId },
    }),
    prisma.arquivoFiscalIgnorado.groupBy({
      by: ["ano", "mes"],
      where: { empresaId },
    }),
    prisma.eventoFiscal.groupBy({
      by: ["ano", "mes"],
      where: { empresaId },
    }),
    prisma.faturamentoMensal.findMany({
      where: { empresaId },
      select: { ano: true, mes: true },
    }),
  ]);

  const unicas = new Map<string, { ano: number; mes: number }>();
  for (const item of [...documentos, ...ignorados, ...eventos, ...mensais]) {
    unicas.set(`${item.ano}-${item.mes}`, { ano: item.ano, mes: item.mes });
  }

  return [...unicas.values()].sort((a, b) => b.ano - a.ano || b.mes - a.mes);
}
