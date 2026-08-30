/**
 * Conferência das regras de anexo de tarefa.
 *
 * Roda com: node --experimental-strip-types scripts/test-anexo.mjs
 *
 * O que importa aqui é `validarTipo`, que tem três caminhos com consequência de
 * segurança: MIME conhecido, MIME genérico resolvido pela extensão, e recusa. Um
 * `.svg` aceito por engano, servido do mesmo domínio, é XSS — então a lista é
 * branca e o teste garante que ela é branca de verdade.
 *
 * `nomeParaDisco` também entra: é a única coisa entre um nome de arquivo vindo do
 * usuário e o sistema de arquivos.
 */

import assert from "node:assert/strict";
import {
  ACCEPT_ANEXO,
  ANEXOS_MAXIMO_POR_TAREFA,
  EXTENSOES_ACEITAS,
  TAMANHO_MAXIMO_BYTES,
  contentDisposition,
  ehImagem,
  extensaoDe,
  iconeDoAnexo,
  nomeDeArquivoSeguro,
  nomeParaDisco,
  tamanhoLegivel,
  validarTipo,
} from "../src/lib/tarefa-anexo.ts";

let checagens = 0;
function conferir(descricao, real, esperado) {
  assert.deepEqual(
    real,
    esperado,
    `${descricao}: ${JSON.stringify(real)} != ${JSON.stringify(esperado)}`
  );
  checagens += 1;
}
function conferirOk(descricao, condicao) {
  assert.ok(condicao, descricao);
  checagens += 1;
}

/* ------------------------------- Limites --------------------------------- */

conferir("limite de 20 MB", TAMANHO_MAXIMO_BYTES, 20 * 1024 * 1024);
conferir("teto por tarefa", ANEXOS_MAXIMO_POR_TAREFA, 30);
conferirOk("accept não está vazio", ACCEPT_ANEXO.length > 0);
conferirOk("accept casa com a lista", ACCEPT_ANEXO === EXTENSOES_ACEITAS.join(","));

/* ------------------------------- Extensão -------------------------------- */

conferir("extensão simples", extensaoDe("contrato.pdf"), ".pdf");
conferir("extensão maiúscula", extensaoDe("CONTRATO.PDF"), ".pdf");
conferir("extensão de nome com pontos", extensaoDe("contrato.v2.final.pdf"), ".pdf");
conferir("sem extensão", extensaoDe("contrato"), "");
conferir("ponto no fim não é extensão", extensaoDe("contrato."), "");
conferir("arquivo oculto sem extensão", extensaoDe(".gitignore"), "");

/* ------------------------ Tipo: MIME conhecido --------------------------- */

conferir("pdf", validarTipo("application/pdf", "contrato.pdf"), {
  ok: true,
  tipoMime: "application/pdf",
});
conferir("jpeg com .jpg", validarTipo("image/jpeg", "rg.jpg"), {
  ok: true,
  tipoMime: "image/jpeg",
});
conferir("jpeg com .jpeg", validarTipo("image/jpeg", "rg.jpeg"), {
  ok: true,
  tipoMime: "image/jpeg",
});
conferir("MIME com charset", validarTipo("text/csv; charset=utf-8", "notas.csv"), {
  ok: true,
  tipoMime: "text/csv",
});
conferir("MIME maiúsculo", validarTipo("APPLICATION/PDF", "x.pdf"), {
  ok: true,
  tipoMime: "application/pdf",
});
// MIME conhecido e arquivo sem extensão passa: há sistema que salva anexo assim.
conferir("pdf sem extensão", validarTipo("application/pdf", "contrato"), {
  ok: true,
  tipoMime: "application/pdf",
});

// Extensão que não corresponde ao MIME é recusada: é o caso de renomear .exe
// para .pdf, ou de um upload montado à mão.
const trocado = validarTipo("application/pdf", "virus.exe");
conferir("extensão que não bate", trocado.ok, false);
conferirOk(
  "erro cita a extensão",
  !trocado.ok && trocado.erro.includes(".exe")
);

/* --------------------- Tipo: MIME genérico ------------------------------- */

// Navegador manda octet-stream para .xlsx e .heic. Recusar aí seria recusar
// arquivo legítimo por defeito do navegador de quem envia.
conferir(
  "octet-stream com .xlsx",
  validarTipo("application/octet-stream", "planilha.xlsx"),
  {
    ok: true,
    tipoMime:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }
);
conferir("octet-stream com .heic", validarTipo("application/octet-stream", "foto.heic"), {
  ok: true,
  tipoMime: "image/heic",
});
conferir("MIME vazio com .pdf", validarTipo("", "contrato.pdf"), {
  ok: true,
  tipoMime: "application/pdf",
});

/* ----------------------------- Tipo: recusa ------------------------------ */

for (const [mime, nome] of [
  ["image/svg+xml", "logo.svg"], // script embutido = XSS
  ["text/html", "pagina.html"],
  ["application/x-msdownload", "instalador.exe"],
  ["application/javascript", "script.js"],
  ["video/mp4", "video.mp4"],
  ["application/octet-stream", "coisa.bin"],
  ["", "sem-extensao"],
]) {
  const resultado = validarTipo(mime, nome);
  conferir(`recusa ${nome}`, resultado.ok, false);
}

/* ------------------------------- Imagem ---------------------------------- */

conferir("jpeg é imagem", ehImagem("image/jpeg"), true);
conferir("pdf não é imagem", ehImagem("application/pdf"), false);

conferir("ícone de imagem", iconeDoAnexo("image/png"), "FileImage");
conferir("ícone de pdf", iconeDoAnexo("application/pdf"), "FileText");
conferir("ícone de csv", iconeDoAnexo("text/csv"), "FileSpreadsheet");
conferir(
  "ícone de xlsx",
  iconeDoAnexo(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ),
  "FileSpreadsheet"
);
conferir("ícone de word", iconeDoAnexo("application/msword"), "FileText");
conferir("ícone padrão", iconeDoAnexo("application/zip"), "File");

/* ---------------------------- Nome no disco ------------------------------ */

// Os três ataques que o nome de arquivo carrega, e a colisão.
for (const perigoso of [
  "../../etc/passwd",
  "..\\..\\windows\\system32\\config",
  "/absoluto/contrato.pdf",
  "contrato/../../fora.pdf",
  "con:trato.pdf",
  "  espaços  .pdf",
  "acentuação e ç.pdf",
]) {
  const gerado = nomeParaDisco(perigoso);
  conferirOk(
    `nome seguro para "${perigoso}" -> ${gerado}`,
    nomeDeArquivoSeguro(gerado)
  );
  conferirOk(`sem barra em "${gerado}"`, !/[/\\]/.test(gerado));
  conferirOk(`sem ".." em "${gerado}"`, !gerado.includes(".."));
}

// Nome vazio não gera nome vazio.
conferirOk("nome vazio virou algo", nomeParaDisco("").length > 0);
conferirOk("só pontos virou algo", nomeDeArquivoSeguro(nomeParaDisco("...")));

// Dois arquivos com o mesmo nome geram nomes diferentes.
const a = nomeParaDisco("contrato.pdf");
const b = nomeParaDisco("contrato.pdf");
conferirOk(`nomes distintos: ${a} vs ${b}`, a !== b);

// Nome muito longo é truncado.
const longo = nomeParaDisco(`${"x".repeat(400)}.pdf`);
conferirOk(`nome truncado (${longo.length})`, longo.length < 160);

/* --------------------------- Nome seguro --------------------------------- */

conferir("nome simples é seguro", nomeDeArquivoSeguro("1234_ab_contrato.pdf"), true);
conferir("com barra não é seguro", nomeDeArquivoSeguro("a/b.pdf"), false);
conferir("com contrabarra não é seguro", nomeDeArquivoSeguro("a\\b.pdf"), false);
conferir("com .. não é seguro", nomeDeArquivoSeguro("..a.pdf"), false);
conferir("vazio não é seguro", nomeDeArquivoSeguro(""), false);

/* ------------------------------- Tamanho --------------------------------- */

conferir("bytes", tamanhoLegivel(512), "512 B");
conferir("kilobytes", tamanhoLegivel(2048), "2 KB");
conferir("megabytes", tamanhoLegivel(2.5 * 1024 * 1024), "2,5 MB");
conferir("limite legível", tamanhoLegivel(TAMANHO_MAXIMO_BYTES), "20,0 MB");
conferir("negativo", tamanhoLegivel(-1), "—");
conferir("não numérico", tamanhoLegivel(Number.NaN), "—");

/* -------------------------- Content-Disposition -------------------------- */

const disp = contentDisposition("contrato social.pdf", false);
conferirOk("attachment", disp.startsWith("attachment;"));
conferirOk("tem filename ascii", disp.includes('filename="contrato social.pdf"'));
conferirOk("tem filename utf-8", disp.includes("filename*=UTF-8''"));

const dispInline = contentDisposition("foto.jpg", true);
conferirOk("inline", dispInline.startsWith("inline;"));

// Aspas e acento não podem quebrar o cabeçalho.
const dispTorto = contentDisposition('con"trato\\ção.pdf', false);
conferirOk(
  `sem aspas no fallback: ${dispTorto}`,
  (dispTorto.match(/"/g) || []).length === 2
);
conferirOk("sem contrabarra no fallback", !dispTorto.includes('filename="con\\'));
conferirOk(
  "acento vai no filename*",
  dispTorto.includes(encodeURIComponent('con"trato\\ção.pdf'))
);

console.log(`OK — ${checagens} checagens das regras de anexo passaram.`);
