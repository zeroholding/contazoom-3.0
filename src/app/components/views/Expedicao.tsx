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
  Cabecalho,
  CaixaBusca,
  Campo,
  Esqueleto,
  Faixa,
  GrupoRecorte,
  Kpi,
  MolduraTela,
  MultiSelecao,
  Paginacao,
} from "./comum/shell";
import {
  BarraFiltros,
  BotaoAvancados,
  ChipsFiltro,
  FiltroRapido,
  type ChipFiltro,
} from "./comum/filtros";
import { brl, ENTRADA, inteiro } from "./comum/formato";
import { LogoCanal } from "./comum/logos";
import {
  IconeAlerta,
  IconeAmpulheta,
  IconeBaixar,
  IconeCaixas,
  IconeCamadas,
  IconeCaminhao,
  IconeDinheiro,
  IconeLoja,
  IconePessoa,
  IconeRelogio,
  IconeSku,
} from "./comum/icones";
import {
  CANAIS,
  CANAL_ROTULO,
  FILTROS_PADRAO,
  PRAZO_PRESETS,
  STATUS_VENDA,
  TEM_PRAZO,
  URGENCIA_CLASSE,
  URGENCIA_ROTULO,
  URGENCIA_TOM,
  URGENCIAS,
  type Canal,
  type FiltrosExpedicao,
  type LinhaResumo,
  type OrdemExpedicao,
  type PrazoPreset,
  type StatusVenda,
  type TemPrazo,
  type Urgencia,
} from "@/lib/expedicao";
import BarraLote, { type PacoteLote } from "./expedicao/BarraLote";
import CartaoPacote, { ICONE_URGENCIA } from "./expedicao/CartaoPacote";
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
   * O painel avançado começa FECHADO.
   *
   * Os doze filtros desta tela estavam todos abertos ao mesmo tempo, num grid de
   * três linhas que empurrava a fila para baixo da dobra — numa tela cuja única
   * função é olhar a fila. Os cinco que se usam todo dia ficaram na barra
   * compacta; estes sete são de conferência pontual, e conferência pontual não
   * merece ocupar a tela nos outros dias.
   */
  const [avancados, setAvancados] = useState(false);

  /**
   * Quais pacotes estão marcados para imprimir etiqueta em lote.
   *
   * Guarda a CHAVE do pacote, não o índice: a lista repagina e se reordena, e um
   * índice apontaria para outro pacote depois de qualquer mudança — imprimindo
   * etiqueta de coisa que não foi escolhida.
   */
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

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
    // A seleção MORRE a cada mudança de filtro, e isto é segurança e não
    // arrumação: marcar dez pacotes, trocar o filtro e clicar em "Imprimir" faria
    // sair etiqueta de pacote que já não está na tela — dez etiquetas erradas
    // coladas em dez caixas erradas.
    setSelecionados(new Set());
  }, []);

  const trocarPagina = useCallback((pagina: number) => {
    setFiltros((atual) => ({ ...atual, pagina }));
    // Mesmo motivo do `mudar`: a seleção é da PÁGINA que está na tela.
    setSelecionados(new Set());
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
    setSelecionados(new Set());
  }, []);

  const ordenar = useCallback((ordem: OrdemExpedicao, direcao: "asc" | "desc") => {
    setFiltros((atual) => ({ ...atual, ordem, direcao, pagina: 1 }));
    setSelecionados(new Set());
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

  /**
   * Quantos filtros AVANÇADOS estão ligados.
   *
   * Vai no botão que abre o painel. É o que impede o pior defeito de um filtro
   * recolhido: um recorte ativo lá dentro corta a lista e nada na tela explica
   * por quê — a pessoa conclui que não há trabalho, e há.
   */
  const avancadosAtivos = useMemo(() => {
    let n = 0;
    if (filtros.hierarquias1.length > 0) n++;
    if (filtros.hierarquias2.length > 0) n++;
    if (filtros.statusVenda !== FILTROS_PADRAO.statusVenda) n++;
    if (filtros.temPrazo !== FILTROS_PADRAO.temPrazo) n++;
    if (filtros.janelaDias !== FILTROS_PADRAO.janelaDias) n++;
    if (filtros.prazoDe || filtros.prazoAte) n++;
    if (filtros.vendaDe || filtros.vendaAte) n++;
    return n;
  }, [filtros]);

  /**
   * Os chips do que está filtrado agora.
   *
   * Um chip por VALOR e não por filtro: com "Conta: 3 selecionados" a pessoa
   * ainda precisa abrir o painel para saber quais três, e remover uma delas exige
   * achar o campo e desmarcar. Cada valor com o seu X é o caminho mais curto para
   * o ajuste que se faz mil vezes por dia.
   */
  const chips = useMemo<ChipFiltro[]>(() => {
    const lista: ChipFiltro[] = [];

    const semLista = (valores: string[], valor: string) =>
      valores.filter((v) => v !== valor);

    if (filtros.busca.trim() !== "") {
      lista.push({
        chave: "busca",
        grupo: "Busca",
        rotulo: filtros.busca.trim(),
        remover: () => mudar({ busca: "" }),
      });
    }

    // O prazo é o eixo da tela e já tem as pastilhas grandes do `GrupoRecorte`,
    // então só vira chip quando FOGE do padrão — o padrão não é uma escolha.
    if (filtros.prazoPreset !== FILTROS_PADRAO.prazoPreset) {
      const p = PRAZO_PRESETS.find((x) => x.chave === filtros.prazoPreset);
      lista.push({
        chave: "prazo",
        grupo: "Prazo",
        rotulo: p?.rotulo ?? filtros.prazoPreset,
        remover: () => mudar({ prazoPreset: FILTROS_PADRAO.prazoPreset }),
      });
    }

    for (const u of filtros.urgencias) {
      lista.push({
        chave: `urg-${u}`,
        grupo: "Urgência",
        rotulo: URGENCIA_ROTULO[u],
        remover: () => mudar({ urgencias: filtros.urgencias.filter((x) => x !== u) }),
      });
    }

    if (!canalFixo) {
      for (const c of filtros.canais) {
        lista.push({
          chave: `canal-${c}`,
          grupo: "Canal",
          rotulo: CANAL_ROTULO[c],
          icone: <LogoCanal canal={c} />,
          remover: () => mudar({ canais: semLista(filtros.canais, c) as Canal[] }),
        });
      }
    }

    for (const id of filtros.contas) {
      const conta = contasDoCanal.find((c) => c.accountId === id);
      lista.push({
        chave: `conta-${id}`,
        grupo: "Conta",
        rotulo: conta?.conta ?? id,
        icone: conta ? <LogoCanal canal={conta.canal} /> : undefined,
        remover: () => mudar({ contas: semLista(filtros.contas, id) }),
      });
    }

    for (const m of filtros.modalidades) {
      lista.push({
        chave: `mod-${m}`,
        grupo: "Envio",
        rotulo: m,
        remover: () => mudar({ modalidades: semLista(filtros.modalidades, m) }),
      });
    }

    for (const s of filtros.skus) {
      lista.push({
        chave: `sku-${s}`,
        grupo: "SKU",
        rotulo: s,
        remover: () => mudar({ skus: semLista(filtros.skus, s) }),
      });
    }

    for (const h of filtros.hierarquias1) {
      lista.push({
        chave: `h1-${h}`,
        grupo: "Categoria",
        rotulo: h,
        remover: () => mudar({ hierarquias1: semLista(filtros.hierarquias1, h) }),
      });
    }

    for (const h of filtros.hierarquias2) {
      lista.push({
        chave: `h2-${h}`,
        grupo: "Subcategoria",
        rotulo: h,
        remover: () => mudar({ hierarquias2: semLista(filtros.hierarquias2, h) }),
      });
    }

    if (filtros.statusVenda !== FILTROS_PADRAO.statusVenda) {
      const s = STATUS_VENDA.find((x) => x.chave === filtros.statusVenda);
      lista.push({
        chave: "status",
        grupo: "Situação",
        rotulo: s?.rotulo ?? filtros.statusVenda,
        remover: () => mudar({ statusVenda: FILTROS_PADRAO.statusVenda }),
      });
    }

    if (filtros.temPrazo !== FILTROS_PADRAO.temPrazo) {
      const t = TEM_PRAZO.find((x) => x.chave === filtros.temPrazo);
      lista.push({
        chave: "temPrazo",
        grupo: "Prazo",
        rotulo: t?.rotulo ?? filtros.temPrazo,
        remover: () => mudar({ temPrazo: FILTROS_PADRAO.temPrazo }),
      });
    }

    if (filtros.janelaDias !== FILTROS_PADRAO.janelaDias) {
      lista.push({
        chave: "janela",
        grupo: "Janela",
        rotulo: `${filtros.janelaDias} dias`,
        remover: () => mudar({ janelaDias: FILTROS_PADRAO.janelaDias }),
      });
    }

    if (filtros.prazoDe || filtros.prazoAte) {
      lista.push({
        chave: "prazoDatas",
        grupo: "Limite",
        rotulo: `${filtros.prazoDe ?? "…"} a ${filtros.prazoAte ?? "…"}`,
        remover: () =>
          mudar({
            prazoDe: null,
            prazoAte: null,
            // Sem voltar o atalho, a tela ficaria acesa em "personalizado" sem
            // nenhuma data personalizada — um recorte que não recorta nada.
            prazoPreset: FILTROS_PADRAO.prazoPreset,
          }),
      });
    }

    if (filtros.vendaDe || filtros.vendaAte) {
      lista.push({
        chave: "vendaDatas",
        grupo: "Venda",
        rotulo: `${filtros.vendaDe ?? "…"} a ${filtros.vendaAte ?? "…"}`,
        remover: () => mudar({ vendaDe: null, vendaAte: null }),
      });
    }

    return lista;
  }, [filtros, canalFixo, contasDoCanal, mudar]);

  /**
   * Os pacotes da página que podem ir para a impressão em lote.
   *
   * Só Mercado Livre e só com envio gerado. A Shopee não expõe a etiqueta pelos
   * endpoints que este projeto usa, e pacote sem `shippingId` não tem o que
   * imprimir — deixá-los selecionáveis faria "Selecionar todos" prometer
   * etiquetas que não existem.
   */
  const elegiveisLote = useMemo<PacoteLote[]>(
    () =>
      (dados?.pacotes ?? [])
        .filter((p) => p.canal === "ML" && p.shippingId)
        .map((p) => ({
          chave: p.chave,
          shippingId: p.shippingId as string,
          accountId: p.accountId,
        })),
    [dados?.pacotes],
  );

  const alternarSelecao = useCallback((chave: string) => {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }, []);

  const elegivel = useMemo(
    () => new Set(elegiveisLote.map((p) => p.chave)),
    [elegiveisLote],
  );

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

      {/* ═══════════════════════ FILTROS ═══════════════════════
          Uma LINHA de pastilhas, e o resto atrás de "Filtros avançados".

          Eram doze campos de largura cheia num grid de 12 colunas: três linhas de
          formulário ocupando quase metade da altura útil antes do primeiro pacote
          aparecer. Não é excesso de filtro — cada um serve. Era excesso de PESO
          IGUAL: conta e modalidade de envio se usam todo dia, faixa de data da
          venda se usa quando alguém vem perguntar de um pedido específico. */}
      <div className="mt-4 rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-3 shadow-[var(--cz-elev-1)]">
        <BarraFiltros>
          <CaixaBusca
            compacta
            className="min-w-[15rem] flex-1"
            valor={filtros.busca}
            onMudar={(v) => mudar({ busca: v })}
            placeholder="Pedido, etiqueta, SKU, produto ou comprador"
            rotuloAcessivel="Buscar na fila de expedição"
          />

          {/* Todos os recortes de conjunto são MULTI-seleção. Um `<select>` simples
              obriga a escolher entre "uma" e "todas", e não existe ali "estas duas"
              — que é justamente a pergunta de quem tem quatro contas e quer
              conferir duas, ou de quem separa três SKUs de um lote. */}
          {!canalFixo && (
            <FiltroRapido
              rotulo="Canal"
              placeholder="Todos"
              icone={<IconeLoja className="h-4 w-4" />}
              opcoes={CANAIS.map((c) => ({
                valor: c,
                rotulo: CANAL_ROTULO[c],
                icone: <LogoCanal canal={c} />,
              }))}
              selecionados={filtros.canais}
              onMudar={(v) => mudar({ canais: v as Canal[] })}
            />
          )}

          <FiltroRapido
            rotulo="Conta"
            placeholder="Todas"
            vazio="Nenhuma conta com pacote na fila"
            icone={<IconePessoa className="h-4 w-4" />}
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

          <FiltroRapido
            rotulo="Envio"
            placeholder="Todas"
            vazio="Nenhuma modalidade na fila"
            icone={<IconeCaminhao className="h-4 w-4" />}
            opcoes={modalidades.map((m) => ({ valor: m, rotulo: m }))}
            selecionados={filtros.modalidades}
            onMudar={(v) => mudar({ modalidades: v })}
          />

          {/* SKU, e não categoria: escolher aqui deixa na tela só as VENDAS daquele
              código, e um pacote misto aparece com o item escolhido apenas. É o
              recorte de quem vai separar um lote, e ele responde "quantas unidades
              deste produto saem hoje" — o pacote inteiro traria produto de fora. */}
          <FiltroRapido
            rotulo="SKU"
            placeholder="Todos"
            buscaPlaceholder="Digite o código do SKU…"
            vazio="Nenhum SKU na fila"
            icone={<IconeSku className="h-4 w-4" />}
            larguraPainel="w-[17rem]"
            opcoes={opcoesSku.map((s) => ({ valor: s, rotulo: s }))}
            selecionados={filtros.skus}
            onMudar={(v) => mudar({ skus: v })}
          />

          <BotaoAvancados
            aberto={avancados}
            onAlternar={() => setAvancados((v) => !v)}
            ativos={avancadosAtivos}
          />

          {/* A ORDEM fica aqui, e não em cabeçalho de coluna clicável: sem tabela
              não existe cabeçalho onde clicar, e a fila tem uma ordem que importa
              (o prazo) mais quatro que servem de conferência. */}
          <label className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-2.5 text-[13px]">
            <span className="shrink-0 text-[var(--cz-texto-suave)]">Ordenar:</span>
            <select
              value={`${filtros.ordem}:${filtros.direcao}`}
              onChange={(e) => {
                const [ordem, direcao] = e.target.value.split(":");
                ordenar(ordem as OrdemExpedicao, direcao as "asc" | "desc");
              }}
              aria-label="Ordenação da fila"
              className="bg-transparent font-semibold text-[var(--cz-texto)] outline-none"
            >
              <option value="prazo:asc">Prazo mais próximo</option>
              <option value="prazo:desc">Prazo mais distante</option>
              <option value="venda:desc">Venda mais recente</option>
              <option value="venda:asc">Venda mais antiga</option>
              <option value="unidades:desc">Mais unidades</option>
              <option value="valor:desc">Maior valor</option>
            </select>
          </label>
        </BarraFiltros>

        <ChipsFiltro chips={chips} onLimparTudo={() => setFiltros(padrao)} />

        {/* Os avançados. Ficam num grid porque aqui são campos de formulário de
            verdade — duas faixas de data e três listas — e não pastilhas de uso
            diário. */}
        {avancados && (
          <div className="mt-3 border-t border-[var(--cz-hairline)] pt-3">
            <div className="grid gap-3 lg:grid-cols-12">
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

              <Campo rotulo="Situação da venda" className="lg:col-span-3">
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

              <Campo rotulo="Prazo" className="lg:col-span-3">
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

              {/* Digitar uma data já muda o recorte para "personalizado", então o
                  atalho aceso lá em cima nunca contradiz as datas daqui. */}
              <Campo rotulo="Limite de despacho — de" className="lg:col-span-2">
                <input
                  type="date"
                  value={filtros.prazoDe ?? ""}
                  onChange={(e) =>
                    mudar({
                      prazoPreset: "personalizado",
                      prazoDe: e.target.value || null,
                    })
                  }
                  className={ENTRADA}
                />
              </Campo>
              <Campo rotulo="Limite de despacho — até" className="lg:col-span-3">
                <input
                  type="date"
                  value={filtros.prazoAte ?? ""}
                  onChange={(e) =>
                    mudar({
                      prazoPreset: "personalizado",
                      prazoAte: e.target.value || null,
                    })
                  }
                  className={ENTRADA}
                />
              </Campo>

              {/* Data da VENDA, não do prazo. São perguntas diferentes: "o que
                  vence hoje" é a fila de trabalho; "o que foi vendido no dia 3" é
                  conferência de lote. */}
              <Campo rotulo="Venda de" className="lg:col-span-2">
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
            </div>

            <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--cz-texto-suave)]">
              A janela limita a busca pela data da venda e existe para a consulta não
              varrer a base inteira. Se um pedido antigo estiver preso sem despachar,
              alargue a janela para vê-lo. As categorias vêm do cadastro de SKU — venda
              de SKU não cadastrado continua na fila, sob <em>Sem categoria</em>.
            </p>
          </div>
        )}
      </div>

      {/* Indicadores DEPOIS dos filtros, e não antes.
          Eles descrevem o CONJUNTO FILTRADO — "atrasados" é atrasados dentro do
          recorte atual, não na base inteira. Acima dos filtros, os cinco números
          se leem como panorama geral e não fecham com o que a pessoa acabou de
          escolher; aqui eles são a legenda da lista que vem logo abaixo.

          Atrasado e "vence hoje" ganham tom próprio (vermelho e âmbar) porque são
          as duas únicas linhas que mudam o que a pessoa faz nos próximos minutos. */}
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
            {/* Contador + seleção + impressão em lote, na mesma faixa. Sem tabela
                não existe cabeçalho de coluna, e é aqui que ficam as ações que
                valem para a página inteira. */}
            <BarraLote
              elegiveis={elegiveisLote}
              selecionados={selecionados}
              onSelecionar={setSelecionados}
              totalNaPagina={dados?.pacotes.length ?? 0}
              totalGeral={dados?.total ?? 0}
              atualizando={atualizando}
            />

            <div>
              {dados?.pacotes.map((pacote) => (
                <CartaoPacote
                  key={pacote.chave}
                  pacote={pacote}
                  selecionado={selecionados.has(pacote.chave)}
                  onAlternarSelecao={
                    elegivel.has(pacote.chave)
                      ? () => alternarSelecao(pacote.chave)
                      : undefined
                  }
                />
              ))}
            </div>

            <Paginacao
              pagina={filtros.pagina}
              totalPaginas={dados?.totalPaginas ?? 1}
              total={dados?.total ?? 0}
              porPagina={filtros.porPagina}
              onPagina={trocarPagina}
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
