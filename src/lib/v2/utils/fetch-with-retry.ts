import { sendProgressToUser } from "@/lib/sse-progress";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(status: number): boolean {
  return [429, 500, 502, 503, 504].includes(status);
}

const MAX_RETRY_DELAY_MS = 10_000;

/** Converte Retry-After em milissegundos (segundos ou data HTTP). */
function retryAfterMs(response: Response): number | null {
  if (response.status !== 429 && response.status !== 503) return null;

  const header = response.headers.get("retry-after")?.trim();
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_DELAY_MS, seconds * 1000);
  }

  const retryAt = Date.parse(header);
  if (!Number.isFinite(retryAt)) return null;
  return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, retryAt - Date.now()));
}

/** Faz uma requisição HTTP com retry automático para erros temporários. */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  userId?: string,
  timeoutMs: number = 30000,
): Promise<Response> {
  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let timeoutSignal: AbortSignal;
    try {
      timeoutSignal = AbortSignal.timeout(timeoutMs);
    } catch {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), timeoutMs);
      timeoutSignal = controller.signal;
    }

    let signal: AbortSignal = timeoutSignal;
    if (options.signal) {
      try {
        signal = AbortSignal.any([options.signal, timeoutSignal]);
      } catch {
        signal = options.signal;
      }
    }

    try {
      const response = await fetch(url, { ...options, signal });
      lastResponse = response;

      if (response.ok) return response;

      if (response.status === 401 || response.status === 403) {
        console.error(
          `[Sync] Erro de autenticação ${response.status} - Token pode estar inválido`,
        );
        console.log(url);
        if (userId) {
          sendProgressToUser(userId, {
            type: "sync_warning",
            message: `Erro de autenticação ${response.status}. Verifique se a conta está conectada corretamente.`,
            errorCode: response.status.toString(),
          });
        }
        return response;
      }

      if (!isRetryableError(response.status)) {
        console.warn(
          `[Sync] Erro HTTP ${response.status} (não-retryable) em ${url.substring(0, 80)}...`,
        );
        return response;
      }

      lastError = new Error(`HTTP ${response.status}`);

      // A última resposta é devolvida imediatamente: nunca há sleep sem retry.
      if (attempt === maxRetries - 1) return response;

      const backoffMs = 1000 * Math.pow(2, attempt) + Math.random() * 1000;
      const headerDelayMs = retryAfterMs(response);
      const totalDelay = Math.min(
        MAX_RETRY_DELAY_MS,
        headerDelayMs ?? backoffMs,
      );

      console.warn(
        `[Retry] Erro ${response.status} em ${url.substring(0, 80)}... ` +
          `Tentativa ${attempt + 1}/${maxRetries}. Aguardando ${Math.round(totalDelay)}ms`,
      );

      if (userId && attempt === 0) {
        sendProgressToUser(userId, {
          type: "sync_warning",
          message: `Erro temporário ${response.status} da API do Mercado Livre. Tentando novamente...`,
          errorCode: response.status.toString(),
        });
      }

      await sleep(totalDelay);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      console.error(
        `[Retry] Erro na requisição (tentativa ${attempt + 1}/${maxRetries}):`,
        lastError.message,
      );

      if (attempt === maxRetries - 1) {
        if (userId) {
          sendProgressToUser(userId, {
            type: "sync_warning",
            message: `Erro de conexão após ${maxRetries} tentativas: ${lastError.message}`,
            errorCode: "NETWORK_ERROR",
          });
        }
        throw lastError;
      }

      const totalDelay = Math.min(
        MAX_RETRY_DELAY_MS,
        1000 * Math.pow(2, attempt) + Math.random() * 1000,
      );

      console.warn(
        `[Retry] Erro de rede em ${url.substring(0, 80)}... ` +
          `Tentativa ${attempt + 1}/${maxRetries}. Aguardando ${Math.round(totalDelay)}ms`,
      );

      if (userId && attempt === 0) {
        sendProgressToUser(userId, {
          type: "sync_warning",
          message: "Erro de conexão. Tentando novamente...",
          errorCode: "NETWORK_ERROR",
        });
      }

      await sleep(totalDelay);
    }
  }

  if (lastResponse && !lastResponse.ok) return lastResponse;
  throw lastError || new Error("Falha após múltiplas tentativas");
}
