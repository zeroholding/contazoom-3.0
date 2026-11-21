"use client";

import { ArrowDownUp, ArrowLeft, Boxes, CalendarDays, ChevronLeft, ChevronRight, Package, RefreshCw, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Cabecalho, MolduraTela } from "@/app/components/views/comum/shell";
import type { LinhaEstoque, MovimentoEstoque } from "@/lib/sku-estoque";

const API = "/api/sku/estoque";
const PAGE_SIZE = 25;
const PERIODOS = [7, 15, 30, 60, 90] as const;
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const painel = "rounded-2xl border border-hairline bg-superficie shadow-sm";
const campo = "min-h-11 w-full rounded-xl border border-hairline-forte bg-superficie px-3 text-sm text-tinta focus-visible:outline-2 focus-visible:outline-marca";
const botao = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-hairline-forte bg-superficie px-3 text-sm font-semibold text-tinta hover:bg-fundo disabled:opacity-50";
const principal = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-marca-forte px-4 text-sm font-bold text-white hover:bg-marca disabled:opacity-50";
const canais: Record<string, string> = { ML: "Mercado Livre", SP: "Shopee", TT: "TikTok Shop" };
const tipos: Record<string, string> = { inicial: "Saldo inicial", entrada: "Entrada", saida: "Saída", venda: "Venda" };

type Historico = { movimentos: MovimentoEstoque[]; total: number; porPagina: number };
type Painel = { tipo: "sku"; id: string } | { tipo: "processar" };

function inicioPeriodo(hoje: string, dias: number) {
  return new Date(Date.parse(hoje + "T00:00:00Z") - (dias - 1) * 86_400_000).toISOString().slice(0, 10);
}

function dataBr(data: string | null) {
  return data ? data.split("-").reverse().join("/") : "—";
}

function dinheiro(valor: number | null) {
  return valor === null ? "—" : moeda.format(valor);
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error ?? "Não foi possível consultar o estoque.");
  return data as T;
}

function post<T>(data: object) {
  return api<T>(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
}

function EstoqueDialog({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog
      ref={ref} onClose={onClose} aria-labelledby="estoque-dialog-titulo"
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-[46rem] overflow-y-auto rounded-2xl border border-hairline bg-superficie p-0 text-tinta shadow-xl backdrop:bg-slate-900/40"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-hairline bg-superficie px-5 py-3">
        <h2 id="estoque-dialog-titulo" className="min-w-0 break-words font-bold">{titulo}</h2>
        <button type="button" className={botao} onClick={() => ref.current?.close()} aria-label="Fechar"><X size={17} /></button>
      </header>
      <div className="space-y-4 p-5">{children}</div>
    </dialog>
  );
}

function Saldo({ linha }: { linha: LinhaEstoque }) {
  if (linha.saldo === null) return <span className="text-xs font-medium text-tinta-suave">A definir</span>;
  return <strong className={linha.saldo <= 0 ? "text-rose-700" : "text-tinta"}>{numero.format(linha.saldo)}</strong>;
}

function Cobertura({ linha }: { linha: LinhaEstoque }) {
  if (linha.cobertura === null) return <span className="text-tinta-suave">{linha.saldo === null ? "—" : "Sem vendas em 30 dias"}</span>;
  if (linha.cobertura === 0) return <span className="font-semibold text-rose-700">Esgotado</span>;
  return <span className={linha.cobertura <= 7 ? "font-semibold text-amber-700" : ""}>{numero.format(linha.cobertura)} dias</span>;
}

function Paginacao({ pagina, total, porPagina, onChange }: { pagina: number; total: number; porPagina: number; onChange: (pagina: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3 text-xs text-tinta-suave">
      <span>Página {pagina} de {paginas}</span>
      <div className="flex gap-2">
        <button className={botao} type="button" disabled={pagina <= 1} onClick={() => onChange(pagina - 1)} aria-label="Página anterior"><ChevronLeft size={16} /></button>
        <button className={botao} type="button" disabled={pagina >= paginas} onClick={() => onChange(pagina + 1)} aria-label="Próxima página"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

export function EstoqueSku({ hoje }: { hoje: string }) {
  const [preset, setPreset] = useState<number | null>(30);
  const [periodo, setPeriodo] = useState({ de: inicioPeriodo(hoje, 30), ate: hoje });
  const [personalizado, setPersonalizado] = useState(periodo);
  const [linhas, setLinhas] = useState<LinhaEstoque[] | null>(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [atualizacao, setAtualizacao] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [painelAberto, setPainelAberto] = useState<Painel | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erroAcao, setErroAcao] = useState("");
  const [tipo, setTipo] = useState<"entrada" | "saida">("entrada");
  const [quantidade, setQuantidade] = useState("");
  const [data, setData] = useState(hoje);
  const [observacao, setObservacao] = useState("");
  const [historico, setHistorico] = useState<Historico | null>(null);
  const [erroHistorico, setErroHistorico] = useState("");
  const [paginaHistorico, setPaginaHistorico] = useState(1);
  const idMovimento = useRef("");
  const selecionadoId = painelAberto?.tipo === "sku" ? painelAberto.id : null;
  const selecionado = linhas?.find((linha) => linha.id === selecionadoId);

  useEffect(() => {
    const controller = new AbortController();
    setCarregando(true);
    setErro("");
    api<{ linhas: LinhaEstoque[] }>(`${API}?${new URLSearchParams(periodo)}`, { signal: controller.signal })
      .then(({ linhas }) => { if (!controller.signal.aborted) setLinhas(linhas); })
      .catch((e: Error) => { if (!controller.signal.aborted) setErro(e.message); })
      .finally(() => { if (!controller.signal.aborted) setCarregando(false); });
    return () => controller.abort();
  }, [periodo, atualizacao]);

  useEffect(() => {
    if (!selecionadoId) return;
    const controller = new AbortController();
    setErroHistorico("");
    setHistorico(null);
    const params = new URLSearchParams({ skuId: selecionadoId, pagina: String(paginaHistorico) });
    api<Historico>(`${API}?${params}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setHistorico(data); })
      .catch((e: Error) => { if (!controller.signal.aborted) setErroHistorico(e.message); });
    return () => controller.abort();
  }, [selecionadoId, paginaHistorico, atualizacao]);

  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const filtradas = (linhas ?? []).filter((r) => `${r.sku} ${r.produto}`.toLocaleLowerCase("pt-BR").includes(termo));
  const visiveis = filtradas.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE);
  const valorTotal = (linhas ?? []).reduce((soma, linha) => soma + (linha.valorEstoque ?? 0), 0);
  const comSaldo = (linhas ?? []).filter((linha) => linha.saldo !== null);
  const criticos = comSaldo.filter((linha) => linha.cobertura !== null && linha.cobertura <= 7).length;

  function abrirSku(id: string) {
    setPainelAberto({ tipo: "sku", id });
    setErroAcao("");
    setPaginaHistorico(1);
    setTipo("entrada");
    setQuantidade("");
    setData(hoje);
    setObservacao("");
    idMovimento.current = crypto.randomUUID();
  }

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selecionado || ocupado) return;
    setOcupado(true);
    setErroAcao("");
    setMensagem("");
    try {
      await post({
        id: idMovimento.current, skuId: selecionado.id, tipo: selecionado.saldo === null ? "inicial" : tipo,
        quantidade: Number(quantidade), data, observacao,
      });
      setMensagem(`Movimentação registrada em ${selecionado.sku}.`);
      setPainelAberto(null);
      setAtualizacao((atual) => atual + 1);
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : "Não foi possível registrar a movimentação.");
    } finally {
      setOcupado(false);
    }
  }

  async function processar() {
    if (ocupado) return;
    setOcupado(true);
    setErroAcao("");
    setMensagem("");
    try {
      const result = await post<{ movimentos: number; unidades: number; semEstoqueAberto: number }>({ acao: "processar" });
      const baixas = result.movimentos > 0
        ? `${numero.format(result.unidades)} un. baixadas em ${numero.format(result.movimentos)} movimentações.`
        : "Nenhuma nova baixa de estoque.";
      setMensagem(result.semEstoqueAberto > 0
        ? `${baixas} ${numero.format(result.semEstoqueAberto)} linhas de venda ficaram sem baixa por falta de SKU identificado ou saldo inicial.`
        : baixas);
      setPainelAberto(null);
      setAtualizacao((atual) => atual + 1);
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : "Não foi possível processar as vendas.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <MolduraTela>
      <section className="mx-auto max-w-[1600px] space-y-5">
        <Link href="/sku" className="inline-flex items-center gap-2 text-sm font-semibold text-tinta-suave hover:text-marca-forte">
          <ArrowLeft size={16} /> Gestão de SKU
        </Link>
        <Cabecalho titulo="Controle de estoque" descricao="Saldos, movimentações e previsão de reposição por SKU."
          acao={<button className={principal} type="button" disabled={ocupado} onClick={() => {
            setErroAcao(""); setPainelAberto({ tipo: "processar" });
          }}><RefreshCw size={16} /> Processar vendas</button>}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <Resumo icon={<Boxes size={18} />} rotulo="Estoque a custo" valor={linhas ? dinheiro(valorTotal) : "—"} />
          <Resumo icon={<Package size={18} />} rotulo="SKUs com saldo inicial" valor={linhas ? numero.format(comSaldo.length) : "—"} />
          <Resumo icon={<CalendarDays size={18} />} rotulo="SKUs com cobertura de até 7 dias" valor={linhas ? numero.format(criticos) : "—"} />
        </div>

        <div className={`${painel} space-y-3 p-4`}>
          <div className="flex flex-wrap items-center gap-2" aria-label="Período de vendas">
            {PERIODOS.map((dias) => (
              <button key={dias} className={`${botao} ${preset === dias ? "!border-marca-borda !bg-marca-suave !text-marca-forte" : ""}`}
                type="button" aria-pressed={preset === dias} onClick={() => {
                  setPreset(dias); setPeriodo({ de: inicioPeriodo(hoje, dias), ate: hoje }); setPagina(1);
                }}>{dias} dias</button>
            ))}
            <button className={`${botao} ${preset === null ? "!border-marca-borda !bg-marca-suave !text-marca-forte" : ""}`}
              type="button" aria-pressed={preset === null} onClick={() => {
                setPersonalizado(periodo); setPreset(null);
              }}>Personalizado</button>
          </div>
          {preset === null && (
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
              e.preventDefault(); setPeriodo(personalizado); setPagina(1);
            }}>
              <label className="text-xs font-semibold text-tinta-suave">De
                <input type="date" className={campo} required max={personalizado.ate || hoje} value={personalizado.de} onChange={(e) => setPersonalizado({ ...personalizado, de: e.target.value })} />
              </label>
              <label className="text-xs font-semibold text-tinta-suave">Até
                <input type="date" className={campo} required min={personalizado.de} max={hoje} value={personalizado.ate} onChange={(e) => setPersonalizado({ ...personalizado, ate: e.target.value })} />
              </label>
              <button className={botao} type="submit">Aplicar período</button>
            </form>
          )}
          <p className="text-xs text-tinta-suave">Vendas de {dataBr(periodo.de)} a {dataBr(periodo.ate)}. A previsão usa sempre os últimos 30 dias.</p>
        </div>

        {mensagem && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">{mensagem}</p>}
        {erro && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">
            {erro}<button className={botao} type="button" onClick={() => setAtualizacao((n) => n + 1)}>Tentar novamente</button>
          </div>
        )}

        <div className={painel} aria-busy={carregando}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline p-4">
            <div><h2 className="font-bold text-tinta">Estoque por SKU</h2><p className="text-xs text-tinta-suave">{carregando ? "Atualizando…" : `${numero.format(filtradas.length)} SKUs`}</p></div>
            <label className="relative w-full sm:w-72">
              <Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-tinta-suave" />
              <input className={`${campo} pl-9`} type="search" aria-label="Buscar SKU ou produto" placeholder="Buscar SKU ou produto" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} />
            </label>
          </div>
          {visiveis.length === 0 ? (
            <p className="p-8 text-center text-sm text-tinta-suave">{carregando ? "Carregando estoque…" : erro ? "Consulta indisponível." : "Nenhum SKU encontrado."}</p>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead className="bg-fundo text-xs text-tinta-suave"><tr>
                    {["SKU / produto", "Estoque atual", "CMV unitário", "Estoque a custo", "Vendido no período", "Vendas a custo", "Média diária · 30d", "Cobertura", "Esgotamento", "Ação"].map((titulo) => (
                      <th scope="col" key={titulo} className="px-3 py-3 font-semibold">{titulo}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-hairline">
                    {visiveis.map((r) => (
                      <tr key={r.id}>
                        <td className="max-w-56 px-3 py-3"><Produto linha={r} /></td>
                        <td className="px-3 py-3"><Saldo linha={r} /></td>
                        <td className="whitespace-nowrap px-3 py-3">{dinheiro(r.custo)}</td>
                        <td className="whitespace-nowrap px-3 py-3">{dinheiro(r.valorEstoque)}</td>
                        <td className="px-3 py-3">{numero.format(r.vendidos)}</td>
                        <td className="whitespace-nowrap px-3 py-3">{dinheiro(r.custoVendas)}</td>
                        <td className="px-3 py-3">{numero.format(r.media30)} un./dia</td>
                        <td className="px-3 py-3"><Cobertura linha={r} /></td>
                        <td className="px-3 py-3">{dataBr(r.esgotamento)}</td>
                        <td className="px-3 py-3"><button className={botao} type="button" aria-label={`Movimentar estoque de ${r.sku}`} onClick={() => abrirSku(r.id)}>Movimentar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-hairline lg:hidden">
                {visiveis.map((r) => (
                  <li key={r.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2"><Produto linha={r} /><button className={botao} type="button" aria-label={`Movimentar estoque de ${r.sku}`} onClick={() => abrirSku(r.id)}><ArrowDownUp size={16} /></button></div>
                    <dl className="grid grid-cols-2 gap-3 rounded-xl bg-fundo p-3 text-sm">
                      <Metrica titulo="Estoque atual"><Saldo linha={r} /></Metrica>
                      <Metrica titulo="Estoque a custo">{dinheiro(r.valorEstoque)}</Metrica>
                      <Metrica titulo="CMV unitário">{dinheiro(r.custo)}</Metrica>
                      <Metrica titulo="Vendido no período">{numero.format(r.vendidos)} un.</Metrica>
                      <Metrica titulo="Vendas a custo">{dinheiro(r.custoVendas)}</Metrica>
                      <Metrica titulo="Média diária · 30d">{numero.format(r.media30)} un./dia</Metrica>
                      <Metrica titulo="Cobertura"><Cobertura linha={r} /></Metrica>
                      <Metrica titulo="Esgotamento">{dataBr(r.esgotamento)}</Metrica>
                    </dl>
                  </li>
                ))}
              </ul>
              <Paginacao pagina={pagina} total={filtradas.length} porPagina={PAGE_SIZE} onChange={setPagina} />
            </>
          )}
        </div>
      </section>

      {painelAberto?.tipo === "processar" && (
        <EstoqueDialog titulo="Processar vendas" onClose={() => setPainelAberto(null)}>
          <p className="text-sm text-tinta-suave">Abate as vendas do Mercado Livre, Shopee e TikTok Shop desde a abertura de cada SKU. Vendas já baixadas são ignoradas. Se as vendas superarem o saldo, o estoque pode ficar negativo.</p>
          {erroAcao && <p role="alert" className="text-sm text-rose-700">{erroAcao}</p>}
          <button type="button" className={principal} onClick={processar} disabled={ocupado}>{ocupado ? "Processando…" : "Confirmar processamento"}</button>
        </EstoqueDialog>
      )}
      {painelAberto?.tipo === "sku" && selecionado && (
        <EstoqueDialog titulo={`Movimentações · ${selecionado.sku}`} onClose={() => setPainelAberto(null)}>
          <p className="text-sm text-tinta-suave">{selecionado.produto} · Saldo <Saldo linha={selecionado} /></p>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={salvar}>
            {selecionado.saldo === null ? (
              <p className="text-xs text-tinta-suave sm:col-span-2">Informe o saldo disponível no começo da data de abertura. As vendas dessa data em diante poderão ser baixadas.</p>
            ) : (
              <label className="text-xs font-semibold text-tinta-suave">Movimentação
                <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value === "saida" ? "saida" : "entrada")}>
                  <option value="entrada">Entrada</option><option value="saida">Saída</option>
                </select>
              </label>
            )}
            <label className="text-xs font-semibold text-tinta-suave">{selecionado.saldo === null ? "Saldo inicial" : "Quantidade"}
              <input className={campo} required type="number" inputMode="numeric" min={selecionado.saldo === null ? 0 : 1} max={1_000_000_000} step={1} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
            </label>
            <label className="text-xs font-semibold text-tinta-suave">{selecionado.saldo === null ? "Data de abertura" : "Data"}
              <input className={campo} required type="date" min={selecionado.inicioEstoque ?? "1900-01-01"} max={hoje} value={data} onChange={(e) => setData(e.target.value)} />
            </label>
            <label className="text-xs font-semibold text-tinta-suave sm:col-span-2">Observação (opcional)
              <input className={campo} maxLength={300} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </label>
            {erroAcao && <p role="alert" className="text-sm text-rose-700 sm:col-span-2">{erroAcao}</p>}
            <button className={principal} type="submit" disabled={ocupado}>{ocupado ? "Salvando…" : "Salvar movimentação"}</button>
          </form>

          <section className="space-y-2 border-t border-hairline pt-4">
            <h3 className="font-bold text-tinta">Histórico de estoque</h3>
            {erroHistorico ? <p role="alert" className="text-sm text-rose-700">{erroHistorico}</p> : !historico ? (
              <p className="text-sm text-tinta-suave">Carregando histórico…</p>
            ) : historico.movimentos.length === 0 ? (
              <p className="text-sm text-tinta-suave">Nenhuma movimentação registrada.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {historico.movimentos.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-tinta">{tipos[m.tipo]} · {dataBr(m.data)}</p>
                      {m.canal && <p className="break-words text-xs text-tinta-suave">{canais[m.canal]} · pedido {m.pedidoId}</p>}
                      {m.observacao && <p className="break-words text-xs text-tinta-suave">{m.observacao}</p>}
                    </div>
                    <span className={`font-semibold tabular-nums ${m.quantidade < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                      {m.quantidade > 0 ? "+" : ""}{numero.format(m.quantidade)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {historico && <Paginacao pagina={paginaHistorico} total={historico.total} porPagina={historico.porPagina} onChange={setPaginaHistorico} />}
          </section>
        </EstoqueDialog>
      )}
    </MolduraTela>
  );
}

function Produto({ linha }: { linha: LinhaEstoque }) {
  return <div className="min-w-0"><p className="break-words font-mono text-xs font-bold text-tinta">{linha.sku}</p><p className="mt-1 break-words text-xs text-tinta-suave">{linha.produto}{!linha.ativo && " · Inativo"}</p></div>;
}

function Metrica({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <div><dt className="text-xs text-tinta-suave">{titulo}</dt><dd className="mt-1 text-tinta">{children}</dd></div>;
}

function Resumo({ icon, rotulo, valor }: { icon: ReactNode; rotulo: string; valor: string }) {
  return (
    <div className={`${painel} flex items-start gap-3 p-4`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-marca-suave text-marca-forte" aria-hidden>{icon}</span>
      <div><p className="text-xs font-semibold text-tinta-suave">{rotulo}</p><p className="mt-1 text-2xl font-bold tabular-nums text-tinta">{valor}</p></div>
    </div>
  );
}
