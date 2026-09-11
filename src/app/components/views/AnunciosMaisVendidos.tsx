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
import { CampoBusca, Faixa, Selo } from "./comum/shell";
import {
  IconeAlerta,
  IconeCaixa,
  IconeDinheiro,
  IconePreco,
  IconeProibido,
  IconeSubindo,
} from "./comum/icones";
import { brl, ENTRADA, inteiro, RESUMO_VAZIO, type Linha } from "./anuncios/tipos";
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

      {/* `sm:grid-cols-3` entre o 2 e o 5: com apenas `grid-cols-2 xl:grid-cols-5`,
          toda a faixa de 640px a 1280px ficava com cartões de meia largura e um
          sobrando sozinho na última linha. */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
            icone={<IconeSubindo className="h-6 w-6" />}
            titulo="Nenhuma venda no período"
            texto="Amplie o período, solte o filtro de conta, ou sincronize as vendas se ainda não sincronizou."
          />
        ) : (
          // SEM `overflow-x-auto` e SEM `min-w`: a tabela cabe.
          //
          // Eram dez colunas e `min-w-[1120px]`, o que dava scroll horizontal em
          // qualquer tela menor que um monitor grande — e numa tabela com scroll
          // lateral a coluna do anúncio sai de vista justamente quando se olha os
          // números, então não se sabe mais de qual anúncio é a linha.
          //
          // As dez viraram cinco, agrupando por NATUREZA do dado: o que é leitura
          // ao vivo do Mercado Livre num bloco, o que é histórico de vendas em
          // outro. Ver `ThGrupo` e `CelulaAgora` em `anuncios/comum.tsx`.
          <table className="w-full table-fixed border-collapse text-left">
            {/* `table-fixed` + `colgroup`: sem isso o navegador distribui a
                largura pelo conteúdo, e um título longo faria a coluna do anúncio
                empurrar as outras a cada página — a tabela "dançaria" ao paginar. */}
            <colgroup>
              <col className="w-[42%]" />
              <col className="w-[19%]" />
              <col className="w-[14%]" />
              <col className="w-[15%]" />
              <col className="w-[10%]" />
            </colgroup>
            <CabecalhoTabela>
              <Th className="pl-5">Anúncio</Th>
              <ThGrupo titulo="Situação / Estoque / Preço" momento="agora no Mercado Livre" />
              <ThGrupo titulo="Cobertura" momento="estoque ÷ ritmo do período" align="right" />
              <ThGrupo titulo="Vendas" momento="no período filtrado" align="right" />
              <ThGrupo
                titulo="Última venda"
                momento="data e hora"
                align="right"
                className="pr-5"
              />
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
      // 13,5px: era 12,5, e com metade do conteúdo da linha em 10,5px isso fazia
      // a tabela inteira viver abaixo do corpo de texto do resto do produto.
      className={`border-b border-[var(--cz-hairline)] align-top text-[13.5px] transition-colors last:border-b-0 hover:bg-[var(--cz-fundo)] ${
        esgotado ? "bg-rose-50/40" : ""
      }`}
    >
      <CelulaAnuncio l={l} posicao={posicao} />

      {/* Situação + estoque + preço: o bloco do "agora". */}
      <CelulaAgora l={l} />

      <td className="px-3 py-3.5 text-right">
        {esgotado ? (
          <Selo tom="critico">
            <IconeProibido className="h-3.5 w-3.5" />
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

      {/* Unidades, faturamento e pedidos empilhados: o bloco do histórico.
          Unidades em destaque porque é o que ordena a tela; faturamento embaixo
          porque é a consequência; pedidos em terceiro porque quase nunca decide
          algo sozinho (é unidades ÷ itens por venda). */}
      <td className="px-3 py-3.5 text-right">
        {/* 16px nas unidades: é o número que ORDENA a tela, então é o número que
            tem de ser lido primeiro na linha. Em 12,5px ele tinha o mesmo peso do
            código do anúncio. */}
        <span className="block text-[16px] font-bold leading-none tabular-nums text-[var(--cz-texto)]">
          {inteiro(l.unidades)}
          <span className="ml-1 text-[11px] font-medium text-[var(--cz-texto-fraco)]">
            un.
          </span>
        </span>
        <span className="mt-1 block font-semibold tabular-nums text-emerald-700">
          {brl(l.faturamento)}
        </span>
        <span className="mt-0.5 block text-[11px] tabular-nums text-[var(--cz-texto-suave)]">
          {inteiro(l.pedidos)} pedido(s)
        </span>
      </td>

      {/* Data e hora, e o botão de abrir no ML embaixo. Juntar a ação nesta
          coluna é o que dispensa uma décima coluna só para um ícone. */}
      <td className="px-3 py-3.5 pr-5 text-right">
        <UltimaVenda iso={l.ultimaVenda} />
        <span className="mt-1.5 inline-flex">
          <LinkAbrir l={l} />
        </span>
      </td>
    </tr>
  );
}
