"use client";

/**
 * A paginação da fila, no formato do CyberDock.
 *
 *   Pacotes por página: [20 ▾]              [‹] 1 … 4 [5] 6 … 58 [›]
 *
 * NÚMEROS, e não só "Anterior / Próxima". Numa fila de 58 páginas, saltar para a
 * última é a operação de conferência mais comum ("o que está mais para frente"), e
 * com só duas setas isso são 57 cliques.
 *
 * As setas são SVG e não os glifos ‹ ›: os caracteres mudam de tamanho e de
 * alinhamento vertical conforme a fonte que o sistema tem instalada, e ficam
 * visivelmente desalinhados dos números ao lado. É a mesma decisão comentada no
 * original.
 */

/**
 * A sequência com reticências.
 *
 * Sempre a MESMA quantidade de elementos no meio, então a largura do bloco não
 * muda ao navegar — antes de existir esta função, o rodapé crescia e encolhia a
 * cada clique e a tabela acima dançava com ele.
 */
import { useCelular } from "@/hooks/useMediaQuery";

function paginasVisiveis(atual: number, total: number): Array<number | "…"> {
  if (total <= 7) {
    return Array.from({ length: Math.max(total, 1) }, (_, i) => i + 1);
  }

  const saida: Array<number | "…"> = [1];
  const inicio = Math.max(2, atual - 1);
  const fim = Math.min(total - 1, atual + 1);

  if (inicio > 2) saida.push("…");
  for (let p = inicio; p <= fim; p++) saida.push(p);
  if (fim < total - 1) saida.push("…");
  saida.push(total);

  return saida;
}

const BOTAO =
  "grid h-8 min-w-8 place-items-center rounded-lg border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-2 text-[12.5px] font-semibold tabular-nums text-[var(--cz-texto-suave)] transition-colors hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-laranja-forte)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--cz-hairline-forte)] disabled:hover:text-[var(--cz-texto-suave)]";

export default function PaginacaoSeparacao({
  pagina,
  totalPaginas,
  porPagina,
  onPagina,
  onPorPagina,
}: {
  pagina: number;
  totalPaginas: number;
  porPagina: number;
  onPagina: (p: number) => void;
  onPorPagina: (v: number) => void;
}) {
  const total = Math.max(totalPaginas, 1);
  const celular = useCelular();

  // Celular: Anterior / "3 / 12" / Próxima em botões de 44px, e o tamanho da página
  // numa linha abaixo. A fileira numerada (1 … 4 5 6 … 58) tem botões de 32px, abaixo
  // do alvo de toque, e numa tela de 390px aperta tudo contra a borda.
  if (celular) {
    const botao =
      "h-11 flex-1 rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-3 text-[14px] font-semibold text-[var(--cz-texto)] transition-colors active:bg-[#F4F5F7] disabled:cursor-not-allowed disabled:opacity-40";
    const opcoes = [20, 50, 100].includes(porPagina)
      ? [20, 50, 100]
      : [20, 50, 100, porPagina].sort((a, b) => a - b);

    return (
      <div className="flex flex-col gap-3 border-t border-[var(--cz-hairline)] px-4 py-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onPagina(pagina - 1)} disabled={pagina <= 1} className={botao}>
            Anterior
          </button>
          <span className="min-w-[4.5rem] shrink-0 text-center text-[14px] font-bold tabular-nums text-[var(--cz-texto)]">
            {pagina} / {total}
          </span>
          <button type="button" onClick={() => onPagina(pagina + 1)} disabled={pagina >= total} className={botao}>
            Próxima
          </button>
        </div>
        {/* `div` e não `label`: o `globals.css` força `label { display: block }` sem camada,
            o que desfaria o `flex` e empilharia o texto sobre o campo. */}
        <div className="flex items-center justify-between gap-3 text-[13px] text-[var(--cz-texto-suave)]">
          Pacotes por página
          <select
            aria-label="Pacotes por página"
            value={porPagina}
            onChange={(e) => onPorPagina(Number(e.target.value))}
            className="h-11 rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-3 text-[14px] font-semibold text-[var(--cz-texto)] outline-none focus:border-[var(--cz-laranja)]"
          >
            {opcoes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cz-hairline)] px-4 py-3">
      <label className="flex items-center gap-2 text-[12.5px] text-[var(--cz-texto-suave)]">
        Pacotes por página:
        <select
          value={porPagina}
          onChange={(e) => onPorPagina(Number(e.target.value))}
          className="h-8 rounded-lg border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-2 text-[12.5px] font-semibold text-[var(--cz-texto)] outline-none focus:border-[var(--cz-laranja)]"
        >
          {/* O valor em uso entra na lista mesmo fora do padrão: um link salvo pode
              ter fixado 200, e um `select` cujo `value` não existe entre as opções
              aparece VAZIO — parece defeito e esconde o tamanho real da página. */}
          {([20, 50, 100].includes(porPagina)
            ? [20, 50, 100]
            : [...[20, 50, 100], porPagina].sort((a, b) => a - b)
          ).map((n) => (
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
          title="Página anterior"
          aria-label="Página anterior"
          className={BOTAO}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {paginasVisiveis(pagina, total).map((p, i) =>
          p === "…" ? (
            <span
              key={`gap-${i}`}
              className="w-5 text-center text-[12.5px] text-[var(--cz-texto-fraco)]"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPagina(p)}
              aria-current={p === pagina ? "page" : undefined}
              className={
                p === pagina
                  ? "grid h-8 min-w-8 place-items-center rounded-lg border border-[var(--cz-laranja)] bg-[var(--cz-laranja)] px-2 text-[12.5px] font-bold tabular-nums text-white"
                  : BOTAO
              }
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          onClick={() => onPagina(pagina + 1)}
          disabled={pagina >= total}
          title="Próxima página"
          aria-label="Próxima página"
          className={BOTAO}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
