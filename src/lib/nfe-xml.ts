/**
 * Leitor de XML fiscal: bytes -> objeto tipado. Função pura, sem banco e sem rede.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE NÃO USA BIBLIOTECA DE XML
 *
 * `docs/PLANO_XML_FATURAMENTO.md` (seção 5.2) previa `fast-xml-parser` com uma
 * defesa de três camadas. Depois da Fase 0 a conclusão mudou, e por evidência:
 *
 * 1. Este módulo precisa de DOZE tags. Um parser DOM completo constrói a árvore
 *    inteira do documento para entregar doze strings.
 * 2. `fast-xml-parser` acumulou em 2026 uma família de CVEs de expansão de
 *    entidade e exaustão de pilha (GHSA-jmr7-xgp7-cmfj, CVE-2026-25128,
 *    CVE-2026-33036, CVE-2026-27942). São exatamente as classes de ataque que
 *    importam aqui, porque a entrada é arquivo que o cliente manda.
 * 3. O container não declara limite de memória (`docker-compose.prod.yml` sem
 *    `deploy.resources.limits`), então estourar a heap derruba a aplicação toda,
 *    não só a requisição.
 * 4. O diagnóstico rodou extração por tag contra 822 arquivos reais e a chave de
 *    acesso bateu com as tags em 100% das 458 notas. A abordagem está provada
 *    nesta base.
 *
 * Extração por tag também é, de graça, TOLERANTE A TAG DESCONHECIDA — que é
 * requisito, não preferência: a NT 2025.002-RTC já acrescentou grupos IBS/CBS, e
 * eles já aparecem em 361 dos 822 arquivos da base. Parser que valida contra XSD
 * transformaria cada nota técnica da SEFAZ em incidente de produção.
 *
 * O QUE ISTO NÃO É: um parser de XML de uso geral. Ele lê documento fiscal
 * brasileiro, cuja estrutura é fixada por layout público, e falha alto no que não
 * reconhece em vez de adivinhar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  verificarAssinaturaXml,
  type ResultadoAssinaturaXml,
} from "./xml-assinatura";
import { TAMANHO_MAXIMO_XML } from "./fiscal-limites";

export { TAMANHO_MAXIMO_XML } from "./fiscal-limites";

/** Modelos que este módulo sabe apurar. 13 (NFS-e nacional) entra na Fase 3. */
export const MODELOS_SUPORTADOS = ["55", "65"] as const;

/** Evento de cancelamento de NF-e. */
export const EVENTO_CANCELAMENTO = "110111";
/** Cancelamento por substituição (NFC-e). Cancela do mesmo jeito. */
export const EVENTO_CANCELAMENTO_SUBSTITUICAO = "110112";
/** Retornos que confirmam registro/vinculação do evento na SEFAZ.
 * 155 = cancelamento homologado fora de prazo; apareceu em 3 eventos reais. */
export const STATUS_EVENTO_REGISTRADO = ["135", "136", "155"] as const;

export function eventoFoiRegistrado(status: string | null): boolean {
  return STATUS_EVENTO_REGISTRADO.includes(
    status as (typeof STATUS_EVENTO_REGISTRADO)[number],
  );
}

export type CodigoErroXml =
  | "XML_VAZIO"
  | "ARQUIVO_GRANDE"
  | "XML_COM_DOCTYPE"
  | "XML_INVALIDO"
  | "CHAVE_AUSENTE"
  | "CHAVE_INVALIDA"
  | "XML_DIVERGENTE"
  | "CNPJ_EMITENTE_AUSENTE"
  | "DATA_EMISSAO_INVALIDA"
  | "DADO_FISCAL_INVALIDO"
  | "ASSINATURA_INVALIDA"
  | "VALOR_AUSENTE";

/** Erro de leitura com código estável, para a rota traduzir sem inspecionar texto. */
export class ErroXmlFiscal extends Error {
  readonly code: CodigoErroXml;
  /** Detalhe legível do que divergiu, quando houver. */
  readonly detalhe?: string;

  constructor(code: CodigoErroXml, mensagem: string, detalhe?: string) {
    super(mensagem);
    this.name = "ErroXmlFiscal";
    this.code = code;
    this.detalhe = detalhe;
  }
}

export type TipoDocumentoDestinatario = "CPF" | "CNPJ";

/** Uma NF-e ou NFC-e lida. Os campos crus do XML, sem regra de negócio aplicada. */
export type NotaFiscalLida = {
  tipo: "NOTA";
  /** 44 dígitos, sem o prefixo "NFe". */
  chave: string;
  /** "55" (NF-e) ou "65" (NFC-e). */
  modelo: string;
  serie: string;
  numero: number;
  emitidoEm: Date;
  /** Competência CIVIL de dhEmi, antes da conversão para UTC. */
  ano: number;
  mes: number;
  competencia: string;
  /** A assinatura XMLDSig do infNFe foi verificada na importação real. */
  assinaturaValida: boolean;
  /** "0" = entrada, "1" = saída. */
  tipoOperacao: string;
  /** "1" = produção, "2" = homologação. */
  ambiente: string;
  /** "1" normal, "2" complementar, "3" ajuste, "4" devolução. */
  finalidade: string;
  naturezaOperacao: string | null;
  /** cStat do protocolo de autorização. 100 = autorizada. */
  statusSefaz: string | null;
  protocolo: string | null;
  cnpjEmitente: string;
  nomeEmitente: string | null;
  /** CRT do emitente: 1 e 4 Simples, 3 regime normal. Informativo. */
  regimeEmitente: string | null;
  /**
   * CPF ou CNPJ do destinatário, só dígitos.
   *
   * Achado do diagnóstico: 71,8% dos destinatários são CPF (venda a consumidor
   * final). Por isso o campo é "documento" e não "cnpj" — nomear de cnpj levaria
   * a uma coluna VarChar(14) que rejeita a maioria dos casos.
   */
  documentoDestinatario: string | null;
  tipoDocumentoDestinatario: TipoDocumentoDestinatario | null;
  nomeDestinatario: string | null;
  /** vNF: o total da nota. */
  valorTotal: number;
  /** vProd: soma dos produtos. Diferença contra vNF é frete/desconto/ST. */
  valorProdutos: number | null;
  /**
   * CFOP de TODOS os itens, sem repetição e ordenado.
   *
   * De todos, não do primeiro: nota com itens de CFOP diferente existe, e é
   * exatamente a que uma regra baseada no primeiro item classificaria errado.
   */
  cfops: string[];
  /** true quando a nota referencia outra (<NFref>). */
  referenciaOutraNota: boolean;
  /**
   * Número do pedido no marketplace, quando o nome do arquivo o traz.
   *
   * O export do Mercado Livre nomeia `<10 dígitos>_<chave>-procNFe.xml`, e o
   * prefixo é o order_id — 461 de 461 arquivos na base analisada. É a única ponte
   * entre documento fiscal e venda de marketplace que existe hoje.
   */
  pedidoMarketplace: string | null;
};

/** Um arquivo de evento (cancelamento, carta de correção). */
export type EventoFiscalLido = {
  tipo: "EVENTO";
  /** Id oficial de infEvento, ou identidade estável montada quando ausente. */
  eventoId: string;
  /** Chave da nota a que o evento se refere. */
  chave: string;
  tipoEvento: string;
  sequencia: number;
  ambiente: string;
  documentoAutor: string | null;
  /** A assinatura XMLDSig do infEvento foi verificada na importação real. */
  assinaturaValida: boolean;
  justificativa: string | null;
  /** cStat do retorno. 135/136 = registrado. */
  statusSefaz: string | null;
  registradoEm: Date | null;
  /** true para 110111 e 110112. */
  ehCancelamento: boolean;
};

/**
 * Documento de modelo que este módulo não apura.
 *
 * Não é erro: a pasta do cliente traz CT-e de frete junto (361 dos 822 arquivos
 * da base, emitidos pelo próprio Mercado Livre). Precisa ser reconhecido e
 * relatado com o motivo, não recusado como arquivo inválido nem importado como
 * documento órfão.
 */
export type OutroModeloLido = {
  tipo: "OUTRO_MODELO";
  modelo: string | null;
  chave: string | null;
  cnpjEmitente: string | null;
  nomeEmitente: string | null;
  /** Todos os CNPJs que aparecem no documento, para validar a empresa escolhida. */
  documentosRelacionados: string[];
  valorTotal: number;
  emitidoEm: Date | null;
  ano: number | null;
  mes: number | null;
  raiz: string;
};

export type ArquivoFiscalLido = NotaFiscalLida | EventoFiscalLido | OutroModeloLido;

/* -------------------------------------------------------------------------- */
/*                          Extração de texto e tags                          */
/* -------------------------------------------------------------------------- */

/**
 * Decodifica respeitando o encoding DECLARADO no prólogo.
 *
 * Existe emissor que grava ISO-8859-1 declarando UTF-8 e o contrário. O valor não
 * se perde (dígito é ASCII), mas a razão social vira "NEXUS GROUP" com `Ã§` no
 * meio — e é isso que sai impresso no relatório que vai ao banco.
 *
 * Ausência de declaração assume UTF-8, que é o padrão do XML. Na base analisada
 * 43,6% dos arquivos não declaram encoding (são os CT-e), então falhar por
 * ausência recusaria quase metade da pasta.
 */
export function decodificarXml(bytes: Buffer | Uint8Array): { texto: string; encoding: string } {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const prologo = buffer.subarray(0, 200).toString("latin1");
  const declarado = prologo.match(/encoding=["']([^"']+)["']/i)?.[1]?.toUpperCase() ?? null;
  const ehLatin = declarado ? /8859|WINDOWS-1252|LATIN/i.test(declarado) : false;
  return {
    texto: buffer.toString(ehLatin ? "latin1" : "utf8"),
    encoding: declarado ?? "(ausente)",
  };
}

/** Decodifica as cinco entidades XML predefinidas e referências numéricas. */
function decodificarEntidades(valor: string): string {
  return valor.replace(
    /&(?:#x([0-9a-f]+)|#(\d+)|amp|lt|gt|quot|apos);/gi,
    (entidade, hex: string | undefined, dec: string | undefined) => {
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
      if (dec) return String.fromCodePoint(Number.parseInt(dec, 10));
      const fixas: Record<string, string> = {
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&apos;": "'",
      };
      return fixas[String(entidade).toLowerCase()] ?? entidade;
    },
  );
}

/**
 * Nome de tag com prefixo de namespace opcional (`nfe:ide`).
 * O layout normalmente usa namespace default, mas exportadores podem prefixar.
 */
const nomeXml = (nome: string) => `(?:[A-Za-z_][\\w.-]*:)?${nome}`;

/** Conteúdo de uma tag simples, na primeira ocorrência. Ignora tags em comentário. */
function tag(xml: string, nome: string): string | null {
  const padrao = new RegExp(
    `<${nomeXml(nome)}(?:\\s[^>]*)?>([\\s\\S]*?)</${nomeXml(nome)}>`,
  );
  const achado = xml.match(padrao);
  if (!achado) return null;
  let valor = achado[1].trim();
  const cdata = valor.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) valor = cdata[1].trim();
  // Tag simples não pode conter estrutura filha. Isso impede capturar por engano
  // um bloco inteiro quando o XML está malformado.
  if (/<(?:[A-Za-z_][\w.-]*:)?[A-Za-z_]/.test(valor)) return null;
  return valor ? decodificarEntidades(valor) : null;
}

/** Conteúdo de um bloco `<nome>...</nome>`, não-guloso. */
function bloco(xml: string, nome: string): string | null {
  const achado = xml.match(
    new RegExp(`<${nomeXml(nome)}(?:\\s[^>]*)?>([\\s\\S]*?)</${nomeXml(nome)}>`),
  );
  return achado ? achado[1] : null;
}

/** Primeira tag depois do prólogo: separa nota, evento e CT-e. */
function raizDoXml(texto: string): string {
  const encontrada = texto
    .match(/<\s*([A-Za-z_][\w.:-]*)[\s>]/g)
    ?.map((t) => t.replace(/[<>\s/]/g, ""))
    .find((t) => t !== "?xml" && t.toLowerCase() !== "xml");
  return (encontrada ?? "(desconhecida)").split(":").pop() ?? "(desconhecida)";
}

/** Só os dígitos. Usado em CNPJ, CPF e chave. */
function digitos(valor: string | null): string | null {
  if (!valor) return null;
  const limpo = valor.replace(/\D/g, "");
  return limpo ? limpo : null;
}

/**
 * Número decimal do XML fiscal.
 *
 * O layout usa ponto como separador decimal, sempre. Não há separador de milhar.
 * Devolve null no que não for número, para o chamador decidir se é erro.
 */
function decimal(valor: string | null): number | null {
  if (!valor) return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
}

/* -------------------------------------------------------------------------- */
/*                             Chave de acesso                                */
/* -------------------------------------------------------------------------- */

export type ChaveDecomposta = {
  uf: string;
  ano: number;
  mes: number;
  cnpj: string;
  modelo: string;
  serie: number;
  numero: number;
};

/**
 * O que a chave de acesso carrega dentro dela.
 *
 * `cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)` = 44.
 *
 * Isso dá duas coisas: idempotência (a chave é única no país, então reenviar o
 * mesmo arquivo é no-op) e conferência (as tags têm de bater com o que a chave
 * carrega; quando não batem, o arquivo foi editado à mão).
 */
export function chaveDeAcessoValida(chave: string): boolean {
  if (!/^\d{44}$/.test(chave)) return false;

  let soma = 0;
  let peso = 2;
  // O último dígito é o DV; pesos 2..9 da direita para a esquerda nos 43
  // anteriores, conforme o Módulo 11 do leiaute NF-e.
  for (let indice = 42; indice >= 0; indice -= 1) {
    soma += Number(chave[indice]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const candidato = 11 - resto;
  const esperado = candidato === 10 || candidato === 11 ? 0 : candidato;
  return Number(chave[43]) === esperado;
}

export function decomporChave(chave: string): ChaveDecomposta | null {
  if (!chaveDeAcessoValida(chave)) return null;
  return {
    uf: chave.slice(0, 2),
    ano: 2000 + Number(chave.slice(2, 4)),
    mes: Number(chave.slice(4, 6)),
    cnpj: chave.slice(6, 20),
    modelo: chave.slice(20, 22),
    serie: Number(chave.slice(22, 25)),
    numero: Number(chave.slice(25, 34)),
  };
}

function lerEmissaoCivil(
  valor: string,
): { instante: Date; ano: number; mes: number; competencia: string } | null {
  const partes = valor.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!partes) return null;

  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const civil = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    civil.getUTCFullYear() !== ano ||
    civil.getUTCMonth() + 1 !== mes ||
    civil.getUTCDate() !== dia
  ) {
    return null;
  }

  // `dEmi` antigo traz apenas a data; dhEmi traz instante com offset.
  const instante = valor.includes("T")
    ? new Date(valor)
    : new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(instante.getTime())) return null;

  return {
    instante,
    ano,
    mes,
    competencia: `${ano}-${String(mes).padStart(2, "0")}`,
  };
}

function exigirValorFiscal(
  nome: string,
  valor: string | null,
  permitidos: readonly string[],
): string {
  if (!valor || !permitidos.includes(valor)) {
    throw new ErroXmlFiscal(
      "DADO_FISCAL_INVALIDO",
      `${nome} inválido ou ausente: ${valor ?? "(ausente)"}.`,
    );
  }
  return valor;
}

type CertificadoAssinatura = Extract<
  ResultadoAssinaturaXml,
  { ok: true }
>["certificado"];

function validarCertificadoFiscal(
  certificado: CertificadoAssinatura,
  documento: string | null,
  instante: Date,
): void {
  if (!certificado.aparentaIcpBrasil) {
    throw new ErroXmlFiscal(
      "ASSINATURA_INVALIDA",
      "O certificado da assinatura não se identifica como certificado ICP-Brasil de pessoa jurídica.",
    );
  }
  if (!documento || !certificado.cnpjs.includes(documento)) {
    throw new ErroXmlFiscal(
      "ASSINATURA_INVALIDA",
      `O certificado da assinatura não pertence ao CNPJ ${documento ?? "(ausente)"}.`,
    );
  }
  if (instante < certificado.validoDe || instante > certificado.validoAte) {
    throw new ErroXmlFiscal(
      "ASSINATURA_INVALIDA",
      "O certificado não estava dentro da validade na data do documento fiscal.",
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Leitura                                   */
/* -------------------------------------------------------------------------- */

/**
 * Lê um arquivo XML fiscal.
 *
 * @param bytes conteúdo do arquivo
 * @param nomeArquivo usado só para extrair o número do pedido do marketplace
 */
export function lerXmlFiscal(
  bytes: Buffer | Uint8Array,
  nomeArquivo?: string,
  opcoes: { validarAssinatura?: boolean } = {},
): ArquivoFiscalLido {
  if (!bytes || bytes.length === 0) {
    throw new ErroXmlFiscal("XML_VAZIO", "O arquivo está vazio.");
  }
  if (bytes.length > TAMANHO_MAXIMO_XML) {
    throw new ErroXmlFiscal(
      "ARQUIVO_GRANDE",
      `O arquivo tem ${(bytes.length / 1024).toFixed(0)} KB e o limite é ${TAMANHO_MAXIMO_XML / 1024} KB.`,
    );
  }

  const { texto: textoOriginal } = decodificarXml(bytes);

  /**
   * Comentário não é dado. Remover antes de qualquer extração impede que
   * `<vNF>999999</vNF>` escrito num comentário seja lido antes da tag real.
   */
  const texto = textoOriginal.replace(/<!--[\s\S]*?-->/g, "");

  /**
   * DOCTYPE recusado ANTES de qualquer outra coisa.
   *
   * Esta é a defesa que não depende de biblioteca nem de versão: XXE e billion
   * laughs precisam de declaração de entidade, e XML fiscal legítimo não tem DTD
   * (zero ocorrências nos 822 arquivos da base). Como aqui a extração é por
   * regex, não há resolvedor de entidade para explorar — a checagem fica como
   * segunda barreira e como sinal de que o arquivo não é o que diz ser.
   */
  if (/<!DOCTYPE|<!ENTITY/i.test(texto.slice(0, 4096))) {
    throw new ErroXmlFiscal(
      "XML_COM_DOCTYPE",
      "O arquivo declara DTD ou entidade, o que nota fiscal legítima não faz.",
    );
  }

  const raiz = raizDoXml(texto);
  if (!texto.includes("<")) {
    throw new ErroXmlFiscal("XML_INVALIDO", "O arquivo não é um XML.");
  }

  const validarAssinatura = opcoes.validarAssinatura !== false;

  // Evento vem antes: é outro documento, com outra raiz, e não tem <ide>.
  if (new RegExp(`<(?:${nomeXml("procEventoNFe")}|${nomeXml("evento")}|${nomeXml("infEvento")})[\\s>]`).test(texto)) {
    return lerEvento(texto, textoOriginal, validarAssinatura);
  }

  return lerDocumento(texto, raiz, nomeArquivo, textoOriginal, validarAssinatura);
}

function lerEvento(
  texto: string,
  textoOriginal: string,
  validarAssinatura: boolean,
): EventoFiscalLido {
  let info = bloco(texto, "infEvento") ?? texto;
  let certificadoAssinatura: CertificadoAssinatura | null = null;
  let idOficial = texto.match(
    new RegExp(`<${nomeXml("infEvento")}\\b[^>]*\\bId=["']([^"']+)["']`),
  )?.[1] ?? "";

  if (validarAssinatura) {
    const assinatura = verificarAssinaturaXml(textoOriginal, {
      elemento: "infEvento",
    });
    if (!assinatura.ok) {
      throw new ErroXmlFiscal(
        "ASSINATURA_INVALIDA",
        `A assinatura digital do evento não pôde ser validada: ${assinatura.motivo}`,
      );
    }
    // Daqui em diante chave, tipo, sequência, ambiente e autor saem SOMENTE do
    // nó autenticado. Ler o documento original depois de validar permitiria
    // wrapping attack com um infEvento falso antes do assinado.
    info = assinatura.conteudoAssinado;
    idOficial = assinatura.idAssinado;
    certificadoAssinatura = assinatura.certificado;
  }

  const chave = digitos(tag(info, "chNFe"));
  if (!chave) {
    throw new ErroXmlFiscal("CHAVE_AUSENTE", "O evento não informa a chave da nota (chNFe).");
  }
  if (!decomporChave(chave)) {
    throw new ErroXmlFiscal(
      "CHAVE_INVALIDA",
      `A chave do evento não é uma chave NF-e válida: ${chave}`,
    );
  }

  const tipoEvento = tag(info, "tpEvento");
  if (!tipoEvento || !/^\d{6}$/.test(tipoEvento)) {
    throw new ErroXmlFiscal(
      "DADO_FISCAL_INVALIDO",
      `Tipo do evento inválido ou ausente: ${tipoEvento ?? "(ausente)"}.`,
    );
  }

  const sequenciaValor = decimal(tag(info, "nSeqEvento"));
  if (!Number.isInteger(sequenciaValor) || (sequenciaValor ?? 0) <= 0) {
    throw new ErroXmlFiscal(
      "DADO_FISCAL_INVALIDO",
      "O evento não traz uma sequência inteira positiva.",
    );
  }
  const sequencia = sequenciaValor as number;
  const ambiente = exigirValorFiscal("tpAmb do evento", tag(info, "tpAmb"), ["1", "2"]);
  const documentoAutor = digitos(tag(info, "CNPJ")) ?? digitos(tag(info, "CPF"));
  const dataEventoBruta = tag(info, "dhEvento");
  const dataEvento = dataEventoBruta ? new Date(dataEventoBruta) : null;
  if (!dataEvento || Number.isNaN(dataEvento.getTime())) {
    throw new ErroXmlFiscal(
      "DADO_FISCAL_INVALIDO",
      "O evento assinado não traz uma data válida (dhEvento).",
    );
  }
  if (certificadoAssinatura) {
    validarCertificadoFiscal(certificadoAssinatura, documentoAutor, dataEvento);
  }

  const retornoContainer = bloco(texto, "retEvento") ?? "";
  const retorno = bloco(retornoContainer, "infEvento") ?? retornoContainer;

  // Solicitação assinada e retorno precisam falar do MESMO evento. Conferir só
  // o cStat permitiria colar um retorno 135 de outra chave.
  const divergencias: string[] = [];
  const chaveRetorno = digitos(tag(retorno, "chNFe"));
  const tipoRetorno = tag(retorno, "tpEvento");
  const sequenciaRetorno = decimal(tag(retorno, "nSeqEvento"));
  const ambienteRetorno = tag(retorno, "tpAmb");
  if (chaveRetorno && chaveRetorno !== chave) divergencias.push("chave do retorno");
  if (tipoRetorno && tipoRetorno !== tipoEvento) divergencias.push("tipo do retorno");
  if (sequenciaRetorno !== null && sequenciaRetorno !== sequencia) {
    divergencias.push("sequência do retorno");
  }
  if (ambienteRetorno && ambienteRetorno !== ambiente) divergencias.push("ambiente do retorno");
  if (divergencias.length > 0) {
    throw new ErroXmlFiscal(
      "XML_DIVERGENTE",
      `A solicitação assinada e o retorno divergem em: ${divergencias.join(", ")}.`,
    );
  }

  const registro = tag(retorno, "dhRegEvento") ?? tag(texto, "dhRegEvento");
  const registradoEm = registro ? new Date(registro) : null;

  return {
    tipo: "EVENTO",
    eventoId: idOficial || `${chave}:${tipoEvento}:${sequencia}`,
    chave,
    tipoEvento,
    sequencia,
    ambiente,
    documentoAutor,
    assinaturaValida: validarAssinatura,
    justificativa: tag(info, "xJust"),
    statusSefaz: tag(retorno, "cStat") ?? null,
    registradoEm: registradoEm && !Number.isNaN(registradoEm.getTime()) ? registradoEm : null,
    ehCancelamento:
      tipoEvento === EVENTO_CANCELAMENTO || tipoEvento === EVENTO_CANCELAMENTO_SUBSTITUICAO,
  };
}

function lerDocumento(
  texto: string,
  raiz: string,
  nomeArquivo: string | undefined,
  textoOriginal: string,
  validarAssinatura: boolean,
): NotaFiscalLida | OutroModeloLido {
  let conteudoFiscal = texto;
  let certificadoAssinatura: CertificadoAssinatura | null = null;
  let ide = bloco(conteudoFiscal, "ide") ?? "";
  let emit = bloco(conteudoFiscal, "emit") ?? "";
  let dest = bloco(conteudoFiscal, "dest") ?? "";
  let totais = bloco(conteudoFiscal, "ICMSTot") ?? bloco(conteudoFiscal, "vPrest") ?? "";
  let modelo = tag(ide, "mod");

  // Modelo fora do escopo sai sem validação de assinatura: CT-e não é persistido
  // nem apurado; só aparece no relatório como custo de frete ignorado.
  if (!modelo || !MODELOS_SUPORTADOS.includes(modelo as (typeof MODELOS_SUPORTADOS)[number])) {
    const chaveAtributo = texto.match(/\bId=["'](?:NFe|CTe|NFS)?(\d{44})["']/)?.[1] ?? null;
    const chave = chaveAtributo ?? digitos(tag(texto, "chNFe")) ?? digitos(tag(texto, "chCTe"));
    const emissaoBruta = tag(ide, "dhEmi") ?? tag(ide, "dEmi");
    const emissao = emissaoBruta ? lerEmissaoCivil(emissaoBruta) : null;
    return {
      tipo: "OUTRO_MODELO",
      modelo,
      chave,
      cnpjEmitente: digitos(tag(emit, "CNPJ")),
      nomeEmitente: tag(emit, "xNome"),
      documentosRelacionados: [
        ...new Set(
          [...texto.matchAll(/<(?:[A-Za-z_][\w.-]*:)?CNPJ>(\d{14})<\/(?:[A-Za-z_][\w.-]*:)?CNPJ>/g)]
            .map((item) => item[1]),
        ),
      ],
      valorTotal: decimal(tag(totais, "vNF") ?? tag(totais, "vTPrest")) ?? 0,
      emitidoEm: emissao?.instante ?? null,
      ano: emissao?.ano ?? null,
      mes: emissao?.mes ?? null,
      raiz,
    };
  }

  if (validarAssinatura) {
    const assinatura = verificarAssinaturaXml(textoOriginal, { elemento: "infNFe" });
    if (!assinatura.ok) {
      throw new ErroXmlFiscal(
        "ASSINATURA_INVALIDA",
        `A assinatura digital da nota não pôde ser validada: ${assinatura.motivo}`,
      );
    }
    // Todos os dados econômicos passam a sair SOMENTE do nó autenticado. Isso
    // bloqueia tanto edição de vNF/CFOP quanto wrapping attack.
    conteudoFiscal = assinatura.conteudoAssinado;
    certificadoAssinatura = assinatura.certificado;
    ide = bloco(conteudoFiscal, "ide") ?? "";
    emit = bloco(conteudoFiscal, "emit") ?? "";
    dest = bloco(conteudoFiscal, "dest") ?? "";
    totais = bloco(conteudoFiscal, "ICMSTot") ?? "";
    modelo = tag(ide, "mod");
  }

  if (!modelo || !MODELOS_SUPORTADOS.includes(modelo as (typeof MODELOS_SUPORTADOS)[number])) {
    throw new ErroXmlFiscal(
      "DADO_FISCAL_INVALIDO",
      `O conteúdo assinado informa modelo inválido: ${modelo ?? "(ausente)"}.`,
    );
  }

  const chaveAtributo = conteudoFiscal.match(/\bId=["']NFe(\d{44})["']/)?.[1] ?? null;
  const chave = chaveAtributo ?? digitos(tag(texto, "chNFe"));

  if (!chave) {
    throw new ErroXmlFiscal("CHAVE_AUSENTE", "O XML não traz a chave de acesso.");
  }
  const dentroDaChave = decomporChave(chave);
  if (!dentroDaChave) {
    throw new ErroXmlFiscal(
      "CHAVE_INVALIDA",
      `A chave não tem 44 dígitos válidos ou o dígito verificador está errado: ${chave}`,
    );
  }

  const cnpjEmitente = digitos(tag(emit, "CNPJ"));
  if (!cnpjEmitente || cnpjEmitente.length !== 14) {
    throw new ErroXmlFiscal(
      "CNPJ_EMITENTE_AUSENTE",
      "O XML não traz o CNPJ do emitente, ou ele não tem 14 dígitos.",
    );
  }

  const emissaoBruta = tag(ide, "dhEmi") ?? tag(ide, "dEmi");
  if (!emissaoBruta) {
    throw new ErroXmlFiscal("DATA_EMISSAO_INVALIDA", "O XML não traz a data de emissão.");
  }
  const emissao = lerEmissaoCivil(emissaoBruta);
  if (!emissao) {
    throw new ErroXmlFiscal(
      "DATA_EMISSAO_INVALIDA",
      `Data de emissão em formato não reconhecido: ${emissaoBruta}`,
    );
  }
  if (certificadoAssinatura) {
    validarCertificadoFiscal(
      certificadoAssinatura,
      cnpjEmitente,
      emissao.instante,
    );
  }

  const serieBruta = tag(ide, "serie");
  if (!serieBruta || !/^\d{1,3}$/.test(serieBruta)) {
    throw new ErroXmlFiscal(
      "DADO_FISCAL_INVALIDO",
      `Série inválida ou ausente: ${serieBruta ?? "(ausente)"}.`,
    );
  }
  const serie = String(Number(serieBruta));

  const numeroTag = decimal(tag(ide, "nNF"));
  if (!Number.isInteger(numeroTag) || (numeroTag ?? 0) <= 0) {
    throw new ErroXmlFiscal(
      "DADO_FISCAL_INVALIDO",
      "O XML não traz um número de nota inteiro positivo (nNF).",
    );
  }

  // Validação POSITIVA. O código antigo só rejeitava tpAmb=2, tpNF=0 e
  // finNFe=3/4; valor ausente virava string vazia e uma nota com CFOP de venda
  // podia SOMAR mesmo sem dizer que era produção, saída ou finalidade normal.
  const ambiente = exigirValorFiscal("tpAmb", tag(ide, "tpAmb") ?? tag(conteudoFiscal, "tpAmb"), ["1", "2"]);
  const tipoOperacao = exigirValorFiscal("tpNF", tag(ide, "tpNF"), ["0", "1"]);
  const finalidade = exigirValorFiscal("finNFe", tag(ide, "finNFe"), ["1", "2", "3", "4"]);

  const valorTotal = decimal(tag(totais, "vNF"));
  if (valorTotal === null || valorTotal < 0) {
    throw new ErroXmlFiscal("VALOR_AUSENTE", "O XML não traz um valor total válido (vNF).");
  }

  /*
   * Conferência das tags contra a chave.
   *
   * Comparação NUMÉRICA, e isto não é detalhe: a tag traz `<serie>2</serie>` e a
   * chave carrega "002"; a tag `<nNF>7786</nNF>` e a chave "000007786". Comparar
   * como texto acusaria divergência em 100% das notas — foi medido na Fase 0.
   *
   * Quando não bate, o arquivo foi editado à mão. Recusar é o certo: importar
   * documento adulterado é pior que perder o arquivo, porque o número vai para
   * uma declaração assinada.
   */
  const protocolo = bloco(texto, "infProt") ?? "";
  const divergencias: string[] = [];
  if (dentroDaChave.serie !== Number(serie)) {
    divergencias.push(`série ${serie} na tag e ${dentroDaChave.serie} na chave`);
  }
  if (dentroDaChave.numero !== numeroTag) {
    divergencias.push(`número ${numeroTag} na tag e ${dentroDaChave.numero} na chave`);
  }
  if (dentroDaChave.ano !== emissao.ano || dentroDaChave.mes !== emissao.mes) {
    divergencias.push(
      `competência ${emissao.competencia} na emissão e ${dentroDaChave.ano}-${String(dentroDaChave.mes).padStart(2, "0")} na chave`,
    );
  }
  if (dentroDaChave.cnpj !== cnpjEmitente) {
    divergencias.push(`CNPJ ${cnpjEmitente} na tag e ${dentroDaChave.cnpj} na chave`);
  }
  if (dentroDaChave.modelo !== modelo) {
    divergencias.push(`modelo ${modelo} na tag e ${dentroDaChave.modelo} na chave`);
  }
  const chaveProtocolo = digitos(tag(protocolo, "chNFe"));
  if (chaveProtocolo && chaveProtocolo !== chave) {
    divergencias.push("chave do protocolo diferente da nota assinada");
  }
  if (divergencias.length > 0) {
    throw new ErroXmlFiscal(
      "XML_DIVERGENTE",
      "As tags do XML não batem com a chave de acesso, sinal de arquivo alterado.",
      divergencias.join(" · "),
    );
  }

  const documentoDestinatario = digitos(tag(dest, "CNPJ")) ?? digitos(tag(dest, "CPF"));

  return {
    tipo: "NOTA",
    chave,
    modelo,
    serie,
    numero: numeroTag as number,
    emitidoEm: emissao.instante,
    ano: emissao.ano,
    mes: emissao.mes,
    competencia: emissao.competencia,
    assinaturaValida: validarAssinatura,
    tipoOperacao,
    ambiente,
    finalidade,
    naturezaOperacao: tag(ide, "natOp"),
    statusSefaz: tag(protocolo, "cStat"),
    protocolo: tag(protocolo, "nProt"),
    cnpjEmitente,
    nomeEmitente: tag(emit, "xNome"),
    regimeEmitente: tag(emit, "CRT"),
    documentoDestinatario,
    tipoDocumentoDestinatario: tag(dest, "CNPJ") ? "CNPJ" : tag(dest, "CPF") ? "CPF" : null,
    nomeDestinatario: tag(dest, "xNome"),
    valorTotal,
    valorProdutos: decimal(tag(totais, "vProd")),
    cfops: [
      ...new Set(
        [...conteudoFiscal.matchAll(/<(?:[A-Za-z_][\w.-]*:)?CFOP>(\d{4})<\/(?:[A-Za-z_][\w.-]*:)?CFOP>/g)]
          .map((m) => m[1]),
      ),
    ].sort(),
    referenciaOutraNota: new RegExp(`<${nomeXml("NFref")}[\\s>]`).test(ide),
    pedidoMarketplace: extrairPedidoDoNome(nomeArquivo),
  };
}

/**
 * Número do pedido do marketplace a partir do nome do arquivo.
 *
 * Só aceita prefixo puramente numérico: o padrão observado é
 * `2000018234927818_<chave>-procNFe.xml`. Prefixo com letra é outro exportador,
 * e inventar significado para ele criaria vínculo errado com venda.
 */
export function extrairPedidoDoNome(nomeArquivo?: string | null): string | null {
  if (!nomeArquivo) return null;
  const semCaminho = nomeArquivo.split(/[\\/]/).pop() ?? nomeArquivo;
  const prefixo = semCaminho.match(/^(\d{6,20})_\d{44}/)?.[1] ?? null;
  return prefixo;
}
