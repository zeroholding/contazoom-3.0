/** Valida XMLDSig nas amostras reais. Sem banco ou rede. */

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { unzipSync } from "fflate";
import { verificarAssinaturaXml } from "../src/lib/xml-assinatura";
import { ErroXmlFiscal, lerXmlFiscal } from "../src/lib/nfe-xml";

const raiz = join(process.cwd(), "XML", "XML GRUPO NEXUS 202608");
const amostras = join(raiz, "_AMOSTRAS_2_POR_ZIP");
const arquivos: string[] = [];
function andar(dir: string) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    const info = statSync(caminho);
    if (info.isDirectory()) andar(caminho);
    else if (nome.toLowerCase().endsWith(".xml")) arquivos.push(caminho);
  }
}
andar(amostras);

let ok = 0;
let pulados = 0;
let falhas = 0;
let primeiraNota: { caminho: string; xml: string } | null = null;
for (const caminho of arquivos) {
  const xml = readFileSync(caminho, "utf8");
  const chave = xml.match(/\bId=["']NFe(\d{44})["']/)?.[1];
  if (!chave) {
    pulados += 1; // CT-e: este módulo não apura nem persiste.
    continue;
  }
  const resultado = verificarAssinaturaXml(xml, {
    elemento: "infNFe",
    id: `NFe${chave}`,
  });
  if (!primeiraNota) primeiraNota = { caminho, xml };
  try {
    const lida = lerXmlFiscal(Buffer.from(xml), caminho);
    if (lida.tipo !== "NOTA" || !lida.assinaturaValida) {
      throw new Error("parser não devolveu nota autenticada");
    }
  } catch (erro) {
    falhas += 1;
    console.log(`FALHA PARSER ASSINADO ${caminho}: ${String(erro)}`);
    continue;
  }
  if (resultado.ok) ok += 1;
  else {
    falhas += 1;
    console.log(`FALHA ${caminho}: ${resultado.motivo}`);
  }
}

const canceladasDir = join(
  raiz,
  "MERCADOLIVRE",
  "CINGAPURA",
  "venda_20260801_20260831",
);
const eventos: string[] = [];
andarEventos(canceladasDir);
function andarEventos(dir: string) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    const info = statSync(caminho);
    if (info.isDirectory()) andarEventos(caminho);
    else if (nome.includes("procEventoNFe.xml")) eventos.push(caminho);
  }
}

for (const caminho of eventos) {
  const xml = readFileSync(caminho, "utf8");
  const id = xml.match(/<infEvento\b[^>]*\bId=["']([^"']+)["']/)?.[1] ?? "";
  const resultado = verificarAssinaturaXml(xml, { elemento: "infEvento", id });
  try {
    const lido = lerXmlFiscal(Buffer.from(xml), caminho);
    if (lido.tipo !== "EVENTO" || !lido.assinaturaValida) {
      throw new Error("parser não devolveu evento autenticado");
    }
  } catch (erro) {
    falhas += 1;
    console.log(`FALHA PARSER EVENTO ${caminho}: ${String(erro)}`);
    continue;
  }
  if (resultado.ok) ok += 1;
  else {
    falhas += 1;
    console.log(`FALHA EVENTO ${caminho}: ${resultado.motivo}`);
  }
}

if (primeiraNota) {
  // vNF não faz parte da chave de acesso. Só XMLDSig detecta esta adulteração
  // antes da primeira importação.
  const adulterado = primeiraNota.xml.replace(
    /<vNF>([^<]+)<\/vNF>/,
    "<vNF>999999.99</vNF>",
  );
  let recusou = false;
  try {
    lerXmlFiscal(Buffer.from(adulterado), primeiraNota.caminho);
  } catch (erro) {
    recusou =
      erro instanceof ErroXmlFiscal && erro.code === "ASSINATURA_INVALIDA";
  }
  if (recusou) ok += 1;
  else {
    falhas += 1;
    console.log("FALHA: alteração de vNF não invalidou a assinatura.");
  }
}

// Varre todos os eventos dentro dos 22 ZIPs, não só as duas amostras. Foi essa
// passada que encontrou cStat 155 (cancelamento homologado fora de prazo).
const manifesto = JSON.parse(
  readFileSync(join(amostras, "manifesto.json"), "utf8"),
) as { zips: Array<{ zip: string }> };
const statusEventos = new Map<string, number>();
let eventosNosZips = 0;
for (const item of manifesto.zips) {
  const caminhoZip = join(raiz, ...item.zip.split("/"));
  const extraidos = unzipSync(readFileSync(caminhoZip), {
    filter: (info) => /procEventoNFe\.xml$/i.test(info.name),
  });
  for (const [nome, bytes] of Object.entries(extraidos)) {
    try {
      const lido = lerXmlFiscal(bytes, nome);
      if (lido.tipo !== "EVENTO") throw new Error("não reconhecido como evento");
      eventosNosZips += 1;
      const status = lido.statusSefaz ?? "ausente";
      statusEventos.set(status, (statusEventos.get(status) ?? 0) + 1);
    } catch (erro) {
      falhas += 1;
      console.log(`FALHA EVENTO NO ZIP ${item.zip}!${nome}: ${String(erro)}`);
    }
  }
}
if (eventosNosZips === 46 && statusEventos.get("155") === 3) ok += 1;
else {
  falhas += 1;
  console.log(
    `FALHA inventário de eventos: total=${eventosNosZips}, ` +
      `status=${JSON.stringify(Object.fromEntries(statusEventos))}`,
  );
}

console.log(
  `${ok} assinatura(s) válidas · ${pulados} CT-e pulados · ${falhas} falha(s)`,
);
process.exitCode = falhas === 0 ? 0 : 1;
