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
 *
 *   - A série de evolução são SEIS chamadas ao mesmo endpoint, uma por
 *     competência, em paralelo. Não existe rota de série histórica no backend, e
 *     inventar ponto para a curva não ficar reta seria mentir sobre o passado.
 *     Cada chamada degrada sozinha: o mês que não voltou sai do gráfico, a tela
 *     não cai. Ver `carregarSerie`.
 *
 *   - Base vazia não é caso de borda, é o primeiro dia de uso. Com zero empresa
 *     ativa não existe competência para abrir, e a grade de gráficos viraria seis
 *     retângulos vazios. Nesse estado a tela troca os gráficos pelo bloco de
 *     `PrimeirosPassos`, que diz a ordem das coisas — cadastrar empresa, abrir a
 *     competência, acompanhar as etapas — e leva para a primeira ação. O botão de
 *     abrir competência fica desabilitado com o motivo escrito, em vez de aceitar
 *     o clique e devolver "0 criadas".
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
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
import {
  AreaEvolucao,
  BarrasRegime,
  Faisca,
  RoscaStatus,
} from "@/app/components/views/ui/tarefas/Graficos";
import Icone from "@/app/components/views/ui/tarefas/Icone";
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
import { parseCompetencia } from "@/lib/tarefa-status";
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

/**
 * Um mês da série de evolução.
 *
 * `chave` viaja junto com os números porque a série pode voltar incompleta: sem
 * ela não há como saber se o último ponto é mesmo a competência em foco, e a
 * comparação "vs. mês anterior" apontaria para o mês errado.
 */
type PontoSerie = {
  chave: string;
  rotulo: string;
  abertas: number;
  concluidas: number;
  atrasadas: number;
  bloqueadas: number;
};

/* ------------------------------- Constantes ------------------------------- */

const LIMITE_LISTA = 5;
/** Quantas empresas a prévia mostra antes de resumir em "e mais X". */
const LIMITE_PREVIA = 15;
const ANOS_ATRAS = 3;
const ANOS_ADIANTE = 1;

/**
 * Tamanho da série de evolução, contando a competência em foco.
 *
 * Seis é o que caber num gráfico de meio painel sem o eixo virar sopa de letra,
 * e são seis requisições de contagem — resposta de algumas centenas de bytes
 * cada, disparadas juntas.
 */
const MESES_SERIE = 6;

const OPCOES_MES = MESES.map((nome, indice) => ({
  valor: String(indice + 1),
  texto: nome,
}));

/* -------------------------------- Auxiliares ------------------------------ */

/** "Jan/26". Mês inteiro não cabe em seis marcas de eixo. */
function rotuloCurto(ano: number, mes: number): string {
  const nome = MESES[mes - 1] ?? String(mes);
  return `${nome.slice(0, 3)}/${String(ano).slice(-2)}`;
}

/**
 * As `quantidade` competências que terminam em `chaveFinal`, da mais antiga para
 * a mais nova.
 *
 * A conta é feita em ano/mês, sem `Date`, porque competência é par ano/mês e não
 * instante: recuar um mês a partir de 31 de março com `Date` cai em 3 de março.
 */
function competenciasDaSerie(
  chaveFinal: string,
  quantidade: number
): { chave: string; ano: number; mes: number }[] {
  const base = parseCompetencia(chaveFinal);
  if (!base) return [];

  const lista: { chave: string; ano: number; mes: number }[] = [];
  for (let atras = quantidade - 1; atras >= 0; atras--) {
    let mes = base.mes - atras;
    let ano = base.ano;
    while (mes <= 0) {
      mes += 12;
      ano -= 1;
    }
    lista.push({ chave: competenciaChave(ano, mes), ano, mes });
  }
  return lista;
}

/**
 * Variação percentual contra o mês anterior, no formato que o `CartaoKpi` espera.
 *
 * `undefined` quando não há base de comparação: sair de zero não é "+100%", é a
 * primeira medição, e desenhar seta nesse caso inventa tendência que ninguém
 * pode conferir.
 */
function variacaoDe(
  atual: number,
  anterior: number | undefined,
  positivoEhBom: boolean
): { valor: number; positivoEhBom?: boolean } | undefined {
  if (anterior === undefined || anterior === 0) return undefined;
  return {
    valor: Math.round(((atual - anterior) / anterior) * 100),
    positivoEhBom,
  };
}

/**
 * Faísca do cartão, ou nada.
 *
 * Decidido aqui, e não dentro do componente: o `CartaoKpi` reserva 42% da
 * largura quando recebe `grafico`, e um elemento que renderiza `null` deixaria o
 * buraco reservado do mesmo jeito, apertando o número ao lado por nada.
 */
function faisca(valores: number[], cor?: string): ReactNode {
  if (valores.length < 2) return undefined;
  if (valores.reduce((soma, valor) => soma + valor, 0) === 0) return undefined;
  return <Faisca valores={valores} cor={cor} />;
}

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

  const [serie, setSerie] = useState<PontoSerie[]>([]);
  const [carregandoSerie, setCarregandoSerie] = useState(true);
  /** Meses da série que não responderam. O gráfico avisa e segue com o resto. */
  const [mesesSemResposta, setMesesSemResposta] = useState(0);

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

  const listaApuracao = `/admin/tarefas/apuracao${query({ competencia: chave })}`;

  // Os dois estados que mudam a tela inteira. Sem empresa ativa não existe
  // competência para abrir, e sem competência aberta não existe etapa para
  // acompanhar — é a ordem que o bloco de primeiros passos explica.
  const semEmpresa = resumo ? resumo.empresasAtivas === 0 : false;
  const semCompetencia = resumo ? resumo.competenciasAbertas === 0 : false;

  /* --------------------------- Série de evolução --------------------------- */

  // Não existe rota de série histórica: o painel responde por UMA competência.
  // Então a série é o mesmo endpoint chamado uma vez por mês, em paralelo.
  //
  // O `catch` é por chamada, não em volta do `Promise.all`, e é isso que faz a
  // degradação funcionar: uma rejeição no `all` derrubaria os seis meses, e um
  // mês que falhou não é motivo para apagar o gráfico nem para pintar erro na
  // tela toda. O mês que não voltou simplesmente não entra na curva.
  //
  // A chave vem de `chave`, que é a competência já resolvida pela API — calcular
  // o mês padrão aqui duplicaria a regra de "apuração de janeiro é feita em
  // fevereiro" que mora no servidor.
  useEffect(() => {
    if (!chave) return;

    const controlador = new AbortController();
    const sinal = controlador.signal;

    async function carregarSerie() {
      setCarregandoSerie(true);
      const alvos = competenciasDaSerie(chave, MESES_SERIE);

      const respostas = await Promise.all(
        alvos.map(async (alvo) => {
          try {
            const dados = await apiGet<PainelResumo>(
              `/api/tarefas/painel${query({ competencia: alvo.chave })}`,
              sinal
            );
            const ponto: PontoSerie = {
              chave: alvo.chave,
              rotulo: rotuloCurto(alvo.ano, alvo.mes),
              abertas: dados.competenciasAbertas,
              concluidas: dados.concluidas,
              atrasadas: dados.atrasadas,
              bloqueadas: dados.bloqueadas,
            };
            return ponto;
          } catch {
            return null;
          }
        })
      );

      if (sinal.aborted) return;

      const pontos = respostas.filter(
        (ponto): ponto is PontoSerie => ponto !== null
      );
      setSerie(pontos);
      setMesesSemResposta(alvos.length - pontos.length);
      setCarregandoSerie(false);
    }

    void carregarSerie();
    return () => controlador.abort();
  }, [chave, recarga]);

  // A comparação só vale se o último ponto for a competência em foco. Se foi
  // justamente esse mês que falhou, "vs. mês anterior" mostraria a variação entre
  // dois meses velhos ao lado de um número atual.
  const serieCasaComFoco =
    serie.length > 0 && serie[serie.length - 1].chave === chave;
  const mesAnterior =
    serieCasaComFoco && serie.length >= 2 ? serie[serie.length - 2] : null;
  const compara = mesAnterior ? `vs. ${mesAnterior.rotulo}` : undefined;

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
    <div className="cz-tarefas p-6 max-w-[1800px] mx-auto space-y-6">
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
            // Desabilitado COM motivo escrito quando a base está vazia. Antes o
            // clique era aceito e voltava "0 competências criadas", sem dizer que
            // o problema era não ter empresa ativa — a pessoa concluía que a
            // função estava quebrada.
            <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
              <Botao
                variante="primario"
                icone="CalendarPlus"
                onClick={pedirPrevia}
                carregando={buscandoPrevia}
                textoCarregando="Conferindo"
                disabled={semEmpresa}
                title={
                  semEmpresa
                    ? "Nenhuma empresa ativa na base. A competência é criada a partir das empresas ativas, então não há o que abrir."
                    : rotulo
                    ? `Cria uma apuração por empresa ativa em ${rotulo}.`
                    : "Cria uma apuração por empresa ativa na competência em foco."
                }
              >
                Abrir competência do mês
              </Botao>
              {semEmpresa && (
                <span className="max-w-[15rem] text-[11.5px] leading-4 text-[var(--cz-texto-suave)] sm:text-right">
                  Cadastre uma empresa ativa primeiro: sem base, a abertura criaria
                  zero competências.
                </span>
              )}
            </div>
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
        <div className="flex flex-wrap items-end gap-4 rounded-[14px] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-4 shadow-[var(--cz-elev-1)]">
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
          {/* Antes dos KPIs de propósito: com a base zerada, seis números zero não
              dizem o que fazer, e é o que fazer que a pessoa veio buscar. */}
          {(semEmpresa || semCompetencia) && (
            <PrimeirosPassos
              empresasAtivas={resumo.empresasAtivas}
              competenciasAbertas={resumo.competenciasAbertas}
              rotulo={rotulo}
              podeAbrir={Boolean(permissoes.criarProcesso)}
              onAbrir={pedirPrevia}
              abrindo={buscandoPrevia}
              listaApuracao={listaApuracao}
            />
          )}

          {/* Duas fileiras de três, e não uma de seis: em 1800px seis colunas dão
              278px por cartão, e depois de descontar os 42% que a faísca ocupa
              sobra menos que o rótulo "Competências abertas" precisa. Quem usa a
              largura são os painéis de gráfico abaixo, que têm o que mostrar
              nela. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <CartaoKpi
              titulo="Competências abertas"
              valor={resumo.competenciasAbertas}
              icone="ClipboardList"
              tom="laranja"
              detalhe={compara ?? rotulo}
              variacao={variacaoDe(
                resumo.competenciasAbertas,
                mesAnterior?.abertas,
                true
              )}
              grafico={faisca(serie.map((ponto) => ponto.abertas))}
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
              // A média de dias travado ganha da comparação quando existe: é o
              // número que cobra ação hoje, não a tendência do mês passado.
              detalhe={
                resumo.mediaDiasBloqueio > 0
                  ? `média de ${plural(
                      resumo.mediaDiasBloqueio,
                      "dia",
                      "dias"
                    )} travado`
                  : compara
              }
              // Pendência subindo é ruim: a seta continua apontando para cima, a
              // cor é que muda.
              variacao={variacaoDe(
                resumo.bloqueadas,
                mesAnterior?.bloqueadas,
                false
              )}
              grafico={faisca(
                serie.map((ponto) => ponto.bloqueadas),
                "#D9500A"
              )}
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
              detalhe={compara ?? "Prazo de entrega já vencido"}
              variacao={variacaoDe(
                resumo.atrasadas,
                mesAnterior?.atrasadas,
                false
              )}
              grafico={faisca(
                serie.map((ponto) => ponto.atrasadas),
                "#B42318"
              )}
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

          {/* Com a base zerada a grade não entra: rosca de zero é uma
              circunferência cinza, barra de zero é um retângulo e os três juntos
              fazem a tela parecer quebrada. Quem ocupa o lugar é o bloco de
              primeiros passos, acima. */}
          {!semEmpresa && (
            <>
              {/* Doze colunas para a evolução ficar com o dobro da largura do
                  painel de regime. Em três colunas iguais, seis meses de curva
                  ficavam comprimidos e as duas barras sobravam espaço. */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <Painel
                  titulo="Evolução mês a mês"
                  descricao={`Competências abertas, concluídas e atrasadas nos últimos ${MESES_SERIE} meses, até ${rotulo}.`}
                  className="lg:col-span-8"
                  rodape={
                    mesesSemResposta > 0 ? (
                      <p className="text-[12px] leading-relaxed text-[var(--cz-texto-suave)]">
                        {plural(
                          mesesSemResposta,
                          "mês não respondeu",
                          "meses não responderam"
                        )}{" "}
                        na consulta do histórico. A curva mostra os que voltaram.
                      </p>
                    ) : undefined
                  }
                >
                  <div className="px-5 py-4">
                    {carregandoSerie && serie.length === 0 ? (
                      <p className="py-16 text-center text-[13px] text-[var(--cz-texto-suave)]">
                        Carregando os últimos meses
                      </p>
                    ) : (
                      <AreaEvolucao dados={serie} />
                    )}
                  </div>
                </Painel>

                <Painel
                  titulo="Por regime"
                  descricao="Como a carteira se divide nesta competência"
                  className="lg:col-span-4"
                >
                  <div className="px-5 py-4">
                    <BarrasRegime
                      porRegime={resumo.porRegime}
                      rotulo={rotulo}
                      // Mais alto que o padrão para o painel de regime encostar na
                      // altura do de evolução, que está na mesma fileira.
                      altura={204}
                      linkDoRegime={(regime) =>
                        `/admin/tarefas/apuracao${query({
                          competencia: chave,
                          regime,
                        })}`
                      }
                    />
                  </div>
                </Painel>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <Painel
                  titulo="Distribuição por status"
                  descricao={`Apurações de ${rotulo} por etapa do fluxo`}
                  className="lg:col-span-5"
                >
                  <div className="px-5 py-4">
                    {/* A legenda continua levando para a lista filtrada, que era
                        o que a régua de barras fazia antes. */}
                    <RoscaStatus
                      porStatus={resumo.porStatus}
                      rotulo={rotulo}
                      linkDoStatus={(status) =>
                        `/admin/tarefas/apuracao${query({
                          competencia: chave,
                          status,
                        })}`
                      }
                    />
                  </div>
                </Painel>

                <Painel
                  titulo="Precisa de atenção"
                  className="lg:col-span-7"
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
                          bloqueada:
                            origemAtencao === "bloqueada" ? "true" : "",
                        })}`}
                        className="text-[12.5px] font-semibold text-[var(--cz-laranja-forte)] transition-colors hover:text-[var(--cz-laranja)]"
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
                            className="text-[12.5px] font-semibold text-[var(--cz-laranja-forte)] transition-colors hover:text-[var(--cz-laranja)]"
                          >
                            Ver a lista completa
                          </Link>
                        }
                      />
                    </div>
                  ) : (
                    <ul className="divide-y divide-[var(--cz-hairline)]">
                      {atencao.map((tarefa) => (
                        <li key={tarefa.id}>
                          <Link
                            href={`/admin/tarefas/apuracao/${tarefa.id}`}
                            className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-[var(--cz-laranja-suave)] sm:flex-row sm:items-center sm:justify-between"
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
              </div>
            </>
          )}
        </>
      )}

      <Painel
        titulo="Processos de legalização em aberto"
        descricao="Aberturas, encerramentos e alterações que ainda não fecharam"
        acoes={
          <Link
            href="/admin/tarefas/legalizacao"
            className="text-[12.5px] font-semibold text-[var(--cz-laranja-forte)] transition-colors hover:text-[var(--cz-laranja)]"
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
                  className="text-[12.5px] font-semibold text-[var(--cz-laranja-forte)] transition-colors hover:text-[var(--cz-laranja)]"
                >
                  Ir para legalização
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--cz-hairline)]">
            {processos.map((processo) => (
              <li key={processo.id}>
                <Link
                  href={`/admin/tarefas/legalizacao/${processo.id}`}
                  className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-[var(--cz-laranja-suave)] sm:flex-row sm:items-center sm:justify-between"
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
              <div className="overflow-hidden rounded-lg border border-[var(--cz-hairline)]">
                <ul className="divide-y divide-[var(--cz-hairline)]">
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

/* ----------------------------- Primeiros passos --------------------------- */

type Passo = {
  numero: number;
  titulo: string;
  descricao: string;
  feito: boolean;
  acao?: ReactNode;
};

/**
 * O que a tela mostra quando ainda não há o que mostrar.
 *
 * O estado vazio antigo era um beco: "Nenhuma competência aberta" e nada mais. A
 * pessoa clicava em "Abrir competência do mês", recebia "0 criadas" e não tinha
 * como saber que o problema era a base de empresas estar vazia. A dependência é
 * real e tem ordem:
 *
 *   empresa ativa em /admin/empresas  ->  competência do mês  ->  etapas
 *
 * Então o bloco escreve a ordem, marca o que já foi feito, destaca o passo atual e
 * põe a ação dele à mão. O passo 3 nunca aparece como atual: quando existe
 * competência aberta, este bloco não é renderizado — quem entra no lugar são os
 * gráficos.
 */
function PrimeirosPassos({
  empresasAtivas,
  competenciasAbertas,
  rotulo,
  podeAbrir,
  onAbrir,
  abrindo,
  listaApuracao,
}: {
  empresasAtivas: number;
  competenciasAbertas: number;
  rotulo: string;
  /** Sem permissão de criar, o passo 2 fica descrito mas sem botão. */
  podeAbrir: boolean;
  onAbrir: () => void;
  abrindo: boolean;
  listaApuracao: string;
}) {
  const temEmpresa = empresasAtivas > 0;
  const temCompetencia = competenciasAbertas > 0;

  const passos: Passo[] = [
    {
      numero: 1,
      titulo: "Cadastrar a primeira empresa",
      descricao:
        "A competência é gerada a partir das empresas ativas. Enquanto a base estiver vazia, abrir o mês cria zero tarefas.",
      feito: temEmpresa,
      acao: temEmpresa ? undefined : (
        // Link com a aparência do botão primário do kit em vez de `Botao` dentro
        // de `Link`: âncora com botão dentro é HTML inválido e leitor de tela
        // anuncia dois controles para um único alvo.
        <Link
          href="/admin/empresas"
          className="inline-flex items-center gap-2 rounded-[10px] border border-transparent bg-[#F26212] px-3.5 py-2 text-[0.8125rem] font-semibold leading-5 text-white transition-colors hover:bg-[#D9500A]"
        >
          <Icone nome="Building2" className="h-4 w-4" />
          Cadastrar empresa
        </Link>
      ),
    },
    {
      numero: 2,
      titulo: rotulo ? `Abrir a competência de ${rotulo}` : "Abrir a competência do mês",
      descricao:
        "Uma tarefa por empresa ativa, já com as etapas do regime cadastrado. A ação mostra a prévia antes de gravar.",
      feito: temCompetencia,
      acao:
        temEmpresa && !temCompetencia && podeAbrir ? (
          <Botao
            variante="primario"
            icone="CalendarPlus"
            onClick={onAbrir}
            carregando={abrindo}
            textoCarregando="Conferindo"
          >
            Abrir competência do mês
          </Botao>
        ) : undefined,
    },
    {
      numero: 3,
      titulo: "Acompanhar as etapas",
      descricao:
        "Com a competência aberta, cada empresa entra na lista com a etapa atual, o prazo e quem está travando. Os gráficos acendem aqui.",
      feito: false,
      acao: temCompetencia ? (
        <Link
          href={listaApuracao}
          className="text-[12.5px] font-semibold text-[var(--cz-laranja-forte)] transition-colors hover:text-[var(--cz-laranja)]"
        >
          Ver a lista de apurações
        </Link>
      ) : undefined,
    },
  ];

  const indiceAtual = passos.findIndex((passo) => !passo.feito);

  return (
    <Painel
      titulo="Primeiros passos"
      descricao={
        temEmpresa
          ? "A base já tem empresa ativa. Falta abrir a competência para as etapas aparecerem."
          : "A base de empresas está vazia, e é dela que sai toda competência. São três passos, nesta ordem."
      }
      elevacao={2}
    >
      <ol className="divide-y divide-[var(--cz-hairline)]">
        {passos.map((passo, indice) => {
          const atual = indice === indiceAtual;

          const marcador = passo.feito
            ? "border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]"
            : atual
            ? "border-transparent bg-[#F26212] text-white"
            : "border-[var(--cz-hairline-forte)] bg-white text-[var(--cz-texto-fraco)]";

          return (
            <li
              key={passo.numero}
              className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${
                atual ? "bg-[var(--cz-laranja-suave)]" : ""
              }`}
            >
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-bold ${marcador}`}
                >
                  {passo.feito ? (
                    <Icone nome="CheckCircle2" className="h-4 w-4" />
                  ) : (
                    <span className="cz-num">{passo.numero}</span>
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold leading-5 text-[var(--cz-texto)]">
                    {passo.titulo}
                    {passo.feito && (
                      <span className="ml-2 text-[12px] font-medium text-[var(--cz-laranja-forte)]">
                        feito
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 max-w-xl text-[12.5px] leading-relaxed text-[var(--cz-texto-suave)]">
                    {passo.descricao}
                  </p>
                </div>
              </div>
              {passo.acao && (
                <div className="shrink-0 pl-10 sm:pl-4">{passo.acao}</div>
              )}
            </li>
          );
        })}
      </ol>
    </Painel>
  );
}
