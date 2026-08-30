/**
 * Anexo de tarefa: tipos aceitos, limite de tamanho e nome de arquivo.
 *
 * O escritório pediu para anexar documento e imagem ao criar e ao editar o card.
 * As decisões que sustentam isso:
 *
 * 1. TABELA PRÓPRIA (`TarefaAnexo`), não `Document`. `Document` é o cofre do
 *    CLIENTE: `userId` obrigatório, aparece na árvore de pastas do painel dele e
 *    o upload é restrito a administrador. Anexo de tarefa é interno, pertence à
 *    tarefa e é enviado por quem trabalha no fluxo. Pendurar `processoId`
 *    opcional em `Document` faria todo anexo precisar de um dono arbitrário e
 *    vazaria arquivo interno para a pasta do cliente.
 *
 * 2. DISCO LOCAL, em `UPLOAD_DIR`, subpasta `tarefas`. É o que o projeto já faz
 *    em `/api/documents`, e não há credencial de S3 ou R2 configurada. Os
 *    composes ganharam volume nomeado em `/app/uploads` na mesma mudança —
 *    sem ele o arquivo morria no deploy seguinte, e a linha no banco continuava
 *    apontando para um arquivo inexistente. Trocar por S3 depois muda este
 *    arquivo e mais nada.
 *
 * 3. LISTA BRANCA de tipos, não lista negra. Lista negra sempre esquece um: um
 *    `.svg` com script dentro, servido do mesmo domínio, é XSS. Aqui só passa o
 *    que o escritório de fato manda — PDF, imagem raster, documento de escritório
 *    e planilha.
 *
 * 4. O nome no disco NUNCA é o nome enviado. Nome de arquivo do usuário carrega
 *    `../`, caractere de controle e colisão ("contrato.pdf" duas vezes). O nome
 *    original fica na coluna `nomeOriginal`, para exibição e download.
 */

/*
 * ARQUIVO SEM IMPORTS.
 *
 * `Anexos.tsx` é `"use client"` e precisa dos limites, da lista branca e dos
 * formatadores para avisar antes de gastar a rede. Se este arquivo importasse
 * `path` (para montar o caminho no disco), o bundle do navegador carregaria um
 * polyfill de módulo do Node para nada.
 *
 * O que toca disco mora em `src/lib/tarefa-anexo-disco.ts`, importado só pelas
 * duas rotas.
 */

/* -------------------------------------------------------------------------- */
/*                                   Limites                                  */
/* -------------------------------------------------------------------------- */

/**
 * 20 MB por arquivo.
 *
 * Contrato social digitalizado dá 2 a 5 MB; foto de documento tirada de celular
 * moderno passa de 8 MB. 20 cobre com folga e ainda impede que alguém suba um
 * vídeo. O limite é conferido no servidor, sempre: `accept` e checagem no
 * navegador são conveniência, não controle.
 */
export const TAMANHO_MAXIMO_BYTES = 20 * 1024 * 1024;

/** Quantos arquivos um card pode ter. Teto para não virar depósito. */
export const ANEXOS_MAXIMO_POR_TAREFA = 30;

/* -------------------------------------------------------------------------- */
/*                                    Tipos                                   */
/* -------------------------------------------------------------------------- */

/**
 * Tipos aceitos, e as extensões que cada um pode ter.
 *
 * A extensão é conferida junto com o MIME porque o MIME vem do navegador e é
 * palpitado a partir da extensão de qualquer forma — conferir os dois pega o
 * caso de MIME genérico (`application/octet-stream`) com extensão boa e o de
 * MIME bom com extensão trocada.
 */
const TIPOS_ACEITOS: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "image/gif": [".gif"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/csv": [".csv"],
  "text/plain": [".txt"],
  "application/xml": [".xml"],
  "text/xml": [".xml"],
  "application/zip": [".zip"],
};

/** Extensões aceitas, para o `accept` do seletor de arquivo e para o fallback. */
export const EXTENSOES_ACEITAS: string[] = [
  ...new Set(Object.values(TIPOS_ACEITOS).flat()),
].sort();

/** Valor pronto para o atributo `accept` do `<input type="file">`. */
export const ACCEPT_ANEXO = EXTENSOES_ACEITAS.join(",");

/** Extensão do nome, em minúsculas e com o ponto. `""` quando não tem. */
export function extensaoDe(nome: string): string {
  const ponto = nome.lastIndexOf(".");
  if (ponto <= 0 || ponto === nome.length - 1) return "";
  return nome.slice(ponto).toLowerCase();
}

export type ResultadoTipo =
  | { ok: true; tipoMime: string }
  | { ok: false; erro: string };

/**
 * Confere tipo e extensão.
 *
 * Quando o MIME chega genérico mas a extensão é conhecida, o tipo é resolvido
 * PELA EXTENSÃO em vez de recusar: alguns navegadores mandam
 * `application/octet-stream` para `.xlsx` e `.heic`, e recusar aí seria recusar
 * arquivo legítimo por defeito do navegador de quem envia.
 */
export function validarTipo(
  tipoInformado: string,
  nomeArquivo: string
): ResultadoTipo {
  const extensao = extensaoDe(nomeArquivo);
  const mime = (tipoInformado || "").toLowerCase().split(";")[0].trim();

  const extensoesDoMime = TIPOS_ACEITOS[mime];
  if (extensoesDoMime) {
    // MIME conhecido: a extensão tem de bater com ele. Extensão ausente passa,
    // porque há sistema que salva anexo sem extensão nenhuma.
    if (!extensao || extensoesDoMime.includes(extensao)) {
      return { ok: true, tipoMime: mime };
    }
    return {
      ok: false,
      erro: `A extensão ${extensao} não corresponde ao tipo do arquivo (${mime}). Renomeie ou envie o arquivo original.`,
    };
  }

  // MIME desconhecido ou genérico: decide pela extensão.
  if (extensao) {
    const porExtensao = Object.entries(TIPOS_ACEITOS).find(([, exts]) =>
      exts.includes(extensao)
    );
    if (porExtensao) return { ok: true, tipoMime: porExtensao[0] };
  }

  return {
    ok: false,
    erro: `Tipo de arquivo não aceito. Envie um destes: ${EXTENSOES_ACEITAS.join(
      " "
    )}.`,
  };
}

/** O anexo é imagem, para a tela mostrar o ícone certo e oferecer visualização. */
export function ehImagem(tipoMime: string): boolean {
  return tipoMime.startsWith("image/");
}

/** Ícone lucide por tipo. Nunca emoji. */
export function iconeDoAnexo(tipoMime: string): string {
  if (ehImagem(tipoMime)) return "FileImage";
  if (tipoMime === "application/pdf") return "FileText";
  if (
    tipoMime.includes("spreadsheet") ||
    tipoMime.includes("excel") ||
    tipoMime === "text/csv"
  ) {
    return "FileSpreadsheet";
  }
  if (tipoMime.includes("word")) return "FileText";
  return "File";
}

/* -------------------------------------------------------------------------- */
/*                              Nome no disco                                 */
/* -------------------------------------------------------------------------- */

/**
 * Nome higienizado para gravar no disco.
 *
 * Três coisas de uma vez:
 *
 *   - prefixo de timestamp e aleatório, para dois "contrato.pdf" não colidirem
 *   - só `[A-Za-z0-9._-]` no resto, o que elimina `../`, barra, dois-pontos e
 *     caractere de controle — nenhum nome montado assim escapa da pasta
 *   - teto de 120 caracteres, porque sistema de arquivo tem limite e nome de
 *     255 bytes com prefixo estoura
 *
 * O nome original NÃO é jogado fora: fica em `nomeOriginal`, e é ele que a tela
 * mostra e o download devolve.
 */
export function nomeParaDisco(nomeOriginal: string): string {
  const base = nomeOriginal
    .normalize("NFKD")
    // Tudo que não é letra, dígito, `_`, ponto ou hífen vira `_`. Elimina barra,
    // contrabarra, dois-pontos e caractere de controle de uma vez.
    .replace(/[^\w.-]+/g, "_")
    // Ponto duplo vira `_`.
    //
    // Sem esta linha, "contrato/../../fora.pdf" viraria
    // "contrato_.._.._fora.pdf": sem separador, então `join` não escaparia da
    // pasta — mas COM `..` no nome, e aí `nomeDeArquivoSeguro` recusaria o nome
    // que esta própria função gerou, e o upload falharia com "nome inválido".
    // Gerador e validador têm de concordar; foi um teste que pegou isso.
    .replace(/\.{2,}/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[._-]+/, "")
    .slice(-120);

  const seguro = base || "arquivo";
  const aleatorio = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}_${aleatorio}_${seguro}`;
}

/**
 * O nome é seguro para compor caminho de arquivo.
 *
 * Fica aqui, e não no módulo de disco, porque é regra pura e é testada junto com
 * `nomeParaDisco`: o par "gera nome" / "confere nome" só vale se os dois
 * concordarem, e separá-los em arquivos diferentes convida a divergirem.
 */
export function nomeDeArquivoSeguro(arquivo: string): boolean {
  if (!arquivo) return false;
  if (arquivo.includes("/") || arquivo.includes("\\")) return false;
  if (arquivo.includes("..")) return false;
  return true;
}

/* -------------------------------------------------------------------------- */
/*                                 Exibição                                   */
/* -------------------------------------------------------------------------- */

/** Tamanho legível: "412 KB", "2,3 MB". */
export function tamanhoLegivel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1).replace(".", ",")} MB`;
}

/**
 * `Content-Disposition` seguro.
 *
 * O nome original pode ter acento, vírgula e aspas, que quebram o cabeçalho — a
 * versão ASCII cobre o cliente antigo e `filename*` em UTF-8 entrega o nome de
 * verdade. Aspas e barra invertida são removidas do fallback para não fechar a
 * string do cabeçalho no meio.
 */
export function contentDisposition(
  nomeOriginal: string,
  embutir: boolean
): string {
  const tipo = embutir ? "inline" : "attachment";
  const ascii = nomeOriginal.replace(/["\\]/g, "").replace(/[^\x20-\x7E]/g, "_");
  const utf8 = encodeURIComponent(nomeOriginal);
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
