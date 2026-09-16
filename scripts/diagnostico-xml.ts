/**
 * Despeja o que existe DE VERDADE numa pasta de XML fiscal. Não grava nada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE SCRIPT EXISTE, E POR QUE ELE VEM ANTES DO PARSER
 *
 * A Expedição perdeu três tentativas escrevendo a extração do prazo de despacho a
 * partir da DOCUMENTAÇÃO do Mercado Livre. Nenhum dos campos documentados existia
 * no payload real daquela conta; o conserto só veio depois de
 * `scripts/diagnostico-prazo.ts` despejar o que havia de fato no dado.
 *
 * Aqui o risco é o mesmo: o manual da NF-e descreve dezenas de campos, e o que
 * importa é quais aparecem NESTA base, com quais valores. Então este script roda
 * primeiro, contra a pasta que o escritório mandou, e é a saída dele que define as
 * regras de `docs/PLANO_XML_FATURAMENTO.md`.
 *
 * SEM BANCO, SEM REDE, SEM ESCRITA. Só leitura de arquivo e contagem.
 *
 * DE PROPÓSITO NÃO USA BIBLIOTECA DE XML. Extrai por bloco e por tag com regex, o
 * que é suficiente para CONTAR e é o certo para um diagnóstico: instalar
 * dependência antes de saber o que o dado é seria decidir na frente da evidência.
 * O parser de produção precisa de XML de verdade — este não.
 *
 * Uso:
 *   npx tsx scripts/diagnostico-xml.ts "XML"
 *   npx tsx scripts/diagnostico-xml.ts "XML/pasta/de/uma/empresa"
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join, extname, sep } from "path";

/* -------------------------------------------------------------------------- */
/*                                 Utilidades                                 */
/* -------------------------------------------------------------------------- */

type Contagem = Map<string, number>;

function conta(mapa: Contagem, chave: string, quanto = 1): void {
  mapa.set(chave, (mapa.get(chave) ?? 0) + quanto);
}

/** Tabela ordenada por contagem, com percentual sobre o total informado. */
function tabela(titulo: string, mapa: Contagem, total?: number): void {
  console.log(`\n${titulo}`);
  if (mapa.size === 0) {
    console.log("  (nada)");
    return;
  }
  const linhas = [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  const largura = Math.max(...linhas.map(([k]) => k.length));
  for (const [chave, quantos] of linhas) {
    const pct = total ? ` (${((quantos / total) * 100).toFixed(1)}%)` : "";
    console.log(`  ${String(quantos).padStart(6)}  ${chave.padEnd(largura)}${pct}`);
  }
}

const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Conteúdo de uma tag simples, no primeiro nível que aparecer. */
function tag(xml: string, nome: string): string | null {
  const m = xml.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([^<]*)</${nome}>`));
  return m ? m[1].trim() : null;
}

/** Bloco inteiro `<nome ...>...</nome>`, com o conteúdo. Não-guloso. */
function bloco(xml: string, nome: string): string | null {
  const m = xml.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`));
  return m ? m[1] : null;
}

function numero(valor: string | null): number {
  if (!valor) return 0;
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function arquivosXml(raiz: string): string[] {
  const achados: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      const info = statSync(caminho);
      if (info.isDirectory()) andar(caminho);
      else if (extname(nome).toLowerCase() === ".xml") achados.push(caminho);
    }
  };
  andar(raiz);
  return achados;
}

/**
 * Decodifica respeitando o encoding DECLARADO.
 *
 * Existe emissor que grava ISO-8859-1 e declara UTF-8, e o contrário. O dígito
 * não se perde (é ASCII), mas a razão social vira "NEXUS GROUP LTDA" com `Ã§` no
 * meio, e é isso que aparece no relatório impresso para o banco.
 */
function ler(caminho: string): { texto: string; encoding: string } {
  const bytes = readFileSync(caminho);
  const inicio = bytes.subarray(0, 200).toString("latin1");
  const declarado = inicio.match(/encoding=["']([^"']+)["']/i)?.[1]?.toUpperCase() ?? "(ausente)";
  const latin = /8859|WINDOWS-1252|LATIN/i.test(declarado);
  return { texto: bytes.toString(latin ? "latin1" : "utf8"), encoding: declarado };
}

/**
 * O que a CHAVE DE ACESSO carrega dentro dela.
 *
 * cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1) = 44.
 * Conferir isto contra as tags é o que detecta XML editado à mão.
 */
function lerChave(chave: string) {
  if (!/^\d{44}$/.test(chave)) return null;
  return {
    uf: chave.slice(0, 2),
    ano: `20${chave.slice(2, 4)}`,
    mes: chave.slice(4, 6),
    cnpj: chave.slice(6, 20),
    modelo: chave.slice(20, 22),
    serie: Number(chave.slice(22, 25)),
    numero: Number(chave.slice(25, 34)),
  };
}

/** Classificação que o PRÓPRIO EXPORT do Mercado Livre dá, pelo caminho. */
function classificarPelaPasta(caminho: string): string {
  const p = caminho.toLowerCase();
  const partes: string[] = [];
  if (p.includes("cancelada")) partes.push("CANCELADA");
  if (p.includes("devolu")) partes.push("DEVOLUCAO");
  if (p.includes("retiro")) partes.push("RETIRO_SIMBOLICO");
  if (p.includes("transfer")) partes.push("TRANSFERENCIA");
  if (p.includes(`${sep}ct-e`) || p.includes("_cte_")) partes.push("CTE");
  if (p.includes("nf-e de venda")) partes.push("VENDA");
  return partes.join("+") || "(sem pista no caminho)";
}

/* -------------------------------------------------------------------------- */
/*                                 Diagnóstico                                */
/* -------------------------------------------------------------------------- */

type Doc = {
  caminho: string;
  arquivo: string;
  bytes: number;
  encoding: string;
  raiz: string;
  temDoctype: boolean;
  pasta: string;
  chave: string | null;
  modelo: string | null;
  serie: string | null;
  numero: string | null;
  emissao: string | null;
  tpNF: string | null;
  tpAmb: string | null;
  finNFe: string | null;
  natOp: string | null;
  cStat: string | null;
  cnpjEmit: string | null;
  nomeEmit: string | null;
  crt: string | null;
  docDest: string | null;
  tipoDocDest: string | null;
  valor: number;
  valorProd: number;
  temNFref: boolean;
  temIbsCbs: boolean;
  prefixoNome: string | null;
  tpEvento: string | null;
  /** Todos os CFOP distintos dos itens. É o discriminador real da operação. */
  cfops: string[];
};

function examinar(caminho: string, raizBase: string): Doc {
  const { texto, encoding } = ler(caminho);
  const arquivo = caminho.slice(raizBase.length + 1);
  const bytes = statSync(caminho).size;

  // Primeira tag depois do prólogo. É o que separa nota, evento e CT-e.
  const raiz = texto.match(/<\s*([A-Za-z][\w.:-]*)[\s>]/g)
    ?.map((t) => t.replace(/[<>\s]/g, ""))
    .find((t) => t !== "?xml") ?? "(desconhecida)";

  const ide = bloco(texto, "ide") ?? "";
  const emit = bloco(texto, "emit") ?? "";
  const dest = bloco(texto, "dest") ?? "";
  const total = bloco(texto, "ICMSTot") ?? bloco(texto, "vPrest") ?? "";
  const prot = bloco(texto, "infProt") ?? bloco(texto, "infEvento") ?? "";

  const idAttr = texto.match(/Id="(?:NFe|CTe)(\d{44})"/)?.[1] ?? null;
  const chave = idAttr ?? tag(texto, "chNFe") ?? tag(texto, "chCTe");

  return {
    caminho,
    arquivo,
    bytes,
    encoding,
    raiz,
    temDoctype: /<!DOCTYPE|<!ENTITY/i.test(texto.slice(0, 4000)),
    pasta: classificarPelaPasta(caminho),
    chave,
    modelo: tag(ide, "mod"),
    serie: tag(ide, "serie"),
    numero: tag(ide, "nNF"),
    emissao: tag(ide, "dhEmi") ?? tag(ide, "dEmi"),
    tpNF: tag(ide, "tpNF"),
    tpAmb: tag(ide, "tpAmb") ?? tag(texto, "tpAmb"),
    finNFe: tag(ide, "finNFe"),
    natOp: tag(ide, "natOp"),
    cStat: tag(prot, "cStat"),
    cnpjEmit: tag(emit, "CNPJ"),
    nomeEmit: tag(emit, "xNome"),
    crt: tag(emit, "CRT"),
    docDest: tag(dest, "CNPJ") ?? tag(dest, "CPF"),
    tipoDocDest: tag(dest, "CNPJ") ? "CNPJ" : tag(dest, "CPF") ? "CPF" : null,
    valor: numero(tag(total, "vNF") ?? tag(total, "vTPrest")),
    valorProd: numero(tag(total, "vProd")),
    temNFref: /<NFref>/.test(ide),
    // Grupos da Reforma Tributária (NT 2025.002-RTC). Se aparecerem, o layout
    // desta base já mudou e o parser tem de ser tolerante a eles.
    temIbsCbs: /<(?:IBSCBS|gIBSCBS|vIBS|vCBS|gIBSCBSTot)/.test(texto),
    prefixoNome: caminho.match(/([^\\/]+?)_\d{44}/)?.[1] ?? null,
    tpEvento: tag(prot, "tpEvento"),
    // CFOP de TODOS os itens, não do primeiro: nota com itens de CFOP diferente
    // existe, e é justamente a que uma regra baseada no primeiro item erraria.
    cfops: [...new Set([...texto.matchAll(/<CFOP>(\d{4})<\/CFOP>/g)].map((m) => m[1]))].sort(),
  };
}

function main() {
  const raiz = process.argv[2] ?? "XML";
  console.log(`\n${"=".repeat(78)}`);
  console.log(`DIAGNÓSTICO DE XML FISCAL — ${raiz}`);
  console.log(`${"=".repeat(78)}`);

  let caminhos: string[];
  try {
    caminhos = arquivosXml(raiz);
  } catch (e) {
    console.error(`\nNão consegui ler "${raiz}": ${String(e)}`);
    process.exit(1);
  }

  if (caminhos.length === 0) {
    console.log(`\nNenhum .xml em "${raiz}". (Os .zip não são abertos por aqui.)`);
    return;
  }

  const docs = caminhos.map((c) => examinar(c, raiz));
  const total = docs.length;

  /* ------------------------------ Inventário ----------------------------- */

  console.log(`\nArquivos .xml encontrados: ${total}`);
  const bytesTotal = docs.reduce((s, d) => s + d.bytes, 0);
  const tamanhos = docs.map((d) => d.bytes).sort((a, b) => a - b);
  console.log(
    `Tamanho: total ${(bytesTotal / 1024 / 1024).toFixed(1)} MB · ` +
      `menor ${(tamanhos[0] / 1024).toFixed(1)} KB · ` +
      `mediana ${(tamanhos[Math.floor(total / 2)] / 1024).toFixed(1)} KB · ` +
      `maior ${(tamanhos[total - 1] / 1024).toFixed(1)} KB`,
  );

  const porRaiz: Contagem = new Map();
  const porPasta: Contagem = new Map();
  const porEncoding: Contagem = new Map();
  for (const d of docs) {
    conta(porRaiz, d.raiz);
    conta(porPasta, d.pasta);
    conta(porEncoding, d.encoding);
  }
  tabela("RAIZ DO XML (o que o arquivo é):", porRaiz, total);
  tabela("CLASSIFICAÇÃO PELO CAMINHO (o que o export do ML diz que é):", porPasta, total);
  tabela("ENCODING DECLARADO:", porEncoding, total);

  /* ------------------------------- Segurança ------------------------------ */

  const comDoctype = docs.filter((d) => d.temDoctype);
  console.log(
    `\nSEGURANÇA · arquivos com DOCTYPE/ENTITY: ${comDoctype.length}` +
      (comDoctype.length ? "  <-- BLOQUEAR NA IMPORTAÇÃO" : "  (nenhum, como esperado)"),
  );
  const comIbs = docs.filter((d) => d.temIbsCbs);
  console.log(
    `REFORMA TRIBUTÁRIA · arquivos com grupo IBS/CBS: ${comIbs.length} de ${total}`,
  );

  /* ------------------------------- Modelos -------------------------------- */

  const porModelo: Contagem = new Map();
  for (const d of docs) conta(porModelo, `${d.modelo ?? "(sem mod)"} ${rotuloModelo(d.modelo)}`);
  tabela("MODELO DO DOCUMENTO:", porModelo, total);

  /* --------------------------- Só NF-e e NFC-e ---------------------------- */

  const notas = docs.filter((d) => d.modelo === "55" || d.modelo === "65");
  console.log(`\n${"-".repeat(78)}`);
  console.log(`NF-e / NFC-e: ${notas.length} arquivos`);
  console.log(`${"-".repeat(78)}`);

  const c = {
    tpNF: new Map<string, number>(),
    tpAmb: new Map<string, number>(),
    finNFe: new Map<string, number>(),
    cStat: new Map<string, number>(),
    serie: new Map<string, number>(),
    natOp: new Map<string, number>(),
    emit: new Map<string, number>(),
    crt: new Map<string, number>(),
    dest: new Map<string, number>(),
    comp: new Map<string, number>(),
  };
  for (const d of notas) {
    conta(c.tpNF, `${d.tpNF ?? "?"} ${d.tpNF === "1" ? "saída" : d.tpNF === "0" ? "ENTRADA" : ""}`);
    conta(c.tpAmb, `${d.tpAmb ?? "?"} ${d.tpAmb === "1" ? "produção" : "HOMOLOGAÇÃO"}`);
    conta(c.finNFe, `${d.finNFe ?? "?"} ${rotuloFinalidade(d.finNFe)}`);
    conta(c.cStat, `${d.cStat ?? "(sem protocolo)"} ${d.cStat === "100" ? "autorizada" : ""}`);
    conta(c.serie, `série ${d.serie ?? "?"}`);
    conta(c.natOp, d.natOp ?? "(sem natOp)");
    conta(c.emit, `${d.cnpjEmit ?? "?"}  ${d.nomeEmit ?? ""}`);
    conta(c.crt, `${d.crt ?? "?"} ${rotuloCrt(d.crt)}`);
    conta(c.dest, d.tipoDocDest ?? "(sem destinatário)");
    conta(c.comp, d.emissao ? d.emissao.slice(0, 7) : "(sem dhEmi)");
  }
  tabela("EMITENTE:", c.emit, notas.length);
  tabela("CRT do emitente (regime):", c.crt, notas.length);
  tabela("tpNF:", c.tpNF, notas.length);
  tabela("tpAmb:", c.tpAmb, notas.length);
  tabela("finNFe:", c.finNFe, notas.length);
  tabela("cStat do protocolo:", c.cStat, notas.length);
  tabela("SÉRIE:", c.serie, notas.length);
  tabela("COMPETÊNCIA (mês de dhEmi):", c.comp, notas.length);
  tabela("DOCUMENTO DO DESTINATÁRIO:", c.dest, notas.length);
  tabela("NATUREZA DA OPERAÇÃO:", c.natOp, notas.length);

  /* --------------------------------- CFOP --------------------------------- */

  // `natOp` é texto livre e cada emissor escreve o que quer. O CFOP é código, e é
  // ele que diz se a saída é VENDA ou movimentação de estoque próprio.
  const porCfop: Contagem = new Map();
  const valorPorCfop = new Map<string, number>();
  for (const d of notas) {
    const chaveCfop = d.cfops.length ? d.cfops.join("+") : "(sem CFOP)";
    conta(porCfop, `${chaveCfop} ${rotuloCfop(d.cfops)}`);
    valorPorCfop.set(chaveCfop, (valorPorCfop.get(chaveCfop) ?? 0) + d.valor);
  }
  tabela("CFOP dos itens (o discriminador que vale):", porCfop, notas.length);
  console.log(`\n  Valor por CFOP:`);
  for (const [cfop, v] of [...valorPorCfop.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${dinheiro(v).padStart(18)}  ${cfop} ${rotuloCfop(cfop.split("+"))}`);
  }

  /* --------------------------- Chave de acesso ---------------------------- */

  let semChave = 0;
  let chaveTorta = 0;
  const divergencias: string[] = [];
  for (const d of notas) {
    if (!d.chave) {
      semChave++;
      continue;
    }
    const dentro = lerChave(d.chave);
    if (!dentro) {
      chaveTorta++;
      continue;
    }
    const problemas: string[] = [];
    // Comparação NUMÉRICA: a tag traz "2" e a chave "002"; a tag "7786" e a
    // chave "000007786". Comparar como texto acusaria divergência em tudo.
    if (dentro.serie !== Number(d.serie)) problemas.push(`série ${d.serie} vs ${dentro.serie}`);
    if (dentro.numero !== Number(d.numero)) problemas.push(`nNF ${d.numero} vs ${dentro.numero}`);
    if (dentro.cnpj !== d.cnpjEmit) problemas.push(`CNPJ ${d.cnpjEmit} vs ${dentro.cnpj}`);
    if (dentro.modelo !== d.modelo) problemas.push(`mod ${d.modelo} vs ${dentro.modelo}`);
    const mesEmissao = d.emissao?.slice(0, 7).replace("-", "");
    if (mesEmissao && `${dentro.ano}${dentro.mes}` !== mesEmissao) {
      problemas.push(`AAMM ${dentro.ano}${dentro.mes} vs emissão ${mesEmissao}`);
    }
    if (problemas.length) divergencias.push(`${d.arquivo}\n        ${problemas.join(" · ")}`);
  }
  console.log(`\nCHAVE DE ACESSO`);
  console.log(`  sem chave: ${semChave}`);
  console.log(`  chave fora do formato de 44 dígitos: ${chaveTorta}`);
  console.log(`  tags divergindo do que a chave carrega: ${divergencias.length}`);
  for (const linha of divergencias.slice(0, 5)) console.log(`      ${linha}`);

  /* ----------------------------- Duplicatas ------------------------------ */

  const porChave = new Map<string, Doc[]>();
  for (const d of docs) {
    if (!d.chave) continue;
    const lista = porChave.get(d.chave) ?? [];
    lista.push(d);
    porChave.set(d.chave, lista);
  }
  const repetidas = [...porChave.entries()].filter(([, l]) => l.length > 1);
  console.log(`\nDUPLICATAS (mesma chave em mais de um arquivo): ${repetidas.length}`);
  for (const [chave, lista] of repetidas.slice(0, 6)) {
    console.log(`  ${chave}`);
    for (const d of lista) console.log(`      ${d.pasta.padEnd(18)} ${d.arquivo}`);
  }

  /* ------------------------------ Eventos -------------------------------- */

  const eventos = docs.filter((d) => d.tpEvento);
  const porEvento: Contagem = new Map();
  for (const d of eventos) conta(porEvento, `${d.tpEvento} ${rotuloEvento(d.tpEvento)}`);
  tabela(`EVENTOS (arquivos de evento, ${eventos.length}):`, porEvento);

  const canceladasPorPasta = docs.filter((d) => d.pasta.includes("CANCELADA"));
  console.log(`\nPASTA "Canceladas": ${canceladasPorPasta.length} arquivos`);
  console.log(`  desses, com arquivo de EVENTO de cancelamento: ${canceladasPorPasta.filter((d) => d.tpEvento).length}`);
  console.log(`  desses, cStat 101/135 no próprio arquivo: ${canceladasPorPasta.filter((d) => d.cStat === "101" || d.cStat === "135").length}`);
  console.log(`  desses, cStat 100 (autorizada, sem sinal de cancelamento DENTRO do XML): ${canceladasPorPasta.filter((d) => d.cStat === "100").length}`);

  /* ------------------------------- Valores ------------------------------- */

  console.log(`\n${"-".repeat(78)}`);
  console.log(`VALORES`);
  console.log(`${"-".repeat(78)}`);

  const somaPorPasta = new Map<string, { n: number; v: number }>();
  for (const d of docs) {
    const atual = somaPorPasta.get(d.pasta) ?? { n: 0, v: 0 };
    atual.n++;
    atual.v += d.valor;
    somaPorPasta.set(d.pasta, atual);
  }
  console.log(`\n  Soma de vNF (ou vTPrest, no CT-e) por classificação de pasta:`);
  for (const [pasta, { n, v }] of [...somaPorPasta.entries()].sort((a, b) => b[1].v - a[1].v)) {
    console.log(`    ${String(n).padStart(5)} arq  ${dinheiro(v).padStart(18)}  ${pasta}`);
  }

  // A conta que interessa: o candidato a faturamento do mês, com as regras da
  // seção 4 do plano aplicadas.
  const candidatas = notas.filter(
    (d) =>
      d.tpAmb === "1" &&
      d.tpNF === "1" &&
      d.cStat === "100" &&
      !d.pasta.includes("CANCELADA") &&
      d.finNFe !== "4" &&
      d.finNFe !== "3",
  );
  const porCompetencia = new Map<string, { n: number; v: number }>();
  for (const d of candidatas) {
    const comp = d.emissao?.slice(0, 7) ?? "(sem data)";
    const atual = porCompetencia.get(comp) ?? { n: 0, v: 0 };
    atual.n++;
    atual.v += d.valor;
    porCompetencia.set(comp, atual);
  }
  console.log(`\n  FATURAMENTO CANDIDATO (produção + saída + autorizada + não cancelada + fin 1|2):`);
  for (const [comp, { n, v }] of [...porCompetencia.entries()].sort()) {
    console.log(`    ${comp}  ${String(n).padStart(5)} notas  ${dinheiro(v).padStart(18)}`);
  }
  console.log(
    `    TOTAL      ${String(candidatas.length).padStart(5)} notas  ` +
      `${dinheiro(candidatas.reduce((s, d) => s + d.valor, 0)).padStart(18)}`,
  );

  const divergeProd = notas.filter((d) => Math.abs(d.valor - d.valorProd) > 0.005);
  console.log(
    `\n  Notas em que vNF != vProd (há frete/desconto/ST): ${divergeProd.length} de ${notas.length}`,
  );

  /* --------------------------- Outros sinais ----------------------------- */

  console.log(`\n${"-".repeat(78)}`);
  console.log(`OUTROS SINAIS`);
  console.log(`${"-".repeat(78)}`);

  const comRef = notas.filter((d) => d.temNFref);
  console.log(`\n  Notas com <NFref> (referenciam outra nota): ${comRef.length} de ${notas.length}`);

  // O export do ML nomeia o arquivo como "<algo>_<chave>-procNFe.xml". Se esse
  // "algo" for o número do pedido, existe a ponte entre nota fiscal e
  // `meli_venda.order_id` — que hoje NÃO existe em lugar nenhum do banco.
  const prefixos = docs.map((d) => d.prefixoNome).filter(Boolean) as string[];
  const soDigitos = prefixos.filter((p) => /^\d+$/.test(p));
  const tamanhosPrefixo: Contagem = new Map();
  for (const p of soDigitos) conta(tamanhosPrefixo, `${p.length} dígitos`);
  console.log(`\n  Nome do arquivo com prefixo antes da chave: ${prefixos.length} de ${total}`);
  console.log(`  desses, só dígitos: ${soDigitos.length}`);
  tabela("  tamanho do prefixo numérico (candidato a order_id do ML):", tamanhosPrefixo);
  console.log(`  amostra: ${soDigitos.slice(0, 5).join(", ")}`);

  /* ------------------------------- CT-e ---------------------------------- */

  const ctes = docs.filter((d) => d.modelo === "57");
  if (ctes.length) {
    const emitCte: Contagem = new Map();
    for (const d of ctes) conta(emitCte, `${d.cnpjEmit ?? "?"}  ${d.nomeEmit ?? ""}`);
    tabela(`EMITENTE DO CT-e (${ctes.length} arquivos):`, emitCte, ctes.length);
    console.log(
      `  Soma de vTPrest: ${dinheiro(ctes.reduce((s, d) => s + d.valor, 0))}` +
        `  <-- é CUSTO de frete, jamais faturamento do embarcador`,
    );
  }

  /* ------------------- Canceladas x Autorizadas --------------------------- */

  const chavesAutorizadas = new Set(
    docs.filter((d) => d.pasta === "VENDA" && d.raiz === "nfeProc").map((d) => d.chave),
  );
  const chavesCanceladas = new Set(
    docs.filter((d) => d.pasta.includes("CANCELADA")).map((d) => d.chave),
  );
  const vazamento = [...chavesCanceladas].filter((c) => c && chavesAutorizadas.has(c));
  console.log(
    `\n  Chaves canceladas que TAMBÉM estão na pasta Autorizadas: ${vazamento.length}` +
      (vazamento.length
        ? "  <-- importar as duas pastas somaria a nota cancelada"
        : "  (o export separa; mas a regra não pode depender do nome da pasta)"),
  );

  console.log(`\n${"=".repeat(78)}`);
  console.log(`Fim. Nada foi gravado.`);
  console.log(`${"=".repeat(78)}\n`);
}

/**
 * O que o CFOP significa, para os que apareceram nesta base.
 *
 * Só os relevantes: a tabela cheia tem centenas de códigos, e diagnóstico que
 * carrega tabela inteira esconde o que interessa.
 */
function rotuloCfop(cfops: string[]): string {
  const rotulos: Record<string, string> = {
    "5101": "venda de produção própria",
    "5102": "VENDA de mercadoria adquirida",
    "6101": "venda de produção própria (interestadual)",
    "6102": "VENDA de mercadoria adquirida (interestadual)",
    "5105": "venda de produção que não transita pelo estabelecimento",
    "5106": "VENDA de mercadoria de terceiros que não transita pelo estabelecimento",
    "6105": "venda de produção que não transita (interestadual)",
    "6106": "VENDA de mercadoria de terceiros que não transita (interestadual)",
    "6107": "venda de produção própria a NÃO CONTRIBUINTE (interestadual)",
    "6108": "VENDA de mercadoria de terceiros a NÃO CONTRIBUINTE (interestadual)",
    "5905": "remessa para depósito/armazém — NÃO É VENDA",
    "6905": "remessa para depósito/armazém (interestadual) — NÃO É VENDA",
    "1905": "entrada de retorno de depósito",
    "2905": "entrada de retorno de depósito (interestadual)",
    "5906": "retorno de mercadoria de depósito",
    "6906": "retorno de mercadoria de depósito (interestadual)",
    "5949": "outra saída não especificada",
    "6949": "outra saída não especificada (interestadual)",
    "1949": "outra entrada não especificada",
    "2949": "outra entrada não especificada (interestadual)",
    "1202": "devolução de venda (entrada)",
    "2202": "devolução de venda (entrada, interestadual)",
    "1411": "devolução de venda com ST (entrada)",
    "2411": "devolução de venda com ST (entrada, interestadual)",
  };
  const nomes = cfops.map((c) => rotulos[c]).filter(Boolean);
  return nomes.length ? `— ${[...new Set(nomes)].join(" / ")}` : "";
}

function rotuloModelo(mod: string | null): string {
  if (mod === "55") return "NF-e";
  if (mod === "65") return "NFC-e";
  if (mod === "57") return "CT-e  <-- documento do TRANSPORTADOR, não é faturamento";
  if (mod === "13") return "NFS-e nacional";
  return "";
}

function rotuloFinalidade(fin: string | null): string {
  if (fin === "1") return "normal";
  if (fin === "2") return "complementar";
  if (fin === "3") return "ajuste";
  if (fin === "4") return "DEVOLUÇÃO";
  return "";
}

function rotuloCrt(crt: string | null): string {
  if (crt === "1") return "Simples Nacional";
  if (crt === "2") return "Simples Nacional - excesso de sublimite";
  if (crt === "3") return "Regime Normal";
  if (crt === "4") return "Simples Nacional - MEI";
  return "";
}

function rotuloEvento(tp: string | null): string {
  if (tp === "110111") return "CANCELAMENTO";
  if (tp === "110110") return "carta de correção";
  if (tp === "110112") return "cancelamento por substituição";
  return "";
}

main();
