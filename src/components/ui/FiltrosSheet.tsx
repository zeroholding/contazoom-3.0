"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { useCelular } from "@/hooks/useMediaQuery";
import { travarRolagem } from "@/lib/trava-rolagem";

type FiltrosSheetProps = {
  /** Título da folha e rótulo do botão que a abre. */
  titulo?: string;
  /** Quantos filtros estão fora do padrão. Vira o selo no botão e liga o "Limpar". */
  ativos?: number;
  /** Volta todos os filtros ao padrão. Sem isto, o botão "Limpar" não aparece. */
  onLimpar?: () => void;
  /** Texto do botão principal da folha (ele só a fecha: os filtros já valem na hora). */
  rotuloConcluir?: string;
  /** Classes extras para o botão que abre a folha (ex.: `w-full` ou `flex-1`). */
  classeBotao?: string;
  children: ReactNode;
};

/**
 * Barra de filtros que vira FOLHA INFERIOR no celular.
 *
 * - Desktop (768px+): devolve os `children` exatamente onde estão, sem nenhum
 *   elemento extra. A barra de filtros da tela continua sendo a mesma de antes.
 * - Celular: no lugar da barra entra UM botão "Filtros (n)". Os `children` passam
 *   para dentro de uma folha que sobe de baixo, com cabeçalho, rolagem própria e
 *   um rodapé com "Limpar" e o botão de concluir.
 *
 * Por que folha, e não a linha de chips quebrando em várias linhas: sete filtros
 * ocupavam ~200px do topo do painel em 390px de largura, antes de aparecer um
 * único número. A folha devolve esse espaço e deixa cada controle com alvo de
 * toque de verdade.
 *
 * ⚠️ A folha é renderizada num PORTAL em `document.body`, e não no lugar. Uma
 * folha `position: fixed` que mora dentro da tela fica presa às regras dos
 * ancestrais: um `transform` de animação (o GSAP deixa um de propósito) vira o
 * "chão" do `fixed`, e um `z-index` de um ancestral (`main` com `z-20`) impede a
 * folha de passar por cima do cabeçalho e da barra de abas. No `body` nada disso
 * importa.
 *
 * ⚠️ O painel da folha NÃO pode ter `transform`, `filter` nem `will-change` em
 * repouso. Os dropdowns dos filtros (`.smart-dropdown`) são `position: fixed`
 * calculados em coordenadas da janela; um ancestral transformado os deslocaria.
 * Por isso o estado aberto é "sem translate", e não "translate zero".
 *
 * Os `children` são montados UMA vez e mantidos mesmo com a folha fechada, então
 * o estado interno dos filtros sobrevive a abrir e fechar. Trocar entre celular e
 * desktop (girar um tablet) remonta os filhos; quem precisa manter o estado deve
 * guardá-lo no pai, como as telas já fazem.
 */
export default function FiltrosSheet({
  titulo = "Filtros",
  ativos = 0,
  onLimpar,
  rotuloConcluir = "Ver resultados",
  classeBotao = "",
  children,
}: FiltrosSheetProps) {
  const celular = useCelular();
  const [aberta, setAberta] = useState(false);
  const idTitulo = useId();
  const botaoRef = useRef<HTMLButtonElement | null>(null);
  const fecharRef = useRef<HTMLButtonElement | null>(null);
  const folhaRef = useRef<HTMLDivElement | null>(null);

  // A folha só existe no celular. Se a tela crescer com ela aberta, fecha: senão o
  // estado ficaria "aberta" sem ninguém ver, e a trava de rolagem presa.
  useEffect(() => {
    if (!celular) setAberta(false);
  }, [celular]);

  useEffect(() => {
    if (!aberta) return;

    const soltarRolagem = travarRolagem();
    fecharRef.current?.focus({ preventScroll: true });

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberta(false);
    };
    document.addEventListener("keydown", aoTeclar);

    const botao = botaoRef.current;
    return () => {
      soltarRolagem();
      document.removeEventListener("keydown", aoTeclar);
      botao?.focus({ preventScroll: true });
    };
  }, [aberta]);

  /* Arrastar o cabeçalho para baixo fecha. A folha acompanha o dedo via
     `transform` inline (que só existe durante o gesto) e, ao soltar, devolve o
     controle ao CSS: passou de 100px fecha, senão volta. */
  const arrasto = useRef<{ y: number; dy: number } | null>(null);

  function aoTocarInicio(e: TouchEvent<HTMLElement>) {
    arrasto.current = { y: e.touches[0].clientY, dy: 0 };
  }

  function aoTocarMover(e: TouchEvent<HTMLElement>) {
    const a = arrasto.current;
    const el = folhaRef.current;
    if (!a || !el) return;
    a.dy = Math.max(0, e.touches[0].clientY - a.y);
    el.style.transition = "none";
    el.style.transform = `translateY(${a.dy}px)`;
  }

  function aoTocarFim(cancelado = false) {
    const a = arrasto.current;
    arrasto.current = null;
    const el = folhaRef.current;
    if (!a || !el) return;
    el.style.transition = "";
    el.style.transform = "";
    if (!cancelado && a.dy > 100) setAberta(false);
  }

  // Desktop: nenhum invólucro, nenhum elemento a mais. É a barra de sempre.
  if (!celular) return <>{children}</>;

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        onClick={() => setAberta(true)}
        aria-haspopup="dialog"
        aria-expanded={aberta}
        className={[
          "inline-flex h-11 items-center justify-center gap-2 rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-4 text-[14px] font-semibold text-[var(--cz-texto)] transition-colors active:bg-[#F4F5F7]",
          classeBotao,
        ].join(" ")}
      >
        <SlidersHorizontal className="h-4 w-4 text-[var(--cz-texto-suave)]" aria-hidden="true" />
        <span>{titulo}</span>
        {ativos > 0 && (
          <span
            className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--cz-laranja)] px-1.5 text-[11px] font-bold leading-none text-white"
            aria-label={`${ativos} ${ativos === 1 ? "filtro ativo" : "filtros ativos"}`}
          >
            {ativos}
          </span>
        )}
      </button>

      {createPortal(
        // `visibility` troca DEPOIS da animação de saída (a transição dela dura o
        // mesmo que a folha) e já no primeiro quadro da entrada. Fechada, a folha
        // sai do teclado e do leitor de tela, sem precisar desmontar os filhos.
        <div
          className={[
            "fixed inset-0 z-[80] transition-[visibility] duration-300 motion-reduce:transition-none",
            aberta ? "visible" : "invisible",
          ].join(" ")}
        >
          <div
            aria-hidden="true"
            onClick={() => setAberta(false)}
            className={[
              "absolute inset-0 bg-black/40 transition-opacity duration-300 motion-reduce:transition-none",
              aberta ? "opacity-100" : "opacity-0",
            ].join(" ")}
          />

          <div
            ref={folhaRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={idTitulo}
            className={[
              "absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[20px] bg-[var(--cz-superficie)] shadow-[0_-12px_40px_rgba(16,24,40,0.18)]",
              "transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none",
              // Aberta = SEM translate (e não `translate-y-0`): ver o aviso no topo.
              aberta ? "" : "translate-y-full",
            ].join(" ")}
          >
            {/* Alça + título + fechar. Esta faixa é a área de arrastar. */}
            <div
              className="shrink-0 touch-none select-none"
              onTouchStart={aoTocarInicio}
              onTouchMove={aoTocarMover}
              onTouchEnd={() => aoTocarFim()}
              onTouchCancel={() => aoTocarFim(true)}
            >
              <div
                aria-hidden="true"
                className="mx-auto mt-2 h-1 w-10 rounded-full bg-[var(--cz-hairline-forte)]"
              />
              <div className="flex items-center justify-between pb-1 pl-5 pr-2 pt-1">
                <h2 id={idTitulo} className="cz-titulo text-[18px] leading-7">
                  {titulo}
                </h2>
                <button
                  ref={fecharRef}
                  type="button"
                  onClick={() => setAberta(false)}
                  aria-label={`Fechar ${titulo.toLowerCase()}`}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--cz-texto-suave)] transition-colors active:bg-[#F4F5F7]"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* `overscroll-contain`: o fim da lista não arrasta a página por baixo. */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2">
              <div className="flex flex-col gap-5">{children}</div>
            </div>

            <div className="flex shrink-0 gap-3 border-t border-[var(--cz-hairline)] px-5 pb-[calc(0.75rem_+_env(safe-area-inset-bottom,0px))] pt-3">
              {onLimpar && (
                <button
                  type="button"
                  onClick={onLimpar}
                  disabled={ativos === 0}
                  className="h-12 flex-1 rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[15px] font-semibold text-[var(--cz-texto)] transition-colors active:bg-[#F4F5F7] disabled:text-[var(--cz-texto-fraco)]"
                >
                  Limpar
                </button>
              )}
              <button
                type="button"
                onClick={() => setAberta(false)}
                className="h-12 flex-[2] rounded-[var(--cz-raio)] bg-[var(--cz-laranja)] text-[15px] font-semibold text-white transition-colors active:bg-[var(--cz-laranja-forte)]"
              >
                {rotuloConcluir}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * Um controle de filtro com o rótulo em cima, para usar DENTRO da folha.
 * Na barra do desktop os chips se explicam sozinhos ("Canal: Todos"); na folha,
 * empilhados em tela cheia, o rótulo acima deixa a leitura em uma coluna só.
 */
export function CampoDaFolha({
  rotulo,
  children,
}: {
  rotulo: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--cz-texto-suave)]">
        {rotulo}
      </p>
      {children}
    </div>
  );
}

/**
 * Opções de um filtro como pastilhas tocáveis, todas à vista.
 *
 * É o que entra NO LUGAR do "chip que abre um dropdown" quando o filtro mora na
 * folha. Dropdown dentro de folha é dois níveis de sobreposição para escolher
 * entre três ou quatro opções; aqui a escolha é um toque, e o estado atual de
 * todas as opções fica visível sem abrir nada. A pastilha ativa leva laranja
 * (cor de "escolhido por você" em todo o produto) e um check, para não depender
 * só da cor.
 *
 * Serve a filtro de escolha única e de múltipla escolha: quem decide o que um
 * toque significa é `onEscolher`.
 */
export function GrupoDePilulas({
  rotulo,
  opcoes,
  estaAtiva,
  onEscolher,
}: {
  /** Nome do grupo para leitor de tela ("Canal", "Status"…). */
  rotulo: string;
  opcoes: ReadonlyArray<{ id: string; rotulo: string }>;
  estaAtiva: (id: string) => boolean;
  onEscolher: (id: string) => void;
}) {
  return (
    <div role="group" aria-label={rotulo} className="flex flex-wrap gap-2">
      {opcoes.map((opcao) => {
        const ativa = estaAtiva(opcao.id);
        return (
          <button
            key={opcao.id}
            type="button"
            aria-pressed={ativa}
            onClick={() => onEscolher(opcao.id)}
            className={[
              "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[14px] transition-colors",
              ativa
                ? "border-[var(--cz-laranja)] bg-[var(--cz-laranja-suave)] font-semibold text-[var(--cz-laranja-forte)]"
                : "border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] font-medium text-[var(--cz-texto)] active:bg-[#F4F5F7]",
            ].join(" ")}
          >
            {ativa && <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />}
            {opcao.rotulo}
          </button>
        );
      })}
    </div>
  );
}
