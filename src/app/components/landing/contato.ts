/**
 * Contato comercial da landing: o WhatsApp da Contazoom.
 *
 * Cada botão abre a conversa com uma mensagem já escrita, diferente por lugar
 * da página, para a equipe saber de onde a pessoa veio e o que ela quer.
 */

/** DDI + DDD + número, só dígitos (formato do wa.me). */
export const WHATSAPP_NUMERO = "5511927405138";

/** Como o número aparece escrito na página. */
export const WHATSAPP_EXIBICAO = "(11) 92740-5138";

export const MENSAGENS = {
  tributacao:
    "Olá! Vendo em marketplaces e quero conhecer a contabilidade da Contazoom, analisar minha tributação e entender o sistema gratuito incluso.",
  produtos:
    "Olá! Vim pelo site da Contazoom e quero revisar a tributação dos meus produtos.",
  sistema:
    "Olá! Vim pelo site da Contazoom e quero conhecer o sistema de gestão incluso na contabilidade.",
  provas:
    "Olá! Vim pelo site da Contazoom e quero conversar com um especialista em contabilidade para e-commerce.",
  contabilidade:
    "Olá! Vim pelo site da Contazoom e quero uma proposta de contabilidade para a minha empresa.",
  migracao:
    "Olá! Vim pelo site da Contazoom e quero trazer a minha empresa para a Contazoom.",
  planos:
    "Olá! Vim pelo site da Contazoom e quero receber uma proposta personalizada para o meu e-commerce.",
  abertura: "Olá! Vim pelo site da Contazoom e quero abrir um CNPJ para vender online.",
  duvida: "Olá! Vim pelo site da Contazoom e tenho uma dúvida.",
  geral: "Olá! Vim pelo site da Contazoom e quero uma contabilidade que entende o meu e-commerce.",
} as const;

export type MensagemWhatsapp = keyof typeof MENSAGENS;

export function linkWhatsapp(mensagem: MensagemWhatsapp = "geral"): string {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(MENSAGENS[mensagem])}`;
}
