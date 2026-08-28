"use client";

/**
 * Lista dos processos pontuais de legalização.
 *
 * Três decisões estruturais desta tela:
 *
 * 1. CARTÃO, não tabela. Os cinco tipos de processo não compartilham os mesmos
 *    campos: abertura pode não ter empresa nem CNPJ, desenquadramento sempre
 *    tem, regularização quase sempre tem protocolo em órgão e alteração
 *    cadastral quase nunca. Uma tabela com cabeçalho fixo ficaria metade vazia
 *    em qualquer filtro.
 *
 * 2. "Só em aberto" LIGADO por padrão. Processo encerrado é arquivo: entra na
 *    lista só quando alguém pede. Sem isso, seis meses de aberturas concluídas
 *    empurram para a segunda página o que precisa de ação hoje.
 *
 * 3. Os KPIs são derivados da PÁGINA CARREGADA, não da base — não existe rota
 *    de resumo para legalização. Por isso cada cartão diz "no filtro atual":
 *    número que parece total da carteira e não é vale menos que número nenhum.
 *
 * Atenção ao contrato: a legalização devolve `itens` + `paginacao.totalPaginas`
 * (a apuração devolve `tarefas` + `pagination.totalPages`) e o prazo vem FLAT,
 * em `situacaoPrazo` / `diasPrazo`.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  apiGet,
  apiPost,
  mensagemDeErro,
  query,
} from "@/app/components/views/ui/tarefas/api";
import type {
  EmpresaLista,
  Pagination,
  Paginacao as PaginacaoLegalizacao,
  ProcessoLista,
  UsuarioInterno,
} from "@/app/components/views/ui/tarefas/tipos";
import {
  dataCurta,
  formatarCnpj,
  iniciais,
  nomeEmpresa,
  plural,
} from "@/app/components/views/ui/tarefas/formato";
import {
  Aviso,
  Cabecalho,
  CartaoKpi,
  Carregando,
  Paginacao,
  Painel,
  Progresso,
  Vazio,
} from "@/app/components/views/ui/tarefas/Base";
import {
  Area,
  Botao,
  Entrada,
  Escolha,
  type Opcao,
} from "@/app/components/views/ui/tarefas/Campos";
import { Modal } from "@/app/components/views/ui/tarefas/Modal";
import {
  SeloBloqueio,
  SeloPrazo,
  SeloRegime,
  SeloStatus,
} from "@/app/components/views/ui/tarefas/Selos";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import { STATUS_LABEL, STATUS_ORDEM } from "@/lib/tarefa-status";
import {
  ORGAO_EXTERNO_LABEL,
  SITUACAO_EMPRESA_LABEL,
  TIPO_PROCESSO,
  TIPO_PROCESSO_LABEL,
} from "@/lib/tarefa-etapas";
import { useSessao } from "@/hooks/useSessao";

/* -------------------------------------------------------------------------- */
/*                            Contratos das rotas                             */
/* -------------------------------------------------------------------------- */

type RespostaLista = {
  itens: ProcessoLista[];
  paginacao: PaginacaoLegalizacao;
};
type RespostaEmpresas = { empresas: EmpresaLista[]; pagination: Pagination };
type RespostaUsuarios = { usuarios: UsuarioInterno[]; total: number };

/** POST devolve objeto FLAT, sem wrapper `processo`. */
type RespostaCriacao = {
  id: string;
  tipo: string;
  status: string;
  etapaAtual: number;
  etapasTotal: number;
  etapaAtualTitulo: string | null;
  identificacaoProvisoria: string | null;
  empresaId: string | null;
  abertoEm: string;
};

/* -------------------------------------------------------------------------- */
/*                                  Domínio                                   */
/* -------------------------------------------------------------------------- */

const TIPOS_VALIDOS = Object.values(TIPO_PROCESSO) as string[];

const OPCOES_TIPO: Opcao[] = TIPOS_VALIDOS.map((valor) => ({
  valor,
  texto: TIPO_PROCESSO_LABEL[valor] ?? valor,
}));

const OPCOES_STATUS: Opcao[] = STATUS_ORDEM.map((valor) => ({
  valor,
  texto: STATUS_LABEL[valor] ?? valor,
}));

/** Ícone por tipo de processo. Todos existem no mapa do kit. */
const ICONE_TIPO: Record<string, string> = {
  ABERTURA_CNPJ: "Building2",
  ENCERRAMENTO_CNPJ: "Lock",
  REGULARIZACAO_CNPJ: "ShieldCheck",
  ALTERACAO_CADASTRAL: "Pencil",
  DESENQUADRAMENTO: "TrendingUp",
};

function iconeDoTipo(tipo: string): string {
  return ICONE_TIPO[tipo] ?? "FileText";
}

/* -------------------------------------------------------------------------- */
/*                                  Filtros                                   */
/* -------------------------------------------------------------------------- */

type Filtros = {
  tipo: string;
  status: string;
  responsavelId: string;
  /** Só em aberto: padrão LIGADO. Encerrado é arquivo. */
  abertos: boolean;
  bloqueada: boolean;
  busca: string;
};

function filtrosPadrao(): Filtros {
  return {
    tipo: "",
    status: "",
    responsavelId: "",
    abertos: true,
    bloqueada: false,
    busca: "",
  };
}

/**
 * Lê os filtros da URL descartando valor inválido.
 *
 * `tipo=QUALQUERCOISA` num link colado à mão viraria 400 `tipo_invalido`, e a
 * tela mostraria erro de servidor no lugar da lista.
 *
 * `abertos` não precisa de sentinela: o padrão é ligado, então só o literal
 * "false" na URL desliga. Assim "ver também os encerrados" sobrevive ao
 * recarregar sem sujar o endereço no caso comum.
 */
function lerFiltros(params: URLSearchParams | null): Filtros {
  const padrao = filtrosPadrao();
  if (!params) return padrao;

  const tipo = params.get("tipo") ?? "";
  const status = params.get("status") ?? "";

  return {
    tipo: TIPOS_VALIDOS.includes(tipo) ? tipo : "",
    status: STATUS_ORDEM.includes(status) ? status : "",
    responsavelId: params.get("responsavelId") ?? "",
    abertos: params.get("abertos") !== "false",
    bloqueada: params.get("bloqueada") === "true",
    busca: params.get("busca") ?? "",
  };
}

/** Algum filtro fora do padrão? Decide se o botão "Limpar" aparece. */
function temFiltro(filtros: Filtros): boolean {
  return (
    !!filtros.tipo ||
    !!filtros.status ||
    !!filtros.responsavelId ||
    !filtros.abertos ||
    filtros.bloqueada ||
    !!filtros.busca.trim()
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
export default function LegalizacaoListaView() {
  return (
    <Suspense
      fallback={
        <div className="cz-tarefas mx-auto max-w-7xl space-y-6 p-6">
          <Carregando texto="Carregando processos de legalização" />
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

  // A URL vale só na montagem: daí em diante o estado manda e a URL é espelho.
  // Ler a URL a cada render criaria laço com o `router.replace`.
  const [filtros, setFiltros] = useState<Filtros>(() => lerFiltros(params));
  const [textoBusca, setTextoBusca] = useState(filtros.busca);
  const [pagina, setPagina] = useState(1);

  const [itens, setItens] = useState<ProcessoLista[]>([]);
  const [paginacao, setPaginacao] = useState<PaginacaoLegalizacao>({
    page: 1,
    limit: 20,
    total: 0,
    totalPaginas: 0,
  });
  const [carregando, setCarregando] = useState(true);
  const [primeiraCarga, setPrimeiraCarga] = useState(true);
  const [erro, setErro] = useState("");
  const [recarga, setRecarga] = useState(0);

  const [usuarios, setUsuarios] = useState<UsuarioInterno[]>([]);

  /* --------------------------- Filtros e a URL ---------------------------- */

  const alterar = useCallback((mudanca: Partial<Filtros>) => {
    setFiltros((atual) => ({ ...atual, ...mudanca }));
  }, []);

  const limpar = useCallback(() => {
    setFiltros(filtrosPadrao());
    setTextoBusca("");
  }, []);

  // Debounce da busca: sem ele cada tecla vira uma requisição.
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
        tipo: filtros.tipo,
        status: filtros.status,
        responsavelId: filtros.responsavelId,
        // Só grava na URL quando desligado, porque ligado é o padrão.
        abertos: filtros.abertos ? "" : "false",
        bloqueada: filtros.bloqueada ? "true" : "",
        busca: filtros.busca.trim(),
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

    const url = `/api/tarefas/legalizacao${query({
      tipo: filtros.tipo,
      status: filtros.status,
      responsavelId: filtros.responsavelId,
      abertos: filtros.abertos ? "true" : "",
      bloqueada: filtros.bloqueada ? "true" : "",
      busca: filtros.busca.trim(),
      page: pagina,
      limit: 20,
    })}`;

    apiGet<RespostaLista>(url, controlador.signal)
      .then((dados) => {
        if (!vivo) return;
        setItens(dados.itens ?? []);
        setPaginacao(
          dados.paginacao ?? {
            page: pagina,
            limit: 20,
            total: dados.itens?.length ?? 0,
            totalPaginas: 0,
          }
        );
      })
      .catch((falha) => {
        if (!vivo) return;
        const mensagem = mensagemDeErro(falha);
        if (!mensagem) return; // Abortado: outra busca já está em curso.
        setErro(mensagem);
        setItens([]);
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
  }, [filtros, pagina, recarga]);

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

  /* --------------------------------- KPIs --------------------------------- */

  const kpis = useMemo(() => {
    let emAberto = 0;
    let comPendencia = 0;
    let atrasados = 0;
    let concluidos = 0;

    for (const item of itens) {
      if (item.concluidoEm) concluidos += 1;
      else emAberto += 1;
      if (item.bloqueada) comPendencia += 1;
      if (item.situacaoPrazo === "ATRASADO") atrasados += 1;
    }

    return { emAberto, comPendencia, atrasados, concluidos };
  }, [itens]);

  /**
   * Rodapé dos KPIs.
   *
   * A rota pagina em 20 por página e não existe endpoint de resumo, então o
   * número dos cartões é da PÁGINA. Dizer isso na cara evita a leitura errada
   * de que são totais da carteira.
   */
  const escopoKpi = useMemo(() => {
    if (paginacao.total > itens.length) {
      return `nos ${itens.length} desta página`;
    }
    return temFiltro(filtros) ? "no filtro atual" : "em toda a lista";
  }, [filtros, itens.length, paginacao.total]);

  /* ---------------------------- Novo processo ---------------------------- */

  const [modalNovo, setModalNovo] = useState(false);
  const [empresas, setEmpresas] = useState<EmpresaLista[]>([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(false);
  const [novo, setNovo] = useState({
    tipo: "",
    empresaId: "",
    identificacaoProvisoria: "",
    prazoEstimado: "",
    responsavelId: "",
    observacoes: "",
  });
  const [erroNovo, setErroNovo] = useState("");
  const [campoInvalido, setCampoInvalido] = useState("");
  const [enviandoNovo, setEnviandoNovo] = useState(false);

  const abrirNovo = useCallback(() => {
    setNovo({
      tipo: "",
      empresaId: "",
      identificacaoProvisoria: "",
      prazoEstimado: "",
      responsavelId: "",
      observacoes: "",
    });
    setErroNovo("");
    setCampoInvalido("");
    setModalNovo(true);
  }, []);

  // Empresas só entram quando o modal abre: são 200 registros que a lista não usa.
  useEffect(() => {
    if (!modalNovo || empresas.length > 0) return;

    const controlador = new AbortController();
    setCarregandoEmpresas(true);
    apiGet<RespostaEmpresas>(
      `/api/empresas${query({ situacao: "ATIVA", limit: 200 })}`,
      controlador.signal
    )
      .then((dados) => setEmpresas(dados.empresas ?? []))
      .catch((falha) => {
        const mensagem = mensagemDeErro(falha);
        if (mensagem) setErroNovo(mensagem);
      })
      .finally(() => setCarregandoEmpresas(false));

    return () => controlador.abort();
  }, [modalNovo, empresas.length]);

  const opcoesEmpresa = useMemo<Opcao[]>(
    () =>
      empresas.map((e) => ({
        valor: e.id,
        texto: `${e.razaoSocial} · ${e.cnpjFormatado}`,
      })),
    [empresas]
  );

  /**
   * REGRA DE FORMULÁRIO — abertura de CNPJ é o caso especial.
   *
   * Em ABERTURA_CNPJ o CNPJ ainda não existe, então não há empresa para
   * escolher: o processo nasce com uma identificação provisória e ganha a
   * empresa depois, pela tela de detalhe. Nos outros quatro tipos a empresa é
   * obrigatória, porque o processo altera um cadastro que já existe.
   */
  const ehAbertura = novo.tipo === TIPO_PROCESSO.ABERTURA_CNPJ;

  async function criarProcesso() {
    setErroNovo("");
    setCampoInvalido("");

    if (!novo.tipo) {
      setCampoInvalido("tipo");
      setErroNovo("Escolha o tipo de processo.");
      return;
    }

    const identificacao = novo.identificacaoProvisoria.trim();

    if (ehAbertura) {
      if (!novo.empresaId && !identificacao) {
        setCampoInvalido("identificacaoProvisoria");
        setErroNovo(
          "Em abertura de CNPJ, escolha a empresa já cadastrada ou informe a identificação provisória. Uma das duas precisa existir para o processo ter nome na lista."
        );
        return;
      }
    } else if (!novo.empresaId) {
      setCampoInvalido("empresaId");
      setErroNovo(
        `Escolha a empresa. ${
          TIPO_PROCESSO_LABEL[novo.tipo] ?? "Este tipo"
        } altera um cadastro que já existe, então a empresa é obrigatória.`
      );
      return;
    }

    setEnviandoNovo(true);
    try {
      const criado = await apiPost<RespostaCriacao>("/api/tarefas/legalizacao", {
        tipo: novo.tipo,
        empresaId: novo.empresaId || undefined,
        // Identificação provisória só faz sentido em abertura.
        identificacaoProvisoria: ehAbertura ? identificacao || undefined : undefined,
        prazoEstimado: novo.prazoEstimado || undefined,
        responsavelId: novo.responsavelId || undefined,
        observacoes: novo.observacoes.trim() || undefined,
      });

      setModalNovo(false);
      // A resposta é flat e sem derivados. Em vez de montar um cartão pela
      // metade, vou direto para o detalhe, que carrega o processo completo.
      router.push(`/admin/tarefas/legalizacao/${criado.id}`);
    } catch (falha) {
      setErroNovo(mensagemDeErro(falha) || "Não foi possível abrir o processo.");
    } finally {
      setEnviandoNovo(false);
    }
  }

  /* -------------------------------- Render ------------------------------- */

  const filtroAtivo = temFiltro(filtros);

  const resumoFiltro = useMemo(() => {
    const partes: string[] = [];
    if (filtros.tipo) {
      partes.push(TIPO_PROCESSO_LABEL[filtros.tipo] ?? filtros.tipo);
    }
    if (filtros.status) {
      partes.push(STATUS_LABEL[filtros.status] ?? filtros.status);
    }
    if (filtros.responsavelId) {
      const achado = usuarios.find((u) => u.id === filtros.responsavelId);
      partes.push(`responsável ${achado?.rotulo ?? "selecionado"}`);
    }
    partes.push(
      filtros.abertos ? "somente em aberto" : "incluindo os encerrados"
    );
    if (filtros.bloqueada) partes.push("somente com pendência aberta");
    if (filtros.busca.trim()) partes.push(`busca "${filtros.busca.trim()}"`);
    return partes.join(" · ");
  }, [filtros, usuarios]);

  const descricaoCabecalho = `${plural(
    paginacao.total,
    "processo encontrado",
    "processos encontrados"
  )} · ${kpis.emAberto} em aberto nesta página`;

  return (
    <div className="cz-tarefas mx-auto max-w-7xl space-y-6 p-6">
      <Cabecalho
        titulo="Legalização"
        icone="Landmark"
        descricao={descricaoCabecalho}
        acoes={
          permissoes.criarProcesso ? (
            <Botao icone="Plus" onClick={abrirNovo}>
              Novo processo
            </Botao>
          ) : undefined
        }
      />

      {/* -------------------------------- KPIs ------------------------------ */}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoKpi
          titulo="Em aberto"
          valor={kpis.emAberto}
          icone="Loader"
          tom="laranja"
          detalhe={`Processos não encerrados ${escopoKpi}`}
        />
        <CartaoKpi
          titulo="Com pendência"
          valor={kpis.comPendencia}
          icone="AlertTriangle"
          tom="ambar"
          detalhe={`Travados esperando alguém ${escopoKpi}`}
        />
        <CartaoKpi
          titulo="Atrasados"
          valor={kpis.atrasados}
          icone="AlarmClock"
          tom="vermelho"
          detalhe={`Prazo estimado já vencido ${escopoKpi}`}
        />
        <CartaoKpi
          titulo="Concluídos"
          valor={kpis.concluidos}
          icone="CheckCircle2"
          tom="verde"
          detalhe={
            filtros.abertos
              ? "Desligue “Só em aberto” para contar os encerrados"
              : `Processos encerrados ${escopoKpi}`
          }
        />
      </div>

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
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <Escolha
            rotulo="Tipo de processo"
            vazio="Todos os tipos"
            opcoes={OPCOES_TIPO}
            value={filtros.tipo}
            onChange={(e) => alterar({ tipo: e.target.value })}
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
          <Entrada
            rotulo="Buscar"
            type="search"
            placeholder="Razão social, fantasia, identificação ou protocolo"
            value={textoBusca}
            onChange={(e) => setTextoBusca(e.target.value)}
            ajuda="Busca também na identificação provisória"
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-gray-100 px-5 py-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={filtros.abertos}
              onChange={(e) => alterar({ abertos: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            />
            Só em aberto
          </label>

          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={filtros.bloqueada}
              onChange={(e) => alterar({ bloqueada: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            />
            Só com pendência
          </label>

          <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-gray-500">
            <Icone nome="Filter" className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate" title={resumoFiltro}>
              Filtrando por {resumoFiltro}
            </span>
          </p>
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
        <Carregando texto="Carregando processos de legalização" />
      ) : itens.length === 0 && !erro ? (
        filtroAtivo ? (
          <Vazio
            icone="Filter"
            titulo="Nenhum processo encontrado com os filtros atuais."
            descricao="Os filtros aplicados não retornaram nenhum processo. Lembre que “Só em aberto” esconde os já encerrados."
            acao={
              <Botao variante="secundario" icone="X" onClick={limpar}>
                Limpar filtros
              </Botao>
            }
          />
        ) : (
          <Vazio
            icone="Landmark"
            titulo="Nenhum processo de legalização cadastrado."
            descricao="Abertura, encerramento, regularização, alteração cadastral e desenquadramento entram por aqui e passam a ser acompanhados por etapa."
            acao={
              permissoes.criarProcesso ? (
                <Botao icone="Plus" onClick={abrirNovo}>
                  Novo processo
                </Botao>
              ) : undefined
            }
          />
        )
      ) : (
        <div className="space-y-3">
          {carregando && (
            <p className="flex items-center gap-2 text-xs text-gray-500">
              <Icone nome="RefreshCw" className="h-3.5 w-3.5 animate-spin" />
              Atualizando a lista
            </p>
          )}

          <ul className="space-y-3">
            {itens.map((item) => (
              <li key={item.id}>
                <CartaoProcesso item={item} />
              </li>
            ))}
          </ul>

          {/* Sufixo `!`, não prefixo: no Tailwind v4 o modificador important
              mudou de lugar e `!shadow-none` não gera classe nenhuma. */}
          <Painel className="shadow-none!">
            <Paginacao
              pagina={paginacao.page}
              totalPaginas={paginacao.totalPaginas}
              total={paginacao.total}
              onMudar={setPagina}
              rotulo="processos"
            />
          </Painel>
        </div>
      )}

      {/* --------------------------- Novo processo -------------------------- */}

      <Modal
        aberto={modalNovo}
        titulo="Novo processo de legalização"
        descricao="O fluxo de etapas é montado a partir do tipo escolhido e fica congelado no processo."
        icone="Landmark"
        largura="lg"
        onFechar={() => setModalNovo(false)}
        rodape={
          <>
            <Botao
              variante="secundario"
              onClick={() => setModalNovo(false)}
              disabled={enviandoNovo}
            >
              Cancelar
            </Botao>
            <Botao
              icone="Plus"
              onClick={criarProcesso}
              carregando={enviandoNovo}
              textoCarregando="Abrindo"
            >
              Abrir processo
            </Botao>
          </>
        }
      >
        <div className="space-y-4">
          {erroNovo && <Aviso mensagem={erroNovo} />}

          <Escolha
            rotulo="Tipo de processo"
            required
            vazio="Selecione o tipo"
            opcoes={OPCOES_TIPO}
            value={novo.tipo}
            erro={campoInvalido === "tipo" ? "Campo obrigatório." : null}
            onChange={(e) =>
              setNovo((atual) => ({ ...atual, tipo: e.target.value }))
            }
            ajuda="Define as etapas do processo e não pode ser alterado depois."
          />

          <Escolha
            rotulo="Empresa"
            required={!!novo.tipo && !ehAbertura}
            vazio={
              ehAbertura
                ? "Sem empresa (CNPJ ainda não existe)"
                : "Selecione a empresa"
            }
            opcoes={opcoesEmpresa}
            value={novo.empresaId}
            erro={campoInvalido === "empresaId" ? "Campo obrigatório." : null}
            disabled={carregandoEmpresas}
            onChange={(e) =>
              setNovo((atual) => ({ ...atual, empresaId: e.target.value }))
            }
            ajuda={
              carregandoEmpresas
                ? "Carregando empresas ativas"
                : ehAbertura
                ? "Opcional em abertura de CNPJ: a empresa pode ser vinculada depois, na tela do processo."
                : "Obrigatória: este tipo de processo altera um cadastro que já existe."
            }
          />

          {/* Só aparece em abertura: nos outros tipos não há o que identificar
              provisoriamente, porque a empresa já está no cadastro. */}
          {ehAbertura && (
            <Entrada
              rotulo="Identificação provisória"
              required={!novo.empresaId}
              value={novo.identificacaoProvisoria}
              erro={
                campoInvalido === "identificacaoProvisoria"
                  ? "Informe a identificação provisória ou escolha uma empresa."
                  : null
              }
              onChange={(e) =>
                setNovo((atual) => ({
                  ...atual,
                  identificacaoProvisoria: e.target.value,
                }))
              }
              placeholder="Padaria do Gianluca — matriz"
              ajuda="Nome do cliente ou do projeto, para acompanhar antes de o CNPJ existir."
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Entrada
              rotulo="Prazo estimado"
              type="date"
              value={novo.prazoEstimado}
              onChange={(e) =>
                setNovo((atual) => ({ ...atual, prazoEstimado: e.target.value }))
              }
              ajuda="Opcional. Alimenta o alerta de atraso."
            />
            <Escolha
              rotulo="Responsável"
              vazio="Sem responsável definido"
              opcoes={opcoesResponsavel}
              value={novo.responsavelId}
              onChange={(e) =>
                setNovo((atual) => ({ ...atual, responsavelId: e.target.value }))
              }
              ajuda="Opcional. Pode ser trocado depois."
            />
          </div>

          <Area
            rotulo="Observações"
            rows={3}
            value={novo.observacoes}
            onChange={(e) =>
              setNovo((atual) => ({ ...atual, observacoes: e.target.value }))
            }
            placeholder="Contexto que o escritório precisa saber para começar"
            ajuda="Opcional."
          />
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Cartão                                    */
/* -------------------------------------------------------------------------- */

function CartaoProcesso({ item }: { item: ProcessoLista }) {
  const encerrado = !!item.concluidoEm;

  /**
   * Título do cartão.
   *
   * Abertura sem empresa não tem razão social nem CNPJ — o CNPJ é justamente o
   * que o processo vai produzir. Nesse caso o nome é a identificação
   * provisória, com rótulo explícito para ninguém procurar o cadastro que
   * ainda não existe.
   */
  const semEmpresa = !item.empresa;
  const nome = item.empresa
    ? nomeEmpresa(item.empresa)
    : item.identificacaoProvisoria?.trim() || "Sem identificação";

  return (
    <Link
      href={`/admin/tarefas/legalizacao/${item.id}`}
      className={`block rounded-xl border p-5 shadow-sm transition-colors ${
        encerrado
          ? "border-gray-200 bg-gray-50 hover:border-gray-300"
          : "border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50/30"
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          {/* Tipo em destaque: é o que muda o significado de todo o resto. */}
          <p className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                encerrado
                  ? "bg-gray-200 text-gray-500"
                  : "bg-orange-100 text-orange-600"
              }`}
            >
              <Icone nome={iconeDoTipo(item.tipo)} className="h-4 w-4" />
            </span>
            {item.tipoLabel || TIPO_PROCESSO_LABEL[item.tipo] || item.tipo}
          </p>

          <div className="min-w-0">
            {semEmpresa && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-[#175CD3]">
                <Icone nome="Building2" className="h-3.5 w-3.5" />
                Empresa em abertura
              </p>
            )}
            <p className="truncate text-base font-semibold text-gray-900">
              {nome}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              {item.empresa && <span>{formatarCnpj(item.empresa.cnpj)}</span>}
              {item.empresa && (
                <span>
                  {SITUACAO_EMPRESA_LABEL[item.empresa.situacao] ??
                    item.empresa.situacao}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SeloStatus status={item.status} curto />
            <SeloPrazo situacao={item.situacaoPrazo} dias={item.diasPrazo} />
            {item.bloqueada && (
              <SeloBloqueio
                responsavel={item.bloqueioResponsavel}
                dias={
                  item.bloqueioDesde
                    ? Math.max(
                        0,
                        Math.round(
                          (Date.now() - new Date(item.bloqueioDesde).getTime()) /
                            86_400_000
                        )
                      )
                    : null
                }
              />
            )}
            {item.empresa && <SeloRegime regime={item.empresa.regime} />}
            {encerrado && (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-600">
                <Icone nome="ClipboardCheck" className="h-3.5 w-3.5" />
                Encerrado em {dataCurta(item.concluidoEm)}
              </span>
            )}
          </div>

          {item.bloqueada && item.bloqueioMotivo && (
            <p className="truncate text-xs text-[#B54708]" title={item.bloqueioMotivo}>
              {item.bloqueioMotivo}
            </p>
          )}
        </div>

        {/* Coluna da direita: onde o processo está e há quanto tempo. */}
        <div className="w-full shrink-0 space-y-2 lg:w-72">
          <div>
            <p className="flex items-center justify-between gap-2 text-xs font-medium text-gray-500">
              <span>
                Etapa {item.etapaAtual} de {item.etapasTotal}
              </span>
              <span>
                {item.etapasResolvidas}/{item.etapasTotal} resolvidas
              </span>
            </p>
            <p className="mt-0.5 truncate text-sm font-medium text-gray-900">
              {item.etapaAtualTitulo ?? "Etapa não identificada"}
            </p>
            <Progresso
              feito={item.etapasResolvidas}
              total={item.etapasTotal}
              className="mt-2"
            />
          </div>

          {item.protocoloExterno && (
            <p className="flex items-center gap-1.5 text-xs text-gray-600">
              <Icone nome="Landmark" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {item.protocoloExterno}
                {item.orgaoExterno
                  ? ` · ${ORGAO_EXTERNO_LABEL[item.orgaoExterno] ?? item.orgaoExterno}`
                  : ""}
              </span>
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <Icone nome="Clock" className="h-3.5 w-3.5" />
              {item.diasEmAberto === null || item.diasEmAberto === undefined
                ? `aberto em ${dataCurta(item.abertoEm)}`
                : `aberto há ${plural(item.diasEmAberto, "dia", "dias")}`}
            </span>

            {item.responsavel ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[10px] font-bold text-white">
                  {iniciais(item.responsavel.name ?? item.responsavel.email)}
                </span>
                <span className="truncate">
                  {item.responsavel.name ?? item.responsavel.email}
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-gray-400">
                <Icone nome="User" className="h-3.5 w-3.5" />
                Sem responsável
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
