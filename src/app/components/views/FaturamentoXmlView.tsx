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
  apiPost,
  apiPut,
  apiUpload,
  mensagemDeErro,
  query,
} from "@/app/components/views/ui/tarefas/api";
import { extrairXmlsDoZip } from "@/lib/fiscal-zip";
import DeclaracaoFaturamentoPanel from "@/app/components/views/fiscal/DeclaracaoFaturamentoPanel";
import { useSessao } from "@/hooks/useSessao";
import { PAPEL } from "@/lib/papeis";

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
  eventosAplicados?: number;
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
  semDocumentos?: boolean;
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
  sessaoId: string;
  arquivosEnviados: number;
  importados: number;
  duplicados: number;
  ignorados: number;
  eventosAplicados: number;
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

/**
 * Valor pt-BR estrito. Inválido vira `null`, NUNCA zero.
 *
 * A versão anterior devolvia zero para vazio, letras e sinal incompleto; com uma
 * justificativa preenchida, erro de digitação conseguia zerar o mês.
 */
function paraNumero(texto: string): number | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  const formato = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/;
  if (!formato.test(limpo)) return null;
  const n = Number(limpo.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
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
/** 4 MiB de folga para boundary/cabeçalhos sob o teto Traefik de 32 MiB. */
const MAX_BYTES_POR_LOTE = 28 * 1024 * 1024;

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
  EVENTO_PENDENTE: { icone: "Clock", tom: "text-amber-600", rotulo: "Evento pendente" },
  EVENTO_ARQUIVADO: { icone: "FileCheck2", tom: "text-sky-600", rotulo: "Evento arquivado" },
  DUPLICADO: { icone: "Copy", tom: "text-[var(--cz-texto-fraco)]", rotulo: "Já existia" },
  IGNORADO: { icone: "MinusCircle", tom: "text-[var(--cz-texto-suave)]", rotulo: "Ignorado" },
  ERRO: { icone: "AlertTriangle", tom: "text-red-600", rotulo: "Erro" },
  NAO_PROCESSADO: { icone: "Clock", tom: "text-sky-600", rotulo: "Não processado" },
};

/* -------------------------------------------------------------------------- */
/*                                   Abas                                     */
/* -------------------------------------------------------------------------- */

/** Abas que ainda não têm conteúdo. Dizem no rótulo, e o clique não finge navegar. */
const ABAS_PENDENTES = new Set<string>();

/* -------------------------------------------------------------------------- */
/*                                   Tela                                     */
/* -------------------------------------------------------------------------- */

export default function FaturamentoXmlView() {
  const { papel, permissoes } = useSessao();
  const podeImportar =
    papel === PAPEL.ADMIN ||
    papel === PAPEL.CONTABIL ||
    papel === PAPEL.CONTABIL_ASSISTENTE;
  const podeDefinirFaturamento = permissoes.alterarRegime;

  /* ----------------------------- Empresas ------------------------------- */
  const [empresas, setEmpresas] = useState<EmpresaResumo[]>([]);
  const [empresaId, setEmpresaId] = useState("");
  const [erroEmpresas, setErroEmpresas] = useState("");

  /* ---------------------------- Competência ----------------------------- */
  const [competencia, setCompetencia] = useState("");

  /* ------------------------------ Resumo -------------------------------- */
  const [resumo, setResumo] = useState<Resumo | null>(null);
  /** Chave empresa|competência da resposta; impede salvar rascunho do mês anterior. */
  const [resumoCarregadoPara, setResumoCarregadoPara] = useState("");
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
  const [motivoFiltro, setMotivoFiltro] = useState("");
  const [somenteConferencia, setSomenteConferencia] = useState(false);

  /* ------------------------------ Aba ----------------------------------- */
  const [aba, setAba] = useState("geral");

  /* --------------------------- Importação ------------------------------- */
  const inputArquivos = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [etapaImportacao, setEtapaImportacao] = useState("");
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const [resultado, setResultado] = useState<ResumoImportacao | null>(null);

  /* -------------------------- Valor declarado --------------------------- */
  const [origem, setOrigem] = useState<"xml" | "manual">("xml");
  const [declarado, setDeclarado] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [motivoRevisao, setMotivoRevisao] = useState("");
  const [avisoOk, setAvisoOk] = useState("");

  /* ----------------------------- Séries -------------------------------- */
  const [series, setSeries] = useState<SeriesResposta | null>(null);
  const [seriesCarregadasPara, setSeriesCarregadasPara] = useState("");
  const [erroSeries, setErroSeries] = useState("");
  const [carregandoSeries, setCarregandoSeries] = useState(false);
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
    setResumoCarregadoPara("");
    setResumo(null);
    setErro("");

    apiGet<Resumo>(
      `/api/fiscal/faturamento${query({ empresaId, competencia })}`,
      controlador.signal,
    )
      .then((dados) => {
        if (!vivo) return;
        setResumo(dados);
        setResumoCarregadoPara(
          `${dados.empresa.id}|${dados.competencia?.chave ?? competencia}`,
        );

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
        setResumoCarregadoPara("");
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
    setLista(null);

    apiGet<ListaDocumentos>(
      `/api/fiscal/xml${query({
        empresaId,
        competencia,
        canal: canalFiltro,
        situacao: situacaoFiltro,
        conta: contaFiltro,
        motivoExclusao: motivoFiltro,
        conferencia: somenteConferencia ? "sim" : "",
        busca: buscaAplicada,
        page: pagina,
        limit: 50,
      })}`,
      controlador.signal,
    )
      .then((dados) => {
        if (!vivo) return;
        if (dados.pagination.page > dados.pagination.totalPages) {
          setPagina(Math.max(1, dados.pagination.totalPages));
          return;
        }
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
  }, [empresaId, competencia, canalFiltro, situacaoFiltro, contaFiltro, motivoFiltro, somenteConferencia, buscaAplicada, pagina, recarga]);

  /* ----------------------------- Carrega séries ------------------------- */

  useEffect(() => {
    if (!empresaId) return;

    const controlador = new AbortController();
    let vivo = true;
    setCarregandoSeries(true);
    setErroSeries("");
    setSeriesCarregadasPara("");
    setSeries(null);
    setRascunhoSeries([]);

    apiGet<SeriesResposta>(`/api/fiscal/series${query({ empresaId })}`, controlador.signal)
      .then((dados) => {
        if (!vivo) return;
        setSeries(dados);
        setRascunhoSeries(dados.series.map((s) => ({ serie: s.serie, canal: s.canal })));
        setSeriesCarregadasPara(empresaId);
      })
      .catch((falha) => {
        if (!vivo) return;
        const mensagem = mensagemDeErro(falha);
        if (mensagem) setErroSeries(mensagem);
      })
      .finally(() => {
        if (vivo) setCarregandoSeries(false);
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
  }, [empresaId, competencia, canalFiltro, situacaoFiltro, contaFiltro, motivoFiltro, somenteConferencia, buscaAplicada]);

  /* ---------------------------- Importação ----------------------------- */

  const importar = useCallback(
    async (selecionados: File[]) => {
      // O dropzone continua recebendo eventos enquanto um ZIP está abrindo. Sem
      // esta trava, dois drops iniciam dois loops paralelos e disputam progresso,
      // resultado e reapuração — justamente a concorrência que o envio em série
      // existe para evitar.
      if (importando) return;
      if (!podeImportar) {
        setErro("Seu perfil pode consultar a apuração, mas não importar arquivos.");
        return;
      }
      if (!empresaId) {
        setErro("Selecione a empresa antes de importar.");
        return;
      }

      const aceitos = selecionados.filter((arquivo) => {
        const nome = arquivo.name.toLowerCase();
        return nome.endsWith(".xml") || nome.endsWith(".zip");
      });
      const recusados = selecionados.filter((arquivo) => !aceitos.includes(arquivo));

      if (aceitos.length === 0) {
        setErro("Selecione arquivos .xml ou .zip de nota fiscal.");
        return;
      }

      setImportando(true);
      setErro("");
      setAvisoOk("");
      setResultado(null);

      let totalDescoberto = aceitos.filter((arquivo) =>
        arquivo.name.toLowerCase().endsWith(".xml"),
      ).length;
      let enviados = 0;
      setProgresso({ feitos: 0, total: totalDescoberto });

      /*
       * Envio em lotes, em SÉRIE.
       *
       * Em série e não em paralelo: os lotes disputariam a mesma competência na
       * reapuração, e uma agregação antiga poderia terminar depois da nova.
       *
       * ZIP é aberto NO NAVEGADOR e liberado um de cada vez. O maior real tem
       * 3.139 XMLs; mandar o ZIP ao servidor faria `req.formData()` carregar o
       * corpo compactado e depois a rota manter a expansão inteira na heap. Aqui
       * o servidor vê no máximo 300 XMLs por multipart.
       */
      const sessaoId = crypto.randomUUID();
      const acumulado: ResumoImportacao = {
        importacaoId: "",
        sessaoId,
        arquivosEnviados: 0,
        importados: 0,
        duplicados: 0,
        ignorados: 0,
        eventosAplicados: 0,
        comErro: recusados.length,
        naoProcessados: 0,
        situacao: "CONCLUIDA",
        relatorio: recusados.map((arquivo) => ({
          arquivo: arquivo.name,
          resultado: "ERRO",
          chave: null,
          motivo: "Tipo ignorado. Use somente .xml ou .zip.",
          code: "TIPO_NAO_ACEITO",
        })),
      };

      const fila: File[] = [];
      const origemPorArquivo = new Map<File, string>();

      const acumular = (parcial: ResumoImportacao) => {
        acumulado.importacaoId = parcial.importacaoId;
        acumulado.sessaoId = parcial.sessaoId;
        acumulado.arquivosEnviados += parcial.arquivosEnviados;
        acumulado.importados += parcial.importados;
        acumulado.duplicados += parcial.duplicados;
        acumulado.ignorados += parcial.ignorados;
        acumulado.eventosAplicados += parcial.eventosAplicados;
        acumulado.comErro += parcial.comErro;
        acumulado.naoProcessados += parcial.naoProcessados;
        acumulado.relatorio.push(...parcial.relatorio);
      };

      const enviarLote = async (lote: File[], ultimoLote: boolean) => {
        setEtapaImportacao(
          `Enviando ${Math.min(enviados + 1, totalDescoberto)}–${Math.min(enviados + lote.length, totalDescoberto)} de ${totalDescoberto}…`,
        );
        const formulario = new FormData();
        formulario.append("empresaId", empresaId);
        formulario.append("sessaoId", sessaoId);
        formulario.append("ultimoLote", ultimoLote ? "1" : "0");
        for (const arquivo of lote) {
          formulario.append("arquivos", arquivo);
          formulario.append("origens", origemPorArquivo.get(arquivo) ?? arquivo.name);
        }

        const parcial = await apiUpload<ResumoImportacao>(
          "/api/fiscal/xml/importar",
          formulario,
        );
        acumular(parcial);
        for (const arquivo of lote) origemPorArquivo.delete(arquivo);
        enviados += lote.length;
        setProgresso({ feitos: enviados, total: totalDescoberto });
      };

      const esvaziarFila = async (forcar = false) => {
        // Retém um lote candidato até saber que existe outro arquivo. O corte usa
        // quantidade E bytes: 300 XMLs de 1 MiB não podem virar multipart de
        // 300 MiB contra o teto de 32 MiB do proxy.
        while (fila.length > 0) {
          let quantidade = 0;
          let bytes = 0;
          while (quantidade < fila.length && quantidade < MAX_ARQUIVOS_POR_LOTE) {
            const proximo = fila[quantidade];
            if (quantidade > 0 && bytes + proximo.size > MAX_BYTES_POR_LOTE) break;
            bytes += proximo.size;
            quantidade += 1;
          }

          // Tudo que está na fila cabe num lote; sem `forcar`, retém para que o
          // próximo arquivo prove que este não era o último.
          if (!forcar && quantidade === fila.length) return;

          const ultimoLote = forcar && quantidade === fila.length;
          const lote = fila.splice(0, quantidade);
          await enviarLote(lote, ultimoLote);
        }
      };

      try {
        setEtapaImportacao("Iniciando sessão de importação…");
        const iniciada = await apiPost<{ importacaoId: string }>(
          "/api/fiscal/xml/importar/iniciar",
          { empresaId, sessaoId },
        );
        acumulado.importacaoId = iniciada.importacaoId;

        for (const origem of aceitos) {
          if (origem.name.toLowerCase().endsWith(".xml")) {
            fila.push(origem);
            origemPorArquivo.set(origem, origem.name);
            await esvaziarFila();
            continue;
          }

          setEtapaImportacao(`Abrindo ${origem.name}…`);
          const conteudoZip = new Uint8Array(await origem.arrayBuffer());
          const extraidos = await extrairXmlsDoZip(conteudoZip, origem.name);

          totalDescoberto += extraidos.length;
          setProgresso({ feitos: enviados, total: totalDescoberto });

          for (const extraido of extraidos) {
            // Cópia própria: o buffer do descompressor pode ser reutilizado depois
            // que o ZIP atual sair do escopo. O nome-base preserva o order_id que
            // Shopee/ML colocam no nome do XML.
            const copia = Uint8Array.from(extraido.bytes);
            const arquivoExtraido = new File([copia], extraido.nome, {
              type: "application/xml",
              lastModified: origem.lastModified,
            });
            fila.push(arquivoExtraido);
            origemPorArquivo.set(arquivoExtraido, extraido.origem);
            await esvaziarFila();
          }
          // Remove as referências aos buffers descompactados antes de abrir o
          // próximo ZIP. O maior real tem milhares de entradas; depender apenas
          // de o GC perceber o fim do escopo acumulou vários ZIPs na bateria.
          extraidos.length = 0;
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }

        await esvaziarFila(true);
        setResultado(acumulado);
        recarregar();
      } catch (falha) {
        const mensagem = mensagemDeErro(falha);
        if (mensagem) setErro(mensagem);
        // Se a falha aconteceu no navegador (ZIP inválido, aba ficou sem memória,
        // rede caiu antes do último lote), encerra a sessão pai para não bloquear
        // uma declaração por duas horas. Se o servidor já marcou FALHA, é no-op.
        await apiPost("/api/fiscal/xml/importar/finalizar", {
          empresaId,
          sessaoId,
        }).catch(() => {});
        // O que entrou nos lotes anteriores continua gravado. Recarrega para a
        // tela refletir a verdade em vez de parecer que nada aconteceu.
        if (
          acumulado.importados > 0 ||
          acumulado.duplicados > 0 ||
          acumulado.ignorados > 0
        ) {
          setResultado(acumulado);
          recarregar();
        }
      } finally {
        setImportando(false);
        setEtapaImportacao("");
        if (inputArquivos.current) inputArquivos.current.value = "";
      }
    },
    [empresaId, importando, podeImportar],
  );

  /* ------------------------ Salvar valor declarado --------------------- */

  const salvarFaturamento = useCallback(async () => {
    const contextoAtual = `${empresaId}|${competencia}`;
    if (
      !empresaId ||
      !competencia ||
      carregandoResumo ||
      resumoCarregadoPara !== contextoAtual
    ) {
      setErro("Aguarde o carregamento da empresa e da competência selecionadas.");
      return;
    }

    const valorManual = origem === "manual" ? paraNumero(declarado) : null;
    if (origem === "manual" && valorManual === null) {
      setErro("Informe o valor em reais, usando vírgula para os centavos.");
      return;
    }

    setSalvando(true);
    setErro("");
    setAvisoOk("");

    try {
      await apiPut("/api/fiscal/faturamento", {
        empresaId,
        competencia,
        origem: origem === "xml" ? "XML" : "MANUAL",
        valor: origem === "xml" ? (resumo?.kpis.apurado ?? 0) : valorManual,
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
  }, [carregandoResumo, competencia, declarado, empresaId, observacao, origem, resumo, resumoCarregadoPara]);

  const prepararRevisao = useCallback(async () => {
    if (!empresaId || !competencia || motivoRevisao.trim().length < 10) return;
    setRevisando(true);
    setErro("");
    setAvisoOk("");
    try {
      await apiPost("/api/fiscal/faturamento/revisar", {
        empresaId,
        competencia,
        motivo: motivoRevisao.trim(),
      });
      setMotivoRevisao("");
      setAvisoOk(
        "Competência liberada para revisão. A declaração antiga continua preservada; emita outra depois da correção.",
      );
      recarregar();
    } catch (falha) {
      const mensagem = mensagemDeErro(falha);
      if (mensagem) setErro(mensagem);
    } finally {
      setRevisando(false);
    }
  }, [competencia, empresaId, motivoRevisao]);

  /* ---------------------------- Salvar séries -------------------------- */

  const salvarSeries = useCallback(async () => {
    if (
      !empresaId ||
      carregandoSeries ||
      seriesCarregadasPara !== empresaId
    ) {
      setErro("Aguarde o mapa de séries da empresa selecionada carregar.");
      return;
    }

    if (rascunhoSeries.some((item) => !item.serie || !item.canal)) {
      setErro("Preencha a série e escolha o canal em todas as linhas.");
      return;
    }
    const chaves = rascunhoSeries.map((item) => item.serie);
    if (new Set(chaves).size !== chaves.length) {
      setErro("A mesma série não pode aparecer duas vezes.");
      return;
    }

    setSalvandoSeries(true);
    setErro("");
    setAvisoOk("");

    try {
      await apiPut("/api/fiscal/series", {
        empresaId,
        series: rascunhoSeries,
      });
      setAvisoOk("Mapa de séries salvo. O canal das notas foi recalculado.");
      recarregar();
    } catch (falha) {
      const mensagem = mensagemDeErro(falha);
      if (mensagem) setErro(mensagem);
    } finally {
      setSalvandoSeries(false);
    }
  }, [carregandoSeries, empresaId, rascunhoSeries, seriesCarregadasPara]);

  /* ------------------------------ Derivados ---------------------------- */

  const apurado = resumo?.kpis.apurado ?? 0;
  const congelada = Boolean(resumo?.faturamento?.congeladoEm);
  const valorManualDigitado = paraNumero(declarado);
  // Em competência congelada, o valor que vale é o snapshot persistido. Usar o
  // apurado atual esconderia exatamente a divergência causada por XML tardio.
  const valorDeclarado =
    congelada && resumo?.faturamento
      ? resumo.faturamento.valor
      : origem === "xml"
        ? apurado
        : (valorManualDigitado ?? 0);
  const divergencia = valorDeclarado - apurado;
  const divergenciaPct = apurado > 0 ? (divergencia / apurado) * 100 : null;
  const semDivergencia = Math.abs(divergencia) < 0.01;
  const contextoPronto =
    Boolean(empresaId && competencia) &&
    resumoCarregadoPara === `${empresaId}|${competencia}` &&
    !carregandoResumo;

  const temFiltro = Boolean(
    busca || canalFiltro || situacaoFiltro || contaFiltro || motivoFiltro || somenteConferencia,
  );
  const limparFiltros = () => {
    setBusca("");
    setCanalFiltro("");
    setSituacaoFiltro("");
    setContaFiltro("");
    setMotivoFiltro("");
    setSomenteConferencia(false);
  };

  const documentos = lista?.documentos ?? [];
  const canais = resumo?.canais ?? [];

  const abas = useMemo(
    () =>
      [
        { chave: "geral", texto: "Apuração do mês", contagem: lista?.pagination.total },
        { chave: "canais", texto: "Séries e canais", contagem: series?.naoMapeadas.length || undefined },
        { chave: "declaracao", texto: "Declaração de 12 meses" },
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
              disabled={!empresaId || !podeImportar}
              textoCarregando={
                etapaImportacao ||
                (progresso.total > 0
                  ? `Importando ${progresso.feitos}/${progresso.total}`
                  : "Importando")
              }
              onClick={() => inputArquivos.current?.click()}
            >
              Importar XML/ZIP
            </Botao>
          </>
        }
      />

      {/* O input de verdade. Fora do dropzone para o botão do cabeçalho também
          alcançá-lo, e escondido porque o visual é o painel de arraste. */}
      <input
        ref={inputArquivos}
        type="file"
        accept=".xml,.zip,text/xml,application/xml,application/zip,application/x-zip-compressed"
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

        {/* Empresa seleciona o CNPJ que o upload ACEITA. Competência é input
            mensal, não select fechado: mês sem XML precisa existir para o valor
            manual e para a declaração de 12 meses. */}
        <div className="grid shrink-0 gap-3 sm:grid-cols-[minmax(14rem,1fr)_10rem] lg:w-[31rem]">
          <Escolha
            rotulo="Empresa"
            opcoes={empresas
              .filter((e) => e.cnpj)
              .map((e) => ({ valor: e.id, texto: e.razaoSocial }))}
            value={empresaId}
            onChange={(e) => {
              setEmpresaId(e.target.value);
              setCompetencia("");
              setResumo(null);
              setResumoCarregadoPara("");
              setLista(null);
              setSeries(null);
              setSeriesCarregadasPara("");
              setRascunhoSeries([]);
              setResultado(null);
              setOrigem("xml");
              setDeclarado("");
              setObservacao("");
              setMotivoRevisao("");
            }}
          />
          <Entrada
            rotulo="Competência"
            type="month"
            value={competencia}
            onChange={(e) => {
              setCompetencia(e.target.value);
              setResumo(null);
              setResumoCarregadoPara("");
              setLista(null);
              setOrigem("xml");
              setDeclarado("");
              setObservacao("");
              setMotivoRevisao("");
            }}
            ajuda="Aceita mês sem XML"
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
                <div className="min-w-0 rounded-[10px] border border-[var(--cz-hairline)]">
                  <ul className="divide-y divide-[var(--cz-hairline)]">
                    {problemas.slice(0, 30).map((linha, indice) => {
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
                  {problemas.length > 30 && (
                    <p className="border-t border-[var(--cz-hairline)] px-3 py-2 text-[11.5px] text-[var(--cz-texto-suave)]">
                      e mais {inteiro(problemas.length - 30)} arquivo(s). O resumo completo fica salvo na importação.
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
              : divergenciaPct === null
                ? undefined
                : { valor: Number(divergenciaPct.toFixed(1)), positivoEhBom: false }
          }
        />
      </div>

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
              disabled={
                !podeDefinirFaturamento ||
                carregandoSeries ||
                seriesCarregadasPara !== empresaId ||
                rascunhoSeries.some((item) => !item.serie || !item.canal)
              }
              onClick={() => void salvarSeries()}
            >
              Salvar mapa
            </Botao>
          }
        >
          <div className="min-w-0 space-y-4 p-4">
            {erroSeries && <Aviso mensagem={erroSeries} onFechar={() => setErroSeries("")} />}
            {carregandoSeries && <Carregando texto="Carregando o mapa de séries" />}
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
                              : [...atual, { serie: item.serie, canal: "" }],
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
                      vazio="Selecione o canal"
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
              onClick={() => setRascunhoSeries((atual) => [...atual, { serie: "", canal: "" }])}
            >
              Adicionar série
            </Botao>
          </div>
        </Painel>
      )}

      {/* ----------------------- Aba: declaração 12 meses ------------------- */}

      {aba === "declaracao" && empresaId && (
        <DeclaracaoFaturamentoPanel
          empresaId={empresaId}
          competenciaReferencia={competencia}
          onAbrirMes={(mes) => {
            setCompetencia(mes);
            setResumo(null);
            setResumoCarregadoPara("");
            setLista(null);
            setOrigem("xml");
            setDeclarado("");
            setObservacao("");
            setAba("geral");
          }}
        />
      )}

      {/* ------------------------------- Corpo ------------------------------ */}

      {aba === "geral" && (
        // Uma coluna: a tabela fica com a largura inteira. A lateral fixa de
        // 23rem fazia a tabela rolar horizontalmente até em notebook com sidebar
        // aberta. Os resumos viram grade abaixo, onde podem respirar.
        <div className="grid min-w-0 gap-4">
          <div className="min-w-0 space-y-4">
            {aba === "geral" && (
              <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                {/* ------------------------ Importar ------------------------- */}
                <Painel titulo="Importar XMLs ou ZIPs" descricao="NF-e e NFC-e, soltos ou compactados" denso>
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
                          ? etapaImportacao || `Importando ${progresso.feitos} de ${progresso.total}…`
                          : "Arraste XMLs ou ZIPs aqui"}
                      </p>
                      <p className="mt-1 max-w-[19rem] text-[12px] leading-relaxed text-[var(--cz-texto-suave)]">
                        XMLs soltos ou ZIPs inteiros. Cada ZIP é aberto no seu
                        navegador e enviado em lotes de até {MAX_ARQUIVOS_POR_LOTE} e
                        28 MB; reenviar não duplica nada.
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
                      <div className="space-y-3">
                        <p className="flex items-start gap-2 rounded-[12px] border border-amber-200 bg-amber-50/70 px-3.5 py-3 text-[12px] leading-snug text-amber-900">
                          <Icone
                            nome="Lock"
                            className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600"
                          />
                          <span>
                            Competência congelada: o valor já entrou numa declaração.
                            XML tardio atualiza apenas o apurado e deixa a divergência
                            visível. Para corrigir, registre o motivo, revise o mês e
                            emita uma nova declaração; a anterior não é apagada.
                          </span>
                        </p>
                        <Area
                          rotulo="Motivo da revisão"
                          rows={2}
                          maxLength={500}
                          value={motivoRevisao}
                          onChange={(event) => setMotivoRevisao(event.target.value)}
                          placeholder="Ex.: XML de venda recebido após a emissão da declaração."
                          ajuda={`${motivoRevisao.length}/500 · mínimo 10 caracteres`}
                        />
                        <Botao
                          variante="secundario"
                          icone="Unlock"
                          larguraCheia
                          carregando={revisando}
                          disabled={
                            !podeDefinirFaturamento ||
                            motivoRevisao.trim().length < 10
                          }
                          onClick={() => void prepararRevisao()}
                        >
                          Liberar mês para revisão
                        </Botao>
                      </div>
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
                              erro={
                                declarado.trim() && valorManualDigitado === null
                                  ? "Use o formato 62.514,16"
                                  : undefined
                              }
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
                                  {divergenciaPct === null ? "não aplicável" : `${divergenciaPct.toFixed(1)}%`}). Fica registrado com a
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
                            !podeDefinirFaturamento ||
                            !contextoPronto ||
                            (origem === "manual" &&
                              (!observacao.trim() || valorManualDigitado === null))
                          }
                          title={
                            !podeDefinirFaturamento
                              ? "Somente administrador ou contabilidade pode definir o faturamento"
                              : !contextoPronto
                              ? "Aguarde a empresa e a competência carregarem"
                              : origem === "manual" && !observacao.trim()
                                ? "Valor manual exige justificativa"
                                : origem === "manual" && valorManualDigitado === null
                                  ? "Informe um valor válido"
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

              {(motivoFiltro || somenteConferencia) && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--cz-hairline)] bg-amber-50/60 px-4 py-2 text-[12px] text-amber-900">
                  <span className="flex items-center gap-1.5">
                    <Icone nome="Filter" className="h-3.5 w-3.5" />
                    {somenteConferencia
                      ? "Mostrando somente notas que precisam de conferência"
                      : `Mostrando o motivo ${motivoFiltro.replaceAll("_", " ").toLowerCase()}`}
                  </span>
                  <button
                    type="button"
                    className="font-semibold underline-offset-2 hover:underline"
                    onClick={() => {
                      setMotivoFiltro("");
                      setSomenteConferencia(false);
                    }}
                  >
                    remover este filtro
                  </button>
                </div>
              )}

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

          {/* Resumos abaixo da tabela, em grade. Não apertam mais a apuração. */}

          <div className="grid min-w-0 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                      {!["ARQUIVO_EVENTO", "MODELO_NAO_APURADO"].includes(item.code) ? (
                        <button
                          type="button"
                          onClick={() => {
                            setContaFiltro("nao");
                            setMotivoFiltro(item.code);
                            setSomenteConferencia(false);
                            setAba("geral");
                          }}
                          className="mt-1 text-[11.5px] font-medium text-[var(--cz-laranja-forte)] underline-offset-2 hover:underline"
                        >
                          ver na lista
                        </button>
                      ) : (
                        <span className="mt-1 block text-[11px] text-[var(--cz-texto-fraco)]">
                          Arquivado separadamente; não é NF-e/NFC-e.
                        </span>
                      )}
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
                      setMotivoFiltro("");
                      setSomenteConferencia(true);
                      setAba("geral");
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
