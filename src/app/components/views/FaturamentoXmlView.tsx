"use client";

/**
 * Faturamento (XML) — apuração do faturamento mensal a partir de nota fiscal.
 *
 * AGORA COM BACK-END. A tela era maquete com número fixo; passou a ler de:
 *
 *   GET  /api/fiscal/faturamento   resumo da competência (KPIs, canais, ignorados)
 *   GET  /api/fiscal/xml           tabela de notas, paginada e filtrada
 *   POST /api/fiscal/xml/importar  importação multipart
 *   PUT  /api/fiscal/faturamento   valor declarado à mão
 *   GET/PUT /api/fiscal/series     mapa série -> canal
 *
 * Os números que a maquete mostrava vieram de `scripts/diagnostico-xml.ts` sobre os
 * 822 XMLs de agosto/2026 da conta CINGAPURA (366 notas, R$ 62.514,16). Eram reais
 * de propósito, e servem de conferência: importando aquela mesma pasta, a tela tem
 * de chegar no mesmo centavo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O CONSERTO DE SCROLL DUPLO NÃO PODE SER REMOVIDO AO MEXER NO LAYOUT
 *
 * A tabela tem largura mínima dentro de `overflow-x-auto`, e isso vive numa COLUNA
 * DE GRID. Item de grid tem `min-width: auto`, então a coluna não encolhe abaixo da
 * largura mínima do conteúdo: a tabela empurrava a grade além da janela. Como
 * `globals.css` tem `html, body { overflow-x: hidden }`, pela especificação o outro
 * eixo computa para `auto` — e aparece uma SEGUNDA barra de rolagem ao lado da do
 * `<main>`.
 *
 * Os `min-w-0` espalhados (raiz, cada coluna de grid, o rolador da tabela) são esse
 * conserto. Não são decorativos.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * DUAS DIVERGÊNCIAS DELIBERADAS DA MAQUETE, mantidas
 *
 * O número dos cartões não é colorido: `CartaoKpi` já decidiu isso no produto —
 * numa grade, todo número colorido disputa com o vizinho e nenhum vence.
 *
 * A rosca de participação virou BARRA. Com um canal em 100% a rosca é um anel
 * sólido e gasta 140px de altura para dizer "veio tudo do mesmo lugar".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Aviso,
  Cabecalho,
  Carregando,
  CartaoKpi,
  Paginacao,
  Painel,
  Vazio,
} from "@/app/components/views/ui/tarefas/Base";
import {
  Abas,
  Area,
  Botao,
  Entrada,
  Escolha,
} from "@/app/components/views/ui/tarefas/Campos";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import { Selo } from "@/app/components/views/comum/shell";
import { LogoCanal, type CanalLogo } from "@/app/components/views/comum/logos";
import {
  apiGet,
  apiPut,
  apiUpload,
  mensagemDeErro,
  query,
} from "@/app/components/views/ui/tarefas/api";

/* -------------------------------------------------------------------------- */
/*                          Formato das respostas                             */
/* -------------------------------------------------------------------------- */

type EmpresaResumo = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string | null;
  regime: string;
  grupo?: string | null;
};

type CanalResumo = {
  chave: string;
  rotulo: string;
  logo: CanalLogo | null;
  cor: string;
  notas: number;
  valor: number;
  series: string[];
};

type LinhaFora = { code: string; rotulo: string; quantos: number; valor: number };

type FaturamentoDefinido = {
  origem: string;
  valor: number;
  valorApurado: number | null;
  documentos: number;
  observacao: string | null;
  congeladoEm: string | null;
  definidoPorNome: string;
  apuradoEm: string | null;
};

type ImportacaoResumo = {
  id: string;
  createdAt: string;
  arquivosEnviados: number;
  importados: number;
  duplicados: number;
  ignorados: number;
  comErro: number;
  situacao: string;
  importadoPorNome: string;
};

type Resumo = {
  empresa: EmpresaResumo;
  competencia: { ano: number; mes: number; chave: string; label: string } | null;
  competenciasDisponiveis: Array<{ valor: string; texto: string }>;
  kpis: {
    apurado: number;
    arquivosLidos: number;
    notasValidas: number;
    notasCanceladas: number;
    precisamConferencia: number;
  };
  faturamento: FaturamentoDefinido | null;
  canais: CanalResumo[];
  foraDoFaturamento: LinhaFora[];
  importacoes: ImportacaoResumo[];
  vazio: boolean;
};

type Documento = {
  id: string;
  chave: string;
  modelo: string;
  serie: string;
  numero: number;
  emitidoEm: string;
  situacao: string;
  valorTotal: number;
  cfops: string[];
  cfop: string | null;
  nomeDestinatario: string | null;
  documentoDestinatario: string | null;
  tipoDocumentoDestinatario: string | null;
  contaFaturamento: boolean;
  motivoExclusao: string | null;
  motivoExclusaoLabel: string | null;
  precisaConferencia: boolean;
  pedidoMarketplace: string | null;
  canceladoEm: string | null;
  canal: string;
};

type ListaDocumentos = {
  documentos: Documento[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
};

type LinhaRelatorio = {
  arquivo: string;
  resultado: string;
  chave: string | null;
  motivo: string | null;
  code: string | null;
};

type ResumoImportacao = {
  importacaoId: string;
  arquivosEnviados: number;
  importados: number;
  duplicados: number;
  ignorados: number;
  comErro: number;
  naoProcessados: number;
  situacao: string;
  relatorio: LinhaRelatorio[];
};

type SeriesResposta = {
  series: Array<{ id: string; serie: string; canal: string; canalLabel: string }>;
  naoMapeadas: Array<{ serie: string; notas: number }>;
  canaisDisponiveis: Array<{ valor: string; texto: string }>;
};

/* -------------------------------------------------------------------------- */
/*                                 Formatação                                 */
/* -------------------------------------------------------------------------- */

const real = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const inteiro = (v: number) => v.toLocaleString("pt-BR");

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const cnpjFormatado = (cnpj: string | null) =>
  cnpj && cnpj.length === 14
    ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
    : cnpj ?? "sem CNPJ";

const REGIME_LABEL: Record<string, string> = {
  SIMPLES_NACIONAL: "Simples Nacional",
  LUCRO_PRESUMIDO: "Lucro Presumido",
};

/** "62.514,16" -> 62514.16. Aceita vazio e o meio-caminho da digitação. */
function paraNumero(texto: string): number {
  const limpo = texto.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

/** Número em formato de campo: sem símbolo, com vírgula decimal. */
const paraCampo = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Arquivos por envio.
 *
 * Espelha `MAX_ARQUIVOS_POR_LOTE` do servidor, que recusa lote maior com 413. A
 * tela fatia antes de enviar, então selecionar a pasta inteira (822 arquivos)
 * funciona: são três envios em sequência, e não um erro.
 */
const MAX_ARQUIVOS_POR_LOTE = 300;

/* -------------------------------------------------------------------------- */
/*                              Peças da tela                                 */
/* -------------------------------------------------------------------------- */

/**
 * Canal como logo.
 *
 * Caixa de tamanho fixo em volta do SVG: os desenhos têm proporções diferentes, e
 * sem a caixa comum uma linha de Mercado Livre e outra de Shopee ficariam com
 * alturas visivelmente distintas e a coluna pareceria torta.
 */
function CelulaCanal({
  canal,
  canais,
  comNome = true,
}: {
  canal: string;
  canais: CanalResumo[];
  comNome?: boolean;
}) {
  const encontrado = canais.find((c) => c.chave === canal) ?? null;
  const rotulo = encontrado?.rotulo ?? "Sem série mapeada";
  const logo = encontrado?.logo ?? null;

  return (
    <span className="inline-flex min-w-0 items-center gap-2" title={rotulo}>
      <span className="grid size-6 shrink-0 place-items-center rounded-md border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]">
        {logo ? (
          <LogoCanal canal={logo} />
        ) : (
          <Icone nome="Store" className="h-3 w-3 text-[var(--cz-texto-fraco)]" />
        )}
      </span>
      {comNome && <span className="truncate">{rotulo}</span>}
    </span>
  );
}

function BarraParticipacao({ canais, total }: { canais: CanalResumo[]; total: number }) {
  const comValor = canais.filter((c) => c.valor > 0);
  if (total <= 0 || comValor.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex h-2 overflow-hidden rounded-full bg-[var(--cz-fundo)]">
        {comValor.map((c) => (
          <span
            key={c.chave}
            title={`${c.rotulo}: ${real(c.valor)}`}
            style={{ width: `${(c.valor / total) * 100}%`, backgroundColor: c.cor }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {comValor.map((c) => (
          <li key={c.chave} className="flex items-center gap-1.5 text-[11.5px]">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: c.cor }}
            />
            <span className="text-[var(--cz-texto-suave)]">{c.rotulo}</span>
            <span className="cz-num font-bold text-[var(--cz-texto)]">
              {((c.valor / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ícone e tom por resultado, para o relatório de importação. */
const RESULTADO_VISUAL: Record<string, { icone: string; tom: string; rotulo: string }> = {
  IMPORTADO: { icone: "CheckCircle2", tom: "text-emerald-600", rotulo: "Importado" },
  CANCELAMENTO_APLICADO: { icone: "XCircle", tom: "text-amber-600", rotulo: "Cancelamento aplicado" },
  DUPLICADO: { icone: "Copy", tom: "text-[var(--cz-texto-fraco)]", rotulo: "Já existia" },
  IGNORADO: { icone: "MinusCircle", tom: "text-[var(--cz-texto-suave)]", rotulo: "Ignorado" },
  ERRO: { icone: "AlertTriangle", tom: "text-red-600", rotulo: "Erro" },
  NAO_PROCESSADO: { icone: "Clock", tom: "text-sky-600", rotulo: "Não processado" },
};

/* -------------------------------------------------------------------------- */
/*                                   Abas                                     */
/* -------------------------------------------------------------------------- */

/** Abas que ainda não têm conteúdo. Dizem no rótulo, e o clique não finge navegar. */
const ABAS_PENDENTES = new Set(["ajustes", "declaracao"]);

/* -------------------------------------------------------------------------- */
/*                                   Tela                                     */
/* -------------------------------------------------------------------------- */

export default function FaturamentoXmlView() {
  /* ----------------------------- Empresas ------------------------------- */
  const [empresas, setEmpresas] = useState<EmpresaResumo[]>([]);
  const [empresaId, setEmpresaId] = useState("");
  const [erroEmpresas, setErroEmpresas] = useState("");

  /* ---------------------------- Competência ----------------------------- */
  const [competencia, setCompetencia] = useState("");

  /* ------------------------------ Resumo -------------------------------- */
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [carregandoResumo, setCarregandoResumo] = useState(false);
  const [primeiraCarga, setPrimeiraCarga] = useState(true);
  const [erro, setErro] = useState("");

  /* ------------------------------ Tabela -------------------------------- */
  const [lista, setLista] = useState<ListaDocumentos | null>(null);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [pagina, setPagina] = useState(1);

  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [canalFiltro, setCanalFiltro] = useState("");
  const [situacaoFiltro, setSituacaoFiltro] = useState("");
  const [contaFiltro, setContaFiltro] = useState("");

  /* ------------------------------ Aba ----------------------------------- */
  const [aba, setAba] = useState("geral");

  /* --------------------------- Importação ------------------------------- */
  const inputArquivos = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const [resultado, setResultado] = useState<ResumoImportacao | null>(null);

  /* -------------------------- Valor declarado --------------------------- */
  const [origem, setOrigem] = useState<"xml" | "manual">("xml");
  const [declarado, setDeclarado] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [avisoOk, setAvisoOk] = useState("");

  /* ----------------------------- Séries -------------------------------- */
  const [series, setSeries] = useState<SeriesResposta | null>(null);
  const [rascunhoSeries, setRascunhoSeries] = useState<Array<{ serie: string; canal: string }>>([]);
  const [salvandoSeries, setSalvandoSeries] = useState(false);

  /**
   * Gatilho manual de recarga.
   *
   * Contador em vez de chamar as funções de carga direto: depois de importar, TRÊS
   * coisas precisam recarregar (resumo, tabela e séries) e cada uma tem o próprio
   * efeito com as próprias dependências. Incrementar um número dispara as três sem
   * duplicar a lógica de busca em cada handler. Mesmo padrão de `EmpresasListaView`.
   */
  const [recarga, setRecarga] = useState(0);
  const recarregar = () => setRecarga((n) => n + 1);

  /* ------------------------ Carrega as empresas ------------------------- */

  useEffect(() => {
    const controlador = new AbortController();
    let vivo = true;

    apiGet<{ empresas: EmpresaResumo[] }>(
      `/api/empresas${query({ limit: 200 })}`,
      controlador.signal,
    )
      .then((dados) => {
        if (!vivo) return;
        const lista = dados.empresas ?? [];
        setEmpresas(lista);
        /*
         * Escolhe a primeira empresa COM CNPJ.
         *
         * Empresa em abertura não tem CNPJ, e sem CNPJ não há como casar nota
         * nenhuma — abrir a tela nela mostraria vazio permanente e pareceria
         * defeito da importação.
         */
        const comCnpj = lista.find((e) => e.cnpj);
        if (comCnpj) setEmpresaId((atual) => atual || comCnpj.id);
      })
      .catch((falha) => {
        if (!vivo) return;
        const mensagem = mensagemDeErro(falha);
        if (mensagem) setErroEmpresas(mensagem);
      });

    return () => {
      vivo = false;
      controlador.abort();
    };
  }, []);

  /* --------------------------- Debounce da busca ------------------------ */

  useEffect(() => {
    // 400ms: sem isso, cada tecla numa busca por chave de 44 dígitos dispararia
    // 44 requisições.
    const timer = setTimeout(() => setBuscaAplicada(busca.trim()), 400);
    return () => clearTimeout(timer);
  }, [busca]);

  /* ----------------------------- Carrega resumo ------------------------- */

  useEffect(() => {
    if (!empresaId) return;

    const controlador = new AbortController();
    let vivo = true;
    setCarregandoResumo(true);
    setErro("");

    apiGet<Resumo>(
      `/api/fiscal/faturamento${query({ empresaId, competencia })}`,
      controlador.signal,
    )
      .then((dados) => {
        if (!vivo) return;
        setResumo(dados);

        // A competência não vem do estado local: o servidor decide a padrão (a
        // mais recente COM documento). Sincronizar aqui evita o seletor mostrar
        // vazio enquanto a tela já exibe agosto.
        if (dados.competencia && !competencia) {
          setCompetencia(dados.competencia.chave);
        }

        // Espelha no formulário o que está gravado.
        const gravado = dados.faturamento;
        setOrigem(gravado && gravado.origem !== "XML" ? "manual" : "xml");
        setDeclarado(paraCampo(gravado ? gravado.valor : dados.kpis.apurado));
        setObservacao(gravado?.observacao ?? "");
      })
      .catch((falha) => {
        if (!vivo) return;
        const mensagem = mensagemDeErro(falha);
        if (!mensagem) return;
        setErro(mensagem);
        setResumo(null);
      })
      .finally(() => {
        if (!vivo) return;
        setCarregandoResumo(false);
        setPrimeiraCarga(false);
      });

    return () => {
      vivo = false;
      controlador.abort();
    };
    // `competencia` entra como dependência mas é sincronizada dentro do efeito:
    // a primeira carga vai sem ela e o servidor responde qual usou.
  }, [empresaId, competencia, recarga]);

  /* ----------------------------- Carrega tabela ------------------------- */

  useEffect(() => {
    if (!empresaId) return;

    const controlador = new AbortController();
    let vivo = true;
    setCarregandoLista(true);

    apiGet<ListaDocumentos>(
      `/api/fiscal/xml${query({
        empresaId,
        competencia,
        canal: canalFiltro,
        situacao: situacaoFiltro,
        conta: contaFiltro,
        busca: buscaAplicada,
        page: pagina,
        limit: 50,
      })}`,
      controlador.signal,
    )
      .then((dados) => {
        if (!vivo) return;
        setLista(dados);
      })
      .catch((falha) => {
        if (!vivo) return;
        const mensagem = mensagemDeErro(falha);
        if (mensagem) setErro(mensagem);
      })
      .finally(() => {
        if (!vivo) return;
        setCarregandoLista(false);
      });

    return () => {
      vivo = false;
      controlador.abort();
    };
  }, [empresaId, competencia, canalFiltro, situacaoFiltro, contaFiltro, buscaAplicada, pagina, recarga]);

  /* ----------------------------- Carrega séries ------------------------- */

  useEffect(() => {
    if (!empresaId) return;

    const controlador = new AbortController();
    let vivo = true;

    apiGet<SeriesResposta>(`/api/fiscal/series${query({ empresaId })}`, controlador.signal)
      .then((dados) => {
        if (!vivo) return;
        setSeries(dados);
        setRascunhoSeries(dados.series.map((s) => ({ serie: s.serie, canal: s.canal })));
      })
      .catch(() => {
        /* Séries é configuração acessória: falhar aqui não pode esconder a
           apuração, que é o motivo de a tela existir. */
      });

    return () => {
      vivo = false;
      controlador.abort();
    };
  }, [empresaId, recarga]);

  /* --------------------- Volta para a página 1 ------------------------- */

  useEffect(() => {
    // Sem isto a pessoa filtra, continua na página 4 de um resultado de 2 páginas
    // e vê lista vazia. Mesmo cuidado de `FormularioListaView`.
    setPagina(1);
  }, [empresaId, competencia, canalFiltro, situacaoFiltro, contaFiltro, buscaAplicada]);

  /* ---------------------------- Importação ----------------------------- */

  const importar = useCallback(
    async (arquivos: File[]) => {
      const xmls = arquivos.filter((a) => a.name.toLowerCase().endsWith(".xml"));
      if (xmls.length === 0) {
        setErro("Selecione arquivos .xml de nota fiscal.");
        return;
      }

      setImportando(true);
      setErro("");
      setAvisoOk("");
      setResultado(null);
      setProgresso({ feitos: 0, total: xmls.length });

      /*
       * Envio em lotes, em SÉRIE.
       *
       * Em série e não em paralelo: os lotes disputariam a mesma competência na
       * reapuração do fim de cada importação, e duas reapurações concorrentes da
       * mesma competência podem gravar valores diferentes dependendo de qual
       * termina por último.
       */
      const acumulado: ResumoImportacao = {
        importacaoId: "",
        arquivosEnviados: 0,
        importados: 0,
        duplicados: 0,
        ignorados: 0,
        comErro: 0,
        naoProcessados: 0,
        situacao: "CONCLUIDA",
        relatorio: [],
      };

      try {
        for (let i = 0; i < xmls.length; i += MAX_ARQUIVOS_POR_LOTE) {
          const lote = xmls.slice(i, i + MAX_ARQUIVOS_POR_LOTE);
          const formulario = new FormData();
          for (const arquivo of lote) formulario.append("arquivos", arquivo);

          const parcial = await apiUpload<ResumoImportacao>(
            "/api/fiscal/xml/importar",
            formulario,
          );

          acumulado.importacaoId = parcial.importacaoId;
          acumulado.arquivosEnviados += parcial.arquivosEnviados;
          acumulado.importados += parcial.importados;
          acumulado.duplicados += parcial.duplicados;
          acumulado.ignorados += parcial.ignorados;
          acumulado.comErro += parcial.comErro;
          acumulado.naoProcessados += parcial.naoProcessados;
          acumulado.relatorio.push(...parcial.relatorio);

          setProgresso({ feitos: Math.min(i + lote.length, xmls.length), total: xmls.length });
        }

        setResultado(acumulado);
        recarregar();
      } catch (falha) {
        const mensagem = mensagemDeErro(falha);
        if (mensagem) setErro(mensagem);
        // O que já entrou nos lotes anteriores está gravado: recarrega para a tela
        // refletir a verdade em vez de parecer que nada aconteceu.
        if (acumulado.importados > 0) {
          setResultado(acumulado);
          recarregar();
        }
      } finally {
        setImportando(false);
        if (inputArquivos.current) inputArquivos.current.value = "";
      }
    },
    [],
  );

  /* ------------------------ Salvar valor declarado --------------------- */

  const salvarFaturamento = useCallback(async () => {
    if (!empresaId || !competencia) return;

    setSalvando(true);
    setErro("");
    setAvisoOk("");

    try {
      await apiPut("/api/fiscal/faturamento", {
        empresaId,
        competencia,
        origem: origem === "xml" ? "XML" : "MANUAL",
        valor: origem === "xml" ? (resumo?.kpis.apurado ?? 0) : paraNumero(declarado),
        observacao: observacao.trim() || null,
      });
      setAvisoOk("Faturamento declarado salvo.");
      recarregar();
    } catch (falha) {
      const mensagem = mensagemDeErro(falha);
      if (mensagem) setErro(mensagem);
    } finally {
      setSalvando(false);
    }
  }, [competencia, declarado, empresaId, observacao, origem, resumo]);

  /* ---------------------------- Salvar séries -------------------------- */

  const salvarSeries = useCallback(async () => {
    if (!empresaId) return;

    setSalvandoSeries(true);
    setErro("");
    setAvisoOk("");

    try {
      await apiPut("/api/fiscal/series", {
        empresaId,
        series: rascunhoSeries.filter((s) => s.serie && s.canal),
      });
      setAvisoOk("Mapa de séries salvo. O canal das notas foi recalculado.");
      recarregar();
    } catch (falha) {
      const mensagem = mensagemDeErro(falha);
      if (mensagem) setErro(mensagem);
    } finally {
      setSalvandoSeries(false);
    }
  }, [empresaId, rascunhoSeries]);

  /* ------------------------------ Derivados ---------------------------- */

  const apurado = resumo?.kpis.apurado ?? 0;
  const valorDeclarado = origem === "xml" ? apurado : paraNumero(declarado);
  const divergencia = valorDeclarado - apurado;
  const divergenciaPct = apurado > 0 ? (divergencia / apurado) * 100 : 0;
  const semDivergencia = Math.abs(divergencia) < 0.01;

  const congelada = Boolean(resumo?.faturamento?.congeladoEm);

  const temFiltro = Boolean(busca || canalFiltro || situacaoFiltro || contaFiltro);
  const limparFiltros = () => {
    setBusca("");
    setCanalFiltro("");
    setSituacaoFiltro("");
    setContaFiltro("");
  };

  const documentos = lista?.documentos ?? [];
  const canais = resumo?.canais ?? [];

  const abas = useMemo(
    () =>
      [
        { chave: "geral", texto: "Visão geral" },
        { chave: "notas", texto: "Notas fiscais", contagem: lista?.pagination.total },
        { chave: "canais", texto: "Canal e série", contagem: series?.naoMapeadas.length || undefined },
        { chave: "ajustes", texto: "Ajustes manuais" },
        { chave: "declaracao", texto: "Declaração" },
      ].map((item) =>
        ABAS_PENDENTES.has(item.chave) ? { ...item, texto: `${item.texto} · em breve` } : item,
      ),
    [lista?.pagination.total, series?.naoMapeadas.length],
  );

  const empresaAtual = resumo?.empresa ?? empresas.find((e) => e.id === empresaId) ?? null;

  /* ------------------------------ Estados ------------------------------ */

  if (erroEmpresas) {
    return (
      <div className="cz-tarefas mx-auto min-w-0 max-w-[1760px] space-y-4 p-4 sm:p-5">
        <Aviso mensagem={erroEmpresas} />
      </div>
    );
  }

  if (primeiraCarga && (carregandoResumo || !empresaId)) {
    return (
      <div className="cz-tarefas mx-auto min-w-0 max-w-[1760px] space-y-4 p-4 sm:p-5">
        <Carregando texto="Carregando a apuração fiscal" variante="kpi" />
      </div>
    );
  }

  return (
    // `min-w-0` na raiz: a tela é filha do `<main>` do admin, e sem isso a largura
    // mínima do conteúdo vaza para fora da janela.
    <div className="cz-tarefas mx-auto min-w-0 max-w-[1760px] space-y-4 p-4 sm:p-5">
      <Cabecalho
        compacto
        titulo="Faturamento (XML)"
        acoes={
          <>
            <Botao
              variante="secundario"
              icone="Settings"
              tamanho="sm"
              onClick={() => setAba("canais")}
            >
              Séries e canais
            </Botao>
            <Botao
              icone="UploadCloud"
              carregando={importando}
              textoCarregando={
                progresso.total > 0
                  ? `Importando ${progresso.feitos}/${progresso.total}`
                  : "Importando"
              }
              onClick={() => inputArquivos.current?.click()}
            >
              Importar XMLs
            </Botao>
          </>
        }
      />

      {/* O input de verdade. Fora do dropzone para o botão do cabeçalho também
          alcançá-lo, e escondido porque o visual é o painel de arraste. */}
      <input
        ref={inputArquivos}
        type="file"
        accept=".xml,text/xml,application/xml"
        multiple
        hidden
        onChange={(e) => {
          const arquivos = Array.from(e.target.files ?? []);
          if (arquivos.length > 0) void importar(arquivos);
        }}
      />

      {erro && <Aviso mensagem={erro} onFechar={() => setErro("")} />}
      {avisoOk && <Aviso mensagem={avisoOk} tom="ok" onFechar={() => setAvisoOk("")} />}

      {/* ------------------- Contexto: empresa + competência ----------------- */}

      <div className="flex flex-col gap-4 rounded-[14px] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] px-5 py-4 shadow-[var(--cz-elev-1)] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)] ring-1 ring-inset ring-[var(--cz-laranja-borda)]"
          >
            <Icone nome="Landmark" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold leading-tight text-[var(--cz-texto)]">
              {empresaAtual?.razaoSocial ?? "—"}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[var(--cz-texto-suave)]">
              <span className="cz-num">{cnpjFormatado(empresaAtual?.cnpj ?? null)}</span>
              <span aria-hidden="true">·</span>
              <span>
                {REGIME_LABEL[empresaAtual?.regime ?? ""] ?? empresaAtual?.regime ?? "—"}
              </span>
              {resumo?.competencia && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{resumo.competencia.label}</span>
                </>
              )}
              {congelada && (
                <>
                  <span aria-hidden="true">·</span>
                  <Selo tom="alerta">Congelada</Selo>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Largura fixa nos dois campos: sem ela, "Empresa" e "Competência" ficam
            com larguras diferentes porque o conteúdo das opções difere. */}
        <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:w-[26rem]">
          <Escolha
            rotulo="Empresa"
            opcoes={empresas
              .filter((e) => e.cnpj)
              .map((e) => ({ valor: e.id, texto: e.razaoSocial }))}
            value={empresaId}
            onChange={(e) => {
              setEmpresaId(e.target.value);
              // A competência do cliente anterior não existe no novo: limpar faz o
              // servidor escolher a mais recente com documento.
              setCompetencia("");
              setResultado(null);
            }}
          />
          <Escolha
            rotulo="Competência"
            opcoes={resumo?.competenciasDisponiveis ?? []}
            vazio={resumo?.competenciasDisponiveis.length ? undefined : "Sem competência"}
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
          />
        </div>
      </div>

      <Abas abas={abas} ativa={aba} onMudar={(c) => !ABAS_PENDENTES.has(c) && setAba(c)} />

      {/* ------------------------- Relatório da importação ------------------- */}

      {resultado && (
        <Painel
          titulo="Resultado da importação"
          descricao={`${inteiro(resultado.arquivosEnviados)} arquivo(s) enviado(s).`}
          acoes={
            <Botao
              variante="fantasma"
              icone="X"
              tamanho="sm"
              onClick={() => setResultado(null)}
              aria-label="Fechar o resultado da importação"
            />
          }
        >
          <div className="min-w-0 space-y-3 p-4">
            <div className="grid gap-2 sm:grid-cols-5">
              {[
                { rotulo: "Importados", valor: resultado.importados, tom: "text-emerald-700" },
                { rotulo: "Já existiam", valor: resultado.duplicados, tom: "text-[var(--cz-texto-suave)]" },
                { rotulo: "Ignorados", valor: resultado.ignorados, tom: "text-[var(--cz-texto-suave)]" },
                { rotulo: "Com erro", valor: resultado.comErro, tom: "text-red-700" },
                { rotulo: "Não processados", valor: resultado.naoProcessados, tom: "text-sky-700" },
              ].map((item) => (
                <div
                  key={item.rotulo}
                  className="rounded-[10px] border border-[var(--cz-hairline)] bg-[#FCFCFD] px-3 py-2"
                >
                  <p className="text-[11px] uppercase tracking-[0.03em] text-[var(--cz-texto-suave)]">
                    {item.rotulo}
                  </p>
                  <p className={`cz-num text-[17px] font-bold ${item.tom}`}>
                    {inteiro(item.valor)}
                  </p>
                </div>
              ))}
            </div>

            {/* Só o que NÃO foi importado sem ressalva. Listar 366 linhas de
                sucesso enterraria as 5 que precisam de atenção. */}
            {(() => {
              const problemas = resultado.relatorio.filter(
                (linha) => linha.resultado !== "IMPORTADO" || linha.motivo,
              );
              if (problemas.length === 0) {
                return (
                  <p className="flex items-center gap-2 text-[12.5px] text-emerald-800">
                    <Icone nome="CheckCircle2" className="h-4 w-4 shrink-0" />
                    Todos os arquivos entraram e somam no faturamento.
                  </p>
                );
              }
              return (
                <div className="cz-rolagem max-h-64 min-w-0 overflow-y-auto rounded-[10px] border border-[var(--cz-hairline)]">
                  <ul className="divide-y divide-[var(--cz-hairline)]">
                    {problemas.slice(0, 200).map((linha, indice) => {
                      const visual =
                        RESULTADO_VISUAL[linha.resultado] ?? RESULTADO_VISUAL.IGNORADO;
                      return (
                        <li
                          key={`${linha.arquivo}-${indice}`}
                          className="flex items-start gap-2 px-3 py-2"
                        >
                          <Icone
                            nome={visual.icone}
                            className={`mt-px h-3.5 w-3.5 shrink-0 ${visual.tom}`}
                          />
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-medium text-[var(--cz-texto)]">
                              {linha.arquivo}
                            </p>
                            <p className="text-[11.5px] leading-snug text-[var(--cz-texto-suave)]">
                              {visual.rotulo}
                              {linha.motivo ? ` · ${linha.motivo}` : ""}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {problemas.length > 200 && (
                    <p className="border-t border-[var(--cz-hairline)] px-3 py-2 text-[11.5px] text-[var(--cz-texto-suave)]">
                      e mais {inteiro(problemas.length - 200)} arquivo(s).
                    </p>
                  )}
                </div>
              );
            })()}

            {resultado.naoProcessados > 0 && (
              <p className="flex items-start gap-2 text-[12px] leading-snug text-sky-900">
                <Icone nome="Info" className="mt-px h-3.5 w-3.5 shrink-0 text-sky-600" />
                <span>
                  {inteiro(resultado.naoProcessados)} arquivo(s) não couberam nos envios
                  desta rodada. Selecione-os novamente.
                </span>
              </p>
            )}
          </div>
        </Painel>
      )}

      {/* ------------------------------ Cartões ----------------------------- */}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoKpi
          titulo="Apurado pelos XMLs"
          valor={real(apurado)}
          icone="FileSpreadsheet"
          tom="verde"
          detalhe={`${inteiro(resumo?.kpis.notasValidas ?? 0)} notas de venda`}
          carregando={carregandoResumo}
        />
        <CartaoKpi
          titulo="Faturamento declarado"
          valor={real(valorDeclarado)}
          icone="Landmark"
          tom="azul"
          detalhe={origem === "xml" ? "Igual ao apurado" : "Informado manualmente"}
          carregando={carregandoResumo}
        />
        <CartaoKpi
          titulo="Arquivos lidos"
          valor={inteiro(resumo?.kpis.arquivosLidos ?? 0)}
          icone="Files"
          tom="laranja"
          detalhe={`${inteiro(resumo?.kpis.notasValidas ?? 0)} somam · ${inteiro(resumo?.kpis.notasCanceladas ?? 0)} canceladas`}
          carregando={carregandoResumo}
        />
        <CartaoKpi
          titulo="Divergência"
          valor={real(divergencia)}
          icone="AlertTriangle"
          tom={semDivergencia ? "cinza" : "vermelho"}
          detalhe="declarado − apurado"
          carregando={carregandoResumo}
          variacao={
            semDivergencia
              ? undefined
              : { valor: Number(divergenciaPct.toFixed(1)), positivoEhBom: false }
          }
        />
      </div>

      {/* --------------------------- Estado inicial -------------------------- */}

      {resumo?.vazio && !importando && (
        <Painel>
          <div className="p-4">
            <Vazio
              icone="UploadCloud"
              titulo="Nenhum XML importado para esta empresa"
              descricao="Importe os arquivos que o cliente enviou. Reenviar o mesmo arquivo não duplica nada, porque a chave de acesso é única."
              acao={
                <Botao icone="UploadCloud" onClick={() => inputArquivos.current?.click()}>
                  Selecionar arquivos
                </Botao>
              }
            />
          </div>
        </Painel>
      )}

      {/* ---------------------------- Aba: canais --------------------------- */}

      {aba === "canais" && (
        <Painel
          titulo="Canal e série"
          descricao="A NF-e não tem campo de marketplace. O canal vem deste mapa, declarado aqui."
          acoes={
            <Botao
              icone="Save"
              tamanho="sm"
              carregando={salvandoSeries}
              onClick={() => void salvarSeries()}
            >
              Salvar mapa
            </Botao>
          }
        >
          <div className="min-w-0 space-y-4 p-4">
            {series && series.naoMapeadas.length > 0 && (
              <div className="rounded-[12px] border border-amber-200 bg-amber-50/70 px-4 py-3">
                <p className="text-[12.5px] font-bold text-amber-900">
                  {series.naoMapeadas.length} série(s) sem canal
                </p>
                <p className="mt-0.5 text-[12px] leading-snug text-amber-900">
                  Estas séries aparecem nas notas e ninguém declarou o canal. Elas
                  somam no faturamento normalmente, mas ficam fora do resumo por
                  canal.
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {series.naoMapeadas.map((item) => (
                    <li key={item.serie}>
                      <button
                        type="button"
                        onClick={() =>
                          setRascunhoSeries((atual) =>
                            atual.some((s) => s.serie === item.serie)
                              ? atual
                              : [...atual, { serie: item.serie, canal: "ML" }],
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-amber-900 transition-colors hover:bg-amber-100"
                      >
                        <Icone nome="Plus" className="h-3 w-3" />
                        série {item.serie}
                        <span className="cz-num font-normal text-amber-700">
                          ({inteiro(item.notas)} notas)
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {rascunhoSeries.length === 0 ? (
              <Vazio
                icone="Settings"
                titulo="Nenhuma série mapeada"
                descricao="Sem o mapa, todas as notas aparecem como “sem série mapeada”. Não afeta o total do faturamento."
              />
            ) : (
              <ul className="space-y-2">
                {rascunhoSeries.map((item, indice) => (
                  <li
                    key={`${item.serie}-${indice}`}
                    className="grid min-w-0 items-end gap-3 rounded-[12px] border border-[var(--cz-hairline)] bg-[#FCFCFD] p-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto]"
                  >
                    <Entrada
                      rotulo="Série"
                      inputMode="numeric"
                      maxLength={3}
                      value={item.serie}
                      onChange={(e) =>
                        setRascunhoSeries((atual) =>
                          atual.map((s, i) =>
                            i === indice ? { ...s, serie: e.target.value.replace(/\D/g, "") } : s,
                          ),
                        )
                      }
                      className="cz-num"
                    />
                    <Escolha
                      rotulo="Canal"
                      opcoes={series?.canaisDisponiveis ?? []}
                      value={item.canal}
                      onChange={(e) =>
                        setRascunhoSeries((atual) =>
                          atual.map((s, i) => (i === indice ? { ...s, canal: e.target.value } : s)),
                        )
                      }
                    />
                    <Botao
                      variante="fantasma"
                      icone="Trash2"
                      className="mb-px"
                      aria-label={`Remover a série ${item.serie}`}
                      onClick={() =>
                        setRascunhoSeries((atual) => atual.filter((_, i) => i !== indice))
                      }
                    />
                  </li>
                ))}
              </ul>
            )}

            <Botao
              variante="secundario"
              icone="Plus"
              tamanho="sm"
              onClick={() => setRascunhoSeries((atual) => [...atual, { serie: "", canal: "ML" }])}
            >
              Adicionar série
            </Botao>
          </div>
        </Painel>
      )}

      {/* ------------------------------- Corpo ------------------------------ */}

      {aba !== "canais" && !resumo?.vazio && (
        // `min-w-0` nas DUAS colunas: item de grid tem `min-width: auto` e não
        // encolhe abaixo da largura mínima do conteúdo.
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="min-w-0 space-y-4">
            {aba === "geral" && (
              <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                {/* ------------------------ Importar ------------------------- */}
                <Painel titulo="Importar XMLs" descricao="NF-e e NFC-e, arquivos soltos" denso>
                  <div className="min-w-0 space-y-3 p-4">
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setArrastando(true);
                      }}
                      onDragLeave={() => setArrastando(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setArrastando(false);
                        // `dataTransfer.files` é o que a versão anterior descartava:
                        // soltava arquivo, a borda voltava ao normal e nada acontecia.
                        const arquivos = Array.from(e.dataTransfer.files ?? []);
                        if (arquivos.length > 0) void importar(arquivos);
                      }}
                      className={`flex flex-col items-center justify-center rounded-[12px] border border-dashed px-4 py-6 text-center transition-colors ${
                        arrastando
                          ? "border-[var(--cz-laranja)] bg-[var(--cz-laranja-suave)]"
                          : "border-[var(--cz-hairline-forte)] bg-[#FCFCFD]"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="mb-2.5 grid h-12 w-12 place-items-center rounded-full border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] text-[var(--cz-laranja-forte)]"
                      >
                        <Icone nome="UploadCloud" className="h-5 w-5" />
                      </span>
                      <p className="text-[13.5px] font-bold text-[var(--cz-texto)]">
                        {importando
                          ? `Importando ${progresso.feitos} de ${progresso.total}…`
                          : "Arraste os arquivos aqui"}
                      </p>
                      <p className="mt-1 max-w-[19rem] text-[12px] leading-relaxed text-[var(--cz-texto-suave)]">
                        Pode selecionar a pasta inteira. O envio é fatiado em lotes de{" "}
                        {MAX_ARQUIVOS_POR_LOTE}, e reenviar o mesmo arquivo não duplica
                        nada.
                      </p>
                      <div className="mt-3">
                        <Botao
                          variante="secundario"
                          icone="FolderOpen"
                          tamanho="sm"
                          carregando={importando}
                          onClick={() => inputArquivos.current?.click()}
                        >
                          Selecionar arquivos
                        </Botao>
                      </div>
                    </div>

                    <ul className="space-y-1.5">
                      {[
                        "Lê chave, série, número, emissão, CFOP e valor",
                        "Confere as tags contra a chave de acesso e recusa XML alterado",
                        "Casa o CNPJ do emitente com a carteira",
                        "Aplica o cancelamento, que vem em arquivo separado",
                      ].map((texto) => (
                        <li
                          key={texto}
                          className="flex items-start gap-2 text-[12px] leading-snug text-[var(--cz-texto-suave)]"
                        >
                          <Icone
                            nome="CheckCircle2"
                            className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600"
                          />
                          <span>{texto}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Painel>

                {/* ------------------ Faturamento declarado ------------------ */}
                <Painel
                  titulo="Faturamento declarado"
                  descricao="O valor que vai para a apuração e para a declaração de 12 meses."
                  denso
                >
                  <div className="min-w-0 space-y-3 p-4">
                    <div className="rounded-[12px] border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                      <p className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-emerald-900">
                        Apurado pelos XMLs
                      </p>
                      <p className="cz-valor mt-1 text-[22px] leading-none text-emerald-800">
                        {real(apurado)}
                      </p>
                    </div>

                    {congelada ? (
                      <p className="flex items-start gap-2 rounded-[12px] border border-amber-200 bg-amber-50/70 px-3.5 py-3 text-[12px] leading-snug text-amber-900">
                        <Icone
                          nome="Lock"
                          className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600"
                        />
                        <span>
                          Competência congelada: o valor já entrou numa declaração
                          emitida e não muda mais por reapuração. O apurado continua
                          sendo atualizado ao lado, para a divergência ficar visível.
                        </span>
                      </p>
                    ) : (
                      <>
                        <fieldset className="space-y-1.5">
                          <legend className="sr-only">Origem do faturamento declarado</legend>
                          {[
                            { valor: "xml" as const, texto: "Usar o apurado pelos XMLs" },
                            { valor: "manual" as const, texto: "Informar manualmente" },
                          ].map((opcao) => (
                            <label
                              key={opcao.valor}
                              className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-1 py-1 text-[13px] text-[var(--cz-texto)] transition-colors hover:bg-[var(--cz-fundo)]"
                            >
                              <input
                                type="radio"
                                name="origem-faturamento"
                                checked={origem === opcao.valor}
                                onChange={() => setOrigem(opcao.valor)}
                                className="h-4 w-4 accent-[var(--cz-laranja)]"
                              />
                              <span>{opcao.texto}</span>
                            </label>
                          ))}
                        </fieldset>

                        {/* O campo só existe quando é ele que manda: campo editável
                            ao lado de um rádio que o ignora convida a digitar um
                            valor que não será usado. */}
                        {origem === "manual" && (
                          <div className="min-w-0 space-y-3 rounded-[12px] border border-[var(--cz-hairline)] bg-[#FCFCFD] p-3.5">
                            <Entrada
                              rotulo="Valor a declarar"
                              inputMode="decimal"
                              value={declarado}
                              onChange={(e) => setDeclarado(e.target.value)}
                              className="cz-num"
                            />
                            <Area
                              rotulo="Justificativa"
                              rows={3}
                              maxLength={500}
                              value={observacao}
                              onChange={(e) => setObservacao(e.target.value)}
                              placeholder="Receita de serviço em NFS-e, ainda não importada."
                              ajuda={`Obrigatória no valor digitado · ${observacao.length}/500`}
                            />
                            {!semDivergencia && (
                              <p className="flex items-start gap-2 text-[12px] leading-snug text-amber-900">
                                <Icone
                                  nome="AlertTriangle"
                                  className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600"
                                />
                                <span>
                                  Difere do apurado em{" "}
                                  <strong className="cz-num">{real(divergencia)}</strong> (
                                  {divergenciaPct.toFixed(1)}%). Fica registrado com a
                                  justificativa.
                                </span>
                              </p>
                            )}
                          </div>
                        )}

                        <Botao
                          icone="Save"
                          larguraCheia
                          carregando={salvando}
                          disabled={
                            !competencia || (origem === "manual" && !observacao.trim())
                          }
                          title={
                            origem === "manual" && !observacao.trim()
                              ? "Valor manual exige justificativa"
                              : undefined
                          }
                          onClick={() => void salvarFaturamento()}
                        >
                          Salvar faturamento declarado
                        </Botao>
                      </>
                    )}

                    {resumo?.faturamento && (
                      <p className="text-[11.5px] text-[var(--cz-texto-fraco)]">
                        Definido por {resumo.faturamento.definidoPorNome}
                        {resumo.faturamento.apuradoEm
                          ? ` · apurado em ${dataHora(resumo.faturamento.apuradoEm)}`
                          : ""}
                      </p>
                    )}
                  </div>
                </Painel>
              </div>
            )}

            {/* ----------------------- Notas da competência ------------------ */}

            <Painel
              titulo="Notas fiscais da competência"
              descricao={
                resumo
                  ? `${inteiro(resumo.kpis.notasValidas)} somam no faturamento. Canceladas e movimentações aparecem na lista e não entram na soma.`
                  : undefined
              }
            >
              {/* Os campos descem do mesmo `Campo`, então rótulo, altura e raio
                  saem de um lugar só. */}
              <div className="grid min-w-0 items-end gap-3 border-b border-[var(--cz-hairline)] p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <Entrada
                  rotulo="Buscar"
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nº, chave, destinatário ou pedido"
                />
                <Escolha
                  rotulo="Canal"
                  vazio="Todos"
                  opcoes={canais.map((c) => ({ valor: c.chave, texto: c.rotulo }))}
                  value={canalFiltro}
                  onChange={(e) => setCanalFiltro(e.target.value)}
                />
                <Escolha
                  rotulo="Situação"
                  vazio="Todas"
                  opcoes={[
                    { valor: "AUTORIZADA", texto: "Autorizada" },
                    { valor: "CANCELADA", texto: "Cancelada" },
                    { valor: "DENEGADA", texto: "Denegada" },
                  ]}
                  value={situacaoFiltro}
                  onChange={(e) => setSituacaoFiltro(e.target.value)}
                />
                <Escolha
                  rotulo="No faturamento"
                  vazio="Todas"
                  opcoes={[
                    { valor: "sim", texto: "Somam" },
                    { valor: "nao", texto: "Não somam" },
                  ]}
                  value={contaFiltro}
                  onChange={(e) => setContaFiltro(e.target.value)}
                />
                {/* `mb-px` alinha o botão com a BASE dos campos: `items-end` alinha
                    as caixas, e o campo tem um rótulo acima que o botão não tem. */}
                <Botao
                  variante="secundario"
                  icone="RotateCcw"
                  onClick={limparFiltros}
                  disabled={!temFiltro}
                  className="mb-px"
                >
                  Limpar
                </Botao>
              </div>

              {carregandoLista && documentos.length === 0 ? (
                <div className="p-4">
                  <Carregando variante="tabela" texto="Carregando as notas" />
                </div>
              ) : documentos.length === 0 ? (
                <div className="p-4">
                  <Vazio
                    icone="Search"
                    titulo={temFiltro ? "Nenhuma nota com esses filtros" : "Nenhuma nota nesta competência"}
                    descricao={
                      temFiltro
                        ? "Limpe os filtros para ver as notas da competência."
                        : "Importe os XMLs desta competência para ver as notas aqui."
                    }
                    acao={
                      temFiltro ? (
                        <Botao
                          variante="secundario"
                          icone="RotateCcw"
                          tamanho="sm"
                          onClick={limparFiltros}
                        >
                          Limpar filtros
                        </Botao>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                // `min-w-0` no rolador e tabela de SETE colunas: o scroll horizontal
                // fica DENTRO daqui em telas estreitas, em vez de empurrar a página.
                <div className="cz-rolagem min-w-0 overflow-x-auto">
                  <table className="w-full min-w-[44rem] border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-[var(--cz-hairline)] bg-[var(--cz-fundo)] text-left text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--cz-texto-suave)]">
                        <th scope="col" className="px-3 py-2.5">Nota</th>
                        <th scope="col" className="px-3 py-2.5">Canal</th>
                        <th scope="col" className="px-3 py-2.5">Destinatário</th>
                        <th scope="col" className="px-3 py-2.5">Situação</th>
                        <th scope="col" className="px-3 py-2.5 text-right">Valor</th>
                        <th scope="col" className="w-16 px-3 py-2.5 text-right">XML</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--cz-hairline)]">
                      {documentos.map((nota) => {
                        const cancelada = nota.situacao === "CANCELADA";
                        const naoSoma = !nota.contaFaturamento;
                        return (
                          <tr key={nota.id} className="transition-colors hover:bg-[#FCFCFD]">
                            {/* Número, série, data e CFOP na MESMA célula. Eram
                                quatro colunas, e quatro colunas de dado curto é o
                                que fazia a tabela pedir 992px. */}
                            <td className="whitespace-nowrap px-3 py-2.5 align-top">
                              <span className="cz-num font-bold text-[var(--cz-texto)]">
                                {nota.numero}
                              </span>
                              <span className="cz-num text-[11.5px] text-[var(--cz-texto-fraco)]">
                                {" "}/ {nota.serie}
                              </span>
                              <span className="cz-num mt-0.5 block text-[11px] text-[var(--cz-texto-suave)]">
                                {dataCurta(nota.emitidoEm)}
                                {nota.cfop ? ` · CFOP ${nota.cfop}` : ""}
                              </span>
                            </td>

                            <td className="px-3 py-2.5 align-top">
                              <CelulaCanal canal={nota.canal} canais={canais} />
                              {/* O pedido vem do NOME do arquivo e é a única ponte
                                  entre nota e venda de marketplace. */}
                              {nota.pedidoMarketplace && (
                                <span className="cz-num mt-0.5 block text-[11px] text-[var(--cz-texto-fraco)]">
                                  pedido {nota.pedidoMarketplace}
                                </span>
                              )}
                            </td>

                            <td className="min-w-0 max-w-[15rem] px-3 py-2.5 align-top">
                              <span className="block truncate text-[var(--cz-texto)]">
                                {nota.nomeDestinatario ?? "Consumidor final"}
                              </span>
                              <span className="text-[11px] text-[var(--cz-texto-fraco)]">
                                {nota.tipoDocumentoDestinatario ?? "sem documento"}
                              </span>
                            </td>

                            <td className="px-3 py-2.5 align-top">
                              <Selo
                                tom={
                                  cancelada
                                    ? "critico"
                                    : nota.precisaConferencia
                                      ? "alerta"
                                      : naoSoma
                                        ? "neutro"
                                        : "bom"
                                }
                              >
                                {cancelada
                                  ? "Cancelada"
                                  : nota.precisaConferencia
                                    ? "Conferir"
                                    : naoSoma
                                      ? "Não soma"
                                      : "Autorizada"}
                              </Selo>
                              {/* O motivo em prosa vem do servidor: sem ele,
                                  "não soma" obriga a abrir o painel lateral para
                                  descobrir qual das oito razões é. */}
                              {naoSoma && nota.motivoExclusaoLabel && (
                                <span className="mt-0.5 block max-w-[13rem] text-[11px] leading-snug text-[var(--cz-texto-fraco)]">
                                  {nota.motivoExclusaoLabel}
                                </span>
                              )}
                            </td>

                            <td
                              className={`cz-num whitespace-nowrap px-3 py-2.5 text-right align-top font-bold ${
                                naoSoma
                                  ? "text-[var(--cz-texto-fraco)] line-through"
                                  : "text-[var(--cz-texto)]"
                              }`}
                            >
                              {real(nota.valorTotal)}
                            </td>

                            <td className="whitespace-nowrap px-3 py-2.5 text-right align-top">
                              {/* `<a>` e não `Botao` com onClick: download é
                                  navegação, e link deixa "abrir em nova aba" e
                                  "salvar como" funcionarem. */}
                              <a
                                href={`/api/fiscal/xml/${nota.id}`}
                                className="inline-grid size-7 place-items-center rounded-[8px] text-[var(--cz-texto-suave)] transition-colors hover:bg-[var(--cz-fundo)] hover:text-[var(--cz-texto)]"
                                title={`Baixar o XML da nota ${nota.numero}`}
                                aria-label={`Baixar o XML da nota ${nota.numero}`}
                              >
                                <Icone nome="Download" className="h-3.5 w-3.5" />
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {lista && (
                <Paginacao
                  pagina={lista.pagination.page}
                  totalPaginas={lista.pagination.totalPages}
                  total={lista.pagination.total}
                  onMudar={setPagina}
                  rotulo="notas"
                />
              )}
            </Painel>
          </div>

          {/* ------------------------------ Coluna ----------------------------- */}

          <div className="min-w-0 space-y-4">
            <Painel
              titulo="Por canal"
              descricao="O canal vem do mapa série → canal, não do XML."
              denso
              acoes={
                <Botao
                  variante="fantasma"
                  icone="Settings"
                  tamanho="sm"
                  aria-label="Configurar séries e canais"
                  onClick={() => setAba("canais")}
                />
              }
            >
              <div className="min-w-0 space-y-3 p-4">
                {canais.length === 0 ? (
                  <p className="text-[12.5px] text-[var(--cz-texto-suave)]">
                    Nenhuma nota nesta competência.
                  </p>
                ) : (
                  <>
                    <BarraParticipacao canais={canais} total={apurado} />

                    <ul className="divide-y divide-[var(--cz-hairline)] border-t border-[var(--cz-hairline)]">
                      {canais.map((canal) => (
                        <li
                          key={canal.chave}
                          className={`flex items-center gap-3 py-2.5 ${
                            canal.notas === 0 ? "opacity-55" : ""
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <CelulaCanal canal={canal.chave} canais={canais} />
                            <span className="cz-num mt-0.5 block pl-8 text-[11px] text-[var(--cz-texto-fraco)]">
                              {canal.series.length > 0
                                ? `série ${canal.series.join(", ")} · ${inteiro(canal.notas)} notas`
                                : "sem série mapeada"}
                            </span>
                          </div>
                          <span className="cz-num shrink-0 text-[12.5px] font-bold text-[var(--cz-texto)]">
                            {real(canal.valor)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="flex items-center justify-between border-t border-[var(--cz-hairline-forte)] pt-2.5 text-[12.5px] font-bold">
                      <span>Total</span>
                      <span className="cz-num">{real(apurado)}</span>
                    </div>
                  </>
                )}
              </div>
            </Painel>

            {/* O painel que impede "366 de 822" de parecer arquivo perdido. */}
            <Painel
              titulo="Fora do faturamento"
              descricao={
                resumo
                  ? `${inteiro(resumo.kpis.arquivosLidos)} documentos na competência, ${inteiro(resumo.kpis.notasValidas)} somam.`
                  : undefined
              }
              denso
            >
              {(resumo?.foraDoFaturamento.length ?? 0) === 0 ? (
                <p className="px-4 py-3 text-[12.5px] text-[var(--cz-texto-suave)]">
                  Todos os documentos desta competência somam no faturamento.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--cz-hairline)]">
                  {resumo?.foraDoFaturamento.map((item) => (
                    <li key={item.code} className="min-w-0 px-4 py-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 text-[12.5px] font-semibold leading-snug text-[var(--cz-texto)]">
                          {item.rotulo}
                        </span>
                        <span className="cz-num shrink-0 text-[11.5px] text-[var(--cz-texto-suave)]">
                          {inteiro(item.quantos)} · {real(item.valor)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setContaFiltro("nao");
                          setAba("notas");
                        }}
                        className="mt-1 text-[11.5px] font-medium text-[var(--cz-laranja-forte)] underline-offset-2 hover:underline"
                      >
                        ver na lista
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Painel>

            {(resumo?.kpis.precisamConferencia ?? 0) > 0 && (
              <Painel titulo="Precisa de conferência" denso>
                <div className="space-y-2 p-4">
                  <p className="text-[12px] leading-snug text-[var(--cz-texto-suave)]">
                    {inteiro(resumo?.kpis.precisamConferencia ?? 0)} nota(s) têm itens de
                    venda e de movimentação no mesmo documento. Não somam, porque ratear
                    o valor por item seria estimativa apresentada como fato.
                  </p>
                  <Botao
                    variante="secundario"
                    icone="AlertTriangle"
                    tamanho="sm"
                    larguraCheia
                    onClick={() => {
                      setContaFiltro("nao");
                      setAba("notas");
                    }}
                  >
                    Ver as notas
                  </Botao>
                </div>
              </Painel>
            )}

            <Painel titulo="Importações recentes" denso>
              {(resumo?.importacoes.length ?? 0) === 0 ? (
                <p className="px-4 py-3 text-[12.5px] text-[var(--cz-texto-suave)]">
                  Nenhuma importação registrada.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--cz-hairline)]">
                  {resumo?.importacoes.map((item) => (
                    <li key={item.id} className="flex items-start gap-2.5 px-4 py-2.5">
                      <Icone
                        nome={item.comErro > 0 ? "AlertTriangle" : "CheckCircle2"}
                        className={`mt-px h-3.5 w-3.5 shrink-0 ${
                          item.comErro > 0 ? "text-amber-600" : "text-emerald-600"
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-medium leading-snug text-[var(--cz-texto)]">
                          {inteiro(item.importados)} importada(s) de{" "}
                          {inteiro(item.arquivosEnviados)} arquivo(s)
                        </p>
                        <p className="cz-num mt-0.5 text-[11px] text-[var(--cz-texto-fraco)]">
                          {dataHora(item.createdAt)} · {item.importadoPorNome}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Painel>
          </div>
        </div>
      )}
    </div>
  );
}
