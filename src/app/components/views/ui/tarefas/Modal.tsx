"use client";

/**
 * Modal do módulo, e o modal de confirmação com motivo obrigatório.
 *
 * O projeto não tem biblioteca de diálogo instalada, e o padrão que já existe
 * (`AdminPanel.tsx`) é um `div` fixo com backdrop. Mantive o mesmo visual e
 * acrescentei o que faltava para ser usável: Escape fecha, foco vai para dentro
 * ao abrir, `role="dialog"` com `aria-modal`, e o scroll do corpo trava.
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
  largura?: "sm" | "md" | "lg" | "xl";
  onFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", aoTeclar);

    // Sem isto a página de trás rola junto com o modal aberto.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Foco no primeiro campo, senão o Tab começa fora do modal.
    const foco = caixa.current?.querySelector<HTMLElement>(
      "input:not([type=hidden]), textarea, select, button"
    );
    foco?.focus();

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;

  const larguras: Record<string, string> = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm"
      onMouseDown={(evento) => {
        // Fecha só no clique no fundo. `onMouseDown` no lugar de `onClick`
        // evita fechar quando a pessoa começa a selecionar texto dentro e
        // solta o mouse fora.
        if (evento.target === evento.currentTarget) onFechar();
      }}
    >
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`cz-tarefas w-full ${larguras[largura]} max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 bg-gray-50 px-6 py-4">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              {icone && (
                <Icone nome={icone} className="h-5 w-5 text-orange-500" />
              )}
              <span className="truncate">{titulo}</span>
            </h3>
            {descricao && (
              <p className="mt-1 text-sm text-gray-500">{descricao}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="shrink-0 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-9rem)] overflow-y-auto px-6 py-5">
          {children}
        </div>

        {rodape && (
          <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
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
      </div>
    </Modal>
  );
}
