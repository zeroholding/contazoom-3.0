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
  Th,
  ThGrupo,
  UltimaVenda,
} from "./anuncios/comum";
import {
  CampoBusca,
  Faixa,
  GrupoRecorte,
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
  ALTURA_CAMPO,
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

export default function AnunciosMortos() {
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [contaId, setContaId] = useState("");
  const [status, setStatus] = useState("");
  const [estoque, setEstoque] = useState<string>("");
  const [diasSemVenda, setDiasSemVenda] = useState(30);
  const [minUnidades, setMinUnidades] = useState(10);
  const [minFaturamento, setMinFaturamento] = useState(1000);
  const [relevancia, setRelevancia] = useState<"ou" | "e">("ou");
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

      {/* Recorte por motivo. É o eixo da tela, então fica acima dos filtros e
          não escondido dentro deles. Agora pelo `GrupoRecorte` do kit, que
          também trocou o verde da pastilha ativa pelo laranja da marca: nesta
          mesma tela o verde é o faturamento, e "selecionado" em verde fazia
          parecer que o recorte escolhido era o recorte bom. */}
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

        {/*
          OS MÍNIMOS DE RELEVÂNCIA, COM O OPERADOR NO MEIO.

          Os dois campos e o "OU/E" ficam dentro de UM bloco, lado a lado, porque
          o efeito de cada um depende do outro. Antes eram dois `Campo` separados —
          um rotulado "Vendia ao menos" e o outro "Ou faturou ao menos" — e a
          palavra "ou" perdida no início de um rótulo não bastava: com o mínimo de
          unidades em 10, subir o de faturamento não removia nenhuma linha, e o
          campo parecia morto. Agora a relação é a primeira coisa que se lê.
        */}
        <div className="lg:col-span-6">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--cz-texto-suave)]">
            Relevância — o que conta como &ldquo;vendia bem&rdquo;
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-[7.5rem] flex-1 items-center gap-1.5">
              <input
                type="number"
                min={0}
                value={minUnidades}
                onChange={(e) => {
                  setMinUnidades(Math.max(0, Number(e.target.value) || 0));
                  setPagina(1);
                }}
                className={ENTRADA}
                aria-label="Mínimo de unidades vendidas"
              />
              <span className="shrink-0 text-[12.5px] font-semibold text-[var(--cz-texto-suave)]">
                un.
              </span>
            </label>

            {/* O operador é um SELECT e não um texto fixo: era o "ou" implícito
                que fazia os dois campos parecerem independentes. Como controle,
                ele também dá a saída que faltava — em "e", cada mínimo passa a
                cortar de verdade. */}
            <select
              value={relevancia}
              onChange={(e) => {
                setRelevancia(e.target.value as "ou" | "e");
                setPagina(1);
              }}
              // `ALTURA_CAMPO` e não `h-11` escrito à mão: este é o único campo
              // desenhado fora do `ENTRADA` nesta tela, e era ele que estava em
              // `h-10` no meio de dois inputs de 44px — 4px de degrau no centro do
              // painel de filtros.
              className={`${ALTURA_CAMPO} shrink-0 rounded-[var(--cz-raio)] border border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] px-2.5 text-[13px] font-bold uppercase text-[var(--cz-laranja-forte)] outline-none transition-colors focus:border-[var(--cz-laranja)]`}
              aria-label="Como os dois mínimos se combinam"
            >
              <option value="ou">ou</option>
              <option value="e">e</option>
            </select>

            <label className="flex min-w-[8.5rem] flex-1 items-center gap-1.5">
              <span className="shrink-0 text-[12.5px] font-semibold text-[var(--cz-texto-suave)]">
                R$
              </span>
              <input
                type="number"
                min={0}
                value={minFaturamento}
                onChange={(e) => {
                  setMinFaturamento(Math.max(0, Number(e.target.value) || 0));
                  setPagina(1);
                }}
                className={ENTRADA}
                aria-label="Mínimo de faturamento"
              />
            </label>
          </div>

          {/* A frase muda com o operador. É o que fecha o problema: em vez de a
              pessoa descobrir na tentativa que um campo não corta, a tela diz o
              que o recorte atual faz — e como usar um critério sozinho. */}
          <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--cz-texto-suave)]">
            {relevancia === "ou" ? (
              <>
                Entra quem vendia <strong>{inteiro(minUnidades)} unidade(s)</strong>{" "}
                <strong>ou</strong> faturou <strong>{brl(minFaturamento)}</strong> —
                basta um dos dois. Subir só um deles não encurta a lista; para usar um
                critério sozinho, deixe o outro em <strong>0</strong>, ou troque o{" "}
                <strong>ou</strong> por <strong>e</strong>.
              </>
            ) : (
              <>
                Entra só quem vendia <strong>{inteiro(minUnidades)} unidade(s)</strong>{" "}
                <strong>e</strong> faturou <strong>{brl(minFaturamento)}</strong> — os
                dois. Lista mais curta, mas esconde item barato de giro alto e item
                caro de giro baixo.
              </>
            )}
          </p>
        </div>

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

      {/* O parágrafo que explicava o "OU" saiu daqui: agora a explicação fica
          COLADA nos dois campos, dentro do painel de filtros, e muda conforme o
          operador escolhido. Texto solto abaixo do painel descrevia uma regra que
          a pessoa só ia reler depois de já ter estranhado o resultado. */}

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
          // Sem scroll horizontal: as dez colunas viraram cinco, agrupadas por
          // NATUREZA do dado. Ver o comentário equivalente em
          // `AnunciosMaisVendidos.tsx` e o `ThGrupo` em `anuncios/comum.tsx`.
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[40%]" />
              <col className="w-[20%]" />
              <col className="w-[13%]" />
              <col className="w-[14%]" />
              <col className="w-[13%]" />
            </colgroup>
            <CabecalhoTabela>
              <Th className="pl-5">Anúncio</Th>
              <ThGrupo
                titulo="Situação / Estoque / Preço"
                momento="agora no Mercado Livre"
              />
              <ThGrupo titulo="O que fazer" momento="conclusão do sistema" />
              <ThGrupo titulo="Vendia" momento="histórico acumulado" align="right" />
              <ThGrupo
                titulo="Parado há / Última venda"
                momento="data e hora"
                align="right"
                className="pr-5"
              />
            </CabecalhoTabela>
            <tbody>
              {linhas.map((l) => (
                <LinhaParada key={`${l.meliAccountId}:${l.itemId}`} l={l} />
              ))}
            </tbody>
          </table>
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
      className={`border-b border-[var(--cz-hairline)] align-top text-[13.5px] transition-colors last:border-b-0 hover:bg-[var(--cz-fundo)] ${
        motivo === "sem_estoque" ? "bg-amber-50/50" : ""
      }`}
    >
      <CelulaAnuncio l={l} />

      {/* Situação + estoque + preço: o bloco do "agora". O selo de "pausado por
          falta de estoque" já vem dentro dele. */}
      <CelulaAgora l={l} />

      {/* A coluna que dá o encaminhamento. Sem ela a tela lista problemas; com
          ela a tela distribui trabalho. Cada saída ganhou ícone: o operador varre
          esta coluna com o olho, e forma se distingue mais rápido que texto. */}
      <td className="px-3 py-3.5">
        {motivo === "sem_estoque" ? (
          <Selo tom="alerta">
            <IconeCaixa className="h-3.5 w-3.5" />
            Repor estoque
          </Selo>
        ) : motivo === "com_estoque" ? (
          <Selo tom="info">
            <IconeEditar className="h-3.5 w-3.5" />
            Revisar anúncio
          </Selo>
        ) : (
          <span
            className="text-[var(--cz-texto-fraco)]"
            title="Sem o estoque atual não é possível dizer se o problema é reposição ou o anúncio"
          >
            —
          </span>
        )}
      </td>

      {/* O que o anúncio VENDIA — histórico, não presente. Unidades em cima
          porque é o tamanho do buraco em volume; faturamento embaixo porque é o
          tamanho em dinheiro. */}
      <td className="px-3 py-3.5 text-right">
        <span className="block text-[16px] font-bold leading-none tabular-nums text-[var(--cz-texto)]">
          {inteiro(l.unidades)}
          <span className="ml-1 text-[11px] font-medium text-[var(--cz-texto-fraco)]">
            un.
          </span>
        </span>
        <span className="mt-1 block font-semibold tabular-nums text-emerald-700">
          {brl(l.faturamento)}
        </span>
      </td>

      <td className="px-3 py-3.5 pr-5 text-right">
        <Selo tom={l.diasSemVenda >= 90 ? "critico" : "alerta"} className="tabular-nums">
          {inteiro(l.diasSemVenda)} dias
        </Selo>
        <span className="mt-1 block">
          <UltimaVenda iso={l.ultimaVenda} />
        </span>
        <span className="mt-1.5 inline-flex">
          <LinkAbrir l={l} />
        </span>
      </td>
    </tr>
  );
}
