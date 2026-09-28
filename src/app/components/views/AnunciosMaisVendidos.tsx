"use client";

import { useMemo, useRef, useState } from "react";

import { useAoSincronizarVendas } from "@/hooks/useAoSincronizarVendas";
import {
  Aviso,
  AvisoBackfill,
  AvisoDoisTempos,
  BotaoAtualizar,
  Cabecalho,
  CabecalhoTabela,
  CelulaAgora,
  CelulaAnuncio,
  Campo,
  Esqueleto,
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
import { CampoBusca, Faixa, Miniatura, Selo } from "./comum/shell";
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
            <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2 xl:hidden" role="list" aria-label="Anúncios mais vendidos">
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
