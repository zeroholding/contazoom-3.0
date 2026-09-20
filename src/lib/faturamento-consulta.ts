/**
 * Consultas da apuração fiscal: o que as duas rotas de leitura compartilham.
 *
 * Existe para o mapa série -> canal ser resolvido de UM jeito só. Ele é usado no
 * resumo (agrupar valor por canal) e na lista (mostrar o logo em cada linha); se
 * cada rota resolvesse por conta própria, o total do painel e a soma das linhas
 * poderiam divergir — e divergência de centavo entre dois pedaços da mesma tela é
 * o tipo de defeito que ninguém consegue reproduzir.
 */

import prisma from "./prisma";
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
  notas: number;
  valor: number;
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
  const porSerie = await prisma.documentoFiscal.groupBy({
    by: ["serie"],
    where: {
      empresaId,
      ano,
      mes,
      contaFaturamento: true,
      assinaturaValida: true,
    },
    _sum: { valorTotal: true },
    _count: { _all: true },
  });

  const acumulado = new Map<
    Canal | typeof SEM_SERIE_MAPEADA,
    { notas: number; valor: number; series: Set<string> }
  >();

  for (const linha of porSerie) {
    const canal = resolverCanal(linha.serie, mapa);
    const atual = acumulado.get(canal) ?? { notas: 0, valor: 0, series: new Set<string>() };
    atual.notas += linha._count._all;
    atual.valor += Number(linha._sum.valorTotal ?? 0);
    atual.series.add(normalizarSerie(linha.serie));
    acumulado.set(canal, atual);
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
      valor: dados?.valor ?? 0,
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
      valor: semSerie.valor,
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
 */
export async function resumirForaDoFaturamento(
  empresaId: string,
  ano: number,
  mes: number,
): Promise<LinhaForaDoFaturamento[]> {
  const [documentos, ignorados, eventos] = await Promise.all([
    prisma.documentoFiscal.groupBy({
      by: ["motivoExclusao"],
      where: { empresaId, ano, mes, contaFaturamento: false },
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
