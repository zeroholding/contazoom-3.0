"use client";

/**
 * Moldura e peças de tela compartilhadas pelas telas novas do CONTAZOOM.
 *
 * Nada aqui é específico de um módulo: é a estrutura (sidebar, topbar, fundo), o
 * cartão de indicador, a célula de cabeçalho, a miniatura, a paginação e os
 * estados de vazio/carregando. Vive numa pasta neutra para que uma tela de
 * estoque não precise importar de uma pasta chamada `anuncios/`.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import Sidebar from "../ui/Sidebar";
import Topbar from "../ui/Topbar";
import { ENTRADA, inteiro } from "./formato";
import { IconeBusca } from "./icones";

/* -------------------------------------------------------------------------- */
/*                                  Moldura                                   */
/* -------------------------------------------------------------------------- */

/** Barra aberta e barra recolhida. Valores iguais aos das telas antigas. */
const LARGURA_ABERTA = "16rem";
const LARGURA_RECOLHIDA = "4rem";

/**
 * Chave da preferência de barra recolhida.
 *
 * É a MESMA das telas antigas (`cz_sidebar_collapsed`) de propósito: cada tela
 * monta a sua própria moldura, então sem uma chave compartilhada a barra voltaria
 * a abrir sozinha a cada navegação, desfazendo o que a pessoa acabou de escolher.
 */
const CHAVE_RECOLHIDA = "cz_sidebar_collapsed";

/**
 * Sidebar, Topbar e a área de conteúdo.
 *
 * Estrutura única do painel. Antes cada tela repetia estas ~25 linhas, e a cópia
 * saía diferente em cada arquivo — altura da barra, cor de fundo e raio do canto
 * divergiam de tela para tela.
 *
 * A composição é a mesma do painel administrativo, que é a linguagem da tela de
 * login: barra lateral e cabeçalho em superfície branca separados por um fio de
 * 1px, e o conteúdo sobre um cinza muito claro para os cartões brancos terem de
 * onde se destacar. Antes daqui, o conteúdo ficava sobre um painel BRANCO com
 * canto arredondado, então cartão branco sobre fundo branco não tinha
 * separação nenhuma.
 */
export function MolduraTela({ children }: { children: ReactNode }) {
  const [colapsada, setColapsada] = useState(false);
  const [menuMobile, setMenuMobile] = useState(false);

  // Lê a preferência depois da montagem, e não no `useState` inicial: o servidor
  // não tem `localStorage`, e ler ali faria o HTML do servidor divergir do
  // primeiro render do cliente.
  useEffect(() => {
    try {
      setColapsada(localStorage.getItem(CHAVE_RECOLHIDA) === "1");
    } catch {
      // Navegador com armazenamento bloqueado: segue com a barra aberta.
    }
  }, []);

  function alternar() {
    setColapsada((v) => {
      const proxima = !v;
      try {
        localStorage.setItem(CHAVE_RECOLHIDA, proxima ? "1" : "0");
      } catch {
        // Sem persistência, mas a tela continua respondendo ao clique.
      }
      return proxima;
    });
  }

  return (
    // `--sidebar-w` é declarada AQUI, no container, e não animada por GSAP como
    // nas telas antigas. A barra e o conteúdo têm `transition` de largura e de
    // margem, então trocar o valor da variável já anima os dois — `width` e
    // `margin` são propriedades animáveis mesmo quando o valor vem de uma
    // variável. Isso tira uma dependência de animação do shell e elimina o
    // `useRef` + dois `useEffect` que cada tela repetia.
    //
    // Sem esta linha, recolher só escondia os rótulos e a barra continuava com
    // 16rem — sobrava uma coluna branca vazia, que era o comportamento das três
    // telas que já usavam esta moldura.
    <div
      className="min-h-screen overflow-x-hidden bg-[var(--cz-fundo)]"
      style={
        {
          "--sidebar-w": colapsada ? LARGURA_RECOLHIDA : LARGURA_ABERTA,
        } as CSSProperties
      }
    >
      <Sidebar
        collapsed={colapsada}
        mobileOpen={menuMobile}
        onMobileClose={() => setMenuMobile(false)}
      />
      <Topbar
        collapsed={colapsada}
        onToggleCollapse={alternar}
        onMobileMenu={() => setMenuMobile(true)}
      />

      <main className="pt-[var(--cz-topbar-h)] transition-[margin] duration-200 ease-out md:ml-[var(--sidebar-w,16rem)]">
        <div className="px-4 py-5 sm:px-6 sm:py-6">{children}</div>
      </main>
    </div>
  );
}

/**
 * Cabeçalho de tela: título, uma linha de explicação e a ação principal.
 *
 * `cz-titulo` em vez de `font-bold tracking-tight` na mão — a classe carrega o
 * tracking negativo e a cor ancorada da tipografia do painel, e é a mesma que o
 * login e o admin usam. Escrever peso e tracking à mão em cada tela é como os
 * títulos acabaram com três tamanhos diferentes.
 */
export function Cabecalho({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao: string;
  acao?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="cz-titulo text-[22px] leading-7">{titulo}</h1>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-[var(--cz-texto-suave)]">
          {descricao}
        </p>
      </div>
      {acao}
    </header>
  );
}

export function BotaoAtualizar({
  onClick,
  atualizando,
  desabilitado,
  rotulo = "Atualizar estoque",
  rotuloAtivo = "Atualizando…",
  /** 0 a 100. Quando informado, o botão vira a própria barra de progresso. */
  percentual,
}: {
  onClick: () => void;
  atualizando: boolean;
  desabilitado: boolean;
  rotulo?: string;
  rotuloAtivo?: string;
  percentual?: number | null;
}) {
  const pct = percentual ?? null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={atualizando || desabilitado}
      aria-live="polite"
      // Laranja da marca, e não verde: laranja é a cor de AÇÃO em todo o produto
      // (é o botão do login, o item ativo do menu, o anel de foco). Verde aqui
      // competia com o verde SEMÂNTICO das próprias tabelas, onde ele significa
      // "saudável" — a mesma cor dizendo duas coisas na mesma tela.
      className="relative inline-flex h-11 items-center gap-2 overflow-hidden rounded-[var(--cz-raio)] border border-transparent bg-[var(--cz-laranja)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--cz-laranja-forte)] active:bg-[#C34706] disabled:cursor-not-allowed disabled:opacity-100"
    >
      {/* A barra é o próprio botão, e não uma barra separada: durante um sync de
          minutos, um botão desabilitado sem sinal de vida parece travado. Por isso
          `disabled:opacity-100` — apagar o botão apagaria a barra junto. */}
      {atualizando && pct !== null && (
        <span
          className="absolute inset-y-0 left-0 bg-black/20 transition-[width] duration-300 ease-out"
          style={{ width: `${Math.max(pct, 3)}%` }}
          aria-hidden
        />
      )}
      <span className="relative z-10 flex items-center gap-2">
        <svg
          className={`h-4 w-4 ${atualizando ? "animate-spin" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 3v6h-6" />
        </svg>
        {atualizando
          ? pct !== null
            ? `${rotuloAtivo} ${Math.round(pct)}%`
            : rotuloAtivo
          : rotulo}
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Filtros                                   */
/* -------------------------------------------------------------------------- */

export function PainelFiltros({ children, nota }: { children: ReactNode; nota?: ReactNode }) {
  return (
    <div className="mt-4 rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-4 shadow-[var(--cz-elev-1)]">
      <div className="grid gap-3 lg:grid-cols-12">{children}</div>
      {nota}
    </div>
  );
}

export function Campo({
  rotulo,
  className = "",
  children,
}: {
  rotulo: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--cz-texto-fraco)]">
        {rotulo}
      </span>
      {children}
    </label>
  );
}

/**
 * Campo de busca com lupa, e o botão de aplicar quando a busca não é ao vivo.
 *
 * Existia escrito à mão em quatro telas, sempre igual: um `<Campo rotulo="Buscar">`
 * com um `<input className={ENTRADA}>` e, ao lado, um `<button>` "Buscar" com
 * `border-gray-300 hover:border-emerald-400 hover:text-emerald-700` — cinza cru e
 * verde onde o produto usa laranja.
 *
 * A lupa dentro do campo é o que faltava: um campo de texto sem afordância
 * nenhuma, no meio de uma fileira de selects idênticos, não se distingue como
 * busca. `pl-9` abre o espaço dela — sem isso o ícone fica POR CIMA do texto
 * digitado.
 */
export function CampoBusca({
  valor,
  onMudar,
  onAplicar,
  rotulo = "Buscar",
  placeholder,
  className = "",
}: {
  valor: string;
  onMudar: (v: string) => void;
  /**
   * Quando informado, aparece o botão "Buscar" e o Enter dispara a busca. Sem
   * ele, o campo filtra a cada tecla — o que só serve quando a consulta é local
   * ou barata.
   */
  onAplicar?: () => void;
  rotulo?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Campo rotulo={rotulo} className={className}>
      <div className="flex gap-2">
        <span className="relative block flex-1">
          <IconeBusca className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cz-texto-fraco)]" />
          <input
            type="search"
            value={valor}
            onChange={(e) => onMudar(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && onAplicar) onAplicar();
            }}
            placeholder={placeholder}
            className={`${ENTRADA} pl-9`}
          />
        </span>
        {onAplicar && (
          <button
            type="button"
            onClick={onAplicar}
            className="h-10 shrink-0 rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-3 text-[13px] font-semibold text-[var(--cz-texto)] transition-colors hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-laranja-forte)]"
          >
            Buscar
          </button>
        )}
      </div>
    </Campo>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Indicadores                                 */
/* -------------------------------------------------------------------------- */

export function Kpi({
  rotulo,
  valor,
  nota,
  destaque = false,
  tom,
  icone,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  destaque?: boolean;
  tom?: "alerta" | "critico";
  /**
   * Ícone do canto, opcional.
   *
   * Fica DEPOIS do rótulo e em tinta fraca de propósito: o cartão existe para o
   * número ser lido primeiro. Ícone grande e colorido ao lado de um número
   * grande cria dois centros de atenção e o olho não sabe onde pousar — foi o
   * que aconteceu com os cartões que traziam o ícone dentro de um quadrado
   * cinza antes do texto.
   */
  icone?: ReactNode;
}) {
  // Vermelho, âmbar e verde continuam SEMÂNTICOS e não viraram laranja: aqui eles
  // significam ruim, atenção e bom. Trocá-los pela cor da marca apagaria a única
  // informação que a cor carrega nesta tela.
  const casca =
    tom === "critico"
      ? "border-rose-200 bg-rose-50"
      : tom === "alerta"
        ? "border-amber-200 bg-amber-50"
        : destaque
          ? "border-emerald-200 bg-emerald-50"
          : "border-[var(--cz-hairline)] bg-[var(--cz-superficie)]";
  const cor =
    tom === "critico"
      ? "text-rose-800"
      : tom === "alerta"
        ? "text-amber-800"
        : destaque
          ? "text-emerald-800"
          : "text-[var(--cz-texto)]";

  return (
    <div className={`rounded-[var(--cz-raio-cartao)] border p-4 shadow-[var(--cz-elev-1)] ${casca}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="block text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--cz-texto-suave)]">
          {rotulo}
        </span>
        {icone && (
          // `opacity-60` e não uma cor própria: assim o ícone acompanha o tom do
          // cartão (âmbar no alerta, rosa no crítico) sem precisar de um mapa de
          // cores paralelo que possa sair de sincronia com a casca.
          <span className={`shrink-0 opacity-60 ${cor}`}>{icone}</span>
        )}
      </div>
      {/* `cz-valor` carrega peso 800 e o tracking apertado dos números grandes do
          painel — o mesmo tratamento do login e do admin. */}
      <strong className={`cz-valor mt-1 block text-[21px] ${cor}`}>{valor}</strong>
      {nota && (
        <span className="mt-0.5 block text-[10.5px] text-[var(--cz-texto-suave)]">{nota}</span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Faixa de aviso                                  */
/* -------------------------------------------------------------------------- */

export type TomFaixa = "info" | "bom" | "alerta" | "critico";

const CASCA_FAIXA: Record<TomFaixa, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-900",
  bom: "border-emerald-200 bg-emerald-50 text-emerald-900",
  alerta: "border-amber-200 bg-amber-50 text-amber-900",
  critico: "border-rose-200 bg-rose-50 text-rose-900",
};

/**
 * A faixa de aviso dentro do fluxo da tela.
 *
 * POR QUE EXISTE: este bloco estava escrito à mão em cinco telas —
 * `<p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3
 * text-[12px] leading-relaxed text-amber-800">` e variações. Cada cópia divergiu
 * em algo: uma usava `rounded-xl`, outra `rounded-[var(--cz-raio)]`; o texto ia
 * de `text-amber-800` a `text-amber-900`; o espaçamento de `mt-3` a `mt-4`. São
 * diferenças pequenas que, somadas na mesma página, é exatamente o que se lê
 * como "desalinhado".
 *
 * É diferente do `Aviso`: `Aviso` ocupa o lugar do conteúdo que não veio (vazio,
 * erro), centralizado e grande. A `Faixa` acompanha um conteúdo que EXISTE, para
 * qualificá-lo — "os números estão certos, mas 30 vendas ainda não entraram".
 */
export function Faixa({
  tom = "info",
  icone,
  children,
  acao,
  className = "",
}: {
  tom?: TomFaixa;
  icone?: ReactNode;
  children: ReactNode;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mt-4 flex items-start gap-3 rounded-[var(--cz-raio-cartao)] border px-4 py-3 text-[12.5px] leading-relaxed ${CASCA_FAIXA[tom]} ${className}`}
    >
      {/* `mt-0.5` alinha o ícone com a primeira LINHA do texto, e não com o
          bloco inteiro. Em aviso de duas ou três linhas, centralizar deixa o
          ícone flutuando no meio do parágrafo. */}
      {icone && <span className="mt-0.5 shrink-0">{icone}</span>}
      <div className="min-w-0 flex-1">{children}</div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Recorte por pastilhas                             */
/* -------------------------------------------------------------------------- */

export type OpcaoRecorte<C extends string> = {
  chave: C;
  rotulo: string;
  /** Uma linha explicando o recorte. Aparece abaixo do grupo, só para o ativo. */
  explicacao?: string;
  /** Número à direita do rótulo, quando faz sentido contar. */
  contagem?: number;
};

/**
 * O grupo de pastilhas que define o RECORTE da tela.
 *
 * Reúne o padrão que Anúncios Mortos e Estoque Full tinham escrito à mão, e
 * corrige a cor: as duas usavam `bg-emerald-600` na pastilha ativa. Verde nessas
 * telas já significa "saudável" e "no pódio" — a mesma cor dizendo "selecionado"
 * fazia parecer que o recorte escolhido era o recorte BOM. Aqui o ativo usa o
 * laranja da marca, que em todo o produto quer dizer "foi você que escolheu
 * isso".
 *
 * Fica acima do painel de filtros porque é o eixo da tela, não um filtro entre
 * outros: trocar o recorte muda a pergunta, trocar um filtro só estreita a
 * resposta.
 */
export function GrupoRecorte<C extends string>({
  opcoes,
  valor,
  onMudar,
  className = "",
}: {
  opcoes: ReadonlyArray<OpcaoRecorte<C>>;
  valor: C;
  onMudar: (chave: C) => void;
  className?: string;
}) {
  const ativa = opcoes.find((o) => o.chave === valor);

  return (
    <div className={`mt-5 ${className}`}>
      <div className="flex flex-wrap gap-2" role="group">
        {opcoes.map((o) => {
          const selecionada = o.chave === valor;
          return (
            <button
              key={o.chave || "todos"}
              type="button"
              onClick={() => onMudar(o.chave)}
              aria-pressed={selecionada}
              className={`inline-flex items-center gap-2 rounded-[var(--cz-raio)] border px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                selecionada
                  ? "border-[var(--cz-laranja)] bg-[var(--cz-laranja)] text-white"
                  : "border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[var(--cz-texto)] hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-laranja-forte)]"
              }`}
            >
              {o.rotulo}
              {o.contagem !== undefined && (
                <span className={`tabular-nums ${selecionada ? "opacity-80" : "text-[var(--cz-texto-fraco)]"}`}>
                  {inteiro(o.contagem)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {ativa?.explicacao && (
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--cz-texto-suave)]">
          {ativa.explicacao}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Selo                                      */
/* -------------------------------------------------------------------------- */

export type TomSelo = "neutro" | "info" | "bom" | "alerta" | "critico" | "marca";

const CASCA_SELO: Record<TomSelo, string> = {
  neutro:
    "border-[var(--cz-hairline-forte)] bg-[var(--cz-fundo)] text-[var(--cz-texto-suave)]",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  bom: "border-emerald-200 bg-emerald-50 text-emerald-700",
  alerta: "border-amber-200 bg-amber-50 text-amber-800",
  critico: "border-rose-200 bg-rose-50 text-rose-700",
  marca:
    "border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]",
};

/**
 * Pastilha de estado. Uma forma só para todas as tabelas.
 *
 * As pastilhas do painel estavam em três formatos ao mesmo tempo — `rounded`,
 * `rounded-lg` e `rounded-full`; com fio, sem fio; `text-[10px]` a
 * `text-[11.5px]`; e paletas de 100/800 (`bg-amber-100 text-amber-800`) ao lado
 * de 50/700 (`bg-amber-50 text-amber-700`). Na mesma linha da mesma tabela.
 *
 * Aqui há UM formato: cápsula com fio, tinta 50/700. O fio importa: sem ele, a
 * pastilha clara sobre a linha branca da tabela perde o contorno e o texto
 * parece só um texto colorido solto.
 */
export function Selo({
  children,
  tom = "neutro",
  titulo,
  className = "",
}: {
  children: ReactNode;
  tom?: TomSelo;
  titulo?: string;
  className?: string;
}) {
  return (
    <span
      title={titulo}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${CASCA_SELO[tom]} ${className}`}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Botões                                    */
/* -------------------------------------------------------------------------- */

/**
 * Botão primário do produto — o MESMO do login.
 *
 * Existe para as telas pararem de escrever a mão. Cada tela tinha o seu: altura
 * de 8 a 12, raio de `rounded-md` a `rounded-xl`, e cor entre emerald, blue e
 * laranja. Como só existe uma ação principal por tela, só precisa existir um
 * botão assim.
 */
export function BotaoPrimario({
  children,
  onClick,
  type = "button",
  desabilitado = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  desabilitado?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={desabilitado}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-[var(--cz-raio)] border border-transparent bg-[var(--cz-laranja)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--cz-laranja-forte)] active:bg-[#C34706] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

/** Ação secundária: superfície branca com fio, sem competir com a primária. */
export function BotaoSecundario({
  children,
  onClick,
  type = "button",
  desabilitado = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  desabilitado?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={desabilitado}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-4 text-sm font-semibold text-[var(--cz-texto)] transition-colors hover:bg-[#F4F5F7] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Tabela                                    */
/* -------------------------------------------------------------------------- */

export function Th({
  children,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2.5 font-bold ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      {children}
    </th>
  );
}

export function CabecalhoTabela({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-[var(--cz-hairline)] bg-[var(--cz-fundo)] text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--cz-texto-suave)]">
        {children}
      </tr>
    </thead>
  );
}

/**
 * Cabeçalho ORDENÁVEL: renderiza o próprio `<th>` com botão e indicador.
 *
 * Clique em coluna nova ordena decrescente (é o que se quer 90% das vezes:
 * "mostre-me os maiores"); clicar de novo na coluna ativa inverte.
 */
export function ThOrdenavel<C extends string>({
  campo,
  rotulo,
  ordemAtual,
  direcaoAtual,
  onOrdenar,
  align = "right",
  className = "",
}: {
  campo: C;
  rotulo: string;
  ordemAtual: C;
  direcaoAtual: "asc" | "desc";
  onOrdenar: (campo: C, direcao: "asc" | "desc") => void;
  align?: "left" | "right";
  className?: string;
}) {
  const ativo = ordemAtual === campo;
  const proxima: "asc" | "desc" = ativo && direcaoAtual === "desc" ? "asc" : "desc";

  return (
    <th
      scope="col"
      aria-sort={ativo ? (direcaoAtual === "asc" ? "ascending" : "descending") : "none"}
      className={`px-3 py-2.5 font-bold ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      <button
        type="button"
        onClick={() => onOrdenar(campo, proxima)}
        title={`Ordenar por ${rotulo}`}
        // Laranja marca a coluna ordenada porque ordenar é uma AÇÃO da pessoa,
        // não um estado do dado. Verde aqui disputava significado com o verde
        // semântico das próprias células.
        className={`inline-flex items-center gap-1 transition-colors hover:text-[var(--cz-laranja-forte)] ${
          align === "right" ? "flex-row-reverse" : ""
        } ${ativo ? "text-[var(--cz-laranja-forte)]" : ""}`}
      >
        <span aria-hidden className="text-[11px] leading-none">
          {ativo ? (direcaoAtual === "desc" ? "▼" : "▲") : "⇅"}
        </span>
        <span>{rotulo}</span>
      </button>
    </th>
  );
}

/** Miniatura com fallback: `onError` cobre link expirado do CDN do ML. */
export function Miniatura({
  src,
  alt,
  tamanho = 44,
}: {
  src: string | null;
  alt: string;
  tamanho?: number;
}) {
  const [falhou, setFalhou] = useState(false);
  const lado = { width: tamanho, height: tamanho };

  if (!src || falhou) {
    return (
      <span
        style={lado}
        className="grid shrink-0 place-items-center rounded-lg border border-[var(--cz-hairline)] bg-[var(--cz-fundo)] text-[var(--cz-texto-fraco)]"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="m3 16 5-5 4 4 3-3 6 6" />
        </svg>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={tamanho}
      height={tamanho}
      loading="lazy"
      decoding="async"
      onError={() => setFalhou(true)}
      style={lado}
      className="shrink-0 rounded-lg border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] object-contain"
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                            Estados e avisos                                */
/* -------------------------------------------------------------------------- */

export function Aviso({
  titulo,
  texto,
  acao,
  icone,
}: {
  titulo: string;
  texto: string;
  acao?: ReactNode;
  /**
   * Ícone grande acima do título, opcional.
   *
   * Um vazio só com texto centralizado no meio de uma área grande parece erro de
   * carregamento. O ícone dá ao bloco um peso visual que diz "esta tela está
   * funcionando e o resultado é nenhum" — que é uma informação diferente.
   */
  icone?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-5 py-16 text-center">
      {icone && (
        <span className="mb-4 grid size-14 place-items-center rounded-full border border-[var(--cz-hairline)] bg-[var(--cz-fundo)] text-[var(--cz-texto-fraco)]">
          {icone}
        </span>
      )}
      <h3 className="cz-titulo text-[14px]">{titulo}</h3>
      <p className="mt-1 max-w-md text-[12.5px] leading-relaxed text-[var(--cz-texto-suave)]">
        {texto}
      </p>
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}

export function Esqueleto({ linhas = 6 }: { linhas?: number }) {
  return (
    <div className="animate-pulse divide-y divide-[var(--cz-hairline)]">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-4">
          <div className="size-11 shrink-0 rounded-lg bg-[var(--cz-fundo)]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/5 rounded bg-[var(--cz-fundo)]" />
            <div className="h-2.5 w-1/4 rounded bg-[var(--cz-fundo)]" />
          </div>
          <div className="h-3 w-16 rounded bg-[var(--cz-fundo)]" />
          <div className="h-3 w-20 rounded bg-[var(--cz-fundo)]" />
        </div>
      ))}
    </div>
  );
}

export function Paginacao({
  pagina,
  totalPaginas,
  total,
  porPagina,
  onPagina,
  onPorPagina,
  rotulo = "registros",
  opcoesPorPagina = [20, 50, 100],
}: {
  pagina: number;
  totalPaginas: number;
  total: number;
  porPagina: number;
  onPagina: (p: number) => void;
  onPorPagina: (v: number) => void;
  rotulo?: string;
  opcoesPorPagina?: number[];
}) {
  const de = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const ate = Math.min(pagina * porPagina, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cz-hairline)] px-5 py-3 text-[12px] text-[var(--cz-texto-suave)]">
      <span>
        Mostrando <strong>{inteiro(de)}</strong> a <strong>{inteiro(ate)}</strong> de{" "}
        <strong>{inteiro(total)}</strong> {rotulo}
      </span>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5">
          Por página
          <select
            value={porPagina}
            onChange={(e) => onPorPagina(Number(e.target.value))}
            className="h-8 rounded-lg border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-2 text-[12px]"
          >
            {opcoesPorPagina.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPagina(pagina - 1)}
            disabled={pagina <= 1}
            className="h-8 rounded-lg border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-2.5 font-semibold transition hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-laranja-forte)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="px-2 tabular-nums">
            {pagina} / {totalPaginas}
          </span>
          <button
            type="button"
            onClick={() => onPagina(pagina + 1)}
            disabled={pagina >= totalPaginas}
            className="h-8 rounded-lg border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-2.5 font-semibold transition hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-laranja-forte)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
