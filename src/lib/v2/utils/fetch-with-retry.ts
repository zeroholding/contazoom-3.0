import { sendProgressToUser } from "@/lib/sse-progress";

/**
 * Aguarda um tempo específico (exponential backoff)
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verifica se um erro HTTP é temporário e pode ser retentado
 */
function isRetryableError(status: number): boolean {
  return [429, 500, 502, 503, 504].includes(status);
}

/**
 * Faz uma requisição HTTP com retry automático para erros temporários
 */
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
    // Timeout por tentativa: sem isto, um request pendurado (ML/Shopee lenta)
    // travava o sync indefinidamente — cauda de latência. Combinamos o timeout
    // com o signal que o chamador já tenha passado, se houver.
    let timeoutSignal: AbortSignal;
    try {
      timeoutSignal = AbortSignal.timeout(timeoutMs);
    } catch {
      // Ambiente sem AbortSignal.timeout: fallback com controller manual
      const controller = new AbortController();
      setTimeout(() => controller.abort(), timeoutMs);
      timeoutSignal = controller.signal;
    }

    let signal: AbortSignal = timeoutSignal;
    if (options.signal) {
      try {
        signal = AbortSignal.any([options.signal, timeoutSignal]);
      } catch {
        signal = options.signal; // ambiente sem AbortSignal.any
      }
    }

    try {
      const response = await fetch(url, { ...options, signal });
      lastResponse = response;

      // Se sucesso, retorna imediatamente
      if (response.ok) {
        return response;
      }

      // Erros de autenticação (401, 403) não devem ser retryable - falhar imediatamente
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
        return response; // Retornar resposta de erro para tratamento específico
      }

      // Se erro não-retryable (exceto auth), retorna imediatamente
      if (!isRetryableError(response.status)) {
        console.warn(
          `[Sync] Erro HTTP ${
            response.status
          } (não-retryable) em ${url.substring(0, 80)}...`,
        );
        return response;
      }

      // Erro retryable - tentar novamente
      lastError = new Error(`HTTP ${response.status}`);

      // Calcular delay com exponential backoff
      const baseDelay = 1000; // 1 segundo
      const delay = baseDelay * Math.pow(2, attempt); // 1s, 2s, 4s
      const jitter = Math.random() * 1000; // até 1s de jitter
      const totalDelay = delay + jitter;

      console.warn(
        `[Retry] Erro ${response.status} em ${url.substring(0, 80)}... ` +
          `Tentativa ${attempt + 1}/${maxRetries}. Aguardando ${Math.round(
            totalDelay,
          )}ms`,
      );

      // Enviar aviso via SSE apenas na primeira tentativa
      if (userId && attempt === 0) {
        sendProgressToUser(userId, {
          type: "sync_warning",
          message: `Erro temporário ${response.status} da API do Mercado Livre. Tentando novamente...`,
          errorCode: response.status.toString(),
        });
      }

      // Aguardar antes de tentar novamente
      await sleep(totalDelay);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Log do erro
      console.error(
        `[Retry] Erro na requisição (tentativa ${attempt + 1}/${maxRetries}):`,
        lastError.message,
      );

      // Se é a última tentativa, lançar erro
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

      const baseDelay = 1000;
      const delay = baseDelay * Math.pow(2, attempt);
      const jitter = Math.random() * 1000;
      const totalDelay = delay + jitter;

      console.warn(
        `[Retry] Erro de rede em ${url.substring(0, 80)}... ` +
          `Tentativa ${attempt + 1}/${maxRetries}. Aguardando ${Math.round(
            totalDelay,
          )}ms`,
      );

      // Enviar aviso via SSE apenas na primeira tentativa
      if (userId && attempt === 0) {
        sendProgressToUser(userId, {
          type: "sync_warning",
          message: `Erro de conexão. Tentando novamente...`,
          errorCode: "NETWORK_ERROR",
        });
      }

      await sleep(totalDelay);
    }
  }

  // Se chegou aqui, todas as tentativas falharam
  if (lastResponse && !lastResponse.ok) {
    return lastResponse; // Retornar última resposta de erro
  }

  throw lastError || new Error("Falha após múltiplas tentativas");
}
