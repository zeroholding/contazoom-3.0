/**
 * E-mail de "documentos novos" — HTML e texto, sem dependência nenhuma.
 *
 * Feito para cliente de e-mail, não para navegador: layout em tabela, estilo
 * inline, largura de 600px e nenhum recurso que o Outlook ou o Gmail descartem
 * (SVG, flex, variável CSS). O que não for suportado degrada para algo legível:
 * sem imagem, o logotipo vira o texto "ContaZoom" em laranja; sem CSS de mídia,
 * o cartão só fica mais apertado no celular.
 *
 * Os arquivos NÃO vão anexados: guia de imposto e folha têm dado sensível, e o
 * painel exige login. O e-mail só avisa e leva até lá.
 */

import { TIPO_NOTIFICACAO, infoTipoNotificacao } from "./tipos";

export type ItemEmailDocumento = {
  tipo: string;
  nomeArquivo: string;
  pasta: string | null;
  competencia: string | null;
  formato: string;
  tamanho: string;
  /** URL absoluta que abre o documento no painel. */
  link: string;
};

export type EntradaEmailDocumentos = {
  nomeCliente: string;
  itens: ItemEmailDocumento[];
  /** URL absoluta da central de documentos. */
  urlDocumentos: string;
  /** URL absoluta do painel (rodapé). */
  urlPainel: string;
  /** URL absoluta do logotipo em PNG. Sem ela, o cabeçalho usa o nome em texto. */
  urlLogo?: string | null;
  whatsapp?: { exibicao: string; link: string } | null;
};

export type EmailMontado = {
  assunto: string;
  preheader: string;
  html: string;
  texto: string;
};

/** Quantos documentos aparecem por extenso; o resto vira "e mais N". */
export const MAXIMO_ITENS_NO_EMAIL = 8;

const COR = {
  marca: "#F26212",
  marcaForte: "#D9500A",
  marcaSuave: "#FFF2E9",
  texto: "#14161B",
  textoMedio: "#4B5563",
  textoSuave: "#6B7280",
  textoFraco: "#9AA1AC",
  fio: "#EDEFF3",
  fundo: "#F4F5F7",
  fundoCartao: "#F8F9FB",
};

/** Cor do selo de cada tipo: a mesma família de cor do sino no painel. */
const COR_TIPO: Record<string, { fundo: string; tinta: string }> = {
  [TIPO_NOTIFICACAO.DOCUMENTO_IMPOSTOS]: { fundo: "#FEF3C7", tinta: "#B45309" },
  [TIPO_NOTIFICACAO.DOCUMENTO_FOLHA]: { fundo: "#E0F2FE", tinta: "#0369A1" },
  [TIPO_NOTIFICACAO.DOCUMENTO_FATURAMENTO]: { fundo: "#D1FAE5", tinta: "#047857" },
  [TIPO_NOTIFICACAO.DOCUMENTO_INSTITUCIONAL]: { fundo: "#EDE9FE", tinta: "#6D28D9" },
};
const COR_TIPO_PADRAO = { fundo: COR.marcaSuave, tinta: COR.marcaForte };

const FONTE =
  "'Plus Jakarta Sans','Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Assunto e pré-cabeçalho não podem crescer sem limite: o cliente corta feio. */
function encurtar(texto: string, maximo: number): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > maximo ? `${limpo.slice(0, maximo - 1).trimEnd()}…` : limpo;
}

/**
 * Primeiro nome para a saudação: "GIANLUCCA FLORENCE" → "Gianlucca".
 *
 * Nome cadastrado todo em caixa alta vira "Olá, GIANLUCCA!", que no e-mail soa
 * como grito, e todo em minúscula ("maria") parece descuido; os dois saem com a
 * inicial maiúscula. Caixa mista ("McArthur") é escolha de quem cadastrou e
 * fica como está. Nome de empresa ("Loja X Ltda") sai "Loja", o que ainda lê
 * bem numa saudação.
 */
export function primeiroNome(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  if (!primeiro || primeiro.includes("@")) return "";
  const temMinuscula = /[a-zà-ÿ]/.test(primeiro);
  const temMaiuscula = /[A-ZÀ-Þ]/.test(primeiro);
  if (temMinuscula && temMaiuscula) return primeiro;
  const minusculo = primeiro.toLocaleLowerCase("pt-BR");
  return minusculo.charAt(0).toLocaleUpperCase("pt-BR") + minusculo.slice(1);
}

export function assuntoDoEmail(itens: ItemEmailDocumento[]): string {
  const total = itens.length;
  const todosDeImpostos = total > 0 && itens.every((item) => item.tipo === TIPO_NOTIFICACAO.DOCUMENTO_IMPOSTOS);
  if (total === 1) {
    const nome = encurtar(itens[0].nomeArquivo, 60);
    return todosDeImpostos ? `Novo documento de impostos: ${nome}` : `Novo documento no seu painel: ${nome}`;
  }
  return todosDeImpostos
    ? `${total} novos documentos de impostos no seu painel`
    : `${total} novos documentos no seu painel ContaZoom`;
}

/**
 * Onde o documento está, sem repetir o selo do tipo logo acima: sob "Folha e
 * funcionários", a pasta "Folha e funcionários" não diz nada e
 * "Folha e funcionários › Férias" vira só "Férias".
 */
export function localSemRepetirTipo(pasta: string | null, rotuloTipo: string): string | null {
  if (!pasta) return null;
  const normalizar = (texto: string) => texto.trim().toLocaleLowerCase("pt-BR");
  if (normalizar(pasta) === normalizar(rotuloTipo)) return null;
  const prefixo = `${rotuloTipo} › `;
  return normalizar(pasta).startsWith(normalizar(prefixo)) ? pasta.trim().slice(prefixo.length) : pasta;
}

function metaDoItem(item: ItemEmailDocumento): string {
  const partes: string[] = [];
  if (item.competencia) partes.push(`Competência ${item.competencia}`);
  else {
    const local = localSemRepetirTipo(item.pasta, infoTipoNotificacao(item.tipo).rotulo);
    if (local) partes.push(local);
  }
  partes.push(item.formato);
  if (item.tamanho) partes.push(item.tamanho);
  return partes.join(" · ");
}

function htmlDoItem(item: ItemEmailDocumento): string {
  const cor = COR_TIPO[item.tipo] ?? COR_TIPO_PADRAO;
  const rotuloTipo = infoTipoNotificacao(item.tipo).rotulo;
  const link = escaparHtml(item.link);
  // No celular a coluna "Abrir ›" da direita espremia o nome do arquivo; lá ela
  // some e o mesmo link aparece embaixo do cartão (ver o @media do <head>).
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid ${COR.fio};border-radius:12px;margin:0 0 12px;">
  <tr>
    <td width="60" valign="top" class="cz-cartao-icone" style="padding:16px 0 16px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="44" height="44" align="center" valign="middle" bgcolor="${cor.fundo}" style="width:44px;height:44px;border-radius:10px;background:${cor.fundo};color:${cor.tinta};font-family:${FONTE};font-size:11px;font-weight:800;letter-spacing:0.02em;">${escaparHtml(item.formato)}</td>
      </tr></table>
    </td>
    <td valign="top" class="cz-cartao-texto" style="padding:15px 16px 15px 14px;font-family:${FONTE};">
      <p style="margin:0 0 4px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${cor.tinta};">${escaparHtml(rotuloTipo)}</p>
      <p style="margin:0 0 4px;font-size:15px;line-height:22px;font-weight:700;color:${COR.texto};word-break:break-word;"><a href="${link}" style="color:${COR.texto};text-decoration:none;">${escaparHtml(item.nomeArquivo)}</a></p>
      <p style="margin:0;font-size:13px;line-height:20px;color:${COR.textoSuave};">${escaparHtml(metaDoItem(item))}</p>
      <!--[if !mso]><!--><p class="cz-so-celular" style="display:none;max-height:0;overflow:hidden;margin:0;font-size:13px;line-height:20px;font-weight:700;"><a href="${link}" style="color:${COR.marcaForte};text-decoration:none;">Abrir documento&nbsp;&rsaquo;</a></p><!--<![endif]-->
    </td>
    <td width="72" align="right" valign="middle" class="cz-so-computador" style="padding:0 16px 0 0;font-family:${FONTE};">
      <a href="${link}" style="font-size:13px;font-weight:700;color:${COR.marcaForte};text-decoration:none;white-space:nowrap;">Abrir&nbsp;&rsaquo;</a>
    </td>
  </tr>
</table>`;
}

export function montarEmailDocumentos(entrada: EntradaEmailDocumentos): EmailMontado {
  const itens = entrada.itens;
  const total = itens.length;
  if (total === 0) throw new Error("E-mail de documentos sem nenhum documento.");

  const nome = primeiroNome(entrada.nomeCliente);
  const saudacao = nome ? `Olá, ${nome}!` : "Olá!";
  const titulo =
    total === 1 ? "Chegou um documento novo para você" : `Chegaram ${total} documentos novos para você`;
  const introducao =
    total === 1
      ? "A equipe ContaZoom adicionou o arquivo abaixo à sua central de documentos. Ele já está disponível no seu painel."
      : "A equipe ContaZoom adicionou os arquivos abaixo à sua central de documentos. Eles já estão disponíveis no seu painel, organizados por pasta.";

  const assunto = assuntoDoEmail(itens);
  const restantes = total - 1;
  const preheader =
    total === 1
      ? `${encurtar(itens[0].nomeArquivo, 70)} já está disponível no seu painel ContaZoom.`
      : `${encurtar(itens[0].nomeArquivo, 50)} e mais ${restantes} ${restantes === 1 ? "documento" : "documentos"} já estão no seu painel.`;

  const visiveis = itens.slice(0, MAXIMO_ITENS_NO_EMAIL);
  const ocultos = total - visiveis.length;
  const urlBotao = total === 1 ? itens[0].link : entrada.urlDocumentos;
  const textoBotao = total === 1 ? "Abrir o documento" : "Abrir meus documentos";

  const logo = entrada.urlLogo
    ? `<img src="${escaparHtml(entrada.urlLogo)}" width="152" alt="ContaZoom" style="display:block;width:152px;max-width:152px;height:auto;border:0;outline:none;text-decoration:none;font-family:${FONTE};font-size:24px;font-weight:800;color:${COR.marca};">`
    : `<span style="font-family:${FONTE};font-size:24px;font-weight:800;letter-spacing:-0.02em;color:${COR.marca};">ContaZoom</span>`;

  const ajuda = entrada.whatsapp
    ? `Precisa de ajuda? Fale com a gente no WhatsApp <a href="${escaparHtml(entrada.whatsapp.link)}" style="color:${COR.textoSuave};font-weight:700;text-decoration:none;white-space:nowrap;">${escaparHtml(entrada.whatsapp.exibicao)}</a>.<br>`
    : "";

  // Caracteres invisíveis depois do pré-cabeçalho: sem eles o Gmail completa a
  // prévia com o começo do corpo ("Olá, Maria! Chegou...") e repete o assunto.
  const preenchimento = "&#8199;&#65279;&#847;".repeat(40);

  const html = `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escaparHtml(assunto)}</title>
<!--[if !mso]><!-->
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<!--<![endif]-->
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { -ms-interpolation-mode:bicubic; }
  @media only screen and (max-width: 620px) {
    .cz-largura { width:100% !important; }
    .cz-margem { padding-left:22px !important; padding-right:22px !important; }
    .cz-titulo { font-size:22px !important; line-height:30px !important; }
    .cz-botao { width:100% !important; }
    .cz-botao a { display:block !important; text-align:center !important; }
    .cz-cartao-icone { padding:14px 0 14px 14px !important; }
    .cz-cartao-texto { padding:13px 14px 14px 12px !important; }
    .cz-so-computador { display:none !important; }
    .cz-so-celular { display:block !important; max-height:none !important; overflow:visible !important; margin-top:8px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COR.fundo};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escaparHtml(preheader)}${preenchimento}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COR.fundo}" style="background:${COR.fundo};">
  <tr>
    <td align="center" style="padding:32px 12px 40px;">
      <table role="presentation" class="cz-largura" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr>
          <td style="padding:0 6px 20px;" align="left">${logo}</td>
        </tr>
        <tr>
          <td bgcolor="#FFFFFF" style="background:#FFFFFF;border:1px solid ${COR.fio};border-radius:16px;overflow:hidden;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td height="5" bgcolor="${COR.marca}" style="height:5px;background:${COR.marca};font-size:0;line-height:0;border-radius:16px 16px 0 0;">&nbsp;</td>
              </tr>
              <tr>
                <td class="cz-margem" style="padding:34px 40px 6px;font-family:${FONTE};">
                  <p style="margin:0 0 14px;"><span style="display:inline-block;padding:5px 11px;border-radius:999px;background:${COR.marcaSuave};color:${COR.marcaForte};font-size:11px;line-height:14px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">${total === 1 ? "Documento novo" : "Documentos novos"}</span></p>
                  <p style="margin:0 0 6px;font-size:15px;line-height:22px;font-weight:600;color:${COR.textoSuave};">${escaparHtml(saudacao)}</p>
                  <h1 class="cz-titulo" style="margin:0 0 12px;font-size:26px;line-height:34px;font-weight:800;letter-spacing:-0.02em;color:${COR.texto};">${escaparHtml(titulo)}</h1>
                  <p style="margin:0;font-size:15px;line-height:24px;color:${COR.textoMedio};">${escaparHtml(introducao)}</p>
                </td>
              </tr>
              <tr>
                <td class="cz-margem" style="padding:24px 40px 4px;">
                  ${visiveis.map(htmlDoItem).join("")}
                  ${
                    ocultos > 0
                      ? `<p style="margin:4px 0 0;font-family:${FONTE};font-size:13px;line-height:20px;color:${COR.textoSuave};">E mais ${ocultos} ${ocultos === 1 ? "documento" : "documentos"} no seu painel.</p>`
                      : ""
                  }
                </td>
              </tr>
              <tr>
                <td class="cz-margem" style="padding:20px 40px 6px;">
                  <table role="presentation" class="cz-botao" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" bgcolor="${COR.marca}" style="border-radius:10px;background:${COR.marca};">
                        <a href="${escaparHtml(urlBotao)}" style="display:inline-block;padding:14px 28px;font-family:${FONTE};font-size:15px;line-height:20px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;">${escaparHtml(textoBotao)}&nbsp;&rarr;</a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:14px 0 0;font-family:${FONTE};font-size:12.5px;line-height:19px;color:${COR.textoFraco};">Se o botão não abrir, copie este endereço no navegador:<br><a href="${escaparHtml(urlBotao)}" style="color:${COR.marcaForte};text-decoration:none;word-break:break-all;">${escaparHtml(urlBotao)}</a></p>
                </td>
              </tr>
              <tr>
                <td class="cz-margem" style="padding:22px 40px 34px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COR.fundoCartao}" style="background:${COR.fundoCartao};border-radius:12px;">
                    <tr>
                      <td style="padding:14px 16px;font-family:${FONTE};font-size:13px;line-height:20px;color:${COR.textoMedio};">
                        <strong style="color:${COR.texto};">Seus arquivos ficam protegidos.</strong> Por segurança, eles não vão anexados neste e-mail: ficam guardados no seu painel e abrem com o seu login.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 10px 0;font-family:${FONTE};font-size:12px;line-height:19px;color:${COR.textoFraco};text-align:center;">
            ${ajuda}<a href="${escaparHtml(entrada.urlPainel)}" style="color:${COR.textoSuave};font-weight:700;text-decoration:none;">ContaZoom</a> · Contabilidade para quem vende na internet<br>
            Você recebe este aviso porque a ContaZoom cuida da contabilidade da sua empresa.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const linhasItens = visiveis.map((item) => {
    const rotulo = infoTipoNotificacao(item.tipo).rotulo;
    const contexto = item.competencia
      ? `competência ${item.competencia}`
      : localSemRepetirTipo(item.pasta, rotulo) ?? "";
    return `• ${item.nomeArquivo}\n  ${[rotulo, contexto].filter(Boolean).join(" · ")}\n  ${item.link}`;
  });
  const texto = [
    saudacao,
    "",
    `${titulo}.`,
    introducao,
    "",
    ...linhasItens,
    ...(ocultos > 0 ? [`E mais ${ocultos} ${ocultos === 1 ? "documento" : "documentos"} no seu painel.`] : []),
    "",
    `${textoBotao}: ${urlBotao}`,
    "",
    "Por segurança, os arquivos não vão anexados neste e-mail: ficam guardados no seu painel e abrem com o seu login.",
    "",
    ...(entrada.whatsapp ? [`Precisa de ajuda? WhatsApp ${entrada.whatsapp.exibicao}: ${entrada.whatsapp.link}`] : []),
    `ContaZoom · Contabilidade para quem vende na internet · ${entrada.urlPainel}`,
  ].join("\n");

  return { assunto, preheader, html, texto };
}
