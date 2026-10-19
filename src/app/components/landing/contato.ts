/**
 * Contato comercial da landing: o WhatsApp da ContaZoom.
 *
 * Cada botão abre a conversa com uma mensagem já escrita, diferente por lugar
 * da página, para a equipe saber de onde a pessoa veio e o que ela quer.
 */

/** DDI + DDD + número, só dígitos (formato do wa.me). */
export const WHATSAPP_NUMERO = "5511927405138";

/** Como o número aparece escrito na página. */
export const WHATSAPP_EXIBICAO = "(11) 92740-5138";

export const MENSAGENS = {
  contabilidade: "Olá! Vim pelo site da ContaZoom e quero uma proposta de contabilidade para a minha empresa.",
  abertura: "Olá! Vim pelo site da ContaZoom e quero abrir um CNPJ.",
  duvida: "Olá! Vim pelo site da ContaZoom e tenho uma dúvida.",
  geral: "Olá! Vim pelo site da ContaZoom e quero saber mais.",
} as const;

export type MensagemWhatsapp = keyof typeof MENSAGENS;

export function linkWhatsapp(mensagem: MensagemWhatsapp = "geral"): string {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(MENSAGENS[mensagem])}`;
}
