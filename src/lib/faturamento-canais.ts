/**
 * Canais de venda da apuração fiscal.
 *
 * SEM NENHUM IMPORT, de propósito: este arquivo é lido pelo servidor (validação
 * da rota, CHECK do banco espelhado aqui) e pelo navegador (rótulo, logo e cor na
 * tela). Mesmo critério de `src/lib/papeis.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE ONDE VEM O CANAL, E POR QUE NÃO DO XML
 *
 * A NF-e não tem campo de marketplace. Nenhum. O layout não prevê, porque canal
 * de venda não é informação fiscal.
 *
 * O que existe é convenção do emissor: quem vende em vários marketplaces costuma
 * reservar UMA SÉRIE por canal. Na base real analisada (822 arquivos de
 * agosto/2026), 100% das notas são série 2 — uma conta, um canal.
 *
 * Então o canal vem do mapa série -> canal, declarado pelo escritório em
 * `empresa_serie_canal`. Deduzir do nome do arquivo ou do CFOP erraria em
 * silêncio, e silêncio num número que vai ao banco é o pior defeito possível.
 * A tela diz isso na cara em vez de exibir uma coluna que parece dado da nota.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const CANAL = {
  ML: "ML",
  SHOPEE: "SHOPEE",
  TIKTOK: "TIKTOK",
  SITE: "SITE",
  OUTRO: "OUTRO",
} as const;

export type Canal = (typeof CANAL)[keyof typeof CANAL];

/**
 * Ordem de exibição. Não é alfabética: é por volume esperado, para o canal que
 * importa aparecer primeiro sem depender de ordenação por valor (que dança de
 * lugar a cada competência e atrapalha a leitura de mês a mês).
 */
export const CANAIS_ORDEM: readonly Canal[] = [
  CANAL.ML,
  CANAL.SHOPEE,
  CANAL.TIKTOK,
  CANAL.SITE,
  CANAL.OUTRO,
];

export const CANAL_LABEL: Record<Canal, string> = {
  ML: "Mercado Livre",
  SHOPEE: "Shopee",
  TIKTOK: "TikTok Shop",
  SITE: "Site próprio",
  OUTRO: "Outro canal",
};

/**
 * Sigla do logo em `views/comum/logos.tsx`.
 *
 * Null onde não existe logo: a tela cai num ícone genérico. Inventar logo para
 * "site próprio" seria pior — cada cliente tem o seu.
 */
export const CANAL_LOGO: Record<Canal, "ML" | "SP" | "TT" | null> = {
  ML: "ML",
  SHOPEE: "SP",
  TIKTOK: "TT",
  SITE: null,
  OUTRO: null,
};

/**
 * Cor da barra de participação. Hex e não classe do Tailwind: o valor entra em
 * `style` para a barra poder ter largura e cor calculadas juntas.
 */
export const CANAL_COR: Record<Canal, string> = {
  ML: "#f59e0b",
  SHOPEE: "#ef4444",
  TIKTOK: "#0ea5e9",
  SITE: "#8b5cf6",
  OUTRO: "#94a3b8",
};

/**
 * Rótulo do balde de notas cuja série ninguém mapeou.
 *
 * Não é um canal: é a ausência de configuração, e precisa aparecer separado. Se
 * essas notas caíssem em "Outro canal", o escritório nunca saberia que falta
 * mapear uma série — e o resumo por canal mentiria por omissão.
 */
export const SEM_SERIE_MAPEADA = "SEM_SERIE";
export const SEM_SERIE_MAPEADA_LABEL = "Sem série mapeada";
export const SEM_SERIE_MAPEADA_COR = "#cbd5e1";

export function ehCanalValido(valor: unknown): valor is Canal {
  return typeof valor === "string" && valor in CANAL_LABEL;
}

/**
 * Normaliza a série para comparação.
 *
 * A tag do XML traz "2" e a chave de acesso carrega "002". O mapa é digitado por
 * pessoa, que pode escrever qualquer um dos dois. Comparar sem normalizar faria a
 * série 002 do cadastro nunca casar com a série 2 da nota, e todo o faturamento
 * cairia em "sem série mapeada" sem nenhum erro aparente.
 */
export function normalizarSerie(valor: unknown): string {
  const texto = String(valor ?? "").trim();
  if (!texto) return "";
  const digitos = texto.replace(/\D/g, "");
  if (!digitos) return texto;
  // Number() mata o zero à esquerda; String() devolve sem notação científica
  // para os tamanhos de série que existem (máximo 3 dígitos).
  return String(Number(digitos));
}
