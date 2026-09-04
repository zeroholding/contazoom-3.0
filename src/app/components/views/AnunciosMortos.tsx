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
  BotaoAtualizar,
  Cabecalho,
  CabecalhoTabela,
  CelulaAbrir,
  CelulaAnuncio,
  CelulaEstoque,
  CelulaPreco,
  Campo,
  Esqueleto,
  Kpi,
  MolduraTela,
  NotaFiltroCaro,
  Paginacao,
  PainelFiltros,
  RodapeFonte,
  SeloStatus,
  Th,
} from "./anuncios/comum";
import {
  brl,
  dataCurta,
  ENTRADA,
  inteiro,
  motivoDeParada,
  RESUMO_VAZIO,
  type Linha,
} from "./anuncios/tipos";
import { useAnuncios, useContasMeli } from "./anuncios/useAnuncios";

/** Os três recortes por motivo. Mapeiam para o filtro `estoque` da API. */
const RECORTES = [
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
] as const;

export default function AnunciosMortos() {
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [contaId, setContaId] = useState("");
  const [status, setStatus] = useState("");
  const [estoque, setEstoque] = useState<string>("");
  const [diasSemVenda, setDiasSemVenda] = useState(30);
  const [minUnidades, setMinUnidades] = useState(10);
  const [minFaturamento, setMinFaturamento] = useState(1000);
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
  const recorteAtual = RECORTES.find((r) => r.chave === estoque) ?? RECORTES[0];

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

      {/* Recorte por motivo. É o eixo da tela, então fica acima dos filtros e
          não escondido dentro deles. */}
      <div className="mt-5">
        <div className="flex flex-wrap gap-2">
          {RECORTES.map((r) => (
            <button
              key={r.chave || "todos"}
              type="button"
              onClick={() => trocarRecorte(r.chave)}
              aria-pressed={estoque === r.chave}
              className={`rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition ${
                estoque === r.chave
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:border-emerald-400 hover:text-emerald-700"
              }`}
            >
              {r.rotulo}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-gray-500">
          {recorteAtual.explicacao}
        </p>
      </div>

      <PainelFiltros nota={<NotaFiltroCaro visivel={Boolean(status || estoque)} />}>
        <Campo rotulo="Buscar" className="lg:col-span-4">
          <div className="flex gap-2">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") aplicarBusca();
              }}
              placeholder="MLB, título ou SKU"
              className={ENTRADA}
            />
            <button
              type="button"
              onClick={aplicarBusca}
              className="h-10 shrink-0 rounded-xl border border-gray-300 px-3 text-[13px] font-semibold text-gray-700 transition hover:border-emerald-400 hover:text-emerald-700"
            >
              Buscar
            </button>
          </div>
        </Campo>

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

        <Campo rotulo="Parado há (dias, mín.)" className="lg:col-span-2">
          <input
            type="number"
            min={1}
            value={diasSemVenda}
            onChange={(e) => {
              setDiasSemVenda(Math.max(1, Number(e.target.value) || 1));
              setPagina(1);
            }}
            className={ENTRADA}
          />
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

        {/* Os mínimos de relevância. Existem para a lista não virar "todo anúncio
            que já vendeu uma vez em 2019": o que interessa é o que DAVA dinheiro. */}
        <Campo rotulo="Vendia ao menos (unidades)" className="lg:col-span-3">
          <input
            type="number"
            min={0}
            value={minUnidades}
            onChange={(e) => {
              setMinUnidades(Math.max(0, Number(e.target.value) || 0));
              setPagina(1);
            }}
            className={ENTRADA}
          />
        </Campo>

        <Campo rotulo="Ou faturou ao menos (R$)" className="lg:col-span-3">
          <input
            type="number"
            min={0}
            value={minFaturamento}
            onChange={(e) => {
              setMinFaturamento(Math.max(0, Number(e.target.value) || 0));
              setPagina(1);
            }}
            className={ENTRADA}
          />
        </Campo>

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
      </PainelFiltros>

      {/* Os dois mínimos são OU, não E. Escrito na tela porque um rótulo
          "Vendia ao menos" ao lado de outro "Ou faturou ao menos" ainda deixa
          dúvida sobre como os dois se combinam. */}
      <p className="mt-2 text-[11.5px] leading-relaxed text-gray-500">
        Um anúncio entra na lista se passar em <strong>um</strong> dos dois mínimos.
        Item barato de giro alto aparece pelas unidades; item caro de giro baixo
        aparece pelo faturamento. Exigir os dois esconderia metade dos casos.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Kpi rotulo="Anúncios parados" valor={inteiro(resumo.anuncios)} tom="alerta" />
        <Kpi rotulo="Unidades que vendiam" valor={inteiro(resumo.unidades)} />
        <Kpi
          rotulo="Faturamento que parou"
          valor={brl(resumo.faturamento)}
          destaque
          nota="acumulado no histórico"
        />
        <Kpi
          rotulo="Média de tempo parado"
          valor={`${inteiro(Math.round(resumo.mediaHoras / 24))} dias`}
          tom="alerta"
        />
        <Kpi
          rotulo="Sem estoque"
          valor={inteiro(resumo.semEstoque)}
          nota={
            resumo.escopoEstoque === "pagina"
              ? `de ${inteiro(resumo.estoqueConsultados)} nesta página`
              : `de ${inteiro(resumo.estoqueConsultados)} no total`
          }
        />
      </div>

      {resumo.pausadosSemEstoque > 0 && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-800">
          <strong>{inteiro(resumo.pausadosSemEstoque)}</strong> anúncio(s) foram
          pausados pelo próprio Mercado Livre <strong>por falta de estoque</strong>.
          Esses voltam ao ar sozinhos quando a mercadoria chega — não precisam de
          nenhuma alteração no anúncio.
        </p>
      )}

      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {carregando ? (
          <Esqueleto />
        ) : erro ? (
          <Aviso titulo="Erro ao carregar" texto={erro} />
        ) : linhas.length === 0 ? (
          <Aviso
            titulo="Nenhum anúncio parado com esses critérios"
            texto={
              estoque
                ? "Nenhum anúncio parado neste recorte. Tente 'Todos os parados' ou reduza os mínimos de histórico."
                : "Reduza os mínimos de unidades e faturamento, ou diminua os dias sem venda. Se nada aparecer, é boa notícia: nada que vendia bem está parado."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1160px] border-collapse text-left">
              <CabecalhoTabela>
                <Th className="pl-5">Anúncio</Th>
                <Th>Situação</Th>
                <Th>O que fazer</Th>
                <Th align="right">Estoque</Th>
                <Th align="right">Preço</Th>
                <Th align="right">Unidades</Th>
                <Th align="right">Faturamento</Th>
                <Th align="right">Parado há</Th>
                <Th align="right">Última venda</Th>
                <Th align="right" className="pr-5">
                  Abrir
                </Th>
              </CabecalhoTabela>
              <tbody>
                {linhas.map((l) => (
                  <LinhaParada key={`${l.meliAccountId}:${l.itemId}`} l={l} />
                ))}
              </tbody>
            </table>
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

function LinhaParada({ l }: { l: Linha }) {
  const motivo = motivoDeParada(l);

  return (
    <tr
      className={`border-b border-gray-100 text-[12.5px] transition last:border-b-0 hover:bg-emerald-50/30 ${
        motivo === "sem_estoque" ? "bg-amber-50/40" : ""
      }`}
    >
      <CelulaAnuncio l={l} />

      <td className="px-3 py-3">
        <SeloStatus status={l.status} />
        {l.subStatus.includes("out_of_stock") && (
          <span className="mt-1 block text-[10px] font-semibold text-amber-700">
            pausado por falta de estoque
          </span>
        )}
      </td>

      {/* A coluna que dá o encaminhamento. Sem ela a tela lista problemas; com
          ela a tela distribui trabalho. */}
      <td className="px-3 py-3">
        {motivo === "sem_estoque" ? (
          <span className="inline-block rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-800">
            Repor estoque
          </span>
        ) : motivo === "com_estoque" ? (
          <span className="inline-block rounded-lg bg-sky-100 px-2 py-1 text-[11px] font-bold text-sky-800">
            Revisar anúncio
          </span>
        ) : (
          <span
            className="text-[11px] text-gray-400"
            title="Sem o estoque atual não é possível dizer se o problema é reposição ou o anúncio"
          >
            —
          </span>
        )}
      </td>

      <CelulaEstoque estoque={l.estoque} />
      <CelulaPreco preco={l.preco} />

      <td className="px-3 py-3 text-right font-semibold tabular-nums text-gray-900">
        {inteiro(l.unidades)}
      </td>
      <td className="px-3 py-3 text-right font-semibold tabular-nums text-emerald-700">
        {brl(l.faturamento)}
      </td>

      <td className="px-3 py-3 text-right">
        <span
          className={`inline-block rounded-lg px-2 py-1 text-[11.5px] font-bold tabular-nums ${
            l.diasSemVenda >= 90
              ? "bg-rose-100 text-rose-800"
              : l.diasSemVenda >= 60
                ? "bg-orange-100 text-orange-800"
                : "bg-amber-100 text-amber-800"
          }`}
        >
          {inteiro(l.diasSemVenda)} dias
        </span>
      </td>

      <td className="px-3 py-3 text-right tabular-nums text-gray-600">
        {dataCurta(l.ultimaVenda)}
      </td>

      <CelulaAbrir l={l} />
    </tr>
  );
}
