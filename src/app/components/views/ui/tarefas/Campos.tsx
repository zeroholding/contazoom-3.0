"use client";

/**
 * Campos de formulário e botões do módulo.
 *
 * O estilo base de input vem de `globals.css`, escopado em `.cz-tarefas` — por
 * isso os componentes aqui quase não trazem classe de borda ou altura: se
 * trouxessem, brigariam com o `!important` global e perderiam.
 *
 * Todo campo tem `label` amarrado por `id`/`htmlFor` e mensagem de erro
 * associada por `aria-describedby`. Placeholder não substitui rótulo: ele
 * desaparece quando a pessoa digita, e quem usa leitor de tela não o ouve como
 * nome do campo.
 *
 * Onde a folha escopada cravou uma propriedade por seletor de elemento
 * (`.cz-tarefas select { padding }`), o componente resolve por `style` em vez de
 * utilitária: seletor com elemento vence classe única do Tailwind, então uma
 * utilitária ali simplesmente não pintaria.
 */

import { ReactNode, SelectHTMLAttributes, useId } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import Icone from "./Icone";

/* --------------------------------- Wrapper -------------------------------- */

type CampoProps = {
  id: string;
  rotulo: string;
  erro?: string | null;
  ajuda?: string;
  obrigatorio?: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * Hierarquia do bloco de campo: rótulo (o mais escuro), campo, e uma linha só
 * de apoio embaixo — ajuda OU erro, nunca as duas.
 *
 * O texto do rótulo vai num `span` porque `.cz-tarefas label { color }` usa
 * `!important` e nenhuma utilitária venceria no próprio `label`. No `span` a cor
 * é herdada, e aí a classe manda.
 */
function Campo({
  id,
  rotulo,
  erro,
  ajuda,
  obrigatorio,
  children,
  className = "",
}: CampoProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="flex items-baseline gap-1">
        <span className="text-[0.8125rem] font-semibold leading-5 text-gray-900">
          {rotulo}
        </span>
        {obrigatorio && (
          <span className="text-[0.8125rem] leading-5 text-[#D92D20]" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {erro ? (
        <p
          id={`${id}-erro`}
          className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-[#B42318]"
        >
          <Icone
            nome="AlertTriangle"
            className="mt-px h-3.5 w-3.5 shrink-0"
          />
          <span>{erro}</span>
        </p>
      ) : ajuda ? (
        <p id={`${id}-ajuda`} className="mt-1.5 text-xs leading-5 text-gray-500">
          {ajuda}
        </p>
      ) : null}
    </div>
  );
}

/* --------------------------------- Entrada -------------------------------- */

type EntradaProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  rotulo: string;
  erro?: string | null;
  ajuda?: string;
  wrapperClassName?: string;
};

export function Entrada({
  rotulo,
  erro,
  ajuda,
  required,
  wrapperClassName,
  className = "",
  ...props
}: EntradaProps) {
  const id = useId();
  return (
    <Campo
      id={id}
      rotulo={rotulo}
      erro={erro}
      ajuda={ajuda}
      obrigatorio={required}
      className={wrapperClassName}
    >
      <input
        id={id}
        required={required}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined}
        className={`${erro ? "campo-invalido" : ""} ${className}`}
        {...props}
      />
    </Campo>
  );
}

/* ----------------------------------- Área --------------------------------- */

type AreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  rotulo: string;
  erro?: string | null;
  ajuda?: string;
  wrapperClassName?: string;
};

export function Area({
  rotulo,
  erro,
  ajuda,
  required,
  wrapperClassName,
  className = "",
  ...props
}: AreaProps) {
  const id = useId();
  return (
    <Campo
      id={id}
      rotulo={rotulo}
      erro={erro}
      ajuda={ajuda}
      obrigatorio={required}
      className={wrapperClassName}
    >
      <textarea
        id={id}
        required={required}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined}
        className={`${erro ? "campo-invalido" : ""} ${className}`}
        {...props}
      />
    </Campo>
  );
}

/* ---------------------------------- Escolha ------------------------------- */

export type Opcao = { valor: string; texto: string };

type EscolhaProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "id" | "children"
> & {
  rotulo: string;
  opcoes: Opcao[];
  /** Primeira opção neutra. Omitir quando o campo é obrigatório de verdade. */
  vazio?: string;
  erro?: string | null;
  ajuda?: string;
  wrapperClassName?: string;
};

export function Escolha({
  rotulo,
  opcoes,
  vazio,
  erro,
  ajuda,
  required,
  wrapperClassName,
  className = "",
  style,
  ...props
}: EscolhaProps) {
  const id = useId();
  return (
    <Campo
      id={id}
      rotulo={rotulo}
      erro={erro}
      ajuda={ajuda}
      obrigatorio={required}
      className={wrapperClassName}
    >
      {/* A seta nativa do select no Windows é um triângulo cinza de outra época.
          `appearance-none` a remove e a nossa entra no lugar, sem tocar em
          `value`/`onChange`. O padding à direita vai por `style` porque a folha
          escopada define `padding` no seletor `.cz-tarefas select`. */}
      <div className="relative">
        <select
          id={id}
          required={required}
          aria-invalid={erro ? true : undefined}
          aria-describedby={
            erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined
          }
          style={{ paddingRight: "2.25rem", ...style }}
          className={`appearance-none ${erro ? "campo-invalido" : ""} ${className}`}
          {...props}
        >
          {vazio !== undefined && <option value="">{vazio}</option>}
          {opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        />
      </div>
    </Campo>
  );
}

/* ---------------------------------- Botão --------------------------------- */

type BotaoProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "primario" | "secundario" | "perigo" | "fantasma" | "escuro";
  /**
   * `sm` para ação em linha de tabela, `md` para o corpo da tela, `lg` para a
   * ação principal. Sem hierarquia de tamanho, "Salvar" e "Ver histórico" pesam
   * igual e o olho não sabe onde bater.
   */
  tamanho?: "sm" | "md" | "lg";
  icone?: string;
  carregando?: boolean;
  /** Texto exibido enquanto carrega. Sem isso, o botão parece travado. */
  textoCarregando?: string;
  /** Ocupa a largura do container. Útil em modal estreito e em mobile. */
  larguraCheia?: boolean;
};

const VARIANTE: Record<string, string> = {
  // Borda um tom abaixo do fundo: dá aresta ao botão sem gradiente. A sombra é
  // tingida de laranja para o primário não parecer colado no cartão branco.
  primario:
    "bg-orange-500 text-white border border-orange-600 shadow-[0_1px_2px_rgba(194,65,12,0.24)] hover:bg-orange-600 hover:border-orange-700 active:bg-orange-700",
  escuro:
    "bg-gray-900 text-white border border-gray-900 shadow-[0_1px_2px_rgba(16,24,40,0.24)] hover:bg-gray-800 hover:border-gray-800 active:bg-gray-900",
  // #D0D5DD é a hairline forte do módulo: some menos que gray-200 e não vira
  // moldura como gray-400.
  secundario:
    "bg-white text-gray-700 border border-[#D0D5DD] shadow-[0_1px_2px_rgba(16,24,40,0.06)] hover:bg-gray-50 hover:text-gray-900 hover:border-[#98A2B3] active:bg-gray-100",
  perigo:
    "bg-[#D92D20] text-white border border-[#B42318] shadow-[0_1px_2px_rgba(180,35,24,0.24)] hover:bg-[#B42318] hover:border-[#912018] active:bg-[#912018]",
  fantasma:
    "bg-transparent text-gray-600 border border-transparent hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200",
};

const TAMANHO_BOTAO: Record<string, string> = {
  sm: "gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold",
  md: "gap-2 rounded-lg px-4 py-2 text-sm font-medium",
  lg: "gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold",
};

const TAMANHO_ICONE: Record<string, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-[1.125rem] w-[1.125rem]",
};

export function Botao({
  variante = "primario",
  tamanho = "md",
  icone,
  carregando = false,
  textoCarregando,
  larguraCheia = false,
  children,
  disabled,
  className = "",
  type = "button",
  ...props
}: BotaoProps) {
  const iconeClasse = TAMANHO_ICONE[tamanho] ?? TAMANHO_ICONE.md;
  return (
    <button
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={`inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        TAMANHO_BOTAO[tamanho] ?? TAMANHO_BOTAO.md
      } ${VARIANTE[variante]} ${larguraCheia ? "w-full" : ""} ${className}`}
      {...props}
    >
      {carregando ? (
        <Loader2 className={`${iconeClasse} animate-spin`} aria-hidden="true" />
      ) : (
        icone && <Icone nome={icone} className={iconeClasse} />
      )}
      {carregando && textoCarregando ? textoCarregando : children}
    </button>
  );
}

/* ---------------------------- Alternador de aba --------------------------- */

export function Abas({
  abas,
  ativa,
  onMudar,
}: {
  abas: { chave: string; texto: string; contagem?: number }[];
  ativa: string;
  onMudar: (chave: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Seções do registro"
      className="cz-rolagem flex gap-1 overflow-x-auto border-b border-[#EAECF0]"
    >
      {abas.map((aba) => {
        const selecionada = aba.chave === ativa;
        return (
          <button
            key={aba.chave}
            type="button"
            role="tab"
            aria-selected={selecionada}
            onClick={() => onMudar(aba.chave)}
            className={`relative -mb-px flex items-center gap-2 whitespace-nowrap rounded-t-lg px-3.5 pb-3 pt-2.5 text-sm transition-colors ${
              selecionada
                ? "font-semibold text-orange-700"
                : "font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-800"
            }`}
          >
            {aba.texto}
            {aba.contagem !== undefined && (
              <span
                className={`cz-num inline-flex min-w-[1.375rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[0.6875rem] font-bold leading-4 ${
                  selecionada
                    ? "bg-orange-100 text-orange-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {aba.contagem}
              </span>
            )}
            {/* Indicador em barra própria, encurtada nas pontas: acompanha o
                texto em vez de correr toda a largura do alvo de clique. */}
            <span
              aria-hidden="true"
              className={`absolute inset-x-2 bottom-0 h-[3px] rounded-t-full transition-colors ${
                selecionada ? "bg-orange-500" : "bg-transparent"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Alternador Kanban / Lista. Dois estados, sem select. */
export function Alternador({
  opcoes,
  valor,
  onMudar,
}: {
  opcoes: { valor: string; texto: string; icone: string }[];
  valor: string;
  onMudar: (valor: string) => void;
}) {
  return (
    <div
      role="group"
      className="inline-flex items-center gap-0.5 rounded-xl border border-[#D0D5DD] bg-gray-50 p-1 shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
    >
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={ativo}
            onClick={() => onMudar(o.valor)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              ativo
                ? "bg-gray-900 text-white shadow-[0_1px_2px_rgba(16,24,40,0.24)]"
                : "text-gray-600 hover:bg-white hover:text-gray-900"
            }`}
          >
            <Icone nome={o.icone} className="h-4 w-4" />
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}
