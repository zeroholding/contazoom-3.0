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

/** Teto por arquivo. NF-e tem 5–15 KB; nota com 500 itens chega a centenas de KB. */
export const TAMANHO_MAXIMO_XML = 1024 * 1024;

/** Modelos que este módulo sabe apurar. 13 (NFS-e nacional) entra na Fase 3. */
export const MODELOS_SUPORTADOS = ["55", "65"] as const;

/** Evento de cancelamento de NF-e. */
export const EVENTO_CANCELAMENTO = "110111";
/** Cancelamento por substituição (NFC-e). Cancela do mesmo jeito. */
export const EVENTO_CANCELAMENTO_SUBSTITUICAO = "110112";

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
  /** Chave da nota a que o evento se refere. */
  chave: string;
  tipoEvento: string;
  sequencia: number | null;
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
  valorTotal: number;
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

/** Conteúdo de uma tag simples, na primeira ocorrência. */
function tag(xml: string, nome: string): string | null {
  const achado = xml.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([^<]*)</${nome}>`));
  const valor = achado ? achado[1].trim() : null;
  return valor ? valor : null;
}

/** Conteúdo de um bloco `<nome>...</nome>`, não-guloso. */
function bloco(xml: string, nome: string): string | null {
  const achado = xml.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`));
  return achado ? achado[1] : null;
}

/** Primeira tag depois do prólogo: é o que separa nota, evento e CT-e. */
function raizDoXml(texto: string): string {
  const encontrada = texto
    .match(/<\s*([A-Za-z][\w.:-]*)[\s>]/g)
    ?.map((t) => t.replace(/[<>\s/]/g, ""))
    .find((t) => t !== "?xml" && t.toLowerCase() !== "xml");
  return encontrada ?? "(desconhecida)";
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
export function decomporChave(chave: string): ChaveDecomposta | null {
  if (!/^\d{44}$/.test(chave)) return null;
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

  const { texto } = decodificarXml(bytes);

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

  // Evento vem antes: é outro documento, com outra raiz, e não tem <ide>.
  if (/<(?:procEventoNFe|evento|infEvento)[\s>]/.test(texto)) {
    return lerEvento(texto);
  }

  return lerDocumento(texto, raiz, nomeArquivo);
}

function lerEvento(texto: string): EventoFiscalLido {
  const info = bloco(texto, "infEvento") ?? texto;
  const retorno = bloco(texto, "retEvento") ?? "";

  const chave = digitos(tag(info, "chNFe"));
  if (!chave) {
    throw new ErroXmlFiscal("CHAVE_AUSENTE", "O evento não informa a chave da nota (chNFe).");
  }
  if (!/^\d{44}$/.test(chave)) {
    throw new ErroXmlFiscal("CHAVE_INVALIDA", `A chave do evento não tem 44 dígitos: ${chave}`);
  }

  const tipoEvento = tag(info, "tpEvento") ?? "";
  const registro = tag(retorno, "dhRegEvento") ?? tag(texto, "dhRegEvento");
  const registradoEm = registro ? new Date(registro) : null;

  return {
    tipo: "EVENTO",
    chave,
    tipoEvento,
    sequencia: decimal(tag(info, "nSeqEvento")),
    // xJust fica em detEvento; procurar no texto todo cobre as duas posições que
    // o layout admite sem depender de qual delas o emissor usou.
    justificativa: tag(texto, "xJust"),
    statusSefaz: tag(retorno, "cStat") ?? null,
    registradoEm: registradoEm && !Number.isNaN(registradoEm.getTime()) ? registradoEm : null,
    ehCancelamento:
      tipoEvento === EVENTO_CANCELAMENTO || tipoEvento === EVENTO_CANCELAMENTO_SUBSTITUICAO,
  };
}

function lerDocumento(
  texto: string,
  raiz: string,
  nomeArquivo?: string,
): NotaFiscalLida | OutroModeloLido {
  const ide = bloco(texto, "ide") ?? "";
  const emit = bloco(texto, "emit") ?? "";
  const dest = bloco(texto, "dest") ?? "";
  // ICMSTot na NF-e; vPrest no CT-e. O segundo só serve para relatar o CT-e.
  const totais = bloco(texto, "ICMSTot") ?? bloco(texto, "vPrest") ?? "";

  const modelo = tag(ide, "mod");
  const chaveAtributo = texto.match(/Id="(?:NFe|CTe|NFS)?(\d{44})"/)?.[1] ?? null;
  const chave = chaveAtributo ?? digitos(tag(texto, "chNFe")) ?? digitos(tag(texto, "chCTe"));

  // Modelo fora do escopo sai aqui, com o que der para relatar. Sem exigir chave
  // nem valor: o objetivo é dizer "isto é um CT-e de frete", não apurá-lo.
  if (!modelo || !MODELOS_SUPORTADOS.includes(modelo as (typeof MODELOS_SUPORTADOS)[number])) {
    return {
      tipo: "OUTRO_MODELO",
      modelo,
      chave,
      cnpjEmitente: digitos(tag(emit, "CNPJ")),
      nomeEmitente: tag(emit, "xNome"),
      valorTotal: decimal(tag(totais, "vNF") ?? tag(totais, "vTPrest")) ?? 0,
      raiz,
    };
  }

  if (!chave) {
    throw new ErroXmlFiscal("CHAVE_AUSENTE", "O XML não traz a chave de acesso.");
  }
  const dentroDaChave = decomporChave(chave);
  if (!dentroDaChave) {
    throw new ErroXmlFiscal("CHAVE_INVALIDA", `A chave não tem 44 dígitos: ${chave}`);
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
  const emitidoEm = new Date(emissaoBruta);
  if (Number.isNaN(emitidoEm.getTime())) {
    throw new ErroXmlFiscal(
      "DATA_EMISSAO_INVALIDA",
      `Data de emissão em formato não reconhecido: ${emissaoBruta}`,
    );
  }

  const serie = tag(ide, "serie") ?? "0";
  const numeroTag = decimal(tag(ide, "nNF"));
  if (numeroTag === null) {
    throw new ErroXmlFiscal("XML_INVALIDO", "O XML não traz o número da nota (nNF).");
  }

  const valorTotal = decimal(tag(totais, "vNF"));
  if (valorTotal === null) {
    throw new ErroXmlFiscal("VALOR_AUSENTE", "O XML não traz o valor total da nota (vNF).");
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
  const divergencias: string[] = [];
  if (dentroDaChave.serie !== Number(serie)) {
    divergencias.push(`série ${serie} na tag e ${dentroDaChave.serie} na chave`);
  }
  if (dentroDaChave.numero !== numeroTag) {
    divergencias.push(`número ${numeroTag} na tag e ${dentroDaChave.numero} na chave`);
  }
  if (dentroDaChave.cnpj !== cnpjEmitente) {
    divergencias.push(`CNPJ ${cnpjEmitente} na tag e ${dentroDaChave.cnpj} na chave`);
  }
  if (dentroDaChave.modelo !== modelo) {
    divergencias.push(`modelo ${modelo} na tag e ${dentroDaChave.modelo} na chave`);
  }
  if (divergencias.length > 0) {
    throw new ErroXmlFiscal(
      "XML_DIVERGENTE",
      "As tags do XML não batem com a chave de acesso, sinal de arquivo alterado.",
      divergencias.join(" · "),
    );
  }

  const protocolo = bloco(texto, "infProt") ?? "";
  const documentoDestinatario = digitos(tag(dest, "CNPJ")) ?? digitos(tag(dest, "CPF"));

  return {
    tipo: "NOTA",
    chave,
    modelo,
    serie,
    numero: numeroTag,
    emitidoEm,
    tipoOperacao: tag(ide, "tpNF") ?? "",
    ambiente: tag(ide, "tpAmb") ?? tag(texto, "tpAmb") ?? "",
    finalidade: tag(ide, "finNFe") ?? "",
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
    cfops: [...new Set([...texto.matchAll(/<CFOP>(\d{4})<\/CFOP>/g)].map((m) => m[1]))].sort(),
    referenciaOutraNota: /<NFref[\s>]/.test(ide),
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
