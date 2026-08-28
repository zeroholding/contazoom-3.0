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
 *
 * O acabamento segue a referência aprovada: o que separa é BORDA de 1px em
 * cinza quase branco, não sombra. Nenhum controle deste arquivo tem sombra —
 * botão, trilha do alternador e barra de abas trabalham com borda e cor sólida.
 * A única sombra do módulo ficou no modal, que é o único elemento que de fato
 * flutua sobre o resto.
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
        <span className="text-[0.8125rem] font-semibold leading-5 text-[#14161B]">
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
        <p
          id={`${id}-ajuda`}
          className="mt-1.5 text-xs leading-5 text-[#6B7280]"
        >
          {ajuda}
        </p>
      ) : null}
    </div>
  );
}

/* ----------------------------------- Raio --------------------------------- */

/**
 * Raio do campo, 10px como na referência.
 *
 * A folha escopada crava `border-radius: 0.5rem` em `.cz-tarefas input` — um
 * seletor com elemento, que vence utilitária de classe única. O sufixo `!`
 * resolve sem tocar em `globals.css`. É sufixo porque no Tailwind v4 o
 * modificador important mudou de lugar: `!rounded-[10px]` não gera classe
 * nenhuma.
 *
 * Altura (40px), borda fina e o foco laranja continuam vindo da folha: aqui só
 * o canto muda.
 */
const RAIO_CAMPO = "rounded-[10px]!";

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
        className={`${RAIO_CAMPO} ${erro ? "campo-invalido" : ""} ${className}`}
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
        className={`${RAIO_CAMPO} ${erro ? "campo-invalido" : ""} ${className}`}
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
          className={`appearance-none ${RAIO_CAMPO} ${
            erro ? "campo-invalido" : ""
          } ${className}`}
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
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9AA1AC]"
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

/**
 * Dois tipos de botão dão conta da referência: laranja chapado e pílula branca.
 *
 * O que saiu foi a pilha de acabamento da versão anterior — borda de tom mais
 * escuro em volta do preenchido e sombra tingida por baixo. Duas camadas para
 * dizer a mesma coisa que a cor já dizia, e é o par que datava o painel: sombra
 * colorida em botão é vocabulário de 2015. O desenho novo separa por borda e
 * cor sólida, então o botão fica chapado.
 *
 * A borda transparente fica no lugar da borda escura de propósito: o secundário
 * tem 1px de borda de verdade, e sem esse 1px reservado no preenchido os dois
 * ficariam com 2px de diferença de altura na mesma fileira.
 *
 * Hover mexe só no fundo. Borda que muda de cor no hover faz o botão "pular" de
 * tamanho aparente, e com sombra fora sobrou contraste de fundo para dar
 * resposta ao mouse.
 */
const VARIANTE: Record<string, string> = {
  primario:
    "bg-[#F26212] text-white border border-transparent hover:bg-[#D9500A] active:bg-[#C34706]",
  escuro:
    "bg-[#14161B] text-white border border-transparent hover:bg-[#272B33] active:bg-[#14161B]",
  // Pílula da referência: branca, hairline forte (#DCE0E7) e nada mais. A
  // hairline forte some menos que a fina do cartão, que é o que o olho precisa
  // para reconhecer o alvo como clicável sem sombra.
  secundario:
    "bg-white text-[#374151] border border-[#DCE0E7] hover:bg-[#F8F9FB] hover:text-[#14161B] active:bg-[#F1F3F6]",
  perigo:
    "bg-[#D92D20] text-white border border-transparent hover:bg-[#B42318] active:bg-[#912018]",
  fantasma:
    "bg-transparent text-[#6B7280] border border-transparent hover:bg-[#F4F5F7] hover:text-[#14161B] active:bg-[#EDEFF3]",
};

/**
 * Raio de 10px nos três tamanhos: na referência a curva não acompanha a altura
 * do controle, é constante. `sm` e `lg` com raios diferentes fariam a mesma
 * tela ter dois vocabulários de canto.
 *
 * Peso 600 nos três, e a escala de texto é 12 / 13 / 14px. O 13px do `md` é o
 * tamanho da fileira de pílulas da referência — era 14px em peso 500 aqui, o
 * que deixava o secundário com a mesma presença do primário.
 */
const TAMANHO_BOTAO: Record<string, string> = {
  sm: "gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs leading-4 font-semibold",
  md: "gap-2 rounded-[10px] px-3.5 py-2 text-[0.8125rem] leading-5 font-semibold",
  lg: "gap-2 rounded-[10px] px-5 py-2.5 text-sm leading-5 font-semibold",
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
      className="cz-rolagem flex gap-1 overflow-x-auto border-b border-[#EDEFF3]"
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
            className={`relative -mb-px flex items-center gap-2 whitespace-nowrap rounded-t-[10px] px-3.5 pb-3 pt-2.5 text-sm transition-colors ${
              selecionada
                ? "font-semibold text-[#C2410C]"
                : "font-medium text-[#6B7280] hover:bg-[#F8F9FB] hover:text-[#14161B]"
            }`}
          >
            {aba.texto}
            {aba.contagem !== undefined && (
              // Contagem em raio médio, igual às pastilhas: cápsula aqui abriria
              // uma segunda linguagem de canto na mesma barra.
              <span
                className={`cz-num inline-flex min-w-[1.375rem] items-center justify-center rounded-md px-1.5 py-0.5 text-[0.6875rem] font-bold leading-4 ${
                  selecionada
                    ? "bg-[#FFF2E9] text-[#C2410C]"
                    : "bg-[#F1F3F6] text-[#4B5563]"
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
                selecionada ? "bg-[#F26212]" : "bg-transparent"
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
      // Trilha em cinza de fundo com hairline em volta, sem sombra. Raio 12 por
      // fora e 8 por dentro: com o p-1 de 4px as duas curvas ficam paralelas.
      className="inline-flex items-center gap-0.5 rounded-xl border border-[#DCE0E7] bg-[#F8F9FB] p-1"
    >
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={ativo}
            onClick={() => onMudar(o.valor)}
            // O ativo continua escuro em vez de virar pastilha laranja clara:
            // laranja forte sobre laranja suave dá 3,7:1 de contraste, e texto
            // pequeno precisa de 4,5:1. Escuro sobre claro resolve sem gastar a
            // cor de ação, que no módulo significa "aqui você clica para agir".
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8125rem] leading-5 font-semibold transition-colors ${
              ativo
                ? "bg-[#14161B] text-white"
                : "text-[#4B5563] hover:bg-white hover:text-[#14161B]"
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
