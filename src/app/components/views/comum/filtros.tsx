"use client";

/**
 * A barra de filtros compacta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * A Expedição tinha DOZE filtros, todos como campo de largura cheia num grid de
 * 12 colunas. O resultado eram três linhas de campos ocupando quase metade da
 * altura útil da tela antes de aparecer o primeiro pacote da fila — numa tela
 * cujo trabalho é olhar a fila. E não é excesso de filtro: cada um deles serve.
 * O erro era dar a TODOS o mesmo peso visual.
 *
 * Aqui os filtros ganham dois níveis:
 *
 *   • os que se usam todo dia viram PASTILHAS numa linha só ("Conta: Todas ⌄"),
 *     do tamanho do texto e não da coluna do grid;
 *   • os demais ficam atrás de "Filtros avançados", que abre um painel.
 *
 * E uma fileira de CHIPS mostra o que está ativo, cada um removível com um
 * clique. Com filtro recolhido isso é obrigatório: sem os chips, um recorte
 * ligado dentro do painel fechado é um filtro invisível — a pessoa vê uma lista
 * curta e não tem como saber por quê.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { inteiro } from "./formato";
import { IconeBusca, IconeFechar, IconeFiltro, IconeSeta } from "./icones";

/**
 * Uma opção de filtro.
 *
 * Declarada AQUI, e não em `shell.tsx`, porque é aqui que vive a lista que a
 * consome. `shell.tsx` reexporta o tipo para as telas que já o importavam de lá.
 */
export type OpcaoSelecao = {
  valor: string;
  rotulo: string;
  /** Número à direita (quantos pacotes, quantas unidades). Opcional. */
  contagem?: number;
  /** Aparece à esquerda do rótulo. Serve para o logo do canal. */
  icone?: ReactNode;
};

/**
 * A partir de quantas opções aparece a busca dentro do painel.
 *
 * Campo de busca sobre cinco opções é ruído; sobre trezentos SKUs é a única
 * forma de achar algo.
 */
const MINIMO_BUSCA = 8;

/* -------------------------------------------------------------------------- */
/*                       Abrir, fechar, clicar fora                           */
/* -------------------------------------------------------------------------- */

/**
 * Estado de aberto/fechado de um painel ancorado, com clique-fora e `Esc`.
 *
 * Era o mesmo bloco de `useEffect` copiado dentro de `MultiSelecao`, e teria sido
 * copiado de novo em cada pastilha nova. Um painel que não fecha no `Esc` é o tipo
 * de defeito que só aparece quando já existem cinco cópias.
 */
function usePainelAncorado() {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!aberto) return;

    const foraDaCaixa = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };

    document.addEventListener("mousedown", foraDaCaixa);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", foraDaCaixa);
      document.removeEventListener("keydown", escape);
    };
  }, [aberto]);

  return { aberto, setAberto, caixa };
}

/* -------------------------------------------------------------------------- */
/*                        A lista de opções do painel                         */
/* -------------------------------------------------------------------------- */

/**
 * O conteúdo do painel: busca, caixas de seleção e "limpar".
 *
 * Vive separado do gatilho porque existem DOIS gatilhos para a mesma lista — o
 * campo com rótulo em cima (`MultiSelecao`) e a pastilha compacta
 * (`FiltroRapido`). Com a lista dentro de cada um, a correção de um não chegaria
 * ao outro, que é exatamente como as telas deste projeto acumularam três
 * aparências para a mesma pastilha.
 */
export function ListaOpcoes({
  opcoes,
  selecionados,
  onMudar,
  buscaPlaceholder = "Filtrar…",
  vazio = "Nada disponível",
}: {
  opcoes: OpcaoSelecao[];
  selecionados: string[];
  onMudar: (valores: string[]) => void;
  buscaPlaceholder?: string;
  vazio?: string;
}) {
  const [busca, setBusca] = useState("");
  const marcados = new Set(selecionados);

  const alternar = (valor: string) => {
    onMudar(
      marcados.has(valor)
        ? selecionados.filter((v) => v !== valor)
        : [...selecionados, valor],
    );
  };

  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const filtradas =
    termo === ""
      ? opcoes
      : opcoes.filter((o) => o.rotulo.toLocaleLowerCase("pt-BR").includes(termo));

  return (
    <>
      {opcoes.length >= MINIMO_BUSCA && (
        <div className="border-b border-[var(--cz-hairline)] p-2">
          <span className="relative block">
            <IconeBusca className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--cz-texto-fraco)]" />
            <input
              type="text"
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={buscaPlaceholder}
              className="h-9 w-full rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-[var(--cz-fundo)] pl-8 pr-2 text-[13px] text-[var(--cz-texto)] focus:border-[var(--cz-laranja)] focus:outline-none"
            />
          </span>
        </div>
      )}

      <div className="max-h-64 overflow-y-auto p-1">
        {filtradas.length === 0 ? (
          <p className="px-2 py-3 text-center text-[13px] text-[var(--cz-texto-suave)]">
            {opcoes.length === 0 ? vazio : "Nada encontrado"}
          </p>
        ) : (
          filtradas.map((o) => {
            const ativo = marcados.has(o.valor);
            return (
              <label
                key={o.valor}
                className={`flex cursor-pointer items-center gap-2 rounded-[var(--cz-raio)] px-2 py-2 text-[13px] transition-colors ${
                  ativo
                    ? "bg-[var(--cz-laranja-suave)] font-semibold text-[var(--cz-laranja-forte)]"
                    : "text-[var(--cz-texto)] hover:bg-[var(--cz-fundo)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={ativo}
                  onChange={() => alternar(o.valor)}
                  className="size-3.5 shrink-0 accent-[var(--cz-laranja)]"
                />
                {o.icone}
                <span className="min-w-0 flex-1 truncate" title={o.rotulo}>
                  {o.rotulo}
                </span>
                {o.contagem !== undefined && (
                  <span className="shrink-0 tabular-nums text-[12px] text-[var(--cz-texto-fraco)]">
                    {inteiro(o.contagem)}
                  </span>
                )}
              </label>
            );
          })
        )}
      </div>

      {/* "Limpar" só aparece com algo escolhido: um botão permanentemente
          desabilitado ocuparia a mesma linha sem nunca servir. */}
      {selecionados.length > 0 && (
        <div className="border-t border-[var(--cz-hairline)] p-1.5">
          <button
            type="button"
            onClick={() => onMudar([])}
            className="w-full rounded-[var(--cz-raio)] px-2 py-2 text-[13px] font-semibold text-[var(--cz-texto-suave)] transition-colors hover:bg-[var(--cz-fundo)] hover:text-[var(--cz-laranja-forte)]"
          >
            Limpar seleção
          </button>
        </div>
      )}
    </>
  );
}

/**
 * O resumo mostrado no gatilho fechado.
 *
 * Com um item escolhido mostra o NOME dele; com mais de um, a contagem. Mostrar
 * "3 selecionados" para uma escolha só esconderia a informação atrás de um
 * clique, e listar cinco nomes num botão de 200px vira reticências que não dizem
 * nada.
 */
export function resumoSelecao(
  opcoes: OpcaoSelecao[],
  selecionados: string[],
  placeholder: string,
): string {
  if (selecionados.length === 0) return placeholder;
  if (selecionados.length === 1) {
    return opcoes.find((o) => o.valor === selecionados[0])?.rotulo ?? selecionados[0];
  }
  return `${selecionados.length} selecionados`;
}

/* -------------------------------------------------------------------------- */
/*                      A barra e a pastilha de filtro                        */
/* -------------------------------------------------------------------------- */

/**
 * A linha dos filtros rápidos.
 *
 * `flex-wrap` e não grid: as pastilhas têm larguras diferentes (o rótulo "Conta"
 * é menor que "Modalidade de envio") e num grid cada uma ocuparia a mesma coluna,
 * deixando buracos. Quebra de linha só quando a tela é estreita de verdade.
 */
export function BarraFiltros({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

/** A altura de toda pastilha e do campo de busca da barra. Um valor só. */
const ALTURA_PASTILHA = "h-10";

/**
 * Filtro em PASTILHA: `Conta: Todas ⌄`, do tamanho do conteúdo.
 *
 * O rótulo fica DENTRO do gatilho, na mesma linha do valor, em vez de numa
 * legenda acima. É o que permite cinco filtros numa linha em vez de cinco linhas
 * de campo — e o rótulo continua visível, que é o que diferencia isto de um
 * `<select>` sem legenda ("Todas" sozinho na tela não diz todas as quê).
 */
export function FiltroRapido({
  rotulo,
  opcoes,
  selecionados,
  onMudar,
  placeholder = "Todos",
  buscaPlaceholder,
  vazio,
  icone,
  /** Largura do painel. Listas de SKU precisam de mais que a pastilha tem. */
  larguraPainel = "w-[19rem]",
}: {
  rotulo: string;
  opcoes: OpcaoSelecao[];
  selecionados: string[];
  onMudar: (valores: string[]) => void;
  placeholder?: string;
  buscaPlaceholder?: string;
  vazio?: string;
  icone?: ReactNode;
  larguraPainel?: string;
}) {
  const { aberto, setAberto, caixa } = usePainelAncorado();
  const ativo = selecionados.length > 0;

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className={`inline-flex ${ALTURA_PASTILHA} max-w-[16rem] items-center gap-1.5 rounded-[var(--cz-raio)] border px-3 text-[13px] transition-colors ${
          ativo
            ? "border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]"
            : "border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[var(--cz-texto)] hover:border-[var(--cz-laranja-borda)]"
        }`}
      >
        {icone && <span className="shrink-0 opacity-70">{icone}</span>}
        <span className="shrink-0 text-[var(--cz-texto-suave)]">{rotulo}:</span>
        <span className="min-w-0 truncate font-semibold">
          {resumoSelecao(opcoes, selecionados, placeholder)}
        </span>
        <IconeSeta
          className={`h-4 w-4 shrink-0 opacity-60 transition-transform ${
            aberto ? "-rotate-90" : "rotate-90"
          }`}
        />
      </button>

      {aberto && (
        // `left-0` com largura própria, e não `left-0 right-0`: a pastilha tem a
        // largura do texto, e um painel do tamanho dela cortaria nome de conta.
        <div
          className={`absolute left-0 z-30 mt-1 ${larguraPainel} max-w-[min(19rem,90vw)] overflow-hidden rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] shadow-lg`}
        >
          <ListaOpcoes
            opcoes={opcoes}
            selecionados={selecionados}
            onMudar={onMudar}
            buscaPlaceholder={buscaPlaceholder}
            vazio={vazio}
          />
        </div>
      )}
    </div>
  );
}

/**
 * O botão que abre o painel de filtros avançados.
 *
 * Leva a CONTAGEM de quantos avançados estão ligados. Sem ela, um recorte ativo
 * dentro do painel fechado é invisível: a lista vem curta e nada na tela explica.
 */
export function BotaoAvancados({
  aberto,
  onAlternar,
  ativos,
}: {
  aberto: boolean;
  onAlternar: () => void;
  ativos: number;
}) {
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-expanded={aberto}
      className={`inline-flex ${ALTURA_PASTILHA} items-center gap-1.5 rounded-[var(--cz-raio)] border px-3 text-[13px] font-semibold transition-colors ${
        ativos > 0
          ? "border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]"
          : "border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[var(--cz-texto)] hover:border-[var(--cz-laranja-borda)]"
      }`}
    >
      <IconeFiltro className="h-4 w-4 shrink-0 opacity-70" />
      Filtros avançados
      {ativos > 0 && (
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--cz-laranja)] text-[11px] font-bold tabular-nums text-white">
          {ativos}
        </span>
      )}
      <IconeSeta
        className={`h-4 w-4 shrink-0 opacity-60 transition-transform ${
          aberto ? "-rotate-90" : "rotate-90"
        }`}
      />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Chips do que está ativo                           */
/* -------------------------------------------------------------------------- */

export type ChipFiltro = {
  /** Chave estável para o React. */
  chave: string;
  /** De que filtro é: "Conta", "Envio", "Prazo". */
  grupo: string;
  /** O valor escolhido. */
  rotulo: string;
  /** Some este valor do filtro. */
  remover: () => void;
  icone?: ReactNode;
};

/**
 * A fileira de chips do que está filtrado agora.
 *
 * OBRIGATÓRIA quando existe painel recolhido. Com todos os filtros à vista, dá
 * para conferir o recorte olhando os campos; com metade deles atrás de um botão,
 * o único jeito de saber por que a lista veio curta é esta fileira. Cada chip
 * também é o caminho mais curto para desfazer — um clique no chip, em vez de
 * abrir o painel, achar o campo e desmarcar.
 */
export function ChipsFiltro({
  chips,
  onLimparTudo,
}: {
  chips: ChipFiltro[];
  onLimparTudo: () => void;
}) {
  if (chips.length === 0) return null;

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.chave}
          type="button"
          onClick={chip.remover}
          title={`Remover o filtro ${chip.grupo}: ${chip.rotulo}`}
          className="group inline-flex max-w-[18rem] items-center gap-1.5 rounded-full border border-[var(--cz-hairline-forte)] bg-[var(--cz-fundo)] py-1 pl-2.5 pr-1.5 text-[12px] transition-colors hover:border-[var(--cz-laranja-borda)] hover:bg-[var(--cz-laranja-suave)]"
        >
          {chip.icone}
          <span className="shrink-0 text-[var(--cz-texto-fraco)]">{chip.grupo}</span>
          <span className="min-w-0 truncate font-semibold text-[var(--cz-texto)]">
            {chip.rotulo}
          </span>
          <span className="grid size-4 shrink-0 place-items-center rounded-full text-[var(--cz-texto-fraco)] transition-colors group-hover:bg-[var(--cz-laranja)] group-hover:text-white">
            <IconeFechar className="h-3 w-3" />
          </span>
        </button>
      ))}

      <button
        type="button"
        onClick={onLimparTudo}
        className="rounded-full px-2.5 py-1 text-[12px] font-semibold text-[var(--cz-texto-suave)] underline decoration-dotted underline-offset-2 transition-colors hover:text-[var(--cz-laranja-forte)]"
      >
        Limpar tudo
      </button>
    </div>
  );
}
