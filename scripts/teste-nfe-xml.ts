/**
 * Asserções do leitor de XML fiscal e do classificador de faturamento.
 *
 * SEM BANCO, SEM REDE, SEM SERVIDOR. As duas funções são puras, e é aqui que a
 * corretude do módulo se prova — não na tela.
 *
 * O XML é montado em string, com a chave de acesso construída por concatenação
 * das partes que o layout define. Montar a chave em vez de escrever 44 dígitos à
 * mão elimina a classe de erro mais chata deste teste: um dígito trocado faria a
 * conferência tag-x-chave falhar e o teste acusaria o código, não o próprio teste.
 *
 * Uso:
 *   npx tsx scripts/teste-nfe-xml.ts
 */

import {
  ErroXmlFiscal,
  TAMANHO_MAXIMO_XML,
  chaveDeAcessoValida,
  decomporChave,
  eventoFoiRegistrado,
  extrairPedidoDoNome,
  lerXmlFiscal as lerXmlFiscalReal,
  type NotaFiscalLida,
} from "../src/lib/nfe-xml";
import {
  MOTIVO_EXCLUSAO,
  classificarFaturamento,
  ehCfopDeVenda,
  type EntradaClassificacao,
} from "../src/lib/faturamento-regras";

/** Fixtures são sintéticos e não possuem chave privada para gerar XMLDSig. */
const lerXmlFiscal: typeof lerXmlFiscalReal = (bytes, nome) =>
  lerXmlFiscalReal(bytes, nome, { validarAssinatura: false });

/* ------------------------------- Infra mínima ----------------------------- */

let falhas = 0;
function check(nome: string, condicao: boolean, detalhe = ""): void {
  if (condicao) {
    console.log(`  ok   ${nome}`);
    return;
  }
  falhas += 1;
  console.log(`  FALHA ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
}

/** Roda `fn` e devolve o código do ErroXmlFiscal, ou null se não lançou. */
function codigoDoErro(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (erro) {
    return erro instanceof ErroXmlFiscal ? erro.code : `OUTRO:${String(erro)}`;
  }
}

/* --------------------------- Montagem do XML fixo ------------------------- */

const CNPJ_EMITENTE = "50506775000101";
const CNPJ_OUTRO = "03007331004996";

/** cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1) = 44 */
function montarChave(opcoes: {
  cnpj?: string;
  modelo?: string;
  serie?: string;
  numero?: string;
  aamm?: string;
} = {}): string {
  const semDv =
    "41" +
    (opcoes.aamm ?? "2608") +
    (opcoes.cnpj ?? CNPJ_EMITENTE) +
    (opcoes.modelo ?? "55") +
    (opcoes.serie ?? "002") +
    (opcoes.numero ?? "000007786") +
    "1" +
    "12345678";

  let soma = 0;
  let peso = 2;
  for (let indice = semDv.length - 1; indice >= 0; indice -= 1) {
    soma += Number(semDv[indice]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const candidato = 11 - (soma % 11);
  const dv = candidato === 10 || candidato === 11 ? 0 : candidato;
  return `${semDv}${dv}`;
}

const CHAVE_PADRAO = montarChave();

type OpcoesNota = {
  chave?: string;
  modelo?: string;
  serie?: string;
  numero?: string;
  tpAmb?: string;
  tpNF?: string;
  finNFe?: string;
  cStat?: string;
  cfops?: string[];
  cnpjEmitente?: string;
  emissao?: string;
  destinatario?: { tipo: "CPF" | "CNPJ"; documento: string } | null;
  encoding?: string;
  comNFref?: boolean;
};

function montarNotaXml(opcoes: OpcoesNota = {}): Buffer {
  const chave = opcoes.chave ?? CHAVE_PADRAO;
  const cfops = opcoes.cfops ?? ["6108"];
  const destinatario =
    opcoes.destinatario === undefined
      ? { tipo: "CPF" as const, documento: "12345678909" }
      : opcoes.destinatario;

  const itens = cfops
    .map(
      (cfop, indice) => `
      <det nItem="${indice + 1}">
        <prod>
          <cProd>SKU-${indice + 1}</cProd>
          <xProd>PRODUTO ${indice + 1}</xProd>
          <CFOP>${cfop}</CFOP>
          <vProd>50.00</vProd>
        </prod>
      </det>`,
    )
    .join("");

  const encoding = opcoes.encoding ?? "UTF-8";

  const xml = `<?xml version="1.0" encoding="${encoding}"?>
<nfeProc versao="4.00">
  <NFe>
    <infNFe Id="NFe${chave}" versao="4.00">
      <ide>
        <cUF>41</cUF>
        <natOp>Venda de mercadoria</natOp>
        <mod>${opcoes.modelo ?? "55"}</mod>
        <serie>${opcoes.serie ?? "2"}</serie>
        <nNF>${opcoes.numero ?? "7786"}</nNF>
        <dhEmi>${opcoes.emissao ?? "2026-08-01T09:15:00-03:00"}</dhEmi>
        <tpNF>${opcoes.tpNF ?? "1"}</tpNF>
        <tpAmb>${opcoes.tpAmb ?? "1"}</tpAmb>
        <finNFe>${opcoes.finNFe ?? "1"}</finNFe>
        ${opcoes.comNFref ? "<NFref><refNFe>123</refNFe></NFref>" : ""}
      </ide>
      <emit>
        <CNPJ>${opcoes.cnpjEmitente ?? CNPJ_EMITENTE}</CNPJ>
        <xNome>NEXUS GROUP LTDA</xNome>
        <CRT>1</CRT>
      </emit>
      ${
        destinatario
          ? `<dest>
        <${destinatario.tipo}>${destinatario.documento}</${destinatario.tipo}>
        <xNome>COMPRADOR TESTE</xNome>
      </dest>`
          : ""
      }
      ${itens}
      <total>
        <ICMSTot>
          <vProd>100.00</vProd>
          <vDesc>0.00</vDesc>
          <vFrete>7.50</vFrete>
          <vNF>107.50</vNF>
        </ICMSTot>
      </total>
      <!-- Grupo da Reforma Tributaria: tag que o parser NAO conhece e deve ignorar -->
      <gIBSCBS>
        <vIBS>1.23</vIBS>
        <vCBS>4.56</vCBS>
      </gIBSCBS>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <chNFe>${chave}</chNFe>
      <cStat>${opcoes.cStat ?? "100"}</cStat>
      <nProt>141260812345678</nProt>
      <dhRecbto>2026-08-01T09:20:00-03:00</dhRecbto>
    </infProt>
  </protNFe>
</nfeProc>`;

  const ehLatin = /8859|1252|LATIN/i.test(encoding);
  return Buffer.from(xml, ehLatin ? "latin1" : "utf8");
}

function montarEventoCancelamentoXml(chave = CHAVE_PADRAO): Buffer {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<procEventoNFe versao="1.00">
  <evento versao="1.00">
    <infEvento Id="ID1101114126081234567890">
      <tpAmb>1</tpAmb>
      <CNPJ>${CNPJ_EMITENTE}</CNPJ>
      <dhEvento>2026-08-03T10:55:00-03:00</dhEvento>
      <chNFe>${chave}</chNFe>
      <tpEvento>110111</tpEvento>
      <nSeqEvento>1</nSeqEvento>
      <detEvento versao="1.00">
        <descEvento>Cancelamento</descEvento>
        <xJust>Pedido cancelado pelo comprador antes do envio</xJust>
      </detEvento>
    </infEvento>
  </evento>
  <retEvento versao="1.00">
    <infEvento>
      <tpAmb>1</tpAmb>
      <chNFe>${chave}</chNFe>
      <tpEvento>110111</tpEvento>
      <nSeqEvento>1</nSeqEvento>
      <cStat>135</cStat>
      <dhRegEvento>2026-08-03T11:00:00-03:00</dhRegEvento>
    </infEvento>
  </retEvento>
</procEventoNFe>`);
}

function montarCteXml(): Buffer {
  return Buffer.from(`<?xml version="1.0"?>
<cteProc versao="4.00">
  <CTe>
    <infCte Id="CTe${montarChave({ cnpj: CNPJ_OUTRO, modelo: "57" })}" versao="4.00">
      <ide>
        <mod>57</mod>
        <serie>1</serie>
        <nCT>555</nCT>
        <dhEmi>2026-08-02T10:00:00-03:00</dhEmi>
        <tpAmb>1</tpAmb>
      </ide>
      <emit>
        <CNPJ>${CNPJ_OUTRO}</CNPJ>
        <xNome>EBAZARCOMBR LTDA</xNome>
      </emit>
      <vPrest>
        <vTPrest>34.80</vTPrest>
      </vPrest>
    </infCte>
  </CTe>
</cteProc>`);
}

/** Base para o classificador: venda normal que SOMA. */
const VENDA_OK: EntradaClassificacao = {
  modelo: "55",
  ambiente: "1",
  tipoOperacao: "1",
  finalidade: "1",
  statusSefaz: "100",
  cfops: ["6108"],
  cancelada: false,
  vinculo: "EMITENTE",
};

const comoVenda = (mudancas: Partial<EntradaClassificacao>): EntradaClassificacao => ({
  ...VENDA_OK,
  ...mudancas,
});

/* ---------------------------------- Testes -------------------------------- */

console.log("\n1) Chave de acesso");

const decomposta = decomporChave(CHAVE_PADRAO);
check("a chave montada tem 44 dígitos", CHAVE_PADRAO.length === 44, `${CHAVE_PADRAO.length}`);
check("o dígito verificador da chave é válido", chaveDeAcessoValida(CHAVE_PADRAO));
check("decompõe o CNPJ", decomposta?.cnpj === CNPJ_EMITENTE, decomposta?.cnpj);
check("decompõe o modelo", decomposta?.modelo === "55", decomposta?.modelo);
check("decompõe a série como número", decomposta?.serie === 2, String(decomposta?.serie));
check("decompõe o número como número", decomposta?.numero === 7786, String(decomposta?.numero));
check("decompõe a competência", decomposta?.ano === 2026 && decomposta?.mes === 8);
check("recusa chave curta", decomporChave("123") === null);
check(
  "recusa chave de 44 dígitos com DV alterado",
  !chaveDeAcessoValida(`${CHAVE_PADRAO.slice(0, -1)}${CHAVE_PADRAO.endsWith("9") ? "0" : "9"}`),
);

console.log("\n2) Leitura de NF-e");

const nota = lerXmlFiscal(montarNotaXml(), "2000018234927818_" + CHAVE_PADRAO + "-procNFe.xml");
check("reconhece como nota", nota.tipo === "NOTA", nota.tipo);

const n = nota as NotaFiscalLida;
check("lê a chave", n.chave === CHAVE_PADRAO);
check("lê o modelo", n.modelo === "55");
check("lê a série", n.serie === "2");
check("lê o número como número", n.numero === 7786, String(n.numero));
check("lê o CNPJ do emitente", n.cnpjEmitente === CNPJ_EMITENTE);
check("lê o nome do emitente", n.nomeEmitente === "NEXUS GROUP LTDA", n.nomeEmitente ?? "");
check("lê o valor total (vNF, não vProd)", n.valorTotal === 107.5, String(n.valorTotal));
check("lê o valor dos produtos", n.valorProdutos === 100, String(n.valorProdutos));
check("lê o status da SEFAZ", n.statusSefaz === "100");
check("lê a data de emissão", n.emitidoEm.toISOString().startsWith("2026-08-01T12:15"));
check("lê o CFOP do item", n.cfops.length === 1 && n.cfops[0] === "6108", n.cfops.join(","));
check("identifica destinatário CPF", n.tipoDocumentoDestinatario === "CPF");
check("lê o documento do destinatário", n.documentoDestinatario === "12345678909");
check("extrai o pedido do nome do arquivo", n.pedidoMarketplace === "2000018234927818", n.pedidoMarketplace ?? "");
check("não acusa NFref quando não há", n.referenciaOutraNota === false);

// O ponto que a Fase 0 mediu: a tag traz "2" e a chave "002"; a tag "7786" e a
// chave "000007786". Comparação textual acusaria divergência em 100% das notas.
check(
  "série 2 na tag x 002 na chave NÃO é divergência",
  codigoDoErro(() => lerXmlFiscal(montarNotaXml())) === null,
);

console.log("\n3) Tolerância e robustez do parser");

check(
  "ignora tag desconhecida (grupo IBS/CBS da Reforma)",
  (lerXmlFiscal(montarNotaXml()) as NotaFiscalLida).valorTotal === 107.5,
);
check(
  "lê CFOP de TODOS os itens, sem repetir e ordenado",
  (lerXmlFiscal(montarNotaXml({ cfops: ["6949", "6108", "6108"] })) as NotaFiscalLida).cfops.join(",") === "6108,6949",
);
check(
  "respeita encoding ISO-8859-1 declarado",
  (lerXmlFiscal(montarNotaXml({ encoding: "ISO-8859-1" })) as NotaFiscalLida).nomeEmitente === "NEXUS GROUP LTDA",
);
check("detecta NFref quando existe", (lerXmlFiscal(montarNotaXml({ comNFref: true })) as NotaFiscalLida).referenciaOutraNota === true);
const viradaUtc = lerXmlFiscal(
  montarNotaXml({ emissao: "2026-08-31T23:30:00-03:00" }),
) as NotaFiscalLida;
check(
  "competência usa a data civil, mesmo quando o instante UTC cai no mês seguinte",
  viradaUtc.ano === 2026 && viradaUtc.mes === 8 && viradaUtc.competencia === "2026-08",
  `${viradaUtc.competencia} / ${viradaUtc.emitidoEm.toISOString()}`,
);
check("nota sem destinatário não quebra", (lerXmlFiscal(montarNotaXml({ destinatario: null })) as NotaFiscalLida).documentoDestinatario === null);
check("pedido é null quando o nome não tem prefixo", extrairPedidoDoNome("nota.xml") === null);
check("pedido é null quando o prefixo tem letra", extrairPedidoDoNome(`ABC123_${CHAVE_PADRAO}-procNFe.xml`) === null);

console.log("\n4) O que o parser recusa");

check("recusa arquivo vazio", codigoDoErro(() => lerXmlFiscal(Buffer.from(""))) === "XML_VAZIO");
check(
  "recusa DOCTYPE (XXE / billion laughs)",
  codigoDoErro(() =>
    lerXmlFiscal(
      Buffer.from(
        `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]><nfeProc><ide><mod>55</mod></ide></nfeProc>`,
      ),
    ),
  ) === "XML_COM_DOCTYPE",
);
check(
  "recusa arquivo acima do teto",
  codigoDoErro(() => lerXmlFiscal(Buffer.alloc(TAMANHO_MAXIMO_XML + 1, 0x20))) === "ARQUIVO_GRANDE",
);
check(
  "recusa série divergente da chave (XML editado)",
  codigoDoErro(() => lerXmlFiscal(montarNotaXml({ serie: "9" }))) === "XML_DIVERGENTE",
);
check(
  "recusa número divergente da chave",
  codigoDoErro(() => lerXmlFiscal(montarNotaXml({ numero: "9999" }))) === "XML_DIVERGENTE",
);
check(
  "recusa CNPJ divergente da chave",
  codigoDoErro(() => lerXmlFiscal(montarNotaXml({ cnpjEmitente: CNPJ_OUTRO }))) === "XML_DIVERGENTE",
);
check(
  "recusa competência da emissão divergente da chave",
  codigoDoErro(() =>
    lerXmlFiscal(montarNotaXml({ emissao: "2026-09-01T00:01:00-03:00" })),
  ) === "XML_DIVERGENTE",
);
check(
  "recusa tpAmb ausente em vez de assumir produção",
  codigoDoErro(() => lerXmlFiscal(montarNotaXml({ tpAmb: "" }))) === "DADO_FISCAL_INVALIDO",
);
check(
  "recusa tpNF ausente em vez de assumir saída",
  codigoDoErro(() => lerXmlFiscal(montarNotaXml({ tpNF: "" }))) === "DADO_FISCAL_INVALIDO",
);
check(
  "recusa finNFe ausente em vez de assumir normal",
  codigoDoErro(() => lerXmlFiscal(montarNotaXml({ finNFe: "" }))) === "DADO_FISCAL_INVALIDO",
);

console.log("\n5) Evento de cancelamento");

const evento = lerXmlFiscal(montarEventoCancelamentoXml());
check("reconhece como evento", evento.tipo === "EVENTO", evento.tipo);
if (evento.tipo === "EVENTO") {
  check("aponta a chave da nota cancelada", evento.chave === CHAVE_PADRAO);
  check("identifica o tipo 110111", evento.tipoEvento === "110111");
  check("monta/lê uma identidade estável", evento.eventoId.length > 0);
  check("marca como cancelamento", evento.ehCancelamento === true);
  check("lê a justificativa", (evento.justificativa ?? "").startsWith("Pedido cancelado"));
  check("lê o status do registro", evento.statusSefaz === "135");
  check("aceita cStat 155 (cancelamento homologado fora de prazo)", eventoFoiRegistrado("155"));
  check("rejeita status que não confirma registro", !eventoFoiRegistrado("573"));
  check("lê a data do registro", evento.registradoEm !== null);
}

console.log("\n6) Modelo fora do escopo (CT-e de frete)");

const cte = lerXmlFiscal(montarCteXml());
check("reconhece como outro modelo", cte.tipo === "OUTRO_MODELO", cte.tipo);
if (cte.tipo === "OUTRO_MODELO") {
  check("informa o modelo 57", cte.modelo === "57");
  check("informa o emitente do frete", cte.cnpjEmitente === CNPJ_OUTRO);
  check("lê o valor do frete (vTPrest)", cte.valorTotal === 34.8, String(cte.valorTotal));
}

console.log("\n7) Faixa de CFOP");

check("6108 é venda", ehCfopDeVenda("6108"));
check("6102 é venda", ehCfopDeVenda("6102"));
check("5101 é venda", ehCfopDeVenda("5101"));
check("5102 é venda", ehCfopDeVenda("5102"));
check("5949 NÃO é venda (outra saída)", !ehCfopDeVenda("5949"));
check("6949 NÃO é venda (outra saída)", !ehCfopDeVenda("6949"));
check("6905 NÃO é venda (remessa para depósito)", !ehCfopDeVenda("6905"));
check("5905 NÃO é venda (remessa para depósito)", !ehCfopDeVenda("5905"));
check("1202 NÃO é venda (devolução, entrada)", !ehCfopDeVenda("1202"));

console.log("\n8) Classificação de faturamento");

check("venda normal SOMA", classificarFaturamento(VENDA_OK).contaFaturamento === true);
check("NFC-e (modelo 65) SOMA", classificarFaturamento(comoVenda({ modelo: "65" })).contaFaturamento === true);
check(
  "complementar SOMA",
  classificarFaturamento(comoVenda({ finalidade: "2" })).contaFaturamento === true,
);

const casos: Array<[string, Partial<EntradaClassificacao>, string]> = [
  ["homologação não soma", { ambiente: "2" }, MOTIVO_EXCLUSAO.HOMOLOGACAO],
  ["CT-e não soma", { modelo: "57" }, MOTIVO_EXCLUSAO.MODELO_NAO_APURADO],
  ["não autorizada não soma", { statusSefaz: "301" }, MOTIVO_EXCLUSAO.NAO_AUTORIZADA],
  ["sem protocolo não soma", { statusSefaz: null }, MOTIVO_EXCLUSAO.NAO_AUTORIZADA],
  ["cancelada não soma", { cancelada: true }, MOTIVO_EXCLUSAO.CANCELADA],
  ["nota de compra não soma", { vinculo: "DESTINATARIO" }, MOTIVO_EXCLUSAO.TERCEIRO],
  ["emitente fora da carteira não soma", { vinculo: "NENHUM" }, MOTIVO_EXCLUSAO.EMPRESA_NAO_VINCULADA],
  ["entrada não soma", { tipoOperacao: "0" }, MOTIVO_EXCLUSAO.ENTRADA],
  ["devolução não soma", { finalidade: "4" }, MOTIVO_EXCLUSAO.DEVOLUCAO],
  ["ajuste não soma", { finalidade: "3" }, MOTIVO_EXCLUSAO.AJUSTE],
  ["sem CFOP não soma", { cfops: [] }, MOTIVO_EXCLUSAO.SEM_CFOP],
  ["remessa para o FULL não soma", { cfops: ["6949"] }, MOTIVO_EXCLUSAO.FORA_DA_FAIXA_DE_VENDA],
  ["remessa para depósito não soma", { cfops: ["6905"] }, MOTIVO_EXCLUSAO.FORA_DA_FAIXA_DE_VENDA],
  ["CFOP misto não soma", { cfops: ["6108", "6949"] }, MOTIVO_EXCLUSAO.CFOP_MISTO],
];

for (const [nome, mudancas, motivoEsperado] of casos) {
  const resultado = classificarFaturamento(comoVenda(mudancas));
  check(
    nome,
    resultado.contaFaturamento === false && resultado.motivoExclusao === motivoEsperado,
    `conta=${resultado.contaFaturamento} motivo=${resultado.motivoExclusao}`,
  );
}

console.log("\n9) Precedência e sinalizações");

check(
  "CFOP misto pede conferência humana",
  classificarFaturamento(comoVenda({ cfops: ["6108", "6949"] })).precisaConferencia === true,
);
check(
  "só homologação recusa a importação",
  classificarFaturamento(comoVenda({ ambiente: "2" })).recusarImportacao === true &&
    classificarFaturamento(comoVenda({ cfops: ["6949"] })).recusarImportacao === false,
);
// A nota cancelada da base tem cStat 100 DENTRO do XML. Se o cancelamento não
// viesse por fora, ela somaria.
check(
  "cancelada com cStat 100 ainda é excluída",
  classificarFaturamento(comoVenda({ statusSefaz: "100", cancelada: true })).motivoExclusao ===
    MOTIVO_EXCLUSAO.CANCELADA,
);
// Homologação ganha de tudo: quem subiu a pasta errada precisa ver isso, não
// "fora da faixa de venda".
check(
  "homologação tem precedência sobre CFOP",
  classificarFaturamento(comoVenda({ ambiente: "2", cfops: ["6949"] })).motivoExclusao ===
    MOTIVO_EXCLUSAO.HOMOLOGACAO,
);
// Nota de compra tem CFOP de entrada; sem esta precedência o motivo viraria
// "fora da faixa", que manda o operador investigar a operação em vez do vínculo.
check(
  "vínculo tem precedência sobre CFOP de entrada",
  classificarFaturamento(comoVenda({ vinculo: "DESTINATARIO", cfops: ["1202"] })).motivoExclusao ===
    MOTIVO_EXCLUSAO.TERCEIRO,
);

console.log(`\n${falhas === 0 ? "TUDO OK" : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
