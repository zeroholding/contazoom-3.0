/**
 * Teste de aceitação com a pasta real já descompactada.
 *
 * Usa EXATAMENTE lerXmlFiscal + classificarFaturamento da produção, incluindo
 * XMLDSig, eventos 135/155 e CFOP de todos os itens. Sem banco, rede ou escrita.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { extname, join } from "path";
import { eventoFoiRegistrado, lerXmlFiscal, type NotaFiscalLida } from "../src/lib/nfe-xml";
import { classificarFaturamento } from "../src/lib/faturamento-regras";

const raiz = process.argv[2] ??
  "XML/XML GRUPO NEXUS 202608/MERCADOLIVRE/CINGAPURA";

const caminhos: string[] = [];
function andar(dir: string) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    const info = statSync(caminho);
    if (info.isDirectory()) andar(caminho);
    else if (extname(nome).toLowerCase() === ".xml") caminhos.push(caminho);
  }
}
andar(raiz);

const notas: NotaFiscalLida[] = [];
const canceladas = new Set<string>();
let outros = 0;
let eventos = 0;
let erros = 0;
const statusEventos = new Map<string, number>();

for (const caminho of caminhos) {
  try {
    const lido = lerXmlFiscal(readFileSync(caminho), caminho);
    if (lido.tipo === "NOTA") notas.push(lido);
    else if (lido.tipo === "OUTRO_MODELO") outros += 1;
    else {
      eventos += 1;
      const status = lido.statusSefaz ?? "ausente";
      statusEventos.set(status, (statusEventos.get(status) ?? 0) + 1);
      if (lido.ehCancelamento && eventoFoiRegistrado(lido.statusSefaz)) {
        canceladas.add(lido.chave);
      }
    }
  } catch (erro) {
    erros += 1;
    console.error(`ERRO ${caminho}: ${String(erro)}`);
  }
}

let notasQueSomam = 0;
let totalCentavos = 0;
for (const nota of notas) {
  const resultado = classificarFaturamento({
    modelo: nota.modelo,
    ambiente: nota.ambiente,
    tipoOperacao: nota.tipoOperacao,
    finalidade: nota.finalidade,
    statusSefaz: nota.statusSefaz,
    cfops: nota.cfops,
    cancelada: canceladas.has(nota.chave),
    vinculo: "EMITENTE",
  });
  if (resultado.contaFaturamento) {
    notasQueSomam += 1;
    totalCentavos += Math.round(nota.valorTotal * 100);
  }
}

const resultado = {
  arquivos: caminhos.length,
  notas: notas.length,
  outros,
  eventos,
  erros,
  statusEventos: Object.fromEntries(statusEventos),
  canceladas: canceladas.size,
  notasQueSomam,
  total: totalCentavos / 100,
};
console.log(resultado);

const esperado =
  resultado.arquivos === 822 &&
  resultado.notas === 458 &&
  resultado.outros === 361 &&
  resultado.eventos === 3 &&
  resultado.erros === 0 &&
  resultado.canceladas === 3 &&
  resultado.notasQueSomam === 366 &&
  resultado.total === 62514.16;

console.log(esperado ? "TUDO OK — aceitação real fechou ao centavo" : "FALHA — resultado divergiu da linha de base");
process.exitCode = esperado ? 0 : 1;
