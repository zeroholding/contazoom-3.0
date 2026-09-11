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
  CampoBusca,
  Esqueleto,
  Faixa,
  GrupoRecorte,
  Kpi,
  Miniatura,
  MolduraTela,
  MultiSelecao,
  Paginacao,
  PainelFiltros,
  Selo,
  Th,
  ThOrdenavel,
} from "./comum/shell";
import { brl, ENTRADA, inteiro } from "./comum/formato";
import { LogoCanal, SeloCanal } from "./comum/logos";
import {
  IconeAbrirFora,
  IconeAlerta,
  IconeAmpulheta,
  IconeBaixar,
  IconeCaixa,
  IconeCaixas,
  IconeCalendario,
  IconeCamadas,
  IconeCaminhao,
  IconeDinheiro,
  IconeEtiqueta,
  IconePessoa,
  IconeRelogio,
  IconeSku,
} from "./comum/icones";
import {
  CANAIS,
  CANAL_ROTULO,
  FILTROS_PADRAO,
  PRAZO_PRESETS,
  rotuloPrazo,
  STATUS_VENDA,
  TEM_PRAZO,
  URGENCIA_BARRA,
  URGENCIA_CLASSE,
  URGENCIA_ROTULO,
  URGENCIA_TOM,
  URGENCIAS,
  type Canal,
  type FiltrosExpedicao,
  type LinhaResumo,
  type OrdemExpedicao,
  type PacoteExpedicao,
  type PrazoPreset,
  type StatusVenda,
  type TemPrazo,
  type Urgencia,
} from "@/lib/expedicao";
import { statusEnvio, transportadoraShopee } from "@/lib/expedicao-status";
import BotaoEtiqueta from "./expedicao/BotaoEtiqueta";
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

/**
 * A frase de apoio de cada atalho de prazo, mostrada só para o que está aceso.
 *
 * Existe porque os atalhos parecem óbvios e não são: "Próximos 3 dias" INCLUI o
 * que vence hoje, e "Atrasados" não tem piso — pega o pacote parado há três meses.
 * Sem a frase, a pessoa descobre isso pela contagem que não fecha.
 */
const EXPLICACAO_PRAZO: Partial<Record<PrazoPreset, string>> = {
  aDespachar:
    "O trabalho de hoje: o que vence hoje MAIS tudo o que já venceu. É o recorte com que a tela abre.",
  atrasados: "Tudo cujo prazo já passou, sem limite de quanto tempo atrás.",
  hoje: "Prazo de despacho caindo hoje, no fuso de São Paulo — o dia inteiro, inclusive um prazo às 23h.",
  amanha: "Prazo caindo amanhã. Serve para adiantar o que já pode ser separado hoje.",
  proximos3: "De hoje até três dias à frente. Inclui o que vence hoje, porque é a primeira coisa do plano.",
  proximos7: "De hoje até sete dias à frente. A semana de trabalho inteira.",
  esteMes: "Do primeiro ao último dia do mês corrente.",
  todas:
    "Sem recorte de prazo: a fila inteira dentro da janela. As fichas de urgência abaixo mostram como ela se distribui.",
  personalizado: "Escolha as datas de prazo nos campos abaixo.",
};

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
  // Calendário nas duas faixas com folga: elas são de PLANEJAMENTO, não de
  // pressa, e o relógio (que é o ícone da urgência) daria a elas a mesma
  // linguagem visual do que vence amanhã.
  proximo: <IconeCalendario className="h-3.5 w-3.5" />,
  futuro: <IconeCalendario className="h-3.5 w-3.5" />,
  // Meio apagado: é ausência de informação, não gravidade. Mesmo raciocínio do
  // cinza em `URGENCIA_CLASSE`.
  semPrazo: <IconeRelogio className="h-3.5 w-3.5 opacity-50" />,
};

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
  const estado = statusEnvio(pacote.canal, pacote.shippingStatus, pacote.status);
  const transportadora = transportadoraShopee(pacote.shippingStatus);

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
        {/* O estado do pacote vem TRADUZIDO por `statusEnvio`, que sabe qual
            coluna vale em cada canal. No ML vale `shipping_status`; na Shopee
            aquela coluna guarda a TRANSPORTADORA e o estado real está em
            `status` — ver a armadilha no topo de `expedicao-status.ts`. */}
        <div className="flex flex-col items-start gap-1">
          {/* Sem `titulo` no selo: a explicação já aparece por extenso abaixo, e
              repetir a mesma frase num tooltip só cria um segundo lugar para ela
              divergir. */}
          <Selo tom={estado.tom}>{estado.rotulo}</Selo>
          <span className="text-[11.5px] font-semibold text-[var(--cz-texto)]">
            {pacote.modalidade}
          </span>
          {/* Só na Shopee: no ML esta linha repetiria a modalidade, que já está
              logo acima. */}
          {pacote.canal === "SP" && transportadora && (
            <span className="flex items-center gap-1 text-[10.5px] text-[var(--cz-texto-suave)]">
              <IconeCaminhao className="h-3 w-3 shrink-0" />
              {transportadora}
            </span>
          )}
          {estado.explicacao && (
            <span className="text-[10.5px] leading-snug text-[var(--cz-texto-suave)]">
              {estado.explicacao}
            </span>
          )}
        </div>
      </td>

      <td className="px-3 py-3">
        {/* Etiqueta só no Mercado Livre. A Shopee não expõe a etiqueta pelos
            endpoints que este projeto usa, e desenhar um botão desabilitado em
            toda linha da Shopee prometeria um recurso que não existe. O texto no
            lugar dele diz onde imprimir de fato. */}
        {pacote.canal === "ML" ? (
          <div className="flex flex-wrap gap-1.5">
            <BotaoEtiqueta
              shippingId={pacote.shippingId}
              contaId={pacote.accountId}
              tipo="pdf"
            />
            <BotaoEtiqueta
              shippingId={pacote.shippingId}
              contaId={pacote.accountId}
              tipo="zpl"
            />
          </div>
        ) : (
          <span className="text-[10.5px] leading-snug text-[var(--cz-texto-fraco)]">
            Etiqueta no painel da Shopee
          </span>
        )}
      </td>
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Resumos do rodapé                               */
/* -------------------------------------------------------------------------- */

/**
 * "Onde o trabalho está concentrado".
 *
 * A lista de cima responde O QUE despachar; isto responde POR ONDE COMEÇAR.
 * Trinta pacotes espalhados em dez categorias é um dia de trabalho diferente de
 * trinta pacotes na mesma prateleira, e a lista paginada não mostra essa
 * diferença — a página 1 parece igual nos dois casos.
 *
 * Fica no RODAPÉ, e não no topo: é informação de planejamento, e acima da fila
 * empurraria para baixo a única coisa que precisa estar visível ao abrir a tela.
 *
 * Some quando há uma linha só. Um resumo de um item não resume nada — repete o
 * total que já está no cartão de indicadores, com mais tinta.
 */
function TabelaResumo({
  titulo,
  nota,
  icone,
  linhas,
}: {
  titulo: string;
  nota: string;
  icone: React.ReactNode;
  linhas: LinhaResumo[];
}) {
  if (linhas.length < 2) return null;

  // A barra de proporção usa UNIDADES, não pacotes: o que dimensiona o trabalho
  // de separação é quanto sai da prateleira, e uma categoria com dois pacotes de
  // vinte itens pesa mais que uma com cinco pacotes de um.
  const totalUnidades = linhas.reduce((s, l) => s + l.unidades, 0);

  return (
    <section className="overflow-hidden rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] shadow-[var(--cz-elev-1)]">
      <header className="flex items-start gap-2 border-b border-[var(--cz-hairline)] px-3.5 py-3">
        <span className="mt-0.5 text-[var(--cz-texto-fraco)]">{icone}</span>
        <span className="min-w-0">
          <h3 className="text-[13px] font-bold text-[var(--cz-texto)]">{titulo}</h3>
          <p className="text-[11px] leading-snug text-[var(--cz-texto-suave)]">{nota}</p>
        </span>
      </header>

      <table className="w-full border-collapse text-left">
        {/* Cabeçalho miúdo, mas presente: sem ele, "12 / 40 un. / R$ 900" obriga a
            adivinhar o que é 12 — pacote, venda ou item. */}
        <thead>
          <tr className="border-b border-[var(--cz-hairline)] text-[9.5px] font-bold uppercase tracking-[0.06em] text-[var(--cz-texto-fraco)]">
            <th className="px-3.5 py-1.5 text-left font-bold">{titulo.replace("Por ", "")}</th>
            <th className="px-2 py-1.5 text-right font-bold">Vendas</th>
            <th className="px-2 py-1.5 text-right font-bold">Unid.</th>
            <th className="px-3.5 py-1.5 text-right font-bold">Valor</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => {
            // Barra de proporção no fundo da célula do rótulo. É o que transforma
            // uma coluna de números numa distribuição legível de relance — sem
            // ela, achar a maior pilha exige comparar sete números.
            const fatia =
              totalUnidades > 0 ? Math.round((linha.unidades / totalUnidades) * 100) : 0;

            return (
              <tr
                key={linha.rotulo}
                className="border-b border-[var(--cz-hairline)] last:border-b-0"
              >
                <td className="relative px-3.5 py-2">
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-[var(--cz-laranja-suave)]"
                    style={{ width: `${fatia}%` }}
                  />
                  <span
                    className="relative block truncate text-[12px] font-semibold text-[var(--cz-texto)]"
                    title={linha.rotulo}
                  >
                    {linha.rotulo}
                  </span>
                </td>
                {/* VENDAS e UNIDADES, as duas colunas que o galpão usa. A
                    contagem de pacotes fica no `title`: ela só interessa para
                    saber quantas etiquetas imprimir, e uma quarta coluna de
                    números tornaria a tabelinha ilegível na largura de um terço
                    da tela. */}
                <td
                  className="relative px-2 py-2 text-right text-[12px] font-bold tabular-nums text-[var(--cz-texto)]"
                  title={`${inteiro(linha.pacotes)} pacote(s)`}
                >
                  {inteiro(linha.vendas)}
                </td>
                <td className="relative px-2 py-2 text-right text-[11px] tabular-nums text-[var(--cz-texto-suave)]">
                  {inteiro(linha.unidades)} un.
                </td>
                <td className="relative px-3.5 py-2 text-right text-[11.5px] font-semibold tabular-nums text-[var(--cz-texto)]">
                  {brl(linha.valorTotal)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
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
  const opcoes1 = dados?.opcoesHierarquia1 ?? [];
  const opcoes2 = dados?.opcoesHierarquia2 ?? [];
  const opcoesSku = dados?.opcoesSku ?? [];

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
      filtros.hierarquias1.length === 0 &&
      filtros.hierarquias2.length === 0 &&
      filtros.skus.length === 0 &&
      filtros.busca.trim() === "" &&
      // O recorte de prazo conta como filtro. Sem esta linha, a Expedição aberta
      // em "Atrasados" e sem atrasado nenhum diria "Nada a despachar" — mentira,
      // e a pior possível nesta tela.
      filtros.prazoPreset === FILTROS_PADRAO.prazoPreset &&
      filtros.vendaDe === null &&
      filtros.vendaAte === null &&
      filtros.statusVenda === FILTROS_PADRAO.statusVenda &&
      filtros.temPrazo === FILTROS_PADRAO.temPrazo,
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
        {/* VENDAS e ITENS a despachar, como dois cartões separados.
            São as duas perguntas do galpão, e nenhuma delas é "pacotes": quantas
            vendas vou dar baixa (o número que fecha com o painel do marketplace) e
            quantas unidades vou tirar da prateleira. A contagem de PACOTES vira a
            nota do primeiro, porque é a de etiquetas a imprimir — informação da
            impressora, não do planejamento. */}
        <Kpi
          rotulo="Vendas a despachar"
          valor={inteiro(dados?.vendas ?? 0)}
          nota={`${inteiro(dados?.total ?? 0)} pacote(s) / etiqueta(s)`}
          destaque
          icone={<IconeCaminhao className="h-5 w-5" />}
        />
        <Kpi
          rotulo="Itens a despachar"
          valor={inteiro(dados?.unidades ?? 0)}
          nota="unidades a separar"
          icone={<IconeCaixas className="h-5 w-5" />}
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

      {/* O RECORTE DE PRAZO fica acima do painel porque muda a PERGUNTA, e não
          só estreita a resposta: "o que já venceu" e "o que sai na semana" são
          duas telas diferentes. Vale junto com as fichas de urgência — o atalho
          escolhe a FAIXA que o banco lê, a ficha classifica o que voltou. */}
      <GrupoRecorte
        opcoes={PRAZO_PRESETS.map((p) => ({
          chave: p.chave,
          rotulo: p.rotulo,
          explicacao: EXPLICACAO_PRAZO[p.chave],
        }))}
        valor={filtros.prazoPreset}
        onMudar={(chave: PrazoPreset) => mudar({ prazoPreset: chave })}
      />

      <PainelFiltros
        nota={
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--cz-texto-suave)]">
            A janela limita a busca pela data da venda e existe para a consulta não
            varrer a base inteira. Se um pedido antigo estiver preso sem despachar,
            alargue a janela para vê-lo. As categorias vêm do cadastro de SKU — venda
            de SKU não cadastrado continua na fila, sob <em>Sem categoria</em>.
          </p>
        }
      >
        <CampoBusca
          className="lg:col-span-4"
          valor={filtros.busca}
          onMudar={(v) => mudar({ busca: v })}
          placeholder="Pedido, etiqueta, SKU, produto ou comprador"
        />

        {/* Todos os recortes de conjunto viraram MULTI-seleção. Um `<select>`
            simples obriga a escolher entre "uma" e "todas", e não existe ali
            "estas duas" — que é justamente a pergunta de quem tem quatro contas e
            quer conferir duas, ou de quem separa três SKUs de um lote. */}
        {!canalFixo && (
          <MultiSelecao
            className="lg:col-span-2"
            rotulo="Marketplace"
            placeholder="Todos"
            opcoes={CANAIS.map((c) => ({
              valor: c,
              rotulo: CANAL_ROTULO[c],
              icone: <LogoCanal canal={c} />,
            }))}
            selecionados={filtros.canais}
            onMudar={(v) => mudar({ canais: v as Canal[] })}
          />
        )}

        <MultiSelecao
          className="lg:col-span-3"
          rotulo="Conta"
          placeholder="Todas"
          vazio="Nenhuma conta com pacote na fila"
          opcoes={contasDoCanal.map((c) => ({
            valor: c.accountId,
            rotulo: c.conta,
            contagem: c.pacotes,
            // O logo dentro da opção resolve o caso de duas contas com nome
            // parecido em marketplaces diferentes, na tela Geral.
            icone: <LogoCanal canal={c.canal} />,
          }))}
          selecionados={filtros.contas}
          onMudar={(v) => mudar({ contas: v })}
        />

        <MultiSelecao
          className="lg:col-span-3"
          rotulo="Modalidade de envio"
          placeholder="Todas"
          vazio="Nenhuma modalidade na fila"
          opcoes={modalidades.map((m) => ({ valor: m, rotulo: m }))}
          selecionados={filtros.modalidades}
          onMudar={(v) => mudar({ modalidades: v })}
        />

        {/* SKU, e não categoria: escolher aqui deixa na tela só as VENDAS daquele
            código, e um pacote misto aparece com o item escolhido apenas. É o
            recorte de quem vai separar um lote, e ele responde "quantas unidades
            deste produto saem hoje" — o pacote inteiro traria produto de fora. */}
        <MultiSelecao
          className="lg:col-span-4"
          rotulo="SKU"
          placeholder="Todos os SKUs"
          buscaPlaceholder="Digite o código do SKU…"
          vazio="Nenhum SKU na fila"
          opcoes={opcoesSku.map((s) => ({ valor: s, rotulo: s }))}
          selecionados={filtros.skus}
          onMudar={(v) => mudar({ skus: v })}
        />

        <MultiSelecao
          className="lg:col-span-3"
          rotulo="Categoria"
          placeholder="Todas"
          vazio="Nenhuma categoria cadastrada"
          opcoes={opcoes1.map((h) => ({ valor: h, rotulo: h }))}
          selecionados={filtros.hierarquias1}
          onMudar={(v) => mudar({ hierarquias1: v })}
        />

        <MultiSelecao
          className="lg:col-span-3"
          rotulo="Subcategoria"
          placeholder="Todas"
          vazio="Nenhuma subcategoria cadastrada"
          opcoes={opcoes2.map((h) => ({ valor: h, rotulo: h }))}
          selecionados={filtros.hierarquias2}
          onMudar={(v) => mudar({ hierarquias2: v })}
        />

        <Campo rotulo="Situação da venda" className="lg:col-span-2">
          <select
            value={filtros.statusVenda}
            onChange={(e) => mudar({ statusVenda: e.target.value as StatusVenda })}
            className={ENTRADA}
          >
            {STATUS_VENDA.map((s) => (
              <option key={s.chave} value={s.chave}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Prazo" className="lg:col-span-2">
          <select
            value={filtros.temPrazo}
            onChange={(e) => mudar({ temPrazo: e.target.value as TemPrazo })}
            className={ENTRADA}
          >
            {TEM_PRAZO.map((t) => (
              <option key={t.chave} value={t.chave}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </Campo>

        {/* 4 colunas e não 2: fecha a linha em 12 junto com "Prazo" e as duas
            datas de limite. Com 2, sobrava um buraco de 2 colunas no meio do
            painel. */}
        <Campo rotulo="Janela" className="lg:col-span-4">
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

        {/* As datas de LIMITE DE DESPACHO ficam SEMPRE visíveis.
            Antes só apareciam no recorte "personalizado", o que escondia o
            controle atrás de uma escolha em outro lugar da tela — quem quer uma
            faixa de datas não adivinha que precisa primeiro clicar numa pastilha.
            Digitar aqui já muda o recorte para personalizado, então o atalho aceso
            nunca contradiz as datas que estão na tela. */}
        <Campo rotulo="Limite de despacho — de" className="lg:col-span-3">
          <input
            type="date"
            value={filtros.prazoDe ?? ""}
            onChange={(e) =>
              mudar({ prazoPreset: "personalizado", prazoDe: e.target.value || null })
            }
            className={ENTRADA}
          />
        </Campo>
        <Campo rotulo="Limite de despacho — até" className="lg:col-span-3">
          <input
            type="date"
            value={filtros.prazoAte ?? ""}
            onChange={(e) =>
              mudar({ prazoPreset: "personalizado", prazoAte: e.target.value || null })
            }
            className={ENTRADA}
          />
        </Campo>

        {/* Data da VENDA, não do prazo. São perguntas diferentes: "o que vence
            hoje" é a fila de trabalho; "o que foi vendido no dia 3" é
            conferência de lote. Manter as duas faixas separadas é o que permite
            cruzá-las. */}
        <Campo rotulo="Venda de" className="lg:col-span-3">
          <input
            type="date"
            value={filtros.vendaDe ?? ""}
            onChange={(e) => mudar({ vendaDe: e.target.value || null })}
            className={ENTRADA}
          />
        </Campo>
        <Campo rotulo="Venda até" className="lg:col-span-3">
          <input
            type="date"
            value={filtros.vendaAte ?? ""}
            onChange={(e) => mudar({ vendaAte: e.target.value || null })}
            className={ENTRADA}
          />
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
                ? "Nada vence hoje e não há atrasado — a tela abre nesse recorte. Para ver o que sai nos próximos dias, escolha outro prazo acima. Se acabou de vender, sincronize as vendas para a fila atualizar."
                : "Os filtros ativos não deixaram nenhum pacote. Tente limpar a urgência selecionada, escolher outro prazo ou alargar a janela de datas."
            }
            acaoSecundaria={
              // Com o padrão sendo "a despachar hoje", o caminho mais provável a
              // partir de uma tela vazia é olhar o resto da fila. Deixar isso a um
              // clique evita a conclusão errada de que não há nada para despachar.
              semFiltro ? (
                <BotaoSecundario onClick={() => mudar({ prazoPreset: "todas" })}>
                  Ver todos os prazos
                </BotaoSecundario>
              ) : undefined
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
              <table className="w-full min-w-[1280px] border-collapse text-left">
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
                  <Th>Etiqueta</Th>
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

      {/* Os três resumos somam o CONJUNTO FILTRADO INTEIRO, não a página. É por
          isso que eles fecham com os cartões do topo e não com a tabela acima —
          e é o que os torna úteis: a página 1 de 40 não diz nada sobre o dia. */}
      {dados && !carregando && !vazio && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {/* Modalidade de envio e SKU primeiro, e nesta ordem: a modalidade define
              o CORTE do dia (o que sai por coleta, o que vai à agência) e o SKU é a
              lista de separação. As categorias vêm depois porque são planejamento,
              não a tarefa. */}
          <TabelaResumo
            titulo="Por modalidade de envio"
            nota="Modalidade no Mercado Livre, transportadora na Shopee. É o que define o corte do dia."
            icone={<IconeCaminhao className="h-4 w-4" />}
            linhas={dados.resumoModalidade}
          />
          <TabelaResumo
            titulo="Por SKU"
            nota="A lista de separação condensada: quantas unidades de cada código saem no recorte atual."
            icone={<IconeSku className="h-4 w-4" />}
            linhas={dados.resumoSku}
          />
          <TabelaResumo
            titulo="Por categoria"
            nota="Onde estão as pilhas. Vem do cadastro de SKU."
            icone={<IconeCamadas className="h-4 w-4" />}
            linhas={dados.resumoHierarquia1}
          />
          <TabelaResumo
            titulo="Por subcategoria"
            nota="O segundo nível do cadastro, para separar dentro da prateleira."
            icone={<IconeCaixas className="h-4 w-4" />}
            linhas={dados.resumoHierarquia2}
          />
        </div>
      )}
    </MolduraTela>
  );
}
