"use client";

/**
 * Modal do módulo, e o modal de confirmação com motivo obrigatório.
 *
 * O projeto não tem biblioteca de diálogo instalada, e o padrão que já existe
 * (`AdminPanel.tsx`) é um `div` fixo com backdrop. Mantive o mesmo visual e
 * acrescentei o que faltava para ser usável: Escape fecha, foco vai para dentro
 * ao abrir, `role="dialog"` com `aria-modal`, e o scroll do corpo trava.
 *
 * A entrada (fundo em fade, caixa subindo 8px) vem de `.cz-modal-fundo` e
 * `.cz-modal-caixa` em `globals.css`, que já respeitam
 * `prefers-reduced-motion`. Modal que aparece sem transição parece falha de
 * renderização.
 *
 * Acabamento: hairline clara em volta, raio de 16px e `--cz-elev-3`. O modal é o
 * único componente do módulo que mantém sombra de verdade, e por um motivo
 * literal — ele é o único que flutua sobre o conteúdo. Nos botões, cartões e
 * selos a sombra saiu, porque lá ela era decoração e é o que datava o painel.
 *
 * `ModalMotivo` existe porque quatro ações do módulo exigem motivo escrito
 * (voltar etapa, reabrir, registrar pendência, dispensar etapa) e o mínimo de
 * caracteres muda entre apuração e legalização: 5 numa, 3 na outra. Validar no
 * cliente evita um 400 que o operador leria como defeito.
 */

import {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { X } from "lucide-react";
import { Area, Botao } from "./Campos";
import { Aviso } from "./Base";
import Icone from "./Icone";

/* ---------------------------------- Modal --------------------------------- */

export function Modal({
  aberto,
  titulo,
  descricao,
  icone,
  largura = "md",
  onFechar,
  children,
  rodape,
}: {
  aberto: boolean;
  titulo: string;
  descricao?: string;
  icone?: string;
  largura?: "sm" | "md" | "lg" | "xl" | "2xl";
  onFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  const caixa = useRef<HTMLDivElement>(null);

  /**
   * `onFechar` guardado em ref, e FORA das dependências do efeito.
   *
   * Todos os chamadores passam arrow inline (`onFechar={() => setModalNova(false)}`),
   * o que gera uma função nova a cada render. Com `onFechar` nas dependências, o
   * efeito reexecutava a cada tecla digitada e o `querySelector` jogava o foco de
   * volta no PRIMEIRO campo do modal — dois defeitos relatados vinham daqui:
   *
   *   - "Prazo de entrega": `<input type="date">` só dispara `change` quando a
   *     data fica completa, então dia e mês passavam e o primeiro dígito do ano
   *     disparava o evento, o render, e o foco pulava para o select de empresa.
   *   - "Identificação provisória": é o terceiro controle do modal, então a
   *     primeira letra digitada devolvia o foco ao select de tipo de processo.
   *
   * A ref mantém o Escape sempre chamando a versão atual do callback sem que a
   * identidade dele participe da dependência. Consertar aqui resolve os seis
   * modais do módulo de uma vez, em vez de pedir `useCallback` em cada tela — o
   * que deixaria a armadilha armada para o próximo modal.
   */
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;

  useEffect(() => {
    if (!aberto) return;

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") fecharRef.current();
    };
    document.addEventListener("keydown", aoTeclar);

    // Sem isto a página de trás rola junto com o modal aberto.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Foco no primeiro campo, senão o Tab começa fora do modal. Campo antes de
    // botão de propósito: o botão de fechar vem primeiro no DOM, e abrir um
    // formulário com o foco no "X" convida ao clique errado.
    const raiz = caixa.current;
    const foco =
      raiz?.querySelector<HTMLElement>(
        "input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled])"
      ) ?? raiz?.querySelector<HTMLElement>("button");
    foco?.focus();

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [aberto]);

  if (!aberto) return null;

  /**
   * Formulário largo em vez de formulário rolável.
   *
   * `lg` e `xl` subiram um degrau e `2xl` entrou porque o cadastro de empresa
   * tem dez campos: em coluna única de 672px aquilo virava três telas de
   * rolagem. Com 1152px e grade de três colunas o formulário inteiro cabe de uma
   * vez. Rolagem em modal é o pior lugar para ela existir — a pessoa perde o
   * rodapé com o botão de salvar e não sabe se o formulário acabou.
   *
   * O teto de 90vh continua: modal mais alto que a janela não tem para onde
   * crescer, e aí a rolagem do corpo é a saída correta, não a preferida.
   */
  const larguras: Record<string, string> = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-3xl",
    xl: "max-w-5xl",
    "2xl": "max-w-6xl",
  };

  return (
    <div
      className="cz-modal-fundo fixed inset-0 z-50 flex items-center justify-center bg-[#14161B]/50 p-4 backdrop-blur-sm"
      onMouseDown={(evento) => {
        // Fecha só no clique no fundo. `onMouseDown` no lugar de `onClick`
        // evita fechar quando a pessoa começa a selecionar texto dentro e
        // solta o mouse fora.
        if (evento.target === evento.currentTarget) onFechar();
      }}
    >
      {/* Coluna flex em vez de altura calculada no corpo: o corpo fica com toda
          a sobra de 90vh, então cabeçalho de duas linhas ou rodapé mais alto não
          roubam área útil do formulário grande (`largura="lg"`/`"xl"`). */}
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`cz-tarefas cz-modal-caixa flex w-full ${larguras[largura]} max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-[#EDEFF3] bg-white`}
        style={{ boxShadow: "var(--cz-elev-3)" }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#EDEFF3] px-6 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icone && (
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#FFD9BF] bg-[#FFF2E9] text-[#D9500A]">
                <Icone
                  nome={icone}
                  className="h-[1.125rem] w-[1.125rem]"
                />
              </span>
            )}
            <div className="min-w-0">
              {/* `cz-titulo` já traz peso 700 e o tracking apertado do painel. */}
              <h3 className="cz-titulo text-lg leading-6">{titulo}</h3>
              {descricao && (
                <p className="mt-1 text-sm leading-5 text-[#6B7280]">
                  {descricao}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="-mr-1.5 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[#9AA1AC] transition-colors hover:bg-[#F4F5F7] hover:text-[#14161B]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="cz-rolagem min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {rodape && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-[#EDEFF3] bg-[#F8F9FB] px-6 py-4">
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Modal motivo ----------------------------- */

export function ModalMotivo({
  aberto,
  titulo,
  descricao,
  icone,
  rotulo = "Motivo",
  ajuda,
  minimo = 5,
  obrigatorio = true,
  textoConfirmar = "Confirmar",
  varianteConfirmar = "primario",
  erro,
  enviando = false,
  onFechar,
  onConfirmar,
  extra,
}: {
  aberto: boolean;
  titulo: string;
  descricao?: string;
  icone?: string;
  rotulo?: string;
  ajuda?: string;
  /** Mínimo de caracteres. Apuração exige 5, legalização exige 3. */
  minimo?: number;
  obrigatorio?: boolean;
  textoConfirmar?: string;
  varianteConfirmar?: "primario" | "perigo" | "escuro";
  erro?: string | null;
  enviando?: boolean;
  onFechar: () => void;
  onConfirmar: (motivo: string) => void;
  /** Campos adicionais (ex.: quem é o responsável pela pendência). */
  extra?: ReactNode;
}) {
  const [texto, setTexto] = useState("");
  const [tocado, setTocado] = useState(false);

  useEffect(() => {
    if (aberto) {
      setTexto("");
      setTocado(false);
    }
  }, [aberto]);

  const limpo = texto.trim();
  const curto = obrigatorio && limpo.length < minimo;
  const erroLocal =
    tocado && curto
      ? limpo.length === 0
        ? `Informe o ${rotulo.toLowerCase()}.`
        : `Escreva ao menos ${minimo} caracteres.`
      : null;

  // Quantos faltam é mais útil que "12/5": diz o que fazer, não o que aconteceu.
  const faltam = Math.max(0, minimo - limpo.length);
  const mostrarContador = (obrigatorio && faltam > 0) || limpo.length > 0;

  const confirmar = useCallback(() => {
    setTocado(true);
    if (curto) return;
    onConfirmar(limpo);
  }, [curto, limpo, onConfirmar]);

  return (
    <Modal
      aberto={aberto}
      titulo={titulo}
      descricao={descricao}
      icone={icone}
      onFechar={onFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao
            variante={varianteConfirmar}
            onClick={confirmar}
            carregando={enviando}
            textoCarregando="Enviando"
            disabled={curto && tocado}
          >
            {textoConfirmar}
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        {erro && <Aviso mensagem={erro} />}
        {extra}
        <div>
          <Area
            rotulo={rotulo}
            required={obrigatorio}
            value={texto}
            erro={erroLocal}
            ajuda={
              ajuda ??
              (obrigatorio
                ? `Fica registrado no histórico com seu nome. Mínimo de ${minimo} caracteres.`
                : "Fica registrado no histórico com seu nome.")
            }
            onChange={(e) => setTexto(e.target.value)}
            onBlur={() => setTocado(true)}
            placeholder="Descreva o que aconteceu"
          />
          {mostrarContador && (
            <p
              aria-live="polite"
              className="mt-1.5 flex justify-end text-xs"
            >
              {obrigatorio && faltam > 0 ? (
                <span className="inline-flex items-center gap-1 font-semibold text-[#B54708]">
                  <Icone
                    nome="Info"
                    className="mr-0.5 h-3.5 w-3.5 shrink-0"
                  />
                  <span>Faltam</span>
                  <span className="cz-num">{faltam}</span>
                  <span>{faltam === 1 ? "caractere" : "caracteres"}</span>
                </span>
              ) : (
                // Contador satisfeito em cinza, não em verde: verde no módulo é
                // cor de domínio (status concluído, prazo no prazo) e gastá-la
                // num contador de caracteres esvazia o sinal onde ele decide
                // algo. O ícone e o texto já dizem que o mínimo foi atingido.
                <span className="inline-flex items-center gap-1 text-[#6B7280]">
                  <Icone
                    nome="CheckCircle2"
                    className="mr-0.5 h-3.5 w-3.5 shrink-0 text-[#9AA1AC]"
                  />
                  <span className="cz-num">{limpo.length}</span>
                  <span>
                    {limpo.length === 1
                      ? "caractere escrito"
                      : "caracteres escritos"}
                  </span>
                </span>
              )}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
