"use client";

import { Bell, CheckCheck, ChevronRight, FolderOpen, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useSmartDropdown } from "@/hooks/useSmartDropdown";
import {
  marcarNotificacoesComoLidas,
  marcarTodasNotificacoesComoLidas,
  useAoChegarNotificacoes,
  useNotificacoes,
} from "@/hooks/useNotificacoes";
import { ehNotificacaoDeDocumento, infoTipoNotificacao, type NotificacaoItem } from "@/lib/notificacoes/tipos";
import { irParaNotificacao } from "./navegacao";
import { IconeTipoNotificacao, detalheDoItem, quandoChegou, tituloDoItem, visualDoTipo } from "./visual";

/**
 * Sino do cabeçalho: junta as notificações do usuário, POR TIPO.
 *
 * Em "Todas" a lista vem dividida em seções (Impostos, Folha...), cada uma com
 * quantas há por ler; as abas filtram um tipo só. Clicar num aviso marca como
 * lido e abre o documento. Aviso que chega com a tela aberta faz o sino balançar
 * uma vez e mostra um cartão no canto, sem roubar o foco de quem está digitando.
 */

const TODAS = "todas";

function plural(total: number, singular: string, varios: string) {
  return `${total} ${total === 1 ? singular : varios}`;
}

export default function SinoNotificacoes() {
  const { user } = useAuthContext();
  const router = useRouter();
  const { status, naoLidas, porTipo, itens, recarregar } = useNotificacoes(user?.id);

  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<string>(TODAS);
  const [balancando, setBalancando] = useState(false);
  const [chegaram, setChegaram] = useState<NotificacaoItem[] | null>(null);
  const abertoRef = useRef(aberto);
  useEffect(() => {
    abertoRef.current = aberto;
  }, [aberto]);

  const fechar = useCallback(() => setAberto(false), []);
  const dispensarChegada = useCallback(() => setChegaram(null), []);
  const { triggerRef, dropdownRef, position, isVisible, isOpen } = useSmartDropdown<HTMLButtonElement>({
    isOpen: aberto,
    onClose: fechar,
    preferredPosition: "bottom-right",
    offset: 12,
    minDistanceFromEdge: 16,
  });

  useAoChegarNotificacoes((novas) => {
    setBalancando(true);
    if (!abertoRef.current) setChegaram(novas);
  });

  useEffect(() => {
    if (!balancando) return;
    const fim = setTimeout(() => setBalancando(false), 1000);
    return () => clearTimeout(fim);
  }, [balancando]);

  // Abrir o painel leva o foco para ele; fechar devolve ao sino (teclado e leitor
  // de tela não ficam perdidos no meio da página).
  const estavaAberto = useRef(false);
  useEffect(() => {
    if (aberto) {
      estavaAberto.current = true;
      setChegaram(null);
      void recarregar();
      const quadro = requestAnimationFrame(() => dropdownRef.current?.focus({ preventScroll: true }));
      return () => cancelAnimationFrame(quadro);
    }
    if (estavaAberto.current) {
      estavaAberto.current = false;
      const ativo = document.activeElement;
      if (!ativo || ativo === document.body || dropdownRef.current?.contains(ativo)) {
        triggerRef.current?.focus({ preventScroll: true });
      }
    }
    // `recarregar` e as refs são estáveis; só a abertura importa aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  // Aba de um tipo que deixou de existir volta para "Todas".
  const abaAtual = aba === TODAS || porTipo.some((grupo) => grupo.tipo === aba) ? aba : TODAS;
  const mostrarAbas = porTipo.length > 1;

  const grupos = useMemo(() => {
    const ordem = new Map(porTipo.map((grupo, indice) => [grupo.tipo, indice]));
    const porTipoDaLista = new Map<string, NotificacaoItem[]>();
    for (const item of itens) {
      if (abaAtual !== TODAS && item.tipo !== abaAtual) continue;
      porTipoDaLista.set(item.tipo, [...(porTipoDaLista.get(item.tipo) ?? []), item]);
    }
    return [...porTipoDaLista.entries()]
      .map(([tipo, lista]) => ({
        tipo,
        lista,
        naoLidas: porTipo.find((grupo) => grupo.tipo === tipo)?.naoLidas ?? lista.filter((item) => !item.lida).length,
      }))
      .sort((a, b) => (ordem.get(a.tipo) ?? 99) - (ordem.get(b.tipo) ?? 99));
  }, [abaAtual, itens, porTipo]);

  const naoLidasDaAba =
    abaAtual === TODAS ? naoLidas : porTipo.find((grupo) => grupo.tipo === abaAtual)?.naoLidas ?? 0;

  const abrirItem = (item: NotificacaoItem) => {
    if (!item.lida) void marcarNotificacoesComoLidas([item.id]);
    setAberto(false);
    setChegaram(null);
    irParaNotificacao(router, item);
  };

  const marcarAba = () => {
    void marcarTodasNotificacoesComoLidas(abaAtual === TODAS ? undefined : abaAtual);
  };

  if (!user) return null;

  const rotuloBotao = naoLidas > 0 ? `Notificações: ${plural(naoLidas, "não lida", "não lidas")}` : "Notificações";
  const carregandoPrimeiraVez = (status === "inicial" || status === "carregando") && itens.length === 0;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setAberto((valor) => !valor)}
        aria-label={rotuloBotao}
        title={rotuloBotao}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls="cz-painel-notificacoes"
        className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cz-laranja)] focus-visible:ring-offset-2 ${
          aberto
            ? "bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]"
            : "text-[var(--cz-texto-suave)] hover:bg-[#F4F5F7] hover:text-[var(--cz-texto)]"
        }`}
      >
        <Bell className={`h-5 w-5 ${balancando ? "cz-sino-balanca" : ""}`} strokeWidth={2} aria-hidden="true" />
        {naoLidas > 0 && (
          <span
            key={naoLidas}
            aria-hidden="true"
            className="cz-selo-entra absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--cz-laranja)] px-1 text-[10px] font-extrabold leading-none text-white tabular-nums ring-2 ring-[var(--cz-superficie)]"
          >
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </button>

      {isVisible && (
        <div
          ref={dropdownRef}
          id="cz-painel-notificacoes"
          role="dialog"
          aria-label="Notificações"
          tabIndex={-1}
          className={`smart-dropdown flex w-[min(26rem,calc(100vw-2rem))] flex-col outline-none ${
            isOpen ? "dropdown-enter" : "dropdown-exit"
          }`}
          style={{
            ...position,
            maxHeight: position.maxHeight ?? "min(36rem, calc(100dvh - var(--cz-topbar-h) - 1.5rem))",
            borderRadius: "var(--cz-raio-cartao)",
            border: "1px solid var(--cz-hairline)",
            boxShadow: "var(--cz-elev-3)",
          }}
        >
          <header className="shrink-0 border-b border-[var(--cz-hairline)] px-4 pb-3 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[15px] font-extrabold leading-5 text-[var(--cz-texto)]">Notificações</h2>
                <p className="mt-0.5 text-xs text-[var(--cz-texto-suave)]">
                  {naoLidas > 0 ? plural(naoLidas, "não lida", "não lidas") : "Tudo em dia"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={marcarAba}
                  disabled={naoLidasDaAba === 0}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-[var(--cz-laranja-forte)] transition-colors hover:bg-[var(--cz-laranja-suave)] disabled:pointer-events-none disabled:text-[var(--cz-texto-fraco)]"
                >
                  <CheckCheck className="size-4" aria-hidden="true" />
                  {abaAtual === TODAS ? "Marcar todas como lidas" : "Marcar como lidas"}
                </button>
                <button
                  type="button"
                  onClick={fechar}
                  className="grid size-8 place-items-center rounded-lg text-[var(--cz-texto-fraco)] transition-colors hover:bg-[var(--cz-fundo)] hover:text-[var(--cz-texto)] md:hidden"
                  aria-label="Fechar notificações"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {mostrarAbas && (
              <div
                role="tablist"
                aria-label="Tipos de notificação"
                className="mt-3 flex flex-wrap gap-1.5"
              >
                {[{ tipo: TODAS, rotuloCurto: "Todas", naoLidas }, ...porTipo].map((grupo) => {
                  const ativa = abaAtual === grupo.tipo;
                  return (
                    <button
                      key={grupo.tipo}
                      type="button"
                      role="tab"
                      aria-selected={ativa}
                      onClick={() => setAba(grupo.tipo)}
                      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors ${
                        ativa
                          ? "border-[var(--cz-laranja)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]"
                          : "border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[var(--cz-texto-suave)] hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-texto)]"
                      }`}
                    >
                      {grupo.rotuloCurto}
                      {grupo.naoLidas > 0 && (
                        <span
                          className={`grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] leading-none tabular-nums ${
                            ativa ? "bg-[var(--cz-laranja)] text-white" : "bg-[var(--cz-fundo)] text-[var(--cz-texto-suave)]"
                          }`}
                        >
                          {grupo.naoLidas > 99 ? "99+" : grupo.naoLidas}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </header>

          <div className="cz-rolagem min-h-0 flex-1 overflow-y-auto overscroll-contain" role={mostrarAbas ? "tabpanel" : undefined}>
            {carregandoPrimeiraVez ? (
              <div className="space-y-1 p-3" role="status" aria-label="Carregando notificações">
                {[0, 1, 2].map((linha) => (
                  <div key={linha} className="flex items-start gap-3 px-1 py-2.5">
                    <div className="cz-esqueleto size-10 shrink-0 rounded-xl" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="cz-esqueleto h-3.5 w-3/4" />
                      <div className="cz-esqueleto h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : status === "erro" && itens.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm font-bold text-[var(--cz-texto)]">Não foi possível carregar os avisos</p>
                <p className="mt-1 text-xs text-[var(--cz-texto-suave)]">Confira a conexão e tente de novo.</p>
                <button
                  type="button"
                  onClick={() => void recarregar()}
                  className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--cz-hairline-forte)] px-3 text-xs font-bold text-[var(--cz-texto)] transition-colors hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-laranja-forte)]"
                >
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                  Tentar de novo
                </button>
              </div>
            ) : grupos.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja)]">
                  <Bell className="size-6" aria-hidden="true" />
                </span>
                <p className="mt-3 text-sm font-bold text-[var(--cz-texto)]">Tudo em dia por aqui</p>
                <p className="mx-auto mt-1 max-w-[17rem] text-xs leading-relaxed text-[var(--cz-texto-suave)]">
                  Quando a equipe ContaZoom enviar um documento para você, o aviso aparece aqui e no seu e-mail.
                </p>
              </div>
            ) : (
              grupos.map((grupo) => {
                const info = infoTipoNotificacao(grupo.tipo);
                return (
                  <section key={grupo.tipo} aria-label={info.rotulo}>
                    {abaAtual === TODAS && (
                      <div className="sticky top-0 z-[1] flex items-center gap-1.5 border-b border-[var(--cz-hairline)] bg-[var(--cz-superficie)]/95 px-4 py-2 backdrop-blur-sm">
                        <span className={`text-[11px] font-extrabold uppercase tracking-[0.08em] ${visualDoTipo(grupo.tipo).tinta}`}>
                          {info.rotulo}
                        </span>
                        {grupo.naoLidas > 0 && (
                          <span className="text-[11px] font-semibold text-[var(--cz-texto-fraco)]">
                            · {plural(grupo.naoLidas, "nova", "novas")}
                          </span>
                        )}
                      </div>
                    )}
                    <ul>
                      {grupo.lista.map((item) => (
                        <li key={item.id} className="border-b border-[var(--cz-hairline)] last:border-b-0">
                          <button
                            type="button"
                            onClick={() => abrirItem(item)}
                            className={`group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--cz-fundo)] focus-visible:bg-[var(--cz-fundo)] focus-visible:outline-none ${
                              item.lida ? "" : "bg-[#FFFAF6]"
                            }`}
                          >
                            <IconeTipoNotificacao tipo={item.tipo} />
                            <span className="min-w-0 flex-1">
                              <span
                                className={`block truncate text-[13.5px] leading-5 ${
                                  item.lida ? "font-semibold text-[var(--cz-texto-suave)]" : "font-bold text-[var(--cz-texto)]"
                                } group-hover:text-[var(--cz-laranja-forte)]`}
                                title={tituloDoItem(item)}
                              >
                                {tituloDoItem(item)}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-[var(--cz-texto-suave)]">
                                {detalheDoItem(item)}
                              </span>
                              <span className="mt-1 block text-[11px] font-semibold text-[var(--cz-texto-fraco)]">
                                {quandoChegou(item.criadaEm)}
                                {item.lida ? "" : " · não lida"}
                              </span>
                            </span>
                            {!item.lida && (
                              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--cz-laranja)]" aria-hidden="true" />
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })
            )}
          </div>

          <footer className="shrink-0 border-t border-[var(--cz-hairline)] p-2">
            <button
              type="button"
              onClick={() => {
                setAberto(false);
                router.push("/documentos");
              }}
              className="group flex h-10 w-full items-center justify-center gap-1.5 rounded-lg text-[13px] font-bold text-[var(--cz-laranja-forte)] transition-colors hover:bg-[var(--cz-laranja-suave)]"
            >
              <FolderOpen className="size-4" aria-hidden="true" />
              Abrir a central de documentos
              <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </footer>
        </div>
      )}

      {chegaram && chegaram.length > 0 && !aberto && (
        <AvisoDeChegada
          novas={chegaram}
          onAbrir={(item) => abrirItem(item)}
          onVerTodas={() => {
            setChegaram(null);
            setAberto(true);
          }}
          onFechar={dispensarChegada}
        />
      )}
    </div>
  );
}

/**
 * Cartão no canto quando chega aviso com a tela aberta. Some sozinho em 8 s,
 * mas não enquanto o mouse ou o foco estão nele: quem está lendo não perde.
 */
function AvisoDeChegada({
  novas,
  onAbrir,
  onVerTodas,
  onFechar,
}: {
  novas: NotificacaoItem[];
  onAbrir: (item: NotificacaoItem) => void;
  onVerTodas: () => void;
  onFechar: () => void;
}) {
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (pausado) return;
    const fim = setTimeout(onFechar, 8000);
    return () => clearTimeout(fim);
  }, [pausado, onFechar, novas]);

  const primeira = novas[0];
  const varias = novas.length > 1;
  const deDocumento = ehNotificacaoDeDocumento(primeira.tipo);
  const chamada = varias
    ? `${novas.length} ${deDocumento ? "documentos novos" : "avisos novos"}`
    : deDocumento
      ? `Documento novo · ${infoTipoNotificacao(primeira.tipo).rotuloCurto}`
      : "Aviso novo";

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
      className="cz-aviso-entra fixed right-4 top-[calc(var(--cz-topbar-h)+0.75rem)] z-[70] w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] shadow-[var(--cz-elev-3)]"
    >
      <div className="h-1 bg-[var(--cz-laranja)]" aria-hidden="true" />
      <div className="flex items-start gap-3 p-4">
        <IconeTipoNotificacao tipo={primeira.tipo} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--cz-laranja-forte)]">{chamada}</p>
          <p className="mt-0.5 truncate text-sm font-bold text-[var(--cz-texto)]" title={tituloDoItem(primeira)}>
            {tituloDoItem(primeira)}
          </p>
          <p className="truncate text-xs text-[var(--cz-texto-suave)]">
            {varias
              ? `e mais ${novas.length - 1} ${novas.length - 1 === 1 ? "aviso" : "avisos"} no sino`
              : detalheDoItem(primeira)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => (varias || !primeira.link ? onVerTodas() : onAbrir(primeira))}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--cz-laranja)] px-3 text-xs font-bold text-white transition-colors hover:bg-[var(--cz-laranja-forte)]"
            >
              {varias || !primeira.link ? "Ver avisos" : "Abrir documento"}
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onFechar}
              className="h-9 rounded-lg px-3 text-xs font-bold text-[var(--cz-texto-suave)] transition-colors hover:bg-[var(--cz-fundo)] hover:text-[var(--cz-texto)]"
            >
              Agora não
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onFechar}
          className="-m-1 grid size-8 shrink-0 place-items-center rounded-lg text-[var(--cz-texto-fraco)] transition-colors hover:bg-[var(--cz-fundo)] hover:text-[var(--cz-texto)]"
          aria-label="Fechar aviso"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
