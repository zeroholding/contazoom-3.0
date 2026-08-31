"use client";

/**
 * Kit de campos do formulário público de abertura de CNPJ.
 *
 * POR QUE NÃO REAPROVEITAR `ui/tarefas/Campos.tsx`, que já existe: aquele kit é
 * de painel denso — seis filtros numa fileira, tabela, modal de conclusão de
 * etapa. Ele crava o tamanho do rótulo num `<span>` interno
 * (`text-[0.8125rem]`, 13px), e classe inline no span vence qualquer regra que
 * eu escrevesse em `.cz-form label`. Tentei corrigir por CSS e perdi: o rótulo
 * continuava em 13px, fino, e o campo saía com cara de filtro de relatório em
 * vez de formulário para o cliente preencher no celular.
 *
 * Aqui a régua é outra: quem preenche é o CLIENTE, uma vez na vida, sem treino,
 * quase sempre no telefone. Então rótulo de 15px em peso 600, campo de 52px,
 * ícone à esquerda dizendo o que é aquilo, e ajuda de 13px que continua legível.
 *
 * O estilo do campo é declarado AQUI, em `style` e classe própria, e não herdado
 * da folha global. A folha global tem `input { @apply h-12 border-2 ... }` com
 * `!important` em `border-color` e `box-shadow`, e `.cz-tarefas` sobrescreve por
 * cima com outro `!important`. Entrar nessa briga de terceiro é como o campo
 * ficou estranho. O container da tela NÃO usa `.cz-tarefas` mais — só `.cz-form`,
 * e o que vale para campo está neste arquivo.
 */

import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import {
  PLACEHOLDER_DOCUMENTO,
  aplicarMascara,
  digitosFaltando,
  erroDocumento,
  somenteDigitos,
  type TipoDocumento,
} from "@/lib/documento";

/* -------------------------------------------------------------------------- */
/*                            Aparência do campo                              */
/* -------------------------------------------------------------------------- */

/**
 * Uma função só monta a casca de todo campo: input, textarea e select.
 *
 * Sem isso, os três divergem no primeiro ajuste — e campo com 1px de diferença
 * de borda na mesma fileira é o que faz um formulário parecer remendado.
 */
/**
 * QUASE NADA DE APARÊNCIA DO CAMPO VEM DE UTILITÁRIA DO TAILWIND, e o motivo é o
 * bug que apareceu no primeiro teste em produção.
 *
 * `globals.css` tem um bloco `input[type=text], ..., textarea, select { @apply
 * h-12 px-4 py-3 text-sm ... }` escrito FORA de `@layer`. O Tailwind v4 gera as
 * utilitárias DENTRO de `@layer utilities`, e na cascata do CSS declaração sem
 * camada vence declaração em camada — independente de especificidade e de ordem.
 *
 * Resultado: `pl-[2.875rem]` (o espaço do ícone) perdia para o `padding-inline:
 * 1rem` do bloco global, e o ícone ficava POR CIMA do texto. `text-[1rem]`
 * perdia para `text-sm`, e o campo ficava em 14px, altura em que o Safari do iOS
 * amplia a página ao focar.
 *
 * Nenhum `!important` em classe utilitária resolveria: o problema é a camada, não
 * a especificidade. Então padding, raio, tamanho de fonte e a cor do texto são
 * declarados em `.cz-form .cz-campo` no `globals.css`, e aqui só sobra o que não
 * colide: largura, fundo, placeholder e a borda de estado.
 */
function casca({
  erro,
  comIcone,
  comSufixo,
}: {
  erro?: boolean;
  comIcone?: boolean;
  comSufixo?: boolean;
}): string {
  return [
    "cz-campo w-full appearance-none bg-white",
    "placeholder:text-[#A6ADBA]",
    // 52px de altura no repouso. O painel usa 40px porque quem usa está com
    // mouse e conhece a tela; aqui o alvo é o dedo.
    "min-h-[3.25rem] border",
    comIcone && "cz-campo-icone",
    comSufixo && "cz-campo-sufixo",
    erro && "bg-[#FFFBFA]",
    "focus:outline-none",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Anel de foco por `box-shadow`, para não empurrar o layout como `outline` faz. */
const ANEL_FOCO = "cz-campo-foco";

/* -------------------------------------------------------------------------- */
/*                                  Rótulo                                    */
/* -------------------------------------------------------------------------- */

function Rotulo({
  htmlFor,
  children,
  obrigatorio,
  opcional,
}: {
  htmlFor?: string;
  children: ReactNode;
  obrigatorio?: boolean;
  /** Escrito por extenso. "(opcional)" informa mais que a ausência de asterisco. */
  opcional?: boolean;
}) {
  const conteudo = (
    <>
      <span className="text-[0.9375rem] font-semibold leading-5 text-[#101828]">
        {children}
      </span>
      {obrigatorio && (
        <span
          className="text-[0.9375rem] font-semibold leading-5 text-[#F04438]"
          aria-hidden="true"
        >
          *
        </span>
      )}
      {opcional && (
        <span className="text-[0.8125rem] font-medium leading-5 text-[#98A2B3]">
          opcional
        </span>
      )}
    </>
  );

  // `label` só quando há campo para amarrar. Grupo de botões usa `p` + aria.
  return htmlFor ? (
    <label htmlFor={htmlFor} className="cz-rotulo flex items-baseline gap-1.5">
      {conteudo}
    </label>
  ) : (
    <p className="cz-rotulo flex items-baseline gap-1.5">{conteudo}</p>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Linha de apoio                                 */
/* -------------------------------------------------------------------------- */

/**
 * Ajuda OU erro, nunca as duas.
 *
 * Mostrar as duas empilhadas faz a pessoa ler a ajuda primeiro (que está acima) e
 * só depois descobrir que errou. O erro substitui a ajuda porque, no momento do
 * erro, ele É a instrução.
 */
function Apoio({
  id,
  erro,
  ajuda,
}: {
  id: string;
  erro?: string | null;
  ajuda?: ReactNode;
}) {
  if (erro) {
    return (
      <p
        id={`${id}-erro`}
        className="mt-2 flex items-start gap-1.5 text-[0.8125rem] font-semibold leading-5 text-[#B42318]"
      >
        <Icone nome="AlertTriangle" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{erro}</span>
      </p>
    );
  }
  if (ajuda) {
    return (
      <p
        id={`${id}-ajuda`}
        className="mt-2 text-[0.8125rem] leading-5 text-[#667085]"
      >
        {ajuda}
      </p>
    );
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*                                Campo texto                                 */
/* -------------------------------------------------------------------------- */

type TextoProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  rotulo: string;
  /**
   * Ícone lucide à esquerda.
   *
   * Não é enfeite: foi a reclamação literal do teste — "nem dá para saber que é
   * para preencher e-mail". Envelope no campo de e-mail, telefone no de telefone
   * e documento no de CPF resolvem antes de a pessoa ler o rótulo.
   */
  icone?: string;
  erro?: string | null;
  ajuda?: ReactNode;
  opcional?: boolean;
  /** Conteúdo à direita dentro do campo: spinner do CEP, contador, selo. */
  sufixo?: ReactNode;
  /**
   * Texto fixo à esquerda dentro do campo, no lugar do ícone. Usado pelo "R$" do
   * capital: assim a pessoa não digita o símbolo e fica óbvio que é dinheiro.
   */
  prefixoTexto?: string;
  wrapperClassName?: string;
};

export function CampoTexto({
  rotulo,
  icone,
  erro,
  ajuda,
  opcional,
  sufixo,
  prefixoTexto,
  required,
  wrapperClassName = "",
  className = "",
  ...props
}: TextoProps) {
  const id = useId();
  return (
    <div className={wrapperClassName}>
      <Rotulo htmlFor={id} obrigatorio={required} opcional={opcional}>
        {rotulo}
      </Rotulo>
      <div className="relative mt-2">
        {icone && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${
              erro ? "text-[#F04438]" : "text-[#98A2B3]"
            }`}
          >
            <Icone nome={icone} className="h-[1.125rem] w-[1.125rem]" />
          </span>
        )}
        {prefixoTexto && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[0.9375rem] font-semibold text-[#667085]"
          >
            {prefixoTexto}
          </span>
        )}
        <input
          id={id}
          required={required}
          aria-invalid={erro ? true : undefined}
          aria-describedby={
            erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined
          }
          className={`${casca({
            erro: !!erro,
            // O prefixo "R$" ocupa o mesmo lugar do ícone, então reserva o mesmo
            // recuo. Sem isso o valor digitado começa em cima do símbolo.
            comIcone: !!icone || !!prefixoTexto,
            comSufixo: !!sufixo,
          })} ${ANEL_FOCO} ${className}`}
          {...props}
        />
        {sufixo && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2">
            {sufixo}
          </span>
        )}
      </div>
      <Apoio id={id} erro={erro} ajuda={ajuda} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Campo área                                  */
/* -------------------------------------------------------------------------- */

type AreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  rotulo: string;
  erro?: string | null;
  ajuda?: ReactNode;
  /** Linha abaixo do campo, à direita. Usada pelo contador de caracteres. */
  contador?: ReactNode;
  wrapperClassName?: string;
};

export function CampoArea({
  rotulo,
  erro,
  ajuda,
  contador,
  required,
  wrapperClassName = "",
  className = "",
  ...props
}: AreaProps) {
  const id = useId();
  return (
    <div className={wrapperClassName}>
      <Rotulo htmlFor={id} obrigatorio={required}>
        {rotulo}
      </Rotulo>
      <textarea
        id={id}
        required={required}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined}
        className={`mt-2 ${casca({ erro: !!erro })} ${ANEL_FOCO} ${className}`}
        {...props}
      />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Apoio id={id} erro={erro} ajuda={ajuda} />
        </div>
        {contador && <div className="mt-2 shrink-0">{contador}</div>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Campo select                                 */
/* -------------------------------------------------------------------------- */

type SelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "id" | "children"
> & {
  rotulo: string;
  opcoes: { valor: string; texto: string }[];
  vazio?: string;
  icone?: string;
  erro?: string | null;
  ajuda?: ReactNode;
  wrapperClassName?: string;
};

export function CampoSelect({
  rotulo,
  opcoes,
  vazio,
  icone,
  erro,
  ajuda,
  required,
  wrapperClassName = "",
  className = "",
  value,
  ...props
}: SelectProps) {
  const id = useId();
  // Sem valor escolhido, o texto é de placeholder — senão "Selecione" fica com o
  // mesmo peso visual de uma resposta de verdade.
  const vazioSelecionado = value === "" || value === undefined;

  return (
    <div className={wrapperClassName}>
      <Rotulo htmlFor={id} obrigatorio={required}>
        {rotulo}
      </Rotulo>
      <div className="relative mt-2">
        {icone && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${
              erro ? "text-[#F04438]" : "text-[#98A2B3]"
            }`}
          >
            <Icone nome={icone} className="h-[1.125rem] w-[1.125rem]" />
          </span>
        )}
        <select
          id={id}
          required={required}
          value={value}
          aria-invalid={erro ? true : undefined}
          aria-describedby={
            erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined
          }
          className={`${casca({ erro: !!erro, comIcone: !!icone, comSufixo: true })} ${ANEL_FOCO} cursor-pointer ${
            vazioSelecionado ? "text-[#A6ADBA]" : ""
          } ${className}`}
          {...props}
        >
          {vazio !== undefined && <option value="">{vazio}</option>}
          {opcoes.map((o) => (
            <option key={o.valor} value={o.valor} className="text-[#14161B]">
              {o.texto}
            </option>
          ))}
        </select>
        {/* A seta nativa do select no Windows é um triângulo cinza de outra época. */}
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-1/2 h-[1.125rem] w-[1.125rem] -translate-y-1/2 text-[#667085]"
        />
      </div>
      <Apoio id={id} erro={erro} ajuda={ajuda} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Campo de documento                                */
/* -------------------------------------------------------------------------- */

/**
 * CPF, CNPJ, CEP e telefone: máscara na digitação e validação de dígito.
 *
 * A lógica é toda de `src/lib/documento.ts`, que já existe e já é testada (86
 * checagens em `npm run test:tarefas`). Reimplementar aqui criaria uma segunda
 * cópia do dígito verificador, e cópia divergente é o pior defeito possível numa
 * validação: a tela libera e o servidor recusa.
 *
 * QUANDO O ERRO APARECE, que é a decisão que muda a experiência:
 *
 *   - enquanto falta dígito, nada. Acusar "CPF inválido" no terceiro dígito é
 *     acusar a pessoa de errar enquanto ela digita certo;
 *   - no instante em que o número FECHA e o verificador não confere, aparece —
 *     é o mais cedo possível sem ser antes da hora, e é onde a correção custa um
 *     caractere;
 *   - ao sair do campo incompleto, aparece dizendo quantos dígitos faltam.
 *
 * `inputMode="numeric"` e não `type="number"`: número em `input[type=number]`
 * aceita `e`, aceita sinal e muda com a rolagem do mouse, e nenhum documento é
 * um número — é sequência de dígitos com tamanho fixo.
 */
export function CampoDocumento({
  tipo,
  rotulo,
  icone,
  value,
  onChange,
  required,
  erro,
  ajuda,
  sufixo,
  wrapperClassName,
  autoComplete = "off",
  disabled,
}: {
  tipo: TipoDocumento;
  rotulo: string;
  icone?: string;
  /** Valor MASCARADO. O pai guarda com máscara e envia `somenteDigitos`. */
  value: string;
  onChange: (mascarado: string) => void;
  required?: boolean;
  /** Erro de fora (repetição, servidor). Tem prioridade sobre o local. */
  erro?: string | null;
  ajuda?: ReactNode;
  sufixo?: ReactNode;
  wrapperClassName?: string;
  autoComplete?: string;
  disabled?: boolean;
}) {
  const [tocado, setTocado] = useState(false);

  const digitos = somenteDigitos(value);
  const completo = digitos.length > 0 && digitosFaltando(tipo, digitos) === 0;

  const erroLocal =
    completo || tocado
      ? erroDocumento(tipo, digitos, { obrigatorio: required, rotulo })
      : null;

  return (
    <CampoTexto
      rotulo={rotulo}
      icone={icone}
      required={required}
      disabled={disabled}
      inputMode="numeric"
      autoComplete={autoComplete}
      placeholder={PLACEHOLDER_DOCUMENTO[tipo]}
      wrapperClassName={wrapperClassName}
      // Numeral de largura fixa: sem isso o campo "anda" enquanto a pessoa
      // digita, porque o "1" é mais estreito que o "8".
      className="cz-num tracking-[0.01em]"
      value={value}
      erro={erro ?? erroLocal}
      ajuda={ajuda}
      sufixo={sufixo}
      onChange={(e) => {
        onChange(aplicarMascara(tipo, e.target.value));
        // Digitar depois de errar limpa a marca de "já saiu do campo": a pessoa
        // está corrigindo, e manter o vermelho enquanto ela conserta é ruído.
        if (tocado) setTocado(false);
      }}
      onBlur={() => setTocado(true)}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Botão                                     */
/* -------------------------------------------------------------------------- */

/**
 * Botão da tela. Existe pelo mesmo motivo do campo: o do painel é de 32/40px de
 * altura, dimensionado para linha de tabela.
 */
export function BotaoForm({
  variante = "primario",
  icone,
  iconeDireita,
  larguraCheia,
  children,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const cores: Record<string, string> = {
    primario:
      "bg-[#F26212] text-white border-transparent hover:bg-[#D9500A] active:bg-[#C34706] shadow-[0_1px_2px_rgba(16,24,40,0.06)]",
    secundario:
      "bg-white text-[#344054] border-[#D8DDE5] hover:bg-[#F8F9FB] hover:border-[#B4BCC9] hover:text-[#101828]",
    perigo:
      "bg-[#D92D20] text-white border-transparent hover:bg-[#B42318] active:bg-[#912018]",
    fantasma:
      "bg-transparent text-[#667085] border-transparent hover:bg-[#F2F4F7] hover:text-[#101828]",
  };

  return (
    <button
      type={type}
      className={`cz-campo-foco inline-flex min-h-[3rem] shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-[12px] border px-5 text-[0.9375rem] font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${
        cores[variante]
      } ${larguraCheia ? "w-full" : ""} ${className}`}
      {...props}
    >
      {icone && <Icone nome={icone} className="h-[1.125rem] w-[1.125rem] shrink-0" />}
      {children}
      {iconeDireita && (
        <Icone nome={iconeDireita} className="h-[1.125rem] w-[1.125rem] shrink-0" />
      )}
    </button>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "primario" | "secundario" | "perigo" | "fantasma";
  icone?: string;
  iconeDireita?: string;
  larguraCheia?: boolean;
};

/* -------------------------------------------------------------------------- */
/*                          Cartão e cabeçalho de bloco                       */
/* -------------------------------------------------------------------------- */

/** Cartão da tela: borda fina, raio 16, sombra quase inexistente. */
export function Cartao({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[16px] border border-[#E7EAEF] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}
    >
      {children}
    </section>
  );
}

/** Título de seção dentro de um cartão, com ícone e explicação. */
export function TituloSecao({
  icone,
  titulo,
  descricao,
  nivel = 3,
}: {
  icone: string;
  titulo: string;
  descricao?: ReactNode;
  /** 2 no cabeçalho do passo, 3 dentro de cartão. Não pular nível importa. */
  nivel?: 2 | 3 | 4;
}) {
  const H = `h${nivel}` as "h2" | "h3" | "h4";
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="mt-px flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#FFDCC4] bg-[#FFF4EC] text-[#D9500A]"
      >
        <Icone nome={icone} className="h-[1.125rem] w-[1.125rem]" />
      </span>
      <div className="min-w-0">
        <H className="text-[1.0625rem] font-bold leading-6 tracking-[-0.017em] text-[#101828]">
          {titulo}
        </H>
        {descricao && (
          <p className="mt-1 text-[0.875rem] leading-[1.55] text-[#667085]">
            {descricao}
          </p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Nota                                      */
/* -------------------------------------------------------------------------- */

const TOM_NOTA: Record<string, { casca: string; icone: string }> = {
  info: {
    casca: "border-[#E7EAEF] bg-[#F8F9FB] text-[#475467]",
    icone: "Info",
  },
  atencao: {
    casca: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]",
    icone: "AlertTriangle",
  },
  erro: {
    casca: "border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]",
    icone: "AlertTriangle",
  },
  marca: {
    casca: "border-[#FFDCC4] bg-[#FFF4EC] text-[#B54708]",
    icone: "Info",
  },
};

/** Faixa de apoio. Ícone diferente por tom, não só cor diferente. */
export function Nota({
  tom = "info",
  children,
  className = "",
}: {
  tom?: "info" | "atencao" | "erro" | "marca";
  children: ReactNode;
  className?: string;
}) {
  const t = TOM_NOTA[tom] ?? TOM_NOTA.info;
  return (
    <p
      role={tom === "erro" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-[12px] border px-4 py-3 text-[0.875rem] font-medium leading-[1.55] ${t.casca} ${className}`}
    >
      <Icone nome={t.icone} className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
