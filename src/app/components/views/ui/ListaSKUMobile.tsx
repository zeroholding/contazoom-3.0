"use client";

/**
 * Lista de SKUs em CARTÕES para o celular (abaixo de 768px), mais as duas folhas
 * inferiores que a acompanham: o editor de custo e o menu de ações do SKU.
 *
 * POR QUE EXISTE
 * A `TabelaGestaoSKU` já tinha um bloco de cartões, mas ele reproduzia a tabela
 * na vertical: foto, código, descrição, três selos, três números e CINCO ícones
 * soltos, ~335px por SKU (9.200px de página para 25 itens). E os ícones sem texto
 * obrigavam a decorar o que cada um fazia. Aqui cada SKU mostra só o que se olha
 * no dia a dia (código, descrição, situação e CUSTO) em ~180px, e todo o resto
 * mora no menu "⋯", com texto.
 *
 * O CUSTO É O ATOR PRINCIPAL
 * A tela existe para manter o custo em dia, então ele é a faixa grande do cartão
 * e a faixa inteira é o botão que abre o editor. SKU sem custo troca a faixa para
 * âmbar ("Definir custo"): a pendência salta aos olhos sem precisar de filtro.
 *
 * O arquivo só é usado pela `TabelaGestaoSKU`, que decide (via `useCelular`) se
 * monta a tabela ou esta lista: nunca as duas, para não dobrar o DOM.
 */

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Modal from "./Modal";
// Só o tipo: o import é apagado na compilação, então não há ciclo em tempo de execução.
import type { SKU } from "./TabelaGestaoSKU";

/* -------------------------------------------------------------------------- */
/*                                  Utilitários                               */
/* -------------------------------------------------------------------------- */

const moeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

/** "1.234,56", "12,5" e "12.5" viram número. Mesmo critério do formulário de criação. */
function lerDecimal(texto: string): number {
  const limpo = texto.trim().replace(/[^\d,.-]/g, "");
  if (!limpo) return 0;
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number.parseFloat(normalizado);
  return Number.isFinite(n) ? n : 0;
}

/** `skusFilhos` chega como lista ou como JSON em texto, dependendo da rota. */
function contarItensDoKit(sku: SKU): number {
  const bruto: unknown = sku.skusFilhos;
  if (Array.isArray(bruto)) return bruto.length;
  if (typeof bruto === "string") {
    try {
      const lista = JSON.parse(bruto);
      return Array.isArray(lista) ? lista.length : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

/** O custo pode chegar como texto ("329.00") quando vem de um Decimal do banco. */
const custoDe = (sku: SKU) => Number(sku.custoUnitario) || 0;

function Icone({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

const ICONE = {
  lapis: "m4 20 4-1 11-11-3-3L5 16zM14 6l3 3",
  relogio: "M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  moeda: "M12 3v18M16 7.5C15.3 6.6 14 6 12 6c-2.2 0-4 1-4 2.6 0 3.9 8 1.7 8 5.8 0 1.7-1.8 2.6-4 2.6-2 0-3.5-.7-4.2-1.8",
  inativar: "M18.4 18.4A9 9 0 0 1 5.6 5.6m12.8 12.8L5.6 5.6",
  ativar: "m9 12 2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  retroativo: "M4 4v5h5M20 20v-5h-5M5.5 15a8 8 0 0 0 13-3M18.5 9a8 8 0 0 0-13 3",
  imagem: "m4 16 4-4 4 4 3-3 5 5M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2ZM15 8h.01",
  lixeira: "M4 7h16m-10 4v6m4-6v6M9 7V4h6v3m-9 0 1 14h10l1-14",
  seta: "m9 6 6 6-6 6",
};

function Selo({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-none ${className}`}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Cartão                                   */
/* -------------------------------------------------------------------------- */

type PropsCartao = {
  sku: SKU;
  foto: string | null;
  colapsado: boolean;
  marcado: boolean;
  multiSelecao: boolean;
  buscandoImagem: boolean;
  onAlternarKit: () => void;
  onSelecionar: () => void;
  onBuscarImagem: () => void;
  onEditarCusto: () => void;
  onMaisAcoes: () => void;
};

function CartaoSKU({
  sku,
  foto,
  colapsado,
  marcado,
  multiSelecao,
  buscandoImagem,
  onAlternarKit,
  onSelecionar,
  onBuscarImagem,
  onEditarCusto,
  onMaisAcoes,
}: PropsCartao) {
  const custo = custoDe(sku);
  const semCusto = custo <= 0;
  const ehKit = sku.tipo === "pai";
  const doKit = !ehKit && !!sku.skuPai;
  const itensDoKit = ehKit ? contarItensDoKit(sku) : 0;
  const hierarquia = [sku.hierarquia1, sku.hierarquia2].filter(Boolean).join(" › ");

  return (
    <li
      className={[
        "rounded-[var(--cz-raio-cartao)] border bg-[var(--cz-superficie)] p-3.5 shadow-[var(--cz-elev-1)]",
        marcado ? "border-blue-300 bg-blue-50" : "border-[var(--cz-hairline)]",
        // Item de kit: recuado e com a barra azul à esquerda, como na tabela.
        doKit ? "ml-4 border-l-4 border-l-blue-300" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        {multiSelecao && (
          <label
            className="-ml-2 grid! h-11 w-11 shrink-0 cursor-pointer place-items-center"
            aria-label={`Selecionar SKU ${sku.sku}`}
          >
            <input
              type="checkbox"
              checked={marcado}
              onChange={onSelecionar}
              className="h-5 w-5 rounded border-[var(--cz-hairline-forte)] text-[var(--cz-laranja)] focus:ring-[var(--cz-laranja)]"
            />
          </label>
        )}

        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={foto}
            alt=""
            className="h-14 w-14 shrink-0 rounded-lg border border-[var(--cz-hairline)] bg-white object-cover"
            loading="lazy"
          />
        ) : (
          <button
            type="button"
            onClick={onBuscarImagem}
            disabled={buscandoImagem}
            aria-label={`Buscar imagem do SKU ${sku.sku}`}
            className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-dashed border-[var(--cz-hairline-forte)] bg-[var(--cz-fundo)] text-[var(--cz-texto-fraco)] transition-colors active:bg-[var(--cz-laranja-suave)] disabled:opacity-50"
          >
            {buscandoImagem ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Icone d={ICONE.imagem} className="h-6 w-6" />
            )}
          </button>
        )}

        <div className="min-w-0 flex-1">
          {/* Os botões de 44px sobem 8px (e saem 8px para a direita) para o toque
              ficar grande sem o cartão ganhar uma linha inteira só para eles. */}
          <div className="flex items-center justify-between gap-1">
            <p className="min-w-0 truncate font-mono text-sm font-bold text-[var(--cz-texto)]">{sku.sku}</p>
            <div className="-mr-2 -mt-2 flex shrink-0">
              {ehKit && (
                <button
                  type="button"
                  onClick={onAlternarKit}
                  aria-expanded={!colapsado}
                  aria-label={`${colapsado ? "Mostrar" : "Ocultar"} os itens do kit ${sku.sku}`}
                  className="grid h-11 w-11 place-items-center rounded-full text-[var(--cz-laranja)] transition-colors active:bg-[var(--cz-laranja-suave)]"
                >
                  <Icone d={ICONE.seta} className={`h-5 w-5 transition-transform ${colapsado ? "" : "rotate-90"}`} />
                </button>
              )}
              <button
                type="button"
                onClick={onMaisAcoes}
                aria-label={`Mais ações do SKU ${sku.sku}`}
                className="grid h-11 w-11 place-items-center rounded-full text-[var(--cz-texto-suave)] transition-colors active:bg-[var(--cz-fundo)]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <circle cx="5" cy="12" r="1.9" />
                  <circle cx="12" cy="12" r="1.9" />
                  <circle cx="19" cy="12" r="1.9" />
                </svg>
              </button>
            </div>
          </div>

          <p className="line-clamp-2 text-sm leading-snug text-[var(--cz-texto-suave)]">{sku.produto}</p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {ehKit && (
              <Selo className="bg-blue-100 text-blue-800">
                Kit{itensDoKit > 0 ? ` · ${itensDoKit} ${itensDoKit === 1 ? "item" : "itens"}` : ""}
              </Selo>
            )}
            {doKit && <Selo className="bg-green-100 text-green-800">Item do kit</Selo>}
            {!sku.ativo ? (
              <Selo className="bg-red-100 text-red-800">Inativo</Selo>
            ) : !sku.temEstoque ? (
              <Selo className="bg-gray-100 text-gray-700">Sem estoque</Selo>
            ) : (
              <Selo className="bg-green-100 text-green-800">Ativo</Selo>
            )}
          </div>

          {(doKit || hierarquia) && (
            <p className="mt-1.5 line-clamp-2 text-xs text-[var(--cz-texto-fraco)]">
              {doKit && (
                <>
                  No kit <span className="font-semibold text-blue-700">{sku.skuPai}</span>
                  {hierarquia ? " · " : ""}
                </>
              )}
              {hierarquia}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-stretch gap-2">
        <button
          type="button"
          onClick={onEditarCusto}
          aria-label={
            semCusto
              ? `Definir o custo do SKU ${sku.sku}, que está sem custo`
              : `Alterar o custo do SKU ${sku.sku}, hoje ${moeda(custo)}`
          }
          className={[
            "flex min-h-14 min-w-0 flex-1 items-center justify-between gap-2 rounded-[var(--cz-raio)] border px-3 text-left transition-colors",
            semCusto
              ? "border-amber-300 bg-amber-50 text-amber-900 active:bg-amber-100"
              : "border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)] active:bg-[var(--cz-laranja-borda)]",
          ].join(" ")}
        >
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-[0.05em] opacity-80">
              {semCusto ? "Sem custo" : "Custo atual"}
            </span>
            <span className="block truncate text-xl font-bold leading-tight tabular-nums">
              {semCusto ? "Definir custo" : moeda(custo)}
            </span>
          </span>
          <Icone d={ICONE.lapis} className="h-5 w-5 shrink-0" />
        </button>

        <dl className="flex shrink-0 items-center gap-4 pl-1 pr-1 text-center">
          <div>
            <dt className="text-xs text-[var(--cz-texto-fraco)]">Qtd.</dt>
            <dd className="text-base font-bold text-[var(--cz-texto)]">{ehKit ? "—" : sku.quantidade}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--cz-texto-fraco)]">Vendas</dt>
            <dd className="text-base font-bold tabular-nums text-[var(--cz-texto)]">{sku.salesCount ?? "—"}</dd>
          </div>
        </dl>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Lista                                   */
/* -------------------------------------------------------------------------- */

export type PropsListaSKUMobile = {
  /** Já na ordem hierárquica (kit, depois os itens dele). */
  skus: SKU[];
  colapsados: Record<string, boolean>;
  multiSelecao: boolean;
  selecionados: string[];
  imagem: (sku: SKU) => string | null;
  imagemCarregando: string | null;
  onAlternarKit: (codigoDoKit: string) => void;
  onSelecionar: (id: string) => void;
  onSelecionarTodos: () => void;
  onBuscarImagem: (sku: SKU) => void;
  onEditarCusto: (sku: SKU) => void;
  onMaisAcoes: (sku: SKU) => void;
};

export default function ListaSKUMobile({
  skus,
  colapsados,
  multiSelecao,
  selecionados,
  imagem,
  imagemCarregando,
  onAlternarKit,
  onSelecionar,
  onSelecionarTodos,
  onBuscarImagem,
  onEditarCusto,
  onMaisAcoes,
}: PropsListaSKUMobile) {
  const visiveis = skus.filter((sku) => !(sku.skuPai && colapsados[sku.skuPai]));
  const todos = skus.length > 0 && selecionados.length === skus.length;

  return (
    // O fundo cinza-claro faz os cartões brancos se destacarem da moldura branca da tabela.
    <div className="bg-[var(--cz-fundo)] p-3">
      {multiSelecao && (
        <label className="mb-3 flex! min-h-11 cursor-pointer items-center gap-3 rounded-[var(--cz-raio)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] px-3 text-sm font-semibold text-[var(--cz-texto)]">
          <input
            type="checkbox"
            checked={todos}
            onChange={onSelecionarTodos}
            className="h-5 w-5 rounded border-[var(--cz-hairline-forte)] text-[var(--cz-laranja)] focus:ring-[var(--cz-laranja)]"
          />
          Selecionar todos desta página
        </label>
      )}
      <ul className="flex flex-col gap-3">
        {visiveis.map((sku) => (
          <CartaoSKU
            key={sku.id}
            sku={sku}
            foto={imagem(sku)}
            colapsado={!!colapsados[sku.sku]}
            marcado={selecionados.includes(sku.id)}
            multiSelecao={multiSelecao}
            buscandoImagem={imagemCarregando === sku.id}
            onAlternarKit={() => onAlternarKit(sku.sku)}
            onSelecionar={() => onSelecionar(sku.id)}
            onBuscarImagem={() => onBuscarImagem(sku)}
            onEditarCusto={() => onEditarCusto(sku)}
            onMaisAcoes={() => onMaisAcoes(sku)}
          />
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                        Folha: editor de custo do SKU                       */
/* -------------------------------------------------------------------------- */

type PropsFolhaCusto = {
  sku: SKU | null;
  onClose: () => void;
  /** Deve lançar erro (com mensagem legível) quando o servidor recusar. */
  onSalvar: (sku: SKU, custo: number) => Promise<void>;
  onHistorico: (sku: SKU) => void;
};

/**
 * Editor de custo numa folha inferior (o `Modal` já vira folha no celular).
 *
 * Campo grande, teclado decimal, Salvar/Cancelar em largura total. Guarda o
 * ÚLTIMO SKU aberto: o `Modal` demora 350ms para sair, e sem isso o conteúdo
 * sumiria no instante em que o pai zera o `sku`, deixando uma folha vazia
 * descendo.
 */
export function FolhaCustoSKU({ sku, onClose, onSalvar, onHistorico }: PropsFolhaCusto) {
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<SKU | null>(null);
  const campoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sku) return;
    setUltimo(sku);
    setValor(custoDe(sku) > 0 ? String(custoDe(sku)).replace(".", ",") : "");
    setErro(null);
    // Foco só depois da subida da folha (350ms): focar antes faz o teclado abrir
    // enquanto ela ainda está a caminho e o campo pula de lugar.
    const espera = window.setTimeout(() => {
      campoRef.current?.focus({ preventScroll: true });
      campoRef.current?.select();
    }, 380);
    return () => window.clearTimeout(espera);
  }, [sku]);

  const atual = sku ?? ultimo;
  const novo = lerDecimal(valor);
  const custoAtual = atual ? custoDe(atual) : 0;
  const variacao = custoAtual > 0 ? ((novo - custoAtual) / custoAtual) * 100 : null;
  const mudou = !!atual && valor.trim() !== "" && Math.abs(novo - custoAtual) > 0.004;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!atual || salvando) return;
    if (!valor.trim() || novo < 0) {
      setErro("Informe um custo maior ou igual a zero.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar(atual, novo);
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar o custo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal isOpen={!!sku} onClose={salvando ? () => undefined : onClose} title="Alterar custo" size="md">
      {atual && (
        <form onSubmit={enviar} noValidate>
          <div className="rounded-[var(--cz-raio)] bg-[var(--cz-fundo)] p-3">
            <p className="break-all font-mono text-sm font-bold text-[var(--cz-texto)]">{atual.sku}</p>
            <p className="mt-1 text-sm leading-snug text-[var(--cz-texto-suave)]">{atual.produto}</p>
          </div>

          <label htmlFor="cz-custo-sku" className="mt-5 block text-sm font-semibold text-[var(--cz-texto)]">
            Custo unitário
          </label>
          <div className="relative mt-2">
            <span
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-[var(--cz-texto-suave)]"
            >
              R$
            </span>
            {/* Tamanho em `style`: o CSS global de `input[type=text]` não está em
                camada e vence as utilitárias do Tailwind (altura, recuo e fonte). */}
            <input
              id="cz-custo-sku"
              ref={campoRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                setErro(null);
              }}
              placeholder="0,00"
              disabled={salvando}
              aria-invalid={!!erro}
              aria-describedby="cz-custo-sku-ajuda"
              className="w-full rounded-xl border border-[var(--cz-hairline-forte)] bg-white font-bold tabular-nums text-[var(--cz-texto)] outline-none focus:border-[var(--cz-laranja)] focus:ring-2 focus:ring-[var(--cz-laranja-suave)]"
              style={{ height: "4rem", paddingLeft: "3.25rem", paddingRight: "1rem", fontSize: "1.75rem" }}
            />
          </div>

          <p id="cz-custo-sku-ajuda" className="mt-2 text-sm text-[var(--cz-texto-suave)]">
            {custoAtual > 0 ? (
              <>
                Custo atual <strong className="text-[var(--cz-texto)]">{moeda(custoAtual)}</strong>.
              </>
            ) : (
              "Este SKU ainda não tem custo cadastrado."
            )}
            {mudou && variacao !== null && (
              <>
                {" "}
                Novo valor{" "}
                <strong className="text-[var(--cz-texto)]">{moeda(novo)}</strong> (
                {variacao > 0 ? "+" : ""}
                {variacao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%).
              </>
            )}
          </p>

          {erro && (
            <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {erro}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-3">
            <button
              type="submit"
              disabled={salvando}
              className="h-12 w-full rounded-[var(--cz-raio)] bg-[var(--cz-laranja)] text-base font-semibold text-white transition-colors active:bg-[var(--cz-laranja-forte)] disabled:opacity-60"
            >
              {salvando ? "Salvando…" : "Salvar custo"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={salvando}
              className="h-12 w-full rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-white text-base font-semibold text-[var(--cz-texto)] transition-colors active:bg-[var(--cz-fundo)] disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>

          <button
            type="button"
            onClick={() => onHistorico(atual)}
            className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-[var(--cz-raio)] text-sm font-semibold text-[var(--cz-laranja-forte)] transition-colors active:bg-[var(--cz-laranja-suave)]"
          >
            <Icone d={ICONE.relogio} className="h-4 w-4" />
            Ver histórico de custos
          </button>
        </form>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*                         Folha: menu de ações do SKU                        */
/* -------------------------------------------------------------------------- */

type PropsFolhaAcoes = {
  sku: SKU | null;
  onClose: () => void;
  onCusto: (sku: SKU) => void;
  onHistorico: (sku: SKU) => void;
  onEditar: (sku: SKU) => void;
  onStatus: (sku: SKU) => void;
  onRetroativo: (sku: SKU) => void;
  onImagem: (sku: SKU) => void;
  onExcluir: (sku: SKU) => void;
  /** Id do SKU com o custo retroativo em andamento (ou null). */
  retroativoEmAndamento: string | null;
  /** Id do SKU com a busca de imagem em andamento (ou null). */
  imagemEmAndamento: string | null;
};

type ItemAcao = {
  chave: string;
  rotulo: string;
  detalhe?: string;
  icone: string;
  tom?: "laranja" | "perigo";
  desabilitado?: boolean;
  aoTocar: () => void;
};

/** Todas as ações do SKU, com texto. Substitui a fileira de cinco ícones soltos. */
export function FolhaAcoesSKU({
  sku,
  onClose,
  onCusto,
  onHistorico,
  onEditar,
  onStatus,
  onRetroativo,
  onImagem,
  onExcluir,
  retroativoEmAndamento,
  imagemEmAndamento,
}: PropsFolhaAcoes) {
  const [ultimo, setUltimo] = useState<SKU | null>(null);
  useEffect(() => {
    if (sku) setUltimo(sku);
  }, [sku]);
  const atual = sku ?? ultimo;

  const itens: ItemAcao[] = atual
    ? [
        {
          chave: "custo",
          rotulo: custoDe(atual) > 0 ? "Alterar custo" : "Definir custo",
          detalhe: custoDe(atual) > 0 ? `Hoje ${moeda(custoDe(atual))}` : "Este SKU está sem custo",
          icone: ICONE.moeda,
          tom: "laranja",
          aoTocar: () => onCusto(atual),
        },
        {
          chave: "historico",
          rotulo: "Histórico de custos",
          detalhe: "Veja quando e por quanto o custo mudou",
          icone: ICONE.relogio,
          aoTocar: () => onHistorico(atual),
        },
        {
          chave: "editar",
          rotulo: "Editar dados do SKU",
          detalhe: "Nome, tipo, quantidade, categorias e imagem",
          icone: ICONE.lapis,
          aoTocar: () => onEditar(atual),
        },
        {
          chave: "status",
          rotulo: atual.ativo ? "Inativar SKU" : "Ativar SKU",
          detalhe: atual.ativo ? "Deixa de aparecer em algumas listagens" : "Volta a aparecer nas listagens",
          icone: atual.ativo ? ICONE.inativar : ICONE.ativar,
          aoTocar: () => onStatus(atual),
        },
        {
          chave: "retroativo",
          rotulo: retroativoEmAndamento === atual.id ? "Aplicando custo…" : "Aplicar custo em vendas passadas",
          detalhe: "Preenche o custo das vendas antigas sem CMV",
          icone: ICONE.retroativo,
          desabilitado: retroativoEmAndamento === atual.id,
          aoTocar: () => onRetroativo(atual),
        },
        {
          chave: "imagem",
          rotulo: imagemEmAndamento === atual.id ? "Buscando imagem…" : "Atualizar imagem",
          detalhe: "Busca a miniatura no anúncio",
          icone: ICONE.imagem,
          desabilitado: imagemEmAndamento === atual.id,
          aoTocar: () => onImagem(atual),
        },
        {
          chave: "excluir",
          rotulo: "Excluir SKU",
          detalhe: "Não pode ser desfeito",
          icone: ICONE.lixeira,
          tom: "perigo",
          aoTocar: () => onExcluir(atual),
        },
      ]
    : [];

  return (
    <Modal isOpen={!!sku} onClose={onClose} title="Ações do SKU" size="md">
      {atual && (
        <div>
          <div className="rounded-[var(--cz-raio)] bg-[var(--cz-fundo)] p-3">
            <p className="break-all font-mono text-sm font-bold text-[var(--cz-texto)]">{atual.sku}</p>
            <p className="mt-1 line-clamp-2 text-sm leading-snug text-[var(--cz-texto-suave)]">{atual.produto}</p>
          </div>
          <ul className="mt-2">
            {itens.map((item) => (
              <li key={item.chave} className={item.tom === "perigo" ? "mt-1 border-t border-[var(--cz-hairline)] pt-1" : ""}>
                <button
                  type="button"
                  disabled={item.desabilitado}
                  onClick={() => {
                    // Fecha a folha ANTES: a ação abre outro modal, e dois empilhados
                    // deixariam o primeiro aparecendo por baixo do segundo.
                    onClose();
                    item.aoTocar();
                  }}
                  className={[
                    "flex min-h-14 w-full items-center gap-3 rounded-[var(--cz-raio)] px-2 text-left transition-colors disabled:opacity-50",
                    item.tom === "perigo"
                      ? "text-rose-700 active:bg-rose-50"
                      : item.tom === "laranja"
                        ? "text-[var(--cz-laranja-forte)] active:bg-[var(--cz-laranja-suave)]"
                        : "text-[var(--cz-texto)] active:bg-[var(--cz-fundo)]",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "grid h-10 w-10 shrink-0 place-items-center rounded-full",
                      item.tom === "perigo"
                        ? "bg-rose-50"
                        : item.tom === "laranja"
                          ? "bg-[var(--cz-laranja-suave)]"
                          : "bg-[var(--cz-fundo)]",
                    ].join(" ")}
                  >
                    <Icone d={item.icone} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-tight">{item.rotulo}</span>
                    {item.detalhe && (
                      <span className="mt-0.5 block text-[13px] leading-snug text-[var(--cz-texto-suave)]">
                        {item.detalhe}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
