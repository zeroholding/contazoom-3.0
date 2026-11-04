/**
 * Leva os documentos já importados para a regra de faturamento atual.
 *
 * A regra v2 mudou UMA coisa: a devolução de venda (tpNF 0, finNFe 4, CFOP
 * 1.202/2.202...) passou a abater o faturamento do mês. Na v1 ela foi gravada como
 * ENTRADA. Sem esta atualização, só os XMLs reimportados entrariam na regra nova,
 * e o mesmo mês mostraria um número diferente conforme a ordem dos uploads.
 *
 * A regra v3 mudou o outro lado: vendas com ST (5.405/6.404...) passaram a somar,
 * transferências (5.15x...) deixaram de somar e as devoluções das vendas com ST
 * (1.410/1.411...) passaram a abater. Documento importado sob a regra antiga
 * teria o número errado até ser reimportado — por isso o segundo passe abaixo.
 *
 * O QUE FAZ, em ordem:
 *
 * 1. Reclassifica, pela própria `classificarFaturamento`, só as linhas que a v2
 *    pode mudar: v1, ENTRADA, tpNF 0, finNFe 4 e emitidas pela empresa. Uma regra
 *    só, sem cópia em SQL que pudesse divergir. Devolução de venda sem assinatura
 *    validada (linha de antes da verificação XMLDSig) vira ASSINATURA_NAO_VALIDADA
 *    e não abate, como a migration de 18/09 fez com as vendas nessa situação;
 *    reenviar o XML a verifica e a reclassifica.
 * 2. Reclassifica as linhas com CFOP cujo resultado mudou na v3 (as listas de
 *    venda, não-soma e devolução da base de CFOP). É o recorte que evita
 *    reprocessar a base inteira: nota cujo resultado muda sempre tem pelo menos
 *    um desses CFOPs.
 * 3. Marca todas as outras linhas com versão antiga como atual: para elas as
 *    versões dão o mesmo resultado, e `versaoRegra < atual` volta a significar
 *    "falta reprocessar".
 * 4. Reapura cada competência que mudou, pela mesma `apurarCompetencia` da
 *    importação. Mês congelado por declaração mantém o valor declarado e passa a
 *    mostrar a divergência, como com XML tardio.
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
  CFOPS_NAO_SOMA,
  CFOPS_VENDA_COMBUSTIVEL,
  CFOPS_VENDA_EXTERIOR,
  CFOPS_VENDA_ST,
  FINALIDADE_DEVOLUCAO,
  MOTIVO_EXCLUSAO,
  OPERACAO_ENTRADA,
  VERSAO_REGRA_FATURAMENTO,
  classificarFaturamento,
  type VinculoEmpresa,
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

/**
 * CFOPs cujo resultado da classificação mudou na v3: vendas com ST e demais
 * famílias de venda que não somavam, transferências que somavam e as devoluções
 * que passaram a abater.
 *
 * Toda nota cujo resultado muda tem pelo menos um deles — é o recorte do segundo
 * passe, no lugar de reclassificar a base inteira.
 */
const CFOPS_AFETADOS_V3: readonly string[] = [
  ...CFOPS_VENDA_ST,
  ...CFOPS_VENDA_COMBUSTIVEL,
  ...CFOPS_VENDA_EXTERIOR,
  ...CFOPS_NAO_SOMA,
  // Devoluções que passaram a abater na v3 (a ST e a do exterior).
  "1410", "1411", "2410", "2411", "3201", "3202",
];

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

  /*
   * v3: linhas com CFOP cujo resultado mudou — vendas com ST que não somavam,
   * transferências que somavam, devoluções que não abatiam. Toda nota cujo
   * resultado muda tem pelo menos um desses CFOPs, então o recorte não deixa
   * nada passar sem reclassificar a base inteira.
   */
  const candidatasV3 = await prisma.documentoFiscal.findMany({
    where: {
      versaoRegra: { lt: VERSAO_REGRA_FATURAMENTO },
      cfops: { hasSome: [...CFOPS_AFETADOS_V3] },
    },
    select: {
      id: true,
      empresaId: true,
      ano: true,
      mes: true,
      modelo: true,
      tipoOperacao: true,
      finalidade: true,
      statusSefaz: true,
      cfops: true,
      situacao: true,
      vinculoEmpresa: true,
      contaFaturamento: true,
      motivoExclusao: true,
      precisaConferencia: true,
      assinaturaValida: true,
      importadoPorId: true,
      importadoPorNome: true,
    },
  });

  for (const documento of candidatasV3) {
    const vinculo: VinculoEmpresa =
      documento.vinculoEmpresa === "DESTINATARIO" || documento.vinculoEmpresa === "NENHUM"
        ? documento.vinculoEmpresa
        : "EMITENTE";

    // A entrada vem do próprio registro: só o que a importação gravou. Ambiente
    // continua produção — homologação é recusada na importação.
    const classificacao = classificarFaturamento({
      modelo: documento.modelo,
      ambiente: AMBIENTE_PRODUCAO,
      tipoOperacao: documento.tipoOperacao,
      finalidade: documento.finalidade,
      statusSefaz: documento.statusSefaz,
      cfops: documento.cfops,
      cancelada: documento.situacao === "CANCELADA",
      vinculo,
    });
    // Mesma regra do passe de cima: sem assinatura validada o total não conta, e
    // gravar abatimento faria a lista mostrar um desconto que o total não faz.
    const motivo =
      classificacao.abateFaturamento && !documento.assinaturaValida
        ? MOTIVO_EXCLUSAO.ASSINATURA_NAO_VALIDADA
        : classificacao.motivoExclusao;

    const mudou =
      documento.contaFaturamento !== classificacao.contaFaturamento ||
      documento.motivoExclusao !== motivo ||
      documento.precisaConferencia !== classificacao.precisaConferencia;

    // Condicional pelo mesmo motivo do passe de cima: reimportação no meio do
    // caminho já classificou pela regra atual e não deve ser tocada de novo.
    const { count } = await prisma.documentoFiscal.updateMany({
      where: {
        id: documento.id,
        versaoRegra: { lt: VERSAO_REGRA_FATURAMENTO },
      },
      data: {
        contaFaturamento: classificacao.contaFaturamento,
        motivoExclusao: motivo,
        precisaConferencia: classificacao.precisaConferencia,
        versaoRegra: VERSAO_REGRA_FATURAMENTO,
      },
    });

    if (count === 0 || !mudou) continue;
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

  // Todo o resto já está na regra atual. Lista explícita no lugar de `NOT { ... }`:
  // com `motivo_exclusao` nulo (as notas que somam), `NOT (motivo = 'ENTRADA' AND
  // ...)` dá NULL no Postgres, e as vendas ficariam para sempre com a versão
  // antiga. O `NOT hasSome` dos CFOPs afetados mantém as linhas dos dois passes
  // acima fora: se um passe não terminou, elas ficam para a próxima tentativa.
  await prisma.documentoFiscal.updateMany({
    where: {
      versaoRegra: { lt: VERSAO_REGRA_FATURAMENTO },
      NOT: { cfops: { hasSome: [...CFOPS_AFETADOS_V3] } },
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
      `[faturamento] Regra v${VERSAO_REGRA_FATURAMENTO}: ${reclassificados} nota(s) ` +
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
