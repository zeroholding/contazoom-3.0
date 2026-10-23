/**
 * Envio de e-mail transacional pela API do Brevo (antigo Sendinblue).
 *
 * POST https://api.brevo.com/v3/smtp/email com o cabeçalho `api-key`.
 * Referência: https://developers.brevo.com/reference/send-transac-email
 *
 * Sem SDK: é uma chamada só, e o SDK traria dezenas de dependências para isso.
 *
 * Configuração (variáveis de ambiente):
 *   BREVO_API_KEY       obrigatória
 *   BREVO_SENDER_EMAIL  obrigatória — remetente VALIDADO no Brevo (Senders &
 *                       IP / domínio autenticado). Remetente não validado faz o
 *                       Brevo recusar o envio com 400.
 *   BREVO_SENDER_NAME   opcional, padrão "ContaZoom"
 *   BREVO_REPLY_TO      opcional — para onde vai a resposta do cliente
 *   BREVO_SANDBOX=1     opcional — o Brevo valida a requisição e NÃO entrega
 *                       (cabeçalho X-Sib-Sandbox: drop). Para testar em produção.
 */

export type ConfigBrevo = {
  apiKey: string;
  apiUrl: string;
  remetente: { email: string; nome: string };
  responderPara: string | null;
  sandbox: boolean;
};

type Ambiente = Record<string, string | undefined>;

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Configuração lida do ambiente, ou `null` quando falta o essencial. */
export function configBrevo(ambiente: Ambiente = process.env): ConfigBrevo | null {
  const apiKey = ambiente.BREVO_API_KEY?.trim();
  const remetenteEmail = ambiente.BREVO_SENDER_EMAIL?.trim();
  if (!apiKey || !remetenteEmail || !EMAIL_VALIDO.test(remetenteEmail)) return null;

  const responderPara = ambiente.BREVO_REPLY_TO?.trim();
  return {
    apiKey,
    apiUrl: (ambiente.BREVO_API_URL?.trim() || "https://api.brevo.com/v3").replace(/\/+$/, ""),
    remetente: {
      email: remetenteEmail,
      // O Brevo limita o nome a 70 caracteres.
      nome: (ambiente.BREVO_SENDER_NAME?.trim() || "ContaZoom").slice(0, 70),
    },
    responderPara: responderPara && EMAIL_VALIDO.test(responderPara) ? responderPara : null,
    sandbox: ["1", "true", "sim"].includes((ambiente.BREVO_SANDBOX ?? "").trim().toLowerCase()),
  };
}

/** Por que a configuração não serve, para o log dizer o que fazer. */
export function motivoConfigBrevoAusente(ambiente: Ambiente = process.env): string {
  if (!ambiente.BREVO_API_KEY?.trim()) return "BREVO_API_KEY não configurada";
  const remetente = ambiente.BREVO_SENDER_EMAIL?.trim();
  if (!remetente) return "BREVO_SENDER_EMAIL não configurado";
  if (!EMAIL_VALIDO.test(remetente)) return "BREVO_SENDER_EMAIL inválido";
  return "";
}

export class ErroBrevo extends Error {
  readonly status: number;
  readonly codigo: string | null;
  /** Se vale tentar de novo mais tarde (limite de taxa, instabilidade, rede). */
  readonly retentavel: boolean;

  constructor(mensagem: string, status: number, codigo: string | null, retentavel: boolean) {
    super(mensagem);
    this.name = "ErroBrevo";
    this.status = status;
    this.codigo = codigo;
    this.retentavel = retentavel;
  }
}

export type MensagemEmail = {
  para: { email: string; nome?: string | null };
  assunto: string;
  html: string;
  texto: string;
  tags?: string[];
  /**
   * Mesma chave = mesmo envio. Repetir a chamada depois de um timeout (em que
   * o e-mail pode ter saído) não manda o e-mail duas vezes.
   */
  chaveIdempotencia?: string;
};

export type ResultadoEnvio = { messageId: string | null };

/** 429 e 5xx passam; 4xx é erro de cadastro/conta e repetir não resolve. */
function ehRetentavel(status: number): boolean {
  return status === 429 || status >= 500;
}

const TIMEOUT_MS = 15_000;

export async function enviarEmailBrevo(
  config: ConfigBrevo,
  mensagem: MensagemEmail,
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoEnvio> {
  const cabecalhosEmail: Record<string, string> = {};
  if (mensagem.chaveIdempotencia) cabecalhosEmail.IdempotencyKey = mensagem.chaveIdempotencia;
  if (config.sandbox) cabecalhosEmail["X-Sib-Sandbox"] = "drop";

  const corpo = {
    sender: { email: config.remetente.email, name: config.remetente.nome },
    to: [
      mensagem.para.nome
        ? { email: mensagem.para.email, name: mensagem.para.nome.slice(0, 70) }
        : { email: mensagem.para.email },
    ],
    subject: mensagem.assunto,
    htmlContent: mensagem.html,
    textContent: mensagem.texto,
    ...(config.responderPara ? { replyTo: { email: config.responderPara, name: config.remetente.nome } } : {}),
    ...(mensagem.tags?.length ? { tags: mensagem.tags } : {}),
    ...(Object.keys(cabecalhosEmail).length ? { headers: cabecalhosEmail } : {}),
  };

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);
  let resposta: Response;
  try {
    resposta = await fetchImpl(`${config.apiUrl}/smtp/email`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": config.apiKey,
      },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });
  } catch (erro) {
    const motivo = erro instanceof Error && erro.name === "AbortError" ? "tempo esgotado" : "falha de rede";
    throw new ErroBrevo(`Brevo indisponível (${motivo}).`, 0, null, true);
  } finally {
    clearTimeout(relogio);
  }

  const texto = await resposta.text().catch(() => "");
  let json: Record<string, unknown> | null = null;
  try {
    json = texto ? (JSON.parse(texto) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }

  if (!resposta.ok) {
    const codigo = typeof json?.code === "string" ? json.code : null;
    const detalhe = typeof json?.message === "string" ? json.message : texto.slice(0, 200);
    throw new ErroBrevo(
      `Brevo recusou o envio (${resposta.status}${codigo ? ` ${codigo}` : ""}): ${detalhe || "sem detalhe"}`,
      resposta.status,
      codigo,
      ehRetentavel(resposta.status),
    );
  }

  const messageId = typeof json?.messageId === "string" ? json.messageId : null;
  return { messageId };
}
