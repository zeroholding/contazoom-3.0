/**
 * Teste de ponta a ponta da rota pública do formulário de abertura.
 *
 * Roda contra um servidor de desenvolvimento apontado para um banco descartável.
 * Não é teste automatizado do projeto — é o roteiro de verificação desta entrega,
 * e está em `scripts/` para poder ser repetido em vez de descrito.
 *
 * Uso: node scripts/teste-formulario.mjs http://localhost:3313
 */

const BASE = process.argv[2] || "http://localhost:3313";

let passou = 0;
let falhou = 0;

function ok(rotulo, condicao, detalhe = "") {
  if (condicao) {
    passou += 1;
    console.log(`  OK   ${rotulo}`);
  } else {
    falhou += 1;
    console.log(`  FALHA ${rotulo}${detalhe ? ` :: ${detalhe}` : ""}`);
  }
}

/** Um PDF mínimo de verdade, para `validarTipo` aceitar por MIME e extensão. */
function pdfFalso(texto) {
  const conteudo = `%PDF-1.4\n% ${texto}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`;
  return new Blob([conteudo], { type: "application/pdf" });
}

/** Formulário válido de um sócio. Espelha o que a tela monta. */
function dadosValidos() {
  return {
    versao: 1,
    socios: [
      {
        nome: "Maria Aparecida Silva",
        // CPF com dígito verificador correto.
        cpf: "529.982.247-25",
        telefone: "(11) 91234-5678",
        email: "maria@empresa.com.br",
        profissao: "Comerciante",
        estadoCivil: "CASADO",
        regimeBens: "COMUNHAO_PARCIAL",
        contaGov: true,
        endereco: {
          cep: "01001-000",
          logradouro: "Praça da Sé",
          numero: "100",
          complemento: "sala 2",
          bairro: "Sé",
          cidade: "São Paulo",
          uf: "SP",
        },
        mesmoEnderecoDoPrimeiro: false,
        temParticipacaoOutraEmpresa: false,
        outraEmpresaCnpj: "",
        outraEmpresaEnquadramento: "",
        capitalCentavos: 2000000,
        administrador: true,
      },
    ],
    razaoSocialOpcoes: [
      "Silva Comercio de Roupas LTDA",
      "Maria Silva Confeccoes LTDA",
      "Aparecida Modas LTDA",
    ],
    nomeFantasia: "Loja da Maria",
    atividades:
      "Venda de roupas femininas pela internet, com estoque proprio, e confeccao sob encomenda para lojistas.",
    localEmpresa: "SOCIO",
    socioDoEndereco: 0,
    enderecoEmpresa: {
      cep: "",
      logradouro: "",
      numero: "",
      complemento: "",
      bairro: "",
      cidade: "",
      uf: "",
    },
    temIptu: false,
    assinaturaConjunta: null,
    confirmouVeracidade: true,
  };
}

function corpoCompleto(dados) {
  const fd = new FormData();
  fd.append("dados", JSON.stringify(dados));
  // Os dois obrigatórios do sócio 1. O slot vai no NOME DO CAMPO.
  fd.append("arquivo:socio.0.identidade", pdfFalso("rg maria"), "rg-maria.pdf");
  fd.append(
    "arquivo:socio.0.residencia",
    pdfFalso("conta de luz"),
    "conta-luz.pdf"
  );
  return fd;
}

async function main() {
  console.log(`\nTestando ${BASE}\n`);

  /* ---------------------------------------------------------------------- */
  console.log("1. Recusa envio sem documento obrigatório (espera 422)");
  {
    const fd = new FormData();
    fd.append("dados", JSON.stringify(dadosValidos()));
    const r = await fetch(`${BASE}/api/formulario`, { method: "POST", body: fd });
    const j = await r.json();
    ok("status 422", r.status === 422, `veio ${r.status}`);
    ok("aponta o campo que falta", !!j.campos?.["socio.0.identidade"], JSON.stringify(j).slice(0, 200));
  }

  /* ---------------------------------------------------------------------- */
  console.log("\n2. Recusa CPF com dígito verificador errado (espera 422)");
  {
    const dados = dadosValidos();
    dados.socios[0].cpf = "111.111.111-11";
    const r = await fetch(`${BASE}/api/formulario`, {
      method: "POST",
      body: corpoCompleto(dados),
    });
    const j = await r.json();
    ok("status 422", r.status === 422, `veio ${r.status}`);
    ok("erro no CPF", !!j.campos?.["socios.0.cpf"], JSON.stringify(j.campos ?? {}).slice(0, 200));
  }

  /* ---------------------------------------------------------------------- */
  console.log("\n3. Recusa três razões sociais iguais variando acento (espera 422)");
  {
    const dados = dadosValidos();
    dados.razaoSocialOpcoes = ["Padaria Silva", "PADARIA SILVA", "pádaria silva"];
    const r = await fetch(`${BASE}/api/formulario`, {
      method: "POST",
      body: corpoCompleto(dados),
    });
    const j = await r.json();
    ok("status 422", r.status === 422, `veio ${r.status}`);
    ok("erro na 2ª opção", !!j.campos?.["razaoSocial.1"], JSON.stringify(j.campos ?? {}).slice(0, 200));
  }

  /* ---------------------------------------------------------------------- */
  console.log("\n4. Recusa arquivo de tipo não aceito (espera 415)");
  {
    const fd = new FormData();
    fd.append("dados", JSON.stringify(dadosValidos()));
    fd.append(
      "arquivo:socio.0.identidade",
      new Blob(["MZ..."], { type: "application/x-msdownload" }),
      "virus.exe"
    );
    const r = await fetch(`${BASE}/api/formulario`, { method: "POST", body: fd });
    ok("status 415", r.status === 415, `veio ${r.status}`);
  }

  /* ---------------------------------------------------------------------- */
  console.log("\n5. Recusa arquivo em slot que não existe (espera 400)");
  {
    const fd = new FormData();
    fd.append("dados", JSON.stringify(dadosValidos()));
    fd.append("arquivo:socio.7.identidade", pdfFalso("x"), "x.pdf");
    const r = await fetch(`${BASE}/api/formulario`, { method: "POST", body: fd });
    const j = await r.json();
    ok("status 400", r.status === 400, `veio ${r.status}`);
    ok("code SLOT_DESCONHECIDO", j.code === "SLOT_DESCONHECIDO", j.code);
  }

  /* ---------------------------------------------------------------------- */
  console.log("\n6. Aceita envio completo (espera 201)");
  let recibo = null;
  {
    const r = await fetch(`${BASE}/api/formulario`, {
      method: "POST",
      body: corpoCompleto(dadosValidos()),
    });
    const j = await r.json();
    ok("status 201", r.status === 201, `veio ${r.status} :: ${JSON.stringify(j).slice(0, 300)}`);
    ok("protocolo no formato CZ-XXXXXX", /^CZ-[2-9A-HJ-NP-TV-Z]{6}$/.test(j.protocolo ?? ""), j.protocolo);
    ok("token com 32 hex", /^[a-f0-9]{32}$/.test(j.token ?? ""), j.token);
    ok("gravou os 2 documentos", j.documentos === 2, String(j.documentos));
    ok("devolveu a URL do recibo", j.url === `/formulario/recibo/${j.token}`, j.url);
    recibo = j;
  }

  /* ---------------------------------------------------------------------- */
  console.log("\n7. Protocolo é único entre dois envios");
  {
    const r = await fetch(`${BASE}/api/formulario`, {
      method: "POST",
      body: corpoCompleto(dadosValidos()),
    });
    const j = await r.json();
    ok("segundo envio aceito", r.status === 201, `veio ${r.status}`);
    ok("protocolo diferente do primeiro", j.protocolo !== recibo?.protocolo, `${j.protocolo} vs ${recibo?.protocolo}`);
    ok("token diferente do primeiro", j.token !== recibo?.token);
  }

  /* ---------------------------------------------------------------------- */
  console.log("\n8. Consulta pública pelo token");
  {
    const r = await fetch(`${BASE}/api/formulario/publico/${recibo.token}`);
    const j = await r.json();
    ok("status 200", r.status === 200, `veio ${r.status}`);
    ok("protocolo confere", j.formulario?.protocolo === recibo.protocolo);
    ok("situação nasce RECEBIDO", j.formulario?.situacao === "RECEBIDO", j.formulario?.situacao);
    ok("traz os 2 documentos", j.formulario?.documentos?.length === 2, String(j.formulario?.documentos?.length));
    ok(
      "documento tem o dono nomeado",
      j.formulario?.documentos?.[0]?.dono === "Maria Aparecida Silva",
      j.formulario?.documentos?.[0]?.dono
    );
    ok(
      "CPF gravado só com dígitos",
      j.formulario?.dados?.socios?.[0]?.cpf === "52998224725",
      j.formulario?.dados?.socios?.[0]?.cpf
    );
    ok(
      "endereço da empresa foi copiado do sócio",
      j.formulario?.dados?.enderecoEmpresa?.cep === "01001000",
      JSON.stringify(j.formulario?.dados?.enderecoEmpresa ?? {})
    );
    ok(
      "participação derivada é 100,0%",
      j.formulario?.dados?.socios?.[0]?.participacao === "100,0%",
      j.formulario?.dados?.socios?.[0]?.participacao
    );
    // O que a rota pública NÃO pode devolver.
    ok("não devolve id interno", j.formulario?.id === undefined);
    ok("não devolve observação interna", j.formulario?.observacaoInterna === undefined);
    ok("não devolve IP de origem", j.formulario?.ipOrigem === undefined);
    ok(
      "não devolve URL de download do documento",
      j.formulario?.documentos?.[0]?.url === undefined
    );
  }

  /* ---------------------------------------------------------------------- */
  console.log("\n9. Token inválido não vaza existência (espera 404)");
  {
    const r = await fetch(`${BASE}/api/formulario/publico/${"f".repeat(32)}`);
    ok("status 404", r.status === 404, `veio ${r.status}`);
  }

  /* ---------------------------------------------------------------------- */
  console.log("\n10. Rotas internas exigem sessão");
  {
    for (const [rota, nome] of [
      ["/api/formulario", "lista"],
      [`/api/formulario/qualquer-id`, "detalhe"],
      [`/api/formulario/documento/qualquer-id`, "download"],
    ]) {
      const r = await fetch(`${BASE}${rota}`);
      ok(`${nome} devolve 401`, r.status === 401, `veio ${r.status}`);
    }
  }

  /* ---------------------------------------------------------------------- */
  console.log("\n11. Não existe rota de exclusão");
  {
    for (const [rota, nome] of [
      [`/api/formulario/${recibo.token}`, "DELETE detalhe"],
      [`/api/formulario/documento/x`, "DELETE documento"],
      [`/api/formulario/publico/${recibo.token}`, "DELETE público"],
    ]) {
      const r = await fetch(`${BASE}${rota}`, { method: "DELETE" });
      // 405 (método não permitido) ou 401 do guard antes: nunca 200.
      ok(`${nome} não é 200`, r.status !== 200, `veio ${r.status}`);
    }
  }

  /* ---------------------------------------------------------------------- */
  console.log("\n12. Página de recibo responde");
  {
    const r = await fetch(`${BASE}/formulario/recibo/${recibo.token}`);
    const html = await r.text();
    ok("status 200", r.status === 200, `veio ${r.status}`);
    ok("tem noindex", /noindex/i.test(html));
    ok("usa a logo real", /logopng/.test(html));
  }

  console.log(`\n────────────────────────────\n${passou} passaram, ${falhou} falharam\n`);
  process.exit(falhou ? 1 : 0);
}

main().catch((e) => {
  console.error("erro no teste:", e);
  process.exit(1);
});
