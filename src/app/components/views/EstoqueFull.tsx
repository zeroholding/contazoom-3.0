"use client";

/**
 * Estoque Full — o que está nos centros de distribuição do Mercado Livre.
 *
 * Espelha o painel de "Controle de estoque" do próprio ML (mesmas colunas, mesmo
 * vocabulário) e acrescenta o que falta lá: a COBERTURA em dias, calculada com as
 * vendas dos últimos 30 dias que já estão neste banco.
 *
 * Por que a cobertura é o ponto: "12 unidades" não é uma decisão. Doze unidades
 * num item que vende duas por dia é uma semana de vida; num que vende uma por mês
 * é um ano. O painel do ML mostra o número; esta tela mostra o que fazer com ele.
 *
 * A tabela é uma linha por INVENTÁRIO, não por anúncio: no Full um anúncio com
 * variações (P/M/G) tem estoque separado por variação, e é a variação que acaba.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Aviso,
  BotaoAtualizar,
  Cabecalho,
  CabecalhoTabela,
  Campo,
  CampoBusca,
  Esqueleto,
  Faixa,
  GrupoRecorte,
  Kpi,
  Miniatura,
  MolduraTela,
  MultiSelecao,
  type OpcaoRecorte,
  Paginacao,
  PainelFiltros,
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

/** Os quatro recortes por situação, com a explicação do que fazer em cada um. */
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

const SELO_SITUACAO: Record<SituacaoEstoque, { texto: string; casca: string; bolinha: string }> = {
  parado: { texto: "Parado", casca: "bg-amber-50 text-amber-700", bolinha: "bg-amber-500" },
  repor: { texto: "Repor", casca: "bg-rose-50 text-rose-700", bolinha: "bg-rose-500" },
  alto: { texto: "Estoque alto", casca: "bg-amber-50 text-amber-700", bolinha: "bg-amber-500" },
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
  const [direcao, setDirecao] = useState<"asc" | "desc">("desc");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(50);

  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [sincronizando, setSincronizando] = useState(false);
  const [progresso, setProgresso] = useState<{ atual: number; total: number; texto: string } | null>(
    null,
  );
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

  // Fecha o SSE ao sair da tela. Sem isto a conexão fica aberta e o servidor
  // segue empurrando eventos para um componente que já morreu.
  useEffect(() => {
    return () => {
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, []);

  /**
   * Dispara o sync.
   *
   * O SSE é aberto ANTES do POST, e o POST não é aguardado. É o padrão do
   * projeto, e a ordem importa: o servidor emite o primeiro evento no início do
   * trabalho, e quem assina depois perde tudo o que já passou — o registry de
   * progresso não guarda histórico. Aguardar o POST também não serviria: ele só
   * responde no fim, e o fim pode ser minutos depois.
   */
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
        // Só os eventos DESTE módulo. O canal é por usuário e compartilhado com o
        // sync de vendas; sem este filtro a barra de estoque andaria com o
        // progresso de outra coisa.
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
          // Recarrega sem cache: o número acabou de mudar no banco.
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
      // A conexão cair não significa que o sync falhou — ele roda no servidor de
      // qualquer forma. Só perdemos a barra.
      setProgresso((p) => (p ? { ...p, texto: "Sem conexão de progresso; o sync continua." } : p));
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

  function ordenar(campo: Ordem, dir: "asc" | "desc") {
    setOrdem(campo);
    setDirecao(dir);
    setPagina(1);
  }

  const resumo = dados?.resumo ?? RESUMO_VAZIO;
  const linhas = dados?.linhas ?? [];
  const atualizado = tempoRelativo(resumo.ultimaAtualizacao);
  // A explicação do recorte ativo agora é impressa pelo próprio `GrupoRecorte`,
  // então não é mais preciso achar a opção aqui.
  const temFiltro = Boolean(
    buscaAplicada ||
      contas.length ||
      skus.length ||
      situacao ||
      estoque ||
      hierarquia1 ||
      hierarquia2,
  );

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
        <Faixa tom="bom" icone={<IconeAtualizar className="h-4 w-4 animate-spin" />}>
          {progresso.texto}
        </Faixa>
      )}

      {(dados?.backfillPendente ?? 0) > 0 && (
        <Faixa tom="info" icone={<IconeInfo className="h-4 w-4" />}>
          <strong>{inteiro(dados!.backfillPendente)} venda(s)</strong> ainda estão sendo
          associadas à variação do anúncio. Até terminar, a coluna{" "}
          <strong>Vendas 30d</strong> pode estar incompleta em anúncios com variação, e a
          cobertura desses itens sai maior do que a real. O preenchimento é automático a
          cada carregamento desta tela e não consome a API do Mercado Livre.
        </Faixa>
      )}

      {/* Recorte por situação: é o eixo da tela, então fica acima dos filtros.
          Pelo `GrupoRecorte` do kit — que também tirou daqui o verde da pastilha
          ativa, e nesta tela o verde é justamente o selo "Saudável". */}
      <GrupoRecorte
        opcoes={SITUACOES}
        valor={situacao}
        onMudar={(chave) => {
          setSituacao(chave);
          setPagina(1);
        }}
      />

      <PainelFiltros>
        <CampoBusca
          valor={busca}
          onMudar={setBusca}
          onAplicar={() => {
            setBuscaAplicada(busca);
            setPagina(1);
          }}
          placeholder="Título, SKU, código do estoque ou MLB"
          className="lg:col-span-4"
        />

        {/* Conta em MULTI-seleção: o `contas` da API sempre foi uma lista, mas o
            `<select>` só sabia mandar um item, então "estas duas contas" era uma
            pergunta que o back respondia e a tela não sabia fazer. */}
        <MultiSelecao
          className="lg:col-span-3"
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

        {/* SKU selecionável, não digitado.
            A busca livre ao lado acha UM item quando se sabe parte do texto; este
            filtro responde outra pergunta: "quanto tenho em Full destes cinco
            produtos". Com busca, seriam cinco consultas separadas — e nenhuma
            delas daria o total somado dos cinco, que é o que os cartões do topo
            passam a mostrar. A lista vem ordenada por estoque disponível, então os
            primeiros códigos são os que têm mercadoria. */}
        <MultiSelecao
          className="lg:col-span-4"
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

        <Campo rotulo="Estoque" className="lg:col-span-2">
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

        <Campo rotulo="Hierarquia 1" className="lg:col-span-3">
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

        <Campo rotulo="Hierarquia 2" className="lg:col-span-3">
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
      </PainelFiltros>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-7">
        <Kpi
          rotulo="Itens no Full"
          valor={inteiro(resumo.itens)}
          icone={<IconeCaixas className="h-5 w-5" />}
        />
        <Kpi
          rotulo="Vendas 30 dias"
          valor={`${inteiro(resumo.vendasUnidades)} un.`}
          nota={brl(resumo.vendasReceita)}
          icone={<IconeSubindo className="h-5 w-5" />}
        />
        <Kpi
          rotulo="Aptas p/ venda"
          valor={inteiro(resumo.aptas)}
          destaque
          icone={<IconeCerto className="h-5 w-5" />}
        />
        <Kpi
          rotulo="A caminho"
          valor={inteiro(resumo.aCaminho)}
          icone={<IconeCaminhao className="h-5 w-5" />}
        />
        <Kpi
          rotulo="Não aptas"
          valor={inteiro(resumo.naoAptas)}
          tom={resumo.naoAptas > 0 ? "alerta" : undefined}
          icone={<IconeProibido className="h-5 w-5" />}
        />
        <Kpi
          rotulo="A repor"
          valor={inteiro(resumo.aRepor)}
          tom={resumo.aRepor > 0 ? "critico" : undefined}
          nota="acaba em 2 semanas"
          icone={<IconeAlerta className="h-5 w-5" />}
        />
        <Kpi
          rotulo="Parados"
          valor={inteiro(resumo.parados)}
          tom={resumo.parados > 0 ? "alerta" : undefined}
          nota="sem venda em 30d"
          icone={<IconePausa className="h-5 w-5" />}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]">
        {carregando ? (
          <Esqueleto />
        ) : erro ? (
          <Aviso
            icone={<IconeAlerta className="h-6 w-6" />}
            titulo="Erro ao carregar"
            texto={erro}
          />
        ) : dados?.nuncaSincronizou ? (
          /* Distingue "nunca sincronizou" de "filtro sem resultado". O projeto
             irmão mostra a mesma mensagem nos dois casos e manda sincronizar
             quando bastava limpar o filtro. */
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse text-left">
              <CabecalhoTabela>
                <Th className="pl-5">Produto</Th>
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
                {linhas.map((l) => (
                  <LinhaEstoque key={l.inventoryId} l={l} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {dados && dados.total > 0 && !dados.nuncaSincronizou && (
          <Paginacao
            pagina={dados.pagina}
            totalPaginas={dados.totalPaginas}
            total={dados.total}
            porPagina={porPagina}
            onPagina={setPagina}
            onPorPagina={(v) => {
              setPorPagina(v);
              setPagina(1);
            }}
            rotulo="itens em Full"
            opcoesPorPagina={[25, 50, 100, 200]}
          />
        )}
      </div>

      <p className="mt-4 max-w-4xl text-[11.5px] leading-relaxed text-[var(--cz-texto-suave)]">
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

function LinhaEstoque({ l }: { l: Linha }) {
  const selo = SELO_SITUACAO[l.situacao];
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
              {/* O "código do estoque" é como o ML chama o inventory_id no painel
                  dele. Usar o mesmo nome evita a pergunta "que código é esse?". */}
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

      {/* Aptas: a métrica que a tela existe para mostrar, então é a única com
          fundo próprio e corpo maior. */}
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
        <span className="block text-[10.5px] text-[var(--cz-texto-fraco)]">{brl(l.vendas30dReceita)}</span>
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
        {l.transferencia > 0 ? `${inteiro(l.transferencia)} un.` : <span className="text-[var(--cz-texto-fraco)]">—</span>}
      </td>

      <td className="px-3 py-3 text-right tabular-nums">
        <span className={l.naoDisponivel > 0 ? "font-semibold text-rose-600" : "text-[var(--cz-texto-fraco)]"}>
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
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${selo.casca}`}
        >
          <span className={`size-1.5 rounded-full ${selo.bolinha}`} aria-hidden />
          {selo.texto}
        </span>
      </td>
    </tr>
  );
}
