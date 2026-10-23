/**
 * Teste das notificações de documento novo: conteúdo do aviso, e-mail, Brevo e
 * agrupamento do envio. Sem banco, servidor ou rede (o fetch do Brevo é falso).
 *
 *   npm run test:notificacoes
 *
 * Com `SALVAR_EMAIL=1` grava o HTML de exemplo em `tmp-email-notificacao.html`
 * para abrir no navegador e conferir o visual.
 */

// O cliente do Prisma é criado ao importar o despacho; sem URL ele reclama.
process.env.DATABASE_URL ??= "postgresql://teste:teste@127.0.0.1:5432/teste";

let falhas = 0;
let checks = 0;
const check = (nome: string, condicao: boolean, detalhe: unknown = "") => {
  checks += 1;
  if (condicao) console.log(`  ok   ${nome}`);
  else {
    falhas += 1;
    console.log(`  FALHA ${nome}${detalhe !== "" ? ` -> ${typeof detalhe === "string" ? detalhe : JSON.stringify(detalhe)}` : ""}`);
  }
};

type ChamadaFetch = { url: string; init: RequestInit };

/** fetch falso: devolve a resposta pedida e guarda o que recebeu. */
function fetchFalso(status: number, corpo: unknown, chamadas: ChamadaFetch[]): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} });
    return new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

async function erroDe(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
    return null;
  } catch (erro) {
    return erro;
  }
}

async function main() {
  const tipos = await import("../src/lib/notificacoes/tipos");
  const doc = await import("../src/lib/notificacoes/documento-novo");
  const email = await import("../src/lib/notificacoes/email-documentos");
  const brevo = await import("../src/lib/notificacoes/brevo");
  const despacho = await import("../src/lib/notificacoes/despacho");
  const navegacao = await import("../src/app/components/views/ui/notificacoes/navegacao");
  const { TIPO_NOTIFICACAO: T } = tipos;

  console.log("\nTipos");
  check("tipo conhecido tem rótulo", tipos.infoTipoNotificacao(T.DOCUMENTO_FOLHA).rotulo === "Folha e funcionários");
  check("tipo desconhecido não quebra", tipos.infoTipoNotificacao("XYZ").rotulo === "Avisos");
  check("tipo desconhecido não vai por e-mail", tipos.infoTipoNotificacao("XYZ").email === false);
  check("impostos vem antes de folha", tipos.TIPOS_NOTIFICACAO.DOCUMENTO_IMPOSTOS.ordem < tipos.TIPOS_NOTIFICACAO.DOCUMENTO_FOLHA.ordem);
  check("todos os tipos de documento são de documento", Object.values(T).every((tipo) => tipos.ehNotificacaoDeDocumento(tipo)));

  console.log("\nPastas e tipo do documento");
  check("pasta padrão perde número e caixa alta", doc.rotuloPasta("02. IMPOSTOS E OBRIGAÇÕES") === "Impostos e obrigações", doc.rotuloPasta("02. IMPOSTOS E OBRIGAÇÕES"));
  check("pasta de caixa mista fica igual", doc.rotuloPasta("Contratos 2026") === "Contratos 2026");
  check("pasta só com número fica igual", doc.rotuloPasta("2026") === "2026", doc.rotuloPasta("2026"));
  check("pasta '04) FOLHA' também perde o número", doc.rotuloPasta("04) FOLHA") === "Folha", doc.rotuloPasta("04) FOLHA"));

  const pastas = new Map([
    ["a", { id: "a", name: "A", parentId: "b" }],
    ["b", { id: "b", name: "B", parentId: "a" }],
  ]);
  check("caminho com ciclo termina", doc.caminhoDaPasta("a", pastas).length === 2);
  check("caminho sem pasta é vazio", doc.caminhoDaPasta(null, pastas).length === 0);

  check("impostos pelo nome da pasta", doc.tipoDoDocumento("CUSTOM", ["02. IMPOSTOS E OBRIGAÇÕES"]) === T.DOCUMENTO_IMPOSTOS);
  check("folha pelo nome da pasta", doc.tipoDoDocumento("CUSTOM", ["04. FOLHA E FUNCIONÁRIOS"]) === T.DOCUMENTO_FOLHA);
  check("faturamento pelo nome da pasta", doc.tipoDoDocumento("CUSTOM", ["03. FATURAMENTO E RELATÓRIOS"]) === T.DOCUMENTO_FATURAMENTO);
  check("institucional pelo nome da pasta", doc.tipoDoDocumento("CUSTOM", ["01. DOCUMENTOS INSTITUCIONAIS"]) === T.DOCUMENTO_INSTITUCIONAL);
  check("subpasta herda o tipo da raiz", doc.tipoDoDocumento("CUSTOM", ["04. FOLHA E FUNCIONÁRIOS", "Férias"]) === T.DOCUMENTO_FOLHA);
  check("categoria antiga decide", doc.tipoDoDocumento("02_IMPOSTOS", []) === T.DOCUMENTO_IMPOSTOS);
  check("pasta avulsa é 'outros'", doc.tipoDoDocumento(null, ["Diversos"]) === T.DOCUMENTO_GERAL);

  console.log("\nCompetência, tamanho e formato");
  check("competência com mês", doc.competenciaDoSubFolder("2026/09 - Setembro") === "setembro de 2026");
  check("competência com loja", doc.competenciaDoSubFolder("2026/03 - Março/lojas") === "março de 2026");
  check("competência só com ano", doc.competenciaDoSubFolder("2026") === "2026");
  check("subpasta que não é período", doc.competenciaDoSubFolder("lojas") === null);
  check("sem subpasta", doc.competenciaDoSubFolder(null) === null);
  check("tamanho em KB com vírgula", doc.tamanhoLegivel(1536) === "1,5 KB", doc.tamanhoLegivel(1536));
  check("tamanho em MB com vírgula", doc.tamanhoLegivel(1_468_006) === "1,4 MB", doc.tamanhoLegivel(1_468_006));
  check("tamanho inválido some", doc.tamanhoLegivel(Number.NaN) === "");
  check("formato PDF", doc.formatoDoArquivo("guia.pdf", "application/pdf") === "PDF");
  check("formato imagem", doc.formatoDoArquivo("foto.PNG", "image/png") === "IMG");
  check("formato pela extensão", doc.formatoDoArquivo("folha.xlsx", "application/octet-stream") === "XLSX");
  check("sem extensão vira DOC", doc.formatoDoArquivo("contrato", "") === "DOC");

  console.log("\nNotificação montada");
  const pastasDoCliente = [
    { id: "imp", name: "02. IMPOSTOS E OBRIGAÇÕES", parentId: null },
    { id: "fol", name: "04. FOLHA E FUNCIONÁRIOS", parentId: null },
    { id: "fer", name: "Férias", parentId: "fol" },
  ];
  const guia = doc.montarNotificacaoDocumento({
    documento: {
      id: "doc 1",
      originalName: " Guia DAS - Setembro.pdf ",
      mimeType: "application/pdf",
      sizeBytes: 250_000,
      category: "CUSTOM",
      subFolder: "2026/09 - Setembro",
      folderId: "imp",
    },
    pastas: pastasDoCliente,
  });
  check("guia é de impostos", guia.tipo === T.DOCUMENTO_IMPOSTOS);
  check("título de impostos", guia.titulo === "Novo documento de impostos e obrigações", guia.titulo);
  check("mensagem com competência", guia.mensagem === "Guia DAS - Setembro.pdf · competência setembro de 2026", guia.mensagem);
  check("link codifica o id", guia.link === "/documentos?documento=doc%201", guia.link);
  check("pasta legível", guia.dados.pasta === "Impostos e obrigações", guia.dados.pasta);
  check("nome sem espaços nas pontas", guia.dados.nomeArquivo === "Guia DAS - Setembro.pdf");

  const ferias = doc.montarNotificacaoDocumento({
    documento: {
      id: "doc2",
      originalName: "Recibo de férias.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1000,
      category: "CUSTOM",
      subFolder: null,
      folderId: "fer",
    },
    pastas: pastasDoCliente,
  });
  check("subpasta de folha é folha", ferias.tipo === T.DOCUMENTO_FOLHA);
  check("título cita a pasta raiz", ferias.titulo === "Novo documento em Folha e funcionários", ferias.titulo);
  check("caminho completo nos dados", ferias.dados.pasta === "Folha e funcionários › Férias", ferias.dados.pasta);
  check("sem competência fora de impostos", ferias.dados.competencia === null);

  const solto = doc.montarNotificacaoDocumento({
    documento: { id: "doc3", originalName: "", mimeType: "", sizeBytes: 0, category: null, subFolder: null, folderId: null },
    pastas: [],
  });
  check("sem nome vira 'Documento'", solto.dados.nomeArquivo === "Documento");
  check("sem pasta: título genérico", solto.titulo === "Novo documento disponível", solto.titulo);
  check("sem pasta: rótulo do tipo", solto.dados.pasta === "Outros documentos", solto.dados.pasta);

  console.log("\nE-mail: textos");
  check(
    "escapa HTML",
    email.escaparHtml(`<b onclick="x">'&'</b>`) === "&lt;b onclick=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/b&gt;",
    email.escaparHtml(`<b onclick="x">'&'</b>`),
  );
  check("nome em caixa alta", email.primeiroNome("GIANLUCCA FLORENCE") === "Gianlucca", email.primeiroNome("GIANLUCCA FLORENCE"));
  check("nome em minúscula", email.primeiroNome("joão da silva") === "João", email.primeiroNome("joão da silva"));
  check("nome em caixa mista fica", email.primeiroNome("McArthur Silva") === "McArthur");
  check("e-mail no lugar do nome", email.primeiroNome("cliente@empresa.com") === "");
  check("nome vazio", email.primeiroNome("   ") === "");

  const item = (nome: string, tipo: string = T.DOCUMENTO_IMPOSTOS, n = 1) => ({
    tipo,
    nomeArquivo: nome,
    pasta: "Impostos e obrigações",
    competencia: tipo === T.DOCUMENTO_IMPOSTOS ? "setembro de 2026" : null,
    formato: "PDF",
    tamanho: "245,1 KB",
    link: `https://app.contazoom.com.br/documentos?documento=d${n}`,
  });
  check("assunto de um imposto", email.assuntoDoEmail([item("Guia DAS.pdf")]) === "Novo documento de impostos: Guia DAS.pdf", email.assuntoDoEmail([item("Guia DAS.pdf")]));
  check(
    "assunto de um documento qualquer",
    email.assuntoDoEmail([item("Contrato.pdf", T.DOCUMENTO_INSTITUCIONAL)]) === "Novo documento no seu painel: Contrato.pdf",
  );
  check("assunto de vários impostos", email.assuntoDoEmail([item("a"), item("b")]) === "2 novos documentos de impostos no seu painel");
  check(
    "assunto de vários tipos",
    email.assuntoDoEmail([item("a"), item("b", T.DOCUMENTO_FOLHA)]) === "2 novos documentos no seu painel ContaZoom",
  );
  const nomeLongo = "Relatório ".repeat(20);
  check("assunto não cresce sem limite", email.assuntoDoEmail([item(nomeLongo)]).length <= 90, email.assuntoDoEmail([item(nomeLongo)]).length);

  console.log("\nE-mail: um documento");
  const base = {
    nomeCliente: "MARIA SOUZA",
    urlDocumentos: "https://app.contazoom.com.br/documentos",
    urlPainel: "https://app.contazoom.com.br",
    urlLogo: "https://app.contazoom.com.br/email/contazoom-logo.png",
    urlIcones: {
      pdf: "https://app.contazoom.com.br/email/icone-pdf.png",
      arquivo: "https://app.contazoom.com.br/email/icone-arquivo.png",
    },
    whatsapp: { exibicao: "(11) 92740-5138", link: "https://wa.me/5511927405138?text=Ol%C3%A1" },
  };
  const um = email.montarEmailDocumentos({ ...base, itens: [item("Guia <DAS> & \"setembro\".pdf")] });
  check("saudação pelo primeiro nome", um.html.includes(">Olá, Maria,</p>") && um.texto.startsWith("Olá, Maria,\n"));
  check("frase no singular", um.html.includes("Enviamos um documento novo para o seu painel."));
  check("nome do arquivo escapado", um.html.includes("Guia &lt;DAS&gt; &amp; &quot;setembro&quot;.pdf") && !um.html.includes("<DAS>"));
  check("botão abre o documento", um.html.includes(">Abrir documento</a>") && um.html.includes('href="https://app.contazoom.com.br/documentos?documento=d1"'));
  check("detalhe com tipo e competência", um.html.includes(">Impostos e obrigações · competência setembro de 2026 · 245,1 KB</span>"));
  check("ícone do PDF em PNG", um.html.includes('src="https://app.contazoom.com.br/email/icone-pdf.png"') && um.html.includes('alt="PDF"'));
  check("nada de SVG no e-mail", !/<svg|\.svg/i.test(um.html));
  check("fonte do site primeiro, Montserrat depois", um.html.includes("'Plus Jakarta Sans',Montserrat,") && um.html.includes("family=Plus+Jakarta+Sans"));
  check("logotipo com texto alternativo", um.html.includes('src="https://app.contazoom.com.br/email/contazoom-logo.png"') && um.html.includes('alt="ContaZoom"'));
  check("ajuda pelo WhatsApp", um.html.includes("(11) 92740-5138") && um.texto.includes("https://wa.me/5511927405138"));
  check("assinatura da equipe", um.html.includes("Equipe ContaZoom") && um.texto.includes("Um abraço,\nEquipe ContaZoom"));
  check("aviso de segurança sem anexo", um.html.includes("não vão anexados") && um.texto.includes("não vão anexados"));
  check("sem selo nem faixa de modelo pronto", !um.html.includes("Documento novo<") && !um.html.includes("&rarr;"));
  check("pré-cabeçalho no singular", um.preheader.endsWith("já está no seu painel."), um.preheader);
  check("texto puro sem HTML", !/<[a-z]/i.test(um.texto.replace("<DAS>", "")), um.texto.slice(0, 120));
  check("HTML com idioma e charset", um.html.includes('<html lang="pt-BR"') && um.html.includes('<meta charset="utf-8">'));

  console.log("\nE-mail: vários documentos");
  const dez = Array.from({ length: 10 }, (_, i) => item(`Documento ${i + 1}.pdf`, i % 2 ? T.DOCUMENTO_FOLHA : T.DOCUMENTO_IMPOSTOS, i + 1));
  const varios = email.montarEmailDocumentos({ ...base, nomeCliente: "", itens: dez, whatsapp: null, urlLogo: null, urlIcones: null });
  check("saudação sem nome", varios.html.includes(">Olá,</p>") && varios.texto.startsWith("Olá,\n"));
  check("frase no plural", varios.html.includes("Enviamos 10 documentos novos para o seu painel."));
  check("botão vai para a central", varios.html.includes('href="https://app.contazoom.com.br/documentos"') && varios.html.includes(">Ver documentos</a>"));
  check(`lista no máximo ${email.MAXIMO_ITENS_NO_EMAIL}`, varios.html.includes("Documento 8.pdf") && !varios.html.includes("Documento 9.pdf"));
  check("resto vira 'e mais'", varios.html.includes("E mais 2 documentos no painel.") && varios.texto.includes("E mais 2 documentos no painel."));
  check("sem imagens: nome em texto e lista sem ícone", !varios.html.includes("<img") && varios.html.includes(">ContaZoom</span>"));
  check("sem WhatsApp não cita WhatsApp", !varios.html.includes("WhatsApp") && !varios.texto.includes("WhatsApp"));
  check("pré-cabeçalho no plural", varios.preheader === "Documento 1.pdf e mais 9 documentos já estão no seu painel.", varios.preheader);
  const dois = email.montarEmailDocumentos({ ...base, itens: [item("a.pdf"), item("b.pdf", T.DOCUMENTO_FOLHA, 2)] });
  check("pré-cabeçalho com 'mais 1 documento'", dois.preheader.includes("e mais 1 documento já estão"), dois.preheader);
  const planilha = email.montarEmailDocumentos({
    ...base,
    itens: [{ ...item("Faturamento.xlsx", T.DOCUMENTO_FATURAMENTO, 5), pasta: "Faturamento e relatórios", formato: "XLSX" }],
  });
  check("arquivo que não é PDF usa o ícone genérico", planilha.html.includes("icone-arquivo.png") && planilha.html.includes('alt="XLSX"'));
  check("formato aparece quando não é PDF", planilha.html.includes(">Faturamento e relatórios · XLSX · 245,1 KB</span>"));
  check("pasta igual ao tipo não se repete", email.localSemRepetirTipo("Folha e funcionários", "Folha e funcionários") === null);
  check(
    "subpasta sem repetir o tipo",
    email.localSemRepetirTipo("Folha e funcionários › Férias", "Folha e funcionários") === "Férias",
    email.localSemRepetirTipo("Folha e funcionários › Férias", "Folha e funcionários"),
  );
  check("pasta avulsa fica", email.localSemRepetirTipo("Diversos", "Outros documentos") === "Diversos");
  const daFolha = email.montarEmailDocumentos({
    ...base,
    itens: [{ ...item("Holerite.pdf", T.DOCUMENTO_FOLHA, 4), pasta: "Folha e funcionários" }],
  });
  check(
    "pasta igual ao tipo some do detalhe",
    daFolha.html.includes(">Folha e funcionários · 245,1 KB</span>") && !daFolha.html.includes("Folha e funcionários · Folha"),
  );
  check("sem documentos é erro", (() => {
    try {
      email.montarEmailDocumentos({ ...base, itens: [] });
      return false;
    } catch {
      return true;
    }
  })());

  console.log("\nBrevo: configuração");
  check("sem chave não configura", brevo.configBrevo({}) === null);
  check("motivo: falta a chave", brevo.motivoConfigBrevoAusente({}) === "BREVO_API_KEY não configurada");
  check("motivo: falta o remetente", brevo.motivoConfigBrevoAusente({ BREVO_API_KEY: "k" }) === "BREVO_SENDER_EMAIL não configurado");
  check(
    "motivo: remetente inválido",
    brevo.motivoConfigBrevoAusente({ BREVO_API_KEY: "k", BREVO_SENDER_EMAIL: "avisos" }) === "BREVO_SENDER_EMAIL inválido",
  );
  check("remetente inválido não configura", brevo.configBrevo({ BREVO_API_KEY: "k", BREVO_SENDER_EMAIL: "avisos" }) === null);
  const config = brevo.configBrevo({ BREVO_API_KEY: " chave ", BREVO_SENDER_EMAIL: "avisos@contazoom.com.br" });
  check("configuração mínima", config?.apiKey === "chave" && config.remetente.nome === "ContaZoom" && config.sandbox === false);
  check("URL padrão da API", config?.apiUrl === "https://api.brevo.com/v3");
  check("sem responder-para", config?.responderPara === null);
  const completa = brevo.configBrevo({
    BREVO_API_KEY: "k",
    BREVO_SENDER_EMAIL: "avisos@contazoom.com.br",
    BREVO_SENDER_NAME: "Equipe ContaZoom",
    BREVO_REPLY_TO: "contato@contazoom.com.br",
    BREVO_SANDBOX: "1",
    BREVO_API_URL: "https://api.exemplo.com/v3/",
  });
  check("configuração completa", completa?.remetente.nome === "Equipe ContaZoom" && completa.responderPara === "contato@contazoom.com.br" && completa.sandbox);
  check("URL própria sem barra no fim", completa?.apiUrl === "https://api.exemplo.com/v3");

  console.log("\nBrevo: envio");
  const chamadas: ChamadaFetch[] = [];
  const enviado = await brevo.enviarEmailBrevo(
    completa!,
    {
      para: { email: "maria@empresa.com", nome: "M".repeat(90) },
      assunto: "Assunto",
      html: "<p>Oi</p>",
      texto: "Oi",
      tags: ["notificacao"],
      chaveIdempotencia: "chave-1",
    },
    fetchFalso(201, { messageId: "<abc@smtp-relay.mailin.fr>" }, chamadas),
  );
  const pedido = chamadas[0];
  const cabecalhos = (pedido?.init.headers ?? {}) as Record<string, string>;
  const corpo = JSON.parse(String(pedido?.init.body ?? "{}"));
  check("devolve o messageId", enviado.messageId === "<abc@smtp-relay.mailin.fr>");
  check("POST no endpoint de e-mail", pedido?.url === "https://api.exemplo.com/v3/smtp/email" && pedido.init.method === "POST", pedido?.url);
  check("chave no cabeçalho api-key", cabecalhos["api-key"] === "k" && cabecalhos["content-type"] === "application/json");
  check("remetente e destinatário", corpo.sender?.email === "avisos@contazoom.com.br" && corpo.to?.[0]?.email === "maria@empresa.com");
  check("nome do destinatário cortado em 70", corpo.to?.[0]?.name?.length === 70, corpo.to?.[0]?.name?.length);
  check("assunto, HTML e texto", corpo.subject === "Assunto" && corpo.htmlContent === "<p>Oi</p>" && corpo.textContent === "Oi");
  check("responder-para", corpo.replyTo?.email === "contato@contazoom.com.br");
  check("chave de idempotência e sandbox", corpo.headers?.IdempotencyKey === "chave-1" && corpo.headers?.["X-Sib-Sandbox"] === "drop", corpo.headers);
  check("tags", Array.isArray(corpo.tags) && corpo.tags[0] === "notificacao");

  const semExtras: ChamadaFetch[] = [];
  await brevo.enviarEmailBrevo(config!, { para: { email: "a@b.com" }, assunto: "x", html: "x", texto: "x" }, fetchFalso(201, {}, semExtras));
  const corpoSimples = JSON.parse(String(semExtras[0]?.init.body ?? "{}"));
  check("sem nome, sem cabeçalhos extras", !("name" in (corpoSimples.to?.[0] ?? {})) && !("headers" in corpoSimples) && !("replyTo" in corpoSimples));

  const recusado = await erroDe(
    brevo.enviarEmailBrevo(config!, { para: { email: "a@b.com" }, assunto: "x", html: "x", texto: "x" }, fetchFalso(400, { code: "invalid_parameter", message: "sender is invalid" }, [])),
  );
  check("400 vira ErroBrevo", recusado instanceof brevo.ErroBrevo);
  check("400 não é retentável", recusado instanceof brevo.ErroBrevo && !recusado.retentavel && recusado.status === 400 && recusado.codigo === "invalid_parameter");
  check("mensagem do Brevo no erro", recusado instanceof Error && recusado.message.includes("sender is invalid"));

  const limite = await erroDe(
    brevo.enviarEmailBrevo(config!, { para: { email: "a@b.com" }, assunto: "x", html: "x", texto: "x" }, fetchFalso(429, "Too Many Requests", [])),
  );
  check("429 é retentável", limite instanceof brevo.ErroBrevo && limite.retentavel && limite.status === 429);
  const fora = await erroDe(
    brevo.enviarEmailBrevo(config!, { para: { email: "a@b.com" }, assunto: "x", html: "x", texto: "x" }, fetchFalso(503, "", [])),
  );
  check("5xx é retentável", fora instanceof brevo.ErroBrevo && fora.retentavel);
  const semRede = await erroDe(
    brevo.enviarEmailBrevo(config!, { para: { email: "a@b.com" }, assunto: "x", html: "x", texto: "x" }, (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch),
  );
  check("sem rede é retentável", semRede instanceof brevo.ErroBrevo && semRede.retentavel && semRede.status === 0);

  console.log("\nDespacho: agrupamento e reenvio");
  const agora = new Date("2026-09-30T12:00:00Z");
  const minuto = 60_000;
  const lote = (maisAntiga: Date | null) => despacho.horarioDoLote(agora, maisAntiga, 90_000, 10 * minuto).getTime() - agora.getTime();
  check("primeiro documento espera 90 s", lote(null) === 90_000, lote(null));
  check("documento seguinte empurra o lote", lote(new Date(agora.getTime() - minuto)) === 90_000);
  check("teto de 10 min desde a mais antiga", lote(new Date(agora.getTime() - 9 * minuto)) === minuto, lote(new Date(agora.getTime() - 9 * minuto)));
  check("teto vencido sai agora", lote(new Date(agora.getTime() - 20 * minuto)) === 0);
  check("reenvio 1: 1 min", despacho.esperaDoReenvio(1) === minuto);
  check("reenvio 2: 5 min", despacho.esperaDoReenvio(2) === 5 * minuto);
  check("reenvio 3: 15 min", despacho.esperaDoReenvio(3) === 15 * minuto);
  check("reenvio 4 em diante: 1 h", despacho.esperaDoReenvio(4) === 60 * minuto && despacho.esperaDoReenvio(9) === 60 * minuto);
  check("reenvio 0 não quebra", despacho.esperaDoReenvio(0) === minuto);
  check("chave não depende da ordem", despacho.chaveDoEnvio(["b", "a"]) === despacho.chaveDoEnvio(["a", "b"]));
  check("chave muda com o conjunto", despacho.chaveDoEnvio(["a"]) !== despacho.chaveDoEnvio(["a", "b"]));
  check("chave com 40 caracteres", despacho.chaveDoEnvio(["a"]).length === 40);

  console.log("\nDespacho: e-mail do lote");
  const appUrlAntes = process.env.APP_URL;
  process.env.APP_URL = "https://painel.exemplo.com/";
  check("URL do painel sem barra no fim", despacho.urlDoPainel() === "https://painel.exemplo.com");
  const doLote = despacho.montarEmailParaLote("ANA", [
    { id: "n1", tipo: T.DOCUMENTO_IMPOSTOS, link: "/documentos?documento=d1", dados: guia.dados },
    { id: "n2", tipo: T.DOCUMENTO_FOLHA, link: "https://golpe.com/x", dados: ferias.dados },
    { id: "n3", tipo: T.DOCUMENTO_GERAL, link: "//golpe.com", dados: null },
  ]);
  check("link interno vira absoluto", doLote.html.includes('href="https://painel.exemplo.com/documentos?documento=d1"'));
  check("link de fora não entra no e-mail", !doLote.html.includes("golpe.com") && !doLote.texto.includes("golpe.com"));
  check("logotipo do próprio painel", doLote.html.includes('src="https://painel.exemplo.com/email/contazoom-logo.png"'));
  check(
    "ícones do próprio painel",
    doLote.html.includes('src="https://painel.exemplo.com/email/icone-pdf.png"') &&
      doLote.html.includes('src="https://painel.exemplo.com/email/icone-arquivo.png"'),
  );
  check("WhatsApp com mensagem de cliente", doLote.texto.includes("https://wa.me/5511927405138?text=") && doLote.texto.includes("Sou%20cliente"));
  check("dado faltando vira 'Documento'", doLote.html.includes(">Documento</a>"));
  check("tamanho legível no cartão", doLote.html.includes("244,1 KB"), "esperava 244,1 KB");
  check(
    "subpasta no detalhe sem repetir o tipo",
    doLote.html.includes(">Folha e funcionários · Férias · 1000 B</span>") && !doLote.html.includes("Folha e funcionários › Férias"),
  );
  check("texto puro sem repetir o tipo", doLote.texto.includes("Folha e funcionários · Férias") && !doLote.texto.includes("› Férias"));
  if (appUrlAntes === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = appUrlAntes;

  console.log("\nNavegação do sino");
  check("documento do link", navegacao.documentoDoLink("/documentos?documento=abc") === "abc");
  check("link de outra tela", navegacao.documentoDoLink("/dashboard?documento=abc") === null);
  check("link vazio", navegacao.documentoDoLink(null) === null);
  check("link sem documento", navegacao.documentoDoLink("/documentos") === null);

  if (process.env.SALVAR_EMAIL === "1") {
    const { writeFileSync } = await import("fs");
    const exemplo = email.montarEmailDocumentos({
      ...base,
      itens: [
        { ...item("Guia DAS - Setembro 2026.pdf"), tamanho: "245,1 KB" },
        { ...item("Folha de pagamento - Setembro.pdf", T.DOCUMENTO_FOLHA, 2), pasta: "Folha e funcionários", tamanho: "1,2 MB" },
        { ...item("Contrato social consolidado.pdf", T.DOCUMENTO_INSTITUCIONAL, 3), pasta: "Documentos institucionais", tamanho: "820,4 KB" },
        { ...item("Relatório de vendas - Setembro.xlsx", T.DOCUMENTO_FATURAMENTO, 4), pasta: "Faturamento e relatórios", formato: "XLSX", tamanho: "96,0 KB" },
      ],
    });
    writeFileSync("tmp-email-notificacao.html", exemplo.html, "utf8");
    writeFileSync("tmp-email-notificacao-1.html", um.html, "utf8");
    console.log("\n  HTML de exemplo salvo em tmp-email-notificacao.html e tmp-email-notificacao-1.html");
  }

  console.log(`\n${falhas === 0 ? `TUDO OK — ${checks} checks` : `${falhas} FALHA(S) em ${checks} checks`}`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => {
    // O despacho não arma temporizador ao ser importado, mas o cliente do
    // Prisma pode segurar o processo; o teste não usa banco.
    setTimeout(() => process.exit(process.exitCode ?? 0), 50).unref();
  });

// Módulo, e não script solto: sem isto `falhas` e `main` viram globais do
// projeto e colidem com os de outros scripts no `tsc`.
export {};
