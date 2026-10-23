/**
 * Fila de e-mail das notificações (a tabela `notificacao` é a própria fila).
 *
 * POR QUE AGRUPAR: o contador sobe as guias do mês uma atrás da outra. Um
 * e-mail por arquivo seriam seis e-mails em três minutos, e o cliente passaria a
 * ignorar todos. Cada notificação nova de um cliente empurra o horário de envio
 * das pendentes DELE para `ESPERA_AGRUPAR_MS` à frente — até `ESPERA_MAXIMA_MS`
 * depois da mais antiga, para um envio longo não segurar o aviso para sempre.
 * Quando o horário chega, sai UM e-mail com todos os documentos.
 *
 * QUEM ENVIA: o próprio servidor, sem serviço extra. Ao criar a notificação um
 * temporizador é armado para o horário do lote, e uma varredura a cada minuto
 * (iniciada em `instrumentation.ts` e pela rota do sino) pega o que ficou para
 * trás — reinício do container, por exemplo.
 *
 * SEM ENVIO DUPLICADO: o lote é reservado com UPDATE condicional
 * (`PENDENTE` → `ENVIANDO` + `email_lote`), que o Postgres aplica linha a linha.
 * Duas varreduras ao mesmo tempo (duas réplicas, ou o temporizador e a varredura)
 * nunca reservam a mesma linha, e só quem reservou envia.
 */

import { createHash, randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { WHATSAPP_EXIBICAO, WHATSAPP_NUMERO } from "@/app/components/landing/contato";
import { configBrevo, enviarEmailBrevo, ErroBrevo, motivoConfigBrevoAusente, type ConfigBrevo } from "./brevo";
import { formatoDoArquivo, tamanhoLegivel } from "./documento-novo";
import { montarEmailDocumentos, type ItemEmailDocumento } from "./email-documentos";
import { STATUS_EMAIL, ehNotificacaoDeDocumento, type DadosNotificacaoDocumento } from "./tipos";

function segundosDoAmbiente(nome: string, padrao: number): number {
  const valor = Number(process.env[nome]);
  return Number.isFinite(valor) && valor >= 0 ? valor : padrao;
}

/** Silêncio necessário depois do último documento para o e-mail sair. */
export const ESPERA_AGRUPAR_MS = segundosDoAmbiente("NOTIFICACOES_EMAIL_ESPERA_SEGUNDOS", 90) * 1000;
/** Teto de espera contado da notificação mais antiga do lote. */
export const ESPERA_MAXIMA_MS = 10 * 60_000;

const MAXIMO_TENTATIVAS = 5;
/** Espera antes de cada nova tentativa (1 min, 5 min, 15 min, 1 h). */
const ESPERA_REENVIO_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
/** Reserva que passou disto sem resposta é de um processo que morreu no meio. */
const RESERVA_ABANDONADA_MS = 15 * 60_000;
const INTERVALO_VARREDURA_MS = 60_000;
const LOTES_POR_VARREDURA = 50;

/** Endereço público do painel, base dos links do e-mail. */
export function urlDoPainel(): string {
  const configurada = process.env.APP_URL?.trim();
  if (configurada) return configurada.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" ? "https://app.contazoom.com.br" : "http://localhost:3000";
}

/**
 * Horário de envio do lote do cliente.
 *
 * `agora + espera`, sem passar de `mais antiga + máximo`. Se o máximo já passou
 * (uma pendente antiga voltando de nova tentativa), sai agora.
 */
export function horarioDoLote(
  agora: Date,
  maisAntigaPendente: Date | null,
  esperaMs: number = ESPERA_AGRUPAR_MS,
  maximoMs: number = ESPERA_MAXIMA_MS,
): Date {
  const pelaEspera = agora.getTime() + esperaMs;
  const peloMaximo = (maisAntigaPendente ?? agora).getTime() + maximoMs;
  return new Date(Math.max(agora.getTime(), Math.min(pelaEspera, peloMaximo)));
}

export function esperaDoReenvio(tentativas: number): number {
  const indice = Math.min(Math.max(tentativas, 1), ESPERA_REENVIO_MS.length) - 1;
  return ESPERA_REENVIO_MS[indice];
}

/**
 * Chave do envio no Brevo. Estável para o MESMO conjunto de notificações:
 * repetir depois de um timeout (em que o e-mail pode ter saído) não duplica.
 */
export function chaveDoEnvio(ids: string[]): string {
  return createHash("sha256").update([...ids].sort().join(",")).digest("hex").slice(0, 40);
}

/** Link do WhatsApp do rodapé, com a mensagem de quem JÁ é cliente. */
function whatsappDoCliente() {
  const mensagem = "Olá! Sou cliente da ContaZoom e tenho uma dúvida sobre um documento do meu painel.";
  return {
    exibicao: WHATSAPP_EXIBICAO,
    link: `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensagem)}`,
  };
}

export type ResumoDespacho = {
  lotes: number;
  emailsEnviados: number;
  notificacoesEnviadas: number;
  adiadas: number;
  falhas: number;
  semConfiguracao: number;
};

type EstadoDespacho = {
  temporizador: ReturnType<typeof setTimeout> | null;
  temporizadorPara: number;
  varredura: ReturnType<typeof setInterval> | null;
  rodando: Promise<ResumoDespacho> | null;
  avisouConfiguracao: boolean;
  avisouTabela: boolean;
};

/**
 * Estado em `globalThis`: o mesmo módulo pode ser carregado por mais de uma rota
 * (e de novo a cada recarga em desenvolvimento), e dois temporizadores ou duas
 * varreduras no mesmo processo seriam trabalho em dobro.
 */
const escopoGlobal = globalThis as typeof globalThis & { __czDespachoNotificacoes?: EstadoDespacho };
const estado: EstadoDespacho = (escopoGlobal.__czDespachoNotificacoes ??= {
  temporizador: null,
  temporizadorPara: 0,
  varredura: null,
  rodando: null,
  avisouConfiguracao: false,
  avisouTabela: false,
});

function tabelaAusente(erro: unknown): boolean {
  return typeof erro === "object" && erro !== null && (erro as { code?: string }).code === "P2021";
}

/** Arma o processamento para daqui a `atrasoMs` (o mais cedo pedido vence). */
export function agendarProcessamento(atrasoMs: number): void {
  const quando = Date.now() + Math.max(1_000, atrasoMs);
  if (estado.temporizador && estado.temporizadorPara <= quando) return;
  if (estado.temporizador) clearTimeout(estado.temporizador);
  estado.temporizadorPara = quando;
  estado.temporizador = setTimeout(() => {
    estado.temporizador = null;
    estado.temporizadorPara = 0;
    void processarEmailsPendentes().catch((erro) => {
      console.error("[notificacoes] Falha no processamento agendado:", erro);
    });
  }, quando - Date.now());
  estado.temporizador.unref?.();
}

/** Varredura de minuto em minuto. Idempotente: chamar de novo não duplica. */
export function iniciarVarreduraEmails(): void {
  if (estado.varredura) return;
  estado.varredura = setInterval(() => {
    void processarEmailsPendentes().catch((erro) => {
      console.error("[notificacoes] Falha na varredura de e-mails:", erro);
    });
  }, INTERVALO_VARREDURA_MS);
  estado.varredura.unref?.();
}

/**
 * Envia os lotes vencidos. Chamadas simultâneas no mesmo processo aguardam a
 * execução em andamento em vez de abrir outra.
 */
export function processarEmailsPendentes(): Promise<ResumoDespacho> {
  if (estado.rodando) return estado.rodando;
  estado.rodando = executar().finally(() => {
    estado.rodando = null;
  });
  return estado.rodando;
}

async function executar(): Promise<ResumoDespacho> {
  const resumo: ResumoDespacho = {
    lotes: 0,
    emailsEnviados: 0,
    notificacoesEnviadas: 0,
    adiadas: 0,
    falhas: 0,
    semConfiguracao: 0,
  };
  const agora = new Date();

  try {
    // Reserva abandonada (processo que morreu no meio do envio) volta para a
    // fila, até o limite de tentativas. `email_enviar_apos` guarda a hora da
    // reserva enquanto a linha está ENVIANDO (ver `processarLote`).
    const abandonadaAntesDe = new Date(agora.getTime() - RESERVA_ABANDONADA_MS);
    await prisma.notificacao.updateMany({
      where: {
        emailStatus: STATUS_EMAIL.ENVIANDO,
        emailEnviarApos: { lt: abandonadaAntesDe },
        emailTentativas: { lt: MAXIMO_TENTATIVAS },
      },
      data: { emailStatus: STATUS_EMAIL.PENDENTE, emailLote: null },
    });
    await prisma.notificacao.updateMany({
      where: { emailStatus: STATUS_EMAIL.ENVIANDO, emailEnviarApos: { lt: abandonadaAntesDe } },
      data: {
        emailStatus: STATUS_EMAIL.FALHOU,
        emailLote: null,
        emailErro: "Envio interrompido repetidas vezes; desistimos deste e-mail.",
      },
    });

    const vencidos = await prisma.notificacao.findMany({
      where: { emailStatus: STATUS_EMAIL.PENDENTE, emailEnviarApos: { lte: agora } },
      select: { userId: true },
      distinct: ["userId"],
      orderBy: { userId: "asc" },
      take: LOTES_POR_VARREDURA,
    });

    if (vencidos.length > 0) {
      const config = configBrevo();
      for (const { userId } of vencidos) {
        try {
          await processarLote(userId, agora, config, resumo);
        } catch (erro) {
          console.error("[notificacoes] Falha ao processar lote de e-mail:", { userId, erro });
        }
      }
    }

    // Rearma para o próximo lote da fila, em vez de esperar a varredura do
    // minuto: o e-mail sai no horário prometido ao cliente.
    const proximo = await prisma.notificacao.findFirst({
      where: { emailStatus: STATUS_EMAIL.PENDENTE },
      orderBy: { emailEnviarApos: "asc" },
      select: { emailEnviarApos: true },
    });
    if (proximo) {
      // Já vencido aqui é sobra do limite por varredura (ou lote que acabou de
      // falhar): volta em 30 s, nunca em laço apertado.
      const atraso = proximo.emailEnviarApos.getTime() - Date.now();
      agendarProcessamento(atraso > 0 ? atraso + 500 : 30_000);
    }
  } catch (erro) {
    if (tabelaAusente(erro)) {
      // Deploy no meio: o código novo subiu antes da migração. A próxima
      // varredura tenta de novo; o aviso sai uma vez só para não inundar o log.
      if (!estado.avisouTabela) {
        console.warn("[notificacoes] Tabela `notificacao` ainda não existe; aguardando a migração.");
        estado.avisouTabela = true;
      }
      return resumo;
    }
    throw erro;
  }

  return resumo;
}

type LinhaDoLote = { id: string; tipo: string; link: string | null; dados: unknown };

/** E-mail do lote, com os links absolutos do painel. Exportada para o teste. */
export function montarEmailParaLote(nomeCliente: string, linhas: LinhaDoLote[]) {
  const base = urlDoPainel();
  const itens: ItemEmailDocumento[] = linhas.map((linha) => {
    const dados = (linha.dados ?? {}) as Partial<DadosNotificacaoDocumento>;
    const nomeArquivo = dados.nomeArquivo || "Documento";
    return {
      tipo: linha.tipo,
      nomeArquivo,
      pasta: dados.pasta ?? null,
      competencia: dados.competencia ?? null,
      formato: formatoDoArquivo(nomeArquivo, dados.mimeType ?? ""),
      tamanho: typeof dados.tamanhoBytes === "number" ? tamanhoLegivel(dados.tamanhoBytes) : "",
      // Só caminho interno vira link: o que vier gravado diferente cai na
      // central de documentos, nunca num endereço de fora.
      link: `${base}${linha.link?.startsWith("/") && !linha.link.startsWith("//") ? linha.link : "/documentos"}`,
    };
  });

  return montarEmailDocumentos({
    nomeCliente,
    itens,
    urlDocumentos: `${base}/documentos`,
    urlPainel: base,
    urlLogo: `${base}/email/contazoom-logo.png`,
    urlIcones: { pdf: `${base}/email/icone-pdf.png`, arquivo: `${base}/email/icone-arquivo.png` },
    whatsapp: whatsappDoCliente(),
  });
}

async function processarLote(
  userId: string,
  agora: Date,
  config: ConfigBrevo | null,
  resumo: ResumoDespacho,
): Promise<void> {
  const lote = randomUUID();
  const reserva = await prisma.notificacao.updateMany({
    where: { userId, emailStatus: STATUS_EMAIL.PENDENTE, emailEnviarApos: { lte: agora } },
    data: {
      emailStatus: STATUS_EMAIL.ENVIANDO,
      emailLote: lote,
      emailEnviarApos: new Date(),
      emailTentativas: { increment: 1 },
    },
  });
  if (reserva.count === 0) return; // outra varredura levou antes

  resumo.lotes += 1;
  const linhas = await prisma.notificacao.findMany({
    where: { emailLote: lote, emailStatus: STATUS_EMAIL.ENVIANDO },
    orderBy: { criadaEm: "asc" },
    select: {
      id: true,
      tipo: true,
      link: true,
      dados: true,
      emailTentativas: true,
      user: { select: { email: true, name: true } },
    },
  });
  if (linhas.length === 0) return;

  const fechar = (data: {
    emailStatus: string;
    emailErro?: string | null;
    emailEnviadoEm?: Date;
    emailMessageId?: string | null;
  }) =>
    prisma.notificacao.updateMany({
      where: { emailLote: lote, emailStatus: STATUS_EMAIL.ENVIANDO },
      data: { emailLote: null, ...data },
    });

  if (!config) {
    const motivo = motivoConfigBrevoAusente();
    await fechar({ emailStatus: STATUS_EMAIL.NAO_CONFIGURADO, emailErro: motivo });
    resumo.semConfiguracao += linhas.length;
    if (!estado.avisouConfiguracao) {
      console.warn(`[notificacoes] E-mail desligado: ${motivo}. As notificações seguem no sino do painel.`);
      estado.avisouConfiguracao = true;
    }
    return;
  }

  const usuario = linhas[0].user;
  if (!usuario?.email) {
    await fechar({ emailStatus: STATUS_EMAIL.SEM_DESTINATARIO, emailErro: "Usuário sem e-mail cadastrado." });
    return;
  }

  // Hoje todo tipo com e-mail é de documento. Tipo sem modelo de e-mail é
  // fechado aqui em vez de ficar voltando para a fila.
  const deDocumento = linhas.filter((linha) => ehNotificacaoDeDocumento(linha.tipo));
  if (deDocumento.length < linhas.length) {
    await prisma.notificacao.updateMany({
      where: { id: { in: linhas.filter((linha) => !ehNotificacaoDeDocumento(linha.tipo)).map((linha) => linha.id) } },
      data: { emailStatus: STATUS_EMAIL.NAO_SE_APLICA, emailLote: null },
    });
  }
  if (deDocumento.length === 0) return;

  let email: ReturnType<typeof montarEmailDocumentos>;
  try {
    email = montarEmailParaLote(usuario.name ?? "", deDocumento);
  } catch (erro) {
    // Dado que não monta e-mail não melhora tentando de novo.
    const mensagem = (erro instanceof Error ? erro.message : String(erro)).slice(0, 500);
    await fechar({ emailStatus: STATUS_EMAIL.FALHOU, emailErro: `Falha ao montar o e-mail: ${mensagem}` });
    resumo.falhas += deDocumento.length;
    console.error("[notificacoes] Falha ao montar o e-mail:", { userId, erro: mensagem });
    return;
  }

  try {
    const { messageId } = await enviarEmailBrevo(config, {
      para: { email: usuario.email, nome: usuario.name },
      assunto: email.assunto,
      html: email.html,
      texto: email.texto,
      tags: ["notificacao", "documento-novo"],
      chaveIdempotencia: chaveDoEnvio(deDocumento.map((linha) => linha.id)),
    });
    await fechar({
      emailStatus: STATUS_EMAIL.ENVIADO,
      emailEnviadoEm: new Date(),
      emailMessageId: messageId,
      emailErro: null,
    });
    resumo.emailsEnviados += 1;
    resumo.notificacoesEnviadas += deDocumento.length;
  } catch (erro) {
    const brevo = erro instanceof ErroBrevo ? erro : null;
    const mensagem = (erro instanceof Error ? erro.message : String(erro)).slice(0, 500);
    const tentativas = Math.max(...deDocumento.map((linha) => linha.emailTentativas));

    if (brevo?.retentavel && tentativas < MAXIMO_TENTATIVAS) {
      const espera = esperaDoReenvio(tentativas);
      await prisma.notificacao.updateMany({
        where: { emailLote: lote, emailStatus: STATUS_EMAIL.ENVIANDO },
        data: {
          emailStatus: STATUS_EMAIL.PENDENTE,
          emailLote: null,
          emailEnviarApos: new Date(Date.now() + espera),
          emailErro: mensagem,
        },
      });
      resumo.adiadas += deDocumento.length;
      agendarProcessamento(espera + 1_000);
    } else {
      await fechar({ emailStatus: STATUS_EMAIL.FALHOU, emailErro: mensagem });
      resumo.falhas += deDocumento.length;
    }

    console.error("[notificacoes] Brevo não enviou o e-mail:", {
      userId,
      status: brevo?.status ?? null,
      codigo: brevo?.codigo ?? null,
      tentativas,
      erro: mensagem,
    });
  }
}
