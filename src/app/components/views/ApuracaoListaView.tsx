"use client";

/**
 * Lista das apurações fiscais mensais, em Kanban e em tabela.
 *
 * Três decisões estruturais desta tela:
 *
 * 1. A URL carrega os filtros. O painel e os KPIs linkam para cá já filtrados
 *    ("atrasadas", "com pendência", "de tal empresa"), então os filtros são
 *    lidos de `useSearchParams` na primeira carga e reescritos com
 *    `router.replace` a cada mudança. Sem isso o link do KPI abriria a tela
 *    inteira e obrigaria o operador a refazer o filtro na mão.
 *
 * 2. O Kanban NÃO move status. Ver o comentário grande em `aceitaSoltar`.
 *
 * 3. Toda busca leva `AbortController`. A busca por texto tem debounce de 400ms
 *    e, sem cancelamento, a resposta de "AC" pode chegar depois da resposta de
 *    "ACME" e sobrescrever a lista com dado velho.
 */

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  ErroApi,
  apiDelete,
  apiGet,
  apiPost,
  mensagemDeErro,
  query,
} from "@/app/components/views/ui/tarefas/api";
import type {
  ApuracaoLista,
  EmpresaLista,
  Pagination,
  UsuarioInterno,
} from "@/app/components/views/ui/tarefas/tipos";
import {
  formatarCnpj,
  iniciais,
  nomeEmpresa,
  plural,
} from "@/app/components/views/ui/tarefas/formato";
import {
  Aviso,
  Cabecalho,
  Carregando,
  Paginacao,
  Painel,
  Progresso,
  Vazio,
} from "@/app/components/views/ui/tarefas/Base";
import {
  Alternador,
  Botao,
  Entrada,
  Escolha,
  type Opcao,
} from "@/app/components/views/ui/tarefas/Campos";
import {
  Modal,
  ModalMotivo,
} from "@/app/components/views/ui/tarefas/Modal";
import {
  SeloBloqueio,
  SeloPrazo,
  SeloRegime,
  SeloStatus,
} from "@/app/components/views/ui/tarefas/Selos";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import CartaoApuracao from "@/app/components/views/ui/tarefas/CartaoApuracao";
import {
  MESES,
  STATUS,
  STATUS_LABEL,
  STATUS_LABEL_CURTO,
  STATUS_ORDEM,
  competenciaAnterior,
  competenciaChave,
  competenciaLabel,
  corDoStatus,
  labelDoStatus,
  parseCompetencia,
} from "@/lib/tarefa-status";
import {
  BLOQUEIO_RESPONSAVEL_LABEL,
  REGIME,
  REGIME_LABEL,
} from "@/lib/tarefa-etapas";
import { useSessao } from "@/hooks/useSessao";

/* -------------------------------------------------------------------------- */
/*                            Contratos das rotas                             */
/* -------------------------------------------------------------------------- */

type RespostaLista = { tarefas: ApuracaoLista[]; pagination: Pagination };
type RespostaEmpresas = { empresas: EmpresaLista[]; pagination: Pagination };
type RespostaUsuarios = { usuarios: UsuarioInterno[]; total: number };

/* -------------------------------------------------------------------------- */
/*                                  Filtros                                   */
/* -------------------------------------------------------------------------- */

type Filtros = {
  /** "AAAA-MM", ou "" para todas as competências. */
  competencia: string;
  regime: string;
  status: string;
  responsavelId: string;
  empresaId: string;
  prazo: string;
  bloqueada: boolean;
  busca: string;
};

/**
 * Sentinela para "todas as competências" na URL.
 *
 * `query()` descarta valor vazio, então competência limpa desapareceria do
 * endereço e a próxima carga voltaria ao padrão. Com a sentinela, "todas"
 * sobrevive ao recarregar e ao compartilhar o link.
 */
const TODAS = "todas";

const PRAZOS_VALIDOS = ["atrasado", "vence_breve"];
const REGIMES_VALIDOS = [REGIME.SIMPLES_NACIONAL, REGIME.LUCRO_PRESUMIDO] as string[];

const OPCOES_REGIME: Opcao[] = REGIMES_VALIDOS.map((valor) => ({
  valor,
  texto: REGIME_LABEL[valor] ?? valor,
}));

const OPCOES_STATUS: Opcao[] = STATUS_ORDEM.map((valor) => ({
  valor,
  texto: STATUS_LABEL[valor] ?? valor,
}));

const OPCOES_PRAZO: Opcao[] = [
  { valor: "atrasado", texto: "Atrasado" },
  { valor: "vence_breve", texto: "Vence em breve" },
];

const OPCOES_MES: Opcao[] = MESES.map((nome, indice) => ({
  valor: String(indice + 1),
  texto: nome,
}));

const OPCOES_BLOQUEIO: Opcao[] = [
  "CLIENTE",
  "ESCRITORIO",
  "COMERCIAL_CZ",
  "TERCEIRO",
].map((valor) => ({
  valor,
  texto: BLOQUEIO_RESPONSAVEL_LABEL[valor] ?? valor,
}));

/** A competência que se apura no mês corrente: janeiro é apurado em fevereiro. */
function competenciaPadrao(): string {
  const { ano, mes } = competenciaAnterior();
  return competenciaChave(ano, mes);
}

function filtrosPadrao(): Filtros {
  return {
    competencia: competenciaPadrao(),
    regime: "",
    status: "",
    responsavelId: "",
    empresaId: "",
    prazo: "",
    bloqueada: false,
    busca: "",
  };
}

/**
 * Lê os filtros da URL, descartando valor inválido.
 *
 * Vale a validação aqui: `status=QUALQUERCOISA` num link colado à mão viraria
 * 400 `status_invalido` e a tela mostraria erro de servidor no lugar de lista.
 */
function lerFiltros(params: URLSearchParams | null): Filtros {
  const padrao = filtrosPadrao();
  if (!params) return padrao;

  const competencia = params.get("competencia");
  const regime = params.get("regime") ?? "";
  const status = params.get("status") ?? "";
  const prazo = params.get("prazo") ?? "";

  return {
    competencia:
      competencia === TODAS
        ? ""
        : competencia && parseCompetencia(competencia)
        ? competencia
        : padrao.competencia,
    regime: REGIMES_VALIDOS.includes(regime) ? regime : "",
    status: STATUS_ORDEM.includes(status) ? status : "",
    responsavelId: params.get("responsavelId") ?? "",
    empresaId: params.get("empresaId") ?? "",
    prazo: PRAZOS_VALIDOS.includes(prazo) ? prazo : "",
    bloqueada: params.get("bloqueada") === "true",
    busca: params.get("busca") ?? "",
  };
}

function temFiltroAlemDaCompetencia(filtros: Filtros): boolean {
  return (
    !!filtros.regime ||
    !!filtros.status ||
    !!filtros.responsavelId ||
    !!filtros.empresaId ||
    !!filtros.prazo ||
    filtros.bloqueada ||
    !!filtros.busca.trim()
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Wrapper                                   */
/* -------------------------------------------------------------------------- */

/**
 * `useSearchParams` obriga a existir um limite de Suspense acima, senão o build
 * acusa a rota como não pré-renderizável. O limite fica aqui, e não na página,
 * para a página seguir sendo server component simples.
 */
export default function ApuracaoListaView() {
  return (
    <Suspense
      fallback={
        <div className="cz-tarefas mx-auto max-w-[1600px] space-y-6 p-6">
          <Carregando texto="Carregando apuração fiscal" />
        </div>
      }
    >
      <Conteudo />
    </Suspense>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Conteúdo                                  */
/* -------------------------------------------------------------------------- */

function Conteudo() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { permissoes } = useSessao();

  // Os filtros da URL valem só na montagem: daí em diante o estado manda e a
  // URL é espelho. Ler a URL a cada render criaria laço com o `router.replace`.
  const [filtros, setFiltros] = useState<Filtros>(() => lerFiltros(params));
  const [textoBusca, setTextoBusca] = useState(filtros.busca);
  const [visao, setVisao] = useState<"kanban" | "lista">("kanban");
  const [pagina, setPagina] = useState(1);

  const [tarefas, setTarefas] = useState<ApuracaoLista[]>([]);
  const [paginacao, setPaginacao] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 0,
  });
  const [carregando, setCarregando] = useState(true);
  const [primeiraCarga, setPrimeiraCarga] = useState(true);
  const [erro, setErro] = useState("");
  const [mensagemOk, setMensagemOk] = useState("");
  const [recarga, setRecarga] = useState(0);

  const [usuarios, setUsuarios] = useState<UsuarioInterno[]>([]);

  const limite = visao === "kanban" ? 100 : 50;

  /* ----------------------------- Visão salva ------------------------------ */

  // localStorage num efeito, não no `useState`: no servidor não existe, e ler no
  // inicializador quebraria a hidratação.
  useEffect(() => {
    try {
      const salva = localStorage.getItem("cz_apuracao_visao");
      if (salva === "lista" || salva === "kanban") setVisao(salva);
    } catch {
      // Modo privado pode bloquear o storage. A visão padrão resolve.
    }
  }, []);

  const mudarVisao = useCallback((valor: string) => {
    const nova = valor === "lista" ? "lista" : "kanban";
    setVisao(nova);
    setPagina(1);
    try {
      localStorage.setItem("cz_apuracao_visao", nova);
    } catch {
      // Sem persistência a tela continua funcionando.
    }
  }, []);

  /* --------------------------- Filtros e a URL ---------------------------- */

  const alterar = useCallback((mudanca: Partial<Filtros>) => {
    setFiltros((atual) => ({ ...atual, ...mudanca }));
  }, []);

  const limpar = useCallback(() => {
    setFiltros(filtrosPadrao());
    setTextoBusca("");
  }, []);

  // Debounce da busca. Sem ele, cada tecla vira uma requisição.
  useEffect(() => {
    const temporizador = setTimeout(() => {
      setFiltros((atual) =>
        atual.busca === textoBusca ? atual : { ...atual, busca: textoBusca }
      );
    }, 400);
    return () => clearTimeout(temporizador);
  }, [textoBusca]);

  const consulta = useMemo(
    () =>
      query({
        competencia: filtros.competencia || TODAS,
        regime: filtros.regime,
        status: filtros.status,
        responsavelId: filtros.responsavelId,
        empresaId: filtros.empresaId,
        prazo: filtros.prazo,
        bloqueada: filtros.bloqueada ? "true" : "",
        busca: filtros.busca,
      }),
    [filtros]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.search === consulta) return;
    router.replace(`${pathname}${consulta}`, { scroll: false });
  }, [consulta, pathname, router]);

  // Filtro novo volta para a primeira página. React descarta o `set` quando o
  // valor já é 1, então isto não gera render extra na montagem.
  useEffect(() => {
    setPagina(1);
  }, [consulta]);

  /* ------------------------------- Buscas -------------------------------- */

  useEffect(() => {
    const controlador = new AbortController();
    let vivo = true;

    setCarregando(true);
    setErro("");

    const url = `/api/tarefas/apuracao${query({
      competencia: filtros.competencia,
      regime: filtros.regime,
      status: filtros.status,
      responsavelId: filtros.responsavelId,
      empresaId: filtros.empresaId,
      prazo: filtros.prazo,
      bloqueada: filtros.bloqueada ? "true" : "",
      busca: filtros.busca.trim(),
      page: pagina,
      limit: limite,
    })}`;

    apiGet<RespostaLista>(url, controlador.signal)
      .then((dados) => {
        if (!vivo) return;
        setTarefas(dados.tarefas ?? []);
        setPaginacao(
          dados.pagination ?? {
            total: dados.tarefas?.length ?? 0,
            page: pagina,
            limit: limite,
            totalPages: 0,
          }
        );
      })
      .catch((falha) => {
        if (!vivo) return;
        const mensagem = mensagemDeErro(falha);
        if (!mensagem) return; // Abortado: outra busca já está em curso.
        setErro(mensagem);
        setTarefas([]);
      })
      .finally(() => {
        if (!vivo) return;
        setCarregando(false);
        setPrimeiraCarga(false);
      });

    return () => {
      vivo = false;
      controlador.abort();
    };
  }, [filtros, pagina, limite, recarga]);

  useEffect(() => {
    const controlador = new AbortController();
    apiGet<RespostaUsuarios>("/api/usuarios-internos", controlador.signal)
      .then((dados) => setUsuarios(dados.usuarios ?? []))
      .catch(() => {
        // Filtro de responsável fica sem opções; a lista não depende disso.
      });
    return () => controlador.abort();
  }, []);

  const opcoesResponsavel = useMemo<Opcao[]>(
    () => usuarios.map((u) => ({ valor: u.id, texto: u.rotulo })),
    [usuarios]
  );

  /* ------------------------- Pendência (bloqueio) ------------------------- */

  const [alvoPendencia, setAlvoPendencia] = useState<ApuracaoLista | null>(null);
  const [responsavelPendencia, setResponsavelPendencia] = useState("CLIENTE");
  const [erroPendencia, setErroPendencia] = useState("");
  const [enviandoPendencia, setEnviandoPendencia] = useState(false);

  const [alvoResolver, setAlvoResolver] = useState<ApuracaoLista | null>(null);
  const [erroResolver, setErroResolver] = useState("");
  const [enviandoResolver, setEnviandoResolver] = useState(false);

  const abrirPendencia = useCallback((tarefa: ApuracaoLista) => {
    setResponsavelPendencia("CLIENTE");
    setErroPendencia("");
    setAlvoPendencia(tarefa);
  }, []);

  async function registrarPendencia(motivo: string) {
    if (!alvoPendencia) return;
    if (!responsavelPendencia) {
      setErroPendencia("Informe quem está travando a competência.");
      return;
    }

    setEnviandoPendencia(true);
    setErroPendencia("");
    try {
      await apiPost(`/api/tarefas/apuracao/${alvoPendencia.id}/bloqueio`, {
        motivo,
        responsavel: responsavelPendencia,
      });
      setAlvoPendencia(null);
      setMensagemOk(
        `Pendência registrada em ${nomeEmpresa(alvoPendencia.empresa)}.`
      );
      setRecarga((n) => n + 1);
    } catch (falha) {
      setErroPendencia(mensagemDeErro(falha) || "Não foi possível registrar.");
    } finally {
      setEnviandoPendencia(false);
    }
  }

  async function resolverPendencia(observacao: string) {
    if (!alvoResolver) return;

    setEnviandoResolver(true);
    setErroResolver("");
    try {
      await apiDelete(`/api/tarefas/apuracao/${alvoResolver.id}/bloqueio`, {
        observacao: observacao || undefined,
      });
      setAlvoResolver(null);
      setMensagemOk(
        `Pendência resolvida em ${nomeEmpresa(alvoResolver.empresa)}.`
      );
      setRecarga((n) => n + 1);
    } catch (falha) {
      setErroResolver(mensagemDeErro(falha) || "Não foi possível resolver.");
    } finally {
      setEnviandoResolver(false);
    }
  }

  /* --------------------------- Nova competência --------------------------- */

  const [modalNova, setModalNova] = useState(false);
  const [empresas, setEmpresas] = useState<EmpresaLista[]>([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(false);
  const [nova, setNova] = useState(() => {
    const alvo = parseCompetencia(competenciaPadrao());
    return {
      empresaId: "",
      mes: String(alvo?.mes ?? 1),
      ano: String(alvo?.ano ?? new Date().getUTCFullYear()),
      prazoEntrega: "",
      responsavelId: "",
    };
  });
  const [erroNova, setErroNova] = useState("");
  const [duplicadaId, setDuplicadaId] = useState<string | null>(null);
  const [enviandoNova, setEnviandoNova] = useState(false);

  const abrirNova = useCallback(() => {
    const alvo =
      parseCompetencia(filtros.competencia) ??
      parseCompetencia(competenciaPadrao());
    setNova({
      empresaId: "",
      mes: String(alvo?.mes ?? 1),
      ano: String(alvo?.ano ?? new Date().getUTCFullYear()),
      prazoEntrega: "",
      responsavelId: "",
    });
    setErroNova("");
    setDuplicadaId(null);
    setModalNova(true);
  }, [filtros.competencia]);

  // Empresas só são carregadas quando o modal abre: são 200 registros que a
  // lista não usa.
  useEffect(() => {
    if (!modalNova || empresas.length > 0) return;

    const controlador = new AbortController();
    setCarregandoEmpresas(true);
    apiGet<RespostaEmpresas>(
      `/api/empresas${query({ situacao: "ATIVA", limit: 200 })}`,
      controlador.signal
    )
      .then((dados) => setEmpresas(dados.empresas ?? []))
      .catch((falha) => {
        const mensagem = mensagemDeErro(falha);
        if (mensagem) setErroNova(mensagem);
      })
      .finally(() => setCarregandoEmpresas(false));

    return () => controlador.abort();
  }, [modalNova, empresas.length]);

  const opcoesEmpresa = useMemo<Opcao[]>(
    () =>
      empresas.map((e) => ({
        valor: e.id,
        texto: `${e.razaoSocial} · ${e.cnpjFormatado}`,
      })),
    [empresas]
  );

  const opcoesAno = useMemo<Opcao[]>(() => {
    const atual = new Date().getUTCFullYear();
    return [atual + 1, atual, atual - 1, atual - 2].map((ano) => ({
      valor: String(ano),
      texto: String(ano),
    }));
  }, []);

  async function criarCompetencia() {
    setErroNova("");
    setDuplicadaId(null);

    if (!nova.empresaId) {
      setErroNova("Escolha a empresa.");
      return;
    }

    const ano = Number(nova.ano);
    const mes = Number(nova.mes);
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
      setErroNova("Ano inválido.");
      return;
    }
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      setErroNova("Mês inválido.");
      return;
    }

    setEnviandoNova(true);
    try {
      await apiPost<{ tarefa: { id: string; status: string } }>(
        "/api/tarefas/apuracao",
        {
          empresaId: nova.empresaId,
          ano,
          mes,
          prazoEntrega: nova.prazoEntrega || undefined,
          responsavelId: nova.responsavelId || undefined,
        }
      );

      setModalNova(false);
      setMensagemOk(`Competência ${competenciaLabel(ano, mes)} aberta.`);
      // A rota devolve só `id` e `status`. Em vez de montar um cartão
      // incompleto, aponto o filtro para a competência criada e recarrego —
      // assim a nova linha aparece completa e visível, mesmo que o filtro
      // estivesse em outro mês.
      setFiltros((atual) => ({
        ...atual,
        competencia: competenciaChave(ano, mes),
      }));
      setRecarga((n) => n + 1);
    } catch (falha) {
      if (falha instanceof ErroApi && falha.code === "competencia_duplicada") {
        const id =
          typeof falha.corpo.tarefaId === "string" ? falha.corpo.tarefaId : null;
        setDuplicadaId(id);
        setErroNova(falha.message);
      } else {
        setErroNova(mensagemDeErro(falha) || "Não foi possível abrir.");
      }
    } finally {
      setEnviandoNova(false);
    }
  }

  /* --------------------------- Arraste do Kanban -------------------------- */

  const [arrastando, setArrastando] = useState<ApuracaoLista | null>(null);
  const [colunaSobre, setColunaSobre] = useState<string | null>(null);

  /**
   * REGRA DO ARRASTE — não afrouxar.
   *
   * O status NÃO é campo editável: ele é DERIVADO da etapa em que a competência
   * está (ver src/lib/tarefa-status.ts). Arrastar um cartão de "Em elaboração"
   * para "Entregue" pularia da etapa 4 para a etapa 8 sem que ninguém tivesse
   * capturado XML, conferido apuração ou gerado guia — e o histórico passaria a
   * afirmar que essas etapas foram feitas. O log deixaria de servir de prova.
   *
   * Por isso a única coluna que aceita soltar é "Pendência identificada", que
   * não é posição no fluxo: é BLOQUEIO sobreposto ao status derivado. Soltar ali
   * registra a pendência (POST .../bloqueio) e a etapa fica onde estava.
   *
   * Na volta: arrastar um cartão bloqueado para fora resolve a pendência
   * (DELETE .../bloqueio). Também não move etapa.
   *
   * Avançar etapa acontece na tela de detalhe, onde há motivo, responsável e
   * registro no log.
   */
  const aceitaSoltar = useCallback(
    (tarefa: ApuracaoLista, coluna: string) => {
      if (!permissoes.gerenciarBloqueio) return false;
      if (tarefa.status === STATUS.CONCLUIDO || tarefa.concluidaEm) return false;
      if (tarefa.bloqueada) return coluna !== tarefa.status;
      return coluna === STATUS.PENDENCIA_IDENTIFICADA;
    },
    [permissoes.gerenciarBloqueio]
  );

  const soltar = useCallback(
    (coluna: string) => {
      const tarefa = arrastando;
      setColunaSobre(null);
      setArrastando(null);
      if (!tarefa || !aceitaSoltar(tarefa, coluna)) return;

      if (tarefa.bloqueada) {
        setErroResolver("");
        setAlvoResolver(tarefa);
      } else {
        abrirPendencia(tarefa);
      }
    },
    [abrirPendencia, aceitaSoltar, arrastando]
  );

  /* ------------------------------- Derivados ------------------------------ */

  const competenciaAtual = useMemo(
    () => parseCompetencia(filtros.competencia),
    [filtros.competencia]
  );
  const rotuloCompetencia = competenciaAtual
    ? competenciaLabel(competenciaAtual.ano, competenciaAtual.mes)
    : "Todas as competências";

  const filtroAtivo =
    temFiltroAlemDaCompetencia(filtros) ||
    filtros.competencia !== competenciaPadrao();

  const resumoFiltro = useMemo(() => {
    const partes: string[] = [
      competenciaAtual
        ? competenciaLabel(competenciaAtual.ano, competenciaAtual.mes)
        : "todas as competências",
    ];
    if (filtros.regime) {
      partes.push(REGIME_LABEL[filtros.regime] ?? filtros.regime);
    }
    if (filtros.status) partes.push(labelDoStatus(filtros.status));
    if (filtros.responsavelId) {
      const achado = usuarios.find((u) => u.id === filtros.responsavelId);
      partes.push(`responsável ${achado?.rotulo ?? "selecionado"}`);
    }
    if (filtros.empresaId) partes.push("uma empresa específica");
    if (filtros.prazo) {
      partes.push(
        filtros.prazo === "atrasado" ? "somente atrasadas" : "vencendo em breve"
      );
    }
    if (filtros.bloqueada) partes.push("somente com pendência aberta");
    if (filtros.busca.trim()) partes.push(`busca "${filtros.busca.trim()}"`);
    return partes.join(" · ");
  }, [competenciaAtual, filtros, usuarios]);

  const colunas = useMemo(() => {
    const extras = Array.from(new Set(tarefas.map((t) => t.status))).filter(
      (s) => !STATUS_ORDEM.includes(s)
    );
    return [...STATUS_ORDEM, ...extras];
  }, [tarefas]);

  const porStatus = useMemo(() => {
    const mapa = new Map<string, ApuracaoLista[]>();
    for (const coluna of colunas) mapa.set(coluna, []);
    for (const tarefa of tarefas) {
      const lista = mapa.get(tarefa.status);
      if (lista) lista.push(tarefa);
    }
    return mapa;
  }, [colunas, tarefas]);

  const podeArrastar = permissoes.gerenciarBloqueio;

  /* -------------------------------- Render ------------------------------- */

  const acoesCabecalho = (
    <>
      <Alternador
        opcoes={[
          { valor: "kanban", texto: "Kanban", icone: "LayoutGrid" },
          { valor: "lista", texto: "Lista", icone: "List" },
        ]}
        valor={visao}
        onMudar={mudarVisao}
      />
      {permissoes.criarProcesso && (
        <Botao icone="CalendarPlus" onClick={abrirNova}>
          Nova competência
        </Botao>
      )}
    </>
  );

  const vazioComFiltro = temFiltroAlemDaCompetencia(filtros);

  return (
    <div className="cz-tarefas mx-auto max-w-[1600px] space-y-6 p-6">
      <Cabecalho
        titulo="Apuração fiscal"
        icone="Calculator"
        descricao={`${rotuloCompetencia} · ${plural(
          paginacao.total,
          "competência encontrada",
          "competências encontradas"
        )}`}
        acoes={acoesCabecalho}
      />

      {mensagemOk && (
        <Aviso
          tom="ok"
          mensagem={mensagemOk}
          onFechar={() => setMensagemOk("")}
        />
      )}

      {/* ------------------------------ Filtros ----------------------------- */}

      <Painel
        titulo="Filtros"
        acoes={
          filtroAtivo ? (
            <Botao variante="secundario" icone="X" onClick={limpar}>
              Limpar filtros
            </Botao>
          ) : undefined
        }
      >
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Entrada
            rotulo="Competência"
            type="month"
            value={filtros.competencia}
            onChange={(e) => alterar({ competencia: e.target.value })}
            ajuda="Vazio mostra todas"
          />
          <Escolha
            rotulo="Regime"
            vazio="Todos os regimes"
            opcoes={OPCOES_REGIME}
            value={filtros.regime}
            onChange={(e) => alterar({ regime: e.target.value })}
          />
          <Escolha
            rotulo="Status"
            vazio="Todos os status"
            opcoes={OPCOES_STATUS}
            value={filtros.status}
            onChange={(e) => alterar({ status: e.target.value })}
          />
          <Escolha
            rotulo="Responsável"
            vazio="Todos os responsáveis"
            opcoes={opcoesResponsavel}
            value={filtros.responsavelId}
            onChange={(e) => alterar({ responsavelId: e.target.value })}
          />
          <Escolha
            rotulo="Prazo"
            vazio="Todos os prazos"
            opcoes={OPCOES_PRAZO}
            value={filtros.prazo}
            onChange={(e) => alterar({ prazo: e.target.value })}
          />
          <Entrada
            rotulo="Buscar empresa"
            type="search"
            placeholder="Razão social, fantasia ou CNPJ"
            value={textoBusca}
            onChange={(e) => setTextoBusca(e.target.value)}
            ajuda="CNPJ a partir de 3 dígitos"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={filtros.bloqueada}
              onChange={(e) => alterar({ bloqueada: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            />
            Só com pendência
          </label>

          <p className="flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
            <Icone nome="Filter" className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate" title={resumoFiltro}>
              Filtrando por {resumoFiltro}
            </span>
          </p>

          {filtros.empresaId && (
            <button
              type="button"
              onClick={() => alterar({ empresaId: "" })}
              className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-orange-400 hover:text-orange-600"
            >
              <Icone nome="X" className="h-3 w-3" />
              Remover filtro de empresa
            </button>
          )}
        </div>
      </Painel>

      {/* ------------------------------ Estados ----------------------------- */}

      {erro && (
        <div className="space-y-3">
          <Aviso mensagem={erro} onFechar={() => setErro("")} />
          <Botao
            variante="secundario"
            icone="RefreshCw"
            onClick={() => setRecarga((n) => n + 1)}
          >
            Tentar novamente
          </Botao>
        </div>
      )}

      {primeiraCarga && carregando ? (
        <Carregando texto="Carregando competências" />
      ) : tarefas.length === 0 && !erro ? (
        vazioComFiltro ? (
          <Vazio
            icone="Filter"
            titulo="Nenhuma competência encontrada com os filtros atuais."
            descricao="Os filtros aplicados não retornaram nenhuma apuração. Ajuste ou limpe para ver o restante da carteira."
            acao={
              <Botao variante="secundario" icone="X" onClick={limpar}>
                Limpar filtros
              </Botao>
            }
          />
        ) : (
          <Vazio
            icone="CalendarPlus"
            titulo={
              competenciaAtual
                ? `Nenhuma competência aberta para ${rotuloCompetencia}.`
                : "Nenhuma competência aberta."
            }
            descricao="Abra a competência das empresas ativas para o escritório começar a apuração."
            acao={
              permissoes.criarProcesso ? (
                <Botao icone="CalendarPlus" onClick={abrirNova}>
                  Nova competência
                </Botao>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          {/* --------------------------- Kanban --------------------------- */}
          {visao === "kanban" && (
            <div className="space-y-3">
              {paginacao.total > tarefas.length && (
                <Aviso
                  tom="info"
                  mensagem={`O Kanban está exibindo as primeiras ${tarefas.length} de ${paginacao.total} competências. Estreite o filtro (competência, regime ou responsável) para ver o restante, ou troque para a visão Lista.`}
                />
              )}

              <p className="flex items-start gap-1.5 text-xs text-gray-500">
                <Icone nome="Info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  O status vem da etapa. Para avançar, abra a competência e
                  conclua a etapa.
                  {podeArrastar
                    ? " Arrastar serve apenas para registrar pendência (soltando em Pendência identificada) ou resolvê-la (arrastando um cartão travado para fora)."
                    : ""}
                </span>
              </p>

              <div
                className="flex gap-4 overflow-x-auto pb-3"
                onDragEnd={() => {
                  setArrastando(null);
                  setColunaSobre(null);
                }}
              >
                {colunas.map((coluna) => {
                  const lista = porStatus.get(coluna) ?? [];
                  const cor = corDoStatus(coluna);
                  const arrastandoAgora = !!arrastando;
                  const aceita = arrastando
                    ? aceitaSoltar(arrastando, coluna)
                    : false;
                  const destacada = aceita && colunaSobre === coluna;

                  return (
                    <section
                      key={coluna}
                      aria-label={`${
                        STATUS_LABEL[coluna] ?? labelDoStatus(coluna)
                      }: ${lista.length}`}
                      onDragOver={(evento) => {
                        if (!aceita) return;
                        // Sem `preventDefault` o navegador recusa o drop.
                        evento.preventDefault();
                        evento.dataTransfer.dropEffect = "move";
                        if (colunaSobre !== coluna) setColunaSobre(coluna);
                      }}
                      onDragLeave={(evento) => {
                        // `dragleave` também dispara ao entrar num cartão filho.
                        // Sem este teste o destaque da coluna piscaria.
                        const proximo = evento.relatedTarget as Node | null;
                        if (proximo && evento.currentTarget.contains(proximo)) {
                          return;
                        }
                        setColunaSobre((atual) =>
                          atual === coluna ? null : atual
                        );
                      }}
                      onDrop={(evento) => {
                        evento.preventDefault();
                        soltar(coluna);
                      }}
                      className={`flex w-[19.5rem] shrink-0 flex-col overflow-hidden rounded-xl border bg-gray-50 transition-all ${
                        destacada
                          ? "border-orange-400 bg-orange-50 ring-2 ring-orange-300"
                          : "border-gray-200"
                      } ${
                        arrastandoAgora && !aceita
                          ? "cursor-not-allowed opacity-50"
                          : ""
                      }`}
                    >
                      <div
                        className="h-[3px] w-full shrink-0"
                        style={{ backgroundColor: cor.solida }}
                        aria-hidden="true"
                      />
                      <header className="flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2.5">
                        <Icone
                          nome={cor.icone}
                          className="h-4 w-4 shrink-0 text-gray-500"
                        />
                        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
                          {STATUS_LABEL_CURTO[coluna] ?? labelDoStatus(coluna)}
                        </h2>
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">
                          {lista.length}
                        </span>
                      </header>

                      <div className="cz-kanban-coluna max-h-[calc(100vh-22rem)] space-y-2.5 overflow-y-auto p-2.5">
                        {lista.length === 0 ? (
                          <p className="px-1 py-6 text-center text-xs text-gray-400">
                            {arrastandoAgora && aceita
                              ? arrastando?.bloqueada
                                ? "Solte aqui para resolver a pendência"
                                : "Solte aqui para registrar a pendência"
                              : "Nenhuma competência"}
                          </p>
                        ) : (
                          lista.map((tarefa) => (
                            <CartaoApuracao
                              key={tarefa.id}
                              tarefa={tarefa}
                              arrastavel={
                                podeArrastar &&
                                tarefa.status !== STATUS.CONCLUIDO &&
                                !tarefa.concluidaEm
                              }
                              onArrastarInicio={(_evento, arrastada) =>
                                setArrastando(arrastada)
                              }
                              onRegistrarPendencia={
                                permissoes.gerenciarBloqueio
                                  ? abrirPendencia
                                  : undefined
                              }
                            />
                          ))
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}

          {/* ---------------------------- Lista --------------------------- */}
          {visao === "lista" && (
            <Painel>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                        Empresa
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                        Competência
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                        Regime
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                        Etapa
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                        Prazo
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                        Responsável
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                        Pendência
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">
                        Ação
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tarefas.map((tarefa) => {
                      const destino = `/admin/tarefas/apuracao/${tarefa.id}`;
                      const responsavel =
                        tarefa.responsavel?.name?.trim() ||
                        tarefa.responsavel?.email ||
                        null;

                      return (
                        <tr
                          key={tarefa.id}
                          onClick={() => router.push(destino)}
                          className="cursor-pointer transition-colors hover:bg-orange-50/40"
                        >
                          <td className="max-w-[18rem] px-4 py-3">
                            <p
                              className="truncate font-semibold text-gray-900"
                              title={tarefa.empresa.razaoSocial}
                            >
                              {nomeEmpresa(tarefa.empresa)}
                            </p>
                            <p className="truncate text-xs text-gray-500">
                              {formatarCnpj(tarefa.empresa.cnpj)}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                            {competenciaLabel(tarefa.ano, tarefa.mes)}
                          </td>
                          <td className="px-4 py-3">
                            <SeloRegime regime={tarefa.regime} />
                          </td>
                          <td className="px-4 py-3">
                            <SeloStatus status={tarefa.status} curto />
                          </td>
                          <td className="min-w-[13rem] px-4 py-3">
                            <p className="text-xs font-semibold text-gray-700">
                              {tarefa.etapaAtual}/{tarefa.totalEtapas}
                              {tarefa.tituloEtapaAtual && (
                                <span
                                  className="ml-1.5 font-normal text-gray-500"
                                  title={tarefa.tituloEtapaAtual}
                                >
                                  {tarefa.tituloEtapaAtual.length > 34
                                    ? `${tarefa.tituloEtapaAtual.slice(0, 34)}…`
                                    : tarefa.tituloEtapaAtual}
                                </span>
                              )}
                            </p>
                            <Progresso
                              feito={tarefa.etapasConcluidas}
                              total={tarefa.totalEtapas}
                              className="mt-1.5 max-w-[11rem]"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <SeloPrazo
                              situacao={tarefa.prazo.situacao}
                              dias={tarefa.prazo.dias}
                            />
                          </td>
                          <td className="max-w-[12rem] px-4 py-3">
                            {responsavel ? (
                              <span className="flex items-center gap-2">
                                <span
                                  title={responsavel}
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[10px] font-bold text-white"
                                >
                                  {iniciais(responsavel)}
                                </span>
                                <span className="truncate text-gray-700">
                                  {responsavel}
                                </span>
                              </span>
                            ) : (
                              <span className="text-gray-400">
                                Sem responsável
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {tarefa.bloqueada ? (
                              <SeloBloqueio
                                responsavel={tarefa.bloqueioResponsavel}
                                dias={tarefa.diasEmBloqueio}
                              />
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <Link
                              href={destino}
                              onClick={(evento) => evento.stopPropagation()}
                              className="inline-flex items-center gap-1 text-sm font-semibold text-orange-600 transition-colors hover:text-orange-700"
                            >
                              Abrir
                              <Icone nome="ChevronRight" className="h-4 w-4" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <Paginacao
                pagina={pagina}
                totalPaginas={paginacao.totalPages}
                total={paginacao.total}
                onMudar={setPagina}
                rotulo="competências"
              />
            </Painel>
          )}
        </>
      )}

      {/* ------------------------------ Modais ------------------------------ */}

      <Modal
        aberto={modalNova}
        titulo="Nova competência"
        descricao="Abre a apuração de um mês para uma empresa ativa. As etapas são criadas conforme o regime vigente."
        icone="CalendarPlus"
        largura="lg"
        onFechar={() => setModalNova(false)}
        rodape={
          <>
            <Botao
              variante="secundario"
              onClick={() => setModalNova(false)}
              disabled={enviandoNova}
            >
              Cancelar
            </Botao>
            <Botao
              onClick={criarCompetencia}
              carregando={enviandoNova}
              textoCarregando="Abrindo"
              icone="Plus"
            >
              Abrir competência
            </Botao>
          </>
        }
      >
        <div className="space-y-4">
          {erroNova && <Aviso mensagem={erroNova} />}
          {duplicadaId && (
            <Link
              href={`/admin/tarefas/apuracao/${duplicadaId}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 transition-colors hover:text-orange-700"
            >
              <Icone nome="ExternalLink" className="h-4 w-4" />
              Abrir a competência que já existe
            </Link>
          )}

          <Escolha
            rotulo="Empresa"
            required
            vazio={
              carregandoEmpresas ? "Carregando empresas" : "Escolha a empresa"
            }
            opcoes={opcoesEmpresa}
            value={nova.empresaId}
            disabled={carregandoEmpresas}
            onChange={(e) => setNova((n) => ({ ...n, empresaId: e.target.value }))}
            ajuda="Somente empresas com situação Ativa."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Escolha
              rotulo="Mês"
              required
              opcoes={OPCOES_MES}
              value={nova.mes}
              onChange={(e) => setNova((n) => ({ ...n, mes: e.target.value }))}
            />
            <Escolha
              rotulo="Ano"
              required
              opcoes={opcoesAno}
              value={nova.ano}
              onChange={(e) => setNova((n) => ({ ...n, ano: e.target.value }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Entrada
              rotulo="Prazo de entrega"
              type="date"
              value={nova.prazoEntrega}
              onChange={(e) =>
                setNova((n) => ({ ...n, prazoEntrega: e.target.value }))
              }
              ajuda="Opcional. Sem prazo, a competência não entra no controle de atraso."
            />
            <Escolha
              rotulo="Responsável"
              vazio="Definir depois"
              opcoes={opcoesResponsavel}
              value={nova.responsavelId}
              onChange={(e) =>
                setNova((n) => ({ ...n, responsavelId: e.target.value }))
              }
            />
          </div>
        </div>
      </Modal>

      <ModalMotivo
        aberto={!!alvoPendencia}
        titulo="Registrar pendência"
        descricao={
          alvoPendencia
            ? `${nomeEmpresa(alvoPendencia.empresa)} · ${competenciaLabel(
                alvoPendencia.ano,
                alvoPendencia.mes
              )}. A etapa continua onde está; a competência passa a contar dias travada.`
            : undefined
        }
        icone="AlertTriangle"
        rotulo="Motivo"
        minimo={5}
        textoConfirmar="Registrar pendência"
        erro={erroPendencia}
        enviando={enviandoPendencia}
        onFechar={() => setAlvoPendencia(null)}
        onConfirmar={registrarPendencia}
        extra={
          <Escolha
            rotulo="Quem está travando"
            required
            opcoes={OPCOES_BLOQUEIO}
            value={responsavelPendencia}
            onChange={(e) => setResponsavelPendencia(e.target.value)}
            ajuda="Define de quem a pendência vai ser cobrada no painel."
          />
        }
      />

      <ModalMotivo
        aberto={!!alvoResolver}
        titulo="Resolver pendência"
        descricao={
          alvoResolver
            ? `${nomeEmpresa(alvoResolver.empresa)} · ${competenciaLabel(
                alvoResolver.ano,
                alvoResolver.mes
              )}. O bloqueio é liberado e o status volta a ser o da etapa atual.`
            : undefined
        }
        icone="Unlock"
        rotulo="Observação"
        obrigatorio={false}
        textoConfirmar="Resolver pendência"
        erro={erroResolver}
        enviando={enviandoResolver}
        onFechar={() => setAlvoResolver(null)}
        onConfirmar={resolverPendencia}
      />
    </div>
  );
}
