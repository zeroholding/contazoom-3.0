/**
 * Regras de escrita dos processos de legalização.
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seções 11.6 e 16.3.
 *
 * Arquivo separado de `tarefa-service.ts` (apuração) de propósito: os dois
 * módulos compartilham o formato do log e a derivação de status, mas o ciclo de
 * vida é outro. Processo não tem competência, pode existir antes da empresa e
 * termina alterando cadastro (regime, vínculo de CNPJ). Manter as duas escritas
 * em arquivos distintos evita que uma mudança na apuração quebre legalização.
 *
 * Toda função recebe o client de transação (`tx`), nunca o singleton: concluir
 * etapa faz de quatro a sete escritas e nenhuma delas pode valer sozinha.
 */

import type { Prisma } from "@prisma/client";
import type { Sessao } from "./api-guard";
import {
  ACAO_LOG,
  SITUACAO_ETAPA,
  fluxoLegalizacao,
  totalEtapasLegalizacao,
} from "./tarefa-etapas";
import { statusLegalizacao } from "./tarefa-status";

/** Client de transação do Prisma. Mesmo tipo que `prisma.$transaction` entrega. */
export type ClienteTransacao = Prisma.TransactionClient;

/* -------------------------------------------------------------------------- */
/*                                   Etapas                                   */
/* -------------------------------------------------------------------------- */

/** Linha de etapa pronta para `createMany`, sem o `processoId`. */
export type EtapaProcessoNova = {
  numero: number;
  chave: string;
  titulo: string;
  responsavelTipo: string;
  opcional: boolean;
  situacao: string;
  iniciadaEm: Date | null;
};

/**
 * Materializa as etapas do tipo de processo, com os títulos COPIADOS do fluxo.
 *
 * A cópia é o que congela o histórico: se o escritório revisar o fluxo de
 * abertura em 2027, os processos de 2026 continuam mostrando as etapas que
 * realmente foram executadas.
 *
 * A etapa 1 já nasce EM_ANDAMENTO. Diferente da apuração, que é criada em lote
 * pela rotina mensal e pode ficar parada em "não iniciada", processo de
 * legalização só é aberto quando alguém começou a trabalhar nele — então não
 * existe estado intermediário em que o operador não sabe qual etapa concluir.
 */
export function montarEtapasProcesso(
  tipo: string,
  agora: Date = new Date()
): EtapaProcessoNova[] {
  return fluxoLegalizacao(tipo).map((definicao) => ({
    numero: definicao.numero,
    chave: definicao.chave,
    titulo: definicao.titulo,
    responsavelTipo: definicao.responsavel,
    opcional: definicao.opcional,
    situacao:
      definicao.numero === 1
        ? SITUACAO_ETAPA.EM_ANDAMENTO
        : SITUACAO_ETAPA.PENDENTE,
    iniciadaEm: definicao.numero === 1 ? agora : null,
  }));
}

/** Etapa como o banco devolve, no mínimo que as regras precisam ler. */
export type EtapaResumo = {
  numero: number;
  titulo: string;
  situacao: string;
  opcional: boolean;
  responsavelTipo: string;
};

/** Etapa já resolvida não volta para a fila: concluída ou não aplicável. */
export function etapaResolvida(situacao: string): boolean {
  return (
    situacao === SITUACAO_ETAPA.CONCLUIDA ||
    situacao === SITUACAO_ETAPA.NAO_APLICAVEL
  );
}

/**
 * Próxima etapa que ainda se aplica, pulando as marcadas NAO_APLICAVEL.
 *
 * Pular sem renumerar é o motivo de as etapas serem linhas no banco: a etapa 6
 * de uma abertura sem inscrição estadual fica registrada como não aplicável, e a
 * numeração das outras não muda.
 */
export function proximaEtapaAplicavel<T extends { numero: number; situacao: string }>(
  etapas: T[],
  apos: number
): T | null {
  return (
    etapas
      .filter((e) => e.numero > apos && e.situacao !== SITUACAO_ETAPA.NAO_APLICAVEL)
      .sort((a, b) => a.numero - b.numero)[0] ?? null
  );
}

/** Etapa anterior que ainda se aplica. Usada pelo retorno de etapa. */
export function etapaAnteriorAplicavel<T extends { numero: number; situacao: string }>(
  etapas: T[],
  antes: number
): T | null {
  return (
    etapas
      .filter((e) => e.numero < antes && e.situacao !== SITUACAO_ETAPA.NAO_APLICAVEL)
      .sort((a, b) => b.numero - a.numero)[0] ?? null
  );
}

/** Números das etapas que ainda não foram resolvidas. Vazio = pode encerrar. */
export function etapasNaoResolvidas<T extends { numero: number; situacao: string }>(
  etapas: T[]
): number[] {
  return etapas
    .filter((e) => !etapaResolvida(e.situacao))
    .map((e) => e.numero)
    .sort((a, b) => a - b);
}

/**
 * Etapa em curso.
 *
 * Tolera `etapaAtual = 0` (default do schema) para o caso de um processo criado
 * por outra rotina que não passe por `criarProcesso`: sem isso, a primeira
 * conclusão não teria etapa para marcar.
 */
export function etapaEmCurso(etapaAtual: number): number {
  return etapaAtual < 1 ? 1 : etapaAtual;
}

/** Rótulo do log: "4/12 — Registro do ato constitutivo". */
export function rotuloEtapa(
  numero: number,
  titulo: string,
  total: number
): string {
  return `${numero}/${total} — ${titulo}`;
}

/* -------------------------------------------------------------------------- */
/*                                    Log                                     */
/* -------------------------------------------------------------------------- */

export type EntradaLogProcesso = {
  processoId: string;
  acao: string;
  de?: string | null;
  para?: string | null;
  detalhe?: string | null;
  sessao: Sessao;
};

/**
 * Grava uma linha de log do processo.
 *
 * `autorNome` e `autorPapel` são congelados na linha: funcionário troca de papel
 * e sai da empresa, e o log tem de continuar dizendo quem fez o que na época.
 * Só INSERT — a tabela é append-only, inclusive para administrador.
 */
export async function registrarLogProcesso(
  tx: ClienteTransacao,
  entrada: EntradaLogProcesso
): Promise<void> {
  await tx.tarefaLog.create({
    data: {
      processoId: entrada.processoId,
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
  anterior: string;
  novo: string;
  mudou: boolean;
};

/**
 * Recalcula e grava o status macro a partir da etapa e do bloqueio.
 *
 * Ninguém preenche status à mão: a coluna existe apenas para permitir filtro e
 * contagem no banco (o Kanban conta por coluna). Chamar SEMPRE depois de mexer
 * em etapa ou bloqueio, dentro da mesma transação — status gravado divergente da
 * etapa é o tipo de inconsistência que ninguém percebe até a reunião.
 *
 * Quando recebe `sessao` e o status muda, registra STATUS_ALTERADO, para as seis
 * rotas não repetirem o mesmo bloco.
 */
export async function recalcularStatusProcesso(
  tx: ClienteTransacao,
  processoId: string,
  sessao?: Sessao
): Promise<ResultadoRecalculo> {
  const processo = await tx.processoLegalizacao.findUnique({
    where: { id: processoId },
    select: {
      tipo: true,
      status: true,
      etapaAtual: true,
      bloqueada: true,
      bloqueioResponsavel: true,
    },
  });
  if (!processo) throw new Error(`Processo não encontrado: ${processoId}`);

  const novo = statusLegalizacao(processo.tipo, {
    etapaAtual: processo.etapaAtual,
    bloqueada: processo.bloqueada,
    bloqueioResponsavel: processo.bloqueioResponsavel,
  });

  const mudou = novo !== processo.status;
  if (mudou) {
    await tx.processoLegalizacao.update({
      where: { id: processoId },
      data: { status: novo },
    });
    if (sessao) {
      await registrarLogProcesso(tx, {
        processoId,
        acao: ACAO_LOG.STATUS_ALTERADO,
        de: processo.status,
        para: novo,
        sessao,
      });
    }
  }

  return { anterior: processo.status, novo, mudou };
}

/* -------------------------------------------------------------------------- */
/*                                  Criação                                   */
/* -------------------------------------------------------------------------- */

export type EntradaCriarProcesso = {
  tipo: string;
  empresaId?: string | null;
  identificacaoProvisoria?: string | null;
  prazoEstimado?: Date | null;
  responsavelId?: string | null;
  observacoes?: string | null;
  sessao: Sessao;
};

/**
 * Cria o processo, as etapas do fluxo e o log de criação.
 *
 * Recebe os dados já validados pela rota: aqui não há decisão de negócio sobre
 * o corpo da requisição, só escrita consistente.
 */
export async function criarProcesso(
  tx: ClienteTransacao,
  entrada: EntradaCriarProcesso
) {
  const agora = new Date();
  const etapas = montarEtapasProcesso(entrada.tipo, agora);

  const processo = await tx.processoLegalizacao.create({
    data: {
      tipo: entrada.tipo,
      empresaId: entrada.empresaId ?? null,
      identificacaoProvisoria: entrada.identificacaoProvisoria ?? null,
      etapaAtual: 1,
      status: statusLegalizacao(entrada.tipo, { etapaAtual: 1 }),
      prazoEstimado: entrada.prazoEstimado ?? null,
      responsavelId: entrada.responsavelId ?? null,
      observacoes: entrada.observacoes ?? null,
      abertoEm: agora,
      etapas: { create: etapas },
    },
    include: { etapas: { orderBy: { numero: "asc" } } },
  });

  await registrarLogProcesso(tx, {
    processoId: processo.id,
    acao: ACAO_LOG.TAREFA_CRIADA,
    para: entrada.tipo,
    detalhe: entrada.empresaId
      ? null
      : // Sem empresa no cadastro, o log é o único lugar que guarda por qual
        // nome o processo começou antes do CNPJ sair.
        `Processo aberto sem empresa vinculada. Identificação provisória: ${
          entrada.identificacaoProvisoria ?? "não informada"
        }`,
    sessao: entrada.sessao,
  });

  return processo;
}

/* -------------------------------------------------------------------------- */
/*                            Regime da empresa                               */
/* -------------------------------------------------------------------------- */

export type EntradaNovoRegime = {
  empresaId: string;
  regimeNovo: string;
  motivo?: string | null;
  registradoPor?: string | null;
  vigenciaInicio?: Date;
};

/**
 * Fecha a linha vigente do histórico de regime, abre a nova e atualiza a
 * empresa.
 *
 * É o que dá sentido ao regime congelado em cada competência: as apurações já
 * criadas continuam com o regime antigo (porque cada uma guarda o seu), e as
 * futuras nascem com o fluxo novo. Sem o histórico, mudar `Empresa.regime`
 * reescreveria o passado — a apuração de março do Simples passaria a ser lida
 * como Lucro Presumido só porque a empresa mudou em julho.
 *
 * Devolve `null` quando a empresa já está no regime pedido, para a operação ser
 * segura em caso de repetição (reabrir e encerrar de novo, por exemplo).
 */
export async function aplicarNovoRegime(
  tx: ClienteTransacao,
  entrada: EntradaNovoRegime
): Promise<{ de: string; para: string } | null> {
  const empresa = await tx.empresa.findUnique({
    where: { id: entrada.empresaId },
    select: { id: true, regime: true },
  });
  if (!empresa) throw new Error(`Empresa não encontrada: ${entrada.empresaId}`);
  if (empresa.regime === entrada.regimeNovo) return null;

  const vigencia = entrada.vigenciaInicio ?? new Date();

  // Fecha só a linha vigente (vigenciaFim null). Usa updateMany porque não há
  // unicidade garantida por empresa, e fechar "a que estiver aberta" é a
  // operação correta mesmo se houver mais de uma por erro de dado antigo.
  await tx.empresaRegimeHistorico.updateMany({
    where: { empresaId: empresa.id, vigenciaFim: null },
    data: { vigenciaFim: vigencia },
  });

  await tx.empresaRegimeHistorico.create({
    data: {
      empresaId: empresa.id,
      regime: entrada.regimeNovo,
      vigenciaInicio: vigencia,
      motivo: entrada.motivo ?? null,
      registradoPor: entrada.registradoPor ?? null,
    },
  });

  await tx.empresa.update({
    where: { id: empresa.id },
    data: { regime: entrada.regimeNovo },
  });

  return { de: empresa.regime, para: entrada.regimeNovo };
}

/* -------------------------------------------------------------------------- */
/*                                 Utilidades                                 */
/* -------------------------------------------------------------------------- */

/** Total de etapas do tipo. Repassa o erro se o tipo não existir. */
export function totalEtapas(tipo: string): number {
  return totalEtapasLegalizacao(tipo);
}

/**
 * Dias que o processo está (ou ficou) em aberto.
 *
 * É o número que cobra ação em processo de legalização: prazo de órgão externo
 * não é controlável, então "aberto há 47 dias" vale mais que status.
 */
export function diasEmAberto(
  abertoEm: Date,
  concluidoEm?: Date | null,
  referencia: Date = new Date()
): number {
  const fim = concluidoEm ?? referencia;
  return Math.max(
    0,
    Math.round((fim.getTime() - abertoEm.getTime()) / 86_400_000)
  );
}

/**
 * Corpo JSON da requisição, `{}` quando não há corpo e `null` quando o JSON é
 * inválido.
 *
 * Corpo ausente e corpo malformado são coisas diferentes: `DELETE /bloqueio`
 * chega legitimamente sem corpo, e devolver 400 nesse caso seria errado.
 */
export async function lerCorpo(
  req: Request
): Promise<Record<string, unknown> | null> {
  try {
    const texto = await req.text();
    if (!texto || !texto.trim()) return {};
    const dados: unknown = JSON.parse(texto);
    if (!dados || typeof dados !== "object" || Array.isArray(dados)) return null;
    return dados as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Texto aparado, ou `null` quando vazio/ausente. Não aceita outro tipo. */
export function textoLimpo(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo.length ? limpo : null;
}

/**
 * Data opcional vinda do corpo.
 *
 * `{ ok: false }` só quando o valor foi enviado e não é data — enviar `null`
 * para limpar o prazo é uso legítimo.
 */
export function parseDataOpcional(
  valor: unknown
): { ok: true; valor: Date | null } | { ok: false } {
  if (valor === undefined || valor === null || valor === "") {
    return { ok: true, valor: null };
  }
  if (typeof valor !== "string" && typeof valor !== "number") return { ok: false };
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return { ok: false };
  return { ok: true, valor: data };
}
