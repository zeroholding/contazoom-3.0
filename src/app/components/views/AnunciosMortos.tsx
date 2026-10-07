"use client";

import { useMemo, useRef, useState } from "react";

import { CampoDaFolha, GrupoDePilulas } from "@/components/ui/FiltrosSheet";
import { useAoSincronizarVendas } from "@/hooks/useAoSincronizarVendas";
import { useCelular } from "@/hooks/useMediaQuery";
import {
  Aviso,
  BotaoAtualizar,
  Cabecalho,
  Campo,
  CartaoAnuncioCelular,
  Esqueleto,
  FiltrosAnuncioCelular,
  Kpi,
  LinkAbrir,
  MolduraTela,
  Paginacao,
  PainelFiltros,
  SeloEnvio,
  SeloStatus,
  UltimaVenda,
} from "./anuncios/comum";
import { CaixaBusca, CampoBusca, Faixa, Miniatura, Selo } from "./comum/shell";
import type { ChipFiltro } from "./comum/filtros";
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
import { LogoMercadoLivre } from "./comum/logos";
import {
  brl,
  ENTRADA,
  inteiro,
  motivoDeParada,
  RESUMO_VAZIO,
  type Linha,
} from "./anuncios/tipos";
import { useAnuncios, useContasMeli } from "./anuncios/useAnuncios";

const RECORTES = [
  {
    chave: "",
    rotulo: "Todos os motivos",
    apoio: "Visão completa dos anúncios que pararam.",
  },
  {
    chave: "com",
    rotulo: "Revisar anúncio",
    apoio: "Há estoque: investigue oferta e concorrência.",
  },
  {
    chave: "sem",
    rotulo: "Repor estoque",
    apoio: "A mercadoria acabou: priorize abastecimento.",
  },
] as const;

export default function AnunciosMortos() {
  const [busca, setBusca] = useState("");
  const buscaRef = useRef("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [contaId, setContaId] = useState("");
  const [status, setStatus] = useState("");
  const [estoque, setEstoque] = useState<string>("");
  const [diasSemVenda, setDiasSemVenda] = useState(30);
  const [minUnidades, setMinUnidades] = useState(10);
  const [minFaturamento, setMinFaturamento] = useState(1000);
  const [relevancia, setRelevancia] = useState<"ou" | "e">("e");
  const [ordem, setOrdem] = useState("faturamento_desc");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(20);

  const contas = useContasMeli();

  const { dados, carregando, erro, atualizando, atualizar } = useAnuncios({
    modo: "mortos",
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

  useAoSincronizarVendas(() => {
    void atualizar();
  });

  const resumo = dados?.resumo ?? RESUMO_VAZIO;
  const linhas = useMemo(() => dados?.linhas ?? [], [dados]);

  // Celular: o que está LIGADO dentro da folha (botão "Filtros (n)" e chips). O recorte
  // "Qual fila você quer resolver?" (`estoque`) e a busca ficam fora dela, à vista.
  const celular = useCelular();
  const ORDENS_MORTOS = [
    { id: "faturamento_desc", rotulo: "Faturamento que parou" },
    { id: "unidades_desc", rotulo: "Unidades que vendia" },
    { id: "dias_desc", rotulo: "Mais tempo parado" },
    { id: "dias_asc", rotulo: "Parou há menos tempo" },
    { id: "ultima_venda_asc", rotulo: "Última venda mais antiga" },
  ];
  const ROTULO_SITUACAO: Record<string, string> = {
    active: "Ativo",
    paused: "Pausado",
    closed: "Finalizado",
    under_review: "Em revisão",
  };
  const regraAlterada =
    minUnidades !== 10 || minFaturamento !== 1000 || diasSemVenda !== 30 || relevancia !== "e";
  const chips: ChipFiltro[] = [];
  if (contaId) {
    chips.push({
      chave: "conta",
      grupo: "Conta",
      rotulo: contas.find((c) => c.id === contaId)?.nickname ?? contaId,
      remover: () => {
        setContaId("");
        setPagina(1);
      },
    });
  }
  if (ordem !== "faturamento_desc") {
    chips.push({
      chave: "ordem",
      grupo: "Ordem",
      rotulo: ORDENS_MORTOS.find((o) => o.id === ordem)?.rotulo ?? ordem,
      remover: () => {
        setOrdem("faturamento_desc");
        setPagina(1);
      },
    });
  }
  if (status) {
    chips.push({
      chave: "status",
      grupo: "Situação",
      rotulo: ROTULO_SITUACAO[status] ?? status,
      remover: () => {
        setStatus("");
        setPagina(1);
      },
    });
  }
  if (regraAlterada) {
    chips.push({
      chave: "regra",
      grupo: "Regra",
      rotulo: `${relevancia === "e" ? "E" : "OU"} · ${inteiro(minUnidades)} un. · ${brl(minFaturamento)} · ${inteiro(diasSemVenda)} d`,
      remover: () => {
        setMinUnidades(10);
        setMinFaturamento(1000);
        setDiasSemVenda(30);
        setRelevancia("e");
        setPagina(1);
      },
    });
  }

  function limparFolha() {
    setContaId("");
    setOrdem("faturamento_desc");
    setStatus("");
    setMinUnidades(10);
    setMinFaturamento(1000);
    setDiasSemVenda(30);
    setRelevancia("e");
    setPagina(1);
  }

  function mudarBusca(valor: string) {
    buscaRef.current = valor;
    setBusca(valor);
  }

  function aplicarBusca() {
    // A limpeza do CampoBusca chama mudar + aplicar no mesmo clique. Ler a ref
    // garante que o valor vazio seja aplicado, não a closure do render anterior.
    setBuscaAplicada(buscaRef.current);
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
        descricao="Descubra o que já gerou receita e parou, separando rapidamente problemas de reposição de problemas na oferta."
        acao={
          <BotaoAtualizar
            onClick={atualizar}
            atualizando={atualizando}
            desabilitado={carregando}
          />
        }
      />

      <section
        className="mt-4 flex flex-col gap-3 rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-4 sm:flex-row sm:items-center sm:justify-between"
        aria-label="Canal analisado: Mercado Livre"
      >
        <div className="flex items-center gap-4">
          {/* Celular: o logo cai de 56 para 36px. Com 56px o aviso "canal exclusivo"
              era o maior bloco acima da fila, e só diz uma coisa. */}
          <span className="grid min-h-16 min-w-24 place-items-center rounded-[var(--cz-raio)] border border-[var(--cz-hairline)] bg-white px-3 max-md:min-h-12 max-md:min-w-16 max-md:px-2">
            <LogoMercadoLivre className="h-14 w-auto max-w-24 max-md:h-9 max-md:max-w-14" />
          </span>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[var(--cz-laranja-forte)]">
              Canal exclusivo desta análise
            </p>
            <p className="mt-1 text-[13px] font-semibold leading-relaxed text-[var(--cz-texto)]">
              Estoque, preço e situação atuais orientam a ação recomendada.
            </p>
          </div>
        </div>
        <span className="inline-flex min-h-10 items-center self-start rounded-full border border-[var(--cz-hairline)] bg-[var(--cz-fundo)] px-3 text-[11.5px] font-semibold text-[var(--cz-texto-suave)] sm:self-center">
          Histórico completo de vendas
        </span>
      </section>

      {(dados?.backfillPendente ?? 0) > 0 && (
        <div className="mt-4 rounded-[var(--cz-raio-cartao)] border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] leading-relaxed text-sky-900">
          <strong>{inteiro(dados!.backfillPendente)} venda(s)</strong> ainda estão sendo
          associadas ao anúncio de origem. A lista já funciona e fica mais completa
          automaticamente a cada carregamento.
        </div>
      )}

      {dados?.truncado && (
        <Faixa tom="alerta" icone={<IconeAlerta className="h-4 w-4" />}>
          <strong>Atenção:</strong> a análise atingiu o limite de 10.000 anúncios.
          Estreite conta ou busca; os totais atuais não são completos.
        </Faixa>
      )}

      <section className="mt-5" aria-labelledby="motivo-parada">
        <div className="mb-2">
          <h2 id="motivo-parada" className="text-[13px] font-extrabold text-[var(--cz-texto)]">
            Qual fila você quer resolver?
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--cz-texto-suave)]">
            O motivo da parada define a próxima ação.
          </p>
        </div>
        {/* Celular: três cartões empilhados gastavam ~250px. Viram uma faixa que o dedo
            arrasta, cada opção com a largura de um cartão e a explicação à mostra. */}
        <div
          className="grid grid-cols-1 gap-2 sm:grid-cols-3 max-md:-mx-4 max-md:flex max-md:overflow-x-auto max-md:px-4 max-md:pb-1 max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden max-md:[&>*]:w-[16.5rem] max-md:[&>*]:shrink-0"
          role="group"
          aria-label="Motivo da parada"
        >
          {RECORTES.map((recorte) => {
            const selecionado = estoque === recorte.chave;
            const Icone = recorte.chave === "sem" ? IconeCaixa : recorte.chave === "com" ? IconeEditar : IconePausa;
            return (
              <button
                key={recorte.chave || "todos"}
                type="button"
                onClick={() => trocarRecorte(recorte.chave)}
                aria-pressed={selecionado}
                className={`flex min-h-20 items-start gap-3 rounded-[var(--cz-raio-cartao)] border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cz-laranja)] focus-visible:ring-offset-2 ${
                  selecionado
                    ? "border-[var(--cz-laranja)] bg-[var(--cz-laranja-suave)]"
                    : "border-[var(--cz-hairline)] bg-[var(--cz-superficie)] hover:border-[var(--cz-laranja-borda)]"
                }`}
              >
                <span className={`grid size-10 shrink-0 place-items-center rounded-[var(--cz-raio)] ${
                  recorte.chave === "sem"
                    ? "bg-amber-100 text-amber-800"
                    : recorte.chave === "com"
                      ? "bg-sky-100 text-sky-800"
                      : "bg-[var(--cz-fundo)] text-[var(--cz-texto-suave)]"
                }`}>
                  <Icone className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-[13px] font-extrabold text-[var(--cz-texto)]">{recorte.rotulo}</span>
                  <span className="mt-1 block text-[11.5px] leading-relaxed text-[var(--cz-texto-suave)]">{recorte.apoio}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {celular ? (
        <>
          <FiltrosAnuncioCelular
            busca={
              <CaixaBusca
                valor={busca}
                onMudar={mudarBusca}
                onAplicar={aplicarBusca}
                placeholder="MLB, título ou SKU"
                rotuloAcessivel="Buscar anúncios"
              />
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
                  <option key={c.id} value={c.id}>{c.nickname ?? c.id}</option>
                ))}
              </select>
            </CampoDaFolha>

            <CampoDaFolha rotulo="Ordenar por">
              <GrupoDePilulas
                rotulo="Ordenar por"
                opcoes={ORDENS_MORTOS}
                estaAtiva={(id) => ordem === id}
                onEscolher={(id) => {
                  setOrdem(id);
                  setPagina(1);
                }}
              />
            </CampoDaFolha>

            <CampoDaFolha rotulo="Situação do anúncio">
              <GrupoDePilulas
                rotulo="Situação do anúncio"
                opcoes={[{ id: "", rotulo: "Todas" }, ...Object.entries(ROTULO_SITUACAO).map(([id, rotulo]) => ({ id, rotulo }))]}
                estaAtiva={(id) => status === id}
                onEscolher={(id) => {
                  setStatus(id);
                  setPagina(1);
                }}
              />
            </CampoDaFolha>

            <CampoDaFolha rotulo="Regra de relevância">
              <p className="mb-3 text-[13px] leading-relaxed text-[var(--cz-texto-suave)]">
                Combine o histórico por <strong>todos</strong> os mínimos ou por <strong>qualquer um</strong> deles.
              </p>
              <GrupoDePilulas
                rotulo="Combinação dos critérios históricos"
                opcoes={[
                  { id: "e", rotulo: "Todos (E)" },
                  { id: "ou", rotulo: "Qualquer (OU)" },
                ]}
                estaAtiva={(id) => relevancia === id}
                onEscolher={(id) => {
                  setRelevancia(id as "e" | "ou");
                  setPagina(1);
                }}
              />
              <div className="mt-3 space-y-2.5">
                <CriterioNumero
                  rotulo="Unidades vendidas"
                  apoio="Mínimo no histórico"
                  valor={minUnidades}
                  min={0}
                  passo={1}
                  sufixo="un."
                  onMudar={(valor) => {
                    setMinUnidades(Math.max(0, valor || 0));
                    setPagina(1);
                  }}
                />
                <CriterioNumero
                  rotulo="Faturamento"
                  apoio="Mínimo acumulado"
                  valor={minFaturamento}
                  min={0}
                  passo={0.01}
                  prefixo="R$"
                  onMudar={(valor) => {
                    setMinFaturamento(Math.max(0, valor || 0));
                    setPagina(1);
                  }}
                />
                <CriterioNumero
                  rotulo="Sem vender há"
                  apoio="Obrigatório em qualquer regra"
                  valor={diasSemVenda}
                  min={1}
                  passo={1}
                  sufixo="dias"
                  onMudar={(valor) => {
                    setDiasSemVenda(Math.max(1, valor || 1));
                    setPagina(1);
                  }}
                />
              </div>
              <p className="mt-3 border-l-2 border-[var(--cz-laranja)] pl-3 text-[13px] leading-relaxed text-[var(--cz-texto-suave)]">
                <strong className="text-[var(--cz-texto)]">Regra ativa:</strong>{" "}
                {relevancia === "e" ? "todos os cortes" : "unidades ou faturamento"} +{" "}
                <strong>{inteiro(diasSemVenda)} dias</strong> sem venda.
              </p>
            </CampoDaFolha>
          </FiltrosAnuncioCelular>
          {(status || estoque) && (
            <p className="mt-3 text-[12.5px] leading-relaxed text-amber-700">
              Filtrar por situação ou estoque consulta os dados atuais de toda a lista e pode levar alguns segundos a mais.
            </p>
          )}
        </>
      ) : (
      <>
      <PainelFiltros
        nota={
          status || estoque ? (
            <p className="mt-3 text-[12.5px] leading-relaxed text-amber-700">
              Filtrar por situação ou estoque consulta os dados atuais de toda a lista e pode levar alguns segundos a mais.
            </p>
          ) : undefined
        }
      >
        <CampoBusca
          valor={busca}
          onMudar={mudarBusca}
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
              <option key={c.id} value={c.id}>{c.nickname ?? c.id}</option>
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

        <Campo rotulo="Situação do anúncio" className="lg:col-span-2">
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

        <fieldset className="lg:col-span-12 rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-fundo)] p-3.5 sm:p-4">
          <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--cz-texto-suave)]">
            Regra de relevância
          </legend>

          <div className="mb-3 flex flex-col gap-2 rounded-[var(--cz-raio)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] leading-relaxed text-[var(--cz-texto-suave)]">
              Combine o histórico por <strong>todos</strong> os mínimos ou por <strong>qualquer um</strong> deles.
            </p>
            <div className="grid min-h-11 grid-cols-2 rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-[var(--cz-fundo)] p-1" role="group" aria-label="Combinação dos critérios históricos">
              {(["e", "ou"] as const).map((opcao) => (
                <button
                  key={opcao}
                  type="button"
                  onClick={() => {
                    setRelevancia(opcao);
                    setPagina(1);
                  }}
                  aria-pressed={relevancia === opcao}
                  className={`min-h-9 rounded-[calc(var(--cz-raio)-3px)] px-4 text-[11px] font-extrabold uppercase transition-colors ${
                    relevancia === opcao
                      ? "bg-[var(--cz-laranja)] text-white"
                      : "text-[var(--cz-texto-suave)] hover:bg-[var(--cz-superficie)]"
                  }`}
                >
                  {opcao === "e" ? "Todos (E)" : "Qualquer (OU)"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <CriterioNumero
              rotulo="Unidades vendidas"
              apoio="Mínimo no histórico"
              valor={minUnidades}
              min={0}
              passo={1}
              sufixo="un."
              onMudar={(valor) => {
                setMinUnidades(Math.max(0, valor || 0));
                setPagina(1);
              }}
            />
            <CriterioNumero
              rotulo="Faturamento"
              apoio="Mínimo acumulado"
              valor={minFaturamento}
              min={0}
              passo={0.01}
              prefixo="R$"
              onMudar={(valor) => {
                setMinFaturamento(Math.max(0, valor || 0));
                setPagina(1);
              }}
            />
            <CriterioNumero
              rotulo="Sem vender há"
              apoio="Obrigatório em qualquer regra"
              valor={diasSemVenda}
              min={1}
              passo={1}
              sufixo="dias"
              onMudar={(valor) => {
                setDiasSemVenda(Math.max(1, valor || 1));
                setPagina(1);
              }}
            />
          </div>

          <p className="mt-3 border-l-2 border-[var(--cz-laranja)] pl-3 text-[12px] leading-relaxed text-[var(--cz-texto-suave)]">
            <strong className="text-[var(--cz-texto)]">Regra ativa:</strong>{" "}
            {relevancia === "e" ? "todos os cortes" : "unidades ou faturamento"} + {" "}
            <strong>{inteiro(diasSemVenda)} dias</strong> sem venda.
          </p>
        </fieldset>
      </PainelFiltros>
      </>
      )}

      <section aria-label="Resumo dos anúncios parados" className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi rotulo="Anúncios parados" valor={inteiro(resumo.anuncios)} tom="alerta" icone={<IconePausa className="h-5 w-5" />} />
        <Kpi rotulo="Unidades que vendiam" valor={inteiro(resumo.unidades)} icone={<IconeCaixa className="h-5 w-5" />} />
        <div className="col-span-2 lg:col-span-1">
          <Kpi rotulo="Receita interrompida" valor={brl(resumo.faturamento)} destaque nota="acumulada no histórico" icone={<IconeDescendo className="h-5 w-5" />} />
        </div>
        <Kpi rotulo="Tempo médio parado" valor={`${inteiro(Math.round(resumo.mediaHoras / 24))} dias`} tom="alerta" icone={<IconeRelogio className="h-5 w-5" />} />
        <Kpi
          rotulo="Precisam de reposição"
          valor={inteiro(resumo.semEstoque)}
          tom={resumo.semEstoque > 0 ? "alerta" : undefined}
          icone={<IconeProibido className="h-5 w-5" />}
          nota={resumo.escopoEstoque === "pagina" ? `de ${inteiro(resumo.estoqueConsultados)} nesta página` : `de ${inteiro(resumo.estoqueConsultados)} no total`}
        />
      </section>

      {resumo.pausadosSemEstoque > 0 && (
        <Faixa tom="alerta" icone={<IconeInfo className="h-4 w-4" />}>
          <strong>{inteiro(resumo.pausadosSemEstoque)}</strong> anúncio(s) foram pausados
          automaticamente por falta de estoque. Eles voltam ao ar após a reposição;
          não precisam de alteração na oferta.
        </Faixa>
      )}

      <div className="mt-4 rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-fundo)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">Status, estoque e preço: agora</span>
          <span className="rounded-full border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-2.5 py-1 text-[var(--cz-texto-suave)]">Vendas e inatividade: histórico completo</span>
        </div>
      </div>

      <section className="mt-3 overflow-hidden rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]" aria-label="Anúncios parados encontrados">
        {carregando ? (
          <Esqueleto />
        ) : erro ? (
          <Aviso icone={<IconeAlerta className="h-6 w-6" />} titulo="Erro ao carregar" texto={erro} />
        ) : linhas.length === 0 ? (
          <Aviso
            icone={<IconePausa className="h-6 w-6" />}
            titulo="Nenhum anúncio parado com esses critérios"
            texto={estoque ? "Nenhum anúncio neste recorte. Veja todos os motivos ou reduza os mínimos." : "Reduza os mínimos ou os dias sem venda. Se nada aparecer, nenhum anúncio relevante está parado."}
          />
        ) : (
          <div role="list" className="grid grid-cols-1 gap-3 p-3 max-md:bg-[var(--cz-fundo)] xl:grid-cols-2">
            {linhas.map((l) => <AnuncioParadoCard key={`${l.canal}:${l.accountId}:${l.itemId}`} l={l} />)}
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
      </section>

      <p className="mt-4 max-w-4xl text-[12.5px] leading-relaxed text-[var(--cz-texto-suave)]">
        Estoque, preço e situação são consultados a cada carregamento. Um valor em branco
        significa ausência de resposta, não estoque zerado. A lista inclui apenas anúncios
        que já venderam ao menos uma vez.
      </p>
    </MolduraTela>
  );
}

function CriterioNumero({ rotulo, apoio, valor, min, passo, prefixo, sufixo, onMudar }: {
  rotulo: string;
  apoio: string;
  valor: number;
  min: number;
  passo: number;
  prefixo?: string;
  sufixo?: string;
  onMudar: (valor: number) => void;
}) {
  return (
    <label className="rounded-[var(--cz-raio)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-3">
      <span className="block text-[11px] font-extrabold uppercase tracking-[0.04em] text-[var(--cz-texto)]">{rotulo}</span>
      <span className="mt-0.5 block text-[11px] text-[var(--cz-texto-fraco)]">{apoio}</span>
      <span className="mt-2 flex items-center gap-2">
        {prefixo && <span className="text-[12px] font-bold text-[var(--cz-texto-suave)]">{prefixo}</span>}
        <input
          type="number"
          min={min}
          step={passo}
          value={valor}
          onChange={(e) => onMudar(Number(e.target.value))}
          className={ENTRADA}
          aria-label={rotulo}
        />
        {sufixo && <span className="shrink-0 text-[12px] font-bold text-[var(--cz-texto-suave)]">{sufixo}</span>}
      </span>
    </label>
  );
}

function AnuncioParadoCard({ l }: { l: Linha }) {
  const celular = useCelular();
  const motivo = motivoDeParada(l);
  const acao = motivo === "sem_estoque"
    ? {
        titulo: "Repor estoque",
        texto: "A mercadoria acabou. Reabastecer é a ação que recupera a venda.",
        icone: <IconeCaixa className="h-5 w-5" />,
        caixa: "border-amber-200 bg-amber-50 text-amber-950",
        iconeCaixa: "bg-amber-100 text-amber-800",
        borda: "border-l-amber-500",
      }
    : motivo === "com_estoque"
      ? {
          titulo: "Revisar anúncio",
          texto: "Há mercadoria disponível. Investigue preço, título, foto e concorrência.",
          icone: <IconeEditar className="h-5 w-5" />,
          caixa: "border-sky-200 bg-sky-50 text-sky-950",
          iconeCaixa: "bg-sky-100 text-sky-800",
          borda: "border-l-sky-500",
        }
      : {
          titulo: "Confirmar estoque",
          texto: "Sem a leitura atual, confirme a disponibilidade antes de escolher a ação.",
          icone: <IconeInfo className="h-5 w-5" />,
          caixa: "border-[var(--cz-hairline)] bg-[var(--cz-fundo)] text-[var(--cz-texto)]",
          iconeCaixa: "bg-[var(--cz-superficie)] text-[var(--cz-texto-suave)]",
          borda: "border-l-[var(--cz-hairline-forte)]",
        };

  // Celular: o cartão compartilhado com Mais Vendidos. A ação recomendada continua no
  // topo (é a razão de a tela existir), mas em faixa fina; a grade de seis métricas
  // vira quatro, com unidades e pedidos como nota do faturamento.
  if (celular) {
    return (
      <CartaoAnuncioCelular
        l={l}
        alerta={motivo === "sem_estoque"}
        faixa={
          <section
            className={`flex items-start gap-3 border-b p-3 ${acao.caixa}`}
            aria-label={`Ação recomendada: ${acao.titulo}`}
          >
            <span className={`grid size-9 shrink-0 place-items-center rounded-[var(--cz-raio)] ${acao.iconeCaixa}`}>
              {acao.icone}
            </span>
            <div className="min-w-0">
              <h2 className="text-[14px] font-extrabold">{acao.titulo}</h2>
              <p className="mt-0.5 text-[12.5px] leading-snug opacity-80">{acao.texto}</p>
            </div>
          </section>
        }
        selos={
          <>
            <SeloStatus status={l.status} />
            {l.logisticType && <SeloEnvio tipo={l.logisticType} />}
            {l.subStatus.includes("out_of_stock") && <Selo tom="alerta">pausado por falta de estoque</Selo>}
          </>
        }
        metricas={[
          { rotulo: "Sem vender há", valor: `${inteiro(l.diasSemVenda)} dias`, tom: l.diasSemVenda >= 90 ? "critico" : undefined },
          {
            rotulo: "Faturamento",
            valor: brl(l.faturamento),
            tom: "bom",
            nota: `${inteiro(l.unidades)} un. · ${inteiro(l.pedidos)} pedidos`,
          },
          {
            rotulo: "Estoque agora",
            valor: l.estoque === null ? "Não consultado" : `${inteiro(l.estoque)} un.`,
            tom: l.estoque === 0 ? "critico" : undefined,
          },
          { rotulo: "Preço atual", valor: l.preco === null ? "Não consultado" : brl(l.preco) },
        ]}
      />
    );
  }

  return (
    <article role="listitem" className={`min-w-0 rounded-[var(--cz-raio-cartao)] border border-l-4 border-[var(--cz-hairline)] ${acao.borda} bg-[var(--cz-superficie)] p-3.5 transition-colors hover:border-[var(--cz-hairline-forte)]`}>
      <section className={`flex items-start gap-3 rounded-[var(--cz-raio)] border p-3 ${acao.caixa}`} aria-label={`Ação recomendada: ${acao.titulo}`}>
        <span className={`grid size-10 shrink-0 place-items-center rounded-[var(--cz-raio)] ${acao.iconeCaixa}`}>{acao.icone}</span>
        <div>
          <h2 className="text-[13px] font-extrabold">{acao.titulo}</h2>
          <p className="mt-0.5 text-[11.5px] leading-relaxed opacity-80">{acao.texto}</p>
        </div>
      </section>

      <header className="mt-3 flex min-w-0 items-start gap-3">
        <Miniatura src={l.thumbnailUrl} alt={l.titulo} tamanho={56} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[14px] font-bold leading-snug text-[var(--cz-texto)]">{l.titulo}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[var(--cz-texto-suave)]">
            <span className="font-mono font-semibold text-[var(--cz-texto)]">{l.itemId}</span>
            <span aria-hidden>·</span>
            <span>{l.conta || l.accountId}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <SeloStatus status={l.status} />
            {l.logisticType && <SeloEnvio tipo={l.logisticType} />}
            {l.subStatus.includes("out_of_stock") && <Selo tom="alerta">pausado por falta de estoque</Selo>}
          </div>
        </div>
        <LinkAbrir l={l} />
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--cz-raio)] border border-[var(--cz-hairline)] bg-[var(--cz-hairline)] sm:grid-cols-3">
        <MetricaParado rotulo="Sem vender há" valor={`${inteiro(l.diasSemVenda)} dias`} critico={l.diasSemVenda >= 90} />
        <MetricaParado rotulo="Unidades" valor={inteiro(l.unidades)} />
        <MetricaParado rotulo="Faturamento" valor={brl(l.faturamento)} positivo />
        <MetricaParado rotulo="Pedidos" valor={inteiro(l.pedidos)} />
        <MetricaParado rotulo="Estoque" valor={l.estoque === null ? "Não consultado" : `${inteiro(l.estoque)} un.`} critico={l.estoque === 0} />
        <MetricaParado rotulo="Preço atual" valor={l.preco === null ? "Não consultado" : brl(l.preco)} />
      </dl>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-[var(--cz-hairline)] pt-3">
        <div className="min-w-0">
          <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--cz-texto-fraco)]">SKU</span>
          <span className="mt-1 block max-w-64 truncate font-mono text-[11px] text-[var(--cz-texto-suave)]" title={l.skus.join(" · ")}>{l.skus.length > 0 ? l.skus.join(" · ") : "—"}</span>
        </div>
        <div className="text-right">
          <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--cz-texto-fraco)]">Última venda</span>
          <span className="mt-1 block"><UltimaVenda iso={l.ultimaVenda} /></span>
        </div>
      </div>
    </article>
  );
}

function MetricaParado({ rotulo, valor, positivo = false, critico = false }: { rotulo: string; valor: string; positivo?: boolean; critico?: boolean }) {
  return (
    <div className="min-w-0 bg-[var(--cz-fundo)] p-2.5">
      <dt className="text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--cz-texto-fraco)]">{rotulo}</dt>
      <dd className={`mt-1 break-words text-[13px] font-extrabold tabular-nums ${critico ? "text-rose-700" : positivo ? "text-emerald-700" : "text-[var(--cz-texto)]"}`}>{valor}</dd>
    </div>
  );
}
