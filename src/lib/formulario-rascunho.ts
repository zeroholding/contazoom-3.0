/**
 * Rascunho do formulário de abertura no `localStorage`.
 *
 * Nesta fase não existe banco. O formulário é longo e preenchido no celular, e
 * o Google Forms de hoje perde tudo quando cai a conexão ou chega uma ligação —
 * é a reclamação que mais custa preenchimento pela metade.
 *
 * O QUE ISTO NÃO GARANTE, e a tela precisa dizer, não só este comentário:
 *
 *   - não atravessa navegador nem aparelho: começou no celular, não continua no
 *     computador;
 *   - aba anônima descarta ao fechar;
 *   - limpar dados de site apaga sem avisar;
 *   - a cota é de uns 5 MB por origem.
 *
 * E o principal: **arquivo não entra aqui**. `File` não é serializável em JSON, e
 * converter para base64 estouraria a cota com um PDF só. Os campos de texto
 * voltam; os documentos precisam ser escolhidos de novo. Guardar anexo aqui
 * também seria a decisão errada de privacidade, então as duas razões apontam
 * para o mesmo lado.
 *
 * O rascunho tem CPF, endereço e telefone em texto claro no aparelho de quem
 * preenche, que pode ser compartilhado. Por isso `limpar()` é exposto e a tela
 * mostra o botão; e o envio, quando existir, apaga na hora.
 */

import {
  formularioVazio,
  type FormularioAbertura,
} from "@/lib/formulario-abertura";

const CHAVE = "cz_formulario_abertura_v1";

/**
 * Versão do FORMATO, separada da chave.
 *
 * Rascunho de formato antigo é descartado inteiro, nunca restaurado pela metade:
 * meio formulário restaurado com campos que mudaram de significado é pior que
 * formulário em branco.
 */
const VERSAO = 1;

type Envelope = {
  versao: number;
  salvoEm: string;
  passo: number;
  dados: FormularioAbertura;
};

export type RascunhoSalvo = {
  salvoEm: Date;
  passo: number;
  dados: FormularioAbertura;
};

function disponivel(): boolean {
  // `localStorage` lança em modo restrito de alguns navegadores, e o acesso em
  // si é o que lança — por isso o try em volta do teste, não só do uso.
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

export function lerRascunho(): RascunhoSalvo | null {
  if (!disponivel()) return null;
  try {
    const cru = window.localStorage.getItem(CHAVE);
    if (!cru) return null;

    const envelope = JSON.parse(cru) as Envelope;
    if (!envelope || envelope.versao !== VERSAO) {
      // Formato antigo: descarta em vez de tentar migrar no escuro.
      window.localStorage.removeItem(CHAVE);
      return null;
    }
    if (!envelope.dados || !Array.isArray(envelope.dados.socios)) return null;

    return {
      salvoEm: new Date(envelope.salvoEm),
      passo: Number.isFinite(envelope.passo) ? envelope.passo : 0,
      // Mescla sobre o vazio: campo acrescentado depois do rascunho ter sido
      // salvo entra com o padrão em vez de chegar `undefined` num input
      // controlado, que o React reclama e vira campo não editável.
      dados: { ...formularioVazio(), ...envelope.dados },
    };
  } catch {
    return null;
  }
}

export function salvarRascunho(
  dados: FormularioAbertura,
  passo: number
): void {
  if (!disponivel()) return;
  try {
    const envelope: Envelope = {
      versao: VERSAO,
      salvoEm: new Date().toISOString(),
      passo,
      dados,
    };
    window.localStorage.setItem(CHAVE, JSON.stringify(envelope));
  } catch {
    // Cota estourada ou modo restrito. Falhar em silêncio é o certo: o
    // formulário continua funcionando na memória, e um alerta aqui só assustaria
    // sobre algo que a pessoa não pode resolver.
  }
}

export function limparRascunho(): void {
  if (!disponivel()) return;
  try {
    window.localStorage.removeItem(CHAVE);
  } catch {
    /* nada a fazer */
  }
}
