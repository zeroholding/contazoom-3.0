"use client";

/**
 * Expedição / Separação de Itens.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTA TELA É O `separacao-itens` DO CYBERDOCK, PORTADO.
 *
 * A estrutura, a ordem dos blocos, os rótulos e os textos vêm de
 * `CyberDock/cyberdock-frontend/src/views/SeparacaoItensView.vue`:
 *
 *   1. cabeçalho: título, subtítulo, [Exportar] [Imprimir PDF]
 *   2. card de filtros: barra (Prazo / Situação / Canal) + Filtros avançados
 *   3. sete cartões de resumo
 *   4. card da tabela: contagem + "Ordenar por", tabela agrupada por pacote,
 *      paginação numerada
 *
 * A tabela é ITEM por linha, agrupada por PACOTE, com as colunas do pacote em
 * `rowspan`. Antes daqui era uma linha por pacote com oito colunas e
 * `min-w-[1280px]`: a coluna do produto saía da tela justamente quando se olhava
 * o prazo, e não se sabia mais de qual pacote era a linha.
 *
 * O QUE NÃO DEU PARA COPIAR, E POR QUÊ
 *
 * Três coisas do CyberDock dependem de dado que o CONTAZOOM não tem:
 *
 *   • "Usuários Ativos" — lá a separação é apontada por operador. Aqui a
 *     Expedição é LEITURA da fila, não apontamento de produção (ver o cabeçalho
 *     de `expedicao-data.ts`). O sétimo cartão virou "Contas".
 *   • filtro "Usuário" — mesmo motivo. O slot virou "SKU", que é o filtro que a
 *     separação realmente usa.
 *   • chip de "variação" ("Cor: Preto") — o CONTAZOOM guarda o ID da variação,
 *     não os atributos escolhidos. O slot virou a CATEGORIA do cadastro de SKU.
 *
 * E uma por decisão: as cores de AÇÃO são o laranja da marca, não o azul do
 * CyberDock. As cores de MODALIDADE são as do original (azul FULL, laranja FLEX,
 * verde Correios), porque ali a cor identifica a transportadora e é informação.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useMemo, useState } from "react";

import {
  Aviso,
  BotaoSecundario,
  Esqueleto,
  Faixa,
  MolduraTela,
} from "./comum/shell";
import { brl, inteiro } from "./comum/formato";
import {
  IconeAlerta,
  IconeAtualizar,
  IconeBaixar,
  IconeCaixas,
  IconeCamadas,
  IconeCaminhao,
  IconeDocumento,
  IconeRelogio,
  IconeSku,
} from "./comum/icones";
import {
  FILTROS_PADRAO,
  type Canal,
  type FiltrosExpedicao,
  type LinhaResumo,
  type OrdemExpedicao,
} from "@/lib/expedicao";
import BarraLote, { type PacoteLote } from "./expedicao/BarraLote";
import CartoesSeparacao from "./expedicao/CartoesSeparacao";
import FiltrosSeparacao from "./expedicao/FiltrosSeparacao";
import PaginacaoSeparacao from "./expedicao/PaginacaoSeparacao";
import TabelaSeparacao from "./expedicao/TabelaSeparacao";
import { baixarCsv, useExpedicao } from "./expedicao/useExpedicao";

/* -------------------------------------------------------------------------- */
/*                            Resumos do rodapé                               */
/* -------------------------------------------------------------------------- */

/**
 * "Onde o trabalho está concentrado".
 *
 * NÃO existe no CyberDock, e fica. A tabela responde O QUE despachar; isto
 * responde POR ONDE COMEÇAR. Trinta pacotes espalhados em dez categorias é um dia
 * de trabalho diferente de trinta pacotes na mesma prateleira, e a lista paginada
 * não mostra essa diferença — a página 1 parece igual nos dois casos.
 *
 * Some quando há uma linha só. Um resumo de um item não resume nada: repete o
 * total que já está nos cartões, com mais tinta.
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
    <section className="overflow-hidden rounded-[14px] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]">
      <header className="flex items-start gap-2 border-b border-[var(--cz-hairline)] px-3.5 py-3">
        <span className="mt-0.5 text-[var(--cz-texto-fraco)]">{icone}</span>
        <span className="min-w-0">
          <h3 className="text-[13.5px] font-bold text-[var(--cz-texto)]">{titulo}</h3>
          <p className="text-[12px] leading-snug text-[var(--cz-texto-suave)]">{nota}</p>
        </span>
      </header>

      <table className="w-full border-collapse text-left">
        {/* Cabeçalho miúdo, mas presente: sem ele, "12 / 40 un. / R$ 900" obriga a
            adivinhar o que é 12 — pacote, venda ou item. */}
        <thead>
          <tr className="border-b border-[var(--cz-hairline)] text-[10.5px] font-bold uppercase tracking-[0.04em] text-[var(--cz-texto-fraco)]">
            <th className="px-3.5 py-1.5 text-left font-bold">
              {titulo.replace("Por ", "")}
            </th>
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
                    className="relative block truncate text-[12.5px] font-semibold text-[var(--cz-texto)]"
                    title={linha.rotulo}
                  >
                    {linha.rotulo}
                  </span>
                </td>
                {/* VENDAS e UNIDADES, as duas colunas que o galpão usa. A contagem
                    de pacotes fica no `title`: ela só interessa para saber quantas
                    etiquetas imprimir, e uma quarta coluna de números tornaria a
                    tabelinha ilegível na largura de um terço da tela. */}
                <td
                  className="relative px-2 py-2 text-right text-[12.5px] font-bold tabular-nums text-[var(--cz-texto)]"
                  title={`${inteiro(linha.pacotes)} pacote(s)`}
                >
                  {inteiro(linha.vendas)}
                </td>
                <td className="relative px-2 py-2 text-right text-[12px] tabular-nums text-[var(--cz-texto-suave)]">
                  {inteiro(linha.unidades)} un.
                </td>
                <td className="relative px-3.5 py-2 text-right text-[12px] font-semibold tabular-nums text-[var(--cz-texto)]">
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
const TEXTOS: Record<"geral" | "ML" | "SP", { titulo: string; descricao: string }> = {
  geral: {
    titulo: "Separação de Itens",
    descricao: "Gerencie e acompanhe os itens separados para despacho.",
  },
  ML: {
    titulo: "Separação de Itens — Mercado Livre",
    descricao:
      "Gerencie e acompanhe os itens separados para despacho no Mercado Livre. Vendas FULL não aparecem: nelas quem despacha é o próprio Mercado Livre.",
  },
  SP: {
    titulo: "Separação de Itens — Shopee",
    descricao:
      "Gerencie e acompanhe os itens separados para despacho na Shopee. Entram os pedidos prontos para envio, processados e em nova tentativa.",
  },
};

/** As quatro ordens do CyberDock, com os rótulos dele. */
const ORDENS: { chave: string; rotulo: string; ordem: OrdemExpedicao; direcao: "asc" | "desc" }[] =
  [
    { chave: "prazo_asc", rotulo: "Prazo (mais próximo)", ordem: "prazo", direcao: "asc" },
    { chave: "prazo_desc", rotulo: "Prazo (mais distante)", ordem: "prazo", direcao: "desc" },
    { chave: "venda_desc", rotulo: "Venda (mais recente)", ordem: "venda", direcao: "desc" },
    { chave: "venda_asc", rotulo: "Venda (mais antiga)", ordem: "venda", direcao: "asc" },
  ];

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
  /**
   * O padrão desta tela. Em tela de canal único o canal faz parte do padrão, e
   * não de um filtro que a pessoa escolheu — senão "Limpar" na tela da Shopee
   * traria pacotes do Mercado Livre.
   */
  const padrao = useMemo<FiltrosExpedicao>(
    () => ({ ...FILTROS_PADRAO, canais: canalFixo ? [canalFixo] : [] }),
    [canalFixo],
  );

  /** O que está APLICADO. É este objeto que dispara a consulta. */
  const [filtros, setFiltros] = useState<FiltrosExpedicao>(padrao);

  /**
   * O que está digitado no painel avançado e ainda NÃO foi aplicado.
   *
   * Existe porque o painel do CyberDock só aplica no botão, e o motivo é real:
   * uma faixa de datas são dois campos, e recarregar a fila no primeiro deles
   * consulta o banco com um recorte que ninguém pediu ("de 01/09 até nada") e
   * mostra um resultado que vai mudar no próximo caractere.
   */
  const [rascunho, setRascunho] = useState<FiltrosExpedicao>(padrao);

  const [avancadosAbertos, setAvancadosAbertos] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);

  /**
   * Quais pacotes estão marcados para imprimir etiqueta em lote.
   *
   * Guarda a CHAVE do pacote, não o índice: a lista repagina e se reordena, e um
   * índice apontaria para outro pacote depois de qualquer mudança — imprimindo
   * etiqueta de coisa que não foi escolhida.
   */
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const { dados, carregando, atualizando, erro, atualizar } = useExpedicao(filtros);
  const textos = TEXTOS[canalFixo ?? "geral"];

  /**
   * Muda um filtro da BARRA: aplica na hora e mantém o rascunho em sincronia.
   *
   * O rascunho tem de acompanhar, senão abrir o painel depois de mexer na barra
   * mostraria os valores antigos — e "Aplicar filtros" desfaria a escolha que a
   * pessoa acabou de fazer.
   */
  const mudarBarra = useCallback((parcial: Partial<FiltrosExpedicao>) => {
    setFiltros((atual) => ({ ...atual, ...parcial, pagina: 1 }));
    setRascunho((atual) => ({ ...atual, ...parcial, pagina: 1 }));
    // A seleção MORRE a cada mudança de filtro, e isto é segurança e não
    // arrumação: marcar dez pacotes, trocar o filtro e clicar em "Imprimir" faria
    // sair etiqueta de pacote que já não está na tela — dez etiquetas erradas
    // coladas em dez caixas erradas.
    setSelecionados(new Set());
  }, []);

  /** Muda um campo do PAINEL: só o rascunho. Nada é consultado ainda. */
  const mudarRascunho = useCallback((parcial: Partial<FiltrosExpedicao>) => {
    setRascunho((atual) => ({ ...atual, ...parcial, pagina: 1 }));
  }, []);

  const aplicarRascunho = useCallback(() => {
    setFiltros({ ...rascunho, pagina: 1 });
    setSelecionados(new Set());
  }, [rascunho]);

  const limpar = useCallback(() => {
    setFiltros(padrao);
    setRascunho(padrao);
    setSelecionados(new Set());
  }, [padrao]);

  const trocarPagina = useCallback(
    (pagina: number) => {
      if (pagina < 1 || pagina > (dados?.totalPaginas ?? 1)) return;
      setFiltros((atual) => ({ ...atual, pagina }));
      setRascunho((atual) => ({ ...atual, pagina }));
      // Mesmo motivo do `mudarBarra`: a seleção é da PÁGINA que está na tela.
      setSelecionados(new Set());
    },
    [dados?.totalPaginas],
  );

  const porUrgencia = dados?.porUrgencia;

  // `useMemo` e não `dados?.pacotes ?? []`: o `?? []` cria um array novo a cada
  // render, o que faria os `useMemo` que dependem dele recalcular sempre — e
  // deixariam de ser memo nenhum.
  const pacotes = useMemo(() => dados?.pacotes ?? [], [dados?.pacotes]);
  const vazio = !carregando && pacotes.length === 0;

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
   * As contas oferecidas são só as DO canal da tela.
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
   * Os pacotes da página que podem ir para a impressão em lote.
   *
   * Só Mercado Livre e só com envio gerado. A Shopee não expõe a etiqueta pelos
   * endpoints que este projeto usa, e pacote sem `shippingId` não tem o que
   * imprimir — deixá-los selecionáveis faria "Selecionar todos" prometer
   * etiquetas que não existem.
   */
  const elegiveisLote = useMemo<PacoteLote[]>(
    () =>
      pacotes
        .filter((p) => p.canal === "ML" && p.shippingId)
        .map((p) => ({
          chave: p.chave,
          shippingId: p.shippingId as string,
          accountId: p.accountId,
        })),
    [pacotes],
  );

  const chavesElegiveis = useMemo(
    () => new Set(elegiveisLote.map((p) => p.chave)),
    [elegiveisLote],
  );

  const alternarSelecao = useCallback((chave: string) => {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }, []);

  /**
   * "Imprimir PDF" = imprimir a PÁGINA, com a folha de impressão da fila.
   *
   * O CyberDock monta um componente de relatório separado e chama `window.print()`
   * nele. Aqui a própria tabela é o relatório: `cz-imprimir-fila` no `globals.css`
   * esconde barra lateral, topo, filtros e cartões, e libera a tabela para quebrar
   * em páginas com o cabeçalho repetido em cada folha. Um segundo componente com o
   * mesmo conteúdo é mais uma cópia para sair de sincronia.
   *
   * `setTimeout` de 0 antes do `print`: sem ele, o navegador pode capturar o
   * estado ANTES do React aplicar a classe, e sai a folha com o menu inteiro.
   */
  const imprimir = useCallback(() => {
    setImprimindo(true);
    setTimeout(() => {
      window.print();
      setImprimindo(false);
    }, 80);
  }, []);

  const ordemAtual =
    ORDENS.find((o) => o.ordem === filtros.ordem && o.direcao === filtros.direcao)?.chave ??
    "prazo_asc";

  return (
    <MolduraTela>
      <div className={imprimindo ? "cz-imprimir-fila" : ""}>
        {/* ─────────────────────────── CABEÇALHO ─────────────────────────── */}
        <header className="cz-nao-imprimir flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="cz-titulo text-[24px] leading-8">{textos.titulo}</h1>
            <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-[var(--cz-texto-suave)]">
              {textos.descricao}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <BotaoSecundario
              onClick={atualizar}
              desabilitado={carregando || atualizando}
            >
              <IconeAtualizar
                className={`h-4 w-4 ${atualizando ? "animate-spin" : ""}`}
              />
              {atualizando ? "Atualizando…" : "Atualizar"}
            </BotaoSecundario>

            <BotaoSecundario
              onClick={() => baixarCsv(filtros)}
              desabilitado={carregando || (dados?.total ?? 0) === 0}
            >
              <IconeBaixar className="h-4 w-4" />
              Exportar
            </BotaoSecundario>

            <button
              type="button"
              onClick={imprimir}
              disabled={carregando || (dados?.total ?? 0) === 0}
              title="Gerar a folha de separação para impressão ou PDF"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--cz-raio)] border border-transparent bg-[var(--cz-laranja)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--cz-laranja-forte)] active:bg-[#C34706] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <IconeDocumento className="h-4 w-4" />
              Imprimir PDF
            </button>
          </div>
        </header>

        {/* O aviso do backfill existe para explicar a ÚNICA incoerência possível
            aqui: pacote sem prazo enquanto o preenchimento do histórico não
            terminou. Sem ele, a conclusão natural é que o sistema perdeu o prazo. */}
        {dados && dados.prazoPendente > 0 && (
          <div className="cz-nao-imprimir">
            <Faixa tom="alerta" icone={<IconeRelogio className="h-4 w-4" />}>
              <strong>{inteiro(dados.prazoPendente)}</strong> vendas ainda estão tendo o
              prazo lido do histórico. Enquanto isso, elas podem aparecer como{" "}
              <em>sem prazo</em>, no fim da fila. O preenchimento continua a cada visita
              a esta tela.
            </Faixa>
          </div>
        )}

        {erro && (
          <div className="cz-nao-imprimir">
            <Faixa tom="critico" icone={<IconeAlerta className="h-4 w-4" />}>
              Não foi possível carregar a fila: {erro}
            </Faixa>
          </div>
        )}

        {/* ──────────────────────────── FILTROS ──────────────────────────── */}
        <div className="cz-nao-imprimir">
          <FiltrosSeparacao
            filtros={filtros}
            rascunho={rascunho}
            onMudarBarra={mudarBarra}
            onMudarRascunho={mudarRascunho}
            onAplicarRascunho={aplicarRascunho}
            onLimpar={limpar}
            aberto={avancadosAbertos}
            onAlternarAberto={() => setAvancadosAbertos((v) => !v)}
            canalFixo={canalFixo}
            contas={contasDoCanal}
            modalidades={dados?.modalidades ?? []}
            opcoesSku={dados?.opcoesSku ?? []}
            opcoesHierarquia1={dados?.opcoesHierarquia1 ?? []}
            carregando={carregando}
          />
        </div>

        {/* ──────────────────── CARTÕES DE RESUMO ──────────────────── */}
        <div className="cz-nao-imprimir">
          <CartoesSeparacao
            pacotes={dados?.total ?? 0}
            itens={dados?.vendas ?? 0}
            unidades={dados?.unidades ?? 0}
            atrasados={porUrgencia?.atrasado ?? 0}
            despacharHoje={porUrgencia?.hoje ?? 0}
            porModalidade={dados?.resumoModalidade ?? []}
            contas={contasDoCanal.length}
          />
        </div>

        {/* ───────────────────────── A TABELA ───────────────────────── */}
        <section className="mt-5 overflow-hidden rounded-[14px] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]">
          <div className="cz-nao-imprimir flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cz-hairline)] px-4 py-3">
            <span className="text-[13px] font-semibold text-[var(--cz-texto-suave)]">
              {inteiro(dados?.total ?? 0)} pacotes · {inteiro(dados?.vendas ?? 0)} itens ·{" "}
              {inteiro(dados?.unidades ?? 0)} unidades
            </span>

            <label className="flex items-center gap-2 text-[13px] text-[var(--cz-texto-suave)]">
              Ordenar por
              <select
                value={ordemAtual}
                onChange={(e) => {
                  const o = ORDENS.find((x) => x.chave === e.target.value);
                  if (o) mudarBarra({ ordem: o.ordem, direcao: o.direcao });
                }}
                className="h-8 rounded-lg border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-2 text-[12.5px] font-semibold text-[var(--cz-texto)] outline-none focus:border-[var(--cz-laranja)]"
              >
                {ORDENS.map((o) => (
                  <option key={o.chave} value={o.chave}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {carregando ? (
            <Esqueleto linhas={8} />
          ) : vazio ? (
            <Aviso
              icone={<IconeCaminhao className="h-6 w-6" />}
              titulo={
                semFiltro ? "Nada a despachar" : "Nenhum item encontrado para os filtros selecionados"
              }
              texto={
                semFiltro
                  ? "Nada vence hoje e não há atrasado — a tela abre nesse recorte. Para ver o que sai nos próximos dias, escolha outro prazo acima. Se acabou de vender, sincronize as vendas para a fila atualizar."
                  : "Os filtros ativos não deixaram nenhum pacote. Tente outro prazo, solte a conta selecionada, ou limpe os filtros."
              }
              acaoSecundaria={
                // Com o padrão sendo "a despachar hoje", o caminho mais provável a
                // partir de uma tela vazia é olhar o resto da fila. Deixar isso a um
                // clique evita a conclusão errada de que não há nada para despachar.
                semFiltro ? (
                  <BotaoSecundario onClick={() => mudarBarra({ prazoPreset: "todas" })}>
                    Ver todos os prazos
                  </BotaoSecundario>
                ) : undefined
              }
              acao={
                !semFiltro ? (
                  <BotaoSecundario onClick={limpar}>Limpar filtros</BotaoSecundario>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* A seleção e a impressão em lote. NÃO existem no CyberDock (lá a
                  etiqueta vive na tabela de vendas), e ficam: o `shipment_labels` do
                  Mercado Livre aceita vários envios numa chamada, e sem isso
                  despachar trinta pacotes são trinta cliques e trinta abas. */}
              <div className="cz-nao-imprimir">
                <BarraLote
                  elegiveis={elegiveisLote}
                  selecionados={selecionados}
                  onSelecionar={setSelecionados}
                  totalNaPagina={pacotes.length}
                  totalGeral={dados?.total ?? 0}
                  atualizando={atualizando}
                />
              </div>

              <TabelaSeparacao
                pacotes={pacotes}
                offset={(filtros.pagina - 1) * filtros.porPagina}
                selecionados={selecionados}
                onAlternarSelecao={alternarSelecao}
                elegiveis={chavesElegiveis}
              />

              <div className="cz-nao-imprimir">
                <PaginacaoSeparacao
                  pagina={filtros.pagina}
                  totalPaginas={dados?.totalPaginas ?? 1}
                  porPagina={filtros.porPagina}
                  onPagina={trocarPagina}
                  onPorPagina={(v) => mudarBarra({ porPagina: v })}
                />
              </div>
            </>
          )}
        </section>

        {/* Os resumos somam o CONJUNTO FILTRADO INTEIRO, não a página. É por isso
            que eles fecham com os cartões do topo e não com a tabela acima — e é o
            que os torna úteis: a página 1 de 40 não diz nada sobre o dia. */}
        {dados && !carregando && !vazio && (
          <div className="cz-nao-imprimir mt-4 grid gap-4 lg:grid-cols-2">
            {/* Modalidade e SKU primeiro, e nesta ordem: a modalidade define o CORTE
                do dia (o que sai por coleta, o que vai à agência) e o SKU é a lista
                de separação. As categorias vêm depois porque são planejamento, não a
                tarefa. */}
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
      </div>
    </MolduraTela>
  );
}
