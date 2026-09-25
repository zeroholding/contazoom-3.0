"use client";

/**
 * Anúncios Mortos — o que já vendeu bem e parou, com o estoque real.
 *
 * A pergunta desta tela é sobre o PASSADO: o que dava dinheiro e não dá mais.
 * Por isso ela olha o histórico inteiro e não os últimos 30 dias — o que
 * qualifica um anúncio aqui é justamente ter vendido bem ANTES de parar, e uma
 * janela curta esconderia exatamente os casos que interessam.
 *
 * O QUE ESTA TELA FAZ E A DO CONCORRENTE NÃO
 *
 * Separa o MOTIVO da parada. Anúncio parado por estoque zerado é problema de
 * reposição: volta a vender sozinho quando a mercadoria chega, e mexer no anúncio
 * não resolve nada. Anúncio parado COM estoque na prateleira é problema do
 * anúncio: preço, título, foto, concorrência, posição na busca.
 *
 * São duas filas de trabalho para pessoas diferentes. Jogar as duas na mesma
 * lista chamada "mortos" faz a pessoa abrir o anúncio, mexer no título, e o
 * anúncio continuar parado porque o problema era que não havia o que vender.
 */

import { useMemo, useState } from "react";

import {
  Aviso,
  AvisoBackfill,
  AvisoDoisTempos,
  BotaoAtualizar,
  Cabecalho,
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
  UltimaVenda,
} from "./anuncios/comum";
import {
  CampoBusca,
  Faixa,
  GrupoRecorte,
  Miniatura,
  Selo,
  type OpcaoRecorte,
} from "./comum/shell";
import {
  IconeAlerta,
  IconeCaixa,
  IconeDescendo,
  IconeEditar,
  IconeInfo,
  IconePausa,
  IconeProibido,
  IconeRelogio,
} from "./comum/icones";
import {
  brl,
  ENTRADA,
  inteiro,
  motivoDeParada,
  RESUMO_VAZIO,
  type Linha,
} from "./anuncios/tipos";
import { useAnuncios, useContasMeli } from "./anuncios/useAnuncios";

/** Os três recortes por motivo. Mapeiam para o filtro `estoque` da API. */
const RECORTES: ReadonlyArray<OpcaoRecorte<string>> = [
  {
    chave: "",
    rotulo: "Todos os parados",
    explicacao: "Tudo que vendia e parou, sem separar o motivo.",
  },
  {
    chave: "com",
    rotulo: "Com estoque",
    explicacao:
      "Tem mercadoria e não vende. Aqui o problema é o anúncio: preço, título, foto, concorrência.",
  },
  {
    chave: "sem",
    rotulo: "Sem estoque",
    explicacao:
      "Parou porque acabou. Aqui o problema é reposição — mexer no anúncio não resolve.",
  },
];

const MODULO_CRITERIO =
  "rounded-[var(--cz-raio)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-3 shadow-sm";
const MODULO_CARD =
  "rounded-[var(--cz-raio)] border border-[var(--cz-hairline)] bg-[var(--cz-fundo)] p-3";

export default function AnunciosMortos() {
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [contaId, setContaId] = useState("");
  const [status, setStatus] = useState("");
  const [estoque, setEstoque] = useState<string>("");
  const [diasSemVenda, setDiasSemVenda] = useState(30);
  const [minUnidades, setMinUnidades] = useState(10);
  const [minFaturamento, setMinFaturamento] = useState(1000);
  // E é o padrão para que aumentar qualquer mínimo corte a lista de verdade;
  // OU continua disponível como alternativa explícita para ampliar o recorte.
  const [relevancia, setRelevancia] = useState<"ou" | "e">("e");
  const [ordem, setOrdem] = useState("faturamento_desc");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(20);

  const contas = useContasMeli();

  const { dados, carregando, erro, atualizando, atualizar } = useAnuncios({
    modo: "mortos",
    // Histórico inteiro, sempre. Ver o comentário no topo do arquivo.
    janelaDias: 0,
    diasSemVenda,
    minUnidades,
    minFaturamento,
    relevancia,
    busca: buscaAplicada,
    contaId,
    status,
    estoque,
    ordem,
    pagina,
    porPagina,
  });

  const resumo = dados?.resumo ?? RESUMO_VAZIO;
  const linhas = useMemo(() => dados?.linhas ?? [], [dados]);

  function aplicarBusca() {
    setBuscaAplicada(busca);
    setPagina(1);
  }

  function trocarRecorte(chave: string) {
    setEstoque(chave);
    setPagina(1);
  }

  return (
    <MolduraTela>
      <Cabecalho
        titulo="Anúncios Mortos"
        descricao="Anúncios que já venderam bem e pararam. A tela separa os que estão sem estoque (problema de reposição) dos que têm mercadoria e não vendem (problema do anúncio)."
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

      {/* Recorte por motivo. É o eixo da tela, então fica acima dos filtros e
          não escondido dentro deles. */}
      <GrupoRecorte opcoes={RECORTES} valor={estoque} onMudar={trocarRecorte} />

      <PainelFiltros nota={<NotaFiltroCaro visivel={Boolean(status || estoque)} />}>
        <CampoBusca
          valor={busca}
          onMudar={setBusca}
          onAplicar={aplicarBusca}
          placeholder="MLB, título ou SKU"
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
              <option key={c.id} value={c.id}>
                {c.nickname ?? c.id}
              </option>
            ))}
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
            <option value="faturamento_desc">Faturamento que parou</option>
            <option value="unidades_desc">Unidades que vendia</option>
            <option value="dias_desc">Mais tempo parado</option>
            <option value="dias_asc">Parou há menos tempo</option>
            <option value="ultima_venda_asc">Última venda mais antiga</option>
          </select>
        </Campo>

        <Campo rotulo="Situação no ML" className="lg:col-span-2">
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

        {/* Os três cortes formam uma única regra. O seletor fica entre os dois
            critérios históricos; dias sem venda é sempre obrigatório. */}
        <fieldset className="lg:col-span-12 rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-fundo)] p-3.5">
          <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--cz-texto-suave)]">
            Critérios para considerar um anúncio morto
          </legend>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch">
            <label className={MODULO_CRITERIO}>
              <span className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--cz-texto-suave)]">
                Mínimo de unidades
              </span>
              <span className="mt-1 block text-[12px] leading-relaxed text-[var(--cz-texto-fraco)]">
                Volume vendido no histórico inteiro.
              </span>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={minUnidades}
                  onChange={(e) => {
                    setMinUnidades(Math.max(0, Number(e.target.value) || 0));
                    setPagina(1);
                  }}
                  className={ENTRADA}
                  aria-label="Mínimo de unidades vendidas"
                />
                <span className="shrink-0 text-[12px] font-semibold text-[var(--cz-texto-suave)]">
                  un.
                </span>
              </div>
            </label>

            <div className="flex items-center justify-center md:w-20 md:flex-col">
              <label className="text-center">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--cz-texto-fraco)]">
                  Combinar
                </span>
                <select
                  value={relevancia}
                  onChange={(e) => {
                    setRelevancia(e.target.value as "ou" | "e");
                    setPagina(1);
                  }}
                  className="h-9 rounded-full border border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] px-3 text-[12px] font-extrabold uppercase text-[var(--cz-laranja-forte)] outline-none transition-colors focus:border-[var(--cz-laranja)]"
                  aria-label="Como unidades e faturamento se combinam"
                >
                  <option value="e">e</option>
                  <option value="ou">ou</option>
                </select>
              </label>
            </div>

            <label className={MODULO_CRITERIO}>
              <span className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--cz-texto-suave)]">
                Mínimo de faturamento
              </span>
              <span className="mt-1 block text-[12px] leading-relaxed text-[var(--cz-texto-fraco)]">
                Receita acumulada antes de parar.
              </span>
              <div className="mt-2 flex items-center gap-2">
                <span className="shrink-0 text-[12px] font-semibold text-[var(--cz-texto-suave)]">
                  R$
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={minFaturamento}
                  onChange={(e) => {
                    setMinFaturamento(Math.max(0, Number(e.target.value) || 0));
                    setPagina(1);
                  }}
                  className={ENTRADA}
                  aria-label="Mínimo de faturamento"
                />
              </div>
            </label>

            <div
              className="flex items-center justify-center md:w-12"
              title="A inatividade mínima sempre precisa ser atendida"
              aria-label="E também"
            >
              <span className="rounded-full border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-3 py-2 text-[12px] font-extrabold uppercase text-[var(--cz-texto-suave)]">
                e
              </span>
            </div>

            <label className={MODULO_CRITERIO}>
              <span className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--cz-texto-suave)]">
                Inatividade mínima
              </span>
              <span className="mt-1 block text-[12px] leading-relaxed text-[var(--cz-texto-fraco)]">
                Tempo obrigatório desde a última venda.
              </span>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={diasSemVenda}
                  onChange={(e) => {
                    setDiasSemVenda(Math.max(1, Number(e.target.value) || 1));
                    setPagina(1);
                  }}
                  className={ENTRADA}
                  aria-label="Mínimo de dias sem venda"
                />
                <span className="shrink-0 text-[12px] font-semibold text-[var(--cz-texto-suave)]">
                  dias
                </span>
              </div>
            </label>
          </div>

          <p className="mt-3 rounded-[var(--cz-raio)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--cz-texto-suave)]">
            {relevancia === "e" ? (
              <>
                Regra padrão: <strong>{inteiro(minUnidades)} unidade(s)</strong>{" "}
                <strong>e</strong> <strong>{brl(minFaturamento)}</strong>{" "}
                <strong>e</strong> <strong>{inteiro(diasSemVenda)} dias</strong> sem
                venda. Como todos os cortes precisam passar, aumentar qualquer valor
                reduz a lista de verdade.
              </>
            ) : (
              <>
                Alternativa explícita: (<strong>{inteiro(minUnidades)} unidade(s)</strong>{" "}
                <strong>ou</strong> <strong>{brl(minFaturamento)}</strong>){" "}
                <strong>e</strong> <strong>{inteiro(diasSemVenda)} dias</strong> sem
                venda. Basta um dos dois critérios históricos, mas a inatividade
                continua obrigatória.
              </>
            )}
          </p>
        </fieldset>
      </PainelFiltros>

      {/* Mesma escada da tela de Mais Vendidos: sem o degrau de 3 colunas, toda a
          faixa entre 640px e 1280px ficava com um cartão sozinho na última linha. */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi
          rotulo="Anúncios parados"
          valor={inteiro(resumo.anuncios)}
          tom="alerta"
          icone={<IconePausa className="h-5 w-5" />}
        />
        <Kpi
          rotulo="Unidades que vendiam"
          valor={inteiro(resumo.unidades)}
          icone={<IconeCaixa className="h-5 w-5" />}
        />
        <Kpi
          rotulo="Faturamento que parou"
          valor={brl(resumo.faturamento)}
          destaque
          nota="acumulado no histórico"
          icone={<IconeDescendo className="h-5 w-5" />}
        />
        <Kpi
          rotulo="Média de tempo parado"
          valor={`${inteiro(Math.round(resumo.mediaHoras / 24))} dias`}
          tom="alerta"
          icone={<IconeRelogio className="h-5 w-5" />}
        />
        <Kpi
          rotulo="Sem estoque"
          valor={inteiro(resumo.semEstoque)}
          icone={<IconeProibido className="h-5 w-5" />}
          nota={
            resumo.escopoEstoque === "pagina"
              ? `de ${inteiro(resumo.estoqueConsultados)} nesta página`
              : `de ${inteiro(resumo.estoqueConsultados)} no total`
          }
        />
      </div>

      {resumo.pausadosSemEstoque > 0 && (
        <Faixa tom="alerta" icone={<IconeInfo className="h-4 w-4" />}>
          <strong>{inteiro(resumo.pausadosSemEstoque)}</strong> anúncio(s) foram
          pausados pelo próprio Mercado Livre <strong>por falta de estoque</strong>.
          Esses voltam ao ar sozinhos quando a mercadoria chega — não precisam de
          nenhuma alteração no anúncio.
        </Faixa>
      )}

      <AvisoDoisTempos />

      <div className="mt-3 overflow-hidden rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]">
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
            icone={<IconePausa className="h-6 w-6" />}
            titulo="Nenhum anúncio parado com esses critérios"
            texto={
              estoque
                ? "Nenhum anúncio parado neste recorte. Tente 'Todos os parados' ou reduza os mínimos de histórico."
                : "Reduza os mínimos de unidades e faturamento, ou diminua os dias sem venda. Se nada aparecer, é boa notícia: nada que vendia bem está parado."
            }
          />
        ) : (
          <div
            role="list"
            aria-label="Anúncios mortos encontrados"
            className="grid grid-cols-1 gap-3 p-3 xl:grid-cols-2"
          >
            {linhas.map((l) => (
              <AnuncioParadoCard key={`${l.canal}:${l.accountId}:${l.itemId}`} l={l} />
            ))}
          </div>
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
            rotulo="anúncios parados"
          />
        )}
      </div>

      <RodapeFonte />
    </MolduraTela>
  );
}

function AnuncioParadoCard({ l }: { l: Linha }) {
  const motivo = motivoDeParada(l);

  return (
    <article
      role="listitem"
      className={`min-w-0 rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] p-3.5 shadow-sm transition-colors hover:border-[var(--cz-hairline-forte)] ${
        motivo === "sem_estoque" ? "bg-amber-50/50" : "bg-[var(--cz-superficie)]"
      }`}
    >
      <header className="flex min-w-0 items-start gap-3 border-b border-[var(--cz-hairline)] pb-3">
        <Miniatura src={l.thumbnailUrl} alt={l.titulo} tamanho={56} />
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-[14px] font-bold leading-snug text-[var(--cz-texto)]">
            {l.titulo}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[var(--cz-texto-suave)]">
            <span className="font-mono font-semibold text-[var(--cz-texto)]">{l.itemId}</span>
            <span aria-hidden>·</span>
            <span>{l.conta || l.accountId}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--cz-texto-fraco)]">
            <span title={l.skus.join(", ")}>
              SKU: {l.skus.length > 0 ? l.skus.join(", ") : "—"}
            </span>
            {l.logisticType ? (
              <SeloEnvio tipo={l.logisticType} />
            ) : (
              <span>Modalidade: —</span>
            )}
          </div>
        </div>
        <div className="shrink-0">
          <LinkAbrir l={l} />
        </div>
      </header>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <section className={MODULO_CARD}>
          <h3 className="text-[10.5px] font-extrabold uppercase tracking-[0.05em] text-[var(--cz-texto-suave)]">
            Agora no Mercado Livre
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <SeloStatus status={l.status} />
            {l.subStatus.includes("out_of_stock") && (
              <span className="text-[11px] font-semibold text-amber-700">
                pausado por falta de estoque
              </span>
            )}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <dt className="text-[10px] font-bold uppercase text-[var(--cz-texto-fraco)]">
                Estoque
              </dt>
              <dd className="mt-0.5 text-[13px] font-bold tabular-nums text-[var(--cz-texto)]">
                {l.estoque === null ? (
                  <span
                    className="font-medium text-[var(--cz-texto-fraco)]"
                    title="O Mercado Livre não respondeu o estoque deste anúncio"
                  >
                    Não consultado
                  </span>
                ) : l.estoque === 0 ? (
                  <span className="text-rose-700">0 un. · esgotado</span>
                ) : (
                  `${inteiro(l.estoque)} un.`
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase text-[var(--cz-texto-fraco)]">
                Preço
              </dt>
              <dd className="mt-0.5 text-[13px] font-bold tabular-nums text-[var(--cz-texto)]">
                {l.preco === null ? (
                  <span
                    className="font-medium text-[var(--cz-texto-fraco)]"
                    title="O Mercado Livre não respondeu o preço deste anúncio"
                  >
                    Não consultado
                  </span>
                ) : (
                  brl(l.preco)
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section className={MODULO_CARD}>
          <h3 className="text-[10.5px] font-extrabold uppercase tracking-[0.05em] text-[var(--cz-texto-suave)]">
            O que fazer
          </h3>
          <div className="mt-2">
            {motivo === "sem_estoque" ? (
              <>
                <Selo tom="alerta">
                  <IconeCaixa className="h-3.5 w-3.5" />
                  Repor estoque
                </Selo>
                <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--cz-texto-suave)]">
                  A mercadoria acabou; alterar o anúncio não resolve a parada.
                </p>
              </>
            ) : motivo === "com_estoque" ? (
              <>
                <Selo tom="info">
                  <IconeEditar className="h-3.5 w-3.5" />
                  Revisar anúncio
                </Selo>
                <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--cz-texto-suave)]">
                  Há estoque: revise preço, título, foto e concorrência.
                </p>
              </>
            ) : (
              <>
                <Selo>Indefinido</Selo>
                <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--cz-texto-suave)]">
                  Sem estoque atual não é possível indicar reposição ou revisão.
                </p>
              </>
            )}
          </div>
        </section>

        <section className={MODULO_CARD}>
          <h3 className="text-[10.5px] font-extrabold uppercase tracking-[0.05em] text-[var(--cz-texto-suave)]">
            Histórico acumulado
          </h3>
          <dl className="mt-2 grid grid-cols-3 gap-2">
            <div>
              <dt className="text-[10px] font-bold uppercase text-[var(--cz-texto-fraco)]">
                Unidades
              </dt>
              <dd className="mt-0.5 text-[15px] font-extrabold tabular-nums text-[var(--cz-texto)]">
                {inteiro(l.unidades)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase text-[var(--cz-texto-fraco)]">
                Faturamento
              </dt>
              <dd className="mt-0.5 text-[13px] font-bold tabular-nums text-emerald-700">
                {brl(l.faturamento)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase text-[var(--cz-texto-fraco)]">
                Pedidos
              </dt>
              <dd className="mt-0.5 text-[15px] font-extrabold tabular-nums text-[var(--cz-texto)]">
                {inteiro(l.pedidos)}
              </dd>
            </div>
          </dl>
        </section>

        <section className={MODULO_CARD}>
          <h3 className="text-[10.5px] font-extrabold uppercase tracking-[0.05em] text-[var(--cz-texto-suave)]">
            Inatividade
          </h3>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div>
              <span className="block text-[10px] font-bold uppercase text-[var(--cz-texto-fraco)]">
                Sem vender há
              </span>
              <span className="mt-1 inline-flex">
                <Selo
                  tom={l.diasSemVenda >= 90 ? "critico" : "alerta"}
                  className="tabular-nums"
                >
                  {inteiro(l.diasSemVenda)} dias
                </Selo>
              </span>
            </div>
            <div className="text-right">
              <span className="block text-[10px] font-bold uppercase text-[var(--cz-texto-fraco)]">
                Última venda
              </span>
              <span className="mt-1 block">
                <UltimaVenda iso={l.ultimaVenda} />
              </span>
            </div>
          </div>
        </section>
      </div>
    </article>
  );
}
