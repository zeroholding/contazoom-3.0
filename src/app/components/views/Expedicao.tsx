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
  Faixa,
  Kpi,
  Miniatura,
  MolduraTela,
  Paginacao,
  PainelFiltros,
  Selo,
  Th,
  ThOrdenavel,
} from "./comum/shell";
import { brl, ENTRADA, inteiro } from "./comum/formato";
import { SeloCanal } from "./comum/logos";
import {
  IconeAbrirFora,
  IconeAlerta,
  IconeAmpulheta,
  IconeBaixar,
  IconeBusca,
  IconeCaixa,
  IconeCamadas,
  IconeCaminhao,
  IconeDinheiro,
  IconeEtiqueta,
  IconePessoa,
  IconeRelogio,
} from "./comum/icones";
import {
  CANAIS,
  CANAL_ROTULO,
  FILTROS_PADRAO,
  rotuloPrazo,
  URGENCIA_BARRA,
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

/**
 * Ícone de cada faixa de urgência.
 *
 * A cor sozinha não basta: quem não distingue vermelho de âmbar (cerca de 8% dos
 * homens) lê a coluna toda como a mesma coisa. O ícone é o segundo canal da
 * mesma informação, e é ele que faz "atrasado" e "vence hoje" se separarem num
 * relance mesmo em tela ruim.
 */
const ICONE_URGENCIA: Record<Urgencia, React.ReactNode> = {
  atrasado: <IconeAlerta className="h-3.5 w-3.5" />,
  hoje: <IconeAmpulheta className="h-3.5 w-3.5" />,
  amanha: <IconeRelogio className="h-3.5 w-3.5" />,
  proximo: <IconeCalendarioCurto />,
  futuro: <IconeCalendarioCurto />,
  semPrazo: <IconeRelogioVazio />,
};

/** Envolvem os ícones do conjunto só para fixar o tamanho usado no selo. */
function IconeCalendarioCurto() {
  return <IconeRelogio className="h-3.5 w-3.5" />;
}
function IconeRelogioVazio() {
  return <IconeRelogio className="h-3.5 w-3.5 opacity-60" />;
}

function SeloUrgencia({ urgencia, dias }: { urgencia: Urgencia; dias: number | null }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] ${URGENCIA_CLASSE[urgencia]}`}
      title={rotuloPrazo(dias)}
    >
      {ICONE_URGENCIA[urgencia]}
      {URGENCIA_ROTULO[urgencia]}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Linha                                    */
/* -------------------------------------------------------------------------- */

function Linha({ pacote }: { pacote: PacoteExpedicao }) {
  return (
    // A barra de urgência é uma BORDA ESQUERDA de 4px na própria linha, não um
    // elemento posicionado. Numa `<tr>`, um `absolute` precisaria de um
    // `relative` na célula e o navegador ainda pode recolher a altura; a borda
    // acompanha a linha inteira de graça, mesmo quando o pacote tem cinco itens.
    <tr
      className={`border-b border-l-4 border-[var(--cz-hairline)] align-top last:border-b-0 hover:bg-[var(--cz-fundo)] ${URGENCIA_BARRA[pacote.urgencia]}`}
    >
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
        <div className="flex items-center gap-2">
          {/* O LOGO no lugar da sigla. "ML" e "SP" numa pastilha obrigavam a
              decodificar a abreviação; o logo é reconhecido antes de ser lido, e
              numa fila que se varre com o olho isso é a diferença entre ler a
              coluna e conferi-la. */}
          <SeloCanal canal={pacote.canal} />
          <div className="min-w-0">
            <span className="block truncate text-[12px] font-semibold text-[var(--cz-texto)]">
              {pacote.conta}
            </span>
            <span className="block text-[10.5px] text-[var(--cz-texto-suave)]">
              Venda {dataCurtaSP(pacote.dataVenda)}
            </span>
          </div>
        </div>
      </td>

      <td className="px-3 py-3">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 font-mono text-[11.5px] font-semibold text-[var(--cz-texto)]">
            <IconeEtiqueta className="h-3.5 w-3.5 shrink-0 text-[var(--cz-texto-fraco)]" />
            {pacote.shippingId ?? "sem etiqueta"}
          </span>
          <span className="flex items-center gap-1.5 text-[10.5px] text-[var(--cz-texto-suave)]">
            <IconePessoa className="h-3.5 w-3.5 shrink-0 text-[var(--cz-texto-fraco)]" />
            <span className="truncate">{pacote.comprador}</span>
          </span>
          {/* Só aparece quando o pacote junta mais de uma venda. É a informação
              que explica por que a contagem de pacotes é menor que a de pedidos —
              sem ela, a diferença parece defeito. */}
          {pacote.pedidos > 1 && (
            <Selo tom="info" titulo="Vendas diferentes que saem na mesma etiqueta">
              <IconeCaixa className="h-3 w-3" />
              {pacote.pedidos} pedidos juntos
            </Selo>
          )}
        </div>
      </td>

      <td className="px-3 py-3">
        {/* Todos os itens, sem expandir. Esta coluna É a lista de separação: quem
            olha a tela precisa saber o que buscar na prateleira, e esconder isso
            atrás de um clique transformaria a tarefa em dois passos. */}
        <ul className="flex flex-col gap-2">
          {pacote.itens.map((item) => (
            <li key={item.orderId} className="flex items-start gap-2.5">
              {/* A FOTO da variação vendida, não a capa do anúncio. Quem separa
                  confere cor e tamanho pela imagem antes de fechar a caixa; num
                  anúncio de seis cores a capa é a mesma para as seis e a foto
                  deixaria de ajudar exatamente onde mais importa. */}
              <Miniatura src={item.thumbnailUrl} alt={item.titulo} tamanho={44} />

              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-start gap-1.5">
                  <span className="inline-flex h-5 min-w-[1.5rem] shrink-0 items-center justify-center rounded-md border border-[var(--cz-hairline-forte)] bg-[var(--cz-fundo)] px-1 text-[11px] font-bold tabular-nums">
                    {item.quantidade}
                  </span>
                  {item.permalink ? (
                    <a
                      href={item.permalink}
                      target="_blank"
                      rel="noreferrer"
                      title={`Abrir "${item.titulo}" no Mercado Livre`}
                      className="inline-flex min-w-0 items-center gap-1 text-[12px] font-semibold text-[var(--cz-texto)] transition-colors hover:text-[var(--cz-laranja-forte)]"
                    >
                      <span className="truncate">{item.titulo}</span>
                      <IconeAbrirFora className="h-3 w-3 shrink-0 opacity-60" />
                    </a>
                  ) : (
                    <span
                      className="truncate text-[12px] font-semibold text-[var(--cz-texto)]"
                      title={item.titulo}
                    >
                      {item.titulo}
                    </span>
                  )}
                </span>

                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-[calc(1.5rem+0.375rem)] text-[10.5px] text-[var(--cz-texto-suave)]">
                  <span className="font-mono">{item.sku ?? "sem SKU"}</span>
                  <span className="font-mono opacity-70">#{item.orderId}</span>
                  {item.hierarquia1 && (
                    <Selo tom="neutro" titulo="Categoria do cadastro de SKU">
                      <IconeCamadas className="h-3 w-3" />
                      {item.hierarquia1}
                    </Selo>
                  )}
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

/**
 * Textos de cada uma das três telas.
 *
 * Três rotas, UM componente. A alternativa seria copiar a tela três vezes e
 * trocar o filtro de canal — e é assim que a correção de amanhã entra em uma das
 * cópias e não nas outras. O que muda entre elas é literalmente o título, a
 * descrição, e se o filtro de canal aparece.
 */
const TEXTOS: Record<
  "geral" | "ML" | "SP",
  { titulo: string; descricao: string }
> = {
  geral: {
    titulo: "Expedição Geral",
    descricao:
      "Pacotes a despachar no Mercado Livre e na Shopee juntos, na ordem em que o prazo vence. Vendas FULL não aparecem: nelas quem despacha é o próprio Mercado Livre.",
  },
  ML: {
    titulo: "Expedição Mercado Livre",
    descricao:
      "Pacotes do Mercado Livre a despachar, na ordem em que o prazo vence. Vendas FULL não aparecem: nelas quem despacha é o próprio Mercado Livre.",
  },
  SP: {
    titulo: "Expedição Shopee",
    descricao:
      "Pacotes da Shopee a despachar, na ordem em que o prazo vence. Entram os pedidos prontos para envio, processados e em nova tentativa.",
  },
};

export default function Expedicao({
  /**
   * Quando informado, a tela é de UM canal e o filtro de canal desaparece.
   *
   * Some em vez de ficar travado num valor: um select desabilitado mostrando
   * "Shopee" numa tela chamada "Expedição Shopee" é um controle que só pode fazer
   * uma coisa — ruído com aparência de opção.
   */
  canalFixo,
}: {
  canalFixo?: Canal;
} = {}) {
  const [filtros, setFiltros] = useState<FiltrosExpedicao>({
    ...FILTROS_PADRAO,
    canais: canalFixo ? [canalFixo] : [],
  });
  const { dados, carregando, atualizando, erro, atualizar } = useExpedicao(filtros);
  const textos = TEXTOS[canalFixo ?? "geral"];

  /**
   * O padrão desta tela. Em tela de canal único o canal faz parte do padrão, e
   * não de um filtro que a pessoa escolheu — senão "Limpar filtros" na tela da
   * Shopee traria pacotes do Mercado Livre.
   */
  const padrao = useMemo<FiltrosExpedicao>(
    () => ({ ...FILTROS_PADRAO, canais: canalFixo ? [canalFixo] : [] }),
    [canalFixo],
  );

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
  const modalidades = dados?.modalidades ?? [];

  const vazio = !carregando && (dados?.pacotes.length ?? 0) === 0;

  /**
   * "Sem filtro" ignora o canal quando ele é fixo da tela: na Expedição Shopee o
   * canal não é escolha, então a lista vazia ali significa "nada a despachar" e
   * não "seus filtros não acharam nada".
   */
  const semFiltro = useMemo(
    () =>
      (canalFixo ? true : filtros.canais.length === 0) &&
      filtros.contas.length === 0 &&
      filtros.urgencias.length === 0 &&
      filtros.modalidades.length === 0 &&
      filtros.busca.trim() === "",
    [filtros, canalFixo],
  );

  /**
   * O select de conta só oferece contas DO canal da tela.
   *
   * Sem isso, a Expedição Shopee listaria as contas do Mercado Livre no filtro, e
   * escolher uma delas devolveria zero pacotes sem explicar por quê.
   */
  const contasDoCanal = useMemo(() => {
    // `dados?.contas` lido AQUI DENTRO, e não de uma variável de fora: `?? []`
    // cria um array novo a cada render, o que faria este `useMemo` recalcular
    // sempre e deixaria de ser memo nenhum.
    const todas = dados?.contas ?? [];
    return canalFixo ? todas.filter((c) => c.canal === canalFixo) : todas;
  }, [dados?.contas, canalFixo]);

  return (
    <MolduraTela>
      <Cabecalho
        titulo={textos.titulo}
        descricao={textos.descricao}
        acao={
          <div className="flex flex-wrap items-center gap-2">
            <BotaoSecundario
              onClick={() => baixarCsv(filtros)}
              desabilitado={carregando || (dados?.total ?? 0) === 0}
            >
              <IconeBaixar className="h-4 w-4" />
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
        <Faixa tom="alerta" icone={<IconeRelogio className="h-4 w-4" />}>
          <strong>{inteiro(dados.prazoPendente)}</strong> vendas ainda estão tendo o
          prazo lido do histórico. Enquanto isso, elas podem aparecer como{" "}
          <em>sem prazo</em>, no fim da fila. O preenchimento continua a cada visita
          a esta tela.
        </Faixa>
      )}

      {erro && (
        <Faixa tom="critico" icone={<IconeAlerta className="h-4 w-4" />}>
          Não foi possível carregar a fila: {erro}
        </Faixa>
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
          icone={<IconeAlerta className="h-5 w-5" />}
        />
        <Kpi
          rotulo="Vencem hoje"
          valor={inteiro(porUrgencia?.hoje ?? 0)}
          nota="despachar ainda hoje"
          tom={URGENCIA_TOM.hoje}
          icone={<IconeAmpulheta className="h-5 w-5" />}
        />
        <Kpi
          rotulo="Vencem amanhã"
          valor={inteiro(porUrgencia?.amanha ?? 0)}
          icone={<IconeRelogio className="h-5 w-5" />}
        />
        <Kpi
          rotulo="Pacotes na fila"
          valor={inteiro(dados?.total ?? 0)}
          nota={`${inteiro(dados?.unidades ?? 0)} unidades`}
          destaque
          icone={<IconeCaminhao className="h-5 w-5" />}
        />
        <Kpi
          rotulo="Valor na fila"
          valor={brl(dados?.valorTotal ?? 0)}
          icone={<IconeDinheiro className="h-5 w-5" />}
        />
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
              {ICONE_URGENCIA[u]}
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
          {/* Lupa dentro do campo. O `pl-9` abre o espaço dela; sem isso o ícone
              fica por cima do texto digitado — o mesmo defeito da seta do menu
              sobre o breadcrumb. */}
          <span className="relative block">
            <IconeBusca className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cz-texto-fraco)]" />
            <input
              type="search"
              value={filtros.busca}
              onChange={(e) => mudar({ busca: e.target.value })}
              placeholder="Pedido, etiqueta, SKU, produto ou comprador"
              className={`${ENTRADA} pl-9`}
            />
          </span>
        </Campo>

        {!canalFixo && (
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
        )}

        <Campo rotulo="Conta" className="lg:col-span-2">
          <select
            value={filtros.contas[0] ?? ""}
            onChange={(e) => mudar({ contas: e.target.value ? [e.target.value] : [] })}
            className={ENTRADA}
          >
            <option value="">Todas</option>
            {contasDoCanal.map((c) => (
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
            icone={<IconeCaminhao className="h-6 w-6" />}
            titulo={semFiltro ? "Nada a despachar" : "Nenhum pacote com esses filtros"}
            texto={
              semFiltro
                ? "Nenhuma venda do Mercado Livre ou da Shopee está aguardando despacho na janela escolhida. Se acabou de vender, sincronize as vendas para a fila atualizar."
                : "Os filtros ativos não deixaram nenhum pacote. Tente limpar a urgência selecionada ou alargar a janela de datas."
            }
            acao={
              !semFiltro ? (
                <BotaoSecundario onClick={() => setFiltros(padrao)}>
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
