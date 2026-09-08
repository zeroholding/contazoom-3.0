"use client";

/**
 * Peças específicas das telas de ANÚNCIOS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE ARQUIVO ERA UM SEGUNDO SHELL, E ELE JÁ HAVIA DIVERGIDO
 *
 * Antes daqui, este arquivo tinha a própria `MolduraTela`, o próprio `Cabecalho`,
 * o próprio `Kpi`, a própria `Paginacao` — cópias do que vive em
 * `views/comum/shell.tsx`. O comentário original dizia que duplicar faria as
 * telas divergirem "no detalhe que ninguém aponta e todo mundo sente". Foi
 * exatamente o que aconteceu: quando o painel inteiro passou para a linguagem da
 * tela de login, esta cópia ficou atrás e as duas telas de anúncios saíram
 * diferentes de todas as outras —
 *
 *   • botão "Atualizar estoque" VERDE, enquanto o resto do app é laranja;
 *   • título em `text-xl font-bold`, menor e sem o tracking de `.cz-titulo`;
 *   • recolher o menu não encolhia a barra, porque esta cópia da moldura nunca
 *     atualizava `--sidebar-w` (o defeito já corrigido no shell compartilhado);
 *   • a preferência de menu recolhido se perdia ao navegar para cá, porque esta
 *     cópia não lia o `localStorage`;
 *   • cabeçalho de tabela, paginação e miniatura em cinza fora dos tokens.
 *
 * Agora a moldura e as peças genéricas são REEXPORTADAS do shell compartilhado.
 * As duas telas continuam importando os mesmos nomes deste arquivo, então nada
 * mudou para elas — mas passa a existir um só lugar onde a moldura é definida.
 *
 * O que fica aqui é o que é de anúncios de verdade: as células da tabela, os
 * selos de situação e de envio, e os avisos próprios do módulo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Miniatura, Paginacao as PaginacaoBase } from "../comum/shell";
import { brl, inteiro, type Linha } from "./tipos";

/* -------------------------------------------------------------------------- */
/*                  Moldura e peças genéricas: vêm do shell                   */
/* -------------------------------------------------------------------------- */

/**
 * Reexportado, não recriado.
 *
 * As telas de anúncios importam estes nomes deste arquivo desde que foram
 * escritas. Reexportar mantém o import delas intacto e ao mesmo tempo garante
 * que elas recebam a mesma moldura, o mesmo botão e o mesmo indicador que todas
 * as outras telas — inclusive as correções futuras.
 */
export {
  Aviso,
  BotaoAtualizar,
  Cabecalho,
  CabecalhoTabela,
  Campo,
  Esqueleto,
  Kpi,
  MolduraTela,
  PainelFiltros,
  Th,
} from "../comum/shell";

/**
 * Paginação com o rótulo padrão desta área.
 *
 * O invólucro existe por um motivo pequeno e real: o shell tem
 * `rotulo = "registros"` e `AnunciosMaisVendidos` nunca passa esse prop, porque
 * a cópia antiga daqui tinha `"anúncios"` como padrão. Reexportar direto trocaria
 * "1 a 20 de 340 anúncios" por "…340 registros" sem ninguém pedir.
 */
export function Paginacao(
  props: Omit<Parameters<typeof PaginacaoBase>[0], "rotulo"> & { rotulo?: string },
) {
  return <PaginacaoBase rotulo="anúncios" {...props} />;
}

/* -------------------------------------------------------------------------- */
/*                          Avisos próprios do módulo                         */
/* -------------------------------------------------------------------------- */

/** Aviso de que o filtro escolhido obriga a consultar a API em tudo. */
export function NotaFiltroCaro({ visivel }: { visivel: boolean }) {
  if (!visivel) return null;
  return (
    <p className="mt-3 text-[11.5px] leading-relaxed text-amber-700">
      Filtrar por situação ou estoque exige consultar o Mercado Livre em todos os
      anúncios da lista, e não só nos exibidos — pode levar alguns segundos a mais.
    </p>
  );
}

/**
 * Aviso do backfill do `item_id`.
 *
 * Enquanto as vendas antigas não estão associadas ao anúncio, o ranking pode
 * estar incompleto. Mostrar número incompleto sem avisar é pior que demorar:
 * alguém decidiria compra com base num "mais vendido" que não é o verdadeiro.
 */
export function AvisoBackfill({ pendentes }: { pendentes: number }) {
  if (pendentes === 0) return null;
  return (
    <div className="mt-4 rounded-[var(--cz-raio)] border border-sky-200 bg-sky-50 px-4 py-3 text-[12px] leading-relaxed text-sky-900">
      <strong>{inteiro(pendentes)} venda(s)</strong> ainda estão sendo associadas ao
      anúncio de origem. O ranking já funciona, mas fica mais completo a cada
      carregamento desta tela — o preenchimento é automático e não consome a API do
      Mercado Livre.
    </div>
  );
}

export function RodapeFonte() {
  return (
    <p className="mt-4 text-[11.5px] leading-relaxed text-[var(--cz-texto-suave)]">
      Estoque, preço e situação são lidos no Mercado Livre a cada carregamento — não
      ficam guardados no banco, porque mudam a cada venda. Estoque em branco significa
      que a API não respondeu para aquele anúncio, e não que ele está zerado. A lista
      só inclui anúncios que já venderam ao menos uma vez.
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Células da tabela de anúncios                     */
/* -------------------------------------------------------------------------- */

/** A célula do anúncio: miniatura, título, MLB, conta, SKU e modalidade. */
export function CelulaAnuncio({ l, posicao }: { l: Linha; posicao?: number }) {
  return (
    <td className="py-3 pl-5 pr-3">
      <div className="flex items-center gap-3">
        {posicao !== undefined && (
          // Verde no pódio é SEMÂNTICO (é o topo do ranking), então não virou
          // laranja junto com as cores de ação.
          <span
            className={`w-6 shrink-0 text-center text-[13px] font-bold tabular-nums ${
              posicao <= 3 ? "text-emerald-700" : "text-[var(--cz-texto-fraco)]"
            }`}
            aria-label={`Posição ${posicao}`}
          >
            {posicao}
          </span>
        )}
        <Miniatura src={l.thumbnailUrl} alt={l.titulo} />
        <div className="min-w-0">
          <span
            className="block truncate font-semibold text-[var(--cz-texto)]"
            title={l.titulo}
          >
            {l.titulo}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
            <span className="rounded bg-[var(--cz-fundo)] px-1.5 py-0.5 font-mono text-[var(--cz-texto-suave)]">
              {l.itemId}
            </span>
            {/* A conta era uma pastilha VERDE. Nome de conta é identidade, não
                estado: pintá-la de verde disputava significado com o verde que
                nesta mesma tela quer dizer "bom". Agora é neutra com fio. */}
            <span className="rounded-full bg-[var(--cz-fundo)] px-2 py-0.5 font-semibold text-[var(--cz-texto-suave)] ring-1 ring-inset ring-[var(--cz-hairline-forte)]">
              {l.conta}
            </span>
            {l.skus.length > 0 && (
              <span
                className="truncate font-mono text-[var(--cz-texto-suave)]"
                title={l.skus.join(" · ")}
              >
                {l.skus.length <= 2
                  ? l.skus.join(" · ")
                  : `${l.skus.slice(0, 2).join(" · ")} +${l.skus.length - 2}`}
              </span>
            )}
            {l.logisticType && <SeloEnvio tipo={l.logisticType} />}
          </span>
        </div>
      </div>
    </td>
  );
}

/**
 * A coluna de estoque.
 *
 * Três estados e não dois: número, `0` (esgotado) e vazio (a API não respondeu).
 * Mostrar vazio como zero faria a tela afirmar que o anúncio está sem estoque
 * quando ela apenas não sabe — e alguém compra mercadoria por causa disso.
 */
export function CelulaEstoque({ estoque }: { estoque: number | null }) {
  if (estoque === null) {
    return (
      <td className="px-3 py-3 text-right">
        <span
          className="text-[var(--cz-texto-fraco)]"
          title="A API do Mercado Livre não respondeu"
        >
          —
        </span>
      </td>
    );
  }
  return (
    <td className="px-3 py-3 text-right">
      <span
        className={`font-semibold tabular-nums ${
          estoque === 0 ? "text-rose-700" : "text-[var(--cz-texto)]"
        }`}
      >
        {inteiro(estoque)}
        <span className="ml-1 text-[10.5px] font-medium text-[var(--cz-texto-fraco)]">
          un.
        </span>
      </span>
    </td>
  );
}

export function CelulaAbrir({ l }: { l: Linha }) {
  return (
    <td className="py-3 pl-3 pr-5 text-right">
      {l.permalink ? (
        // Abrir no ML é uma AÇÃO, então o realce de hover é laranja. Era verde,
        // que nesta tela já significa "estoque saudável" e "pódio".
        <a
          href={l.permalink}
          target="_blank"
          rel="noreferrer"
          title={`Abrir ${l.titulo} no Mercado Livre`}
          className="inline-grid size-9 place-items-center rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] text-[var(--cz-texto-suave)] transition hover:border-[var(--cz-laranja-borda)] hover:bg-[var(--cz-laranja-suave)] hover:text-[var(--cz-laranja-forte)]"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
          </svg>
        </a>
      ) : (
        <span className="text-[var(--cz-texto-fraco)]">—</span>
      )}
    </td>
  );
}

export function CelulaPreco({ preco }: { preco: number | null }) {
  return (
    <td className="px-3 py-3 text-right tabular-nums text-[var(--cz-texto-suave)]">
      {preco === null ? "—" : brl(preco)}
    </td>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Selos                                    */
/* -------------------------------------------------------------------------- */

export function SeloStatus({ status }: { status: string | null }) {
  const mapa: Record<string, { texto: string; casca: string }> = {
    active: { texto: "Ativo", casca: "bg-emerald-50 text-emerald-700" },
    paused: { texto: "Pausado", casca: "bg-amber-50 text-amber-700" },
    closed: { texto: "Finalizado", casca: "bg-rose-50 text-rose-700" },
    under_review: { texto: "Em revisão", casca: "bg-sky-50 text-sky-700" },
  };
  const m = status ? mapa[status] : undefined;
  if (!m) {
    return (
      <span
        className="rounded-full bg-[var(--cz-fundo)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--cz-texto-suave)]"
        title="A API do Mercado Livre não respondeu para este anúncio"
      >
        Não consultado
      </span>
    );
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${m.casca}`}>
      {m.texto}
    </span>
  );
}

/**
 * Modalidade de envio.
 *
 * Mantida em índigo de propósito, mesmo sendo cor fora da paleta: é o único
 * lugar da linha onde a modalidade aparece, e é o que o operador varre com o
 * olho. Neutralizar o selo para ficar "na paleta" tornaria FULL e FLEX difíceis
 * de distinguir num relance, o que é perder informação para ganhar coerência.
 */
export function SeloEnvio({ tipo }: { tipo: string }) {
  const mapa: Record<string, string> = {
    fulfillment: "FULL",
    self_service: "FLEX",
    cross_docking: "Coleta",
    drop_off: "Agência",
    xd_drop_off: "Agência",
  };
  return (
    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
      {mapa[tipo] ?? tipo}
    </span>
  );
}


