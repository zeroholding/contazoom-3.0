"use client";

import { useMemo, useRef, useState } from "react";

import { CampoDaFolha, GrupoDePilulas } from "@/components/ui/FiltrosSheet";
import { useAoSincronizarVendas } from "@/hooks/useAoSincronizarVendas";
import { useCelular } from "@/hooks/useMediaQuery";
import {
  Aviso,
  AvisoBackfill,
  AvisoDoisTempos,
  BotaoAtualizar,
  Cabecalho,
  CabecalhoTabela,
  CartaoAnuncioCelular,
  CelulaAgora,
  CelulaAnuncio,
  Campo,
  Esqueleto,
  FiltrosAnuncioCelular,
  Kpi,
  LinkAbrir,
  MolduraTela,
  NotaFiltroCaro,
  Paginacao,
  PainelFiltros,
  RodapeFonte,
  SeloEnvio,
  SeloStatus,
  Th,
  ThGrupo,
  UltimaVenda,
} from "./anuncios/comum";
import { CaixaBusca, CampoBusca, Faixa, Miniatura, Selo } from "./comum/shell";
import type { ChipFiltro } from "./comum/filtros";
import {
  IconeAlerta,
  IconeCaixa,
  IconeDinheiro,
  IconePreco,
  IconeProibido,
  IconeSubindo,
} from "./comum/icones";
import { LogoCanal, SeletorCanalLogos } from "./comum/logos";
import {
  brl,
  ENTRADA,
  inteiro,
  RESUMO_VAZIO,
  type CanalFiltroAnuncio,
  type Linha,
} from "./anuncios/tipos";
import { useAnuncios, useContas } from "./anuncios/useAnuncios";

function diasDeCobertura(l: Linha, diasDoPeriodo: number): number | null {
  if (l.estoque === null || l.estoque === 0) return null;
  if (diasDoPeriodo <= 0 || l.unidades <= 0) return null;
  const porDia = l.unidades / diasDoPeriodo;
  if (porDia <= 0) return null;
  return Math.floor(l.estoque / porDia);
}

function CoberturaEstoque({ l, diasDoPeriodo }: { l: Linha; diasDoPeriodo: number }) {
  const cobertura = diasDeCobertura(l, diasDoPeriodo);

  if (l.estoque === 0) {
    return (
      <Selo tom="critico">
        <IconeProibido className="h-3.5 w-3.5" />
        esgotado
      </Selo>
    );
  }
  if (cobertura === null) {
    return <span className="text-[var(--cz-texto-fraco)]">—</span>;
  }
  return (
    <Selo
      tom={cobertura <= 7 ? "critico" : cobertura <= 21 ? "alerta" : "neutro"}
      className="tabular-nums"
      titulo={`No ritmo do período, o estoque atual dura cerca de ${cobertura} dia(s)`}
    >
      {cobertura <= 90 ? `${inteiro(cobertura)} d` : "90+ d"}
    </Selo>
  );
}

export default function AnunciosMaisVendidos() {
  const [canal, setCanal] = useState<CanalFiltroAnuncio>("todos");
  const [busca, setBusca] = useState("");
  const buscaRef = useRef("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [contaId, setContaId] = useState("");
  const [status, setStatus] = useState("");
  const [estoque, setEstoque] = useState("");
  const [janelaDias, setJanelaDias] = useState(30);
  const [ordem, setOrdem] = useState("unidades_desc");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(20);

  const todasContas = useContas();
  const contas = useMemo(
    () => todasContas.filter((c) => canal === "todos" || c.canal === canal),
    [todasContas, canal],
  );

  const { dados, carregando, erro, atualizando, atualizar } = useAnuncios({
    modo: "mais_vendidos",
    canal,
    janelaDias,
    busca: buscaAplicada,
    contaId,
    status,
    estoque,
    ordem,
    pagina,
    porPagina,
  });

  useAoSincronizarVendas(() => {
    void atualizar();
  });

  const resumo = dados?.resumo ?? RESUMO_VAZIO;
  const linhas = useMemo(() => dados?.linhas ?? [], [dados]);
  const diasDoPeriodo = janelaDias > 0 ? janelaDias : 0;

  // Celular: o que está LIGADO dentro da folha. Alimenta o número do botão "Filtros"
  // e os chips, que são a única pista de que a lista está filtrada com a folha fechada.
  const celular = useCelular();
  const contaEscolhida = contas.find((c) => `${c.canal}:${c.id}` === contaId);
  const chips: ChipFiltro[] = [];
  if (contaId) {
    chips.push({
      chave: "conta",
      grupo: "Conta",
      rotulo: contaEscolhida?.nome ?? contaId,
      remover: () => {
        setContaId("");
        setPagina(1);
      },
    });
  }
  if (status) {
    chips.push({
      chave: "status",
      grupo: "Situação",
      rotulo: ROTULO_SITUACAO_ML[status] ?? status,
      remover: () => {
        setStatus("");
        setPagina(1);
      },
    });
  }
  if (estoque) {
    chips.push({
      chave: "estoque",
      grupo: "Estoque",
      rotulo: estoque === "sem" ? "Esgotado" : "Com estoque",
      remover: () => {
        setEstoque("");
        setPagina(1);
      },
    });
  }
  if (ordem !== "unidades_desc") {
    chips.push({
      chave: "ordem",
      grupo: "Ordem",
      rotulo: ORDENS_RANKING.find((o) => o.chave === ordem)?.rotulo ?? ordem,
      remover: () => {
        setOrdem("unidades_desc");
        setPagina(1);
      },
    });
  }

  function limparFolha() {
    setContaId("");
    setStatus("");
    setEstoque("");
    setOrdem("unidades_desc");
    setPagina(1);
  }

  function mudarBusca(valor: string) {
    buscaRef.current = valor;
    setBusca(valor);
  }

  function aplicarBusca() {
    // CaixaBusca limpa e aplica no mesmo evento. A ref já contém "" quando a
    // aplicação ocorre, evitando que a closure recoloque o termo anterior.
    setBuscaAplicada(buscaRef.current);
    setPagina(1);
  }

  function trocarCanal(proximo: CanalFiltroAnuncio) {
    setCanal(proximo);
    const contaAtual = todasContas.find((c) => `${c.canal}:${c.id}` === contaId);
    if (contaId && (!contaAtual || (proximo !== "todos" && contaAtual.canal !== proximo))) {
      setContaId("");
    }
    setStatus("");
    setEstoque("");
    setPagina(1);
  }

  return (
    <MolduraTela>
      <Cabecalho
        titulo="Anúncios Mais Vendidos"
        descricao="Encontre os campeões de venda, compare canais e antecipe rupturas sem perder o contexto de estoque e faturamento."
        acao={
          <BotaoAtualizar
            onClick={atualizar}
            atualizando={atualizando}
            desabilitado={carregando}
          />
        }
      />

      <AvisoBackfill pendentes={dados?.backfillPendente ?? 0} />

      {dados?.truncado && (
        <Faixa tom="alerta" icone={<IconeAlerta className="h-4 w-4" />}>
          <strong>Atenção:</strong> o ranking atingiu 10.000 anúncios em ao menos um
          canal. Estreite período, conta ou busca; os totais não são completos.
        </Faixa>
      )}

      {celular ? (
        <>
          <CanaisCelular valor={canal} onMudar={trocarCanal} />

          <FiltrosAnuncioCelular
            busca={
              <CaixaBusca
                valor={busca}
                onMudar={mudarBusca}
                onAplicar={aplicarBusca}
                placeholder="ID, título ou SKU"
                rotuloAcessivel="Buscar anúncios"
              />
            }
            destaque={
              <select
                aria-label="Período"
                value={janelaDias}
                onChange={(e) => {
                  setJanelaDias(Number(e.target.value));
                  setPagina(1);
                }}
                className={ENTRADA}
              >
                <option value={7}>Últimos 7 dias</option>
                <option value={30}>Últimos 30 dias</option>
                <option value={90}>Últimos 90 dias</option>
                <option value={365}>Último ano</option>
                <option value={0}>Desde sempre</option>
              </select>
            }
            ativos={chips.length}
            onLimpar={limparFolha}
            chips={chips}
          >
            <CampoDaFolha rotulo="Conta">
              <select
                aria-label="Conta"
                value={contaId}
                onChange={(e) => {
                  setContaId(e.target.value);
                  setPagina(1);
                }}
                className={ENTRADA}
              >
                <option value="">Todas as contas</option>
                {contas.map((c) => (
                  <option key={`${c.canal}:${c.id}`} value={`${c.canal}:${c.id}`}>
                    {c.nome} · {c.canal === "ML" ? "Mercado Livre" : c.canal === "SP" ? "Shopee" : "TikTok Shop"}
                  </option>
                ))}
              </select>
            </CampoDaFolha>

            <CampoDaFolha rotulo="Ordenar por">
              <GrupoDePilulas
                rotulo="Ordenar por"
                opcoes={ORDENS_RANKING.map((o) => ({ id: o.chave, rotulo: o.rotulo }))}
                estaAtiva={(id) => ordem === id}
                onEscolher={(id) => {
                  setOrdem(id);
                  setPagina(1);
                }}
              />
            </CampoDaFolha>

            {canal === "ML" && (
              <>
                <CampoDaFolha rotulo="Situação no ML">
                  <GrupoDePilulas
                    rotulo="Situação no ML"
                    opcoes={[{ id: "", rotulo: "Todas" }, ...Object.entries(ROTULO_SITUACAO_ML).map(([id, rotulo]) => ({ id, rotulo }))]}
                    estaAtiva={(id) => status === id}
                    onEscolher={(id) => {
                      setStatus(id);
                      setPagina(1);
                    }}
                  />
                </CampoDaFolha>

                <CampoDaFolha rotulo="Estoque">
                  <GrupoDePilulas
                    rotulo="Estoque"
                    opcoes={[
                      { id: "", rotulo: "Todos" },
                      { id: "sem", rotulo: "Esgotado" },
                      { id: "com", rotulo: "Com estoque" },
                    ]}
                    estaAtiva={(id) => estoque === id}
                    onEscolher={(id) => {
                      setEstoque(id);
                      setPagina(1);
                    }}
                  />
                </CampoDaFolha>
              </>
            )}
          </FiltrosAnuncioCelular>
          <NotaFiltroCaro visivel={Boolean(status || estoque)} />
        </>
      ) : (
      <>
      <section className="mt-5" aria-labelledby="canal-ranking">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="canal-ranking" className="text-[13px] font-extrabold text-[var(--cz-texto)]">
              Canal do ranking
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--cz-texto-suave)]">
              Selecione uma marca ou compare as três juntas.
            </p>
          </div>
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--cz-laranja-forte)]">
            seleção por canal
          </span>
        </div>
        <SeletorCanalLogos valor={canal} onMudar={trocarCanal} />
      </section>

      <PainelFiltros nota={<NotaFiltroCaro visivel={Boolean(status || estoque)} />}>
        <CampoBusca
          valor={busca}
          onMudar={mudarBusca}
          onAplicar={aplicarBusca}
          placeholder="ID, título ou SKU"
          className="lg:col-span-4"
        />

        <Campo rotulo="Conta" className="lg:col-span-3">
          <select
            value={contaId}
            onChange={(e) => {
              setContaId(e.target.value);
              setPagina(1);
            }}
            className={ENTRADA}
          >
            <option value="">Todas as contas</option>
            {contas.map((c) => (
              <option key={`${c.canal}:${c.id}`} value={`${c.canal}:${c.id}`}>
                {c.nome} · {c.canal === "ML" ? "Mercado Livre" : c.canal === "SP" ? "Shopee" : "TikTok Shop"}
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Período" className="lg:col-span-2">
          <select
            value={janelaDias}
            onChange={(e) => {
              setJanelaDias(Number(e.target.value));
              setPagina(1);
            }}
            className={ENTRADA}
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
            <option value={365}>Último ano</option>
            <option value={0}>Desde sempre</option>
          </select>
        </Campo>

        <Campo rotulo="Ordenar por" className="lg:col-span-3">
          <select
            value={ordem}
            onChange={(e) => {
              setOrdem(e.target.value);
              setPagina(1);
            }}
            className={ENTRADA}
          >
            <option value="unidades_desc">Mais unidades vendidas</option>
            <option value="faturamento_desc">Maior faturamento</option>
          </select>
        </Campo>

        {canal === "ML" && (
          <>
            <Campo rotulo="Situação no ML" className="lg:col-span-3">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPagina(1);
                }}
                className={ENTRADA}
              >
                <option value="">Todas</option>
                <option value="active">Ativo</option>
                <option value="paused">Pausado</option>
                <option value="closed">Finalizado</option>
                <option value="under_review">Em revisão</option>
              </select>
            </Campo>

            <Campo rotulo="Estoque" className="lg:col-span-3">
              <select
                value={estoque}
                onChange={(e) => {
                  setEstoque(e.target.value);
                  setPagina(1);
                }}
                className={ENTRADA}
              >
                <option value="">Todos</option>
                <option value="sem">Esgotado</option>
                <option value="com">Com estoque</option>
              </select>
            </Campo>
          </>
        )}
      </PainelFiltros>
      </>
      )}

      <section aria-label="Resumo do ranking" className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi
          rotulo="Anúncios com venda"
          valor={inteiro(resumo.anuncios)}
          icone={<IconeSubindo className="h-5 w-5" />}
        />
        <Kpi
          rotulo="Unidades vendidas"
          valor={inteiro(resumo.unidades)}
          icone={<IconeCaixa className="h-5 w-5" />}
        />
        <div className="col-span-2 lg:col-span-1">
          <Kpi
            rotulo="Faturamento"
            valor={brl(resumo.faturamento)}
            destaque
            icone={<IconeDinheiro className="h-5 w-5" />}
          />
        </div>
        <Kpi
          rotulo="Ticket por unidade"
          valor={brl(resumo.unidades > 0 ? resumo.faturamento / resumo.unidades : 0)}
          icone={<IconePreco className="h-5 w-5" />}
        />
        {(canal === "ML" || canal === "todos") && (
          <Kpi
            rotulo={canal === "todos" ? "Esgotados (ML)" : "Esgotados"}
            valor={inteiro(resumo.semEstoque)}
            tom={resumo.semEstoque > 0 ? "alerta" : undefined}
            icone={<IconeProibido className="h-5 w-5" />}
            nota={
              resumo.escopoEstoque === "pagina"
                ? `de ${inteiro(resumo.estoqueConsultados)} ML nesta página`
                : `de ${inteiro(resumo.estoqueConsultados)} ML no total`
            }
          />
        )}
      </section>

      {(canal === "ML" || canal === "todos") && resumo.semEstoque > 0 && (
        <Faixa tom="critico" icone={<IconeProibido className="h-4 w-4" />}>
          <strong>{inteiro(resumo.semEstoque)}</strong> anúncio(s) com venda estão
          esgotados. Priorize a reposição dos primeiros colocados para recuperar receita.
        </Faixa>
      )}

      <AvisoDoisTempos contexto={canal === "ML" ? "ML" : canal === "todos" ? "todos" : "sem-ml"} />

      <section className="mt-3 overflow-hidden rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]" aria-label="Resultado do ranking">
        {carregando ? (
          <Esqueleto />
        ) : erro ? (
          <Aviso
            icone={<IconeAlerta className="h-6 w-6" />}
            titulo="Erro ao carregar"
            texto={erro}
          />
        ) : linhas.length === 0 ? (
          <Aviso
            icone={<IconeSubindo className="h-6 w-6" />}
            titulo="Nenhuma venda no período"
            texto="Amplie o período, solte o filtro de conta, ou sincronize as vendas se ainda não sincronizou."
          />
        ) : (
          <>
            {/* Celular: fundo cinza claro, para o cartão branco se destacar da seção. */}
            <div className="grid grid-cols-1 gap-3 p-3 max-md:bg-[var(--cz-fundo)] md:grid-cols-2 xl:hidden" role="list" aria-label="Anúncios mais vendidos">
              {linhas.map((l, i) => (
                <CardVendido
                  key={`${l.canal}:${l.accountId}:${l.itemId}`}
                  l={l}
                  posicao={(dados!.pagina - 1) * porPagina + i + 1}
                  diasDoPeriodo={diasDoPeriodo}
                />
              ))}
            </div>

            <div className="hidden xl:block">
              <table className="w-full table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-[42%]" />
                  <col className="w-[19%]" />
                  <col className="w-[14%]" />
                  <col className="w-[15%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <CabecalhoTabela>
                  <Th className="pl-5">Anúncio</Th>
                  <ThGrupo
                    titulo="Situação / Estoque / Preço"
                    momento={canal === "ML" ? "agora no Mercado Livre" : "quando disponível"}
                  />
                  <ThGrupo titulo="Cobertura" momento="estoque ÷ ritmo do período" align="right" />
                  <ThGrupo titulo="Vendas" momento="no período filtrado" align="right" />
                  <ThGrupo titulo="Última venda" momento="data e hora" align="right" className="pr-5" />
                </CabecalhoTabela>
                <tbody>
                  {linhas.map((l, i) => (
                    <LinhaVendida
                      key={`${l.canal}:${l.accountId}:${l.itemId}`}
                      l={l}
                      posicao={(dados!.pagina - 1) * porPagina + i + 1}
                      diasDoPeriodo={diasDoPeriodo}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {dados && dados.total > 0 && (
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
          />
        )}
      </section>

      <RodapeFonte contexto={canal === "ML" ? "ML" : canal === "todos" ? "todos" : "sem-ml"} />
    </MolduraTela>
  );
}

function CardVendido({ l, posicao, diasDoPeriodo }: { l: Linha; posicao: number; diasDoPeriodo: number }) {
  const esgotado = l.estoque === 0;
  const celular = useCelular();

  // Celular: o cartão compartilhado com Anúncios Mortos (foto, título em duas linhas,
  // selos e quatro métricas em 2×2). No Mercado Livre entram o estoque e o preço de
  // AGORA; nos outros canais, que não têm esses dados, pedidos e ticket médio.
  if (celular) {
    const ml = l.canal === "ML";
    return (
      <CartaoAnuncioCelular
        l={l}
        posicao={posicao}
        alerta={esgotado}
        selos={
          <>
            {ml && <SeloStatus status={l.status} />}
            {l.logisticType && <SeloEnvio tipo={l.logisticType} />}
            {ml && (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--cz-texto-suave)]">
                Cobertura
                <CoberturaEstoque l={l} diasDoPeriodo={diasDoPeriodo} />
              </span>
            )}
          </>
        }
        metricas={
          ml
            ? [
                { rotulo: "Unidades", valor: inteiro(l.unidades), nota: `${inteiro(l.pedidos)} pedido(s)` },
                { rotulo: "Faturamento", valor: brl(l.faturamento), tom: "bom" },
                {
                  rotulo: "Estoque agora",
                  valor: l.estoque === null ? "—" : `${inteiro(l.estoque)} un.`,
                  tom: esgotado ? "critico" : undefined,
                },
                { rotulo: "Preço agora", valor: l.preco === null ? "—" : brl(l.preco) },
              ]
            : [
                { rotulo: "Unidades", valor: inteiro(l.unidades) },
                { rotulo: "Faturamento", valor: brl(l.faturamento), tom: "bom" },
                { rotulo: "Pedidos", valor: inteiro(l.pedidos) },
                { rotulo: "Ticket médio", valor: brl(l.ticketMedio) },
              ]
        }
      />
    );
  }

  return (
    <article
      role="listitem"
      className={`min-w-0 rounded-[var(--cz-raio-cartao)] border p-3.5 ${
        esgotado
          ? "border-rose-200 bg-rose-50/40"
          : "border-[var(--cz-hairline)] bg-[var(--cz-superficie)]"
      }`}
    >
      <header className="flex min-w-0 items-start gap-3">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-extrabold tabular-nums ${
            posicao <= 3 ? "bg-emerald-100 text-emerald-800" : "bg-[var(--cz-fundo)] text-[var(--cz-texto-suave)]"
          }`}
          aria-label={`Posição ${posicao}`}
        >
          {posicao}
        </span>
        <Miniatura src={l.thumbnailUrl} alt={l.titulo} tamanho={56} />
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-[14px] font-bold leading-snug text-[var(--cz-texto)]">{l.titulo}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--cz-texto-suave)]">
            <span className="inline-flex items-center gap-1.5 rounded bg-[var(--cz-fundo)] px-1.5 py-0.5 font-mono font-semibold">
              <LogoCanal canal={l.canal} />
              {l.itemId}
            </span>
            <span className="truncate">{l.conta || l.accountId}</span>
            {l.logisticType && <SeloEnvio tipo={l.logisticType} />}
          </div>
        </div>
        <LinkAbrir l={l} />
      </header>

      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--cz-raio)] border border-[var(--cz-hairline)] bg-[var(--cz-hairline)] sm:grid-cols-4">
        <MetricaCard rotulo="Unidades" valor={inteiro(l.unidades)} destaque />
        <MetricaCard rotulo="Faturamento" valor={brl(l.faturamento)} positivo />
        <MetricaCard rotulo="Pedidos" valor={inteiro(l.pedidos)} />
        <div className="bg-[var(--cz-fundo)] p-2.5">
          <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--cz-texto-fraco)]">Cobertura</span>
          <span className="mt-1.5 inline-flex"><CoberturaEstoque l={l} diasDoPeriodo={diasDoPeriodo} /></span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-[var(--cz-hairline)] pt-3">
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--cz-texto-fraco)]">Agora</span>
          {l.canal === "ML" ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <SeloStatus status={l.status} />
              <span className={`text-[12px] font-bold tabular-nums ${esgotado ? "text-rose-700" : "text-[var(--cz-texto)]"}`}>
                {l.estoque === null ? "estoque —" : `${inteiro(l.estoque)} un.`}
              </span>
              <span className="text-[var(--cz-texto-fraco)]">·</span>
              <span className="text-[12px] tabular-nums text-[var(--cz-texto-suave)]">{l.preco === null ? "preço —" : brl(l.preco)}</span>
            </div>
          ) : (
            <p className="mt-1 text-[11.5px] text-[var(--cz-texto-suave)]">Dados atuais não disponíveis neste canal.</p>
          )}
        </div>
        <div className="text-right">
          <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--cz-texto-fraco)]">Última venda</span>
          <span className="mt-1 block"><UltimaVenda iso={l.ultimaVenda} /></span>
        </div>
      </div>

      {l.skus.length > 0 && (
        <p className="mt-2 truncate font-mono text-[10.5px] text-[var(--cz-texto-fraco)]" title={l.skus.join(" · ")}>
          SKU {l.skus.join(" · ")}
        </p>
      )}
    </article>
  );
}

function MetricaCard({ rotulo, valor, destaque = false, positivo = false }: { rotulo: string; valor: string; destaque?: boolean; positivo?: boolean }) {
  return (
    <div className="bg-[var(--cz-fundo)] p-2.5">
      <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--cz-texto-fraco)]">{rotulo}</span>
      <span className={`mt-1 block tabular-nums ${destaque ? "text-[17px] font-extrabold" : "text-[13px] font-bold"} ${positivo ? "text-emerald-700" : "text-[var(--cz-texto)]"}`}>
        {valor}
      </span>
    </div>
  );
}

function LinhaVendida({ l, posicao, diasDoPeriodo }: { l: Linha; posicao: number; diasDoPeriodo: number }) {
  const esgotado = l.estoque === 0;

  return (
    <tr className={`border-b border-[var(--cz-hairline)] align-top text-[13.5px] transition-colors last:border-b-0 hover:bg-[var(--cz-fundo)] ${esgotado ? "bg-rose-50/40" : ""}`}>
      <CelulaAnuncio l={l} posicao={posicao} />
      <CelulaAgora l={l} />
      <td className="px-3 py-3.5 text-right"><CoberturaEstoque l={l} diasDoPeriodo={diasDoPeriodo} /></td>
      <td className="px-3 py-3.5 text-right">
        <span className="block text-[16px] font-bold leading-none tabular-nums text-[var(--cz-texto)]">
          {inteiro(l.unidades)}
          <span className="ml-1 text-[11px] font-medium text-[var(--cz-texto-fraco)]">un.</span>
        </span>
        <span className="mt-1 block font-semibold tabular-nums text-emerald-700">{brl(l.faturamento)}</span>
        <span className="mt-0.5 block text-[11px] tabular-nums text-[var(--cz-texto-suave)]">{inteiro(l.pedidos)} pedido(s)</span>
      </td>
      <td className="px-3 py-3.5 pr-5 text-right">
        <UltimaVenda iso={l.ultimaVenda} />
        <span className="mt-1.5 inline-flex"><LinkAbrir l={l} /></span>
      </td>
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Celular                                   */
/* -------------------------------------------------------------------------- */

const ROTULO_SITUACAO_ML: Record<string, string> = {
  active: "Ativo",
  paused: "Pausado",
  closed: "Finalizado",
  under_review: "Em revisão",
};

const ORDENS_RANKING: ReadonlyArray<{ chave: string; rotulo: string }> = [
  { chave: "unidades_desc", rotulo: "Mais unidades vendidas" },
  { chave: "faturamento_desc", rotulo: "Maior faturamento" },
];

/**
 * O canal do ranking numa linha que rola, com o logo de cada marca.
 *
 * O seletor do desktop (`SeletorCanalLogos`) tem quatro botões de 56px em duas
 * linhas, mais título, legenda e um "SELEÇÃO POR CANAL" — uns 200px de altura só
 * para escolher entre quatro opções. Aqui a escolha é uma faixa de 44px, e o
 * logo continua sendo o que identifica o canal.
 */
function CanaisCelular({
  valor,
  onMudar,
}: {
  valor: CanalFiltroAnuncio;
  onMudar: (canal: CanalFiltroAnuncio) => void;
}) {
  const opcoes: ReadonlyArray<{ chave: CanalFiltroAnuncio; rotulo: string }> = [
    { chave: "todos", rotulo: "Todos os canais" },
    { chave: "ML", rotulo: "Mercado Livre" },
    { chave: "SP", rotulo: "Shopee" },
    { chave: "TT", rotulo: "TikTok Shop" },
  ];

  return (
    <div className="cz-hscroll cz-hscroll-sangra mt-5 pb-0.5" role="group" aria-label="Canal do ranking">
      {opcoes.map((o) => {
        const ativo = o.chave === valor;
        return (
          <button
            key={o.chave}
            type="button"
            aria-pressed={ativo}
            onClick={() => onMudar(o.chave)}
            className={`inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[var(--cz-raio)] border px-3.5 text-[14px] font-semibold transition-colors ${
              ativo
                ? "border-[var(--cz-laranja)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]"
                : "border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[var(--cz-texto)]"
            }`}
          >
            {o.chave !== "todos" && <LogoCanal canal={o.chave} />}
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
