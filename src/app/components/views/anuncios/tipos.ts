/**
 * Tipos e formatação compartilhados pelas duas telas de anúncios.
 *
 * As telas são separadas de propósito (uma para campeões de venda, outra para
 * anúncios parados), mas leem a MESMA rota de API e a mesma agregação — ver
 * `src/lib/anuncios-data.ts`. Manter os tipos num lugar só é o que garante que
 * um campo novo apareça nas duas ou em nenhuma, em vez de as telas divergirem
 * silenciosamente com o tempo.
 */

export type Linha = {
  itemId: string;
  meliAccountId: string;
  titulo: string;
  conta: string;
  skus: string[];
  hierarquia1: string[];
  hierarquia2: string[];
  pedidos: number;
  unidades: number;
  faturamento: number;
  ticketMedio: number;
  margem: number | null;
  primeiraVenda: string;
  ultimaVenda: string;
  diasSemVenda: number;
  horasSemVenda: number;
  /** Vindo do Mercado Livre. `null` = a API não respondeu (≠ "não tem"). */
  status: string | null;
  subStatus: string[];
  preco: number | null;
  /** O ESTOQUE REAL. `null` = não consultado; `0` = esgotado. */
  estoque: number | null;
  totalVendido: number | null;
  logisticType: string | null;
  health: number | null;
  thumbnailUrl: string | null;
  permalink: string | null;
};

export type Resumo = {
  anuncios: number;
  unidades: number;
  faturamento: number;
  mediaHoras: number;
  semEstoque: number;
  pausadosSemEstoque: number;
  estoqueIndisponivel: number;
  /** A que conjunto os contadores de estoque se referem. Ver `anuncios-data.ts`. */
  escopoEstoque: "total" | "pagina";
  estoqueConsultados: number;
};

export type Resposta = {
  linhas: Linha[];
  resumo: Resumo;
  total: number;
  pagina: number;
  totalPaginas: number;
  /** Vendas ainda sem `item_id`. A tela avisa em vez de mostrar número parcial. */
  backfillPendente: number;
};

export type Conta = { id: string; nickname: string | null };

export const RESUMO_VAZIO: Resumo = {
  anuncios: 0,
  unidades: 0,
  faturamento: 0,
  mediaHoras: 0,
  semEstoque: 0,
  pausadosSemEstoque: 0,
  estoqueIndisponivel: 0,
  escopoEstoque: "pagina",
  estoqueConsultados: 0,
};

/**
 * Reexportados de `comum/formato`, não redefinidos.
 *
 * Eram quatro cópias literais das mesmas funções e da mesma classe de campo. A
 * cópia daqui já tinha divergido: quando o `ENTRADA` do `comum/formato` trocou o
 * foco verde pelo laranja da marca, os campos das telas de anúncios continuaram
 * verdes — mesma tela, dois anéis de foco diferentes, porque o import vinha de
 * arquivos distintos. Reexportar mantém o import das telas intacto e garante que
 * elas recebam as correções futuras, exatamente como `anuncios/comum.tsx` já faz
 * com as peças de interface.
 */
export { brl, dataCurta, ENTRADA, horaCurta, inteiro } from "../comum/formato";

/**
 * Um anúncio parado POR FALTA DE ESTOQUE é um problema diferente de um anúncio
 * parado COM estoque na prateleira.
 *
 * O primeiro é reposição: volta a vender sozinho quando a mercadoria chega, e
 * mexer no anúncio não resolve nada. O segundo é o anúncio: preço, título, foto,
 * concorrência. Tratar os dois como "morto" manda a pessoa trabalhar na coisa
 * errada, e é exatamente o que a tela do concorrente faz.
 */
export function motivoDeParada(l: Linha): "sem_estoque" | "com_estoque" | "indefinido" {
  if (l.subStatus.includes("out_of_stock")) return "sem_estoque";
  if (l.estoque === null) return "indefinido";
  return l.estoque === 0 ? "sem_estoque" : "com_estoque";
}
