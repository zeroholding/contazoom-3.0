/**
 * Conteúdo da notificação de documento novo — funções puras, sem banco.
 *
 * Ficam separadas de `criar.ts` (que lê o banco) para serem testadas sem
 * Postgres: `scripts/teste-notificacoes.ts`.
 */

import {
  TIPO_NOTIFICACAO,
  infoTipoNotificacao,
  type DadosNotificacaoDocumento,
  type TipoNotificacao,
} from "./tipos";

export type PastaDocumento = { id: string; name: string; parentId: string | null };

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/**
 * Nome de pasta legível: "02. IMPOSTOS E OBRIGAÇÕES" → "Impostos e obrigações".
 *
 * As pastas padrão vêm em caixa alta e com o número na frente (para ordenar no
 * drive). No sino e no e-mail isso grita e o número não diz nada ao cliente.
 * Pasta criada à mão com caixa mista ("Contratos 2026") fica como está.
 */
export function rotuloPasta(nome: string): string {
  const semNumero = nome.replace(/^\s*\d+\s*[.)-]\s*/, "").trim();
  if (!semNumero) return nome.trim();
  const temMinuscula = /[a-zà-ÿ]/.test(semNumero);
  if (temMinuscula) return semNumero;
  const minusculo = semNumero.toLocaleLowerCase("pt-BR");
  return minusculo.charAt(0).toLocaleUpperCase("pt-BR") + minusculo.slice(1);
}

/** Pastas do documento, da raiz até a pasta dele. Resiste a ciclo no cadastro. */
export function caminhoDaPasta(
  pastaId: string | null | undefined,
  pastasPorId: Map<string, PastaDocumento>,
): PastaDocumento[] {
  const caminho: PastaDocumento[] = [];
  const visitadas = new Set<string>();
  let atual = pastaId ? pastasPorId.get(pastaId) : undefined;
  while (atual && !visitadas.has(atual.id)) {
    visitadas.add(atual.id);
    caminho.unshift(atual);
    atual = atual.parentId ? pastasPorId.get(atual.parentId) : undefined;
  }
  return caminho;
}

/** Categoria antiga gravada em `documento.category` (antes das pastas). */
const TIPO_POR_CATEGORIA: Record<string, TipoNotificacao> = {
  "01_INSTITUCIONAIS": TIPO_NOTIFICACAO.DOCUMENTO_INSTITUCIONAL,
  "02_IMPOSTOS": TIPO_NOTIFICACAO.DOCUMENTO_IMPOSTOS,
  "03_FATURAMENTO": TIPO_NOTIFICACAO.DOCUMENTO_FATURAMENTO,
  "04_FOLHA": TIPO_NOTIFICACAO.DOCUMENTO_FOLHA,
  IMPOSTOS: TIPO_NOTIFICACAO.DOCUMENTO_IMPOSTOS,
  FOLHA: TIPO_NOTIFICACAO.DOCUMENTO_FOLHA,
  FATURAMENTO: TIPO_NOTIFICACAO.DOCUMENTO_FATURAMENTO,
  INSTITUCIONAL: TIPO_NOTIFICACAO.DOCUMENTO_INSTITUCIONAL,
};

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

/**
 * Tipo da notificação a partir de onde o documento foi guardado.
 *
 * A tela de envio grava `category: "CUSTOM"` e a pasta escolhida, então quem
 * decide é o NOME das pastas do caminho (a raiz é uma das quatro padrão, ou uma
 * subpasta dela). A categoria só manda quando é uma das antigas.
 */
export function tipoDoDocumento(categoria: string | null | undefined, nomesDoCaminho: string[]): TipoNotificacao {
  const porCategoria = categoria ? TIPO_POR_CATEGORIA[categoria.toUpperCase()] : undefined;
  if (porCategoria) return porCategoria;

  const caminho = semAcento(nomesDoCaminho.join(" / "));
  if (caminho.includes("IMPOSTO") || caminho.includes("OBRIGAC") || caminho.includes("TRIBUT")) {
    return TIPO_NOTIFICACAO.DOCUMENTO_IMPOSTOS;
  }
  if (caminho.includes("FOLHA") || caminho.includes("FUNCIONARI") || caminho.includes("PESSOAL")) {
    return TIPO_NOTIFICACAO.DOCUMENTO_FOLHA;
  }
  if (caminho.includes("FATURAMENTO") || caminho.includes("RELATORIO")) {
    return TIPO_NOTIFICACAO.DOCUMENTO_FATURAMENTO;
  }
  if (caminho.includes("INSTITUCION") || caminho.includes("CONTRATO") || caminho.includes("SOCIETARI")) {
    return TIPO_NOTIFICACAO.DOCUMENTO_INSTITUCIONAL;
  }
  return TIPO_NOTIFICACAO.DOCUMENTO_GERAL;
}

/**
 * Competência legível a partir do `subFolder` de impostos.
 *
 * O envio grava "2026/09 - Setembro" (mais "/lojas" quando há loja marcada).
 * Retorna "setembro de 2026", ou só "2026" quando não há mês, ou null.
 */
export function competenciaDoSubFolder(subFolder: string | null | undefined): string | null {
  if (!subFolder) return null;
  const [ano, mes] = subFolder.split("/").map((parte) => parte.trim());
  if (!ano || !/^\d{4}$/.test(ano)) return null;
  const numeroMes = mes ? Number.parseInt(mes, 10) : Number.NaN;
  if (Number.isInteger(numeroMes) && numeroMes >= 1 && numeroMes <= 12) {
    return `${MESES[numeroMes - 1]} de ${ano}`;
  }
  return ano;
}

/** "1,4 MB", "820 KB": o mesmo arredondamento do drive. */
export function tamanhoLegivel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** "PDF", "XLSX", "IMG": selo curto do formato, para o e-mail e o sino. */
export function formatoDoArquivo(nomeArquivo: string, mimeType: string): string {
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.startsWith("image/")) return "IMG";
  const extensao = nomeArquivo.includes(".") ? nomeArquivo.split(".").pop() ?? "" : "";
  const limpa = extensao.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase();
  return limpa || "DOC";
}

export type EntradaDocumentoNovo = {
  documento: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    category: string | null;
    subFolder: string | null;
    folderId: string | null;
  };
  pastas: PastaDocumento[];
};

export type NotificacaoMontada = {
  tipo: TipoNotificacao;
  titulo: string;
  mensagem: string;
  link: string;
  dados: DadosNotificacaoDocumento;
};

/**
 * Tudo o que a notificação mostra, montado de uma vez.
 *
 * `titulo` é uma frase completa (é o que vai no aviso flutuante e nos leitores
 * de tela); o sino usa `dados.nomeArquivo` como linha principal, porque o nome
 * do arquivo é o que o cliente procura.
 */
export function montarNotificacaoDocumento({ documento, pastas }: EntradaDocumentoNovo): NotificacaoMontada {
  const pastasPorId = new Map(pastas.map((pasta) => [pasta.id, pasta]));
  const caminho = caminhoDaPasta(documento.folderId, pastasPorId);
  const nomesDoCaminho = caminho.map((pasta) => pasta.name);
  const tipo = tipoDoDocumento(documento.category, nomesDoCaminho);
  const competencia =
    tipo === TIPO_NOTIFICACAO.DOCUMENTO_IMPOSTOS ? competenciaDoSubFolder(documento.subFolder) : null;

  const rotulos = caminho.map((pasta) => rotuloPasta(pasta.name));
  const pasta = rotulos.length > 0 ? rotulos.join(" › ") : null;
  const nomeArquivo = documento.originalName.trim() || "Documento";

  const ondeFoiGuardado = rotulos.length > 0 ? rotulos[0] : null;
  const titulo =
    tipo === TIPO_NOTIFICACAO.DOCUMENTO_IMPOSTOS
      ? "Novo documento de impostos e obrigações"
      : ondeFoiGuardado
        ? `Novo documento em ${ondeFoiGuardado}`
        : "Novo documento disponível";

  const detalhes = [nomeArquivo];
  if (competencia) detalhes.push(`competência ${competencia}`);
  else if (pasta && tipo === TIPO_NOTIFICACAO.DOCUMENTO_GERAL) detalhes.push(pasta);

  return {
    tipo,
    titulo,
    mensagem: detalhes.join(" · "),
    link: `/documentos?documento=${encodeURIComponent(documento.id)}`,
    dados: {
      documentoId: documento.id,
      nomeArquivo,
      mimeType: documento.mimeType,
      tamanhoBytes: documento.sizeBytes,
      pasta: pasta ?? infoTipoNotificacao(tipo).rotulo,
      competencia,
    },
  };
}
