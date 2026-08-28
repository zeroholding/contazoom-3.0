"use client";

/**
 * Peças de layout do módulo: KPI, cabeçalho, vazio, carregando, aviso, paginação.
 *
 * Ficam juntas porque são casca — mudam sempre em conjunto e nenhuma tem lógica
 * própria. Espalhar em oito arquivos de vinte linhas só criaria oito imports.
 *
 * Contrato com as telas: nove views importam daqui. Nome de export e nome de
 * prop são API pública; prop nova entra sempre opcional e com default que
 * reproduz o comportamento anterior.
 *
 * Duas convenções que valem para o arquivo inteiro:
 *
 * 1. Padding de conteúdo é responsabilidade de quem usa. O `Painel` só cuida do
 *    próprio cabeçalho e rodapé — as telas passam `px-5 py-4` no filho, e às
 *    vezes no próprio `className` do painel. Padding fixo aqui dobraria o delas.
 * 2. Cor de borda, sombra e numeral tabular vêm da camada `.cz-tarefas` em
 *    globals.css (`--cz-hairline`, `--cz-elev-*`, `.cz-num`). Foco visível é
 *    automático lá, então nenhum componente aqui declara classe `focus:`.
 */

import Link from "next/link";
import { ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Info,
  Loader2,
  Minus,
  X,
} from "lucide-react";
import Icone from "./Icone";
import {
  EsqueletoCartaoKpi,
  EsqueletoFicha,
  EsqueletoKpi,
  EsqueletoLista,
  EsqueletoPainel,
  EsqueletoTabela,
  Linha,
} from "./Esqueleto";

/* ---------------------------------- KPI ----------------------------------- */

type TomKpi = "laranja" | "cinza" | "verde" | "vermelho" | "ambar" | "azul";

type CartaoKpiProps = {
  titulo: string;
  valor: number | string;
  icone: string;
  /** Cor do acento do cartão. Laranja é o padrão da marca. */
  tom?: TomKpi;
  detalhe?: string;
  href?: string;
  /**
   * Tendência ao lado do número. `valor` é a variação em pontos percentuais
   * (`12` vira "+12%"). `positivoEhBom` inverte a cor para indicador onde subir
   * é ruim — atraso, pendência — sem inverter a seta, que continua apontando
   * para onde o número foi.
   */
  variacao?: { valor: number; positivoEhBom?: boolean };
  /** Rende o próprio cartão em esqueleto, preservando a altura da grade. */
  carregando?: boolean;
};

/**
 * Tons do cartão.
 *
 * `barra` é o acento fino no topo; `fundo`/`icone` vestem o bloco de 32px do
 * ícone. O número nunca é colorido: em grade de seis, seis números coloridos
 * disputam entre si e nenhum vence.
 */
const TOM_KPI: Record<TomKpi, { barra: string; fundo: string; icone: string }> = {
  laranja: { barra: "bg-orange-500", fundo: "bg-orange-50", icone: "text-orange-600" },
  cinza: { barra: "bg-gray-300", fundo: "bg-gray-100", icone: "text-gray-600" },
  verde: { barra: "bg-[#12B76A]", fundo: "bg-[#ECFDF3]", icone: "text-[#027A48]" },
  vermelho: { barra: "bg-[#F04438]", fundo: "bg-[#FEF2F2]", icone: "text-[#B42318]" },
  ambar: { barra: "bg-[#F79009]", fundo: "bg-[#FFFAEB]", icone: "text-[#B54708]" },
  azul: { barra: "bg-[#2E90FA]", fundo: "bg-[#EFF8FF]", icone: "text-[#175CD3]" },
};

/** Seta de tendência com cor semântica. */
function Tendencia({
  valor,
  positivoEhBom = true,
}: {
  valor: number;
  positivoEhBom?: boolean;
}) {
  const neutro = valor === 0;
  const bom = valor > 0 ? positivoEhBom : !positivoEhBom;
  const Seta = neutro ? Minus : valor > 0 ? ArrowUpRight : ArrowDownRight;

  const cor = neutro
    ? "bg-gray-100 text-gray-600"
    : bom
      ? "bg-[#ECFDF3] text-[#027A48]"
      : "bg-[#FEF2F2] text-[#B42318]";

  // Formatação à mão em vez de `Intl`: o servidor e o navegador podem resolver
  // locale diferente e a hidratação acusa divergência de texto.
  const absoluto = Math.abs(valor);
  const numero = Number.isInteger(absoluto)
    ? String(absoluto)
    : absoluto.toFixed(1).replace(".", ",");
  const sinal = valor > 0 ? "+" : valor < 0 ? "-" : "";

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold ${cor}`}
    >
      <Seta className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="sr-only">variação de </span>
      <span className="cz-num">{`${sinal}${numero}%`}</span>
    </span>
  );
}

/**
 * Cartão de indicador.
 *
 * O número é o protagonista: 28px, peso semibold, numeral tabular. O rótulo vai
 * acima em caixa alta pequena, e o ícone encolheu para um bloco de 32px no canto
 * — antes era uma caixa colorida de 48px que competia com o próprio dado. A cor
 * do `tom` ficou num acento de 3px no topo: em grade de seis cartões, seis
 * blocos chapados davam o mesmo peso visual a tudo e o olho não sabia onde
 * começar.
 */
export function CartaoKpi({
  titulo,
  valor,
  icone,
  tom = "laranja",
  detalhe,
  href,
  variacao,
  carregando = false,
}: CartaoKpiProps) {
  if (carregando) return <EsqueletoCartaoKpi />;

  const t = TOM_KPI[tom] ?? TOM_KPI.laranja;

  const conteudo = (
    <>
      <span
        className={`absolute inset-x-0 top-0 h-[3px] ${t.barra}`}
        aria-hidden="true"
      />
      <div className="flex flex-1 flex-col px-5 pb-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-gray-500">
            {titulo}
          </p>
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.fundo} ${t.icone}`}
          >
            <Icone nome={icone} className="h-4 w-4" />
          </span>
        </div>

        <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="cz-num text-[1.75rem] font-semibold leading-none tracking-[-0.02em] text-gray-900">
            {valor}
          </span>
          {variacao && <Tendencia {...variacao} />}
        </div>

        {detalhe && (
          // `mt-auto` mantém o detalhe rente ao rodapé: em grade, o cartão sem
          // detalhe esticaria e os números ficariam em alturas diferentes.
          <p
            className={`mt-auto truncate pt-2 text-xs text-gray-500 ${
              href ? "pr-5" : ""
            }`}
          >
            {detalhe}
          </p>
        )}
      </div>
      {href && (
        <ChevronRight
          className="absolute bottom-3.5 right-4 h-4 w-4 text-orange-500 opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100"
          aria-hidden="true"
        />
      )}
    </>
  );

  const casca =
    "group relative flex h-full flex-col overflow-hidden rounded-xl border border-[var(--cz-hairline)] bg-white shadow-[var(--cz-elev-1)]";

  if (href) {
    return (
      <Link
        href={href}
        className={`${casca} transition-all duration-150 hover:border-orange-300 hover:shadow-[var(--cz-elev-2)]`}
      >
        {conteudo}
      </Link>
    );
  }

  return <div className={casca}>{conteudo}</div>;
}

/* ------------------------------- Cabeçalho -------------------------------- */

export function Cabecalho({
  titulo,
  descricao,
  icone,
  acoes,
  voltarPara,
  voltarTexto = "Voltar",
  trilha,
  selos,
}: {
  titulo: string;
  descricao?: string;
  icone?: string;
  acoes?: ReactNode;
  voltarPara?: string;
  voltarTexto?: string;
  /** Trilha local da página. O último item é a posição atual, sem link. */
  trilha?: { texto: string; href?: string }[];
  /** Faixa de selos abaixo do título, no lugar de um painel só para isso. */
  selos?: ReactNode;
}) {
  const passos = trilha ?? [];
  const temTrilha = passos.length > 0;

  return (
    <div className="space-y-4">
      {(voltarPara || temTrilha) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {voltarPara && (
            // Botão de verdade, não link solto: o alvo de clique fica visível
            // antes do hover, que é o que faltava para as telas de detalhe.
            <Link
              href={voltarPara}
              className="group inline-flex items-center gap-1.5 rounded-lg border border-[var(--cz-hairline-forte)] bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-600 shadow-[var(--cz-elev-1)] transition-colors hover:border-gray-400 hover:text-gray-900"
            >
              <ChevronLeft
                className="h-4 w-4 transition-transform duration-150 group-hover:-translate-x-0.5"
                aria-hidden="true"
              />
              {voltarTexto}
            </Link>
          )}

          {voltarPara && temTrilha && (
            <span
              className="h-4 w-px bg-[var(--cz-hairline-forte)]"
              aria-hidden="true"
            />
          )}

          {temTrilha && (
            <nav aria-label="Trilha de navegação">
              <ol className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-gray-500">
                {passos.map((passo, i) => {
                  const ultimo = i === passos.length - 1;
                  return (
                    <li
                      key={`${passo.texto}-${i}`}
                      className="flex items-center gap-1.5"
                    >
                      {i > 0 && (
                        <ChevronRight
                          className="h-3.5 w-3.5 shrink-0 text-gray-300"
                          aria-hidden="true"
                        />
                      )}
                      {passo.href && !ultimo ? (
                        <Link
                          href={passo.href}
                          className="transition-colors hover:text-orange-600"
                        >
                          {passo.texto}
                        </Link>
                      ) : (
                        <span
                          aria-current={ultimo ? "page" : undefined}
                          className={ultimo ? "text-gray-700" : undefined}
                        >
                          {passo.texto}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}
        </div>
      )}

      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          {icone && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--cz-hairline)] bg-white text-orange-600 shadow-[var(--cz-elev-1)]">
              <Icone nome={icone} className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-[-0.02em] text-gray-900 sm:text-[1.625rem]">
              {titulo}
            </h1>
            {descricao && (
              // Largura de leitura: em monitor largo a linha ia de ponta a
              // ponta e o olho perdia o começo da próxima.
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-500">
                {descricao}
              </p>
            )}
          </div>
        </div>
        {acoes && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>
        )}
      </div>

      {selos && <div className="flex flex-wrap items-center gap-2">{selos}</div>}
    </div>
  );
}

/* --------------------------------- Estados -------------------------------- */

/**
 * Estado de carregamento.
 *
 * O default continua sendo o que as telas já chamam (`<Carregando texto="…" />`),
 * mas deixou de ser um spinner solto no meio de 40vh de branco: agora é uma
 * linha de status com a forma do conteúdo abaixo. Quando a tela sabe o que vem
 * — grade de KPI, tabela, lista, ficha — `variante` desenha aquele formato e o
 * conteúdo real entra sem empurrar nada.
 */
export function Carregando({
  texto = "Carregando",
  variante = "spinner",
}: {
  texto?: string;
  variante?: "spinner" | "kpi" | "tabela" | "lista" | "ficha";
}) {
  let corpo: ReactNode;

  switch (variante) {
    case "kpi":
      corpo = <EsqueletoKpi />;
      break;
    case "tabela":
      corpo = (
        <EsqueletoPainel>
          <EsqueletoTabela />
        </EsqueletoPainel>
      );
      break;
    case "lista":
      corpo = <EsqueletoLista />;
      break;
    case "ficha":
      corpo = (
        <EsqueletoPainel>
          <EsqueletoFicha />
        </EsqueletoPainel>
      );
      break;
    default:
      // Forma genérica: serve tanto para lista quanto para detalhe, que é o que
      // as nove telas usam sem informar variante.
      corpo = (
        <EsqueletoPainel>
          <div className="divide-y divide-gray-100">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Linha largura="2rem" altura="2rem" redondo className="shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Linha largura={i % 2 === 0 ? "62%" : "44%"} altura="0.875rem" />
                  <Linha largura="30%" altura="0.6875rem" />
                </div>
                <Linha
                  largura="4.5rem"
                  altura="1.5rem"
                  className="hidden shrink-0 sm:block"
                />
              </div>
            ))}
          </div>
        </EsqueletoPainel>
      );
  }

  return (
    <div className="space-y-4">
      <p
        role="status"
        className="flex items-center gap-2.5 text-sm font-medium text-gray-500"
      >
        <Loader2
          className="h-4 w-4 shrink-0 animate-spin text-orange-500"
          aria-hidden="true"
        />
        {texto}
      </p>
      {/* O esqueleto tem o próprio `role="status"`; escondido aqui para o leitor
          de tela não anunciar o mesmo carregamento duas vezes. */}
      <div aria-hidden="true">{corpo}</div>
    </div>
  );
}

/**
 * Estado vazio.
 *
 * Sempre com uma ação, quando existir uma: tela vazia sem saída faz o operador
 * achar que o sistema quebrou.
 *
 * Sem margem externa de propósito — metade das telas chama isto dentro de um
 * `Painel` que já tem padding, e margem aqui viraria respiro dobrado.
 */
export function Vazio({
  titulo,
  descricao,
  acao,
  icone = "Inbox",
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  icone?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--cz-hairline-forte)] bg-[#FCFCFD] px-6 py-12 text-center">
      {/* Círculo com halo: o `bg-gray-100` de antes achatava o ícone contra o
          fundo. O anel de offset dá profundidade sem pedir cor nova. */}
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-gray-400 shadow-[var(--cz-elev-1)] ring-1 ring-[var(--cz-hairline)] ring-offset-4 ring-offset-[#F2F4F7]">
        {icone === "Inbox" ? (
          // `Inbox` não está no mapa do `Icone` e cairia em `Circle`.
          <Inbox className="h-6 w-6" aria-hidden="true" />
        ) : (
          <Icone nome={icone} className="h-6 w-6" />
        )}
      </div>
      <h3 className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-gray-900">
        {titulo}
      </h3>
      {descricao && (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-gray-500">
          {descricao}
        </p>
      )}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}

/**
 * Faixa de erro ou aviso, dispensável pelo operador.
 *
 * Ícone diferente por tom, não só cor diferente: quem não distingue vermelho de
 * verde receberia a faixa sem a informação mais importante dela.
 */
const TOM_AVISO: Record<
  "erro" | "atencao" | "info" | "ok",
  { casca: string; simbolo: typeof AlertCircle }
> = {
  erro: {
    casca: "border-[#FECDCA] border-l-[#D92D20] bg-[#FEF2F2] text-[#B42318]",
    simbolo: AlertCircle,
  },
  atencao: {
    casca: "border-[#FEDF89] border-l-[#DC6803] bg-[#FFFAEB] text-[#B54708]",
    simbolo: AlertTriangle,
  },
  info: {
    casca: "border-[#B2DDFF] border-l-[#1570EF] bg-[#EFF8FF] text-[#175CD3]",
    simbolo: Info,
  },
  ok: {
    casca: "border-[#ABEFC6] border-l-[#039855] bg-[#ECFDF3] text-[#027A48]",
    simbolo: CheckCircle2,
  },
};

export function Aviso({
  mensagem,
  tom = "erro",
  onFechar,
}: {
  mensagem: string;
  tom?: "erro" | "atencao" | "info" | "ok";
  onFechar?: () => void;
}) {
  if (!mensagem) return null;

  const t = TOM_AVISO[tom] ?? TOM_AVISO.erro;
  const Simbolo = t.simbolo;

  return (
    <div
      role={tom === "erro" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-lg border border-l-4 px-4 py-3 text-sm shadow-[var(--cz-elev-1)] ${t.casca}`}
    >
      <Simbolo
        className="mt-px h-[18px] w-[18px] shrink-0"
        aria-hidden="true"
      />
      <span className="flex-1 font-medium leading-relaxed">{mensagem}</span>
      {onFechar && (
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar aviso"
          // Alvo de 32px: o `p-0.5` de antes dava 20px, abaixo do que a mão
          // acerta sem mirar.
          className="-my-1 -mr-1.5 shrink-0 rounded-lg p-1.5 opacity-70 transition hover:bg-black/5 hover:opacity-100"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/* -------------------------------- Paginação ------------------------------- */

/**
 * Páginas visíveis, com reticência quando não cabe tudo.
 *
 * Até sete páginas mostra todas. Passando disso, mostra primeira, última e uma
 * janela de cinco em volta da atual — o suficiente para pular de perto sem a
 * régua de números virar uma segunda barra de rolagem.
 */
function paginasVisiveis(atual: number, paginas: number): (number | "…")[] {
  const MAX = 7;
  if (paginas <= MAX) {
    return Array.from({ length: paginas }, (_, i) => i + 1);
  }

  const escolhidas = new Set<number>([1, paginas]);
  const inicio = Math.max(2, Math.min(atual - 2, paginas - 5));
  for (let i = inicio; i < inicio + 5; i++) escolhidas.add(i);

  const ordenadas = [...escolhidas]
    .filter((n) => n >= 1 && n <= paginas)
    .sort((a, b) => a - b);

  const saida: (number | "…")[] = [];
  ordenadas.forEach((n, i) => {
    if (i > 0 && n - ordenadas[i - 1] > 1) saida.push("…");
    saida.push(n);
  });
  return saida;
}

/**
 * Paginação.
 *
 * `totalPaginas` pode chegar 0 de algumas rotas (é `ceil(total/limit)` puro), e
 * 0 renderizaria "Página 1 de 0". Normalizamos para no mínimo 1.
 */
export function Paginacao({
  pagina,
  totalPaginas,
  total,
  onMudar,
  rotulo = "registros",
}: {
  pagina: number;
  totalPaginas: number;
  total: number;
  onMudar: (pagina: number) => void;
  rotulo?: string;
}) {
  const paginas = Math.max(1, totalPaginas);
  if (total === 0) return null;

  const lista = paginasVisiveis(pagina, paginas);
  const passo =
    "inline-flex items-center gap-1 rounded-lg border border-[var(--cz-hairline-forte)] bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 shadow-[var(--cz-elev-1)] transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none";

  return (
    <nav
      aria-label="Paginação"
      className="flex flex-col items-center justify-between gap-3 border-t border-[var(--cz-hairline)] px-4 py-3 sm:flex-row"
    >
      <p className="text-sm text-gray-500">
        <span className="cz-num font-semibold text-gray-900">{total}</span>{" "}
        {rotulo}
        <span aria-hidden="true"> · </span>
        página <span className="cz-num font-medium text-gray-700">{pagina}</span>{" "}
        de <span className="cz-num font-medium text-gray-700">{paginas}</span>
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onMudar(pagina - 1)}
          disabled={pagina <= 1}
          className={passo}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Anterior
        </button>

        {/* Régua de números só onde cabe: no celular ela empurraria os passos
            para fora da tela, e com uma página só não informa nada. */}
        <div
          className={`items-center gap-1 px-1 ${
            paginas > 1 ? "hidden sm:flex" : "hidden"
          }`}
        >
          {lista.map((item, i) =>
            item === "…" ? (
              <span
                key={`reticencia-${i}`}
                aria-hidden="true"
                className="px-1 text-sm text-gray-400"
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onMudar(item)}
                aria-label={`Página ${item}`}
                aria-current={item === pagina ? "page" : undefined}
                className={`cz-num inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors ${
                  item === pagina
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {item}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          onClick={() => onMudar(pagina + 1)}
          disabled={pagina >= paginas}
          className={passo}
        >
          Próxima
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

/* --------------------------------- Blocos --------------------------------- */

export function Painel({
  titulo,
  descricao,
  acoes,
  children,
  className = "",
  denso = false,
  rodape,
  elevacao = 1,
}: {
  titulo?: string;
  descricao?: string;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Cabeçalho e rodapé com padding menor, para painel de apoio. */
  denso?: boolean;
  rodape?: ReactNode;
  /** 2 destaca o painel do resto da coluna. Sombra vem das vars do tema. */
  elevacao?: 1 | 2;
}) {
  const sombra =
    elevacao === 2 ? "shadow-[var(--cz-elev-2)]" : "shadow-[var(--cz-elev-1)]";
  const respiro = denso ? "px-4 py-3" : "px-5 py-4";

  return (
    <section
      className={`rounded-xl border border-[var(--cz-hairline)] bg-white ${sombra} ${className}`}
    >
      {(titulo || acoes) && (
        // Coluna no celular, linha no resto: com `flex-wrap` o bloco de ações
        // caía embaixo e desalinhava assim que o título passava de uma linha.
        <div
          className={`flex flex-col gap-3 border-b border-[var(--cz-hairline)] sm:flex-row sm:items-start sm:justify-between ${respiro}`}
        >
          <div className="min-w-0 flex-1">
            {titulo && (
              <h2 className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-gray-900">
                {titulo}
              </h2>
            )}
            {descricao && (
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-gray-500">
                {descricao}
              </p>
            )}
          </div>
          {acoes && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {acoes}
            </div>
          )}
        </div>
      )}
      {children}
      {rodape && (
        <div
          className={`border-t border-[var(--cz-hairline)] ${
            denso ? "px-4 py-2.5" : "px-5 py-3"
          }`}
        >
          {rodape}
        </div>
      )}
    </section>
  );
}

/** Par rótulo/valor da ficha de detalhe. */
export function Dado({
  rotulo,
  children,
}: {
  rotulo: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-gray-500">
        {rotulo}
      </dt>
      <dd className="mt-1.5 text-sm font-medium leading-snug text-gray-900">
        {children}
      </dd>
    </div>
  );
}

/** Barra de progresso de etapas. Laranja porque é trabalho em curso. */
export function Progresso({
  feito,
  total,
  className = "",
  mostrarTexto = false,
}: {
  feito: number;
  total: number;
  className?: string;
  /** Contagem e percentual embaixo da barra. */
  mostrarTexto?: boolean;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((feito / total) * 100)) : 0;
  const completo = pct >= 100;

  return (
    <div className={className}>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--cz-hairline)]"
        role="progressbar"
        aria-valuenow={feito}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${feito} de ${total} etapas`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            completo ? "bg-[#039855]" : "bg-orange-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {mostrarTexto && (
        <div
          className="mt-1.5 flex items-center justify-between text-[11px] font-medium text-gray-500"
          aria-hidden="true"
        >
          <span className="cz-num">{`${feito}/${total}`}</span>
          <span
            className={`cz-num ${completo ? "text-[#027A48]" : "text-gray-500"}`}
          >{`${pct}%`}</span>
        </div>
      )}
    </div>
  );
}
