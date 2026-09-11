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

import type { ReactNode } from "react";

import {
  Miniatura,
  Paginacao as PaginacaoBase,
  Selo,
  type TomSelo,
} from "../comum/shell";
import { brl, dataCurta, horaCurta, inteiro, type Linha } from "./tipos";

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
    <p className="mt-3 text-[12.5px] leading-relaxed text-amber-700">
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
    <div className="mt-4 rounded-[var(--cz-raio-cartao)] border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] leading-relaxed text-sky-900">
      <strong>{inteiro(pendentes)} venda(s)</strong> ainda estão sendo associadas ao
      anúncio de origem. O ranking já funciona, mas fica mais completo a cada
      carregamento desta tela — o preenchimento é automático e não consome a API do
      Mercado Livre.
    </div>
  );
}

export function RodapeFonte() {
  return (
    <p className="mt-4 max-w-4xl text-[12.5px] leading-relaxed text-[var(--cz-texto-suave)]">
      Estoque, preço e situação são lidos no Mercado Livre a cada carregamento — não
      ficam guardados no banco, porque mudam a cada venda. Estoque em branco significa
      que a API não respondeu para aquele anúncio, e não que ele está zerado. A lista
      só inclui anúncios que já venderam ao menos uma vez.
    </p>
  );
}

/**
 * O aviso de que a linha mistura dois tempos.
 *
 * Fica ACIMA da tabela, não no rodapé. A informação "preço e estoque são de
 * agora, não da época da venda" só serve se for lida ANTES de alguém usar o
 * número — e ninguém rola até o rodapé antes de olhar a coluna. O rodapé continua
 * existindo com o detalhe técnico; aqui vai a frase curta que muda a leitura.
 */
export function AvisoDoisTempos() {
  return (
    // Legenda, com a cara de legenda: duas pastilhas com fio, não três frases de
    // 11,5px encostadas numa faixa cinza. A terceira frase virou a segunda linha,
    // em tinta suave — ela qualifica a primeira pastilha e não é um terceiro item
    // da mesma lista, que era como se lia quando as três dividiam a linha.
    <div className="mt-4 rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-fundo)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold leading-none text-emerald-800">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Situação, estoque e preço: <span className="font-bold">agora</span> no
          Mercado Livre
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-2.5 py-1 text-[12px] font-semibold leading-none text-[var(--cz-texto-suave)]">
          <span className="size-1.5 rounded-full bg-[var(--cz-texto-fraco)]" />
          Unidades, faturamento e última venda:{" "}
          <span className="font-bold">histórico</span> do período
        </span>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--cz-texto-suave)]">
        O preço exibido é o da etiqueta hoje, não o preço praticado nas vendas
        listadas.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Células da tabela de anúncios                     */
/* -------------------------------------------------------------------------- */

/** A célula do anúncio: miniatura, título, MLB, conta, SKU e modalidade. */
export function CelulaAnuncio({ l, posicao }: { l: Linha; posicao?: number }) {
  return (
    // `items-start` e não `items-center`: com o título em duas linhas, centralizar
    // deixaria a miniatura flutuando no meio de um bloco alto, desalinhada da
    // primeira linha do texto que ela ilustra.
    <td className="py-3.5 pl-5 pr-3">
      <div className="flex items-start gap-3">
        {posicao !== undefined && (
          // Verde no pódio é SEMÂNTICO (é o topo do ranking), então não virou
          // laranja junto com as cores de ação. Os três primeiros ganharam
          // cápsula: num ranking, saber que a linha é o 1º ou o 12º é a primeira
          // pergunta, e um número cinza de 13px solto ao lado da foto não
          // respondia.
          <span
            className={`mt-1 grid size-6 shrink-0 place-items-center rounded-full text-[12.5px] font-bold tabular-nums ${
              posicao <= 3
                ? "bg-emerald-100 text-emerald-800"
                : "text-[var(--cz-texto-fraco)]"
            }`}
            aria-label={`Posição ${posicao}`}
          >
            {posicao}
          </span>
        )}
        <Miniatura src={l.thumbnailUrl} alt={l.titulo} />
        <div className="min-w-0">
          {/*
            DUAS LINHAS, e não uma com reticências.
            Título de anúncio no Mercado Livre é longo por construção (o vendedor
            enfia marca, modelo, voltagem e cor para ganhar busca), e cortar na
            primeira linha some justamente com o que diferencia dois anúncios
            parecidos — "Ventilador 40cm PRETO" e "Ventilador 40cm BRANCO" ficam
            idênticos na tela. Duas linhas cabem sem esticar a tabela, que é o que
            permite a tela viver sem scroll horizontal.
          */}
          <span
            className="block text-[13.5px] font-semibold leading-snug text-[var(--cz-texto)] line-clamp-2"
            title={l.titulo}
          >
            {l.titulo}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
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

/*
 * `CelulaEstoque` e `CelulaPreco` saíram daqui.
 *
 * Eram duas colunas de uma célula cada, e junto com "Situação" formavam três
 * colunas para três dados que se leem juntos e têm a mesma natureza (leitura ao
 * vivo do Mercado Livre). Viraram `CelulaAgora`, logo abaixo. Removidas em vez de
 * mantidas "por segurança": export sem uso é o que deixa duas formas de desenhar
 * a mesma coisa no código, e foi assim que a lista de colunas das telas de vendas
 * passou a descrever uma tabela que não existia mais.
 */

/**
 * O botão de abrir no Mercado Livre, SEM a célula em volta.
 *
 * Separado de `CelulaAbrir` porque a ação deixou de merecer uma coluna própria: um
 * ícone de 36px numa coluna inteira era largura gasta para nada, e largura é
 * exatamente o que faltava para a tabela caber sem scroll. Agora ele mora dentro
 * de outra célula, e quem quiser a coluna dedicada continua usando `CelulaAbrir`.
 */
export function LinkAbrir({ l }: { l: Linha }) {
  if (!l.permalink) {
    return <span className="text-[var(--cz-texto-fraco)]">—</span>;
  }
  return (
    // Abrir no ML é uma AÇÃO, então o realce de hover é laranja. Era verde, que
    // nesta tela já significa "estoque saudável" e "pódio".
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
  );
}

export function CelulaAbrir({ l }: { l: Linha }) {
  return (
    <td className="py-3 pl-3 pr-5 text-right">
      <LinkAbrir l={l} />
    </td>
  );
}

/* -------------------------------------------------------------------------- */
/*                  Cabeçalho de grupo: AGORA vs. HISTÓRICO                   */
/* -------------------------------------------------------------------------- */

/**
 * Cabeçalho de coluna com uma segunda linha dizendo A QUE MOMENTO o dado se
 * refere.
 *
 * É o ponto central deste ajuste. A tabela mistura duas naturezas de dado na
 * mesma linha e nada dizia isso:
 *
 *   • situação, estoque e preço são LIDOS AGORA no Mercado Livre, a cada
 *     carregamento da tela;
 *   • unidades, faturamento e última venda são o HISTÓRICO de vendas do período
 *     escolhido no filtro.
 *
 * Sem a distinção, é natural ler "R$ 89,90" como o preço pelo qual aquelas 40
 * unidades foram vendidas — e não é: é o preço da etiqueta neste instante, que
 * pode ter mudado ontem. Quem calcula margem com esse número erra a conta e não
 * tem como saber.
 *
 * A nota de rodapé já explicava, mas rodapé não é lido na hora de olhar a coluna.
 * O lugar de dizer "isto é de agora" é no cabeçalho da coluna que mostra isso.
 */
export function ThGrupo({
  titulo,
  momento,
  align = "left",
  className = "",
}: {
  titulo: string;
  /** "agora no Mercado Livre" / "no período" — a segunda linha. */
  momento: string;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 font-bold align-bottom ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      <span className="block">{titulo}</span>
      {/* 10,5px, e não 9. Nove pixels é menor que qualquer coisa no resto do
          produto: a linha que existe justamente para avisar "este dado é de agora"
          era a que menos se conseguia ler. */}
      <span className="mt-0.5 block text-[10.5px] font-semibold normal-case tracking-normal text-[var(--cz-texto-fraco)]">
        {momento}
      </span>
    </th>
  );
}

/**
 * Situação, estoque e preço numa célula só — o bloco do "agora".
 *
 * Eram três colunas separadas, e junto com as outras sete faziam a tabela pedir
 * `min-w-[1120px]` e scroll horizontal. Agrupar não é só economia de largura:
 * põe lado a lado os três dados que compartilham a mesma natureza (leitura ao
 * vivo do Mercado Livre) e que se leem juntos — "pausado, 0 em estoque" é uma
 * frase, não três números soltos em colunas distantes.
 */
export function CelulaAgora({
  l,
  extra,
}: {
  l: Linha;
  /** Espaço para algo específico da tela, como a cobertura de estoque. */
  extra?: ReactNode;
}) {
  return (
    <td className="px-3 py-3.5">
      <div className="flex flex-col items-start gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <SeloStatus status={l.status} />
          {l.subStatus.includes("out_of_stock") && (
            <span className="text-[11px] font-semibold text-amber-700">
              pausado por falta de estoque
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px]">
          {/* Estoque tem TRÊS estados e não dois: número, `0` (esgotado) e vazio
              (a API não respondeu). Mostrar vazio como zero faria a tela afirmar
              que o anúncio está sem estoque quando ela apenas não sabe — e alguém
              compra mercadoria por causa disso. */}
          {l.estoque === null ? (
            <span
              className="text-[var(--cz-texto-fraco)]"
              title="O Mercado Livre não respondeu o estoque deste anúncio"
            >
              estoque —
            </span>
          ) : (
            <span
              className={`font-bold tabular-nums ${
                l.estoque === 0 ? "text-rose-700" : "text-[var(--cz-texto)]"
              }`}
            >
              {inteiro(l.estoque)}
              <span className="ml-0.5 text-[11px] font-medium text-[var(--cz-texto-fraco)]">
                un.
              </span>
            </span>
          )}

          <span className="text-[var(--cz-hairline-forte)]">·</span>

          <span className="tabular-nums text-[var(--cz-texto-suave)]">
            {l.preco === null ? "—" : brl(l.preco)}
          </span>
        </div>

        {extra}
      </div>
    </td>
  );
}

/**
 * Última venda com DATA E HORA, em duas linhas.
 *
 * A hora estava sendo jogada fora por `dataCurta`, embora o dado sempre a tivesse
 * (`ultima_venda` é `MAX(data_venda)`, um timestamp). E ela é o que distingue
 * "vendeu hoje de manhã" de "vendeu hoje às 23h50" — duas leituras diferentes numa
 * tela cujo assunto é justamente há quanto tempo o anúncio não vende.
 *
 * Duas linhas e não uma: "09/09/26 14:32" numa linha só alarga a coluna, e largura
 * é exatamente o que falta para esta tabela caber sem scroll.
 */
export function UltimaVenda({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-[var(--cz-texto-fraco)]">—</span>;
  return (
    <>
      <span className="block font-semibold tabular-nums text-[12.5px] text-[var(--cz-texto)]">
        {dataCurta(iso)}
      </span>
      <span className="block text-[11.5px] tabular-nums text-[var(--cz-texto-suave)]">
        {horaCurta(iso)}
      </span>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Selos                                    */
/* -------------------------------------------------------------------------- */

/**
 * Situação do anúncio no Mercado Livre.
 *
 * Passou a usar o `Selo` do kit em vez de desenhar a própria cápsula. As duas
 * formas conviviam na MESMA linha da tabela — este selo sem fio em 10,5px, e o
 * `Selo` de "esgotado"/"Repor estoque" com fio em 10,5px — o que dava duas
 * pastilhas de contorno diferente encostadas. Uma forma só é metade do que faz a
 * tela parecer do mesmo sistema.
 */
export function SeloStatus({ status }: { status: string | null }) {
  const mapa: Record<string, { texto: string; tom: TomSelo }> = {
    active: { texto: "Ativo", tom: "bom" },
    paused: { texto: "Pausado", tom: "alerta" },
    closed: { texto: "Finalizado", tom: "critico" },
    under_review: { texto: "Em revisão", tom: "info" },
  };
  const m = status ? mapa[status] : undefined;
  if (!m) {
    return (
      <Selo titulo="A API do Mercado Livre não respondeu para este anúncio">
        Não consultado
      </Selo>
    );
  }
  return <Selo tom={m.tom}>{m.texto}</Selo>;
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
    <span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-bold leading-none text-indigo-700">
      {mapa[tipo] ?? tipo}
    </span>
  );
}


