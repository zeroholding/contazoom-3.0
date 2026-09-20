/**
 * Diagnóstico curto das amostras extraídas de todos os ZIPs do grupo.
 *
 * SEM BANCO, SEM REDE, SEM ESCRITA. Usa exatamente o parser e o classificador
 * que a rota de produção usa, para que "passou no diagnóstico" signifique
 * "passa na importação" — e não apenas que outro script conseguiu ler.
 *
 * Pré-requisito:
 *   python scripts/extrair-amostras-xml.py "XML/XML GRUPO NEXUS 202608"
 *
 * Uso:
 *   npx tsx scripts/diagnostico-amostras-xml.ts \
 *     "XML/XML GRUPO NEXUS 202608/_AMOSTRAS_2_POR_ZIP"
 */

import { readFileSync } from "fs";
import { join } from "path";
import { ErroXmlFiscal, lerXmlFiscal } from "../src/lib/nfe-xml";
import {
  MOTIVO_EXCLUSAO_LABEL,
  classificarFaturamento,
  type MotivoExclusao,
} from "../src/lib/faturamento-regras";

type Sample = { entrada: string; bytes: number; extraido: string };
type ZipEntry = {
  zip: string;
  tamanho_zip: number;
  xmls_no_zip: number;
  amostras: Sample[];
  erro: string | null;
};
type Manifest = {
  raiz: string;
  destino: string;
  zips: ZipEntry[];
  total_zips: number;
  total_amostras: number;
  falhas: number;
};

const root = process.argv[2] ?? "XML/XML GRUPO NEXUS 202608/_AMOSTRAS_2_POR_ZIP";
const manifest = JSON.parse(readFileSync(join(root, "manifesto.json"), "utf8")) as Manifest;

type Result = {
  zip: string;
  arquivo: string;
  tipo: string;
  modelo: string;
  cnpj: string;
  serie: string;
  competencia: string;
  cfops: string;
  valor: number;
  decisao: string;
  erro: string;
};

const results: Result[] = [];

function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

for (const zip of manifest.zips) {
  for (const sample of zip.amostras) {
    try {
      // `extraido` é relativo à raiz original, e começa por
      // `_AMOSTRAS_2_POR_ZIP/`; o primeiro segmento sai para resolver contra
      // `root`, que já aponta para esse diretório.
      const relativeToOutput = sample.extraido.replace(/^_AMOSTRAS_2_POR_ZIP\//, "");
      const bytes = readFileSync(join(root, ...relativeToOutput.split("/")));
      const parsed = lerXmlFiscal(bytes, sample.entrada);

      if (parsed.tipo === "NOTA") {
        const classification = classificarFaturamento({
          modelo: parsed.modelo,
          ambiente: parsed.ambiente,
          tipoOperacao: parsed.tipoOperacao,
          finalidade: parsed.finalidade,
          statusSefaz: parsed.statusSefaz,
          cfops: parsed.cfops,
          cancelada: false,
          // Diagnóstico estrutural: assume que o CNPJ será cadastrado. O teste de
          // vínculo depende do banco e não pertence a este script.
          vinculo: "EMITENTE",
        });

        results.push({
          zip: zip.zip,
          arquivo: sample.entrada,
          tipo: "NOTA",
          modelo: parsed.modelo,
          cnpj: parsed.cnpjEmitente,
          serie: parsed.serie,
          competencia: parsed.competencia,
          cfops: parsed.cfops.join("+") || "—",
          valor: parsed.valorTotal,
          decisao: classification.contaFaturamento
            ? "SOMA"
            : classification.motivoExclusao ?? "NAO_SOMA",
          erro: "",
        });
      } else if (parsed.tipo === "EVENTO") {
        results.push({
          zip: zip.zip,
          arquivo: sample.entrada,
          tipo: "EVENTO",
          modelo: "—",
          cnpj: "—",
          serie: "—",
          competencia: "—",
          cfops: "—",
          valor: 0,
          decisao: `${parsed.tipoEvento}${parsed.ehCancelamento ? " CANCELA" : ""}`,
          erro: "",
        });
      } else {
        results.push({
          zip: zip.zip,
          arquivo: sample.entrada,
          tipo: "OUTRO",
          modelo: parsed.modelo ?? "?",
          cnpj: parsed.cnpjEmitente ?? "—",
          serie: "—",
          competencia: "—",
          cfops: "—",
          valor: parsed.valorTotal,
          decisao: "MODELO_NAO_APURADO",
          erro: "",
        });
      }
    } catch (error) {
      const fiscal = error instanceof ErroXmlFiscal ? error : null;
      results.push({
        zip: zip.zip,
        arquivo: sample.entrada,
        tipo: "ERRO",
        modelo: "—",
        cnpj: "—",
        serie: "—",
        competencia: "—",
        cfops: "—",
        valor: 0,
        decisao: "ERRO",
        erro: fiscal
          ? `${fiscal.code}: ${fiscal.message}${fiscal.detalhe ? ` (${fiscal.detalhe})` : ""}`
          : String(error),
      });
    }
  }
}

console.log("\nAMOSTRAS — exatamente o parser da produção\n");
console.log(
  "ORIGEM".padEnd(49),
  "TIPO".padEnd(7),
  "MOD".padEnd(3),
  "CNPJ".padEnd(14),
  "SÉRIE".padEnd(5),
  "COMP".padEnd(7),
  "CFOP".padEnd(10),
  "VALOR".padStart(13),
  "DECISÃO",
);
console.log("-".repeat(135));

for (const result of results) {
  const origin = result.zip
    .replace(/\\/g, "/")
    .replace(/_20260801_20260831/g, "")
    .replace(/\.zip$/i, "");
  console.log(
    origin.slice(0, 48).padEnd(49),
    result.tipo.padEnd(7),
    result.modelo.padEnd(3),
    result.cnpj.padEnd(14),
    result.serie.padEnd(5),
    result.competencia.padEnd(7),
    result.cfops.slice(0, 9).padEnd(10),
    money(result.valor).padStart(13),
    result.erro || result.decisao,
  );
}

const errors = results.filter((result) => result.erro);
const byModel = new Map<string, number>();
const byCnpj = new Map<string, number>();
const byDecision = new Map<string, number>();
for (const result of results) {
  byModel.set(result.modelo, (byModel.get(result.modelo) ?? 0) + 1);
  if (result.cnpj !== "—") byCnpj.set(result.cnpj, (byCnpj.get(result.cnpj) ?? 0) + 1);
  byDecision.set(result.erro ? "ERRO" : result.decisao, (byDecision.get(result.erro ? "ERRO" : result.decisao) ?? 0) + 1);
}

console.log("\nRESUMO");
console.log(`  ZIPs: ${manifest.total_zips} · amostras: ${results.length} · erros do parser: ${errors.length}`);
console.log(`  Modelos: ${[...byModel].map(([key, value]) => `${key}=${value}`).join(" · ")}`);
console.log(`  CNPJs: ${[...byCnpj].map(([key, value]) => `${key}=${value}`).join(" · ")}`);
console.log(`  Decisões: ${[...byDecision].map(([key, value]) => `${key}=${value}`).join(" · ")}`);

if (errors.length > 0) {
  console.log("\nERROS");
  for (const item of errors) {
    console.log(`  ${item.zip} :: ${item.arquivo}\n    ${item.erro}`);
  }
}

const exclusions = results.filter((result) =>
  result.decisao in MOTIVO_EXCLUSAO_LABEL
);
if (exclusions.length > 0) {
  console.log("\nLEGENDA DE EXCLUSÕES");
  for (const code of [...new Set(exclusions.map((item) => item.decisao))]) {
    console.log(`  ${code}: ${MOTIVO_EXCLUSAO_LABEL[code as MotivoExclusao]}`);
  }
}

process.exit(errors.length === 0 ? 0 : 2);
