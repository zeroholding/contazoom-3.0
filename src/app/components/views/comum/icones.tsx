/**
 * O conjunto de ícones do painel. Um só, para todas as telas.
 *
 * POR QUE ISTO EXISTE
 *
 * Antes de este arquivo, o painel tinha 70+ SVG colados à mão espalhados pelas
 * telas, em TRÊS dialetos diferentes que se misturavam na mesma página:
 *
 *   1. heroicons outline  — `viewBox="0 0 24 24"`, `strokeWidth={2}` (número)
 *   2. feather/lucide     — `viewBox="0 0 24 24"`, `strokeWidth="2"` (string),
 *                            com `width="14" height="14"` no atributo
 *   3. heroicons solid    — `viewBox="0 0 20 20"`, `fill="currentColor"`, sem traço
 *
 * O resultado é o que se vê na tela: ícone de traço fino ao lado de ícone
 * preenchido, um de 12px encostado num de 20px. Não é falta de ícone — é falta
 * de UM ícone. E como cada cópia vive dentro do JSX de uma tela, corrigir o
 * desenho de um exigia achar as outras seis cópias.
 *
 * AS REGRAS DO CONJUNTO
 *
 * - `viewBox="0 0 24 24"` sempre, mesmo nos ícones desenhados menores. Grade
 *   única é o que faz dois ícones diferentes parecerem da mesma família.
 * - Traço, nunca preenchimento. `stroke="currentColor"` para o ícone herdar a
 *   cor do texto ao lado — sem isso, cada uso precisa repintar o ícone à mão e
 *   eles saem de sincronia com o texto no `hover` e no estado desabilitado.
 * - `strokeWidth` 1,75 como padrão. Dois é o peso do menu lateral, que desenha a
 *   20px; nos 14 a 16px das tabelas e dos indicadores o mesmo 2 fica pesado e
 *   fecha os vãos internos do desenho. O `traco` é prop para o caso raro de
 *   precisar casar com um ícone maior.
 * - `aria-hidden` embutido. Ícone aqui é sempre decorativo: quem carrega o
 *   significado é o texto ao lado. Um ícone anunciado pelo leitor de tela dobra
 *   a leitura de cada linha da tabela.
 * - O tamanho vem de fora, por classe (`className="h-4 w-4"`). Nenhum ícone
 *   embute tamanho, porque foi assim que apareceram os de 12, 14, 16, 18 e 20px
 *   na mesma tela.
 */

import type { ReactNode } from "react";

export type PropsIcone = {
  className?: string;
  /** Espessura do traço. Só mexer para casar com um ícone desenhado maior. */
  traco?: number;
};

/**
 * Casca comum. Todo ícone daqui é só um `d` dentro desta moldura — é isso que
 * garante que o conjunto não volte a divergir.
 */
function Icone({
  className = "h-4 w-4",
  traco = 1.75,
  children,
}: PropsIcone & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={traco}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Expedição e logística                            */
/* -------------------------------------------------------------------------- */

/** Caminhão. Despacho, expedição, "a caminho". */
export function IconeCaminhao(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M3 17V6a1 1 0 0 1 1-1h9v12" />
      <path d="M13 11h5l3 4v2h-8" />
      <circle cx="7.5" cy="17.5" r="2" />
      <circle cx="17.5" cy="17.5" r="2" />
      <path d="M9.5 17.5h6" />
    </Icone>
  );
}

/** Caixa fechada. Pacote, unidade, item. */
export function IconeCaixa(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z" />
      <path d="M3 7.5 12 12l9-4.5" />
      <path d="M12 12v9" />
    </Icone>
  );
}

/** Caixas empilhadas. Estoque, volume. */
export function IconeCaixas(p: PropsIcone) {
  return (
    <Icone {...p}>
      <rect x="3" y="13" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" />
      <rect x="8" y="3" width="8" height="8" rx="1" />
    </Icone>
  );
}

/** Etiqueta de envio. */
export function IconeEtiqueta(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M20.6 12.6 12.6 20.6a2 2 0 0 1-2.8 0l-6.4-6.4a2 2 0 0 1-.6-1.5l.3-6a2 2 0 0 1 1.9-1.9l6-.3a2 2 0 0 1 1.5.6l6.4 6.4a2 2 0 0 1 0 2.8Z" />
      <circle cx="8.5" cy="8.5" r="1.5" />
    </Icone>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Tempo                                    */
/* -------------------------------------------------------------------------- */

/** Relógio. Prazo, validade. */
export function IconeRelogio(p: PropsIcone) {
  return (
    <Icone {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </Icone>
  );
}

/** Calendário. Data, período. */
export function IconeCalendario(p: PropsIcone) {
  return (
    <Icone {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Icone>
  );
}

/** Ampulheta. "Vence hoje", tempo curto. */
export function IconeAmpulheta(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M7 3h10M7 21h10" />
      <path d="M8 3v3.5a4 4 0 0 0 1.5 3.1L12 12l-2.5 2.4A4 4 0 0 0 8 17.5V21" />
      <path d="M16 3v3.5a4 4 0 0 1-1.5 3.1L12 12l2.5 2.4a4 4 0 0 1 1.5 3.1V21" />
    </Icone>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Estados e avisos                                  */
/* -------------------------------------------------------------------------- */

/** Triângulo de atenção. */
export function IconeAlerta(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M10.3 4.3 2.6 17.5A1.8 1.8 0 0 0 4.2 20h15.6a1.8 1.8 0 0 0 1.6-2.5L13.7 4.3a1.9 1.9 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4" />
      <path d="M12 17h.01" />
    </Icone>
  );
}

/** Círculo com informação. */
export function IconeInfo(p: PropsIcone) {
  return (
    <Icone {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </Icone>
  );
}

/** Certo dentro do círculo. Sucesso, saudável. */
export function IconeCerto(p: PropsIcone) {
  return (
    <Icone {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </Icone>
  );
}

/** Proibido. Não apto, bloqueado. */
export function IconeProibido(p: PropsIcone) {
  return (
    <Icone {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.6 5.6 12.8 12.8" />
    </Icone>
  );
}

/** Pausa. Anúncio pausado, item parado. */
export function IconePausa(p: PropsIcone) {
  return (
    <Icone {...p}>
      <rect x="8" y="5" width="3" height="14" rx="1" />
      <rect x="13" y="5" width="3" height="14" rx="1" />
    </Icone>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Dinheiro e números                            */
/* -------------------------------------------------------------------------- */

/** Cédula. Faturamento, valor. */
export function IconeDinheiro(p: PropsIcone) {
  return (
    <Icone {...p}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </Icone>
  );
}

/** Etiqueta de preço. */
export function IconePreco(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M12 3v18" />
      <path d="M16.5 7.5A3 3 0 0 0 13.5 5h-2a2.75 2.75 0 0 0 0 5.5h1.5a2.75 2.75 0 0 1 0 5.5h-2a3 3 0 0 1-3-2.5" />
    </Icone>
  );
}

/** Subindo. Mais vendidos, crescimento. */
export function IconeSubindo(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="m3 16 5.5-5.5 3.5 3.5L21 5" />
      <path d="M15 5h6v6" />
    </Icone>
  );
}

/** Descendo. Queda, anúncio morto. */
export function IconeDescendo(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="m3 8 5.5 5.5 3.5-3.5L21 19" />
      <path d="M15 19h6v-6" />
    </Icone>
  );
}

/** Barras. Estatística, ranking. */
export function IconeGrafico(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <rect x="7" y="12" width="3" height="5" rx="1" />
      <rect x="12" y="8" width="3" height="9" rx="1" />
      <rect x="17" y="5" width="3" height="12" rx="1" />
    </Icone>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Ações e navegação                                 */
/* -------------------------------------------------------------------------- */

/** Lupa. */
export function IconeBusca(p: PropsIcone) {
  return (
    <Icone {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.8-3.8" />
    </Icone>
  );
}

/** Funil. */
export function IconeFiltro(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />
    </Icone>
  );
}

/** Seta circular. Atualizar, sincronizar. */
export function IconeAtualizar(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </Icone>
  );
}

/** Baixar. */
export function IconeBaixar(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M12 3v12" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4 19h16" />
    </Icone>
  );
}

/** Enviar. Upload, importar. */
export function IconeEnviar(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M12 16V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M4 19h16" />
    </Icone>
  );
}

/** Sair para fora. Abrir em nova aba. */
export function IconeAbrirFora(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
    </Icone>
  );
}

/** Seta para a direita. */
export function IconeSeta(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </Icone>
  );
}

/** Fechar. */
export function IconeFechar(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icone>
  );
}

/** Mais. Criar, adicionar. */
export function IconeMais(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M12 5v14M5 12h14" />
    </Icone>
  );
}

/** Lápis. Editar. */
export function IconeEditar(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m14 6 4 4" />
    </Icone>
  );
}

/** Lixeira. Excluir. */
export function IconeLixeira(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M10 11v6M14 11v6" />
    </Icone>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Cadastro e documentos                             */
/* -------------------------------------------------------------------------- */

/** Pasta. */
export function IconePasta(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </Icone>
  );
}

/** Folha de documento. */
export function IconeDocumento(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </Icone>
  );
}

/** Código de barras. SKU, cadastro de produto. */
export function IconeSku(p: PropsIcone) {
  return (
    <Icone {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 9v6M10.5 9v6M14 9v6M17.5 9v6" />
    </Icone>
  );
}

/** Loja. Conta, canal de venda. */
export function IconeLoja(p: PropsIcone) {
  return (
    <Icone {...p}>
      <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
      <path d="M3 9h18l-1.5-4.5A1 1 0 0 0 18.5 4h-13a1 1 0 0 0-1 .5L3 9Z" />
      <path d="M9 20v-5h6v5" />
    </Icone>
  );
}

/** Pessoa. Comprador. */
export function IconePessoa(p: PropsIcone) {
  return (
    <Icone {...p}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Icone>
  );
}
