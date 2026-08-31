/**
 * Exclusão de empresa, competência e processo de legalização.
 *
 * O módulo não tinha exclusão nenhuma até aqui. O escritório pediu as três, e o
 * que este arquivo resolve não é "chamar delete" — é o que acontece em volta.
 *
 * TRÊS PROBLEMAS QUE A EXCLUSÃO CRIA, E COMO CADA UM É TRATADO:
 *
 * 1. O CASCADE É MAIOR DO QUE PARECE. Apagar uma empresa não apaga uma linha:
 *    leva o histórico de regime, todas as competências, todos os processos, e de
 *    cada um deles as etapas, o histórico e os anexos. Uma empresa com dois anos
 *    de carteira passa de mil linhas. Por isso toda exclusão é PRECEDIDA de uma
 *    contagem, e a contagem vai para a tela ANTES de o botão existir — quem
 *    confirma tem de saber o tamanho do que está apagando.
 *
 * 2. O HISTÓRICO É APAGADO JUNTO. `TarefaLog` é declarado append-only ("log
 *    editável não é prova de nada"), mas é filho da tarefa com
 *    `onDelete: Cascade`. Então exclusão era a única operação do módulo capaz de
 *    não deixar rastro, e a mais grave. `RegistroExclusao` existe para isso: uma
 *    tabela que o cascade não alcança, com o que era, quanto foi junto, quem
 *    mandou e por quê.
 *
 * 3. O ARQUIVO DO ANEXO NÃO ESTÁ NO BANCO. O cascade apaga a linha de
 *    `TarefaAnexo`; o PDF continua no volume, invisível e para sempre. Quem
 *    apaga a linha tem de apagar o arquivo, e é o que `apagarArquivosDeAnexos`
 *    faz.
 *
 * ORDEM DAS OPERAÇÕES, que é a parte que importa:
 *
 *    contar  ->  [transação: gravar registro + apagar]  ->  apagar arquivos
 *
 * O registro e o delete vivem na MESMA transação: valem os dois ou nenhum. Se
 * fossem separados haveria dois jeitos de errar, e o pior deles é apagar sem
 * registrar. Os arquivos vêm DEPOIS do commit, de propósito: se a transação
 * voltar atrás, os arquivos continuam lá; se a remoção do arquivo falhar, sobra
 * lixo no disco, que custa espaço e nada mais.
 */

import { unlink } from "fs/promises";
import type { Prisma } from "@prisma/client";
import prisma from "./prisma";
import type { Sessao } from "./api-guard";
import { caminhoDoAnexo } from "./tarefa-anexo-disco";
import { formatarCnpj } from "./documento";
import { TIPO_PROCESSO_LABEL } from "./tarefa-etapas";
import { competenciaLabel } from "./tarefa-status";
import {
  type Contagem,
  temContagem,
  textoContagens,
} from "./exclusao-regras";

/**
 * As regras puras vivem em `./exclusao-regras`, que não importa nada.
 *
 * Motivo: `ModalExclusao.tsx` é `"use client"` e precisa da MESMA comparação de
 * confirmação que o servidor usa. Este arquivo importa `prisma`, então não serve
 * ao navegador. Reexportado para as rotas continuarem importando de um lugar só.
 */
export {
  MOTIVO_MINIMO,
  confirmacaoConfere,
  normalizarConfirmacao,
  validarMotivo,
} from "./exclusao-regras";
export type { Contagem, ResultadoMotivo } from "./exclusao-regras";

/* -------------------------------------------------------------------------- */
/*                                   Tipos                                    */
/* -------------------------------------------------------------------------- */

export const TIPO_EXCLUSAO = {
  EMPRESA: "EMPRESA",
  APURACAO: "APURACAO",
  PROCESSO_LEGALIZACAO: "PROCESSO_LEGALIZACAO",
} as const;
export type TipoExclusao = (typeof TIPO_EXCLUSAO)[keyof typeof TIPO_EXCLUSAO];

/**
 * O que uma exclusão vai destruir.
 *
 * `arquivos` são os nomes no disco, não os ids: é o que `unlink` precisa, e é
 * colhido ANTES do delete porque depois do cascade não há mais como saber.
 */
export type ResumoExclusao = {
  tipo: TipoExclusao;
  alvoId: string;
  /** Como o registro aparece na tela. Vai para o registro de exclusão. */
  descricao: string;
  /** Contexto que sobrevive ao alvo: CNPJ, competência, tipo do processo. */
  detalhe: string | null;
  /** Contagem por tipo de dependente. Zero não entra no texto final. */
  contagens: Contagem[];
  arquivos: string[];
  /** Avisos que a tela mostra sem bloquear. Ex.: competência já encerrada. */
  avisos: string[];
};

/* -------------------------------------------------------------------------- */
/*                            Contagem por alvo                               */
/* -------------------------------------------------------------------------- */

/**
 * Plural só onde faz sentido.
 *
 * "1 competências" é o tipo de detalhe que faz o operador desconfiar do número
 * inteiro, e o número é a única coisa que ele tem para decidir.
 */
function contagem(
  quantidade: number,
  singular: string,
  plural: string
): Contagem {
  return { rotulo: quantidade === 1 ? singular : plural, quantidade };
}

/**
 * Resumo da exclusão de uma EMPRESA.
 *
 * As contagens atravessam a relação (`{ tarefa: { empresaId } }`) em vez de
 * carregar as tarefas e somar em memória: uma empresa com dois anos de carteira
 * traria mil linhas para produzir cinco números.
 */
export async function resumirExclusaoEmpresa(
  empresaId: string
): Promise<ResumoExclusao | null> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { id: true, razaoSocial: true, cnpj: true },
  });
  if (!empresa) return null;

  const daEmpresa: Prisma.TarefaAnexoWhereInput = {
    OR: [{ apuracao: { empresaId } }, { processo: { empresaId } }],
  };

  const [
    apuracoes,
    processos,
    etapasApuracao,
    etapasProcesso,
    logs,
    historicoRegime,
    anexos,
  ] = await Promise.all([
    prisma.tarefaApuracao.count({ where: { empresaId } }),
    prisma.processoLegalizacao.count({ where: { empresaId } }),
    prisma.tarefaApuracaoEtapa.count({ where: { tarefa: { empresaId } } }),
    prisma.processoLegalizacaoEtapa.count({
      where: { processo: { empresaId } },
    }),
    prisma.tarefaLog.count({
      where: { OR: [{ apuracao: { empresaId } }, { processo: { empresaId } }] },
    }),
    prisma.empresaRegimeHistorico.count({ where: { empresaId } }),
    prisma.tarefaAnexo.findMany({ where: daEmpresa, select: { arquivo: true } }),
  ]);

  const avisos: string[] = [];
  if (apuracoes > 0) {
    avisos.push(
      "As competências desta empresa vão junto, inclusive as já encerradas."
    );
  }
  if (anexos.length > 0) {
    avisos.push(
      "Os arquivos anexados são apagados do servidor e não têm como ser recuperados."
    );
  }

  return {
    tipo: TIPO_EXCLUSAO.EMPRESA,
    alvoId: empresa.id,
    descricao: empresa.razaoSocial,
    detalhe: empresa.cnpj
      ? `CNPJ ${formatarCnpj(empresa.cnpj)}`
      : "Empresa em abertura, sem CNPJ",
    contagens: [
      contagem(apuracoes, "competência", "competências"),
      contagem(processos, "processo de legalização", "processos de legalização"),
      contagem(etapasApuracao + etapasProcesso, "etapa", "etapas"),
      contagem(logs, "registro de histórico", "registros de histórico"),
      contagem(historicoRegime, "linha do histórico de regime", "linhas do histórico de regime"),
      contagem(anexos.length, "anexo", "anexos"),
    ],
    arquivos: anexos.map((a) => a.arquivo),
    avisos,
  };
}

/** Resumo da exclusão de uma COMPETÊNCIA (apuração). */
export async function resumirExclusaoApuracao(
  apuracaoId: string
): Promise<ResumoExclusao | null> {
  const tarefa = await prisma.tarefaApuracao.findUnique({
    where: { id: apuracaoId },
    select: {
      id: true,
      ano: true,
      mes: true,
      concluidaEm: true,
      empresa: { select: { razaoSocial: true, nomeFantasia: true } },
    },
  });
  if (!tarefa) return null;

  const [etapas, logs, anexos] = await Promise.all([
    prisma.tarefaApuracaoEtapa.count({ where: { tarefaId: apuracaoId } }),
    prisma.tarefaLog.count({ where: { apuracaoId } }),
    prisma.tarefaAnexo.findMany({
      where: { apuracaoId },
      select: { arquivo: true },
    }),
  ]);

  const nome =
    tarefa.empresa.nomeFantasia?.trim() || tarefa.empresa.razaoSocial;
  const competencia = competenciaLabel(tarefa.ano, tarefa.mes);

  const avisos: string[] = [];
  /**
   * Competência encerrada AVISA, mas não bloqueia.
   *
   * Encerrada quer dizer que o resultado foi entregue ao cliente, então apagar é
   * apagar o registro do que foi entregue. Exigir reabrir antes seria mais
   * seguro e é um passo a mais para o administrador — que é o único que chega
   * aqui e o único que poderia reabrir de todo jeito. O aviso resolve: informa
   * sem transformar a tela num labirinto.
   */
  if (tarefa.concluidaEm) {
    avisos.push(
      "Esta competência está ENCERRADA: o resultado dela foi entregue ao cliente."
    );
  }
  if (anexos.length > 0) {
    avisos.push(
      "Os arquivos anexados são apagados do servidor e não têm como ser recuperados."
    );
  }

  return {
    tipo: TIPO_EXCLUSAO.APURACAO,
    alvoId: tarefa.id,
    descricao: `${competencia} — ${nome}`,
    detalhe: tarefa.concluidaEm
      ? `Competência encerrada em ${tarefa.concluidaEm
          .toISOString()
          .slice(0, 10)
          .split("-")
          .reverse()
          .join("/")}`
      : "Competência em aberto",
    contagens: [
      contagem(etapas, "etapa", "etapas"),
      contagem(logs, "registro de histórico", "registros de histórico"),
      contagem(anexos.length, "anexo", "anexos"),
    ],
    arquivos: anexos.map((a) => a.arquivo),
    avisos,
  };
}

/** Resumo da exclusão de um PROCESSO de legalização. */
export async function resumirExclusaoProcesso(
  processoId: string
): Promise<ResumoExclusao | null> {
  const processo = await prisma.processoLegalizacao.findUnique({
    where: { id: processoId },
    select: {
      id: true,
      tipo: true,
      protocoloExterno: true,
      concluidoEm: true,
      identificacaoProvisoria: true,
      empresa: { select: { razaoSocial: true, nomeFantasia: true } },
    },
  });
  if (!processo) return null;

  const [etapas, logs, anexos] = await Promise.all([
    prisma.processoLegalizacaoEtapa.count({ where: { processoId } }),
    prisma.tarefaLog.count({ where: { processoId } }),
    prisma.tarefaAnexo.findMany({
      where: { processoId },
      select: { arquivo: true },
    }),
  ]);

  const nome = processo.empresa
    ? processo.empresa.nomeFantasia?.trim() || processo.empresa.razaoSocial
    : processo.identificacaoProvisoria?.trim() || "sem identificação";
  const tipoLabel = TIPO_PROCESSO_LABEL[processo.tipo] ?? processo.tipo;

  const avisos: string[] = [];
  /**
   * Protocolo em órgão externo é o aviso mais útil desta tela.
   *
   * O processo pode estar apagado aqui e continuar existindo na JUCESP. Quem
   * apaga precisa saber que o número não desaparece do mundo — e o número vai
   * para o registro de exclusão justamente para poder ser reencontrado depois.
   */
  if (processo.protocoloExterno) {
    avisos.push(
      `Este processo tem protocolo ${processo.protocoloExterno} em órgão externo. Apagar aqui não cancela nada lá.`
    );
  }
  if (anexos.length > 0) {
    avisos.push(
      "Os arquivos anexados são apagados do servidor e não têm como ser recuperados."
    );
  }

  return {
    tipo: TIPO_EXCLUSAO.PROCESSO_LEGALIZACAO,
    alvoId: processo.id,
    descricao: `${tipoLabel} — ${nome}`,
    detalhe: [
      processo.protocoloExterno
        ? `Protocolo ${processo.protocoloExterno}`
        : null,
      processo.concluidoEm ? "Processo encerrado" : "Processo em aberto",
    ]
      .filter(Boolean)
      .join(" · "),
    contagens: [
      contagem(etapas, "etapa", "etapas"),
      contagem(logs, "registro de histórico", "registros de histórico"),
      contagem(anexos.length, "anexo", "anexos"),
    ],
    arquivos: anexos.map((a) => a.arquivo),
    avisos,
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Texto                                     */
/* -------------------------------------------------------------------------- */

/** "24 competências, 3 processos, 251 etapas, 812 registros de histórico". */
export function textoArrastado(resumo: ResumoExclusao): string {
  return textoContagens(resumo.contagens);
}

/** O alvo tem dependente? Decide se a tela precisa alertar com mais força. */
export function temDependentes(resumo: ResumoExclusao): boolean {
  return temContagem(resumo.contagens);
}

/* -------------------------------------------------------------------------- */
/*                                 Arquivos                                   */
/* -------------------------------------------------------------------------- */

/**
 * Apaga os arquivos dos anexos do disco.
 *
 * Chamada DEPOIS do commit. Falha de arquivo individual não interrompe as
 * outras nem desfaz a exclusão: a linha já não existe, então o arquivo é
 * inalcançável de qualquer forma — insistir só deixaria o operador sem resposta
 * por causa de um `unlink` que falhou.
 *
 * Devolve quantos foram e quantos sobraram, para a rota registrar no log do
 * servidor. O operador não precisa saber disso; quem for limpar disco, sim.
 */
export async function apagarArquivosDeAnexos(
  arquivos: string[]
): Promise<{ apagados: number; falhas: number }> {
  let apagados = 0;
  let falhas = 0;

  for (const arquivo of arquivos) {
    const caminho = caminhoDoAnexo(arquivo);
    if (!caminho) {
      // Nome que não passa na checagem de segurança. Não deveria existir no
      // banco; se existe, é dado corrompido e não vamos tocar no disco por ele.
      falhas += 1;
      continue;
    }
    try {
      await unlink(caminho);
      apagados += 1;
    } catch {
      // Arquivo já ausente é o caso comum aqui (anexo enviado antes do volume
      // de uploads existir no compose). Não é erro do ponto de vista de quem
      // pediu a exclusão: o que ele queria já é verdade.
      falhas += 1;
    }
  }

  return { apagados, falhas };
}

/* -------------------------------------------------------------------------- */
/*                                 Registro                                   */
/* -------------------------------------------------------------------------- */

/**
 * Grava o registro de exclusão DENTRO da transação que apaga.
 *
 * Recebe `tx`, nunca o singleton: registro e delete valem juntos ou não valem.
 * Separados, haveria dois jeitos de errar, e o pior é apagar sem registrar.
 */
export async function registrarExclusao(
  tx: Prisma.TransactionClient,
  entrada: { resumo: ResumoExclusao; motivo: string; sessao: Sessao }
): Promise<void> {
  await tx.registroExclusao.create({
    data: {
      tipo: entrada.resumo.tipo,
      alvoId: entrada.resumo.alvoId,
      descricao: entrada.resumo.descricao,
      detalhe: entrada.resumo.detalhe,
      arrastado: textoArrastado(entrada.resumo),
      motivo: entrada.motivo,
      excluidoPorId: entrada.sessao.userId,
      excluidoPorNome: entrada.sessao.nome || entrada.sessao.email,
      excluidoPorPapel: entrada.sessao.papel,
    },
  });
}

/*
 * `validarMotivo` e `confirmacaoConfere` vivem em `./exclusao-regras` e são
 * reexportadas no topo deste arquivo.
 *
 * A confirmação por digitação existe só para a EMPRESA, por causa do tamanho do
 * cascade: um clique ali pode levar mais de mil linhas. Digitar a razão social é
 * o mesmo recurso que o GitHub usa para apagar repositório — obriga a LER o nome
 * do que está sendo apagado, que é justamente o erro que acontece na prática
 * (apagar a empresa errada da lista, porque os nomes são parecidos).
 */
