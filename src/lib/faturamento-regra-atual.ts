/**
 * Leva os documentos já importados para a regra de faturamento atual.
 *
 * A regra v2 mudou UMA coisa: a devolução de venda (tpNF 0, finNFe 4, CFOP
 * 1.202/2.202...) passou a abater o faturamento do mês. Na v1 ela foi gravada como
 * ENTRADA. Sem esta atualização, só os XMLs reimportados entrariam na regra nova,
 * e o mesmo mês mostraria um número diferente conforme a ordem dos uploads.
 *
 * O QUE FAZ, em ordem:
 *
 * 1. Reclassifica, pela própria `classificarFaturamento`, só as linhas que a v2
 *    pode mudar: v1, ENTRADA, tpNF 0, finNFe 4 e emitidas pela empresa. Uma regra
 *    só, sem cópia em SQL que pudesse divergir. Devolução de venda sem assinatura
 *    validada (linha de antes da verificação XMLDSig) vira ASSINATURA_NAO_VALIDADA
 *    e não abate, como a migration de 18/09 fez com as vendas nessa situação;
 *    reenviar o XML a verifica e a reclassifica.
 * 2. Marca todas as outras linhas da v1 como v2: para elas as duas versões dão o
 *    mesmo resultado, e `versaoRegra < atual` volta a significar "falta
 *    reprocessar".
 * 3. Reapura cada competência que ganhou devolução, pela mesma
 *    `apurarCompetencia` da importação. Mês congelado por declaração mantém o
 *    valor declarado e passa a mostrar a divergência, como com XML tardio.
 *
 * Idempotente e seguro com mais de uma réplica: as atualizações são condicionais
 * e a reapuração usa o lock da competência. Roda uma vez por processo, ao subir o
 * servidor (`instrumentation.ts`), e de novo na primeira leitura do faturamento
 * se a primeira tentativa falhou.
 */

import prisma from "./prisma";
import { apurarCompetencia } from "./fiscal-xml-import";
import {
  AMBIENTE_PRODUCAO,
  FINALIDADE_DEVOLUCAO,
  MOTIVO_EXCLUSAO,
  OPERACAO_ENTRADA,
  VERSAO_REGRA_FATURAMENTO,
  classificarFaturamento,
} from "./faturamento-regras";

export type ResultadoRegraAtual = {
  reclassificados: number;
  competenciasReapuradas: number;
};

/** O que a v1 gravou como ENTRADA e a v2 pode transformar em devolução de venda. */
const CANDIDATA_V1 = {
  motivoExclusao: MOTIVO_EXCLUSAO.ENTRADA,
  tipoOperacao: OPERACAO_ENTRADA,
  finalidade: FINALIDADE_DEVOLUCAO,
  vinculoEmpresa: "EMITENTE",
} as const;

export async function atualizarDocumentosParaRegraAtual(): Promise<ResultadoRegraAtual> {
  const candidatas = await prisma.documentoFiscal.findMany({
    where: {
      ...CANDIDATA_V1,
      versaoRegra: { lt: VERSAO_REGRA_FATURAMENTO },
    },
    select: {
      id: true,
      empresaId: true,
      ano: true,
      mes: true,
      modelo: true,
      statusSefaz: true,
      cfops: true,
      situacao: true,
      assinaturaValida: true,
      importadoPorId: true,
      importadoPorNome: true,
    },
  });

  const competencias = new Map<
    string,
    { empresaId: string; ano: number; mes: number; usuarioId: string; usuarioNome: string }
  >();
  let reclassificados = 0;

  for (const documento of candidatas) {
    // Todo documento persistido é de produção: homologação é recusada na
    // importação, então o ambiente não precisou ser gravado.
    const classificacao = classificarFaturamento({
      modelo: documento.modelo,
      ambiente: AMBIENTE_PRODUCAO,
      tipoOperacao: OPERACAO_ENTRADA,
      finalidade: FINALIDADE_DEVOLUCAO,
      statusSefaz: documento.statusSefaz,
      cfops: documento.cfops,
      cancelada: documento.situacao === "CANCELADA",
      vinculo: "EMITENTE",
    });
    // Sem assinatura validada a nota não entra em conta nenhuma (os totais exigem
    // `assinaturaValida`). Gravar DEVOLUCAO_VENDA faria a lista mostrar um
    // abatimento que o total não faz; o motivo certo é pedir a reimportação.
    const motivo =
      classificacao.abateFaturamento && !documento.assinaturaValida
        ? MOTIVO_EXCLUSAO.ASSINATURA_NAO_VALIDADA
        : classificacao.motivoExclusao;

    // Condicional: se uma reimportação mexeu na linha entre a leitura e aqui, ela
    // já foi classificada pela regra atual e não é tocada de novo.
    const { count } = await prisma.documentoFiscal.updateMany({
      where: {
        id: documento.id,
        ...CANDIDATA_V1,
        versaoRegra: { lt: VERSAO_REGRA_FATURAMENTO },
      },
      data: {
        contaFaturamento: classificacao.contaFaturamento,
        motivoExclusao: motivo,
        precisaConferencia: classificacao.precisaConferencia,
        versaoRegra: VERSAO_REGRA_FATURAMENTO,
      },
    });

    if (count === 0 || motivo === MOTIVO_EXCLUSAO.ENTRADA) continue;
    reclassificados += 1;
    if (documento.empresaId) {
      competencias.set(`${documento.empresaId}:${documento.ano}:${documento.mes}`, {
        empresaId: documento.empresaId,
        ano: documento.ano,
        mes: documento.mes,
        usuarioId: documento.importadoPorId,
        usuarioNome: documento.importadoPorNome,
      });
    }
  }

  // Todo o resto da v1 já é v2. Lista explícita no lugar de `NOT { ... }`: com
  // `motivo_exclusao` nulo (as notas que somam), `NOT (motivo = 'ENTRADA' AND ...)`
  // dá NULL no Postgres, e as vendas ficariam para sempre como v1.
  await prisma.documentoFiscal.updateMany({
    where: {
      versaoRegra: { lt: VERSAO_REGRA_FATURAMENTO },
      OR: [
        { motivoExclusao: null },
        { motivoExclusao: { not: CANDIDATA_V1.motivoExclusao } },
        { tipoOperacao: { not: CANDIDATA_V1.tipoOperacao } },
        { finalidade: { not: CANDIDATA_V1.finalidade } },
        { vinculoEmpresa: { not: CANDIDATA_V1.vinculoEmpresa } },
      ],
    },
    data: { versaoRegra: VERSAO_REGRA_FATURAMENTO },
  });

  let competenciasReapuradas = 0;
  for (const competencia of competencias.values()) {
    try {
      // O autor da reapuração é quem importou a devolução: só aparece se o mês
      // ainda não tiver linha mensal, o que não acontece com XML importado.
      await apurarCompetencia(competencia, {
        usuarioId: competencia.usuarioId,
        usuarioNome: competencia.usuarioNome,
      });
      competenciasReapuradas += 1;
    } catch (erro) {
      console.error("[faturamento] Falha ao reapurar competência com devolução:", {
        empresaId: competencia.empresaId,
        ano: competencia.ano,
        mes: competencia.mes,
        erro,
      });
    }
  }

  if (reclassificados > 0) {
    console.log(
      `[faturamento] Regra v${VERSAO_REGRA_FATURAMENTO}: ${reclassificados} nota(s) de devolução ` +
        `reclassificada(s); ${competenciasReapuradas} competência(s) reapurada(s).`,
    );
  }

  return { reclassificados, competenciasReapuradas };
}

/* -------------------------------------------------------------------------- */
/*                          Uma vez por processo                               */
/* -------------------------------------------------------------------------- */

type EstadoRegra = { concluida: boolean; emAndamento: Promise<void> | null };

/** Em `globalThis` para não repetir a cada módulo recarregado no desenvolvimento. */
const escopo = globalThis as typeof globalThis & { __czRegraFaturamento?: EstadoRegra };
const estado: EstadoRegra = (escopo.__czRegraFaturamento ??= { concluida: false, emAndamento: null });

/**
 * Garante a atualização uma vez por processo. Nunca lança: quem chama é rota de
 * leitura, e uma falha aqui não pode derrubar a tela. Falhou, a próxima chamada
 * tenta de novo.
 */
export function garantirRegraFaturamentoAtual(): Promise<void> {
  if (estado.concluida) return Promise.resolve();
  if (estado.emAndamento) return estado.emAndamento;

  estado.emAndamento = atualizarDocumentosParaRegraAtual()
    .then(() => {
      estado.concluida = true;
    })
    .catch((erro) => {
      const codigo = typeof erro === "object" && erro !== null ? (erro as { code?: string }).code : null;
      // P2021/P2022: banco ainda sem a tabela fiscal (deploy no meio). Tenta depois.
      if (codigo !== "P2021" && codigo !== "P2022") {
        console.error("[faturamento] Falha ao levar documentos para a regra atual:", erro);
      }
    })
    .finally(() => {
      estado.emAndamento = null;
    });

  return estado.emAndamento;
}
