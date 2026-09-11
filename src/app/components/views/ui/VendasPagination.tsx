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
  resumoPorConta?: Array<{ conta: string; total: number }>;
}

export default function VendasPagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  resumoPorConta
}: VendasPaginationProps) {
  const formatNumber = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
  return (
    <div className="px-6 py-4 border-t border-[var(--cz-hairline)] bg-gray-50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-gray-600">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
          <span>Mostrando</span>
          <span className="font-medium text-gray-900">
            {totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}
          </span>
          <span>-</span>
          <span className="font-medium text-gray-900">
            {Math.min(currentPage * itemsPerPage, totalItems)}
          </span>
          <span>de</span>
          <span className="font-medium text-gray-900">{formatNumber(totalItems)}</span>

          {/* O seletor fica JUNTO do "mostrando X-Y de Z", e não solto num canto:
              é a mesma frase. Trocar o tamanho da página é responder "quantos por
              vez", e a resposta atual está escrita ali ao lado. */}
          {onItemsPerPageChange && (
            <label className="ml-2 inline-flex items-center gap-1.5">
              <span className="text-gray-500">Por página:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
                className="h-8 rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-white px-2 text-sm font-medium text-gray-800 transition-colors hover:border-[var(--cz-laranja-borda)] focus:border-[var(--cz-laranja)] focus:outline-none"
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
        {Array.isArray(resumoPorConta) && resumoPorConta.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {resumoPorConta.map((item) => (
              <span
                key={item.conta || "sem-conta"}
                className="inline-flex flex-wrap items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
                title={`${item.conta || "Sem conta"} - ${formatNumber(item.total)} vendas`}
              >
                <span className="font-medium">{item.conta || "Sem conta"}</span>
                <span>-</span>
                <span>{formatNumber(item.total)} vendas</span>
              </span>
            ))}
            <span className="inline-flex flex-wrap items-center gap-1 rounded-full bg-gray-200 px-2.5 py-1 text-xs text-gray-800">
              <span className="font-semibold">Total</span>
              <span>-</span>
              <span>{formatNumber(totalItems)} vendas</span>
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
          className="px-3 py-2 text-sm font-medium rounded border border-[var(--cz-hairline)] text-gray-600 hover:text-gray-800 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={currentPage === 1}
        >
          Anterior
        </button>
        <div className="flex flex-wrap items-center gap-1">
          {(() => {
            const maxVisiblePages = typeof window !== 'undefined' && window.innerWidth < 640 ? 5 : 10;
            const currentGroup = Math.ceil(currentPage / maxVisiblePages);
            const startPage = (currentGroup - 1) * maxVisiblePages + 1;
            const endPage = Math.min(startPage + maxVisiblePages - 1, totalPages);
            
            const pages = [];
            for (let i = startPage; i <= endPage; i++) {
              pages.push(i);
            }
            
            return pages.map((pageNumber) => {
              const isActive = pageNumber === currentPage;
              return (
                <button
                  key={pageNumber}
                  onClick={() => onPageChange(pageNumber)}
                  className={`h-8 w-8 rounded-full text-sm font-medium flex items-center justify-center transition-colors ${
                    isActive
                      ? "bg-orange-500 text-white"
                      : "border border-[var(--cz-hairline)] text-gray-600 hover:text-gray-800 hover:border-gray-300"
                  }`}
                >
                  {pageNumber}
                </button>
              );
            });
          })()}
        </div>
        <button
          onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
          className="px-3 py-2 text-sm font-medium rounded border border-[var(--cz-hairline)] text-gray-600 hover:text-gray-800 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={currentPage === totalPages}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
