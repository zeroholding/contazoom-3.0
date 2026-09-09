"use client";

/**
 * Expedição: o que tem de ser despachado, na ordem em que vence.
 *
 * A tela responde a uma pergunta só, e a resposta é a ORDEM da lista. Por isso a
 * ordenação padrão é o prazo crescente e os indicadores de cima são contagens por
 * faixa de urgência: quem abre isto às 8h quer saber quantos pacotes já estão
 * atrasados e quantos vencem hoje, antes de olhar qualquer linha.
 *
 * A unidade é o PACOTE, não a venda. Ver `PacoteExpedicao` em `src/lib/expedicao.ts`.
 */

import { useCallback, useMemo, useState } from "react";

import {
  Aviso,
  BotaoAtualizar,
  BotaoSecundario,
  CabecalhoTabela,
  Cabecalho,
  Campo,
  Esqueleto,
  Kpi,
  MolduraTela,
  Paginacao,
  PainelFiltros,
  Th,
  ThOrdenavel,
} from "./comum/shell";
import { brl, ENTRADA, inteiro } from "./comum/formato";
import {
  CANAIS,
  CANAL_ROTULO,
  FILTROS_PADRAO,
  rotuloPrazo,
  URGENCIA_CLASSE,
  URGENCIA_ROTULO,
  URGENCIA_TOM,
  URGENCIAS,
  type Canal,
  type FiltrosExpedicao,
  type OrdemExpedicao,
  type PacoteExpedicao,
  type Urgencia,
} from "@/lib/expedicao";
import { baixarCsv, useExpedicao } from "./expedicao/useExpedicao";

/**
 * Janelas oferecidas.
 *
 * A janela existe para a consulta não varrer a tabela inteira (ver
 * `fragmentoJanela` em `expedicao-data.ts`). Ela aparece na tela, e não escondida
 * no servidor, porque é um filtro que ESCONDE trabalho: quem tem um pedido antigo
 * preso precisa poder alargar a janela e enxergá-lo.
 */
const JANELAS = [15, 30, 60, 90, 180, 365];

/** Prazo em "09/09 às 18:00", no fuso de São Paulo. */
function prazoCurto(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dataCurtaSP(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/* -------------------------------------------------------------------------- */
/*                                  Etiquetas                                 */
/* -------------------------------------------------------------------------- */

function SeloUrgencia({ urgencia, dias }: { urgencia: Urgencia; dias: number | null }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] ${URGENCIA_CLASSE[urgencia]}`}
      title={rotuloPrazo(dias)}
    >
      {URGENCIA_ROTULO[urgencia]}
    </span>
  );
}

function SeloCanal({ canal }: { canal: Canal }) {
  // Amarelo para o ML e laranja para a Shopee: são as cores das próprias marcas,
  // que é como a pessoa já identifica a origem do pedido. Não conflita com o
  // laranja de ação porque aqui o selo não é clicável.
  const classe =
    canal === "ML"
      ? "border-yellow-200 bg-yellow-50 text-yellow-800"
      : "border-orange-200 bg-orange-50 text-orange-800";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${classe}`}
    >
      {canal}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Linha                                    */
/* -------------------------------------------------------------------------- */

function Linha({ pacote }: { pacote: PacoteExpedicao }) {
  return (
    <tr className="border-b border-[var(--cz-hairline)] align-top last:border-0 hover:bg-[var(--cz-fundo)]">
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1">
          <SeloUrgencia urgencia={pacote.urgencia} dias={pacote.diasRestantes} />
          <span className="text-[12px] font-semibold tabular-nums text-[var(--cz-texto)]">
            {prazoCurto(pacote.prazoDespacho)}
          </span>
          <span className="text-[10.5px] text-[var(--cz-texto-suave)]">
            {rotuloPrazo(pacote.diasRestantes)}
          </span>
        </div>
      </td>

      <td className="px-3 py-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <SeloCanal canal={pacote.canal} />
            <span className="text-[12px] font-semibold text-[var(--cz-texto)]">
              {pacote.conta}
            </span>
          </div>
          <span className="text-[10.5px] text-[var(--cz-texto-suave)]">
            Venda {dataCurtaSP(pacote.dataVenda)}
          </span>
        </div>
      </td>

      <td className="px-3 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[11.5px] font-semibold text-[var(--cz-texto)]">
            {pacote.shippingId ?? "sem etiqueta"}
          </span>
          <span className="text-[10.5px] text-[var(--cz-texto-suave)]">
            {pacote.comprador}
          </span>
          {/* Só aparece quando o pacote junta mais de uma venda. É a informação
              que explica por que a contagem de pacotes é menor que a de pedidos —
              sem ela, a diferença parece defeito. */}
          {pacote.pedidos > 1 && (
            <span className="text-[10.5px] font-semibold text-sky-700">
              {pacote.pedidos} pedidos na mesma etiqueta
            </span>
          )}
        </div>
      </td>

      <td className="px-3 py-3">
        {/* Todos os itens, sem expandir. Esta coluna É a lista de separação: quem
            olha a tela precisa saber o que buscar na prateleira, e esconder isso
            atrás de um clique transformaria a tarefa em dois passos. */}
        <ul className="flex flex-col gap-1.5">
          {pacote.itens.map((item) => (
            <li key={item.orderId} className="flex gap-2">
              <span className="mt-0.5 inline-flex h-5 min-w-[1.5rem] shrink-0 items-center justify-center rounded-md border border-[var(--cz-hairline-forte)] bg-[var(--cz-fundo)] px-1 text-[11px] font-bold tabular-nums">
                {item.quantidade}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[12px] text-[var(--cz-texto)]" title={item.titulo}>
                  {item.titulo}
                </span>
                <span className="font-mono text-[10.5px] text-[var(--cz-texto-suave)]">
                  {item.sku ?? "sem SKU"} · {item.orderId}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </td>

      <td className="px-3 py-3 text-right text-[12px] font-bold tabular-nums">
        {inteiro(pacote.unidades)}
      </td>

      <td className="px-3 py-3 text-right text-[12px] font-semibold tabular-nums">
        {brl(pacote.valorTotal)}
      </td>

      <td className="px-3 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11.5px] font-semibold text-[var(--cz-texto)]">
            {pacote.modalidade}
          </span>
          {pacote.shippingStatus && (
            <span className="text-[10.5px] text-[var(--cz-texto-suave)]">
              {pacote.shippingStatus}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Tela                                     */
/* -------------------------------------------------------------------------- */

export default function Expedicao() {
  const [filtros, setFiltros] = useState<FiltrosExpedicao>({ ...FILTROS_PADRAO });
  const { dados, carregando, atualizando, erro, atualizar } = useExpedicao(filtros);

  /**
   * Toda alteração de filtro volta para a página 1.
   *
   * Sem isso, quem está na página 7 e restringe para "atrasados" cai numa página
   * que não existe mais e vê a lista vazia — e conclui que não há atrasados.
   */
  const mudar = useCallback((parcial: Partial<FiltrosExpedicao>) => {
    setFiltros((atual) => ({ ...atual, ...parcial, pagina: 1 }));
  }, []);

  const alternarUrgencia = useCallback((urgencia: Urgencia) => {
    setFiltros((atual) => {
      const ativa = atual.urgencias.includes(urgencia);
      return {
        ...atual,
        urgencias: ativa
          ? atual.urgencias.filter((u) => u !== urgencia)
          : [...atual.urgencias, urgencia],
        pagina: 1,
      };
    });
  }, []);

  const ordenar = useCallback((ordem: OrdemExpedicao, direcao: "asc" | "desc") => {
    setFiltros((atual) => ({ ...atual, ordem, direcao, pagina: 1 }));
  }, []);

  const porUrgencia = dados?.porUrgencia;
  const contas = dados?.contas ?? [];
  const modalidades = dados?.modalidades ?? [];

  const vazio = !carregando && (dados?.pacotes.length ?? 0) === 0;

  const semFiltro = useMemo(
    () =>
      filtros.canais.length === 0 &&
      filtros.contas.length === 0 &&
      filtros.urgencias.length === 0 &&
      filtros.modalidades.length === 0 &&
      filtros.busca.trim() === "",
    [filtros],
  );

  return (
    <MolduraTela>
      <Cabecalho
        titulo="Expedição"
        descricao="Pacotes a despachar no Mercado Livre e na Shopee, na ordem em que o prazo vence. Vendas FULL não aparecem: nelas quem despacha é o próprio Mercado Livre."
        acao={
          <div className="flex flex-wrap items-center gap-2">
            <BotaoSecundario
              onClick={() => baixarCsv(filtros)}
              desabilitado={carregando || (dados?.total ?? 0) === 0}
            >
              Baixar lista de separação
            </BotaoSecundario>
            <BotaoAtualizar
              onClick={atualizar}
              atualizando={atualizando}
              desabilitado={carregando}
              rotulo="Atualizar fila"
              rotuloAtivo="Atualizando…"
            />
          </div>
        }
      />

      {/* O aviso do backfill existe para explicar a ÚNICA incoerência possível
          aqui: pacote sem prazo enquanto o preenchimento do histórico não
          terminou. Sem ele, a conclusão natural é que o sistema perdeu o prazo. */}
      {dados && dados.prazoPendente > 0 && (
        <div className="mt-4 rounded-[var(--cz-raio-cartao)] border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">
          <strong>{inteiro(dados.prazoPendente)}</strong> vendas ainda estão tendo o
          prazo lido do histórico. Enquanto isso, elas podem aparecer como{" "}
          <em>sem prazo</em>. O preenchimento continua a cada visita a esta tela.
        </div>
      )}

      {erro && (
        <div className="mt-4 rounded-[var(--cz-raio-cartao)] border border-rose-200 bg-rose-50 px-4 py-3 text-[12.5px] text-rose-800">
          Não foi possível carregar a fila: {erro}
        </div>
      )}

      {/* Indicadores. Atrasado e "vence hoje" ganham tom próprio (vermelho e
          âmbar) porque são as duas únicas linhas que mudam o que a pessoa faz nos
          próximos minutos. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi
          rotulo="Atrasados"
          valor={inteiro(porUrgencia?.atrasado ?? 0)}
          nota="prazo já venceu"
          tom={URGENCIA_TOM.atrasado}
        />
        <Kpi
          rotulo="Vencem hoje"
          valor={inteiro(porUrgencia?.hoje ?? 0)}
          nota="despachar ainda hoje"
          tom={URGENCIA_TOM.hoje}
        />
        <Kpi
          rotulo="Vencem amanhã"
          valor={inteiro(porUrgencia?.amanha ?? 0)}
        />
        <Kpi
          rotulo="Pacotes na fila"
          valor={inteiro(dados?.total ?? 0)}
          nota={`${inteiro(dados?.unidades ?? 0)} unidades`}
          destaque
        />
        <Kpi rotulo="Valor na fila" valor={brl(dados?.valorTotal ?? 0)} />
      </div>

      {/* Fichas de urgência: filtro e panorama na mesma peça. As contagens NÃO
          mudam ao selecionar uma faixa (o servidor as calcula sem o filtro de
          urgência), senão escolher "atrasado" zeraria as outras cinco e apagaria
          justamente a visão do todo. */}
      <div className="mt-4 flex flex-wrap gap-2">
        {URGENCIAS.map((u) => {
          const ativa = filtros.urgencias.includes(u);
          return (
            <button
              key={u}
              type="button"
              onClick={() => alternarUrgencia(u)}
              aria-pressed={ativa}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                ativa
                  ? "border-[var(--cz-laranja)] bg-[var(--cz-laranja)] text-white"
                  : `${URGENCIA_CLASSE[u]} hover:brightness-95`
              }`}
            >
              {URGENCIA_ROTULO[u]}
              <span className="tabular-nums opacity-80">
                {inteiro(porUrgencia?.[u] ?? 0)}
              </span>
            </button>
          );
        })}
      </div>

      <PainelFiltros
        nota={
          <p className="mt-3 text-[11px] text-[var(--cz-texto-suave)]">
            A janela limita a busca pela data da venda e existe para a consulta não
            varrer a base inteira. Se um pedido antigo estiver preso sem despachar,
            alargue a janela para vê-lo.
          </p>
        }
      >
        <Campo rotulo="Buscar" className="lg:col-span-4">
          <input
            type="search"
            value={filtros.busca}
            onChange={(e) => mudar({ busca: e.target.value })}
            placeholder="Pedido, etiqueta, SKU, produto ou comprador"
            className={ENTRADA}
          />
        </Campo>

        <Campo rotulo="Canal" className="lg:col-span-2">
          <select
            value={filtros.canais[0] ?? ""}
            onChange={(e) =>
              mudar({ canais: e.target.value ? [e.target.value as Canal] : [] })
            }
            className={ENTRADA}
          >
            <option value="">Todos</option>
            {CANAIS.map((c) => (
              <option key={c} value={c}>
                {CANAL_ROTULO[c]}
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Conta" className="lg:col-span-2">
          <select
            value={filtros.contas[0] ?? ""}
            onChange={(e) => mudar({ contas: e.target.value ? [e.target.value] : [] })}
            className={ENTRADA}
          >
            <option value="">Todas</option>
            {contas.map((c) => (
              <option key={c.accountId} value={c.accountId}>
                {c.conta} ({inteiro(c.pacotes)})
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Envio" className="lg:col-span-2">
          <select
            value={filtros.modalidades[0] ?? ""}
            onChange={(e) =>
              mudar({ modalidades: e.target.value ? [e.target.value] : [] })
            }
            className={ENTRADA}
          >
            <option value="">Todos</option>
            {modalidades.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Janela" className="lg:col-span-2">
          <select
            value={filtros.janelaDias}
            onChange={(e) => mudar({ janelaDias: Number(e.target.value) })}
            className={ENTRADA}
          >
            {JANELAS.map((d) => (
              <option key={d} value={d}>
                {d} dias
              </option>
            ))}
          </select>
        </Campo>
      </PainelFiltros>

      <section className="mt-4 overflow-hidden rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] shadow-[var(--cz-elev-1)]">
        {carregando ? (
          <Esqueleto linhas={8} />
        ) : vazio ? (
          <Aviso
            titulo={semFiltro ? "Nada a despachar" : "Nenhum pacote com esses filtros"}
            texto={
              semFiltro
                ? "Nenhuma venda do Mercado Livre ou da Shopee está aguardando despacho na janela escolhida. Se acabou de vender, sincronize as vendas para a fila atualizar."
                : "Os filtros ativos não deixaram nenhum pacote. Tente limpar a urgência selecionada ou alargar a janela de datas."
            }
            acao={
              !semFiltro ? (
                <BotaoSecundario onClick={() => setFiltros({ ...FILTROS_PADRAO })}>
                  Limpar filtros
                </BotaoSecundario>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-left">
                <CabecalhoTabela>
                  <ThOrdenavel
                    campo="prazo"
                    rotulo="Prazo"
                    ordemAtual={filtros.ordem}
                    direcaoAtual={filtros.direcao}
                    onOrdenar={ordenar}
                    align="left"
                  />
                  <ThOrdenavel
                    campo="venda"
                    rotulo="Conta"
                    ordemAtual={filtros.ordem}
                    direcaoAtual={filtros.direcao}
                    onOrdenar={ordenar}
                    align="left"
                  />
                  <Th>Etiqueta / Comprador</Th>
                  <Th>Itens a separar</Th>
                  <ThOrdenavel
                    campo="unidades"
                    rotulo="Unid."
                    ordemAtual={filtros.ordem}
                    direcaoAtual={filtros.direcao}
                    onOrdenar={ordenar}
                  />
                  <ThOrdenavel
                    campo="valor"
                    rotulo="Valor"
                    ordemAtual={filtros.ordem}
                    direcaoAtual={filtros.direcao}
                    onOrdenar={ordenar}
                  />
                  <Th>Envio</Th>
                </CabecalhoTabela>
                <tbody>
                  {dados?.pacotes.map((pacote) => (
                    <Linha key={pacote.chave} pacote={pacote} />
                  ))}
                </tbody>
              </table>
            </div>

            <Paginacao
              pagina={filtros.pagina}
              totalPaginas={dados?.totalPaginas ?? 1}
              total={dados?.total ?? 0}
              porPagina={filtros.porPagina}
              onPagina={(p) => setFiltros((atual) => ({ ...atual, pagina: p }))}
              onPorPagina={(v) => mudar({ porPagina: v })}
              rotulo="pacotes"
              opcoesPorPagina={[25, 50, 100, 200]}
            />
          </>
        )}
      </section>
    </MolduraTela>
  );
}
