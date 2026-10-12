/**
 * Conteúdo da landing pública.
 *
 * Tudo aqui descreve o que o sistema FAZ hoje, conferido no código (menus,
 * fluxos de etapa, limites de importação, régua do Estoque Full). O que ainda
 * não existe — integração com Bling, cupons, NFS-e, etiqueta da Shopee e do
 * TikTok — fica de fora de propósito: promessa de landing que o painel não
 * cumpre vira chamado de suporte no primeiro dia.
 */

import {
  CircleHelp,
  Landmark,
  LayoutGrid,
  Percent,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";

/** Âncoras do cabeçalho, na mesma ordem em que as seções aparecem. */
export const LINKS_SECOES: Array<{
  href: string;
  id: string;
  rotulo: string;
  descricao: string;
  Icone: LucideIcon;
}> = [
  { href: "#canais", id: "canais", rotulo: "Canais", descricao: "Mercado Livre, Shopee e TikTok Shop", Icone: RefreshCw },
  { href: "#margem", id: "margem", rotulo: "Margem", descricao: "Quanto sobra de cada venda", Icone: Percent },
  { href: "#produto", id: "produto", rotulo: "Produto", descricao: "Os módulos do painel", Icone: LayoutGrid },
  { href: "#contabilidade", id: "contabilidade", rotulo: "Contabilidade", descricao: "Impostos e CNPJ em dia", Icone: Landmark },
  { href: "#duvidas", id: "duvidas", rotulo: "Dúvidas", descricao: "Perguntas frequentes", Icone: CircleHelp },
];

export type Canal = "ML" | "SP" | "TT";

export const NOME_CANAL: Record<Canal, string> = {
  ML: "Mercado Livre",
  SP: "Shopee",
  TT: "TikTok Shop",
};

/**
 * As cinco vendas de EXEMPLO. As mesmas linhas aparecem no painel da lupa e no
 * explorador de margem, então os números precisam fechar: margem = valor −
 * taxa − frete − imposto − CMV, imposto = 6% do valor.
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
  /** Linha miúda do painel da lupa (só legível ampliada). */
  detalhe: string;
  /** O que a venda conta, no explorador de margem. */
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
    detalhe: "Premium · Coleta · comissão 12% · imposto 6% (R$ 11,39) · custo do SKU vigente na data da venda",
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
    leitura: "É um kit: o custo soma os três itens (3 × R$ 18,20), e comissão mais taxa de serviço levam 22% da venda.",
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
    detalhe: "Financeiro estimado · vira o valor real quando o pedido liquidar · imposto 6% (R$ 5,39)",
    leitura: "A taxa ainda é estimada. Quando o pedido liquidar, o ContaZoom troca pelo valor real do extrato.",
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
    detalhe: "Clássico · Full · comissão 13% · imposto 6% (R$ 14,94)",
    leitura: "A venda de maior valor da lista, mas o custo do produto leva 59% dela. Sobram só 11,6%.",
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
    detalhe: "Flex: repasse R$ 1,10 − custo R$ 11,90 do pacote = −R$ 10,80 · imposto 6% (R$ 2,39)",
    leitura: "Prejuízo escondido: o Flex cobrou R$ 11,90 pelo pacote e repassou R$ 1,10. O frete levou 27% da venda.",
  },
];

const centavos = (n: number) => Math.round(n * 100) / 100;

export function margemDe(v: VendaExemplo): number {
  return centavos(v.valor - v.taxa - v.frete - v.imposto - v.cmv);
}

/** "1.234,56", sem símbolo. Mesmo resultado no servidor e no navegador. */
export function moeda(n: number): string {
  return Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Valor com o sinal de menos tipográfico (−), não o hífen. */
export function comSinal(n: number, prefixo = ""): string {
  return `${n < 0 ? "−" : ""}${prefixo}${moeda(n)}`;
}

export function percentual(parte: number, todo: number): string {
  const p = todo === 0 ? 0 : (parte / todo) * 100;
  return `${p < 0 ? "−" : ""}${Math.abs(p).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
