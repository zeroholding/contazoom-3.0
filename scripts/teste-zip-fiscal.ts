/**
 * Testes do extrator ZIP fiscal.
 *
 * Sem banco, sem servidor. Cobre as proteções com ZIPs sintéticos e, quando a
 * pasta do grupo existe, abre todos os 22 ZIPs reais e confere as contagens
 * contra o manifesto produzido pelo extrator Python.
 *
 * Uso:
 *   npx tsx scripts/teste-zip-fiscal.ts
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { strToU8, zipSync } from "fflate";
import {
  ErroZipFiscal,
  TAMANHO_MAXIMO_ZIP,
  extrairXmlsDoZip,
} from "../src/lib/fiscal-zip";
import { TAMANHO_MAXIMO_XML } from "../src/lib/nfe-xml";

let falhas = 0;
let checks = 0;

function check(nome: string, condicao: boolean, detalhe = ""): void {
  checks += 1;
  if (condicao) {
    console.log(`  ok   ${nome}`);
    return;
  }
  falhas += 1;
  console.log(`  FALHA ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
}

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof ErroZipFiscal ? error.code : `OUTRO:${String(error)}`;
  }
}

async function main(): Promise<void> {
  console.log("\n1) Extração e caminho seguro");

const normal = zipSync({
  "pasta/123456_12345678901234567890123456789012345678901234.xml": strToU8("<xml>um</xml>"),
  "../fora.xml": strToU8("<xml>dois</xml>"),
  "ignorar.txt": strToU8("não é XML"),
});
const extracted = await extrairXmlsDoZip(normal, "normal.zip");
check("extrai somente XML", extracted.length === 2, String(extracted.length));
check("descarta diretório interno", extracted[0]?.nome.includes("/") === false);
check("neutraliza ../ (não escreve caminho)", extracted.some((item) => item.nome === "fora.xml"));
check("preserva caminho só no diagnóstico", extracted.some((item) => item.origem.includes("../fora.xml")));

console.log("\n2) Limites e erros estáveis");

check("recusa ZIP vazio", (await codeOf(extrairXmlsDoZip(new Uint8Array(), "vazio.zip"))) === "ZIP_VAZIO");
check(
  "recusa ZIP comprimido acima do teto",
  (await codeOf(extrairXmlsDoZip(new Uint8Array(TAMANHO_MAXIMO_ZIP + 1), "grande.zip"))) === "ZIP_GRANDE",
);
check(
  "recusa ZIP sem XML",
  (await codeOf(extrairXmlsDoZip(zipSync({ "readme.txt": strToU8("oi") }), "sem-xml.zip"))) === "ZIP_SEM_XML",
);
check(
  "recusa XML individual acima de 1 MiB",
  (await codeOf(
    extrairXmlsDoZip(
      zipSync({ "grande.xml": new Uint8Array(TAMANHO_MAXIMO_XML + 1).fill(0x61) }, { level: 0 }),
      "xml-grande.zip",
    ),
  )) === "ZIP_XML_GRANDE",
);

// 256 KiB de byte repetido vira poucos bytes: bomba pequena, barata para o teste,
// mas com razão muito acima de 200:1.
check(
  "recusa razão de compressão suspeita",
  (await codeOf(
    extrairXmlsDoZip(
      zipSync({ "bomba.xml": new Uint8Array(256 * 1024).fill(0x41) }, { level: 9 }),
      "bomba.zip",
    ),
  )) === "ZIP_RAZAO_SUSPEITA",
);

console.log("\n3) Os 22 ZIPs reais do grupo");

const groupRoot = join(process.cwd(), "XML", "XML GRUPO NEXUS 202608");
const manifestPath = join(groupRoot, "_AMOSTRAS_2_POR_ZIP", "manifesto.json");

if (!existsSync(manifestPath)) {
  console.log("  pulou: manifesto de amostras não existe nesta máquina");
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    zips: Array<{ zip: string; xmls_no_zip: number }>;
  };

  for (const archive of manifest.zips) {
    const path = join(groupRoot, ...archive.zip.split("/"));
    const bytes = readFileSync(path);
    try {
      const files = await extrairXmlsDoZip(bytes, archive.zip);
      check(
        `${archive.zip} (${archive.xmls_no_zip.toLocaleString("pt-BR")} XMLs)`,
        files.length === archive.xmls_no_zip,
        `extraiu ${files.length}`,
      );
      files.length = 0;
      // Libera referências entre ZIPs; o extrator também cede o event loop em
      // blocos de 256 KiB, então a bateria não depende de GC exposto.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    } catch (error) {
      check(archive.zip, false, error instanceof Error ? error.message : String(error));
    }
  }
}

  console.log(`\n${falhas === 0 ? `TUDO OK — ${checks} checks` : `${falhas} FALHA(S) em ${checks} checks`}`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

void main();
