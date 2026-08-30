"use client";

/**
 * Lista de empresas — a base do módulo de tarefas.
 *
 * A empresa é o que gera competência todo mês: o REGIME escolhe o fluxo de etapas
 * da apuração, e o PLANO INTERNO decide se ela entra ou não na abertura automática
 * do mês. Por isso a tela mostra os dois em destaque.
 *
 * Situação ("Ativa/Suspensa/Encerrada/Em abertura") NÃO aparece em lugar nenhum
 * desta tela, a pedido do escritório. A coluna continua no banco, derivada do
 * plano e da existência do CNPJ — o rótulo do filtro é "Situação" porque foi assim
 * que o escritório pediu, mas as opções são os planos.
 *
 * Quatro decisões estruturais:
 *
 * 1. Os filtros vivem na URL. `router.replace` a cada mudança, leitura da URL
 *    só na montagem. Assim o link filtrado pode ser colado no chat do
 *    escritório ("as do Presumido em standby") e abre igual do outro lado. Um
 *    `?situacao=` de link antigo é traduzido para o plano equivalente.
 *
 * 2. Os KPIs são CONTADOS NA PÁGINA CARREGADA, não no banco. Não existe rota de
 *    resumo de empresas, e inventar quatro requisições de contagem a cada tecla
 *    da busca custaria mais do que a informação vale. Quando a página não cobre
 *    o total filtrado, a tela DIZ isso em vez de deixar o operador somar quatro
 *    números que não fecham com o total.
 *
 * 3. O CNPJ é mascarado na digitação e enviado só com dígitos. O banco guarda 14
 *    dígitos (`@db.VarChar(14)`); enviar formatado quebraria a unicidade — o
 *    mesmo CNPJ com e sem ponto viraria duas empresas. E pode ficar VAZIO: a
 *    empresa em abertura é cadastrada antes de o número existir.
 *
 * 4. O cadastro tem EXATAMENTE os dez campos que o escritório listou, mais o
 *    plano interno. Tributo local, início de atividade, responsável interno,
 *    login do cliente e observações ficam na tela da empresa, em Editar.
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
} from "@/app/components/views/ui/tarefas/tipos";
import { dataCurta, plural } from "@/app/components/views/ui/tarefas/formato";
import {
  Aviso,
  BlocoForm,
  Cabecalho,
  CartaoKpi,
  Carregando,
  Paginacao,
  Painel,
  Vazio,
} from "@/app/components/views/ui/tarefas/Base";
import {
  Botao,
  Entrada,
  EntradaDocumento,
  Escolha,
  type Opcao,
} from "@/app/components/views/ui/tarefas/Campos";
import { Modal } from "@/app/components/views/ui/tarefas/Modal";
import {
  SeloPlanoInterno,
  SeloRegime,
} from "@/app/components/views/ui/tarefas/Selos";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import {
  PLANO_INTERNO,
  PLANO_INTERNO_LABEL,
  REGIME,
  REGIME_LABEL,
} from "@/lib/tarefa-etapas";
import { somenteDigitos } from "@/lib/documento";
import { useSessao } from "@/hooks/useSessao";

/* -------------------------------------------------------------------------- */
/*                            Contratos das rotas                             */
/* -------------------------------------------------------------------------- */

type RespostaLista = { empresas: EmpresaLista[]; pagination: Pagination };
type RespostaCriacao = { empresa: EmpresaLista };

/* -------------------------------------------------------------------------- */
/*                            Domínio e constantes                            */
/* -------------------------------------------------------------------------- */

const LIMITE = 50;

const REGIMES = Object.values(REGIME) as string[];
const PLANOS = Object.values(PLANO_INTERNO) as string[];

const OPCOES_REGIME: Opcao[] = REGIMES.map((valor) => ({
  valor,
  texto: REGIME_LABEL[valor] ?? valor,
}));

const OPCOES_PLANO: Opcao[] = PLANOS.map((valor) => ({
  valor,
  texto: PLANO_INTERNO_LABEL[valor] ?? valor,
}));

/**
 * Um indicador por PLANO INTERNO, não mais por situação.
 *
 * A situação ("Ativa/Suspensa/Encerrada/Em abertura") saiu da tela: descrevia um
 * estado que ninguém consultava. A pergunta do dia a dia é quantos clientes há em
 * cada plano — e é o plano que decide quem entra na abertura mensal de
 * competência. Os dois primeiros indicadores somam exatamente as empresas que
 * geram trabalho todo mês.
 */
const KPIS: {
  plano: string;
  titulo: string;
  icone: string;
  tom: "verde" | "azul" | "ambar" | "cinza";
}[] = [
  { plano: PLANO_INTERNO.PLANO_SIMPLES, titulo: "Plano Simples", icone: "BadgeCheck", tom: "verde" },
  { plano: PLANO_INTERNO.PLANO_PRESUMIDO, titulo: "Plano Presumido", icone: "BadgeCheck", tom: "azul" },
  { plano: PLANO_INTERNO.PLANO_STANDBY, titulo: "Plano Standby", icone: "PauseCircle", tom: "ambar" },
  { plano: PLANO_INTERNO.SEM_PLANO_SUSPENSA, titulo: "Sem plano", icone: "Ban", tom: "cinza" },
];

/* -------------------------------------------------------------------------- */
/*                                  Filtros                                   */
/* -------------------------------------------------------------------------- */

type Filtros = { regime: string; planoInterno: string; busca: string };

const FILTROS_VAZIOS: Filtros = { regime: "", planoInterno: "", busca: "" };

/**
 * Lê os filtros da URL descartando valor inválido.
 *
 * A rota devolve 400 para `regime=QUALQUERCOISA`, e um link colado à mão viraria
 * faixa de erro no lugar da lista. Filtrar aqui transforma link torto em lista
 * completa, que é o comportamento menos surpreendente.
 *
 * `situacao=` na URL é aceito e traduzido para plano: links de "as suspensas do
 * Simples" já foram colados em conversa antes desta mudança, e abrir num filtro
 * vazio seria pior que abrir no equivalente mais próximo.
 */
function lerFiltros(params: URLSearchParams | null): Filtros {
  if (!params) return FILTROS_VAZIOS;
  const regime = params.get("regime") ?? "";
  const plano = params.get("planoInterno") ?? "";
  const situacaoLegado = params.get("situacao") ?? "";

  const planoDoLegado =
    situacaoLegado === "SUSPENSA" || situacaoLegado === "ENCERRADA"
      ? PLANO_INTERNO.SEM_PLANO_SUSPENSA
      : situacaoLegado === "EM_ABERTURA"
        ? PLANO_INTERNO.PLANO_STANDBY
        : "";

  return {
    regime: REGIMES.includes(regime) ? regime : "",
    planoInterno: PLANOS.includes(plano) ? plano : planoDoLegado,
    busca: params.get("busca") ?? "",
  };
}

function temFiltro(filtros: Filtros): boolean {
  return !!filtros.regime || !!filtros.planoInterno || !!filtros.busca.trim();
}

/* -------------------------------------------------------------------------- */
/*                              Formulário novo                               */
/* -------------------------------------------------------------------------- */

/**
 * EXATAMENTE os dez campos que o escritório pediu, mais o plano interno.
 *
 * "Ter somente estes campos para inserir, ao cadastrar" é literal, e o
 * formulário respeita. Saíram daqui, a pedido: tributo local, início de
 * atividade, responsável interno, cliente vinculado e observações. Os cinco
 * continuam existindo no banco e na tela de detalhe da empresa — o cadastro é que
 * ficou enxuto, não o cadastro perdeu campo.
 *
 * O que isso custa, declarado para quem vier depois:
 *
 *   - `tributoLocal` nasce "AMBOS" (default do schema), então a etapa 6 do Lucro
 *     Presumido aparece com o nome genérico "Apuração de ICMS/ISS" até alguém
 *     ajustar na tela da empresa.
 *   - `responsavelId` nasce vazio, então a competência aberta para esta empresa
 *     nasce sem dono até ser distribuída.
 *
 * Nenhum dos dois impede trabalho, e os dois se resolvem em Editar. O ganho é o
 * cadastro de 60 empresas da carteira não pedir cinco decisões por empresa que
 * ninguém tem na hora de digitar.
 *
 * Documento fica no estado COM máscara e é enviado com `somenteDigitos`. O banco
 * guarda 14 dígitos de CNPJ, 11 de CPF e 8 de CEP; enviar formatado quebraria a
 * unicidade do CNPJ — o mesmo número com e sem ponto viraria duas empresas.
 */
type Formulario = {
  grupo: string;
  razaoSocial: string;
  cnpj: string;
  inscricaoMunicipal: string;
  inscricaoEstadual: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  responsavelOperacional: string;
  socioAdmNome: string;
  socioAdmCpf: string;
  regime: string;
  planoInterno: string;
};

function formularioVazio(): Formulario {
  return {
    grupo: "",
    razaoSocial: "",
    cnpj: "",
    inscricaoMunicipal: "",
    inscricaoEstadual: "",
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    municipio: "",
    uf: "",
    responsavelOperacional: "",
    socioAdmNome: "",
    socioAdmCpf: "",
    regime: "",
    planoInterno: PLANO_INTERNO.PLANO_SIMPLES,
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
        <div className="cz-tarefas mx-auto max-w-[1800px] space-y-6 p-6">
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
        planoInterno: filtros.planoInterno,
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
      planoInterno: filtros.planoInterno,
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
    for (const plano of PLANOS) mapa[plano] = 0;
    for (const empresa of empresas) {
      mapa[empresa.planoInterno] = (mapa[empresa.planoInterno] ?? 0) + 1;
    }
    return mapa;
  }, [empresas]);

  /** Quantas empresas desta página ainda não têm CNPJ (estão em abertura). */
  const semCnpj = useMemo(
    () => empresas.filter((empresa) => !empresa.cnpj).length,
    [empresas]
  );

  // Só quando a página cobre o total filtrado os números fecham com o total.
  const kpiParcial = paginacao.total > empresas.length;

  const resumoFiltro = useMemo(() => {
    const partes: string[] = [];
    if (filtros.regime) {
      partes.push(REGIME_LABEL[filtros.regime] ?? filtros.regime);
    }
    if (filtros.planoInterno) {
      partes.push(
        PLANO_INTERNO_LABEL[filtros.planoInterno] ?? filtros.planoInterno
      );
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

  /*
   * As duas listas de pessoas saíram desta tela.
   *
   * Antes o modal carregava `/api/usuarios-internos` e `/api/admin/users` para
   * preencher "Responsável interno" e "Cliente vinculado". Os dois campos saíram
   * do cadastro, então as duas requisições viraram trabalho sem consumidor — e
   * `/api/admin/users` devolvia 403 para o comercial, o que exigia um estado só
   * para esconder um campo que já não existe.
   *
   * Os dois vínculos continuam sendo feitos na tela da empresa, que é onde há
   * contexto para decidir quem cuida dela.
   */

  const erroDe = (campo: string) =>
    campoInvalido === campo ? erroForm || "Campo inválido." : null;

  async function cadastrar() {
    setErroForm("");
    setCampoInvalido(null);
    setDuplicadaId(null);

    /**
     * Razão social é o ÚNICO campo obrigatório de verdade, junto com regime.
     *
     * CNPJ deixou de ser: a empresa em abertura é cadastrada sem ele, e é
     * justamente ela que precisa existir para o processo de abertura poder ser
     * atrelado a uma empresa. Os campos de documento se validam sozinhos
     * (`EntradaDocumento` acusa DV errado no instante em que o número fecha), e a
     * rota revalida tudo — o cliente nunca é autoridade.
     */
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

    const cnpjDigitos = somenteDigitos(form.cnpj);
    if (cnpjDigitos.length > 0 && cnpjDigitos.length !== 14) {
      setCampoInvalido("cnpj");
      setErroForm(
        "Complete o CNPJ ou deixe em branco, se a empresa ainda não foi aberta."
      );
      return;
    }

    const cpfDigitos = somenteDigitos(form.socioAdmCpf);
    if (cpfDigitos.length > 0 && cpfDigitos.length !== 11) {
      setCampoInvalido("socioAdmCpf");
      setErroForm("Complete o CPF do sócio administrador ou deixe em branco.");
      return;
    }

    const cepDigitos = somenteDigitos(form.cep);
    if (cepDigitos.length > 0 && cepDigitos.length !== 8) {
      setCampoInvalido("cep");
      setErroForm("Complete o CEP ou deixe em branco.");
      return;
    }

    setEnviando(true);
    try {
      const resposta = await apiPost<RespostaCriacao>("/api/empresas", {
        // Só os dígitos: ver a nota 3 do topo do arquivo. Vazio vai como
        // `undefined` para a rota tratar como "não informado", não como "".
        cnpj: cnpjDigitos || undefined,
        grupo: form.grupo.trim(),
        razaoSocial: form.razaoSocial.trim(),
        regime: form.regime,
        planoInterno: form.planoInterno,
        inscricaoMunicipal: form.inscricaoMunicipal.trim(),
        inscricaoEstadual: form.inscricaoEstadual.trim(),
        cep: cepDigitos || undefined,
        logradouro: form.logradouro.trim(),
        numero: form.numero.trim(),
        complemento: form.complemento.trim(),
        bairro: form.bairro.trim(),
        municipio: form.municipio.trim(),
        uf: form.uf.trim().toUpperCase(),
        responsavelOperacional: form.responsavelOperacional.trim(),
        socioAdmNome: form.socioAdmNome.trim(),
        socioAdmCpf: cpfDigitos || undefined,
        // `tributoLocal`, `inicioAtividade`, `responsavelId`, `userId` e
        // `observacoes` NÃO vão no corpo: os cinco saíram do cadastro. Omitir é
        // diferente de mandar vazio — a rota aplica o default do schema, e mandar
        // "" gravaria campo em branco em cima de nada.
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

  /**
   * Contagem da carteira + resumo do filtro.
   *
   * Era a descrição do cabeçalho. Com o cabeçalho compacto o texto sai da tela,
   * e isto é dado, não enfeite: desceu para o cabeçalho do painel de filtros,
   * que é justamente o bloco que responde "por que a lista tem esse tamanho".
   */
  const resumoLista = `${plural(
    paginacao.total,
    "empresa cadastrada",
    "empresas cadastradas"
  )} · ${resumoFiltro}`;

  const abrirEmpresa = useCallback(
    (id: string) => router.push(`/admin/empresas/${id}`),
    [router]
  );

  return (
    <div className="cz-tarefas mx-auto max-w-[1800px] space-y-6 p-6">
      {/* O cabeçalho do admin já traz "Empresas" e o subtítulo da rota. */}
      <Cabecalho
        compacto
        titulo="Empresas"
        icone="Building2"
        descricao={resumoLista}
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
            key={kpi.plano}
            titulo={kpi.titulo}
            valor={contagem[kpi.plano] ?? 0}
            icone={kpi.icone}
            tom={kpi.tom}
            detalhe={filtroAtivo ? "No filtro atual" : "Em toda a carteira"}
          />
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="flex items-start gap-1.5 text-xs text-gray-500">
          <Icone nome="Info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Os contadores refletem o filtro atual
            {kpiParcial
              ? ` e somam apenas as ${empresas.length} empresas desta página, de ${paginacao.total} encontradas. Filtre ou navegue pelas páginas para ver o restante.`
              : ", somando todas as empresas encontradas."}{" "}
            Só <strong className="font-semibold">Plano Simples</strong> e{" "}
            <strong className="font-semibold">Plano Presumido</strong> entram na
            abertura mensal de competência.
          </span>
        </p>
        {semCnpj > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-gray-500">
            <Icone nome="Hourglass" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {semCnpj === 1
                ? "1 empresa desta página ainda não tem CNPJ"
                : `${semCnpj} empresas desta página ainda não têm CNPJ`}
              . Elas ficam fora da abertura mensal até o CNPJ ser preenchido, e
              existem para o processo de abertura poder ser atrelado a elas.
            </span>
          </p>
        )}
      </div>

      {/* ------------------------------ Filtros ----------------------------- */}

      <Painel
        titulo="Filtros"
        descricao={resumoLista}
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
          {/* Rótulo "Situação", opções de PLANO INTERNO: é o que o escritório
              pediu, e é coerente — o plano é o que agora diz a situação
              operacional da empresa. */}
          <Escolha
            rotulo="Situação"
            vazio="Todos os planos"
            opcoes={OPCOES_PLANO}
            value={filtros.planoInterno}
            onChange={(e) => alterar({ planoInterno: e.target.value })}
            ajuda="Plano interno ContaZoom. Simples e Presumido geram competência todo mês."
          />
          <Entrada
            rotulo="Buscar empresa"
            type="search"
            placeholder="Razão social, grupo, CNPJ, sócio ou CPF"
            value={textoBusca}
            onChange={(e) => setTextoBusca(e.target.value)}
            ajuda="CNPJ e CPF podem ser colados com pontuação"
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
            {/* Subiu de 1120 para 1340 com a coluna de sócio administrador. A
                tabela rola na horizontal em tela estreita, e é o certo aqui:
                esconder coluna faria a mesma tela mostrar dados diferentes
                dependendo do monitor. */}
            <table className="w-full min-w-[1340px] text-left text-sm">
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
                    Sócio administrador
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
                      {/* Grupo antes de nome fantasia: numa carteira com vários
                          CNPJs do mesmo dono, é o grupo que identifica de quem é
                          a empresa. */}
                      {(empresa.grupo || empresa.nomeFantasia) && (
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500">
                          {empresa.grupo && (
                            <span className="inline-flex items-center gap-1 font-semibold text-gray-600">
                              <Icone nome="Layers" className="h-3 w-3 shrink-0" />
                              {empresa.grupo}
                            </span>
                          )}
                          {empresa.grupo && empresa.nomeFantasia && <span>·</span>}
                          {empresa.nomeFantasia && (
                            <span>{empresa.nomeFantasia}</span>
                          )}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-gray-600">
                      {empresa.cnpjFormatado ?? (
                        // Empresa em abertura. O texto diz o motivo, porque um
                        // travessão sozinho parece cadastro incompleto.
                        <span className="inline-flex items-center gap-1 font-sans text-xs font-semibold text-gray-400">
                          <Icone nome="Hourglass" className="h-3.5 w-3.5" />
                          Em abertura
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <SeloRegime regime={empresa.regime} completo />
                    </td>
                    <td className="px-5 py-3">
                      <SeloPlanoInterno plano={empresa.planoInterno} />
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {empresa.socioAdmNome ? (
                        <>
                          <span className="font-medium text-gray-900">
                            {empresa.socioAdmNome}
                          </span>
                          {empresa.socioAdmCpfFormatado && (
                            <p className="mt-0.5 font-mono text-xs text-gray-500">
                              {empresa.socioAdmCpfFormatado}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
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

      {/*
        Modal `2xl` (1152px) e grade de três colunas.

        Antes era `lg` (672px) em coluna única com onze campos, o que dava três
        telas de rolagem — e rolagem em modal é o pior lugar para ela existir: a
        pessoa perde o rodapé com o botão de salvar e não sabe se o formulário
        acabou. Com a largura certa e os campos agrupados por assunto, o cadastro
        inteiro cabe de uma vez.
      */}
      <Modal
        aberto={modalNova}
        titulo="Nova empresa"
        icone="Building2"
        largura="2xl"
        descricao="Cadastre a empresa antes de abrir competência ou processo — os dois só podem ser atrelados a uma empresa que já existe aqui."
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
        <div className="space-y-6">
          {erroForm && !campoInvalido && <Aviso mensagem={erroForm} />}

          {duplicadaId && (
            <div className="space-y-2">
              <Aviso
                tom="atencao"
                mensagem="Este CNPJ já está cadastrado. Abra a empresa existente para conferir antes de criar outra."
              />
              <Link
                href={`/admin/empresas/${duplicadaId}`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 transition-colors hover:text-orange-700"
              >
                <Icone nome="ExternalLink" className="h-4 w-4" />
                Abrir a empresa já cadastrada
              </Link>
            </div>
          )}

          {/* ------------------------ Identificação ------------------------ */}

          <BlocoForm
            icone="Building2"
            titulo="Identificação"
            descricao="Quem é a empresa. Só a razão social é obrigatória: quem está em abertura ainda não tem CNPJ nem inscrição."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Entrada
                rotulo="Nome do grupo"
                wrapperClassName="lg:col-span-1"
                value={form.grupo}
                erro={erroDe("grupo")}
                placeholder="Grupo Xpto"
                ajuda="Agrupa os CNPJs do mesmo dono. Opcional."
                onChange={(e) => editar({ grupo: e.target.value })}
              />
              <Entrada
                rotulo="Razão social"
                required
                wrapperClassName="lg:col-span-2"
                value={form.razaoSocial}
                erro={erroDe("razaoSocial")}
                onChange={(e) => editar({ razaoSocial: e.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <EntradaDocumento
                tipo="cnpj"
                rotulo="CNPJ"
                value={form.cnpj}
                erro={erroDe("cnpj")}
                ajuda="Deixe em branco se a empresa ainda não foi aberta. Depois de preenchido não muda."
                onChange={(cnpj) => editar({ cnpj })}
              />
              <Entrada
                rotulo="Inscrição municipal"
                value={form.inscricaoMunicipal}
                erro={erroDe("inscricaoMunicipal")}
                ajuda='Aceita "ISENTO".'
                onChange={(e) =>
                  editar({ inscricaoMunicipal: e.target.value })
                }
              />
              <Entrada
                rotulo="Inscrição estadual"
                value={form.inscricaoEstadual}
                erro={erroDe("inscricaoEstadual")}
                ajuda='Aceita "ISENTO".'
                onChange={(e) => editar({ inscricaoEstadual: e.target.value })}
              />
            </div>
          </BlocoForm>

          {/* -------------------------- Endereço --------------------------- */}

          <BlocoForm
            icone="MapPin"
            titulo="Endereço completo"
            descricao="É o endereço que vai para a Junta e para a Prefeitura. CEP errado volta como exigência semanas depois."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              <EntradaDocumento
                tipo="cep"
                rotulo="CEP"
                wrapperClassName="lg:col-span-2"
                value={form.cep}
                erro={erroDe("cep")}
                onChange={(cep) => editar({ cep })}
              />
              <Entrada
                rotulo="Logradouro"
                wrapperClassName="lg:col-span-3"
                value={form.logradouro}
                erro={erroDe("logradouro")}
                placeholder="Avenida Paulista"
                onChange={(e) => editar({ logradouro: e.target.value })}
              />
              <Entrada
                rotulo="Número"
                wrapperClassName="lg:col-span-1"
                maxLength={20}
                value={form.numero}
                erro={erroDe("numero")}
                placeholder="1000"
                onChange={(e) => editar({ numero: e.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              <Entrada
                rotulo="Complemento"
                wrapperClassName="lg:col-span-2"
                value={form.complemento}
                erro={erroDe("complemento")}
                placeholder="Sala 42"
                onChange={(e) => editar({ complemento: e.target.value })}
              />
              <Entrada
                rotulo="Bairro"
                wrapperClassName="lg:col-span-2"
                value={form.bairro}
                erro={erroDe("bairro")}
                onChange={(e) => editar({ bairro: e.target.value })}
              />
              <Entrada
                rotulo="Município"
                wrapperClassName="lg:col-span-1"
                value={form.municipio}
                erro={erroDe("municipio")}
                onChange={(e) => editar({ municipio: e.target.value })}
              />
              <Entrada
                rotulo="UF"
                wrapperClassName="lg:col-span-1"
                maxLength={2}
                placeholder="SP"
                value={form.uf}
                erro={erroDe("uf")}
                onChange={(e) =>
                  editar({ uf: e.target.value.toUpperCase().slice(0, 2) })
                }
              />
            </div>
          </BlocoForm>

          {/* --------------------------- Pessoas --------------------------- */}

          <BlocoForm
            icone="Contact"
            titulo="Pessoas"
            descricao="Responsável operacional é do lado do cliente, quem manda os documentos. Responsável interno é quem cuida da empresa aqui dentro."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Entrada
                rotulo="Responsável operacional"
                value={form.responsavelOperacional}
                erro={erroDe("responsavelOperacional")}
                ajuda="Contato do cliente no dia a dia."
                onChange={(e) =>
                  editar({ responsavelOperacional: e.target.value })
                }
              />
              <Entrada
                rotulo="Sócio administrador"
                value={form.socioAdmNome}
                erro={erroDe("socioAdmNome")}
                ajuda="Nome completo, como no documento."
                onChange={(e) => editar({ socioAdmNome: e.target.value })}
              />
              <EntradaDocumento
                tipo="cpf"
                rotulo="CPF do sócio administrador"
                value={form.socioAdmCpf}
                erro={erroDe("socioAdmCpf")}
                onChange={(socioAdmCpf) => editar({ socioAdmCpf })}
              />
            </div>

          </BlocoForm>

          {/* ------------------- Plano e regime tributário ------------------ */}

          <BlocoForm
            icone="Tag"
            titulo="Plano e regime tributário"
            descricao="O plano decide se a empresa entra na abertura mensal de competência. O regime decide quantas etapas cada competência tem."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Escolha
                rotulo="Plano interno ContaZoom"
                required
                opcoes={OPCOES_PLANO}
                value={form.planoInterno}
                erro={erroDe("planoInterno")}
                ajuda="Simples e Presumido geram competência todo mês. Standby e sem plano não."
                onChange={(e) => editar({ planoInterno: e.target.value })}
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

            {/* Diz onde estão os campos que saíram, senão quem procura por eles
                conclui que o sistema perdeu funcionalidade. */}
            <p className="flex items-start gap-1.5 text-xs leading-5 text-gray-500">
              <Icone nome="Info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Tributo local, início de atividade, responsável interno, login do
                cliente e observações ficam na tela da empresa, em{" "}
                <strong className="font-semibold">Editar</strong>. O cadastro pede
                só o essencial para a empresa existir.
              </span>
            </p>
          </BlocoForm>
        </div>
      </Modal>
    </div>
  );
}
