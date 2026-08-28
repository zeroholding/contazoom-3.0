"use client";

/**
 * Auditoria do módulo de tarefas: quem alterou o quê, quando.
 *
 * Quatro decisões estruturais desta tela:
 *
 * 1. O AUTOR É O CONGELADO. `autorNome` e `autorPapel` vêm gravados na linha do
 *    log; `autor` é a relação com o cadastro de hoje. A linha mostra sempre o
 *    congelado, porque é isso que faz o log servir de prova. Quando o papel
 *    atual da pessoa é diferente do de então, a linha acrescenta "hoje: ..." —
 *    numa auditoria essa divergência é informação, não defeito. E quando `autor`
 *    é null (usuário removido), o nome congelado continua ali.
 *
 * 2. A URL CARREGA OS FILTROS. As telas de detalhe linkam para cá com
 *    `apuracaoId`/`processoId` ("ver histórico completo deste registro"), então
 *    os filtros são lidos de `useSearchParams` na montagem e reescritos com
 *    `router.replace`. Quando o filtro veio de um registro específico, a tela
 *    diz isso em destaque: sem o aviso, a lista curta parece lista quebrada.
 *
 * 3. ORIGEM É FILTRO DE PÁGINA, e a tela admite isso. A rota não tem parâmetro
 *    de origem, então "Apuração"/"Legalização" filtram o que já foi carregado.
 *    Se a tela escondesse esse detalhe, a contagem da paginação não fecharia com
 *    o que se vê e pareceria defeito. Ver `AVISO_ORIGEM`.
 *
 * 4. INTERVALO INVERTIDO É BARRADO NO CLIENTE. A rota valida se a data é
 *    parseável, não a ordem: `dataInicio` depois de `dataFim` devolveria 200 com
 *    lista vazia e nenhuma explicação.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  apiGet,
  mensagemDeErro,
  query,
} from "@/app/components/views/ui/tarefas/api";
import type {
  EmpresaLista,
  LogAuditoria,
  Pagination,
  UsuarioInterno,
} from "@/app/components/views/ui/tarefas/tipos";
import {
  competenciaLabel,
  dataHora,
  nomeEmpresa,
  plural,
  tempoRelativo,
} from "@/app/components/views/ui/tarefas/formato";
import {
  Aviso,
  Cabecalho,
  Carregando,
  Paginacao,
  Painel,
  Vazio,
} from "@/app/components/views/ui/tarefas/Base";
import {
  Botao,
  Entrada,
  Escolha,
  type Opcao,
} from "@/app/components/views/ui/tarefas/Campos";
import { SeloPapel } from "@/app/components/views/ui/tarefas/Selos";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import {
  ACAO_LOG,
  ACAO_LOG_LABEL,
  TIPO_PROCESSO_LABEL,
} from "@/lib/tarefa-etapas";
import { STATUS_LABEL, labelDoStatus } from "@/lib/tarefa-status";
import { papelLabel } from "@/lib/papeis";
import { useSessao } from "@/hooks/useSessao";

/* -------------------------------------------------------------------------- */
/*                            Contratos das rotas                             */
/* -------------------------------------------------------------------------- */

type RespostaLog = { logs: LogAuditoria[]; pagination: Pagination };
type RespostaUsuarios = { usuarios: UsuarioInterno[]; total: number };
type RespostaEmpresas = { empresas: EmpresaLista[]; pagination: Pagination };

/* -------------------------------------------------------------------------- */
/*                                 Constantes                                 */
/* -------------------------------------------------------------------------- */

/** Teto real da rota é 200: pedir mais devolve 200 e a tela mentiria. */
const LIMITES = [25, 50, 100, 200];
const LIMITE_PADRAO = 50;

const OPCOES_LIMITE: Opcao[] = LIMITES.map((n) => ({
  valor: String(n),
  texto: `${n} por página`,
}));

const ACOES_VALIDAS = Object.values(ACAO_LOG) as string[];

const OPCOES_ACAO: Opcao[] = ACOES_VALIDAS.map((valor) => ({
  valor,
  texto: ACAO_LOG_LABEL[valor] ?? valor,
}));

type Origem = "tudo" | "apuracao" | "legalizacao";

const ORIGENS_VALIDAS: string[] = ["tudo", "apuracao", "legalizacao"];

const OPCOES_ORIGEM: Opcao[] = [
  { valor: "tudo", texto: "Tudo" },
  { valor: "apuracao", texto: "Apuração" },
  { valor: "legalizacao", texto: "Legalização" },
];

const ORIGEM_LABEL: Record<string, string> = {
  tudo: "apuração e legalização",
  apuracao: "somente apuração",
  legalizacao: "somente legalização",
};

const AVISO_ORIGEM =
  "O filtro de origem age sobre as linhas já carregadas nesta página, não sobre a base inteira: a rota do log não separa apuração de legalização. Por isso a contagem total e o número de páginas continuam se referindo ao resultado sem esse filtro.";

/**
 * Ícone e tom por ação.
 *
 * Uma auditoria em que todas as linhas parecem iguais não se lê. Conclusão em
 * verde, retorno e pendência em âmbar/vermelho, criação e observação em cinza,
 * status em azul — o olho encontra o que procura antes de ler o texto. E como
 * regra do projeto, nunca só cor: o ícone e o texto dizem a mesma coisa.
 */
const ESTILO_ACAO: Record<string, { icone: string; tom: string }> = {
  TAREFA_CRIADA: { icone: "Plus", tom: "bg-gray-100 text-gray-600" },
  ETAPA_CONCLUIDA: {
    icone: "CheckCircle2",
    tom: "bg-[#ECFDF3] text-[#027A48]",
  },
  ETAPA_AVANCADA: { icone: "ChevronRight", tom: "bg-[#FFF4EB] text-[#C2410C]" },
  ETAPA_RETORNADA: { icone: "RotateCcw", tom: "bg-[#FFFAEB] text-[#B54708]" },
  ETAPA_NAO_APLICAVEL: {
    icone: "MinusCircle",
    tom: "bg-gray-100 text-gray-500",
  },
  STATUS_ALTERADO: { icone: "TrendingUp", tom: "bg-[#EFF8FF] text-[#175CD3]" },
  BLOQUEIO_REGISTRADO: {
    icone: "AlertTriangle",
    tom: "bg-[#FEF2F2] text-[#B42318]",
  },
  BLOQUEIO_RESOLVIDO: { icone: "Unlock", tom: "bg-[#ECFDF3] text-[#027A48]" },
  RESPONSAVEL_ALTERADO: { icone: "User", tom: "bg-[#F4F3FF] text-[#5925DC]" },
  PRAZO_ALTERADO: { icone: "Calendar", tom: "bg-[#EFF8FF] text-[#175CD3]" },
  OBSERVACAO_ADICIONADA: {
    icone: "FileText",
    tom: "bg-gray-100 text-gray-600",
  },
  TAREFA_CONCLUIDA: {
    icone: "ClipboardCheck",
    tom: "bg-[#ECFDF3] text-[#027A48]",
  },
  TAREFA_REABERTA: { icone: "Unlock", tom: "bg-[#FFFAEB] text-[#B54708]" },
  PROTOCOLO_ATUALIZADO: {
    icone: "Landmark",
    tom: "bg-[#EFF8FF] text-[#175CD3]",
  },
  EMPRESA_VINCULADA: { icone: "Link2", tom: "bg-[#EFF8FF] text-[#175CD3]" },
};

const ESTILO_PADRAO = { icone: "CircleDot", tom: "bg-gray-100 text-gray-500" };

/* -------------------------------------------------------------------------- */
/*                              Datas do período                              */
/* -------------------------------------------------------------------------- */

/**
 * "aaaa-mm-dd" no fuso de quem olha.
 *
 * `toISOString().slice(0,10)` usaria UTC e, das 21h em diante em Brasília,
 * "Hoje" já apontaria para amanhã. A rota interpreta as datas como 00:00 e
 * 23:59:59.999 locais, então o cliente também precisa raciocinar em local.
 */
function iso(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function diasAtras(dias: number): Date {
  const data = new Date();
  data.setDate(data.getDate() - dias);
  return data;
}

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Descarta o que não é data de calendário; o resto viraria 400 na rota. */
function dataValida(valor: string | null): string {
  if (!valor || !FORMATO_DATA.test(valor)) return "";
  const teste = new Date(`${valor}T00:00:00`);
  return Number.isNaN(teste.getTime()) ? "" : valor;
}

type Intervalo = { dataInicio: string; dataFim: string };

const ATALHOS: { chave: string; texto: string; calcular: () => Intervalo }[] = [
  {
    chave: "hoje",
    texto: "Hoje",
    calcular: () => {
      const hoje = iso(new Date());
      return { dataInicio: hoje, dataFim: hoje };
    },
  },
  {
    chave: "7dias",
    texto: "7 dias",
    calcular: () => ({
      dataInicio: iso(diasAtras(6)),
      dataFim: iso(new Date()),
    }),
  },
  {
    chave: "30dias",
    texto: "30 dias",
    calcular: () => ({
      dataInicio: iso(diasAtras(29)),
      dataFim: iso(new Date()),
    }),
  },
  {
    chave: "mes",
    texto: "Este mês",
    calcular: () => {
      const agora = new Date();
      return {
        dataInicio: iso(new Date(agora.getFullYear(), agora.getMonth(), 1)),
        dataFim: iso(agora),
      };
    },
  },
];

/** Chave do dia (local) de um instante do log, para agrupar a lista. */
function chaveDoDia(valor: string): string {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "sem-data";
  return iso(data);
}

/** "Hoje", "Ontem" ou dd/mm/aaaa. */
function rotuloDoDia(chave: string): string {
  if (chave === "sem-data") return "Data não registrada";
  if (chave === iso(new Date())) return "Hoje";
  if (chave === iso(diasAtras(1))) return "Ontem";
  const [ano, mes, dia] = chave.split("-");
  return `${dia}/${mes}/${ano}`;
}

/* -------------------------------------------------------------------------- */
/*                                  Filtros                                   */
/* -------------------------------------------------------------------------- */

type Filtros = {
  dataInicio: string;
  dataFim: string;
  acao: string;
  autorId: string;
  empresaId: string;
  /** Só chega pela URL: é o link "ver histórico completo" das telas de detalhe. */
  apuracaoId: string;
  processoId: string;
  origem: Origem;
};

const FILTROS_PADRAO: Filtros = {
  dataInicio: "",
  dataFim: "",
  acao: "",
  autorId: "",
  empresaId: "",
  apuracaoId: "",
  processoId: "",
  origem: "tudo",
};

/**
 * Lê os filtros da URL, descartando valor inválido.
 *
 * Vale a validação: `acao=QUALQUERCOISA` num link colado à mão faria a rota
 * devolver lista vazia sem dizer por quê, e a tela pareceria quebrada.
 */
function lerFiltros(params: URLSearchParams | null): Filtros {
  if (!params) return FILTROS_PADRAO;

  const acao = params.get("acao") ?? "";
  const origem = params.get("origem") ?? "tudo";

  return {
    dataInicio: dataValida(params.get("dataInicio")),
    dataFim: dataValida(params.get("dataFim")),
    acao: ACOES_VALIDAS.includes(acao) ? acao : "",
    autorId: params.get("autorId") ?? "",
    empresaId: params.get("empresaId") ?? "",
    apuracaoId: params.get("apuracaoId") ?? "",
    processoId: params.get("processoId") ?? "",
    origem: (ORIGENS_VALIDAS.includes(origem) ? origem : "tudo") as Origem,
  };
}

function temFiltro(filtros: Filtros): boolean {
  return (
    !!filtros.dataInicio ||
    !!filtros.dataFim ||
    !!filtros.acao ||
    !!filtros.autorId ||
    !!filtros.empresaId ||
    !!filtros.apuracaoId ||
    !!filtros.processoId ||
    filtros.origem !== "tudo"
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Wrapper                                   */
/* -------------------------------------------------------------------------- */

/**
 * `useSearchParams` exige um limite de Suspense acima, senão o build acusa a
 * rota como não pré-renderizável. O limite fica aqui para a página seguir sendo
 * server component simples.
 */
export default function AuditoriaView() {
  return (
    <Suspense
      fallback={
        <div className="cz-tarefas mx-auto max-w-[1800px] space-y-6 p-6">
          <Carregando texto="Carregando auditoria" />
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
  const { sessao } = useSessao();

  // A URL vale na montagem; daí em diante o estado manda e a URL é espelho.
  // Ler a URL a cada render criaria laço com o `router.replace`.
  const [filtros, setFiltros] = useState<Filtros>(() => lerFiltros(params));
  const [limite, setLimite] = useState(LIMITE_PADRAO);
  const [pagina, setPagina] = useState(1);

  const [logs, setLogs] = useState<LogAuditoria[]>([]);
  const [paginacao, setPaginacao] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: LIMITE_PADRAO,
    totalPages: 0,
  });
  const [carregando, setCarregando] = useState(true);
  const [primeiraCarga, setPrimeiraCarga] = useState(true);
  const [erro, setErro] = useState("");
  const [recarga, setRecarga] = useState(0);

  const [usuarios, setUsuarios] = useState<UsuarioInterno[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaLista[]>([]);

  /* --------------------------- Filtros e a URL ---------------------------- */

  const alterar = useCallback((mudanca: Partial<Filtros>) => {
    setFiltros((atual) => ({ ...atual, ...mudanca }));
  }, []);

  const limpar = useCallback(() => {
    setFiltros(FILTROS_PADRAO);
    setLimite(LIMITE_PADRAO);
  }, []);

  const consulta = useMemo(
    () =>
      query({
        dataInicio: filtros.dataInicio,
        dataFim: filtros.dataFim,
        acao: filtros.acao,
        autorId: filtros.autorId,
        empresaId: filtros.empresaId,
        apuracaoId: filtros.apuracaoId,
        processoId: filtros.processoId,
        origem: filtros.origem === "tudo" ? "" : filtros.origem,
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
  }, [consulta, limite]);

  /**
   * Intervalo invertido.
   *
   * Comparação de string basta porque "aaaa-mm-dd" ordena como data.
   */
  const intervaloInvertido =
    !!filtros.dataInicio &&
    !!filtros.dataFim &&
    filtros.dataInicio > filtros.dataFim;

  /* ------------------------------- Buscas -------------------------------- */

  useEffect(() => {
    // Nada de chamar a rota com o período de cabeça para baixo: ela responderia
    // 200 com lista vazia e o operador ficaria sem saber o motivo.
    if (intervaloInvertido) {
      setLogs([]);
      setPaginacao({ total: 0, page: 1, limit: limite, totalPages: 0 });
      setCarregando(false);
      setPrimeiraCarga(false);
      setErro("");
      return;
    }

    const controlador = new AbortController();
    let vivo = true;

    setCarregando(true);
    setErro("");

    const url = `/api/tarefas/log${query({
      dataInicio: filtros.dataInicio,
      dataFim: filtros.dataFim,
      acao: filtros.acao,
      autorId: filtros.autorId,
      empresaId: filtros.empresaId,
      apuracaoId: filtros.apuracaoId,
      processoId: filtros.processoId,
      page: pagina,
      limit: limite,
    })}`;

    apiGet<RespostaLog>(url, controlador.signal)
      .then((dados) => {
        if (!vivo) return;
        setLogs(dados.logs ?? []);
        setPaginacao(
          dados.pagination ?? {
            total: dados.logs?.length ?? 0,
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
        setLogs([]);
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
  }, [
    filtros.dataInicio,
    filtros.dataFim,
    filtros.acao,
    filtros.autorId,
    filtros.empresaId,
    filtros.apuracaoId,
    filtros.processoId,
    intervaloInvertido,
    pagina,
    limite,
    recarga,
  ]);

  useEffect(() => {
    const controlador = new AbortController();
    apiGet<RespostaUsuarios>("/api/usuarios-internos", controlador.signal)
      .then((dados) => setUsuarios(dados.usuarios ?? []))
      .catch(() => {
        // O filtro de autor fica sem opções; a lista não depende disso.
      });
    return () => controlador.abort();
  }, []);

  useEffect(() => {
    const controlador = new AbortController();
    apiGet<RespostaEmpresas>(
      `/api/empresas${query({ limit: 200 })}`,
      controlador.signal
    )
      .then((dados) => setEmpresas(dados.empresas ?? []))
      .catch(() => {
        // O filtro de empresa fica sem opções; a lista não depende disso.
      });
    return () => controlador.abort();
  }, []);

  const opcoesAutor = useMemo<Opcao[]>(
    () => usuarios.map((u) => ({ valor: u.id, texto: u.rotulo })),
    [usuarios]
  );

  const opcoesEmpresa = useMemo<Opcao[]>(
    () =>
      empresas.map((e) => ({
        valor: e.id,
        texto: `${e.razaoSocial} · ${e.cnpjFormatado}`,
      })),
    [empresas]
  );

  /* ------------------------------ Derivados ------------------------------ */

  /** Filtro de origem: age só sobre o que já veio. Ver `AVISO_ORIGEM`. */
  const visiveis = useMemo(() => {
    if (filtros.origem === "apuracao") return logs.filter((l) => !!l.apuracao);
    if (filtros.origem === "legalizacao") return logs.filter((l) => !!l.processo);
    return logs;
  }, [filtros.origem, logs]);

  const grupos = useMemo(() => {
    const saida: { chave: string; rotulo: string; logs: LogAuditoria[] }[] = [];
    // A rota devolve `createdAt desc`, então basta quebrar quando o dia troca.
    for (const log of visiveis) {
      const chave = chaveDoDia(log.createdAt);
      const ultimo = saida[saida.length - 1];
      if (ultimo && ultimo.chave === chave) {
        ultimo.logs.push(log);
      } else {
        saida.push({ chave, rotulo: rotuloDoDia(chave), logs: [log] });
      }
    }
    return saida;
  }, [visiveis]);

  const registroEspecifico = !!filtros.apuracaoId || !!filtros.processoId;
  const filtroAtivo = temFiltro(filtros) || limite !== LIMITE_PADRAO;

  const resumoFiltro = useMemo(() => {
    const partes: string[] = [];

    if (filtros.dataInicio && filtros.dataFim) {
      partes.push(
        `de ${rotuloDoDia(filtros.dataInicio)} a ${rotuloDoDia(filtros.dataFim)}`
      );
    } else if (filtros.dataInicio) {
      partes.push(`a partir de ${rotuloDoDia(filtros.dataInicio)}`);
    } else if (filtros.dataFim) {
      partes.push(`até ${rotuloDoDia(filtros.dataFim)}`);
    } else {
      partes.push("todo o período");
    }

    if (filtros.acao) {
      partes.push(ACAO_LOG_LABEL[filtros.acao] ?? filtros.acao);
    }
    if (filtros.autorId) {
      const achado = usuarios.find((u) => u.id === filtros.autorId);
      partes.push(`autor ${achado?.rotulo ?? "selecionado"}`);
    }
    if (filtros.empresaId) {
      const achada = empresas.find((e) => e.id === filtros.empresaId);
      partes.push(`empresa ${achada?.razaoSocial ?? "selecionada"}`);
    }
    if (filtros.apuracaoId) partes.push("uma apuração específica");
    if (filtros.processoId) partes.push("um processo específico");
    if (filtros.origem !== "tudo") {
      partes.push(`${ORIGEM_LABEL[filtros.origem]} (nesta página)`);
    }

    return partes.join(" · ");
  }, [empresas, filtros, usuarios]);

  const descricaoLista = useMemo(() => {
    const base = plural(
      paginacao.total,
      "alteração registrada",
      "alterações registradas"
    );
    if (filtros.origem === "tudo") return base;
    return `${base} · mostrando ${plural(
      visiveis.length,
      "linha",
      "linhas"
    )} de ${logs.length} desta página (${ORIGEM_LABEL[filtros.origem]})`;
  }, [filtros.origem, logs.length, paginacao.total, visiveis.length]);

  const atalhoAtivo = useMemo(() => {
    for (const atalho of ATALHOS) {
      const intervalo = atalho.calcular();
      if (
        intervalo.dataInicio === filtros.dataInicio &&
        intervalo.dataFim === filtros.dataFim
      ) {
        return atalho.chave;
      }
    }
    return "";
  }, [filtros.dataFim, filtros.dataInicio]);

  /* -------------------------------- Render ------------------------------- */

  return (
    <div className="cz-tarefas mx-auto max-w-[1800px] space-y-6 p-6">
      {/* `compacto`: o cabeçalho do admin já escreve "Auditoria" e o subtítulo
          da rota. A descrição só dizia o que a tela é — o bloco cinza logo
          abaixo, sobre o autor congelado, é o que traz informação que não está
          em nenhum outro lugar. A pílula de voltar e o botão Atualizar dividem
          agora uma única linha. A contagem de alterações continua no painel da
          lista, em `descricaoLista`. */}
      <Cabecalho
        compacto
        titulo="Auditoria"
        icone="History"
        descricao="Registro de toda alteração feita nas apurações fiscais e nos processos de legalização, com autor, papel e horário de cada movimento."
        voltarPara="/admin/tarefas"
        voltarTexto="Voltar ao painel de tarefas"
        acoes={
          <Botao
            variante="secundario"
            icone="RefreshCw"
            carregando={carregando && !primeiraCarga}
            textoCarregando="Atualizando"
            onClick={() => setRecarga((n) => n + 1)}
          >
            Atualizar
          </Botao>
        }
      />

      {/* ---------------------- Por que o autor é congelado ----------------- */}

      <div className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <Icone
          nome="Info"
          className="mt-0.5 h-4 w-4 shrink-0 text-gray-400"
        />
        <p className="text-xs leading-relaxed text-gray-600">
          O nome e o papel do autor ficam <strong>congelados</strong> em cada
          linha: eles dizem quem a pessoa era no momento da alteração, não quem
          ela é hoje. Se alguém mudou de papel ou saiu do escritório depois, a
          linha antiga continua igual — é isso que faz o log servir de prova.
          Quando o papel atual é diferente do de então, a linha acrescenta
          &ldquo;hoje: ...&rdquo; ao lado do autor.
        </p>
      </div>

      {/* ---------------------- Filtro por registro único ------------------- */}

      {registroEspecifico && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-300 bg-white px-2.5 py-1 text-xs font-semibold text-orange-700">
            <Icone nome="Filter" className="h-3.5 w-3.5" />
            Filtrado por um registro específico
          </span>
          <p className="min-w-0 flex-1 text-xs text-orange-900">
            A lista está mostrando apenas o histórico
            {filtros.apuracaoId ? " desta apuração" : " deste processo"}. É por
            isso que ela está mais curta que a auditoria completa.
          </p>
          <Botao
            variante="secundario"
            icone="X"
            onClick={() => alterar({ apuracaoId: "", processoId: "" })}
          >
            Ver a auditoria completa
          </Botao>
        </div>
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
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Período rápido
            </span>
            {ATALHOS.map((atalho) => {
              const ativo = atalhoAtivo === atalho.chave;
              return (
                <button
                  key={atalho.chave}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => alterar(atalho.calcular())}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    ativo
                      ? "border-orange-500 bg-orange-500 text-white"
                      : "border-gray-300 bg-white text-gray-600 hover:border-orange-400 hover:text-orange-600"
                  }`}
                >
                  {atalho.texto}
                </button>
              );
            })}
            {(filtros.dataInicio || filtros.dataFim) && (
              <button
                type="button"
                onClick={() => alterar({ dataInicio: "", dataFim: "" })}
                className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-orange-400 hover:text-orange-600"
              >
                <Icone nome="X" className="h-3 w-3" />
                Todo o período
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Entrada
              rotulo="De"
              type="date"
              value={filtros.dataInicio}
              max={filtros.dataFim || undefined}
              onChange={(e) => alterar({ dataInicio: e.target.value })}
              erro={
                intervaloInvertido ? "Posterior à data final" : undefined
              }
              ajuda="Conta desde 00:00"
            />
            <Entrada
              rotulo="Até"
              type="date"
              value={filtros.dataFim}
              min={filtros.dataInicio || undefined}
              onChange={(e) => alterar({ dataFim: e.target.value })}
              ajuda="Conta até 23:59"
            />
            <Escolha
              rotulo="Ação"
              vazio="Todas as ações"
              opcoes={OPCOES_ACAO}
              value={filtros.acao}
              onChange={(e) => alterar({ acao: e.target.value })}
            />
            <Escolha
              rotulo="Autor"
              vazio="Todos os autores"
              opcoes={opcoesAutor}
              value={filtros.autorId}
              onChange={(e) => alterar({ autorId: e.target.value })}
            />
            <Escolha
              rotulo="Empresa"
              vazio="Todas as empresas"
              opcoes={opcoesEmpresa}
              value={filtros.empresaId}
              onChange={(e) => alterar({ empresaId: e.target.value })}
            />
            <Escolha
              rotulo="Origem"
              opcoes={OPCOES_ORIGEM}
              value={filtros.origem}
              onChange={(e) =>
                alterar({ origem: e.target.value as Origem })
              }
              ajuda="Age só nesta página"
            />
          </div>

          <p className="flex items-start gap-1.5 text-xs text-gray-500">
            <Icone nome="Filter" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Filtrando por {resumoFiltro}.</span>
          </p>
        </div>
      </Painel>

      {filtros.origem !== "tudo" && <Aviso tom="info" mensagem={AVISO_ORIGEM} />}

      {/* ------------------------------ Estados ----------------------------- */}

      {intervaloInvertido ? (
        <Aviso
          tom="atencao"
          mensagem="A data inicial está depois da data final, então nenhum período válido foi consultado. Ajuste as datas para ver o histórico."
        />
      ) : erro ? (
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
      ) : primeiraCarga && carregando ? (
        <Carregando texto="Carregando alterações" />
      ) : logs.length === 0 && pagina > 1 && paginacao.total > 0 ? (
        // Página fora de alcance: acontece quando o resultado encolhe entre duas
        // cargas. A `Paginacao` vive dentro do painel da lista, então sem esta
        // saída a pessoa ficaria numa página vazia sem controle para voltar.
        <Vazio
          icone="ChevronLeft"
          titulo={`A página ${pagina} não tem alterações.`}
          descricao="O resultado ficou menor desde a última carga. Volte para a primeira página para ver o histórico atual."
          acao={
            <Botao
              variante="secundario"
              icone="ChevronLeft"
              onClick={() => setPagina(1)}
            >
              Voltar à primeira página
            </Botao>
          }
        />
      ) : logs.length === 0 ? (
        temFiltro(filtros) ? (
          <Vazio
            icone="Filter"
            titulo="Nenhuma alteração registrada no período e filtros escolhidos."
            descricao="Ajuste o período, a ação, o autor ou a empresa para alcançar o restante do histórico."
            acao={
              <Botao variante="secundario" icone="X" onClick={limpar}>
                Limpar filtros
              </Botao>
            }
          />
        ) : (
          <Vazio
            icone="History"
            titulo="Nenhuma alteração registrada ainda."
            descricao="Assim que alguém concluir uma etapa, registrar pendência ou alterar prazo, o movimento aparece aqui com autor, papel e horário."
          />
        )
      ) : visiveis.length === 0 ? (
        <Vazio
          icone="Filter"
          titulo={`Nenhuma alteração de ${
            filtros.origem === "apuracao" ? "apuração" : "legalização"
          } nesta página.`}
          descricao="O filtro de origem age apenas sobre as linhas já carregadas. Existem outras páginas de resultado, ou você pode voltar a ver tudo."
          acao={
            <Botao
              variante="secundario"
              icone="X"
              onClick={() => alterar({ origem: "tudo" })}
            >
              Ver todas as origens
            </Botao>
          }
        />
      ) : (
        <Painel
          titulo="Alterações registradas"
          descricao={descricaoLista}
          acoes={
            <Escolha
              rotulo="Itens por página"
              opcoes={OPCOES_LIMITE}
              value={String(limite)}
              onChange={(e) => setLimite(Number(e.target.value))}
              wrapperClassName="w-44"
            />
          }
        >
          <div>
            {grupos.map((grupo) => (
              <section key={grupo.chave}>
                {/* Cabeçalho aderente: num log longo, sem a data fixa a pessoa
                    perde a noção de quando as coisas aconteceram. */}
                <h3 className="sticky top-0 z-10 flex items-center gap-2 border-y border-gray-200 bg-gray-50/95 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 backdrop-blur">
                  <Icone nome="Calendar" className="h-3.5 w-3.5 text-gray-400" />
                  {grupo.rotulo}
                  <span className="font-normal normal-case tracking-normal text-gray-400">
                    · {plural(grupo.logs.length, "alteração", "alterações")}
                  </span>
                </h3>

                <ol className="divide-y divide-gray-100">
                  {grupo.logs.map((log) => (
                    <Linha
                      key={log.id}
                      log={log}
                      ehVoce={
                        !!log.autorId && log.autorId === sessao?.userId
                      }
                    />
                  ))}
                </ol>
              </section>
            ))}
          </div>

          <Paginacao
            pagina={pagina}
            totalPaginas={paginacao.totalPages}
            total={paginacao.total}
            onMudar={setPagina}
            rotulo="alterações"
          />
        </Painel>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Linha do log                                  */
/* -------------------------------------------------------------------------- */

/**
 * "de → para" legível.
 *
 * `de` e `para` guardam valores brutos: às vezes status (`EM_REVISAO`), às vezes
 * número de etapa (`4`), às vezes regime. Traduzimos quando o valor é um dos 6
 * status e deixamos cru quando não é — inventar tradução esconderia o dado real.
 */
function transicao(log: LogAuditoria): string | null {
  const de = log.de?.trim();
  const para = log.para?.trim();
  if (!de && !para) return null;

  const traduz = (valor: string) =>
    STATUS_LABEL[valor] ? labelDoStatus(valor) : valor;

  if (de && para) return `${traduz(de)} → ${traduz(para)}`;
  return traduz((para ?? de) as string);
}

function Linha({ log, ehVoce }: { log: LogAuditoria; ehVoce: boolean }) {
  const estilo = ESTILO_ACAO[log.acao] ?? ESTILO_PADRAO;
  const mudanca = transicao(log);
  const papelDeHoje =
    log.autor && log.autor.role !== log.autorPapel ? log.autor.role : null;

  return (
    <li className="flex gap-3 px-5 py-3.5 transition-colors hover:bg-gray-50/60">
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${estilo.tom}`}
      >
        <Icone nome={estilo.icone} className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        {/* O QUE mudou */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-gray-900">
            {ACAO_LOG_LABEL[log.acao] ?? log.acao}
          </span>
          {mudanca && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
              {mudanca}
            </span>
          )}
        </div>

        {log.detalhe && (
          <p className="mt-1 text-sm text-gray-600">{log.detalhe}</p>
        )}

        {/* EM QUE registro */}
        <div className="mt-1.5">
          <Registro log={log} />
        </div>

        {/* QUEM e QUANDO */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
          <span className="font-medium text-gray-700">{log.autorNome}</span>
          {/* Peso fraco: numa linha de auditoria o que salta é a ação, não o
              papel de quem fez. */}
          <SeloPapel papel={log.autorPapel} peso="fraco" />

          {ehVoce && (
            <span className="rounded-full border border-gray-300 px-1.5 text-[11px] font-medium text-gray-600">
              você
            </span>
          )}

          {papelDeHoje && (
            <span
              className="text-gray-400"
              title="O papel registrado na linha é o da época da alteração. O cadastro atual desta pessoa tem outro papel."
            >
              hoje: {papelLabel(papelDeHoje)}
            </span>
          )}

          {!log.autor && (
            <span
              className="inline-flex items-center gap-1 text-gray-400"
              title="O nome e o papel acima continuam valendo: são o que ficou gravado na linha do log."
            >
              <Icone nome="Info" className="h-3 w-3" />
              usuário removido do cadastro
            </span>
          )}

          <span aria-hidden="true">·</span>
          <span>{dataHora(log.createdAt)}</span>
          <span className="text-gray-400">({tempoRelativo(log.createdAt)})</span>
        </div>
      </div>
    </li>
  );
}

/** O registro alterado: apuração ou processo, com a empresa e os links. */
function Registro({ log }: { log: LogAuditoria }) {
  const classeLink =
    "font-medium text-gray-700 underline decoration-gray-300 decoration-dotted underline-offset-2 transition-colors hover:text-orange-600 hover:decoration-orange-400";

  if (log.apuracao) {
    const empresa = log.apuracao.empresa;
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
        <Icone nome="Calculator" className="h-3.5 w-3.5 shrink-0" />
        <Link
          href={`/admin/tarefas/apuracao/${log.apuracao.id}`}
          className={classeLink}
        >
          Apuração {competenciaLabel(log.apuracao.ano, log.apuracao.mes)}
        </Link>
        <span aria-hidden="true">·</span>
        <Link href={`/admin/empresas/${empresa.id}`} className={classeLink}>
          {nomeEmpresa(empresa)}
        </Link>
      </p>
    );
  }

  if (log.processo) {
    const empresa = log.processo.empresa;
    // Processo de abertura ainda não tem CNPJ, então a identificação
    // provisória é o único nome que existe para ele.
    const rotuloEmpresa = empresa
      ? nomeEmpresa(empresa)
      : log.processo.identificacaoProvisoria?.trim() ||
        "Empresa ainda não vinculada";

    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
        <Icone nome="Briefcase" className="h-3.5 w-3.5 shrink-0" />
        <Link
          href={`/admin/tarefas/legalizacao/${log.processo.id}`}
          className={classeLink}
        >
          {TIPO_PROCESSO_LABEL[log.processo.tipo] ?? log.processo.tipo}
        </Link>
        <span aria-hidden="true">·</span>
        {empresa ? (
          <Link href={`/admin/empresas/${empresa.id}`} className={classeLink}>
            {rotuloEmpresa}
          </Link>
        ) : (
          <span className="font-medium text-gray-600">{rotuloEmpresa}</span>
        )}
      </p>
    );
  }

  // Log sem apuração e sem processo: o registro de origem foi removido. Some da
  // relação, mas a linha do log permanece — e dizer isso é melhor que deixar em
  // branco, que pareceria falha de carregamento.
  return (
    <p className="flex items-center gap-2 text-xs text-gray-400">
      <Icone nome="Info" className="h-3.5 w-3.5 shrink-0" />
      Registro de origem não está mais disponível.
    </p>
  );
}
