/**
 * Conteúdo e dados da landing pública.
 *
 * POSICIONAMENTO: Contabilidade de quem vive e-commerce, com inteligência
 * tributária por produto e gestão do lucro real.
 * Sistema próprio de gestão gratuito e incluso na contratação.
 */

import {
  BadgeCheck,
  Building2,
  CircleHelp,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Percent,
  ReceiptText,
  type LucideIcon,
} from "lucide-react";

/** Âncoras do cabeçalho, na ordem da experiência do usuário */
export const LINKS_SECOES: Array<{
  href: string;
  id: string;
  rotulo: string;
  descricao: string;
  Icone: LucideIcon;
}> = [
  { href: "#tributacao", id: "tributacao", rotulo: "Tributação", descricao: "Planejamento por produto", Icone: Percent },
  { href: "#provas", id: "provas", rotulo: "Especialização", descricao: "Casos reais e equipe técnica", Icone: BadgeCheck },
  { href: "#sistema", id: "sistema", rotulo: "Sistema", descricao: "Gratuito e incluso", Icone: LayoutDashboard },
  { href: "#contabilidade", id: "contabilidade", rotulo: "O que inclui", descricao: "Rotina fiscal e guias", Icone: Landmark },
  { href: "#planos", id: "planos", rotulo: "Planos", descricao: "Escopo e proposta transparente", Icone: ReceiptText },
  { href: "#duvidas", id: "duvidas", rotulo: "Dúvidas", descricao: "Perguntas frequentes", Icone: CircleHelp },
];

export type Canal = "ML" | "SP" | "TT";

export const NOME_CANAL: Record<Canal, string> = {
  ML: "Mercado Livre",
  SP: "Shopee",
  TT: "TikTok Shop",
};

/**
 * Vendas de EXEMPLO.
 * Faturamento − Taxas − Frete − Imposto − CMV = Margem líquida
 */
export type VendaExemplo = {
  canal: Canal;
  produto: string;
  curto: string;
  sku: string;
  meta: string;
  valor: number;
  taxa: number;
  frete: number;
  imposto: number;
  cmv: number;
  /** Linha miúda do painel da lupa */
  detalhe: string;
  leitura: string;
  estimado?: boolean;
};

export const VENDAS_EXEMPLO: VendaExemplo[] = [
  {
    canal: "ML",
    produto: "Fone Bluetooth TWS Pro",
    curto: "Fone Bluetooth",
    sku: "FN-TWS-01",
    meta: "Premium · Coleta",
    valor: 189.9,
    taxa: 22.79,
    frete: 18.45,
    imposto: 11.39,
    cmv: 71,
    detalhe: "Premium · Coleta · comissão 12% · imposto 6% (R$ 11,39) · CMV do SKU na data da venda",
    leitura: "Venda saudável: mesmo com 12% de comissão e R$ 18,45 de frete, sobram R$ 66,27.",
  },
  {
    canal: "SP",
    produto: "Kit 3 Garrafas Térmicas 500 ml",
    curto: "Kit 3 Garrafas",
    sku: "KIT-GT-3",
    meta: "Kit com 3 itens",
    valor: 129.9,
    taxa: 28.58,
    frete: 8,
    imposto: 7.79,
    cmv: 54.6,
    detalhe: "Kit: 3 × GT-500 a R$ 18,20 · comissão + taxa de serviço 22% · imposto 6% (R$ 7,79)",
    leitura: "Kit montado: o custo soma os três itens (3 × R$ 18,20), e as taxas somadas levam 22% da venda.",
  },
  {
    canal: "TT",
    produto: "Luminária LED de Mesa",
    curto: "Luminária LED",
    sku: "LUM-LED-02",
    meta: "Financeiro estimado",
    valor: 89.9,
    taxa: 7.19,
    frete: 6.3,
    imposto: 5.39,
    cmv: 32.4,
    detalhe: "Financeiro estimado · liquidação automática pelo extrato · imposto 6% (R$ 5,39)",
    leitura: "Taxa estimada atualizada automaticamente quando o pedido liquida no extrato oficial do TikTok.",
    estimado: true,
  },
  {
    canal: "ML",
    produto: "Suporte Articulado p/ Monitor",
    curto: "Suporte Monitor",
    sku: "SUP-MON-27",
    meta: "Clássico · Full",
    valor: 249,
    taxa: 32.37,
    frete: 24.9,
    imposto: 14.94,
    cmv: 148,
    detalhe: "Clássico · Full · comissão 13% · imposto 6% (R$ 14,94) · remessa Full segregada do faturamento",
    leitura: "Ticket alto, mas o custo do produto consome 59% da receita. Sobram 11,6% de margem.",
  },
  {
    canal: "ML",
    produto: "Capinha de Silicone Premium",
    curto: "Capinha Silicone",
    sku: "CAP-SIL-15",
    meta: "Clássico · Flex",
    valor: 39.9,
    taxa: 6.58,
    frete: 10.8,
    imposto: 2.39,
    cmv: 22.9,
    detalhe: "Flex: repasse R$ 1,10 − frete pacote R$ 11,90 = −R$ 10,80 · imposto 6% (R$ 2,39)",
    leitura: "Margem negativa descoberta pelo sistema: o pacote Flex consumiu 27% da venda e gerou prejuízo.",
  },
];

const centavos = (n: number) => Math.round(n * 100) / 100;

export function margemDe(v: VendaExemplo): number {
  return centavos(v.valor - v.taxa - v.frete - v.imposto - v.cmv);
}

export function moeda(n: number): string {
  return Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function comSinal(n: number, prefixo = ""): string {
  return `${n < 0 ? "−" : ""}${prefixo}${moeda(n)}`;
}

export function percentual(parte: number, todo: number): string {
  const p = todo === 0 ? 0 : (parte / todo) * 100;
  return `${p < 0 ? "−" : ""}${Math.abs(p).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
