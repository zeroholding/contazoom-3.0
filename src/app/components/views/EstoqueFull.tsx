"use client";

/**
 * Estoque Full — o que está nos centros de distribuição do Mercado Livre.
 *
 * Uma linha por inventário/variação. A cobertura usa as vendas dos últimos
 * 30 dias e transforma quantidade em uma decisão de reposição.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  Aviso,
  BotaoAtualizar,
  Cabecalho,
  CabecalhoTabela,
  Campo,
  CampoBusca,
  Esqueleto,
  Faixa,
  Miniatura,
  MolduraTela,
  MultiSelecao,
  type OpcaoRecorte,
  Th,
  ThOrdenavel,
} from "./comum/shell";
import {
  IconeAlerta,
  IconeAtualizar,
  IconeCaixas,
  IconeCaminhao,
  IconeCerto,
  IconeFiltro,
  IconeInfo,
  IconePausa,
  IconeProibido,
  IconeSubindo,
} from "./comum/icones";
import { brl, ENTRADA, inteiro, tempoRelativo } from "./comum/formato";
import {
  DIAS_ESTOQUE_ALTO,
  DIAS_REPOR,
  type SituacaoEstoque,
} from "@/lib/estoque-full-cobertura";

type Ordem = "aptas" | "vendas" | "medio" | "caminho" | "naoaptas" | "cobertura";
type Direcao = "asc" | "desc";

type Linha = {
  inventoryId: string;
  meliAccountId: string;
  conta: string | null;
  itemId: string | null;
  variationId: string | null;
  sku: string | null;
  titulo: string;
  thumbnail: string | null;
  logisticType: string | null;
  disponivel: number;
  naoDisponivel: number;
  transferencia: number;
  total: number;
  vendas30dUnidades: number;
  vendas30dReceita: number;
  estoqueMedio: number | null;
  cobertura: number | null;
  rotuloCobertura: string;
  situacao: SituacaoEstoque;
  hierarquia1: string | null;
  hierarquia2: string | null;
  sincronizadoEm: string;
};

type Resumo = {
  itens: number;
  aptas: number;
  naoAptas: number;
  aCaminho: number;
  aRepor: number;
  parados: number;
  vendasUnidades: number;
  vendasReceita: number;
  ultimaAtualizacao: string | null;
};

type Resposta = {
  linhas: Linha[];
  resumo: Resumo;
  total: number;
  pagina: number;
  totalPaginas: number;
  nuncaSincronizou: boolean;
  backfillPendente: number;
  contasDisponiveis: { id: string; nickname: string | null }[];
  hierarquias1: string[];
  hierarquias2: string[];
  skusDisponiveis: string[];
};

const RESUMO_VAZIO: Resumo = {
  itens: 0,
  aptas: 0,
  naoAptas: 0,
  aCaminho: 0,
  aRepor: 0,
  parados: 0,
  vendasUnidades: 0,
  vendasReceita: 0,
  ultimaAtualizacao: null,
};

const SITUACOES: ReadonlyArray<OpcaoRecorte<"" | SituacaoEstoque>> = [
  { chave: "", rotulo: "Tudo", explicacao: "Todo o estoque que está no Full." },
  {
    chave: "repor",
    rotulo: `Repor (≤ ${Math.round(DIAS_REPOR / 7)} sem.)`,
    explicacao:
      "O estoque acaba antes de a reposição chegar. Enviar mercadoria ao Full leva cerca de duas semanas entre despacho e entrada — abaixo disso, repor hoje já é tarde.",
  },
  {
    chave: "parado",
    rotulo: "Parado",
    explicacao:
      "Tem mercadoria no Full e não vendeu nada em 30 dias. Aqui o problema não é estoque: é o anúncio, o preço ou a demanda. E você está pagando armazenagem por isso.",
  },
  {
    chave: "alto",
    rotulo: `Estoque alto (≥ ${Math.round(DIAS_ESTOQUE_ALTO / 7)} sem.)`,
    explicacao:
      "Vende, mas tem estoque para mais de dois meses. É capital parado e custo de armazenagem no Full, que o ML cobra por volume acima de certo tempo.",
  },
  {
    chave: "saudavel",
    rotulo: "Saudável",
    explicacao: "Vende num ritmo que o estoque acompanha. Nada a fazer.",
  },
];

const CAMPOS_ORDEM: ReadonlyArray<{ chave: Ordem; rotulo: string }> = [
  { chave: "aptas", rotulo: "Aptas p/ venda" },
  { chave: "vendas", rotulo: "Vendas 30d" },
  { chave: "medio", rotulo: "Estoque médio" },
  { chave: "caminho", rotulo: "A caminho" },
  { chave: "naoaptas", rotulo: "Não aptas" },
  { chave: "cobertura", rotulo: "Tempo até esgotar" },
];

const SELO_SITUACAO: Record<
  SituacaoEstoque,
  { texto: string; casca: string; bolinha: string }
> = {
  parado: { texto: "Parado", casca: "bg-amber-50 text-amber-700", bolinha: "bg-amber-500" },
  repor: { texto: "Repor", casca: "bg-rose-50 text-rose-700", bolinha: "bg-rose-500" },
  alto: {
    texto: "Estoque alto",
    casca: "bg-amber-50 text-amber-700",
    bolinha: "bg-amber-500",
  },
  saudavel: {
    texto: "Saudável",
    casca: "bg-emerald-50 text-emerald-700",
    bolinha: "bg-emerald-500",
  },
};

export default function EstoqueFull() {
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [contas, setContas] = useState<string[]>([]);
  const [skus, setSkus] = useState<string[]>([]);
  const [situacao, setSituacao] = useState<"" | SituacaoEstoque>("");
  const [estoque, setEstoque] = useState("");
  const [hierarquia1, setHierarquia1] = useState("");
  const [hierarquia2, setHierarquia2] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("aptas");
  const [direcao, setDirecao] = useState<Direcao>("desc");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(50);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [sincronizando, setSincronizando] = useState(false);
  const [progresso, setProgresso] = useState<{
    atual: number;
    total: number;
    texto: string;
  } | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (buscaAplicada) p.set("busca", buscaAplicada);
    if (contas.length > 0) p.set("contas", contas.join(","));
    if (skus.length > 0) p.set("skus", skus.join(","));
    if (situacao) p.set("situacao", situacao);
    if (estoque) p.set("estoque", estoque);
    if (hierarquia1) p.set("hierarquia1", hierarquia1);
    if (hierarquia2) p.set("hierarquia2", hierarquia2);
    p.set("ordem", ordem);
    p.set("direcao", direcao);
    p.set("pagina", String(pagina));
    p.set("porPagina", String(porPagina));
    return p.toString();
  }, [
    buscaAplicada,
    contas,
    skus,
    situacao,
    estoque,
    hierarquia1,
    hierarquia2,
    ordem,
    direcao,
    pagina,
    porPagina,
  ]);

  const carregar = useCallback(
    async (forcar = false): Promise<Resposta> => {
      const url = `/api/estoque-full?${params}${forcar ? "&atualizar=1" : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Resposta;
    },
    [params],
  );

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    carregar()
      .then((j) => {
        if (vivo) setDados(j);
      })
      .catch(() => {
        if (vivo) setErro("Não foi possível carregar o estoque.");
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [carregar]);

  useEffect(() => {
    return () => {
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, []);

  async function sincronizar() {
    if (sincronizando) return;
    setSincronizando(true);
    setProgresso({ atual: 0, total: 0, texto: "Conectando…" });

    sseRef.current?.close();
    const es = new EventSource("/api/meli/vendas/sync-progress", { withCredentials: true });
    sseRef.current = es;

    es.onmessage = (ev) => {
      try {
        const p = JSON.parse(ev.data) as {
          type?: string;
          message?: string;
          current?: number;
          total?: number;
          fetched?: number;
        };
        if (!p.type?.startsWith("estoque_full_")) return;

        if (p.type === "estoque_full_complete" || p.type === "estoque_full_error") {
          setProgresso(null);
          setSincronizando(false);
          es.close();
          sseRef.current = null;
          if (p.type === "estoque_full_error") {
            setErro(p.message ?? "Falha ao atualizar o estoque.");
            return;
          }
          setCarregando(true);
          carregar(true)
            .then(setDados)
            .catch(() => setErro("Atualizou, mas não consegui recarregar a tela."))
            .finally(() => setCarregando(false));
          return;
        }

        setProgresso({
          atual: p.fetched ?? p.current ?? 0,
          total: p.total ?? 0,
          texto: p.message ?? "Atualizando…",
        });
      } catch {
        // Evento malformado não derruba a tela.
      }
    };

    es.onerror = () => {
      setProgresso((p) =>
        p ? { ...p, texto: "Sem conexão de progresso; o sync continua." } : p,
      );
    };

    void fetch("/api/estoque-full/sync", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        if (res.status === 409) {
          setErro("Já existe uma atualização de estoque em andamento.");
          setSincronizando(false);
          setProgresso(null);
          es.close();
        }
      })
      .catch(() => {
        setErro("Não foi possível iniciar a atualização.");
        setSincronizando(false);
        setProgresso(null);
        es.close();
      });
  }

  function ordenar(campo: Ordem, dir: Direcao) {
    setOrdem(campo);
    setDirecao(dir);
    setPagina(1);
  }

  const resumo = dados?.resumo ?? RESUMO_VAZIO;
  const linhas = dados?.linhas ?? [];
  const atualizado = tempoRelativo(resumo.ultimaAtualizacao);
  const temFiltro = Boolean(
    buscaAplicada ||
      contas.length ||
      skus.length ||
      situacao ||
      estoque ||
      hierarquia1 ||
      hierarquia2,
  );
  const filtrosAdicionaisAtivos = [
    contas.length > 0,
    skus.length > 0,
    Boolean(estoque),
    Boolean(hierarquia1),
    Boolean(hierarquia2),
  ].filter(Boolean).length;

  const pctProgresso =
    progresso && progresso.total > 0
      ? Math.min(97, Math.round((progresso.atual / Math.max(1, progresso.total)) * 100))
      : progresso
        ? 3
        : null;

  return (
    <MolduraTela>
      <Cabecalho
        titulo="Estoque Full"
        descricao={
          "O que está nos centros de distribuição do Mercado Livre, com quantos dias cada item aguenta no ritmo de venda dos últimos 30 dias." +
          (atualizado ? ` Atualizado ${atualizado}.` : "")
        }
        acao={
          <BotaoAtualizar
            onClick={sincronizar}
            atualizando={sincronizando}
            desabilitado={carregando && !dados}
            rotulo="Atualizar estoque Full"
            percentual={pctProgresso}
          />
        }
      />

      {progresso && (
        <Faixa tom="info" icone={<IconeAtualizar className="h-4 w-4 animate-spin" />}>
          {progresso.texto}
        </Faixa>
      )}

      {(dados?.backfillPendente ?? 0) > 0 && (
        <Faixa tom="info" icone={<IconeInfo className="h-4 w-4" />}>
          <strong>{inteiro(dados!.backfillPendente)} venda(s)</strong> ainda estão sendo
          associadas à variação do anúncio. Até terminar, a coluna <strong>Vendas 30d</strong>{" "}
          pode estar incompleta em anúncios com variação, e a cobertura desses itens sai maior
          do que a real. O preenchimento é automático a cada carregamento desta tela e não
          consome a API do Mercado Livre.
        </Faixa>
      )}

      <RecorteSituacao
        valor={situacao}
        onMudar={(chave) => {
          setSituacao(chave);
          setPagina(1);
        }}
      />

      <section
        aria-label="Filtros e ordenação"
        className="mt-4 rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-3 shadow-[var(--cz-elev-1)] sm:p-4"
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-12">
          <CampoBusca
            valor={busca}
            onMudar={setBusca}
            onAplicar={() => {
              setBuscaAplicada(busca);
              setPagina(1);
            }}
            placeholder="Título, SKU, código do estoque ou MLB"
            className="min-w-0 sm:col-span-1 xl:col-span-6"
          />

          <button
            type="button"
            onClick={() => setFiltrosAbertos((aberto) => !aberto)}
            aria-expanded={filtrosAbertos}
            aria-controls="filtros-estoque-full"
            className={`mt-[21px] inline-flex h-11 items-center justify-center gap-2 rounded-[var(--cz-raio)] border px-4 text-[13.5px] font-semibold transition-colors sm:min-w-32 xl:hidden ${
              filtrosAdicionaisAtivos > 0
                ? "border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]"
                : "border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[var(--cz-texto)] hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-laranja-forte)]"
            }`}
          >
            <IconeFiltro className="h-4 w-4" />
            Filtros{filtrosAdicionaisAtivos > 0 ? ` (${filtrosAdicionaisAtivos})` : ""}
          </button>

          <Campo rotulo="Ordenar cards" className="sm:col-span-2 xl:hidden">
            <select
              value={`${ordem}:${direcao}`}
              onChange={(e) => {
                const [campo, dir] = e.target.value.split(":") as [Ordem, Direcao];
                ordenar(campo, dir);
              }}
              className={ENTRADA}
            >
              {CAMPOS_ORDEM.flatMap((campo) => [
                <option key={`${campo.chave}:desc`} value={`${campo.chave}:desc`}>
                  {campo.rotulo} — maior primeiro
                </option>,
                <option key={`${campo.chave}:asc`} value={`${campo.chave}:asc`}>
                  {campo.rotulo} — menor primeiro
                </option>,
              ])}
            </select>
          </Campo>

          <div
            id="filtros-estoque-full"
            className={`${filtrosAbertos ? "grid" : "hidden"} gap-3 sm:col-span-2 sm:grid-cols-2 xl:col-span-12 xl:grid xl:grid-cols-12`}
          >
            <MultiSelecao
              className="xl:col-span-3"
              rotulo="Conta"
              placeholder="Todas as contas"
              vazio="Nenhuma conta com estoque no Full"
              opcoes={(dados?.contasDisponiveis ?? []).map((c) => ({
                valor: c.id,
                rotulo: c.nickname ?? c.id,
              }))}
              selecionados={contas}
              onMudar={(v) => {
                setContas(v);
                setPagina(1);
              }}
            />

            <MultiSelecao
              className="xl:col-span-3"
              rotulo="SKU"
              placeholder="Todos os SKUs"
              buscaPlaceholder="Digite o código do SKU…"
              vazio="Nenhum SKU no snapshot do Full"
              opcoes={(dados?.skusDisponiveis ?? []).map((s) => ({ valor: s, rotulo: s }))}
              selecionados={skus}
              onMudar={(v) => {
                setSkus(v);
                setPagina(1);
              }}
            />

            <Campo rotulo="Estoque" className="xl:col-span-2">
              <select
                value={estoque}
                onChange={(e) => {
                  setEstoque(e.target.value);
                  setPagina(1);
                }}
                className={ENTRADA}
              >
                <option value="">Todos</option>
                <option value="com">Com estoque</option>
                <option value="sem">Esgotado</option>
              </select>
            </Campo>

            <Campo rotulo="Hierarquia 1" className="xl:col-span-2">
              <select
                value={hierarquia1}
                onChange={(e) => {
                  setHierarquia1(e.target.value);
                  setPagina(1);
                }}
                className={ENTRADA}
              >
                <option value="">Todas</option>
                {(dados?.hierarquias1 ?? []).map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo rotulo="Hierarquia 2" className="xl:col-span-2">
              <select
                value={hierarquia2}
                onChange={(e) => {
                  setHierarquia2(e.target.value);
                  setPagina(1);
                }}
                className={ENTRADA}
              >
                <option value="">Todas</option>
                {(dados?.hierarquias2 ?? []).map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </Campo>

            {filtrosAdicionaisAtivos > 0 && (
              <button
                type="button"
                onClick={() => {
                  setContas([]);
                  setSkus([]);
                  setEstoque("");
                  setHierarquia1("");
                  setHierarquia2("");
                  setPagina(1);
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-[var(--cz-raio)] border border-[var(--cz-laranja-borda)] px-4 text-[13.5px] font-semibold text-[var(--cz-laranja-forte)] transition-colors hover:bg-[var(--cz-laranja-suave)] sm:col-span-2 xl:col-span-12 xl:justify-self-end"
              >
                Limpar filtros adicionais
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 xl:grid-cols-7">
        <KpiResponsivo
          rotulo="A repor"
          valor={inteiro(resumo.aRepor)}
          tom={resumo.aRepor > 0 ? "critico" : "neutro"}
          nota="acaba em 2 semanas"
          icone={<IconeAlerta className="h-4 w-4 sm:h-5 sm:w-5" />}
        />
        <KpiResponsivo
          rotulo="Parados"
          valor={inteiro(resumo.parados)}
          tom={resumo.parados > 0 ? "alerta" : "neutro"}
          nota="sem venda em 30d"
          icone={<IconePausa className="h-4 w-4 sm:h-5 sm:w-5" />}
        />
        <KpiResponsivo
          rotulo="Não aptas"
          valor={inteiro(resumo.naoAptas)}
          tom={resumo.naoAptas > 0 ? "critico" : "neutro"}
          icone={<IconeProibido className="h-4 w-4 sm:h-5 sm:w-5" />}
        />
        <KpiResponsivo
          rotulo="Aptas p/ venda"
          valor={inteiro(resumo.aptas)}
          tom="bom"
          icone={<IconeCerto className="h-4 w-4 sm:h-5 sm:w-5" />}
        />
        <KpiResponsivo
          rotulo="A caminho"
          valor={inteiro(resumo.aCaminho)}
          icone={<IconeCaminhao className="h-4 w-4 sm:h-5 sm:w-5" />}
        />
        <KpiResponsivo
          rotulo="Itens no Full"
          valor={inteiro(resumo.itens)}
          icone={<IconeCaixas className="h-4 w-4 sm:h-5 sm:w-5" />}
        />
        <KpiResponsivo
          rotulo="Vendas 30 dias"
          valor={`${inteiro(resumo.vendasUnidades)} un.`}
          nota={brl(resumo.vendasReceita)}
          icone={<IconeSubindo className="h-4 w-4 sm:h-5 sm:w-5" />}
          className="col-span-2 md:col-span-2 xl:col-span-1"
        />
      </div>

      <section
        aria-label="Itens do estoque Full"
        aria-busy={carregando}
        className="mt-4 overflow-hidden rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]"
      >
        {carregando ? (
          <EstadoCarregando />
        ) : erro ? (
          <Aviso
            icone={<IconeAlerta className="h-6 w-6" />}
            titulo="Erro ao carregar"
            texto={erro}
          />
        ) : dados?.nuncaSincronizou ? (
          <Aviso
            icone={<IconeCaixas className="h-6 w-6" />}
            titulo="Nenhum estoque importado ainda"
            texto="O estoque do Full vem da API do Mercado Livre e ainda não foi trazido. Clique em Atualizar estoque Full — na primeira vez pode levar alguns minutos, dependendo de quantos anúncios você tem em Full."
            acao={
              <BotaoAtualizar
                onClick={sincronizar}
                atualizando={sincronizando}
                desabilitado={false}
                rotulo="Atualizar estoque Full"
                percentual={pctProgresso}
              />
            }
          />
        ) : linhas.length === 0 ? (
          <Aviso
            icone={<IconeFiltro className="h-6 w-6" />}
            titulo="Nenhum item com esses filtros"
            texto={
              temFiltro
                ? "Solte um dos filtros ou volte para o recorte “Tudo”. O estoque está importado; é o filtro que não achou nada."
                : "O estoque está importado, mas nenhum item aparece. Atualize o estoque para trazer o estado atual do Mercado Livre."
            }
          />
        ) : (
          <>
            <div className="divide-y divide-[var(--cz-hairline)] xl:hidden">
              {linhas.map((linha) => (
                <CardEstoque
                  key={`${linha.meliAccountId}:${linha.inventoryId}`}
                  linha={linha}
                />
              ))}
            </div>

            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[960px] border-collapse text-left">
                <CabecalhoTabela>
                  <Th className="w-[34%] pl-5">Produto</Th>
                  <ThOrdenavel
                    campo="aptas"
                    rotulo="Aptas p/ venda"
                    ordemAtual={ordem}
                    direcaoAtual={direcao}
                    onOrdenar={ordenar}
                    className="bg-emerald-50/60 text-emerald-700"
                  />
                  <ThOrdenavel
                    campo="vendas"
                    rotulo="Vendas 30d"
                    ordemAtual={ordem}
                    direcaoAtual={direcao}
                    onOrdenar={ordenar}
                  />
                  <ThOrdenavel
                    campo="medio"
                    rotulo="Estoque médio"
                    ordemAtual={ordem}
                    direcaoAtual={direcao}
                    onOrdenar={ordenar}
                  />
                  <ThOrdenavel
                    campo="caminho"
                    rotulo="A caminho"
                    ordemAtual={ordem}
                    direcaoAtual={direcao}
                    onOrdenar={ordenar}
                  />
                  <ThOrdenavel
                    campo="naoaptas"
                    rotulo="Não aptas"
                    ordemAtual={ordem}
                    direcaoAtual={direcao}
                    onOrdenar={ordenar}
                  />
                  <ThOrdenavel
                    campo="cobertura"
                    rotulo="Tempo até esgotar"
                    ordemAtual={ordem}
                    direcaoAtual={direcao}
                    onOrdenar={ordenar}
                  />
                  <Th className="pr-5">Situação</Th>
                </CabecalhoTabela>
                <tbody>
                  {linhas.map((linha) => (
                    <LinhaEstoque
                      key={`${linha.meliAccountId}:${linha.inventoryId}`}
                      l={linha}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {dados && dados.total > 0 && !dados.nuncaSincronizou && (
          <PaginacaoLocal
            pagina={dados.pagina}
            totalPaginas={dados.totalPaginas}
            total={dados.total}
            porPagina={porPagina}
            onPagina={setPagina}
            onPorPagina={(valor) => {
              setPorPagina(valor);
              setPagina(1);
            }}
          />
        )}
      </section>

      <p className="mt-4 max-w-4xl text-xs leading-relaxed text-[var(--cz-texto-suave)]">
        Os números de estoque vêm da API do Mercado Livre e são gravados quando você clica
        em Atualizar — não mudam sozinhos entre um clique e outro. As vendas de 30 dias e a
        cobertura são calculadas a partir das vendas já sincronizadas neste sistema.{" "}
        <strong>&quot;A caminho&quot;</strong> são unidades em transferência para o centro de
        distribuição: o Mercado Livre as devolve somadas às não aptas, e aqui elas ficam
        separadas para bater com o painel dele. Uma linha por variação, porque no Full o
        estoque é por variação.
      </p>
    </MolduraTela>
  );
}

function RecorteSituacao({
  valor,
  onMudar,
}: {
  valor: "" | SituacaoEstoque;
  onMudar: (valor: "" | SituacaoEstoque) => void;
}) {
  const ativa = SITUACOES.find((opcao) => opcao.chave === valor);

  return (
    <section aria-label="Recorte por situação" className="mt-5">
      <div className="flex gap-2 overflow-x-auto pb-1" role="group">
        {SITUACOES.map((opcao) => {
          const selecionada = opcao.chave === valor;
          return (
            <button
              key={opcao.chave || "todos"}
              type="button"
              onClick={() => onMudar(opcao.chave)}
              aria-pressed={selecionada}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-[var(--cz-raio)] border px-4 text-[13.5px] font-semibold transition-colors ${
                selecionada
                  ? "border-[var(--cz-laranja)] bg-[var(--cz-laranja)] text-white"
                  : "border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[var(--cz-texto)] hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-laranja-forte)]"
              }`}
            >
              {opcao.rotulo}
            </button>
          );
        })}
      </div>
      {ativa?.explicacao && (
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--cz-texto-suave)]">
          {ativa.explicacao}
        </p>
      )}
    </section>
  );
}

type TomKpi = "neutro" | "critico" | "alerta" | "bom";

function KpiResponsivo({
  rotulo,
  valor,
  nota,
  icone,
  tom = "neutro",
  className = "",
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  icone: ReactNode;
  tom?: TomKpi;
  className?: string;
}) {
  const aparencia = {
    neutro: {
      casca: "border-[var(--cz-hairline)] bg-[var(--cz-superficie)]",
      icone: "bg-[var(--cz-fundo)] text-[var(--cz-texto-suave)]",
      valor: "text-[var(--cz-texto)]",
    },
    critico: {
      casca: "border-rose-200 bg-rose-50/70",
      icone: "bg-rose-100 text-rose-700",
      valor: "text-rose-800",
    },
    alerta: {
      casca: "border-amber-200 bg-amber-50/70",
      icone: "bg-amber-100 text-amber-800",
      valor: "text-amber-900",
    },
    bom: {
      casca: "border-emerald-200 bg-emerald-50/70",
      icone: "bg-emerald-100 text-emerald-700",
      valor: "text-emerald-800",
    },
  }[tom];

  return (
    <div
      className={`flex min-w-0 items-start gap-2 rounded-[var(--cz-raio-cartao)] border p-3 shadow-[var(--cz-elev-1)] sm:gap-3 sm:p-4 ${aparencia.casca} ${className}`}
    >
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-[var(--cz-raio)] sm:size-10 ${aparencia.icone}`}
      >
        {icone}
      </span>
      <div className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase leading-tight tracking-[0.04em] text-[var(--cz-texto-suave)] sm:text-[11px]">
          {rotulo}
        </span>
        <strong
          className={`cz-valor mt-1 block text-xl leading-none sm:text-[26px] ${aparencia.valor}`}
        >
          {valor}
        </strong>
        {nota && (
          <span className="mt-1 block text-[11px] leading-snug text-[var(--cz-texto-suave)] sm:text-[11px]">
            {nota}
          </span>
        )}
      </div>
    </div>
  );
}

function EstadoCarregando() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Carregando estoque Full…</span>
      <div className="space-y-0 divide-y divide-[var(--cz-hairline)] xl:hidden">
        {[0, 1, 2].map((indice) => (
          <div key={indice} className="animate-pulse p-4">
            <div className="flex gap-3">
              <div className="size-12 shrink-0 rounded-[var(--cz-raio)] bg-[var(--cz-fundo)]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-4/5 rounded bg-[var(--cz-fundo)]" />
                <div className="h-3 w-2/5 rounded bg-[var(--cz-fundo)]" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[0, 1, 2].map((metrica) => (
                <div key={metrica} className="h-14 rounded bg-[var(--cz-fundo)]" />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="hidden xl:block">
        <Esqueleto />
      </div>
    </div>
  );
}

function CardEstoque({ linha }: { linha: Linha }) {
  const esgotado = linha.disponivel === 0;

  return (
    <article className={linha.situacao === "repor" ? "bg-rose-50/20" : undefined}>
      <div className="p-4">
        <div className="flex min-w-0 items-start gap-3">
          <Miniatura src={linha.thumbnail} alt={linha.titulo} tamanho={48} />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--cz-texto)]">
              {linha.titulo}
            </h3>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-[var(--cz-texto-suave)]">
              {linha.sku && <span className="font-mono">SKU: {linha.sku}</span>}
              <span className="font-mono">Cód.: {linha.inventoryId}</span>
            </div>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2">
          <MetricaCard rotulo="Aptas">
            <strong
              className={`text-base font-extrabold tabular-nums ${
                esgotado ? "text-rose-700" : "text-emerald-700"
              }`}
            >
              {inteiro(linha.disponivel)}
            </strong>
          </MetricaCard>
          <MetricaCard rotulo="Cobertura">
            <span
              className={`text-[13px] font-bold leading-tight ${
                linha.cobertura !== null && linha.cobertura <= DIAS_REPOR
                  ? "text-rose-700"
                  : "text-[var(--cz-texto)]"
              }`}
            >
              {linha.rotuloCobertura}
            </span>
          </MetricaCard>
          <MetricaCard rotulo="Situação">
            <SeloSituacao situacao={linha.situacao} compacto />
          </MetricaCard>
        </dl>

        <details className="group mt-3 border-t border-[var(--cz-hairline)] pt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold text-[var(--cz-texto-suave)] transition-colors hover:text-[var(--cz-laranja-forte)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cz-laranja)] [&::-webkit-details-marker]:hidden">
            <span>Mais detalhes</span>
            <span
              aria-hidden
              className="text-lg leading-none text-[var(--cz-laranja-forte)] transition-transform group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 pb-2 pt-2 text-[12.5px] sm:grid-cols-3">
            <Detalhe rotulo="Vendas 30d" valor={`${inteiro(linha.vendas30dUnidades)} un.`} nota={brl(linha.vendas30dReceita)} />
            <Detalhe
              rotulo="Estoque médio"
              valor={linha.estoqueMedio === null ? "—" : `${inteiro(linha.estoqueMedio)} un.`}
            />
            <Detalhe
              rotulo="A caminho"
              valor={linha.transferencia > 0 ? `${inteiro(linha.transferencia)} un.` : "—"}
            />
            <Detalhe rotulo="Não aptas" valor={`${inteiro(linha.naoDisponivel)} un.`} />
            <Detalhe rotulo="Estoque total" valor={`${inteiro(linha.total)} un.`} />
            <Detalhe rotulo="Conta" valor={linha.conta ?? linha.meliAccountId} />
            <Detalhe rotulo="MLB" valor={linha.itemId ?? "—"} mono />
            <Detalhe rotulo="Variação" valor={linha.variationId ?? "—"} mono />
            <Detalhe rotulo="Código do estoque" valor={linha.inventoryId} mono />
            <Detalhe rotulo="Hierarquia 1" valor={linha.hierarquia1 ?? "—"} />
            <Detalhe rotulo="Hierarquia 2" valor={linha.hierarquia2 ?? "—"} />
            <Detalhe
              rotulo="Snapshot"
              valor={tempoRelativo(linha.sincronizadoEm) || linha.sincronizadoEm}
            />
          </dl>
        </details>
      </div>
    </article>
  );
}

function MetricaCard({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[var(--cz-raio)] bg-[var(--cz-fundo)] p-2.5">
      <dt className="text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--cz-texto-fraco)]">
        {rotulo}
      </dt>
      <dd className="mt-1 min-w-0">{children}</dd>
    </div>
  );
}

function Detalhe({
  rotulo,
  valor,
  nota,
  mono = false,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--cz-texto-fraco)]">
        {rotulo}
      </dt>
      <dd
        className={`mt-0.5 break-words font-semibold text-[var(--cz-texto)] ${mono ? "font-mono" : ""}`}
      >
        {valor}
      </dd>
      {nota && <dd className="text-[11px] text-[var(--cz-texto-suave)]">{nota}</dd>}
    </div>
  );
}

function SeloSituacao({
  situacao,
  compacto = false,
}: {
  situacao: SituacaoEstoque;
  compacto?: boolean;
}) {
  const selo = SELO_SITUACAO[situacao];
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full font-bold ${selo.casca} ${
        compacto ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-[11px]"
      }`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${selo.bolinha}`} aria-hidden />
      <span className="truncate">{selo.texto}</span>
    </span>
  );
}

function PaginacaoLocal({
  pagina,
  totalPaginas,
  total,
  porPagina,
  onPagina,
  onPorPagina,
}: {
  pagina: number;
  totalPaginas: number;
  total: number;
  porPagina: number;
  onPagina: (pagina: number) => void;
  onPorPagina: (valor: number) => void;
}) {
  const de = (pagina - 1) * porPagina + 1;
  const ate = Math.min(pagina * porPagina, total);

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--cz-hairline)] bg-[var(--cz-fundo)] px-4 py-3 text-[12.5px] text-[var(--cz-texto-suave)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <span>
        Mostrando <strong className="text-[var(--cz-texto)]">{inteiro(de)}</strong> a{" "}
        <strong className="text-[var(--cz-texto)]">{inteiro(ate)}</strong> de{" "}
        <strong className="text-[var(--cz-texto)]">{inteiro(total)}</strong> itens em Full
      </span>
      <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
        <label className="flex min-h-11 items-center gap-2 font-semibold">
          Por página
          <select
            value={porPagina}
            onChange={(e) => onPorPagina(Number(e.target.value))}
            className="h-11 rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-2 text-[13px] font-semibold text-[var(--cz-texto)]"
          >
            {[25, 50, 100, 200].map((opcao) => (
              <option key={opcao} value={opcao}>
                {opcao}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPagina(pagina - 1)}
            disabled={pagina <= 1}
            className="min-h-11 min-w-11 rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-3 font-semibold transition-colors hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-laranja-forte)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="min-w-14 px-1 text-center font-semibold tabular-nums text-[var(--cz-texto)]">
            {pagina} / {totalPaginas}
          </span>
          <button
            type="button"
            onClick={() => onPagina(pagina + 1)}
            disabled={pagina >= totalPaginas}
            className="min-h-11 min-w-11 rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-3 font-semibold transition-colors hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-laranja-forte)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}

function LinhaEstoque({ l }: { l: Linha }) {
  const esgotado = l.disponivel === 0;

  return (
    <tr
      className={`border-b border-[var(--cz-hairline)] text-[12.5px] transition-colors last:border-b-0 hover:bg-[var(--cz-fundo)] ${
        l.situacao === "repor" ? "bg-rose-50/30" : ""
      }`}
    >
      <td className="py-3 pl-5 pr-3">
        <div className="flex items-center gap-3">
          <Miniatura src={l.thumbnail} alt={l.titulo} tamanho={48} />
          <div className="min-w-0">
            <span className="block truncate font-semibold text-[var(--cz-texto)]" title={l.titulo}>
              {l.titulo}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
              <span className="rounded bg-[var(--cz-fundo)] px-1.5 py-0.5 font-mono text-[var(--cz-texto-suave)]">
                Cód. estoque: {l.inventoryId}
              </span>
              {l.sku && (
                <span className="rounded bg-[var(--cz-fundo)] px-1.5 py-0.5 font-mono text-[var(--cz-texto-suave)]">
                  SKU: {l.sku}
                </span>
              )}
              {l.itemId && <span className="font-mono text-[var(--cz-texto-fraco)]">#{l.itemId}</span>}
              {l.conta && (
                <span className="rounded-full bg-[var(--cz-fundo)] px-2 py-0.5 font-semibold text-[var(--cz-texto-suave)] ring-1 ring-inset ring-[var(--cz-hairline-forte)]">
                  {l.conta}
                </span>
              )}
            </span>
            {(l.hierarquia1 || l.hierarquia2) && (
              <span className="mt-0.5 block truncate text-[10.5px] text-[var(--cz-texto-fraco)]">
                {[l.hierarquia1, l.hierarquia2].filter(Boolean).join(" › ")}
              </span>
            )}
          </div>
        </div>
      </td>

      <td className="bg-emerald-50/40 px-3 py-3 text-right">
        <span
          className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[15px] font-bold tabular-nums ${
            esgotado ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {inteiro(l.disponivel)}
        </span>
        <span className="mt-0.5 block text-[9.5px] uppercase tracking-wide text-emerald-700/70">
          un. aptas
        </span>
      </td>

      <td className="px-3 py-3 text-right tabular-nums">
        <span className="block font-semibold text-[var(--cz-texto)]">
          {inteiro(l.vendas30dUnidades)} un.
        </span>
        <span className="block text-[10.5px] text-[var(--cz-texto-fraco)]">
          {brl(l.vendas30dReceita)}
        </span>
      </td>

      <td className="px-3 py-3 text-right tabular-nums text-[var(--cz-texto-suave)]">
        {l.estoqueMedio === null ? (
          <span className="text-[var(--cz-texto-fraco)]" title="Sem histórico ainda: o primeiro dia é hoje">
            —
          </span>
        ) : (
          `${inteiro(l.estoqueMedio)} un.`
        )}
      </td>

      <td className="px-3 py-3 text-right tabular-nums text-[var(--cz-texto-suave)]">
        {l.transferencia > 0 ? (
          `${inteiro(l.transferencia)} un.`
        ) : (
          <span className="text-[var(--cz-texto-fraco)]">—</span>
        )}
      </td>

      <td className="px-3 py-3 text-right tabular-nums">
        <span
          className={
            l.naoDisponivel > 0
              ? "font-semibold text-rose-600"
              : "text-[var(--cz-texto-fraco)]"
          }
        >
          {inteiro(l.naoDisponivel)} un.
        </span>
      </td>

      <td className="px-3 py-3 text-right">
        <span
          className={`tabular-nums ${
            l.cobertura !== null && l.cobertura <= DIAS_REPOR
              ? "font-semibold text-rose-700"
              : "text-[var(--cz-texto-suave)]"
          }`}
          title={
            l.cobertura === null
              ? "Sem vendas nos últimos 30 dias: não há ritmo para projetar"
              : `${Math.round(l.cobertura)} dia(s) no ritmo dos últimos 30 dias`
          }
        >
          {l.rotuloCobertura}
        </span>
      </td>

      <td className="py-3 pl-3 pr-5">
        <SeloSituacao situacao={l.situacao} />
      </td>
    </tr>
  );
}
