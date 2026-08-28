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
 */

import { ReactNode, SelectHTMLAttributes, useId } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { Loader2 } from "lucide-react";
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
      <label htmlFor={id}>
        {rotulo}
        {obrigatorio && (
          <span className="ml-1 text-red-500" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {erro ? (
        <p id={`${id}-erro`} className="mt-1 text-xs font-medium text-[#B42318]">
          {erro}
        </p>
      ) : ajuda ? (
        <p id={`${id}-ajuda`} className="mt-1 text-xs text-gray-500">
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
      <select
        id={id}
        required={required}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined}
        className={`${erro ? "campo-invalido" : ""} ${className}`}
        {...props}
      >
        {vazio !== undefined && <option value="">{vazio}</option>}
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </Campo>
  );
}

/* ---------------------------------- Botão --------------------------------- */

type BotaoProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "primario" | "secundario" | "perigo" | "fantasma" | "escuro";
  icone?: string;
  carregando?: boolean;
  /** Texto exibido enquanto carrega. Sem isso, o botão parece travado. */
  textoCarregando?: string;
};

const VARIANTE: Record<string, string> = {
  primario:
    "bg-orange-500 text-white hover:bg-orange-600 border border-transparent shadow-sm",
  escuro:
    "bg-gray-900 text-white hover:bg-gray-800 border border-transparent shadow-sm",
  secundario:
    "bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 shadow-sm",
  perigo:
    "bg-[#D92D20] text-white hover:bg-[#B42318] border border-transparent shadow-sm",
  fantasma:
    "bg-transparent text-gray-600 hover:bg-gray-100 border border-transparent",
};

export function Botao({
  variante = "primario",
  icone,
  carregando = false,
  textoCarregando,
  children,
  disabled,
  className = "",
  type = "button",
  ...props
}: BotaoProps) {
  return (
    <button
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTE[variante]} ${className}`}
      {...props}
    >
      {carregando ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        icone && <Icone nome={icone} className="h-4 w-4" />
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
      className="flex gap-1 overflow-x-auto border-b border-gray-200"
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
            className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              selecionada
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            {aba.texto}
            {aba.contagem !== undefined && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                  selecionada
                    ? "bg-orange-100 text-orange-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {aba.contagem}
              </span>
            )}
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
    <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5 shadow-sm">
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={ativo}
            onClick={() => onMudar(o.valor)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              ativo
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100"
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
