"use client";

/**
 * Lista de empresas — a base do módulo de tarefas.
 *
 * A empresa é o que gera competência todo mês: o regime dela escolhe o fluxo de
 * etapas da apuração, e a situação decide se ela entra ou não na abertura
 * automática do mês. Por isso esta tela mostra regime e situação em destaque, e
 * não como campo secundário de cadastro.
 *
 * Três decisões estruturais:
 *
 * 1. Os filtros vivem na URL. `router.replace` a cada mudança, leitura da URL
 *    só na montagem. Assim o link filtrado pode ser colado no chat do
 *    escritório ("as encerradas do Simples") e abre igual do outro lado.
 *
 * 2. Os KPIs são CONTADOS NA PÁGINA CARREGADA, não no banco. Não existe rota de
 *    resumo de empresas, e inventar quatro requisições de contagem a cada tecla
 *    da busca custaria mais do que a informação vale. Quando a página não cobre
 *    o total filtrado, a tela DIZ isso em vez de deixar o operador somar quatro
 *    números que não fecham com o total.
 *
 * 3. O CNPJ é mascarado na digitação e enviado só com dígitos. O banco guarda 14
 *    dígitos (`@db.VarChar(14)`); enviar formatado quebraria a unicidade — o
 *    mesmo CNPJ com e sem ponto viraria duas empresas.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  ErroApi,
  apiGet,
  apiPost,
  mensagemDeErro,
  query,
} from "@/app/components/views/ui/tarefas/api";
import type {
  EmpresaLista,
  Pagination,
  UsuarioInterno,
} from "@/app/components/views/ui/tarefas/tipos";
import { dataCurta, plural } from "@/app/components/views/ui/tarefas/formato";
import {
  Aviso,
  Cabecalho,
  CartaoKpi,
  Carregando,
  Paginacao,
  Painel,
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
  SeloRegime,
  SeloSituacaoEmpresa,
} from "@/app/components/views/ui/tarefas/Selos";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import {
  REGIME,
  REGIME_LABEL,
  SITUACAO_EMPRESA,
  SITUACAO_EMPRESA_LABEL,
  TRIBUTO_LOCAL,
  TRIBUTO_LOCAL_LABEL,
} from "@/lib/tarefa-etapas";
import { useSessao } from "@/hooks/useSessao";

/* -------------------------------------------------------------------------- */
/*                            Contratos das rotas                             */
/* -------------------------------------------------------------------------- */

type RespostaLista = { empresas: EmpresaLista[]; pagination: Pagination };
type RespostaUsuarios = { usuarios: UsuarioInterno[]; total: number };
type RespostaCriacao = { empresa: EmpresaLista };

/**
 * `GET /api/admin/users` devolve array PLANO, não objeto com wrapper — e exige
 * papel ADMIN. Os dois detalhes estão tratados no carregamento.
 */
type UsuarioAdmin = {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  createdAt: string;
};

/* -------------------------------------------------------------------------- */
/*                            Domínio e constantes                            */
/* -------------------------------------------------------------------------- */

const LIMITE = 50;

const REGIMES = Object.values(REGIME) as string[];
const SITUACOES = Object.values(SITUACAO_EMPRESA) as string[];
const TRIBUTOS = Object.values(TRIBUTO_LOCAL) as string[];

const OPCOES_REGIME: Opcao[] = REGIMES.map((valor) => ({
  valor,
  texto: REGIME_LABEL[valor] ?? valor,
}));

const OPCOES_SITUACAO: Opcao[] = SITUACOES.map((valor) => ({
  valor,
  texto: SITUACAO_EMPRESA_LABEL[valor] ?? valor,
}));

const OPCOES_TRIBUTO: Opcao[] = TRIBUTOS.map((valor) => ({
  valor,
  texto: TRIBUTO_LOCAL_LABEL[valor] ?? valor,
}));

/** Cada KPI é uma situação. Ordem de leitura: o que trabalha primeiro. */
const KPIS: { situacao: string; titulo: string; icone: string; tom: "verde" | "azul" | "ambar" | "cinza" }[] = [
  { situacao: SITUACAO_EMPRESA.ATIVA, titulo: "Ativas", icone: "CheckCircle2", tom: "verde" },
  { situacao: SITUACAO_EMPRESA.EM_ABERTURA, titulo: "Em abertura", icone: "Hourglass", tom: "azul" },
  { situacao: SITUACAO_EMPRESA.SUSPENSA, titulo: "Suspensas", icone: "AlertTriangle", tom: "ambar" },
  { situacao: SITUACAO_EMPRESA.ENCERRADA, titulo: "Encerradas", icone: "Ban", tom: "cinza" },
];

/* -------------------------------------------------------------------------- */
/*                                  Filtros                                   */
/* -------------------------------------------------------------------------- */

type Filtros = { regime: string; situacao: string; busca: string };

const FILTROS_VAZIOS: Filtros = { regime: "", situacao: "", busca: "" };

/**
 * Lê os filtros da URL descartando valor inválido.
 *
 * A rota devolve 400 para `regime=QUALQUERCOISA`, e um link colado à mão viraria
 * faixa de erro no lugar da lista. Filtrar aqui transforma link torto em lista
 * completa, que é o comportamento menos surpreendente.
 */
function lerFiltros(params: URLSearchParams | null): Filtros {
  if (!params) return FILTROS_VAZIOS;
  const regime = params.get("regime") ?? "";
  const situacao = params.get("situacao") ?? "";
  return {
    regime: REGIMES.includes(regime) ? regime : "",
    situacao: SITUACOES.includes(situacao) ? situacao : "",
    busca: params.get("busca") ?? "",
  };
}

function temFiltro(filtros: Filtros): boolean {
  return !!filtros.regime || !!filtros.situacao || !!filtros.busca.trim();
}

/* -------------------------------------------------------------------------- */
/*                                   CNPJ                                     */
/* -------------------------------------------------------------------------- */

/** Máscara progressiva 00.000.000/0000-00. Só para os olhos: o envio é digitado. */
function mascaraCnpj(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  }
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(
    8,
    12
  )}-${d.slice(12)}`;
}

const digitosDe = (valor: string) => valor.replace(/\D/g, "");

/* -------------------------------------------------------------------------- */
/*                              Formulário novo                               */
/* -------------------------------------------------------------------------- */

type Formulario = {
  cnpj: string;
  razaoSocial: string;
  regime: string;
  nomeFantasia: string;
  situacao: string;
  tributoLocal: string;
  uf: string;
  municipio: string;
  inicioAtividade: string;
  responsavelId: string;
  userId: string;
  observacoes: string;
};

function formularioVazio(): Formulario {
  return {
    cnpj: "",
    razaoSocial: "",
    regime: "",
    nomeFantasia: "",
    situacao: SITUACAO_EMPRESA.ATIVA,
    tributoLocal: TRIBUTO_LOCAL.AMBOS,
    uf: "",
    municipio: "",
    inicioAtividade: "",
    responsavelId: "",
    userId: "",
    observacoes: "",
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Wrapper                                   */
/* -------------------------------------------------------------------------- */

/**
 * `useSearchParams` exige um limite de Suspense acima, senão o build acusa a
 * rota como não pré-renderizável. Fica aqui para a página seguir sendo server
 * component simples.
 */
export default function EmpresasListaView() {
  return (
    <Suspense
      fallback={
        <div className="cz-tarefas mx-auto max-w-7xl space-y-6 p-6">
          <Carregando texto="Carregando empresas" />
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

  // A URL vale na montagem; daí em diante o estado manda e a URL é espelho.
  // Ler a URL a cada render criaria laço com o `router.replace`.
  const [filtros, setFiltros] = useState<Filtros>(() => lerFiltros(params));
  const [textoBusca, setTextoBusca] = useState(filtros.busca);
  const [pagina, setPagina] = useState(1);

  const [empresas, setEmpresas] = useState<EmpresaLista[]>([]);
  const [paginacao, setPaginacao] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: LIMITE,
    totalPages: 1,
  });
  const [carregando, setCarregando] = useState(true);
  const [primeiraCarga, setPrimeiraCarga] = useState(true);
  const [erro, setErro] = useState("");
  const [recarga, setRecarga] = useState(0);

  /* --------------------------- Filtros e a URL ---------------------------- */

  const alterar = useCallback((mudanca: Partial<Filtros>) => {
    setFiltros((atual) => ({ ...atual, ...mudanca }));
  }, []);

  const limpar = useCallback(() => {
    setFiltros(FILTROS_VAZIOS);
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
        regime: filtros.regime,
        situacao: filtros.situacao,
        busca: filtros.busca.trim(),
      }),
    [filtros]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.search === consulta) return;
    router.replace(`${pathname}${consulta}`, { scroll: false });
  }, [consulta, pathname, router]);

  // Filtro novo volta para a primeira página.
  useEffect(() => {
    setPagina(1);
  }, [consulta]);

  /* -------------------------------- Busca --------------------------------- */

  useEffect(() => {
    const controlador = new AbortController();
    let vivo = true;

    setCarregando(true);
    setErro("");

    const url = `/api/empresas${query({
      regime: filtros.regime,
      situacao: filtros.situacao,
      busca: filtros.busca.trim(),
      page: pagina,
      limit: LIMITE,
    })}`;

    apiGet<RespostaLista>(url, controlador.signal)
      .then((dados) => {
        if (!vivo) return;
        setEmpresas(dados.empresas ?? []);
        setPaginacao(
          dados.pagination ?? {
            total: dados.empresas?.length ?? 0,
            page: pagina,
            limit: LIMITE,
            totalPages: 1,
          }
        );
      })
      .catch((falha) => {
        if (!vivo) return;
        const mensagem = mensagemDeErro(falha);
        if (!mensagem) return; // Abortado: já existe outra busca em curso.
        setErro(mensagem);
        setEmpresas([]);
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

  /* --------------------------------- KPIs --------------------------------- */

  const contagem = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const situacao of SITUACOES) mapa[situacao] = 0;
    for (const empresa of empresas) {
      mapa[empresa.situacao] = (mapa[empresa.situacao] ?? 0) + 1;
    }
    return mapa;
  }, [empresas]);

  // Só quando a página cobre o total filtrado os números fecham com o total.
  const kpiParcial = paginacao.total > empresas.length;

  const resumoFiltro = useMemo(() => {
    const partes: string[] = [];
    if (filtros.regime) {
      partes.push(REGIME_LABEL[filtros.regime] ?? filtros.regime);
    }
    if (filtros.situacao) {
      partes.push(SITUACAO_EMPRESA_LABEL[filtros.situacao] ?? filtros.situacao);
    }
    if (filtros.busca.trim()) partes.push(`busca "${filtros.busca.trim()}"`);
    return partes.length > 0 ? partes.join(" · ") : "toda a carteira";
  }, [filtros]);

  /* ----------------------------- Nova empresa ----------------------------- */

  const [modalNova, setModalNova] = useState(false);
  const [form, setForm] = useState<Formulario>(formularioVazio);
  const [erroForm, setErroForm] = useState("");
  const [campoInvalido, setCampoInvalido] = useState<string | null>(null);
  const [duplicadaId, setDuplicadaId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [internos, setInternos] = useState<UsuarioInterno[]>([]);
  const [clientes, setClientes] = useState<UsuarioAdmin[]>([]);
  /**
   * `/api/admin/users` é a única fonte do login do cliente e devolve 403 para
   * quem não é ADMIN. Comercial cadastra empresa mas não vê essa lista, então o
   * campo desaparece com explicação em vez de virar select vazio ou erro.
   */
  const [semAcessoClientes, setSemAcessoClientes] = useState(false);

  const editar = useCallback((mudanca: Partial<Formulario>) => {
    setForm((atual) => ({ ...atual, ...mudanca }));
    setCampoInvalido(null);
  }, []);

  const abrirNova = useCallback(() => {
    setForm(formularioVazio());
    setErroForm("");
    setCampoInvalido(null);
    setDuplicadaId(null);
    setModalNova(true);
  }, []);

  // Pessoas são carregadas só quando o modal abre: a lista não usa nada disso.
  useEffect(() => {
    if (!modalNova) return;

    const controlador = new AbortController();

    if (internos.length === 0) {
      apiGet<RespostaUsuarios>(
        "/api/usuarios-internos",
        controlador.signal
      )
        .then((dados) => setInternos(dados.usuarios ?? []))
        .catch(() => {
          // Select de responsável fica sem opções; o campo é opcional.
        });
    }

    if (clientes.length === 0 && !semAcessoClientes) {
      apiGet<UsuarioAdmin[]>("/api/admin/users", controlador.signal)
        .then((dados) => setClientes(Array.isArray(dados) ? dados : []))
        .catch((falha) => {
          if (falha instanceof ErroApi && falha.status === 403) {
            setSemAcessoClientes(true);
            return;
          }
          // Qualquer outra falha também esconde o campo: melhor do que oferecer
          // um select que não tem como ser preenchido.
          if (mensagemDeErro(falha)) setSemAcessoClientes(true);
        });
    }

    return () => controlador.abort();
  }, [modalNova, internos.length, clientes.length, semAcessoClientes]);

  const opcoesResponsavel = useMemo<Opcao[]>(
    () => internos.map((u) => ({ valor: u.id, texto: u.rotulo })),
    [internos]
  );

  const opcoesCliente = useMemo<Opcao[]>(
    () =>
      clientes.map((u) => ({
        valor: u.id,
        texto: u.name?.trim() ? `${u.name} · ${u.email}` : u.email,
      })),
    [clientes]
  );

  const erroDe = (campo: string) =>
    campoInvalido === campo ? erroForm || "Campo inválido." : null;

  async function cadastrar() {
    setErroForm("");
    setCampoInvalido(null);
    setDuplicadaId(null);

    const digitos = digitosDe(form.cnpj);
    if (digitos.length !== 14) {
      setCampoInvalido("cnpj");
      setErroForm("Informe os 14 dígitos do CNPJ.");
      return;
    }
    if (form.razaoSocial.trim().length < 2) {
      setCampoInvalido("razaoSocial");
      setErroForm("A razão social deve ter pelo menos 2 caracteres.");
      return;
    }
    if (!form.regime) {
      setCampoInvalido("regime");
      setErroForm("Escolha o regime tributário.");
      return;
    }

    setEnviando(true);
    try {
      const resposta = await apiPost<RespostaCriacao>("/api/empresas", {
        // Só os dígitos: ver a nota 3 do topo do arquivo.
        cnpj: digitos,
        razaoSocial: form.razaoSocial.trim(),
        regime: form.regime,
        nomeFantasia: form.nomeFantasia.trim(),
        situacao: form.situacao,
        tributoLocal: form.tributoLocal,
        uf: form.uf.trim().toUpperCase(),
        municipio: form.municipio.trim(),
        inicioAtividade: form.inicioAtividade || undefined,
        responsavelId: form.responsavelId,
        // Campo escondido nunca é enviado: enviar "" limparia o vínculo.
        ...(semAcessoClientes ? {} : { userId: form.userId }),
        observacoes: form.observacoes.trim(),
      });

      const criada = resposta.empresa;
      setModalNova(false);
      if (criada?.id) {
        router.push(`/admin/empresas/${criada.id}`);
        return;
      }
      setRecarga((n) => n + 1);
    } catch (falha) {
      if (falha instanceof ErroApi) {
        if (falha.code === "cnpj_duplicado") {
          const id =
            typeof falha.corpo.empresaId === "string"
              ? falha.corpo.empresaId
              : null;
          setDuplicadaId(id);
          setCampoInvalido("cnpj");
          setErroForm(falha.message);
        } else if (falha.campo) {
          // Os 400 de empresa trazem o campo em `campo`, não em `code`.
          setCampoInvalido(falha.campo);
          setErroForm(falha.message);
        } else {
          setErroForm(falha.message);
        }
      } else {
        setErroForm(mensagemDeErro(falha) || "Não foi possível cadastrar.");
      }
    } finally {
      setEnviando(false);
    }
  }

  /* -------------------------------- Render -------------------------------- */

  const filtroAtivo = temFiltro(filtros);

  const abrirEmpresa = useCallback(
    (id: string) => router.push(`/admin/empresas/${id}`),
    [router]
  );

  return (
    <div className="cz-tarefas mx-auto max-w-7xl space-y-6 p-6">
      <Cabecalho
        titulo="Empresas"
        icone="Building2"
        descricao={`${plural(
          paginacao.total,
          "empresa cadastrada",
          "empresas cadastradas"
        )} · ${resumoFiltro}`}
        acoes={
          permissoes.gerenciarEmpresa ? (
            <Botao icone="Plus" onClick={abrirNova}>
              Nova empresa
            </Botao>
          ) : undefined
        }
      />

      {/* -------------------------------- KPIs ------------------------------ */}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((kpi) => (
          <CartaoKpi
            key={kpi.situacao}
            titulo={kpi.titulo}
            valor={contagem[kpi.situacao] ?? 0}
            icone={kpi.icone}
            tom={kpi.tom}
            detalhe={
              filtroAtivo ? "No filtro atual" : "Em toda a carteira"
            }
          />
        ))}
      </div>

      <p className="flex items-start gap-1.5 text-xs text-gray-500">
        <Icone nome="Info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Os contadores refletem o filtro atual
          {kpiParcial
            ? ` e somam apenas as ${empresas.length} empresas desta página, de ${paginacao.total} encontradas. Filtre ou navegue pelas páginas para ver o restante.`
            : ", somando todas as empresas encontradas."}
        </span>
      </p>

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
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
          <Escolha
            rotulo="Regime"
            vazio="Todos os regimes"
            opcoes={OPCOES_REGIME}
            value={filtros.regime}
            onChange={(e) => alterar({ regime: e.target.value })}
          />
          <Escolha
            rotulo="Situação"
            vazio="Todas as situações"
            opcoes={OPCOES_SITUACAO}
            value={filtros.situacao}
            onChange={(e) => alterar({ situacao: e.target.value })}
          />
          <Entrada
            rotulo="Buscar empresa"
            type="search"
            placeholder="Razão social, nome fantasia ou CNPJ"
            value={textoBusca}
            onChange={(e) => setTextoBusca(e.target.value)}
            ajuda="O CNPJ pode ser colado com pontuação"
          />
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
        <Carregando texto="Carregando empresas" />
      ) : empresas.length === 0 && !erro ? (
        filtroAtivo ? (
          <Vazio
            icone="Filter"
            titulo="Nenhuma empresa encontrada com os filtros atuais."
            descricao="Os filtros aplicados não retornaram nenhuma empresa. Ajuste ou limpe para ver o restante da carteira."
            acao={
              <Botao variante="secundario" icone="X" onClick={limpar}>
                Limpar filtros
              </Botao>
            }
          />
        ) : (
          <Vazio
            icone="Building2"
            titulo="Nenhuma empresa cadastrada."
            descricao="A empresa é a base do módulo: é o cadastro dela que gera a competência de cada mês e define o fluxo de etapas da apuração."
            acao={
              permissoes.gerenciarEmpresa ? (
                <Botao icone="Plus" onClick={abrirNova}>
                  Nova empresa
                </Botao>
              ) : undefined
            }
          />
        )
      ) : (
        <Painel className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th scope="col" className="px-5 py-3">
                    Razão social
                  </th>
                  <th scope="col" className="px-5 py-3">
                    CNPJ
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Regime
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Situação
                  </th>
                  <th scope="col" className="px-5 py-3">
                    UF / Município
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    Competências
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    Processos
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Cadastrada em
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {empresas.map((empresa) => (
                  <tr
                    key={empresa.id}
                    onClick={(evento) => {
                      // O clique no link da razão social já navega; sem esta
                      // guarda a linha navegaria de novo por cima dele.
                      if (
                        (evento.target as HTMLElement).closest("a") !== null
                      ) {
                        return;
                      }
                      abrirEmpresa(empresa.id);
                    }}
                    className="cursor-pointer transition-colors hover:bg-orange-50/40"
                  >
                    <td className="px-5 py-3">
                      {/* Link de verdade: é por ele que o teclado alcança a
                          linha, já que `tr` não é elemento focável. */}
                      <Link
                        href={`/admin/empresas/${empresa.id}`}
                        className="font-semibold text-gray-900 transition-colors hover:text-orange-600"
                      >
                        {empresa.razaoSocial}
                      </Link>
                      {empresa.nomeFantasia && (
                        <p className="mt-0.5 text-xs text-gray-500">
                          {empresa.nomeFantasia}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-gray-600">
                      {empresa.cnpjFormatado}
                    </td>
                    <td className="px-5 py-3">
                      <SeloRegime regime={empresa.regime} completo />
                    </td>
                    <td className="px-5 py-3">
                      <SeloSituacaoEmpresa situacao={empresa.situacao} />
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {empresa.uf || empresa.municipio ? (
                        <>
                          <span className="font-medium text-gray-900">
                            {empresa.uf ?? "—"}
                          </span>
                          {empresa.municipio && (
                            <span className="text-gray-500">
                              {" "}
                              · {empresa.municipio}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900">
                      {empresa._count.apuracoes}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900">
                      {empresa._count.processos}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-gray-600">
                      {dataCurta(empresa.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-orange-600">
                        Abrir
                        <Icone nome="ChevronRight" className="h-3.5 w-3.5" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Paginacao
            pagina={paginacao.page}
            totalPaginas={paginacao.totalPages}
            total={paginacao.total}
            onMudar={setPagina}
            rotulo="empresas"
          />
        </Painel>
      )}

      {/* --------------------------- Nova empresa --------------------------- */}

      <Modal
        aberto={modalNova}
        titulo="Nova empresa"
        icone="Building2"
        largura="lg"
        descricao="O regime escolhido aqui define o fluxo de etapas de toda competência aberta para esta empresa."
        onFechar={() => setModalNova(false)}
        rodape={
          <>
            <Botao
              variante="secundario"
              onClick={() => setModalNova(false)}
              disabled={enviando}
            >
              Cancelar
            </Botao>
            <Botao
              icone="Save"
              onClick={cadastrar}
              carregando={enviando}
              textoCarregando="Cadastrando"
            >
              Cadastrar empresa
            </Botao>
          </>
        }
      >
        <div className="space-y-4">
          {erroForm && !campoInvalido && <Aviso mensagem={erroForm} />}

          {duplicadaId && (
            <Aviso
              tom="atencao"
              mensagem="Este CNPJ já está cadastrado. Abra a empresa existente para conferir antes de criar outra."
            />
          )}
          {duplicadaId && (
            <Link
              href={`/admin/empresas/${duplicadaId}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 transition-colors hover:text-orange-700"
            >
              <Icone nome="ExternalLink" className="h-4 w-4" />
              Abrir a empresa já cadastrada
            </Link>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Entrada
              rotulo="CNPJ"
              required
              inputMode="numeric"
              autoComplete="off"
              placeholder="00.000.000/0000-00"
              value={form.cnpj}
              erro={erroDe("cnpj")}
              ajuda="Pode colar com pontuação. É a identidade da empresa e não muda depois."
              onChange={(e) => editar({ cnpj: mascaraCnpj(e.target.value) })}
            />
            <Escolha
              rotulo="Regime tributário"
              required
              vazio="Selecione o regime"
              opcoes={OPCOES_REGIME}
              value={form.regime}
              erro={erroDe("regime")}
              ajuda="Simples Nacional tem 10 etapas por competência; Lucro Presumido, 14."
              onChange={(e) => editar({ regime: e.target.value })}
            />
          </div>

          <Entrada
            rotulo="Razão social"
            required
            value={form.razaoSocial}
            erro={erroDe("razaoSocial")}
            onChange={(e) => editar({ razaoSocial: e.target.value })}
          />

          <Entrada
            rotulo="Nome fantasia"
            value={form.nomeFantasia}
            erro={erroDe("nomeFantasia")}
            ajuda="Opcional. Quando existe, é o nome usado nos cartões e nas listas."
            onChange={(e) => editar({ nomeFantasia: e.target.value })}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Escolha
              rotulo="Situação"
              opcoes={OPCOES_SITUACAO}
              value={form.situacao}
              erro={erroDe("situacao")}
              ajuda="Somente empresa ativa entra na abertura mensal de competência."
              onChange={(e) => editar({ situacao: e.target.value })}
            />
            <Escolha
              rotulo="Tributo local"
              opcoes={OPCOES_TRIBUTO}
              value={form.tributoLocal}
              erro={erroDe("tributoLocal")}
              ajuda="Ajusta o título da etapa de ICMS/ISS no Lucro Presumido: comércio apura ICMS, serviço apura ISS."
              onChange={(e) => editar({ tributoLocal: e.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Entrada
              rotulo="UF"
              maxLength={2}
              placeholder="SP"
              value={form.uf}
              erro={erroDe("uf")}
              onChange={(e) =>
                editar({ uf: e.target.value.toUpperCase().slice(0, 2) })
              }
            />
            <Entrada
              rotulo="Município"
              wrapperClassName="sm:col-span-2"
              value={form.municipio}
              erro={erroDe("municipio")}
              onChange={(e) => editar({ municipio: e.target.value })}
            />
          </div>

          <Entrada
            rotulo="Início de atividade"
            type="date"
            value={form.inicioAtividade}
            erro={erroDe("inicioAtividade")}
            ajuda="Quando informada, passa a ser o início de vigência da primeira linha do histórico de regime."
            onChange={(e) => editar({ inicioAtividade: e.target.value })}
          />

          <Escolha
            rotulo="Responsável interno"
            vazio="Sem responsável definido"
            opcoes={opcoesResponsavel}
            value={form.responsavelId}
            erro={erroDe("responsavelId")}
            ajuda="Quem responde pela empresa no escritório."
            onChange={(e) => editar({ responsavelId: e.target.value })}
          />

          {semAcessoClientes ? (
            <p className="flex items-start gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
              <Icone nome="Lock" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Somente administrador vincula o login do cliente à empresa. O
                cadastro segue normalmente sem esse vínculo, e um administrador
                pode acrescentá-lo depois na tela da empresa.
              </span>
            </p>
          ) : (
            <Escolha
              rotulo="Cliente vinculado"
              vazio="Nenhum login vinculado"
              opcoes={opcoesCliente}
              value={form.userId}
              erro={erroDe("userId")}
              ajuda="Login pelo qual o cliente acessa o próprio painel. Opcional."
              onChange={(e) => editar({ userId: e.target.value })}
            />
          )}

          <Area
            rotulo="Observações"
            rows={3}
            value={form.observacoes}
            erro={erroDe("observacoes")}
            placeholder="Particularidades do cliente, combinados de prazo, contatos"
            onChange={(e) => editar({ observacoes: e.target.value })}
          />
        </div>
      </Modal>
    </div>
  );
}
