"use client";

/**
 * Cliente HTTP do módulo de tarefas.
 *
 * Existe por causa de uma inconsistência real do backend: apuração e empresas
 * devolvem `code` em minúsculo (`tarefa_bloqueada`), legalização devolve em
 * maiúsculo (`PROCESSO_BLOQUEADO`), e alguns 400 de empresa não têm `code` — só
 * `campo`. Se cada tela tratasse isso sozinha, metade dos erros apareceria como
 * "Erro desconhecido" e o operador ficaria sem saber o que fazer.
 *
 * Aqui o erro chega SEMPRE com mensagem legível em português, e o `code` vem
 * normalizado em minúsculo para quem precisar decidir por código.
 */

export class ErroApi extends Error {
  status: number;
  /** Sempre minúsculo, independente do dialeto da rota. */
  code: string | null;
  campo: string | null;
  /** Corpo completo, para quem precisa de `etapasPendentes`, `empresaId` etc. */
  corpo: Record<string, unknown>;

  constructor(
    mensagem: string,
    status: number,
    code: string | null,
    campo: string | null,
    corpo: Record<string, unknown>
  ) {
    super(mensagem);
    this.name = "ErroApi";
    this.status = status;
    this.code = code;
    this.campo = campo;
    this.corpo = corpo;
  }
}

const MENSAGEM_POR_STATUS: Record<number, string> = {
  401: "Sua sessão expirou. Entre novamente.",
  403: "Seu perfil não tem permissão para esta ação.",
  404: "Registro não encontrado.",
  409: "A ação não pode ser aplicada no estado atual.",
  500: "Erro interno no servidor. Tente novamente.",
};

async function tratar<T>(resposta: Response): Promise<T> {
  // 204 e afins não têm corpo; tentar ler JSON explodiria.
  const texto = await resposta.text();
  let corpo: Record<string, unknown> = {};
  if (texto) {
    try {
      corpo = JSON.parse(texto) as Record<string, unknown>;
    } catch {
      // Resposta não-JSON só acontece em falha de infraestrutura (HTML de erro
      // do proxy, por exemplo). Guardar o texto cru ajuda a diagnosticar.
      corpo = { error: texto.slice(0, 300) };
    }
  }

  if (!resposta.ok) {
    const mensagem =
      (typeof corpo.error === "string" && corpo.error) ||
      MENSAGEM_POR_STATUS[resposta.status] ||
      `Falha na requisição (${resposta.status}).`;

    const code =
      typeof corpo.code === "string" ? corpo.code.toLowerCase() : null;
    const campo = typeof corpo.campo === "string" ? corpo.campo : null;

    throw new ErroApi(mensagem, resposta.status, code, campo, corpo);
  }

  return corpo as T;
}

export async function apiGet<T>(
  url: string,
  sinal?: AbortSignal
): Promise<T> {
  const resposta = await fetch(url, {
    cache: "no-store",
    credentials: "include",
    signal: sinal,
  });
  return tratar<T>(resposta);
}

async function comCorpo<T>(
  metodo: "POST" | "PATCH" | "DELETE" | "PUT",
  url: string,
  dados?: unknown
): Promise<T> {
  const resposta = await fetch(url, {
    method: metodo,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    // Sempre manda corpo, mesmo vazio: a legalização aceita `{}`, e a apuração
    // trata corpo ausente como inválido em várias rotas.
    body: JSON.stringify(dados ?? {}),
  });
  return tratar<T>(resposta);
}

export const apiPost = <T>(url: string, dados?: unknown) =>
  comCorpo<T>("POST", url, dados);

export const apiPatch = <T>(url: string, dados?: unknown) =>
  comCorpo<T>("PATCH", url, dados);

export const apiDelete = <T>(url: string, dados?: unknown) =>
  comCorpo<T>("DELETE", url, dados);

/**
 * Upload de arquivo (multipart).
 *
 * Separado de `comCorpo` porque NÃO pode ter `Content-Type` definido à mão: o
 * navegador precisa montar o cabeçalho junto com o `boundary` do multipart, e
 * escrever `multipart/form-data` sem boundary faz o servidor não achar campo
 * nenhum. É o erro clássico de upload com fetch.
 *
 * O tratamento de erro é o mesmo das outras chamadas, então a tela recebe
 * `ErroApi` com mensagem em português igual ao resto — inclusive nos 413 e 415
 * que só esta rota devolve.
 */
export async function apiUpload<T>(
  url: string,
  formulario: FormData,
  sinal?: AbortSignal
): Promise<T> {
  const resposta = await fetch(url, {
    method: "POST",
    credentials: "include",
    body: formulario,
    signal: sinal,
  });
  return tratar<T>(resposta);
}

/** Mensagem legível de qualquer erro capturado num `catch`. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroApi) return erro.message;
  if (erro instanceof DOMException && erro.name === "AbortError") return "";
  if (erro instanceof Error) return erro.message;
  return "Erro inesperado.";
}

/**
 * Monta query string ignorando vazio.
 *
 * `?status=` (vazio) não é o mesmo que omitir: algumas rotas validam o valor e
 * devolvem 400 para string vazia.
 */
export function query(
  params: Record<string, string | number | boolean | null | undefined>
): string {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (valor === null || valor === undefined || valor === "") continue;
    busca.set(chave, String(valor));
  }
  const texto = busca.toString();
  return texto ? `?${texto}` : "";
}
