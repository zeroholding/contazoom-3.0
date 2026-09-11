"use client";

/**
 * Opções de tamanho de página.
 *
 * Sem valores acima de 100 de propósito: a tabela de vendas monta um dropdown de
 * detalhamento por linha (frete, taxa, receita líquida) e consulta o status de
 * SKU pendente, então cada linha custa. Oferecer "500" ou "todas" convidaria a um
 * travamento que a pessoa leria como defeito do sistema.
 */
const OPCOES_POR_PAGINA = [10, 20, 50, 100];

/**
 * Quantos números de página aparecem ao mesmo tempo, fora do primeiro e do
 * último.
 *
 * Eram DEZ botões numerados em sequência (1 2 3 4 5 6 7 8 9 10), o que fazia o
 * rodapé ocupar duas linhas em telas normais e quebrar para três junto do resto.
 * Três é o bastante para o passo curto — "a anterior, esta, a seguinte" — e o
 * primeiro/último continuam a um clique. O resto é para isso que existe o campo
 * de itens por página.
 */
const JANELA_PAGINAS = 3;

/**
 * Monta a sequência de páginas visíveis com reticências.
 *
 * Devolve números e a string "…" nos buracos. Sempre a MESMA quantidade de
 * elementos no meio, então a largura do rodapé não muda quando se navega — antes
 * o bloco crescia e encolhia a cada clique, e a tabela acima dançava com ele.
 */
function paginasVisiveis(atual: number, total: number): Array<number | "…"> {
  if (total <= JANELA_PAGINAS + 2) {
    return Array.from({ length: Math.max(total, 1) }, (_, i) => i + 1);
  }

  const metade = Math.floor(JANELA_PAGINAS / 2);
  let inicio = Math.max(2, atual - metade);
  const fim = Math.min(total - 1, inicio + JANELA_PAGINAS - 1);

  // Perto do fim a janela precisa recuar, senão ela encolhe e o bloco muda de
  // largura exatamente na última página.
  if (fim - inicio + 1 < JANELA_PAGINAS) {
    inicio = Math.max(2, fim - JANELA_PAGINAS + 1);
  }

  const saida: Array<number | "…"> = [1];
  if (inicio > 2) saida.push("…");
  for (let p = inicio; p <= fim; p++) saida.push(p);
  if (fim < total - 1) saida.push("…");
  saida.push(total);
  return saida;
}

const SetaEsquerda = () => (
  <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12.5 5.8a1 1 0 0 1 0 1.4L9.7 10l2.8 2.8a1 1 0 1 1-1.4 1.4l-3.5-3.5a1 1 0 0 1 0-1.4l3.5-3.5a1 1 0 0 1 1.4 0Z"
    />
  </svg>
);
const SetaDireita = () => (
  <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
    <path
      fill="currentColor"
      d="M7.5 5.8a1 1 0 0 1 1.4 0l3.5 3.5a1 1 0 0 1 0 1.4l-3.5 3.5a1 1 0 1 1-1.4-1.4L10.3 10 7.5 7.2a1 1 0 0 1 0-1.4Z"
    />
  </svg>
);

interface VendasPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  /**
   * Quando informado, aparece o seletor de itens por página.
   *
   * Opcional para o componente continuar servindo a quem pagina com tamanho fixo,
   * em vez de obrigar todo chamador a inventar um handler.
   */
  onItemsPerPageChange?: (itemsPerPage: number) => void;
}

/**
 * Rodapé de paginação da tabela de vendas.
 *
 * UMA LINHA, e é isso que o componente tem de entregar. Ele já foi um bloco de
 * três alturas: a frase "Mostrando X-Y de Z", o seletor de itens por página, a
 * fileira de pastilhas com o total por conta e dez botões numerados. Somava mais
 * de 120px de rodapé dentro de um cartão de altura fixa, ou seja, tirava da
 * tabela o espaço de duas ou três vendas — numa tela cujo trabalho é justamente
 * varrer vendas. O resumo por conta saiu para o topo do cartão
 * (`ResumoPorConta`), onde é contexto e não controle.
 */
export default function VendasPagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
}: VendasPaginationProps) {
  const formatNumber = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
  const primeiro = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const ultimo = Math.min(currentPage * itemsPerPage, totalItems);

  const botaoSeta =
    "grid h-7 w-7 shrink-0 place-items-center rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] text-[var(--cz-texto-suave)] transition-colors hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-laranja-forte)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--cz-hairline-forte)] disabled:hover:text-[var(--cz-texto-suave)]";

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-[var(--cz-hairline)] bg-[var(--cz-fundo)] px-4 py-2">
      {/* A frase e o seletor são a MESMA informação: "quantos por vez" e "quais
          estão aparecendo". Ficam colados, num único texto de 11px. */}
      <div className="flex items-center gap-2 text-[11px] text-[var(--cz-texto-suave)]">
        <span className="tabular-nums">
          <span className="font-semibold text-[var(--cz-texto)]">
            {formatNumber(primeiro)}–{formatNumber(ultimo)}
          </span>{" "}
          de{" "}
          <span className="font-semibold text-[var(--cz-texto)]">
            {formatNumber(totalItems)}
          </span>
        </span>

        {onItemsPerPageChange && (
          <label className="inline-flex items-center gap-1">
            <span className="text-[var(--cz-texto-fraco)]">por página</span>
            <select
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
              className="h-7 rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-1.5 text-[11px] font-semibold text-[var(--cz-texto)] transition-colors hover:border-[var(--cz-laranja-borda)] focus:border-[var(--cz-laranja)] focus:outline-none"
              aria-label="Quantidade de vendas por página"
            >
              {/* O valor em uso entra na lista mesmo fora das opções padrão: um
                  link antigo ou outra tela pode ter fixado 25, e um `<select>`
                  cujo `value` não existe entre as opções aparece VAZIO — parece
                  defeito e esconde o tamanho real da página. */}
              {(OPCOES_POR_PAGINA.includes(itemsPerPage)
                ? OPCOES_POR_PAGINA
                : [...OPCOES_POR_PAGINA, itemsPerPage].sort((a, b) => a - b)
              ).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center gap-1">
        {/* Seta em vez de "Anterior"/"Próxima" escritos: as duas palavras somavam
            ~130px de rodapé para dizer o que a seta diz, e o `aria-label` mantém
            o nome para leitor de tela. */}
        <button
          type="button"
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
          className={botaoSeta}
          disabled={currentPage <= 1}
          aria-label="Página anterior"
          title="Página anterior"
        >
          <SetaEsquerda />
        </button>

        {paginasVisiveis(currentPage, Math.max(totalPages, 1)).map(
          (pagina, indice) =>
            pagina === "…" ? (
              <span
                key={`gap-${indice}`}
                className="w-4 text-center text-[11px] leading-none text-[var(--cz-texto-fraco)]"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <button
                key={pagina}
                type="button"
                onClick={() => onPageChange(pagina)}
                aria-current={pagina === currentPage ? "page" : undefined}
                className={[
                  "grid h-7 min-w-7 shrink-0 place-items-center rounded-[var(--cz-raio)] px-1.5 text-[11px] font-semibold tabular-nums transition-colors",
                  pagina === currentPage
                    ? "bg-[var(--cz-laranja)] text-white"
                    : "border border-[var(--cz-hairline-forte)] text-[var(--cz-texto-suave)] hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-laranja-forte)]",
                ].join(" ")}
              >
                {pagina}
              </button>
            ),
        )}

        <button
          type="button"
          onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
          className={botaoSeta}
          disabled={currentPage >= totalPages}
          aria-label="Próxima página"
          title="Próxima página"
        >
          <SetaDireita />
        </button>
      </div>
    </div>
  );
}
