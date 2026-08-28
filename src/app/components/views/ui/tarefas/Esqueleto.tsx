"use client";

/**
 * Esqueletos de carregamento do módulo.
 *
 * Um spinner centralizado num vazio comunica "travou". Um esqueleto com a FORMA
 * do conteúdo comunica "está vindo, e vai ser assim" — e, porque ocupa a mesma
 * altura do conteúdo real, elimina o salto de layout no momento em que o dado
 * chega. Cada peça aqui copia o espaçamento do bloco de verdade que substitui.
 *
 * Acessibilidade: o desenho é decorativo (`aria-hidden`), e cada composição
 * carrega um `role="status"` invisível. Sem isso, quem usa leitor de tela ouve
 * silêncio absoluto durante o carregamento e não sabe se a página parou.
 * Composições que embrulham outras (`EsqueletoPainel`) colocam o filho dentro
 * do bloco `aria-hidden` para não anunciar a mesma coisa duas vezes.
 *
 * O brilho da animação e a cor vêm de `.cz-esqueleto`, em globals.css, que já
 * respeita `prefers-reduced-motion`.
 */

import { ReactNode } from "react";

/* ------------------------------ Peça básica ------------------------------- */

type LinhaProps = {
  /**
   * Largura em CSS (`"60%"`, `"8rem"`).
   *
   * Medida vai em prop, não em classe: `.cz-esqueleto` é declarado depois do
   * Tailwind em globals.css, então `w-*`/`rounded-*` perderiam a disputa. O
   * estilo inline sempre ganha.
   */
  largura?: string;
  /** Altura em CSS. O padrão equivale a uma linha de texto de 14px. */
  altura?: string;
  /** Círculo em vez de bloco. Para avatar e marcador de etapa. */
  redondo?: boolean;
  className?: string;
};

export function Linha({
  largura = "100%",
  altura = "0.875rem",
  redondo = false,
  className = "",
}: LinhaProps) {
  return (
    <div
      aria-hidden="true"
      className={`cz-esqueleto ${className}`}
      style={{
        width: largura,
        height: altura,
        ...(redondo ? { borderRadius: "9999px" } : null),
      }}
    />
  );
}

/** Anúncio para leitor de tela. O resto do esqueleto é decoração. */
function Anuncio({ texto }: { texto: string }) {
  return (
    <p role="status" className="sr-only">
      {texto}
    </p>
  );
}

/* --------------------------------- Casca ---------------------------------- */

const CASCA =
  "rounded-xl border border-[var(--cz-hairline)] bg-white shadow-[var(--cz-elev-1)]";

/**
 * Casca do `Painel` em estado fantasma.
 *
 * Serve para embrulhar os esqueletos de tabela, lista e ficha, que sozinhos não
 * têm borda nem fundo — igual ao `Painel` de verdade, que também não dá padding
 * ao conteúdo.
 */
export function EsqueletoPainel({
  children,
  comCabecalho = true,
  rotulo = "Carregando conteúdo",
}: {
  children?: ReactNode;
  /** Linha de título fantasma no topo. */
  comCabecalho?: boolean;
  rotulo?: string;
}) {
  return (
    <section className={`overflow-hidden ${CASCA}`}>
      <Anuncio texto={rotulo} />
      {/* O filho fica dentro do bloco escondido de propósito: se ele trouxer o
          próprio `role="status"`, sai da árvore de acessibilidade e o leitor de
          tela anuncia o carregamento uma vez, não duas. */}
      <div aria-hidden="true">
        {comCabecalho && (
          <div className="flex items-center justify-between gap-3 border-b border-[var(--cz-hairline)] px-5 py-4">
            <div className="min-w-0 flex-1 space-y-2">
              <Linha largura="11rem" altura="0.9375rem" />
              <Linha largura="60%" altura="0.75rem" />
            </div>
            <Linha largura="6rem" altura="2.25rem" className="shrink-0" />
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

/* ----------------------------------- KPI ---------------------------------- */

/**
 * Cartão de KPI fantasma, sem anúncio.
 *
 * A geometria é espelho do `CartaoKpi` de Base.tsx: mesma casca, mesmo
 * `px-5 pb-4 pt-4`, mesmo bloco de ícone de 32px e mesma linha de número de
 * 28px — dá 126px de altura nos dois. Se o cartão de lá mudar de altura, este
 * muda junto, senão a grade salta quando o dado chega.
 */
function CartaoFantasma() {
  return (
    <div className={`relative h-full overflow-hidden ${CASCA}`}>
      {/* Barra de acento em cinza: o tom só se conhece com o dado na mão. */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-[#EFF1F4]" />
      <div className="flex flex-col px-5 pb-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <Linha largura="70%" altura="0.6875rem" className="mt-1" />
          <Linha largura="2rem" altura="2rem" className="shrink-0" />
        </div>
        <Linha largura="4.5rem" altura="1.75rem" className="mt-2.5" />
        <Linha largura="85%" altura="0.6875rem" className="mt-3" />
      </div>
    </div>
  );
}

/** Um cartão de KPI isolado. É o que `CartaoKpi carregando` renderiza. */
export function EsqueletoCartaoKpi({
  rotulo = "Carregando indicador",
}: {
  rotulo?: string;
}) {
  return (
    <div className="h-full">
      <Anuncio texto={rotulo} />
      <div aria-hidden="true" className="h-full">
        <CartaoFantasma />
      </div>
    </div>
  );
}

/**
 * Grades de KPI, casadas com as que as telas usam: `sm:grid-cols-2` e três ou
 * quatro colunas no `xl`, com `gap-4`. Classe literal porque o Tailwind lê o
 * fonte para gerar o CSS e não resolve nome de classe montado em tempo de
 * execução. Quantidade fora do mapa cai na grade de quatro.
 */
const GRADE_KPI: Record<number, string> = {
  1: "grid gap-4",
  2: "grid gap-4 sm:grid-cols-2",
  3: "grid gap-4 sm:grid-cols-2 xl:grid-cols-3",
  4: "grid gap-4 sm:grid-cols-2 xl:grid-cols-4",
  5: "grid gap-4 sm:grid-cols-2 xl:grid-cols-3",
  6: "grid gap-4 sm:grid-cols-2 xl:grid-cols-3",
};

export function EsqueletoKpi({
  quantidade = 4,
  rotulo = "Carregando indicadores",
}: {
  quantidade?: number;
  rotulo?: string;
}) {
  const total = Math.max(1, Math.round(quantidade));

  return (
    <div>
      <Anuncio texto={rotulo} />
      <div aria-hidden="true" className={GRADE_KPI[total] ?? GRADE_KPI[4]}>
        {Array.from({ length: total }, (_, i) => (
          <CartaoFantasma key={i} />
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- Tabela --------------------------------- */

/** Mesmo motivo de `GRADE_KPI`: classe literal, senão o Tailwind não a gera. */
const COLUNAS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
  7: "grid-cols-7",
  8: "grid-cols-8",
};

/**
 * Larguras em ciclo.
 *
 * Todas as células com a mesma largura viram um paredão de retângulos, que lê
 * como imagem quebrada. O ciclo é fixo (nunca aleatório) porque valor sorteado
 * no servidor não bate com o do cliente e o React reclama de hidratação.
 */
const LARGURAS = ["78%", "52%", "64%", "40%", "70%", "46%", "58%", "34%"];

export function EsqueletoTabela({
  linhas = 8,
  colunas = 5,
  rotulo = "Carregando registros",
}: {
  linhas?: number;
  colunas?: number;
  rotulo?: string;
}) {
  const cols = Math.max(2, Math.min(8, Math.round(colunas)));
  const rows = Math.max(1, Math.round(linhas));
  const grade = COLUNAS[cols] ?? COLUNAS[5];

  return (
    <div>
      <Anuncio texto={rotulo} />
      <div aria-hidden="true">
        {/* Mesmo `px-5 py-3` e mesmo fundo do `thead` das telas. */}
        <div
          className={`grid ${grade} gap-4 border-b border-[var(--cz-hairline)] bg-gray-50 px-5 py-3`}
        >
          {Array.from({ length: cols }, (_, c) => (
            <Linha key={c} largura={c === 0 ? "60%" : "45%"} altura="0.6875rem" />
          ))}
        </div>
        <div className="divide-y divide-gray-100">
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} className={`grid ${grade} items-center gap-4 px-5 py-3`}>
              {Array.from({ length: cols }, (_, c) => (
                <Linha
                  key={c}
                  largura={LARGURAS[(r + c * 3) % LARGURAS.length]}
                  altura="0.875rem"
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Lista --------------------------------- */

/**
 * Lista de cartões.
 *
 * A legalização e o painel mostram cartão em `ul.space-y-3`, não tabela. O
 * cartão de lá é `p-5` com duas colunas: identificação e selos à esquerda,
 * etapa e progresso numa coluna de 288px à direita. É essa forma que este
 * esqueleto reserva.
 */
export function EsqueletoLista({
  linhas = 4,
  rotulo = "Carregando lista",
}: {
  linhas?: number;
  rotulo?: string;
}) {
  const rows = Math.max(1, Math.round(linhas));

  return (
    <div>
      <Anuncio texto={rotulo} />
      <div aria-hidden="true" className="space-y-3">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className={`p-5 ${CASCA}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Linha largura="1.75rem" altura="1.75rem" className="shrink-0" />
                  <Linha
                    largura={LARGURAS[r % LARGURAS.length]}
                    altura="0.875rem"
                  />
                </div>
                <Linha largura="55%" altura="0.75rem" />
                {/* Selos são pílulas: retângulo aqui entregaria forma errada. */}
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <Linha largura="6rem" altura="1.5rem" redondo />
                  <Linha largura="4.5rem" altura="1.5rem" redondo />
                  <Linha largura="5.5rem" altura="1.5rem" redondo />
                </div>
              </div>

              <div className="w-full shrink-0 space-y-2 lg:w-72">
                <div className="flex items-center justify-between gap-2">
                  <Linha largura="5rem" altura="0.6875rem" />
                  <Linha largura="4rem" altura="0.6875rem" />
                </div>
                <Linha largura="80%" altura="0.875rem" />
                <Linha
                  largura="100%"
                  altura="0.375rem"
                  redondo
                  className="mt-2"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------- Ficha --------------------------------- */

/**
 * Grade de pares rótulo/valor das telas de detalhe.
 *
 * Copia o `grid gap-5 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4` que as fichas de
 * verdade usam, para o bloco não encolher quando o dado entra.
 */
export function EsqueletoFicha({
  campos = 8,
  rotulo = "Carregando dados",
}: {
  campos?: number;
  rotulo?: string;
}) {
  const total = Math.max(1, Math.round(campos));

  return (
    <div>
      <Anuncio texto={rotulo} />
      <div
        aria-hidden="true"
        className="grid gap-5 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className="min-w-0 space-y-2">
            <Linha largura={i % 2 === 0 ? "4.5rem" : "5.5rem"} altura="0.625rem" />
            <Linha largura={LARGURAS[i % LARGURAS.length]} altura="0.875rem" />
          </div>
        ))}
      </div>
    </div>
  );
}
