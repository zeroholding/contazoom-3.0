"use client";

/**
 * Painel de entrada do módulo de tarefas contábeis.
 *
 * É a primeira tela que o time abre, então ela responde três perguntas na
 * ordem em que aparecem na cabeça de quem chega: quanto tem aberto nesta
 * competência, o que está fora do prazo ou travado, e o que a legalização
 * ainda deve.
 *
 * Duas decisões que valem registro:
 *
 *   - A competência inicial vem da API, não do relógio do navegador. A apuração
 *     de janeiro é feita em fevereiro, e essa regra está no servidor; duplicar o
 *     cálculo aqui criaria duas fontes de verdade que divergem na virada do mês.
 *
 *   - "Abrir competência do mês" passa por prévia obrigatória. A ação cria uma
 *     linha por empresa ativa e não existe desfazer em massa, então o operador
 *     confirma o número e a lista antes de gravar.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  apiGet,
  apiPost,
  mensagemDeErro,
  query,
} from "@/app/components/views/ui/tarefas/api";
import type {
  ApuracaoLista,
  Paginacao,
  Pagination,
  PainelResumo,
  ProcessoLista,
} from "@/app/components/views/ui/tarefas/tipos";
import {
  Aviso,
  Cabecalho,
  Carregando,
  CartaoKpi,
  Painel,
  Vazio,
} from "@/app/components/views/ui/tarefas/Base";
import { Botao, Escolha } from "@/app/components/views/ui/tarefas/Campos";
import { Modal } from "@/app/components/views/ui/tarefas/Modal";
import {
  SeloBloqueio,
  SeloPrazo,
  SeloRegime,
  SeloStatus,
} from "@/app/components/views/ui/tarefas/Selos";
import {
  MESES,
  competenciaChave,
  nomeEmpresa,
  plural,
} from "@/app/components/views/ui/tarefas/formato";
import {
  STATUS_ORDEM,
  corDoStatus,
  labelDoStatus,
  parseCompetencia,
} from "@/lib/tarefa-status";
import { REGIME, REGIME_LABEL } from "@/lib/tarefa-etapas";
import { useSessao } from "@/hooks/useSessao";

/* ------------------------------- Contratos -------------------------------- */

/** Apuração devolve `tarefas` + `pagination`. */
type RespostaApuracao = {
  tarefas: ApuracaoLista[];
  pagination: Pagination;
};

/** Legalização devolve `itens` + `paginacao`. Assimetria real do backend. */
type RespostaLegalizacao = {
  itens: ProcessoLista[];
  paginacao: Paginacao;
};

type FalhaAbertura = {
  empresaId: string;
  cnpj: string;
  razaoSocial: string;
  erro: string;
};

type EmpresaPrevista = {
  empresaId: string;
  cnpj: string;
  razaoSocial: string;
  regime: string;
};

/**
 * `abrir-mes` responde com a mesma forma no dry run e na gravação; só o dry run
 * traz `criaria`. Por isso um tipo só, com o campo opcional.
 */
type ResultadoAbertura = {
  dryRun?: boolean;
  competencia: { ano: number; mes: number; chave: string; label: string };
  empresasAtivas: number;
  criadas: number;
  jaExistiam: number;
  falhas: FalhaAbertura[];
  criaria?: EmpresaPrevista[];
};

/* ------------------------------- Constantes ------------------------------- */

const LIMITE_LISTA = 5;
/** Quantas empresas a prévia mostra antes de resumir em "e mais X". */
const LIMITE_PREVIA = 15;
const ANOS_ATRAS = 3;
const ANOS_ADIANTE = 1;

const REGIMES_PAINEL = [REGIME.SIMPLES_NACIONAL, REGIME.LUCRO_PRESUMIDO];

const OPCOES_MES = MESES.map((nome, indice) => ({
  valor: String(indice + 1),
  texto: nome,
}));

/* --------------------------------- Tela ----------------------------------- */

export default function TarefasPainelView() {
  const { permissoes } = useSessao();

  /** Vazio na primeira carga: quem decide a competência padrão é a API. */
  const [selecionada, setSelecionada] = useState("");
  const [recarga, setRecarga] = useState(0);

  const [resumo, setResumo] = useState<PainelResumo | null>(null);
  const [atencao, setAtencao] = useState<ApuracaoLista[]>([]);
  const [origemAtencao, setOrigemAtencao] = useState<
    "atrasado" | "bloqueada" | null
  >(null);
  const [carregandoResumo, setCarregandoResumo] = useState(true);
  const [erro, setErro] = useState("");

  const [processos, setProcessos] = useState<ProcessoLista[]>([]);
  const [carregandoProcessos, setCarregandoProcessos] = useState(true);
  const [erroProcessos, setErroProcessos] = useState("");

  const [previa, setPrevia] = useState<ResultadoAbertura | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [buscandoPrevia, setBuscandoPrevia] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erroAbertura, setErroAbertura] = useState("");
  const [sucesso, setSucesso] = useState("");

  /* ------------------------------- Carga ---------------------------------- */

  // AbortController porque trocar de competência duas vezes rápido faria a
  // resposta antiga chegar depois da nova e sobrescrever a tela.
  useEffect(() => {
    const controlador = new AbortController();
    const sinal = controlador.signal;

    async function carregar() {
      setCarregandoResumo(true);
      setErro("");
      try {
        const dados = await apiGet<PainelResumo>(
          `/api/tarefas/painel${query({ competencia: selecionada })}`,
          sinal
        );
        if (sinal.aborted) return;
        setResumo(dados);

        const chave = dados.competencia.chave;

        const atrasadas = await apiGet<RespostaApuracao>(
          `/api/tarefas/apuracao${query({
            competencia: chave,
            prazo: "atrasado",
            limit: LIMITE_LISTA,
          })}`,
          sinal
        );
        if (sinal.aborted) return;

        if (atrasadas.tarefas.length > 0) {
          setAtencao(atrasadas.tarefas);
          setOrigemAtencao("atrasado");
        } else {
          // Sem atraso, o que cobra ação é o que está travado.
          const travadas = await apiGet<RespostaApuracao>(
            `/api/tarefas/apuracao${query({
              competencia: chave,
              bloqueada: "true",
              limit: LIMITE_LISTA,
            })}`,
            sinal
          );
          if (sinal.aborted) return;
          setAtencao(travadas.tarefas);
          setOrigemAtencao(travadas.tarefas.length > 0 ? "bloqueada" : null);
        }

        setCarregandoResumo(false);
      } catch (falha) {
        if (sinal.aborted) return;
        const mensagem = mensagemDeErro(falha);
        // String vazia é aborto tratado pelo cliente HTTP: não é erro de tela.
        if (!mensagem) return;
        setErro(mensagem);
        setCarregandoResumo(false);
      }
    }

    void carregar();
    return () => controlador.abort();
  }, [selecionada, recarga]);

  // Legalização não depende da competência: processo de abertura não tem mês.
  useEffect(() => {
    const controlador = new AbortController();
    const sinal = controlador.signal;

    async function carregar() {
      setCarregandoProcessos(true);
      setErroProcessos("");
      try {
        const dados = await apiGet<RespostaLegalizacao>(
          `/api/tarefas/legalizacao${query({
            abertos: "true",
            limit: LIMITE_LISTA,
          })}`,
          sinal
        );
        if (sinal.aborted) return;
        setProcessos(dados.itens);
        setCarregandoProcessos(false);
      } catch (falha) {
        if (sinal.aborted) return;
        const mensagem = mensagemDeErro(falha);
        if (!mensagem) return;
        setErroProcessos(mensagem);
        setCarregandoProcessos(false);
      }
    }

    void carregar();
    return () => controlador.abort();
  }, [recarga]);

  /* ------------------------------ Derivados ------------------------------- */

  const emFoco =
    parseCompetencia(selecionada) ??
    (resumo ? { ano: resumo.competencia.ano, mes: resumo.competencia.mes } : null);

  const chave = resumo?.competencia.chave ?? selecionada;
  const rotulo = resumo?.competencia.label ?? "";

  // Faixa fixa a partir do ano corrente: se a base seguisse a competência
  // escolhida, a lista de anos andaria junto e a pessoa perderia o ponto de
  // partida a cada troca.
  const anoCorrente = new Date().getFullYear();
  const anos: number[] = [];
  for (let ano = anoCorrente - ANOS_ATRAS; ano <= anoCorrente + ANOS_ADIANTE; ano++) {
    anos.push(ano);
  }
  if (emFoco && !anos.includes(emFoco.ano)) anos.push(emFoco.ano);
  anos.sort((a, b) => b - a);

  const opcoesAno = anos.map((ano) => ({ valor: String(ano), texto: String(ano) }));

  const maiorStatus = resumo
    ? Math.max(...STATUS_ORDEM.map((status) => resumo.porStatus[status] ?? 0))
    : 0;

  const listaApuracao = `/admin/tarefas/apuracao${query({ competencia: chave })}`;

  /* -------------------------------- Ações --------------------------------- */

  function trocarCompetencia(ano: number, mes: number) {
    setSelecionada(competenciaChave(ano, mes));
    setSucesso("");
    setErroAbertura("");
  }

  async function pedirPrevia() {
    if (!emFoco) return;
    setBuscandoPrevia(true);
    setErroAbertura("");
    setSucesso("");
    try {
      const dados = await apiPost<ResultadoAbertura>(
        "/api/tarefas/apuracao/abrir-mes?dryRun=1",
        { ano: emFoco.ano, mes: emFoco.mes }
      );
      setPrevia(dados);
      setModalAberto(true);
    } catch (falha) {
      setErroAbertura(mensagemDeErro(falha));
    } finally {
      setBuscandoPrevia(false);
    }
  }

  async function confirmarAbertura() {
    if (!emFoco) return;
    setConfirmando(true);
    setErroAbertura("");
    try {
      // Mesmo ano/mês da prévia: confirmar outra competência seria mentir sobre
      // o que a pessoa acabou de conferir.
      const dados = await apiPost<ResultadoAbertura>(
        "/api/tarefas/apuracao/abrir-mes",
        { ano: emFoco.ano, mes: emFoco.mes }
      );
      setModalAberto(false);
      setPrevia(null);
      const jaHavia =
        dados.jaExistiam > 0
          ? ` ${plural(dados.jaExistiam, "já existia", "já existiam")}.`
          : "";
      setSucesso(
        `${plural(
          dados.criadas,
          "competência criada",
          "competências criadas"
        )} em ${dados.competencia.label}.${jaHavia}`
      );
      setRecarga((n) => n + 1);
    } catch (falha) {
      setErroAbertura(mensagemDeErro(falha));
    } finally {
      setConfirmando(false);
    }
  }

  function fecharModal() {
    if (confirmando) return;
    setModalAberto(false);
    setPrevia(null);
  }

  /* -------------------------------- Render -------------------------------- */

  const primeiraCarga = carregandoResumo && !resumo && !erro;

  return (
    <div className="cz-tarefas p-6 max-w-7xl mx-auto space-y-6">
      <Cabecalho
        titulo="Tarefas contábeis"
        icone="ClipboardList"
        descricao={
          rotulo
            ? `Competência em foco: ${rotulo}. A apuração de um mês é fechada no mês seguinte.`
            : "Apurações fiscais e processos de legalização da carteira."
        }
        acoes={
          permissoes.criarProcesso && emFoco ? (
            <Botao
              variante="primario"
              icone="CalendarPlus"
              onClick={pedirPrevia}
              carregando={buscandoPrevia}
              textoCarregando="Conferindo"
            >
              Abrir competência do mês
            </Botao>
          ) : undefined
        }
      />

      {sucesso && (
        <Aviso tom="ok" mensagem={sucesso} onFechar={() => setSucesso("")} />
      )}

      {erroAbertura && !modalAberto && (
        <Aviso mensagem={erroAbertura} onFechar={() => setErroAbertura("")} />
      )}

      {erro && (
        <div className="space-y-3">
          <Aviso mensagem={erro} />
          <Botao
            variante="secundario"
            icone="RefreshCw"
            onClick={() => setRecarga((n) => n + 1)}
          >
            Tentar novamente
          </Botao>
        </div>
      )}

      {emFoco && (
        <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <Escolha
            rotulo="Mês da competência"
            opcoes={OPCOES_MES}
            value={String(emFoco.mes)}
            onChange={(evento) =>
              trocarCompetencia(emFoco.ano, Number(evento.target.value))
            }
            wrapperClassName="w-44"
          />
          <Escolha
            rotulo="Ano"
            opcoes={opcoesAno}
            value={String(emFoco.ano)}
            onChange={(evento) =>
              trocarCompetencia(Number(evento.target.value), emFoco.mes)
            }
            wrapperClassName="w-32"
          />
          {carregandoResumo && resumo && (
            <span className="pb-2 text-xs font-medium text-gray-500">
              Atualizando os números
            </span>
          )}
        </div>
      )}

      {primeiraCarga && <Carregando texto="Carregando painel" />}

      {resumo && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <CartaoKpi
              titulo="Competências abertas"
              valor={resumo.competenciasAbertas}
              icone="ClipboardList"
              tom="laranja"
              detalhe={rotulo}
              href={listaApuracao}
            />
            <CartaoKpi
              titulo="Em andamento"
              valor={resumo.emAndamento}
              icone="Loader"
              tom="azul"
              detalhe="Sem pendência aberta e ainda não encerradas"
              href={listaApuracao}
            />
            <CartaoKpi
              titulo="Com pendência"
              valor={resumo.bloqueadas}
              icone="AlertTriangle"
              tom="ambar"
              detalhe={
                resumo.mediaDiasBloqueio > 0
                  ? `média de ${plural(
                      resumo.mediaDiasBloqueio,
                      "dia",
                      "dias"
                    )} travado`
                  : undefined
              }
              href={`/admin/tarefas/apuracao${query({
                competencia: chave,
                bloqueada: "true",
              })}`}
            />
            <CartaoKpi
              titulo="Atrasadas"
              valor={resumo.atrasadas}
              icone="AlarmClock"
              tom="vermelho"
              detalhe="Prazo de entrega já vencido"
              href={`/admin/tarefas/apuracao${query({
                competencia: chave,
                prazo: "atrasado",
              })}`}
            />
            <CartaoKpi
              titulo="Concluídas"
              valor={resumo.concluidas}
              icone="CheckCircle2"
              tom="verde"
              detalhe={rotulo}
              href={`/admin/tarefas/apuracao${query({
                competencia: chave,
                status: "CONCLUIDO",
              })}`}
            />
            <CartaoKpi
              titulo="Empresas ativas"
              valor={resumo.empresasAtivas}
              icone="Building2"
              tom="cinza"
              detalhe="Base que gera competência todo mês"
              href="/admin/empresas"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Painel
              titulo="Distribuição por status"
              descricao={`Apurações de ${rotulo} por etapa do fluxo`}
              className="lg:col-span-2"
            >
              {maiorStatus === 0 ? (
                <div className="p-5">
                  <Vazio
                    icone="ClipboardList"
                    titulo="Nenhuma competência aberta"
                    descricao={`Não existe apuração registrada em ${rotulo}. Abra a competência para gerar uma tarefa por empresa ativa.`}
                  />
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {STATUS_ORDEM.map((status) => {
                    const valor = resumo.porStatus[status] ?? 0;
                    const largura =
                      maiorStatus > 0
                        ? Math.round((valor / maiorStatus) * 100)
                        : 0;
                    return (
                      <li key={status}>
                        <Link
                          href={`/admin/tarefas/apuracao${query({
                            competencia: chave,
                            status,
                          })}`}
                          aria-label={`${labelDoStatus(status)}: ${plural(
                            valor,
                            "apuração",
                            "apurações"
                          )}`}
                          className="block px-5 py-3 transition-colors hover:bg-orange-50/40"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <SeloStatus status={status} curto />
                            <span className="text-sm font-bold text-gray-900">
                              {valor}
                            </span>
                          </div>
                          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${largura}%`,
                                backgroundColor: corDoStatus(status).solida,
                              }}
                            />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Painel>

            <Painel
              titulo="Por regime"
              descricao="Como a carteira se divide nesta competência"
            >
              <div className="space-y-3 p-5">
                {REGIMES_PAINEL.map((regime) => (
                  <Link
                    key={regime}
                    href={`/admin/tarefas/apuracao${query({
                      competencia: chave,
                      regime,
                    })}`}
                    aria-label={`${REGIME_LABEL[regime]}: ${plural(
                      resumo.porRegime[regime] ?? 0,
                      "apuração",
                      "apurações"
                    )}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-orange-300 hover:bg-orange-50/40"
                  >
                    <SeloRegime regime={regime} completo />
                    <span className="text-xl font-bold text-gray-900">
                      {resumo.porRegime[regime] ?? 0}
                    </span>
                  </Link>
                ))}
              </div>
            </Painel>
          </div>

          <Painel
            titulo="Precisa de atenção"
            descricao={
              origemAtencao === "atrasado"
                ? "Apurações com o prazo de entrega vencido"
                : origemAtencao === "bloqueada"
                ? "Sem atraso na competência; estas estão travadas esperando alguém"
                : `Situação das apurações de ${rotulo}`
            }
            acoes={
              atencao.length > 0 ? (
                <Link
                  href={`/admin/tarefas/apuracao${query({
                    competencia: chave,
                    prazo: origemAtencao === "atrasado" ? "atrasado" : "",
                    bloqueada: origemAtencao === "bloqueada" ? "true" : "",
                  })}`}
                  className="text-sm font-medium text-orange-600 transition-colors hover:text-orange-700"
                >
                  Ver todas
                </Link>
              ) : undefined
            }
          >
            {atencao.length === 0 ? (
              <div className="p-5">
                <Vazio
                  icone="CheckCircle2"
                  titulo="Nada atrasado nem travado nesta competência."
                  descricao={`As apurações de ${rotulo} estão dentro do prazo e sem pendência registrada.`}
                  acao={
                    <Link
                      href={listaApuracao}
                      className="text-sm font-medium text-orange-600 transition-colors hover:text-orange-700"
                    >
                      Ver a lista completa
                    </Link>
                  }
                />
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {atencao.map((tarefa) => (
                  <li key={tarefa.id}>
                    <Link
                      href={`/admin/tarefas/apuracao/${tarefa.id}`}
                      className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-orange-50/40 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {nomeEmpresa(tarefa.empresa)}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          Etapa {tarefa.etapaAtual} de {tarefa.totalEtapas}
                          {tarefa.tituloEtapaAtual
                            ? ` · ${tarefa.tituloEtapaAtual}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <SeloRegime regime={tarefa.regime} />
                        <SeloStatus status={tarefa.status} curto />
                        <SeloPrazo
                          situacao={tarefa.prazo.situacao}
                          dias={tarefa.prazo.dias}
                        />
                        {tarefa.bloqueada && (
                          <SeloBloqueio
                            responsavel={tarefa.bloqueioResponsavel}
                            dias={tarefa.diasEmBloqueio}
                          />
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Painel>
        </>
      )}

      <Painel
        titulo="Processos de legalização em aberto"
        descricao="Aberturas, encerramentos e alterações que ainda não fecharam"
        acoes={
          <Link
            href="/admin/tarefas/legalizacao"
            className="text-sm font-medium text-orange-600 transition-colors hover:text-orange-700"
          >
            Ver todos
          </Link>
        }
      >
        {erroProcessos ? (
          <div className="p-5">
            <Aviso mensagem={erroProcessos} />
          </div>
        ) : carregandoProcessos ? (
          <div className="px-5 py-8">
            <p className="text-center text-sm text-gray-500">
              Carregando processos
            </p>
          </div>
        ) : processos.length === 0 ? (
          <div className="p-5">
            <Vazio
              icone="Landmark"
              titulo="Nenhum processo em aberto"
              descricao="Toda abertura, alteração e encerramento em andamento aparece aqui."
              acao={
                <Link
                  href="/admin/tarefas/legalizacao"
                  className="text-sm font-medium text-orange-600 transition-colors hover:text-orange-700"
                >
                  Ir para legalização
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {processos.map((processo) => (
              <li key={processo.id}>
                <Link
                  href={`/admin/tarefas/legalizacao/${processo.id}`}
                  className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-orange-50/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {processo.tipoLabel}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {processo.empresa
                        ? nomeEmpresa(processo.empresa)
                        : `Empresa em abertura: ${
                            processo.identificacaoProvisoria ??
                            "sem identificação"
                          }`}
                      {" · "}
                      Etapa {processo.etapaAtual} de {processo.etapasTotal}
                    </p>
                  </div>
                  <SeloStatus status={processo.status} curto />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Painel>

      <Modal
        aberto={modalAberto}
        titulo="Abrir competência do mês"
        descricao={
          previa
            ? `Confira antes de gravar: não existe desfazer em massa para ${previa.competencia.label}.`
            : undefined
        }
        icone="CalendarPlus"
        largura="lg"
        onFechar={fecharModal}
        rodape={
          <>
            <Botao
              variante="secundario"
              onClick={fecharModal}
              disabled={confirmando}
            >
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              icone="CalendarPlus"
              onClick={confirmarAbertura}
              carregando={confirmando}
              textoCarregando="Criando"
              disabled={!previa || previa.criadas === 0}
            >
              {previa
                ? `Criar ${plural(
                    previa.criadas,
                    "competência",
                    "competências"
                  )}`
                : "Criar"}
            </Botao>
          </>
        }
      >
        {previa ? (
          <div className="space-y-4">
            {erroAbertura && <Aviso mensagem={erroAbertura} />}

            <p className="text-sm text-gray-600">
              Vai criar{" "}
              <span className="font-semibold text-gray-900">
                {plural(previa.criadas, "competência", "competências")}
              </span>{" "}
              de{" "}
              <span className="font-semibold text-gray-900">
                {previa.competencia.label}
              </span>
              {previa.jaExistiam > 0 && (
                <>
                  ,{" "}
                  {plural(previa.jaExistiam, "já existe", "já existem")}
                </>
              )}
              . Cada competência gera uma tarefa por empresa ativa, com as etapas
              do regime cadastrado.
            </p>

            {previa.criaria && previa.criaria.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <ul className="divide-y divide-gray-100">
                  {previa.criaria.slice(0, LIMITE_PREVIA).map((empresa) => (
                    <li
                      key={empresa.empresaId}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <span className="min-w-0 truncate text-sm text-gray-900">
                        {empresa.razaoSocial}
                      </span>
                      <SeloRegime regime={empresa.regime} />
                    </li>
                  ))}
                </ul>
                {previa.criaria.length > LIMITE_PREVIA && (
                  <p className="border-t border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                    e mais{" "}
                    {plural(
                      previa.criaria.length - LIMITE_PREVIA,
                      "empresa",
                      "empresas"
                    )}
                  </p>
                )}
              </div>
            ) : (
              <Aviso
                tom="info"
                mensagem={`Nada novo para criar em ${previa.competencia.label}: todas as empresas ativas já têm competência aberta.`}
              />
            )}

            {previa.falhas.length > 0 && (
              <div className="space-y-2">
                <Aviso
                  tom="atencao"
                  mensagem={`${plural(
                    previa.falhas.length,
                    "empresa fica",
                    "empresas ficam"
                  )} de fora. Corrija o cadastro e abra a competência de novo para incluí-las.`}
                />
                <ul className="space-y-1 text-xs text-gray-600">
                  {previa.falhas.slice(0, LIMITE_PREVIA).map((falha) => (
                    <li key={falha.empresaId}>
                      <span className="font-medium text-gray-900">
                        {falha.razaoSocial}
                      </span>{" "}
                      — {falha.erro}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Conferindo a competência</p>
        )}
      </Modal>
    </div>
  );
}
