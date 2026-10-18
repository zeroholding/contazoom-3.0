import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  montarResolvedorDeCusto,
  TIPO_CUSTO_RETROATIVO,
  type LinhaHistoricoCusto,
} from "@/lib/sku-cost-history";

/**
 * "Usar custo em vendas passadas" (Gestão SKU).
 *
 * O cliente cadastra o primeiro custo errado, corrige depois, e o custo errado
 * continua no CMV de todas as vendas até a correção (cada venda usa o custo que
 * valia na data dela). Aqui ele escolhe usar um custo também no passado: em
 * todas as vendas ("desde o início") ou nas de um período.
 *
 * Grava uma linha `retroativo` em `sku_custo_historico` com a vigência. A regra
 * de qual custo vale em cada data está em `montarResolvedorDeCusto`; as telas que
 * calculam CMV na leitura passam a usar o custo novo sozinhas. O CMV e a margem
 * GRAVADOS nas vendas da janela (lidos pela tela de Anúncios e pelo passo de
 * liquidação do TikTok) são regravados na mesma transação.
 */

export type EscopoCustoNoPassado = "tudo" | "periodo";

export type PedidoCustoNoPassado = {
  escopo: EscopoCustoNoPassado;
  /** Custo unitário a usar, maior que zero, com 2 casas. */
  custo: number;
  /** Início da janela (inclusivo). "tudo" = 1970. */
  inicio: Date;
  /** Fim da janela (exclusivo): dia seguinte ao "até". Nulo em "tudo". */
  fim: Date | null;
  /** "AAAA-MM-DD" informados, só no período. */
  de: string | null;
  ate: string | null;
};

export type LeituraPedido =
  | { ok: true; pedido: PedidoCustoNoPassado }
  | { ok: false; erro: string };

export type ResumoCanal = {
  vendas: number;
  mudam: number;
  cmvAtual: number;
  cmvNovo: number;
};

export type SimulacaoCustoNoPassado = ResumoCanal & {
  porCanal: { mercadoLivre: ResumoCanal; shopee: ResumoCanal; tiktok: ResumoCanal };
};

export type ResultadoCustoNoPassado = {
  vendasAtualizadas: number;
  mercadoLivre: number;
  shopee: number;
  tiktok: number;
};

type SkuAlvo = {
  id: string;
  userId: string;
  sku: string;
  custoUnitario: number | { toString(): string };
  quantidade: number;
};

/** Teto de `Decimal(10, 2)`. */
const CUSTO_MAXIMO = 99_999_999.99;
const FUSO = "America/Sao_Paulo";
const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

// Nomes fixos das tabelas, nunca vindos de entrada do usuário (por isso `raw`).
const TABELAS = [
  { canal: "mercadoLivre", tabela: Prisma.raw('"meli_venda"') },
  { canal: "shopee", tabela: Prisma.raw('"shopee_venda"') },
  { canal: "tiktok", tabela: Prisma.raw('"tiktok_venda"') },
] as const;

type Canal = (typeof TABELAS)[number]["canal"];

/* ------------------------------- datas (SP) ------------------------------- */

/** "AAAA-MM-DD" do instante no fuso de São Paulo (o mesmo do `<input type="date">`). */
export function diaSP(instante: Date): string {
  return instante.toLocaleDateString("en-CA", { timeZone: FUSO });
}

/** Minutos entre o relógio de São Paulo e o UTC naquele instante (-180 hoje). */
function deslocamentoSP(instante: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  const comoUtc = Date.UTC(
    valor("year"),
    valor("month") - 1,
    valor("day"),
    valor("hour"),
    valor("minute"),
    valor("second"),
  );
  return Math.round((comoUtc - Math.floor(instante.getTime() / 1000) * 1000) / 60_000);
}

/** Meia-noite de São Paulo do dia "AAAA-MM-DD". */
export function inicioDoDiaSP(dia: string): Date {
  const [ano, mes, d] = dia.split("-").map(Number);
  const meiaNoiteUtc = Date.UTC(ano, mes - 1, d);
  // O deslocamento é lido ao meio-dia, longe de qualquer virada de horário.
  return new Date(meiaNoiteUtc - deslocamentoSP(new Date(meiaNoiteUtc + 12 * 3_600_000)) * 60_000);
}

function diaSeguinte(dia: string): string {
  const [ano, mes, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, d + 1)).toISOString().slice(0, 10);
}

function dataValida(dia: unknown): dia is string {
  if (typeof dia !== "string") return false;
  const partes = DATA_ISO.exec(dia);
  if (!partes) return false;
  const [, ano, mes, d] = partes.map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, d));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === d;
}

/** "31/03/2026" a partir de "2026-03-31". */
function diaBr(dia: string): string {
  const [ano, mes, d] = dia.split("-");
  return `${d}/${mes}/${ano}`;
}

/** Valor para comparar com as colunas `TIMESTAMP(3)`, que guardam o horário UTC. */
function carimbo(instante: Date): Prisma.Sql {
  return Prisma.sql`${instante.toISOString().slice(0, 23).replace("T", " ")}::timestamp`;
}

/* ------------------------------ leitura ------------------------------ */

function lerCusto(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string") return null;
  const texto = valor.trim().replace(/[^\d,.-]/g, "");
  if (!texto) return null;
  const normalizado = texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Valida o corpo do pedido. `hoje` é "AAAA-MM-DD" em São Paulo: o período não
 * pode terminar depois de hoje (é custo do PASSADO; o de hoje em diante é o
 * custo cadastrado no SKU).
 */
export function lerPedidoCustoNoPassado(corpo: unknown, hoje: string): LeituraPedido {
  const dados = corpo && typeof corpo === "object" ? (corpo as Record<string, unknown>) : {};

  const escopo = dados.escopo;
  if (escopo !== "tudo" && escopo !== "periodo") {
    return { ok: false, erro: "Escolha em quais vendas usar o custo: todas ou um período." };
  }

  const custoLido = lerCusto(dados.custo);
  if (custoLido === null || custoLido <= 0) {
    return { ok: false, erro: "Informe um custo maior que zero." };
  }
  const custo = Math.round(custoLido * 100) / 100;
  if (custo <= 0 || custo > CUSTO_MAXIMO) {
    return { ok: false, erro: "Informe um custo maior que zero e menor que R$ 100 milhões." };
  }

  if (escopo === "tudo") {
    return {
      ok: true,
      pedido: { escopo, custo, inicio: new Date(0), fim: null, de: null, ate: null },
    };
  }

  const { de, ate } = dados;
  if (!dataValida(de) || !dataValida(ate)) {
    return { ok: false, erro: "Informe as duas datas do período (de e até)." };
  }
  if (de > ate) {
    return { ok: false, erro: "A data inicial do período é depois da final." };
  }
  if (ate > hoje) {
    return { ok: false, erro: "O período não pode terminar depois de hoje." };
  }

  return {
    ok: true,
    pedido: {
      escopo,
      custo,
      inicio: inicioDoDiaSP(de),
      fim: inicioDoDiaSP(diaSeguinte(ate)),
      de,
      ate,
    },
  };
}

/** Fim efetivo da janela: nunca depois do momento em que o custo é aplicado. */
function fimEfetivo(pedido: PedidoCustoNoPassado, agora: Date): Date {
  return pedido.fim && pedido.fim.getTime() < agora.getTime() ? pedido.fim : agora;
}

/** Texto do histórico: em quais vendas o custo foi usado. */
export function descreverJanela(pedido: PedidoCustoNoPassado, agora: Date): string {
  if (pedido.escopo === "tudo") {
    return `Custo usado em todas as vendas até ${diaBr(diaSP(agora))}`;
  }
  return `Custo usado nas vendas de ${diaBr(pedido.de!)} a ${diaBr(pedido.ate!)}`;
}

/* ------------------------------ simulação ------------------------------ */

async function historicoDoSku(skuId: string): Promise<LinhaHistoricoCusto[]> {
  return prisma.sKUCustoHistorico.findMany({
    where: { skuId },
    orderBy: { createdAt: "asc" },
    select: { custoNovo: true, createdAt: true, vigenciaInicio: true, vigenciaFim: true },
  });
}

const arredonda = (valor: number) => Math.round(valor * 100) / 100;
const resumoVazio = (): ResumoCanal => ({ vendas: 0, mudam: 0, cmvAtual: 0, cmvNovo: 0 });

/**
 * Quantas vendas do SKU caem na janela e como o CMV delas fica: o de hoje (o que
 * as telas mostram agora) e o que passa a valer. Não grava nada.
 */
export async function simularCustoNoPassado(
  sku: SkuAlvo,
  pedido: PedidoCustoNoPassado,
  agora: Date = new Date(),
): Promise<SimulacaoCustoNoPassado> {
  const historico = await historicoDoSku(sku.id);
  const custoAtual = Number(sku.custoUnitario) || 0;
  const custoHoje = montarResolvedorDeCusto(custoAtual, historico);
  const custoDepois = montarResolvedorDeCusto(custoAtual, [
    ...historico,
    {
      custoNovo: pedido.custo,
      createdAt: agora,
      vigenciaInicio: pedido.inicio,
      vigenciaFim: pedido.fim,
    },
  ]);

  const fim = fimEfetivo(pedido, agora);
  const porCanal = {
    mercadoLivre: resumoVazio(),
    shopee: resumoVazio(),
    tiktok: resumoVazio(),
  } satisfies Record<Canal, ResumoCanal>;

  await Promise.all(
    TABELAS.map(async ({ canal, tabela }) => {
      const vendas = await prisma.$queryRaw<Array<{ data_venda: Date; quantidade: number | null }>>(Prisma.sql`
        SELECT "data_venda", "quantidade"
        FROM ${tabela}
        WHERE "user_id" = ${sku.userId}
          AND "sku" = ${sku.sku}
          AND "data_venda" >= ${carimbo(pedido.inicio)}
          AND "data_venda" < ${carimbo(fim)}
      `);
      const resumo = porCanal[canal];
      for (const venda of vendas) {
        const quantidade = Number(venda.quantidade) || 0;
        const antes = custoHoje(new Date(venda.data_venda));
        const depois = custoDepois(new Date(venda.data_venda));
        resumo.vendas += 1;
        if (Math.abs(antes - depois) > 0.000001) resumo.mudam += 1;
        resumo.cmvAtual += antes * quantidade;
        resumo.cmvNovo += depois * quantidade;
      }
      resumo.cmvAtual = arredonda(resumo.cmvAtual);
      resumo.cmvNovo = arredonda(resumo.cmvNovo);
    }),
  );

  const canais = Object.values(porCanal);
  return {
    vendas: canais.reduce((soma, c) => soma + c.vendas, 0),
    mudam: canais.reduce((soma, c) => soma + c.mudam, 0),
    cmvAtual: arredonda(canais.reduce((soma, c) => soma + c.cmvAtual, 0)),
    cmvNovo: arredonda(canais.reduce((soma, c) => soma + c.cmvNovo, 0)),
    porCanal,
  };
}

/* ------------------------------ aplicação ------------------------------ */

/**
 * Regrava CMV e margem das vendas do SKU na janela com o custo novo.
 *
 * Mesma conta do preenchimento retroativo (src/lib/sku-retroactive-cost.ts):
 * margem = valor total + taxa + frete - CMV (taxa e frete gravados negativos).
 * `is_margem_real` só muda no Mercado Livre, onde quer dizer "a margem tem CMV".
 * Na Shopee e no TikTok a coluna fala do financeiro da plataforma (escrow e
 * extrato) e alimenta as filas de cura e liquidação do sync, então fica como está.
 */
function regravarVendas(
  tabela: Prisma.Sql,
  marcarMargemReal: boolean,
  sku: SkuAlvo,
  custo: number,
  inicio: Date,
  fim: Date,
) {
  const custoExato = new Prisma.Decimal(custo);
  const cmv = Prisma.sql`${custoExato}::numeric * COALESCE("quantidade", 0)`;
  return prisma.$executeRaw(Prisma.sql`
    UPDATE ${tabela}
    SET "cmv" = ROUND(${cmv}, 2),
        "margem_contribuicao" = ROUND(
          COALESCE("valor_total", 0) + COALESCE("taxa_plataforma", 0) + COALESCE("valor_frete", 0) - (${cmv}),
          2
        ),
        ${marcarMargemReal ? Prisma.sql`"is_margem_real" = true,` : Prisma.empty}
        "atualizado_em" = (now() AT TIME ZONE 'UTC')
    WHERE "user_id" = ${sku.userId}
      AND "sku" = ${sku.sku}
      AND "data_venda" >= ${carimbo(inicio)}
      AND "data_venda" < ${carimbo(fim)}
  `);
}

/**
 * Grava o custo no passado e regrava as vendas da janela, tudo numa transação:
 * ou o histórico e as vendas mudam juntos, ou nada muda. Quem chama deve limpar o
 * cache de vendas do usuário depois.
 */
export async function aplicarCustoNoPassado(
  sku: SkuAlvo,
  pedido: PedidoCustoNoPassado,
  alteradoPor: string,
  agora: Date = new Date(),
): Promise<ResultadoCustoNoPassado> {
  const fim = fimEfetivo(pedido, agora);

  const [, mercadoLivre, shopee, tiktok] = await prisma.$transaction([
    prisma.sKUCustoHistorico.create({
      data: {
        skuId: sku.id,
        userId: sku.userId,
        // Num período o custo anterior variava de venda para venda: não há um só.
        custoAnterior: null,
        custoNovo: new Prisma.Decimal(pedido.custo),
        quantidade: sku.quantidade,
        motivo: descreverJanela(pedido, agora),
        tipoAlteracao: TIPO_CUSTO_RETROATIVO,
        alteradoPor,
        createdAt: agora,
        vigenciaInicio: pedido.inicio,
        vigenciaFim: pedido.fim,
      },
    }),
    regravarVendas(TABELAS[0].tabela, true, sku, pedido.custo, pedido.inicio, fim),
    regravarVendas(TABELAS[1].tabela, false, sku, pedido.custo, pedido.inicio, fim),
    regravarVendas(TABELAS[2].tabela, false, sku, pedido.custo, pedido.inicio, fim),
  ]);

  return {
    vendasAtualizadas: mercadoLivre + shopee + tiktok,
    mercadoLivre,
    shopee,
    tiktok,
  };
}
