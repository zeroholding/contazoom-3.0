/**
 * E-mail de "documentos novos" — HTML e texto, sem dependência nenhuma.
 *
 * Escrito como a mensagem de um escritório para o cliente, não como peça de
 * marketing: fundo branco, logotipo, saudação, a lista dos arquivos com o ícone
 * do formato, um botão e a assinatura da equipe. Sem selo, faixa colorida nem
 * cartões, que davam cara de modelo pronto.
 *
 * Feito para cliente de e-mail, não para navegador: layout em tabela, estilo
 * inline, 560px de largura e nada que o Gmail ou o Outlook descartem.
 * - Fonte: a do site (Plus Jakarta Sans) onde o cliente carrega fonte da web
 *   (Apple Mail, iPhone, Outlook para Mac). O Gmail não carrega nenhuma; lá
 *   aparece a fonte do sistema da pilha abaixo.
 * - Ícones: PNG gerado dos SVGs em `public/email/`, porque Gmail e Outlook não
 *   exibem SVG. Sem imagem, aparece o texto alternativo ("PDF").
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
  /** URLs absolutas dos ícones em PNG. Sem elas, a lista sai só com o texto. */
  urlIcones?: { pdf: string; arquivo: string } | null;
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
  texto: "#14161B",
  corpo: "#3B414B",
  suave: "#6B7280",
  fraco: "#9AA1AC",
  fio: "#E9ECF1",
};

/**
 * A do site primeiro; Montserrat se a pessoa a tiver instalada; depois as do
 * sistema mais parecidas com ela (Segoe UI no Windows, Roboto no Android,
 * Helvetica no Mac).
 */
const FONTE =
  "'Plus Jakarta Sans',Montserrat,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";

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
 * Nome cadastrado todo em caixa alta vira "Olá, GIANLUCCA", que no e-mail soa
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
 * Onde o documento está, sem repetir o tipo que abre a mesma linha: depois de
 * "Folha e funcionários", a pasta "Folha e funcionários" não diz nada e
 * "Folha e funcionários › Férias" vira só "Férias".
 */
export function localSemRepetirTipo(pasta: string | null, rotuloTipo: string): string | null {
  if (!pasta) return null;
  const normalizar = (texto: string) => texto.trim().toLocaleLowerCase("pt-BR");
  if (normalizar(pasta) === normalizar(rotuloTipo)) return null;
  const prefixo = `${rotuloTipo} › `;
  return normalizar(pasta).startsWith(normalizar(prefixo)) ? pasta.trim().slice(prefixo.length) : pasta;
}

/**
 * "Impostos e obrigações · competência setembro de 2026 · 245,1 KB".
 * O formato só entra quando não é PDF: o ícone do PDF já diz o que é.
 */
export function detalheDoArquivo(item: ItemEmailDocumento): string {
  const rotulo = infoTipoNotificacao(item.tipo).rotulo;
  const partes = [rotulo];
  const onde = item.competencia ? `competência ${item.competencia}` : localSemRepetirTipo(item.pasta, rotulo);
  if (onde) partes.push(onde);
  if (item.formato && item.formato !== "PDF") partes.push(item.formato);
  if (item.tamanho) partes.push(item.tamanho);
  return partes.join(" · ");
}

function htmlDoItem(item: ItemEmailDocumento, icones: EntradaEmailDocumentos["urlIcones"], ultimo: boolean): string {
  const link = escaparHtml(item.link);
  const fio = `border-top:1px solid ${COR.fio};${ultimo ? `border-bottom:1px solid ${COR.fio};` : ""}`;
  const icone = icones
    ? `<td width="48" valign="top" style="${fio}padding:14px 0 14px 0;">
        <a href="${link}" style="text-decoration:none;"><img src="${escaparHtml(item.formato === "PDF" ? icones.pdf : icones.arquivo)}" width="32" height="32" alt="${escaparHtml(item.formato || "Arquivo")}" style="display:block;width:32px;height:32px;border:0;outline:none;font-family:${FONTE};font-size:10px;font-weight:700;color:${COR.suave};"></a>
      </td>`
    : "";
  return `
    <tr>
      ${icone}
      <td valign="top" style="${fio}padding:14px 0;font-family:${FONTE};">
        <a href="${link}" style="display:block;font-size:15px;line-height:22px;font-weight:600;color:${COR.texto};text-decoration:none;word-break:break-word;">${escaparHtml(item.nomeArquivo)}</a>
        <span style="display:block;margin-top:2px;font-size:13px;line-height:20px;color:${COR.suave};">${escaparHtml(detalheDoArquivo(item))}</span>
      </td>
    </tr>`;
}

function plural(total: number, singular: string, varios: string) {
  return total === 1 ? singular : varios;
}

export function montarEmailDocumentos(entrada: EntradaEmailDocumentos): EmailMontado {
  const itens = entrada.itens;
  const total = itens.length;
  if (total === 0) throw new Error("E-mail de documentos sem nenhum documento.");

  const nome = primeiroNome(entrada.nomeCliente);
  const saudacao = nome ? `Olá, ${nome},` : "Olá,";
  const chamada =
    total === 1
      ? "Enviamos um documento novo para o seu painel."
      : `Enviamos ${total} documentos novos para o seu painel.`;
  const complemento =
    total === 1
      ? "Ele já está disponível para consultar e baixar."
      : "Eles já estão disponíveis para consultar e baixar, cada um na sua pasta.";
  const seguranca =
    "Por segurança, os arquivos não vão anexados a este e-mail. Eles ficam guardados no painel e abrem com o seu login.";

  const assunto = assuntoDoEmail(itens);
  const restantes = total - 1;
  const preheader =
    total === 1
      ? `${encurtar(itens[0].nomeArquivo, 70)} já está no seu painel.`
      : `${encurtar(itens[0].nomeArquivo, 50)} e mais ${restantes} ${plural(restantes, "documento", "documentos")} já estão no seu painel.`;

  const visiveis = itens.slice(0, MAXIMO_ITENS_NO_EMAIL);
  const ocultos = total - visiveis.length;
  const urlBotao = total === 1 ? itens[0].link : entrada.urlDocumentos;
  const textoBotao = total === 1 ? "Abrir documento" : "Ver documentos";

  const logo = entrada.urlLogo
    ? `<img src="${escaparHtml(entrada.urlLogo)}" width="136" alt="ContaZoom" style="display:block;width:136px;max-width:136px;height:auto;border:0;outline:none;text-decoration:none;font-family:${FONTE};font-size:22px;font-weight:800;color:${COR.marca};">`
    : `<span style="font-family:${FONTE};font-size:22px;font-weight:800;letter-spacing:-0.02em;color:${COR.marca};">ContaZoom</span>`;

  const ajuda = entrada.whatsapp
    ? `<p style="margin:0 0 20px;font-size:15px;line-height:24px;color:${COR.corpo};">Qualquer dúvida, fale com a gente pelo WhatsApp <a href="${escaparHtml(entrada.whatsapp.link)}" style="color:${COR.texto};font-weight:600;text-decoration:underline;white-space:nowrap;">${escaparHtml(entrada.whatsapp.exibicao)}</a>.</p>`
    : "";

  // Caracteres invisíveis depois do pré-cabeçalho: sem eles o Gmail completa a
  // prévia com o começo do corpo e repete a saudação.
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
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<!--<![endif]-->
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { -ms-interpolation-mode:bicubic; }
  @media only screen and (max-width: 600px) {
    .cz-largura { width:100% !important; }
    .cz-margem { padding-left:20px !important; padding-right:20px !important; }
    .cz-botao { width:100% !important; }
    .cz-botao a { display:block !important; text-align:center !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#FFFFFF;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escaparHtml(preheader)}${preenchimento}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background:#FFFFFF;">
  <tr>
    <td align="center" style="padding:0;">
      <table role="presentation" class="cz-largura" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;">
        <tr>
          <td class="cz-margem" align="left" style="padding:36px 32px 32px;">${logo}</td>
        </tr>
        <tr>
          <td class="cz-margem" style="padding:0 32px;font-family:${FONTE};">
            <p style="margin:0 0 16px;font-size:16px;line-height:24px;font-weight:600;color:${COR.texto};">${escaparHtml(saudacao)}</p>
            <p style="margin:0 0 24px;font-size:16px;line-height:26px;color:${COR.corpo};">${escaparHtml(chamada)} ${escaparHtml(complemento)}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${visiveis
              .map((item, indice) => htmlDoItem(item, entrada.urlIcones, indice === visiveis.length - 1))
              .join("")}
            </table>
            ${
              ocultos > 0
                ? `<p style="margin:12px 0 0;font-size:13px;line-height:20px;color:${COR.suave};">E mais ${ocultos} ${plural(ocultos, "documento", "documentos")} no painel.</p>`
                : ""
            }
            <table role="presentation" class="cz-botao" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 24px;">
              <tr>
                <td align="center" bgcolor="${COR.marca}" style="border-radius:8px;background:${COR.marca};">
                  <a href="${escaparHtml(urlBotao)}" style="display:inline-block;padding:13px 26px;font-family:${FONTE};font-size:15px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;">${escaparHtml(textoBotao)}</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 20px;font-size:13.5px;line-height:21px;color:${COR.suave};">${escaparHtml(seguranca)}</p>
            ${ajuda}
            <p style="margin:0;font-size:15px;line-height:24px;color:${COR.corpo};">Um abraço,<br><span style="font-weight:600;color:${COR.texto};">Equipe ContaZoom</span></p>
          </td>
        </tr>
        <tr>
          <td class="cz-margem" style="padding:36px 32px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-top:1px solid ${COR.fio};padding-top:20px;font-family:${FONTE};font-size:12px;line-height:19px;color:${COR.fraco};">
                  <a href="${escaparHtml(entrada.urlPainel)}" style="color:${COR.suave};font-weight:600;text-decoration:none;">ContaZoom</a> · Contabilidade para quem vende na internet<br>
                  Você recebe este aviso porque a ContaZoom cuida da contabilidade da sua empresa.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const linhasItens = visiveis.map((item) => `- ${item.nomeArquivo}\n  ${detalheDoArquivo(item)}\n  ${item.link}`);
  const texto = [
    saudacao,
    "",
    `${chamada} ${complemento}`,
    "",
    ...linhasItens,
    ...(ocultos > 0 ? [`E mais ${ocultos} ${plural(ocultos, "documento", "documentos")} no painel.`] : []),
    "",
    `${textoBotao}: ${urlBotao}`,
    "",
    seguranca,
    "",
    ...(entrada.whatsapp
      ? [`Qualquer dúvida, fale com a gente pelo WhatsApp ${entrada.whatsapp.exibicao}: ${entrada.whatsapp.link}`, ""]
      : []),
    "Um abraço,",
    "Equipe ContaZoom",
    "",
    `ContaZoom · Contabilidade para quem vende na internet · ${entrada.urlPainel}`,
  ].join("\n");

  return { assunto, preheader, html, texto };
}
