"use client";

/**
 * Anúncios Mais Vendidos — com o estoque real de cada um.
 *
 * A pergunta desta tela é sobre o PRESENTE: quem está vendendo agora. Por isso
 * abre nos últimos 30 dias, ordena por unidades e mostra a posição no ranking.
 *
 * O estoque é a razão de ela existir em vez de um gráfico de top 10: campeão de
 * venda com estoque acabando é a informação mais valiosa que este app tem para
 * dar, e é a que ninguém vê porque está em duas telas diferentes. Aqui as duas
 * coisas ficam na mesma linha.
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
import { CampoBusca, Faixa, Selo } from "./comum/shell";
import {
  IconeAlerta,
  IconeCaixa,
  IconeDinheiro,
  IconePreco,
  IconeProibido,
  IconeSubindo,
} from "./comum/icones";
import {
  brl,
  dataCurta,
  ENTRADA,
  inteiro,
  RESUMO_VAZIO,
  type Linha,
} from "./anuncios/tipos";
import { useAnuncios, useContasMeli } from "./anuncios/useAnuncios";

/**
 * Alerta de ruptura: quantos dias de estoque restam ao ritmo de venda do período.
 *
 * É a conta que transforma "12 unidades" em decisão. Doze unidades num anúncio
 * que vende duas por dia é uma semana de vida; num que vende uma por mês é um ano.
 * O número sozinho não distingue os dois casos, e é sempre o número sozinho que
 * as telas mostram.
 */
function diasDeCobertura(l: Linha, diasDoPeriodo: number): number | null {
  if (l.estoque === null || l.estoque === 0) return null;
  if (diasDoPeriodo <= 0 || l.unidades <= 0) return null;
  const porDia = l.unidades / diasDoPeriodo;
  if (porDia <= 0) return null;
  return Math.floor(l.estoque / porDia);
}

export default function AnunciosMaisVendidos() {
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [contaId, setContaId] = useState("");
  const [status, setStatus] = useState("");
  const [estoque, setEstoque] = useState("");
  const [janelaDias, setJanelaDias] = useState(30);
  const [ordem, setOrdem] = useState("unidades_desc");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(20);

  const contas = useContasMeli();

  const { dados, carregando, erro, atualizando, atualizar } = useAnuncios({
    modo: "mais_vendidos",
    janelaDias,
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

  // Para a cobertura de estoque: "desde sempre" não dá ritmo diário confiável,
  // então a coluna some em vez de mostrar um número inventado.
  const diasDoPeriodo = janelaDias > 0 ? janelaDias : 0;

  function aplicarBusca() {
    setBuscaAplicada(busca);
    setPagina(1);
  }

  return (
    <MolduraTela>
      <Cabecalho
        titulo="Anúncios Mais Vendidos"
        descricao="Quem está vendendo agora, com o estoque real de cada anúncio no Mercado Livre. A coluna de cobertura mostra quantos dias o estoque atual aguenta no ritmo atual de venda."
        acao={
          <BotaoAtualizar
            onClick={atualizar}
            atualizando={atualizando}
            desabilitado={carregando}
          />
        }
      />

      <AvisoBackfill pendentes={dados?.backfillPendente ?? 0} />

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
      </PainelFiltros>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-5">
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
        <Kpi
          rotulo="Faturamento"
          valor={brl(resumo.faturamento)}
          destaque
          icone={<IconeDinheiro className="h-5 w-5" />}
        />
        <Kpi
          rotulo="Ticket médio por unidade"
          valor={brl(resumo.unidades > 0 ? resumo.faturamento / resumo.unidades : 0)}
          icone={<IconePreco className="h-5 w-5" />}
        />
        <Kpi
          rotulo="Esgotados"
          valor={inteiro(resumo.semEstoque)}
          tom={resumo.semEstoque > 0 ? "alerta" : undefined}
          icone={<IconeProibido className="h-5 w-5" />}
          // A ressalva é obrigatória: no caminho normal o estoque é consultado
          // só nos anúncios exibidos, e "3 esgotados" ao lado de um total de 200
          // seria lido como 3 de 200.
          nota={
            resumo.escopoEstoque === "pagina"
              ? `de ${inteiro(resumo.estoqueConsultados)} nesta página`
              : `de ${inteiro(resumo.estoqueConsultados)} no total`
          }
        />
      </div>

      {resumo.semEstoque > 0 && (
        <Faixa tom="critico" icone={<IconeProibido className="h-4 w-4" />}>
          <strong>{inteiro(resumo.semEstoque)}</strong> anúncio(s) que vendem estão{" "}
          <strong>com estoque zerado</strong>. Anúncio campeão esgotado é venda que
          existe e não está sendo feita — é a fila mais curta entre repor mercadoria e
          faturar.
        </Faixa>
      )}

      <div className="mt-4 overflow-hidden rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]">
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] border-collapse text-left">
              <CabecalhoTabela>
                <Th className="pl-5">Anúncio</Th>
                <Th>Situação</Th>
                <Th align="right">Estoque</Th>
                <Th align="right">Cobertura</Th>
                <Th align="right">Preço</Th>
                <Th align="right">Pedidos</Th>
                <Th align="right">Unidades</Th>
                <Th align="right">Faturamento</Th>
                <Th align="right">Última venda</Th>
                <Th align="right" className="pr-5">
                  Abrir
                </Th>
              </CabecalhoTabela>
              <tbody>
                {linhas.map((l, i) => (
                  <LinhaVendida
                    key={`${l.meliAccountId}:${l.itemId}`}
                    l={l}
                    posicao={(dados!.pagina - 1) * porPagina + i + 1}
                    diasDoPeriodo={diasDoPeriodo}
                  />
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
          />
        )}
      </div>

      <RodapeFonte />
    </MolduraTela>
  );
}

function LinhaVendida({
  l,
  posicao,
  diasDoPeriodo,
}: {
  l: Linha;
  posicao: number;
  diasDoPeriodo: number;
}) {
  const cobertura = diasDeCobertura(l, diasDoPeriodo);
  const esgotado = l.estoque === 0;

  return (
    <tr
      className={`border-b border-[var(--cz-hairline)] text-[12.5px] transition-colors last:border-b-0 hover:bg-[var(--cz-fundo)] ${
        esgotado ? "bg-rose-50/30" : ""
      }`}
    >
      <CelulaAnuncio l={l} posicao={posicao} />

      <td className="px-3 py-3">
        <SeloStatus status={l.status} />
      </td>

      <CelulaEstoque estoque={l.estoque} />

      <td className="px-3 py-3 text-right">
        {esgotado ? (
          <Selo tom="critico">
            <IconeProibido className="h-3 w-3" />
            esgotado
          </Selo>
        ) : cobertura === null ? (
          <span className="text-[var(--cz-texto-fraco)]">—</span>
        ) : (
          <Selo
            tom={cobertura <= 7 ? "critico" : cobertura <= 21 ? "alerta" : "neutro"}
            className="tabular-nums"
            titulo={`No ritmo do período, o estoque atual dura cerca de ${cobertura} dia(s)`}
          >
            {cobertura <= 90 ? `${inteiro(cobertura)} d` : "90+ d"}
          </Selo>
        )}
      </td>

      <CelulaPreco preco={l.preco} />

      <td className="px-3 py-3 text-right tabular-nums text-[var(--cz-texto-suave)]">
        {inteiro(l.pedidos)}
      </td>
      <td className="px-3 py-3 text-right font-semibold tabular-nums text-[var(--cz-texto)]">
        {inteiro(l.unidades)}
      </td>
      <td className="px-3 py-3 text-right font-semibold tabular-nums text-emerald-700">
        {brl(l.faturamento)}
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-[var(--cz-texto-suave)]">
        {dataCurta(l.ultimaVenda)}
      </td>

      <CelulaAbrir l={l} />
    </tr>
  );
}
