/**
 * Serviço da apuração fiscal: as quatro operações que toda rota do módulo usa.
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seções 13 e 16.5.
 *
 * Por que existe uma camada aqui em vez de o código morar nas rotas:
 *
 * 1. Criar tarefa é sempre "tarefa + etapas + log", nessa ordem, atômico. Se
 *    cada rota montar essa sequência à mão (POST manual, abrir-mes, cron), uma
 *    delas vai esquecer o log, e log incompleto é pior que log nenhum: dá a
 *    impressão de que a operação não aconteceu.
 *
 * 2. Status é DERIVADO da etapa (ver src/lib/tarefa-status.ts). A gravação do
 *    campo `status` só existe para permitir filtro e groupBy no banco. Toda
 *    mudança de etapa ou de bloqueio precisa recalcular, e o único jeito de isso
 *    não divergir é ter um caminho só.
 *
 * TODAS as funções recebem o client de transação (`Prisma.TransactionClient`) em
 * vez de importarem `prisma` diretamente. É o que permite compor: concluir etapa
 * chama `recalcularStatus` e `registrarLog` DENTRO da mesma transação da rota,
 * e não em três transações independentes que podem falhar pela metade.
 */

import { Prisma } from "@prisma/client";
import type { Sessao } from "./api-guard";
import {
  ACAO_LOG,
  SITUACAO_ETAPA,
  fluxoApuracao,
  tituloEtapaAjustado,
} from "./tarefa-etapas";
import { statusApuracao } from "./tarefa-status";

/** Client de transação. Aceita também o client normal, que é compatível. */
export type TX = Prisma.TransactionClient;

/* -------------------------------------------------------------------------- */
/*                                   Etapas                                   */
/* -------------------------------------------------------------------------- */

/** Linha de etapa pronta para `createMany`, sem o `tarefaId`. */
export type EtapaParaCriar = {
  numero: number;
  chave: string;
  titulo: string;
  responsavelTipo: string;
  opcional: boolean;
  situacao: string;
};

/**
 * Monta as etapas do regime para gravação.
 *
 * O `titulo` é COPIADO do fluxo para dentro da tarefa, não referenciado. Se em
 * 2027 o escritório renomear uma etapa, as competências de 2026 continuam
 * mostrando o texto que o operador realmente leu quando executou o trabalho.
 *
 * A etapa 1 já nasce EM_ANDAMENTO porque a tarefa nasce em `etapaAtual = 1`: o
 * trabalho começa no recebimento de documentos, não num limbo antes dele.
 */
export function montarEtapas(
  regime: string,
  tributoLocal?: string | null
): EtapaParaCriar[] {
  return fluxoApuracao(regime).map((definicao) => ({
    numero: definicao.numero,
    chave: definicao.chave,
    // Empresa de serviço não apura ICMS e comércio não apura ISS; gravar o
    // título genérico faria o operador conferir todo mês se aquilo se aplica.
    titulo: tituloEtapaAjustado(
      definicao.titulo,
      definicao.chave,
      tributoLocal
    ),
    responsavelTipo: definicao.responsavel,
    opcional: definicao.opcional,
    situacao:
      definicao.numero === 1
        ? SITUACAO_ETAPA.EM_ANDAMENTO
        : SITUACAO_ETAPA.PENDENTE,
  }));
}

/* -------------------------------------------------------------------------- */
/*                                    Log                                     */
/* -------------------------------------------------------------------------- */

export type EntradaLog = {
  apuracaoId?: string | null;
  processoId?: string | null;
  acao: string;
  de?: string | null;
  para?: string | null;
  detalhe?: string | null;
  sessao: Sessao;
};

/**
 * Grava uma linha de log.
 *
 * `autorNome` e `autorPapel` são CONGELADOS na gravação, copiados da sessão. Não
 * é desnormalização por preguiça: funcionário muda de nome, muda de papel e sai
 * da empresa, e o log tem que continuar dizendo quem era quem no dia do evento.
 * Fazer join com `usuario` na leitura mostraria o cargo de hoje ao lado de um
 * evento de dois anos atrás.
 *
 * Só INSERT. Nunca existe update nem delete desta tabela em lugar nenhum da
 * aplicação — log editável não prova nada.
 */
export async function registrarLog(
  tx: TX,
  entrada: EntradaLog
): Promise<void> {
  await tx.tarefaLog.create({
    data: {
      apuracaoId: entrada.apuracaoId ?? null,
      processoId: entrada.processoId ?? null,
      acao: entrada.acao,
      de: entrada.de ?? null,
      para: entrada.para ?? null,
      detalhe: entrada.detalhe ?? null,
      autorId: entrada.sessao.userId,
      autorNome: entrada.sessao.nome || entrada.sessao.email,
      autorPapel: entrada.sessao.papel,
    },
  });
}

/* -------------------------------------------------------------------------- */
/*                                   Status                                   */
/* -------------------------------------------------------------------------- */

export type ResultadoRecalculo = {
  de: string;
  para: string;
  mudou: boolean;
};

/**
 * Recalcula o status macro a partir do estado atual da tarefa e grava se mudou.
 *
 * Devolve `{de, para, mudou}` para a rota decidir se vale um log
 * `STATUS_ALTERADO`: gravar log de "EM_ELABORACAO -> EM_ELABORACAO" a cada
 * etapa concluída enche a linha do tempo de linhas que não informam nada, e o
 * histórico só é útil se der para ler.
 *
 * O UPDATE só acontece quando há diferença. Escrita evitada é lock evitado
 * dentro da transação.
 */
export async function recalcularStatus(
  tx: TX,
  tarefaId: string
): Promise<ResultadoRecalculo> {
  const tarefa = await tx.tarefaApuracao.findUnique({
    where: { id: tarefaId },
    select: {
      regime: true,
      status: true,
      etapaAtual: true,
      bloqueada: true,
      bloqueioResponsavel: true,
      concluidaEm: true,
    },
  });
  if (!tarefa) throw new Error(`Apuração não encontrada: ${tarefaId}`);

  const derivado = statusApuracao(tarefa.regime, {
    etapaAtual: tarefa.etapaAtual,
    bloqueada: tarefa.bloqueada,
    bloqueioResponsavel: tarefa.bloqueioResponsavel,
  });

  // Tarefa encerrada manualmente fica CONCLUIDO mesmo que a etapa diga outra
  // coisa: quem encerrou decidiu que a competência acabou, e a derivação não
  // pode desfazer decisão humana registrada.
  const para = tarefa.concluidaEm ? "CONCLUIDO" : derivado;
  const de = tarefa.status;

  if (para === de) return { de, para, mudou: false };

  await tx.tarefaApuracao.update({
    where: { id: tarefaId },
    data: { status: para },
  });
  return { de, para, mudou: true };
}

/* -------------------------------------------------------------------------- */
/*                              Criação de tarefa                             */
/* -------------------------------------------------------------------------- */

export type EmpresaParaApuracao = {
  id: string;
  razaoSocial: string;
  regime: string;
  tributoLocal: string;
};

export type EntradaCriarApuracao = {
  empresa: EmpresaParaApuracao;
  ano: number;
  mes: number;
  sessao: Sessao;
  prazoEntrega?: Date | null;
  responsavelId?: string | null;
};

/**
 * Cria a competência: tarefa + etapas + log, na mesma transação do chamador.
 *
 * O `regime` é COPIADO da empresa e nunca lido por relação depois. Empresa que
 * se desenquadra em julho não pode transformar a apuração de março (feita no
 * Simples, com dez etapas) numa apuração de Lucro Presumido — o histórico
 * fiscal descreveria um trabalho que ninguém fez.
 *
 * Nasce em `etapaAtual = 1` com `iniciadaEm` preenchido: a competência existe
 * porque o mês virou, e a primeira etapa (receber documento do cliente) já está
 * valendo desde o primeiro instante.
 */
export async function criarApuracao(
  tx: TX,
  entrada: EntradaCriarApuracao
): Promise<{ id: string; status: string }> {
  const { empresa, ano, mes, sessao } = entrada;

  const status = statusApuracao(empresa.regime, { etapaAtual: 1 });
  const agora = new Date();

  const tarefa = await tx.tarefaApuracao.create({
    data: {
      empresaId: empresa.id,
      ano,
      mes,
      regime: empresa.regime,
      etapaAtual: 1,
      status,
      iniciadaEm: agora,
      prazoEntrega: entrada.prazoEntrega ?? null,
      responsavelId: entrada.responsavelId ?? null,
    },
    select: { id: true, status: true },
  });

  await tx.tarefaApuracaoEtapa.createMany({
    data: montarEtapas(empresa.regime, empresa.tributoLocal).map((etapa) => ({
      ...etapa,
      tarefaId: tarefa.id,
    })),
  });

  await registrarLog(tx, {
    apuracaoId: tarefa.id,
    acao: ACAO_LOG.TAREFA_CRIADA,
    para: `${String(mes).padStart(2, "0")}/${ano}`,
    detalhe: `${empresa.razaoSocial} — regime ${empresa.regime}`,
    sessao,
  });

  return tarefa;
}
