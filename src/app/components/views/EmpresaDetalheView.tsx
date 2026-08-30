"use client";

/**
 * Ficha da empresa: cadastro, linha do tempo de regime, competências e processos.
 *
 * A empresa é a base do módulo — é o cadastro dela que gera competência todo
 * mês. Duas coisas desta tela existem por causa disso e merecem explicação:
 *
 * 1. CNPJ e regime NÃO são editáveis no mesmo lugar que o resto. O CNPJ é a
 *    identidade: apuração, processo e histórico apontam para ela, e trocar o
 *    número transformaria o histórico de uma empresa no histórico de outra. O
 *    regime tem rota própria porque mudar regime não é editar campo: fecha uma
 *    vigência e abre outra no histórico, e a permissão é de outro papel.
 *
 * 2. O regime da apuração é CONGELADO na criação. A apuração de março continua
 *    Simples Nacional mesmo que a empresa seja desenquadrada em julho, porque as
 *    etapas executadas em março foram as do Simples. Quando o regime congelado
 *    difere do regime atual, a tela marca isso — não é divergência de dado, é
 *    história.
 *
 * Escrita: uma única flag `ocupado`, e recarga do GET depois de cada gravação. O
 * PATCH devolve um recorte da empresa (sem `_count`, sem `createdAt`, sem
 * `regimeHistorico`); costurar esse recorte no estado deixaria a tela mostrando
 * meia empresa.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  ErroApi,
  apiGet,
  apiPatch,
  apiPost,
  mensagemDeErro,
} from "@/app/components/views/ui/tarefas/api";
import type {
  EmpresaDetalhe,
  RegimeHistorico,
  UsuarioInterno,
} from "@/app/components/views/ui/tarefas/tipos";
import {
  competenciaLabel,
  dataCurta,
  dataHora,
  plural,
} from "@/app/components/views/ui/tarefas/formato";
import {
  Aviso,
  BlocoForm,
  Cabecalho,
  Carregando,
  Dado,
  Painel,
  Vazio,
} from "@/app/components/views/ui/tarefas/Base";
import {
  Area,
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
  SeloSituacaoEmpresa,
  SeloStatus,
} from "@/app/components/views/ui/tarefas/Selos";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import { somenteDigitos } from "@/lib/documento";
import {
  ORGAO_EXTERNO_LABEL,
  PLANO_INTERNO,
  PLANO_INTERNO_LABEL,
  REGIME,
  REGIME_LABEL,
  SITUACAO_EMPRESA,
  SITUACAO_EMPRESA_LABEL,
  TIPO_PROCESSO_LABEL,
  TRIBUTO_LOCAL,
  TRIBUTO_LOCAL_LABEL,
  totalEtapasApuracao,
} from "@/lib/tarefa-etapas";
import { useSessao } from "@/hooks/useSessao";

/* -------------------------------------------------------------------------- */
/*                            Contratos das rotas                             */
/* -------------------------------------------------------------------------- */

type RespostaDetalhe = { empresa: EmpresaDetalhe };
type RespostaUsuarios = { usuarios: UsuarioInterno[]; total: number };

type RespostaRegime = {
  empresa: {
    id: string;
    cnpj: string;
    razaoSocial: string;
    regime: string;
    situacao: string;
    updatedAt: string;
  };
  historico: RegimeHistorico;
  regimeAnterior: string;
};

/** `GET /api/admin/users` devolve array plano e exige papel ADMIN. */
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

const REGIMES = Object.values(REGIME) as string[];
const SITUACOES = Object.values(SITUACAO_EMPRESA) as string[];
const PLANOS = Object.values(PLANO_INTERNO) as string[];
const TRIBUTOS = Object.values(TRIBUTO_LOCAL) as string[];

/**
 * Situação continua editável AQUI, e só aqui.
 *
 * Saiu do cadastro e da lista, onde virou o plano interno. Sobrou nesta tela por
 * um motivo específico: ENCERRADA não é derivável de plano — é a empresa que
 * deixou de existir, não a que deixou de ser cliente — e alguém precisa poder
 * afirmar isso. Quando o plano muda no mesmo formulário, o campo é desabilitado e
 * a situação é recalculada, para não gravar o valor velho junto com o plano novo.
 */
const OPCOES_SITUACAO: Opcao[] = SITUACOES.map((valor) => ({
  valor,
  texto: SITUACAO_EMPRESA_LABEL[valor] ?? valor,
}));

const OPCOES_PLANO: Opcao[] = PLANOS.map((valor) => ({
  valor,
  texto: PLANO_INTERNO_LABEL[valor] ?? valor,
}));

const OPCOES_TRIBUTO: Opcao[] = TRIBUTOS.map((valor) => ({
  valor,
  texto: TRIBUTO_LOCAL_LABEL[valor] ?? valor,
}));

/**
 * Total de etapas do regime, sem derrubar a tela.
 *
 * `totalEtapasApuracao` LANÇA para regime desconhecido, e o regime da apuração é
 * texto congelado no banco: um valor legado quebraria o painel inteiro por causa
 * de uma linha. Aqui vira `null` e a linha mostra só a etapa atual.
 */
function totalEtapasSeguro(regime: string): number | null {
  try {
    return totalEtapasApuracao(regime);
  } catch {
    return null;
  }
}

/** ISO para o valor de `input[type=date]`, lendo as partes em UTC. */
function paraInputDate(valor: string | null | undefined): string {
  if (!valor) return "";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(data.getUTCDate()).padStart(2, "0");
  return `${data.getUTCFullYear()}-${mes}-${dia}`;
}

/**
 * Dia seguinte, em UTC, no formato do `input[type=date]`.
 *
 * É o `min` da nova vigência: a rota recusa data igual ou anterior ao início da
 * linha vigente, porque o fechamento grava `vigenciaFim = vigenciaInicio - 1
 * dia` e uma data igual criaria linha que termina antes de começar.
 */
function diaSeguinte(valor: string | null | undefined): string {
  if (!valor) return "";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  const proximo = new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate() + 1)
  );
  return paraInputDate(proximo.toISOString());
}

/* -------------------------------------------------------------------------- */
/*                              Formulário edição                             */
/* -------------------------------------------------------------------------- */

type FormEdicao = {
  cnpj: string;
  grupo: string;
  razaoSocial: string;
  nomeFantasia: string;
  planoInterno: string;
  situacao: string;
  tributoLocal: string;
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
  responsavelId: string;
  userId: string;
  observacoes: string;
};

function formDe(empresa: EmpresaDetalhe): FormEdicao {
  return {
    cnpj: empresa.cnpjFormatado ?? "",
    grupo: empresa.grupo ?? "",
    razaoSocial: empresa.razaoSocial,
    nomeFantasia: empresa.nomeFantasia ?? "",
    planoInterno: empresa.planoInterno,
    situacao: empresa.situacao,
    tributoLocal: empresa.tributoLocal,
    inscricaoMunicipal: empresa.inscricaoMunicipal ?? "",
    inscricaoEstadual: empresa.inscricaoEstadual ?? "",
    cep: empresa.cepFormatado ?? "",
    logradouro: empresa.logradouro ?? "",
    numero: empresa.numero ?? "",
    complemento: empresa.complemento ?? "",
    bairro: empresa.bairro ?? "",
    municipio: empresa.municipio ?? "",
    uf: empresa.uf ?? "",
    responsavelOperacional: empresa.responsavelOperacional ?? "",
    socioAdmNome: empresa.socioAdmNome ?? "",
    socioAdmCpf: empresa.socioAdmCpfFormatado ?? "",
    responsavelId: empresa.responsavelId ?? "",
    userId: empresa.userId ?? "",
    observacoes: empresa.observacoes ?? "",
  };
}

/* -------------------------------------------------------------------------- */
/*                                    View                                    */
/* -------------------------------------------------------------------------- */

export default function EmpresaDetalheView({ id }: { id: string }) {
  const { permissoes } = useSessao();

  const [empresa, setEmpresa] = useState<EmpresaDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [mensagemOk, setMensagemOk] = useState("");

  /** Uma flag para toda escrita: nunca há duas gravações em curso na mesma tela. */
  const [ocupado, setOcupado] = useState(false);

  /* -------------------------------- Carga --------------------------------- */

  useEffect(() => {
    const controlador = new AbortController();
    let vivo = true;

    setCarregando(true);
    setErro("");

    apiGet<RespostaDetalhe>(`/api/empresas/${id}`, controlador.signal)
      .then((dados) => {
        if (!vivo) return;
        setEmpresa(dados.empresa);
        setNaoEncontrada(false);
      })
      .catch((falha) => {
        if (!vivo) return;
        const mensagem = mensagemDeErro(falha);
        if (!mensagem) return; // Abortado.
        // A rota devolve só `{error}` no 404, sem `code`: o status é o critério.
        if (falha instanceof ErroApi && falha.status === 404) {
          setNaoEncontrada(true);
          setEmpresa(null);
          return;
        }
        setErro(mensagem);
      })
      .finally(() => {
        if (!vivo) return;
        setCarregando(false);
      });

    return () => {
      vivo = false;
      controlador.abort();
    };
  }, [id, recarga]);

  const recarregar = useCallback(() => setRecarga((n) => n + 1), []);

  /* ------------------------------ Pessoas -------------------------------- */

  const [internos, setInternos] = useState<UsuarioInterno[]>([]);
  const [clientes, setClientes] = useState<UsuarioAdmin[]>([]);
  /**
   * `/api/admin/users` é a única fonte do login do cliente e devolve 403 para
   * quem não é ADMIN. Comercial edita a empresa mas não vê essa lista, então o
   * campo desaparece com explicação em vez de virar select vazio.
   */
  const [semAcessoClientes, setSemAcessoClientes] = useState(false);

  /* ------------------------------- Edição -------------------------------- */

  const [modalEdicao, setModalEdicao] = useState(false);
  const [form, setForm] = useState<FormEdicao | null>(null);
  const [erroEdicao, setErroEdicao] = useState("");
  const [campoEdicao, setCampoEdicao] = useState<string | null>(null);

  const abrirEdicao = useCallback(() => {
    if (!empresa) return;
    setForm(formDe(empresa));
    setErroEdicao("");
    setCampoEdicao(null);
    setModalEdicao(true);
  }, [empresa]);

  const editar = useCallback((mudanca: Partial<FormEdicao>) => {
    setForm((atual) => (atual ? { ...atual, ...mudanca } : atual));
    setCampoEdicao(null);
  }, []);

  // Pessoas só quando o modal abre: a ficha não usa nada disso.
  useEffect(() => {
    if (!modalEdicao) return;

    const controlador = new AbortController();

    if (internos.length === 0) {
      apiGet<RespostaUsuarios>("/api/usuarios-internos", controlador.signal)
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
          if (mensagemDeErro(falha)) setSemAcessoClientes(true);
        });
    }

    return () => controlador.abort();
  }, [modalEdicao, internos.length, clientes.length, semAcessoClientes]);

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

  const erroDoCampo = (campo: string) =>
    campoEdicao === campo ? erroEdicao || "Campo inválido." : null;

  async function salvarEdicao() {
    if (!empresa || !form) return;

    setErroEdicao("");
    setCampoEdicao(null);

    if (form.razaoSocial.trim().length < 2) {
      setCampoEdicao("razaoSocial");
      setErroEdicao("A razão social deve ter pelo menos 2 caracteres.");
      return;
    }

    const cnpjDigitos = somenteDigitos(form.cnpj);
    if (cnpjDigitos.length > 0 && cnpjDigitos.length !== 14) {
      setCampoEdicao("cnpj");
      setErroEdicao("Complete os 14 dígitos do CNPJ.");
      return;
    }

    const cpfDigitos = somenteDigitos(form.socioAdmCpf);
    if (cpfDigitos.length > 0 && cpfDigitos.length !== 11) {
      setCampoEdicao("socioAdmCpf");
      setErroEdicao("Complete o CPF do sócio administrador ou deixe em branco.");
      return;
    }

    const cepDigitos = somenteDigitos(form.cep);
    if (cepDigitos.length > 0 && cepDigitos.length !== 8) {
      setCampoEdicao("cep");
      setErroEdicao("Complete o CEP ou deixe em branco.");
      return;
    }

    // Só as chaves que mudaram. `null` limpa, chave ausente mantém — é a
    // diferença que a rota usa para não apagar campo que ninguém tocou.
    const payload: Record<string, unknown> = {};

    /**
     * CNPJ só entra no payload quando a empresa AINDA NÃO TEM.
     *
     * É o fim do processo de abertura: a empresa foi cadastrada sem número, o
     * Registro Digital saiu, e agora o CNPJ é gravado. A rota recusa troca e
     * recusa apagar — aqui a guarda é a mesma, para o campo nem tentar enviar.
     */
    if (!empresa.cnpj && cnpjDigitos) payload.cnpj = cnpjDigitos;

    const grupo = form.grupo.trim();
    if (grupo !== (empresa.grupo ?? "")) payload.grupo = grupo || null;

    const razao = form.razaoSocial.trim();
    if (razao !== empresa.razaoSocial) payload.razaoSocial = razao;

    const fantasia = form.nomeFantasia.trim();
    if (fantasia !== (empresa.nomeFantasia ?? "")) {
      payload.nomeFantasia = fantasia || null;
    }

    if (form.planoInterno !== empresa.planoInterno) {
      payload.planoInterno = form.planoInterno;
    }
    /**
     * Situação só vai quando foi mexida À MÃO e o plano NÃO mudou.
     *
     * A rota recalcula a situação a partir do plano quando o plano muda, e um
     * `situacao` explícito no mesmo corpo venceria esse recálculo — mandando o
     * valor velho junto com o plano novo, a empresa ficaria "Suspensa" depois de
     * entrar no Plano Simples. Mandar só quando o plano ficou igual preserva o
     * uso legítimo do campo, que é marcar ENCERRADA.
     */
    if (
      form.planoInterno === empresa.planoInterno &&
      form.situacao !== empresa.situacao
    ) {
      payload.situacao = form.situacao;
    }
    if (form.tributoLocal !== empresa.tributoLocal) {
      payload.tributoLocal = form.tributoLocal;
    }

    const im = form.inscricaoMunicipal.trim();
    if (im !== (empresa.inscricaoMunicipal ?? "")) {
      payload.inscricaoMunicipal = im || null;
    }

    const ie = form.inscricaoEstadual.trim();
    if (ie !== (empresa.inscricaoEstadual ?? "")) {
      payload.inscricaoEstadual = ie || null;
    }

    if (cepDigitos !== (empresa.cep ?? "")) payload.cep = cepDigitos || null;

    const logradouro = form.logradouro.trim();
    if (logradouro !== (empresa.logradouro ?? "")) {
      payload.logradouro = logradouro || null;
    }

    const numero = form.numero.trim();
    if (numero !== (empresa.numero ?? "")) payload.numero = numero || null;

    const complemento = form.complemento.trim();
    if (complemento !== (empresa.complemento ?? "")) {
      payload.complemento = complemento || null;
    }

    const bairro = form.bairro.trim();
    if (bairro !== (empresa.bairro ?? "")) payload.bairro = bairro || null;

    const uf = form.uf.trim().toUpperCase();
    if (uf !== (empresa.uf ?? "")) payload.uf = uf || null;

    const municipio = form.municipio.trim();
    if (municipio !== (empresa.municipio ?? "")) {
      payload.municipio = municipio || null;
    }

    const respOperacional = form.responsavelOperacional.trim();
    if (respOperacional !== (empresa.responsavelOperacional ?? "")) {
      payload.responsavelOperacional = respOperacional || null;
    }

    const socio = form.socioAdmNome.trim();
    if (socio !== (empresa.socioAdmNome ?? "")) {
      payload.socioAdmNome = socio || null;
    }

    if (cpfDigitos !== (empresa.socioAdmCpf ?? "")) {
      payload.socioAdmCpf = cpfDigitos || null;
    }

    if (form.responsavelId !== (empresa.responsavelId ?? "")) {
      payload.responsavelId = form.responsavelId || null;
    }

    // Campo escondido nunca entra no payload: `userId: null` desvincularia o
    // login do cliente sem que quem edita tivesse visto o campo.
    if (!semAcessoClientes && form.userId !== (empresa.userId ?? "")) {
      payload.userId = form.userId || null;
    }

    const observacoes = form.observacoes.trim();
    if (observacoes !== (empresa.observacoes ?? "")) {
      payload.observacoes = observacoes || null;
    }

    if (Object.keys(payload).length === 0) {
      setErroEdicao("Nenhuma alteração para salvar.");
      return;
    }

    setOcupado(true);
    try {
      await apiPatch(`/api/empresas/${id}`, payload);
      setModalEdicao(false);
      setMensagemOk("Cadastro da empresa atualizado.");
      recarregar();
    } catch (falha) {
      if (falha instanceof ErroApi) {
        if (falha.campo) setCampoEdicao(falha.campo);
        setErroEdicao(falha.message);
      } else {
        setErroEdicao(mensagemDeErro(falha) || "Não foi possível salvar.");
      }
    } finally {
      setOcupado(false);
    }
  }

  /* ------------------------------- Regime -------------------------------- */

  const vigente = useMemo(
    () => empresa?.regimeHistorico.find((h) => h.vigenciaFim === null) ?? null,
    [empresa]
  );

  const [modalRegime, setModalRegime] = useState(false);
  const [novoRegime, setNovoRegime] = useState("");
  const [vigenciaInicio, setVigenciaInicio] = useState("");
  const [motivoRegime, setMotivoRegime] = useState("");
  const [erroRegime, setErroRegime] = useState("");
  const [campoRegime, setCampoRegime] = useState<string | null>(null);

  const minVigencia = useMemo(
    () => diaSeguinte(vigente?.vigenciaInicio),
    [vigente]
  );

  const opcoesNovoRegime = useMemo<Opcao[]>(
    () =>
      REGIMES.filter((r) => r !== empresa?.regime).map((valor) => ({
        valor,
        texto: REGIME_LABEL[valor] ?? valor,
      })),
    [empresa?.regime]
  );

  const abrirRegime = useCallback(() => {
    setNovoRegime(opcoesNovoRegime[0]?.valor ?? "");
    setVigenciaInicio("");
    setMotivoRegime("");
    setErroRegime("");
    setCampoRegime(null);
    setModalRegime(true);
  }, [opcoesNovoRegime]);

  const erroDoCampoRegime = (campo: string) =>
    campoRegime === campo ? erroRegime || "Campo inválido." : null;

  async function alterarRegime() {
    if (!empresa) return;

    setErroRegime("");
    setCampoRegime(null);

    if (!novoRegime) {
      setCampoRegime("regime");
      setErroRegime("Escolha o novo regime.");
      return;
    }
    if (!vigenciaInicio) {
      setCampoRegime("vigenciaInicio");
      setErroRegime("Informe a data de início da vigência do novo regime.");
      return;
    }

    setOcupado(true);
    try {
      const resposta = await apiPost<RespostaRegime>(
        `/api/empresas/${id}/regime`,
        {
          regime: novoRegime,
          vigenciaInicio,
          motivo: motivoRegime.trim() || undefined,
        }
      );

      const de =
        REGIME_LABEL[resposta.regimeAnterior] ?? resposta.regimeAnterior;
      const para =
        REGIME_LABEL[resposta.empresa.regime] ?? resposta.empresa.regime;

      setModalRegime(false);
      setMensagemOk(`Regime alterado de ${de} para ${para}.`);
      recarregar();
    } catch (falha) {
      if (falha instanceof ErroApi) {
        if (falha.campo) setCampoRegime(falha.campo);
        setErroRegime(falha.message);
      } else {
        setErroRegime(
          mensagemDeErro(falha) || "Não foi possível alterar o regime."
        );
      }
    } finally {
      setOcupado(false);
    }
  }

  /* ------------------------------- Estados -------------------------------- */

  if (carregando && !empresa) {
    return (
      <div className="cz-tarefas mx-auto max-w-[1800px] space-y-6 p-6">
        <Carregando texto="Carregando empresa" />
      </div>
    );
  }

  if (naoEncontrada) {
    return (
      <div className="cz-tarefas mx-auto max-w-[1800px] space-y-6 p-6">
        <Cabecalho
          titulo="Empresa não encontrada"
          icone="Building2"
          voltarPara="/admin/empresas"
          voltarTexto="Voltar para empresas"
        />
        <Vazio
          icone="Building2"
          titulo="Esta empresa não existe mais ou o endereço está errado."
          descricao="O cadastro pode ter sido removido, ou o identificador do endereço pode estar incompleto. Volte para a lista e procure pela razão social ou pelo CNPJ."
          acao={
            <Link
              href="/admin/empresas"
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
            >
              <Icone nome="ArrowLeft" className="h-4 w-4" />
              Ver todas as empresas
            </Link>
          }
        />
      </div>
    );
  }

  if (!empresa) {
    return (
      <div className="cz-tarefas mx-auto max-w-[1800px] space-y-6 p-6">
        <Cabecalho
          titulo="Empresa"
          icone="Building2"
          voltarPara="/admin/empresas"
          voltarTexto="Voltar para empresas"
        />
        <Aviso mensagem={erro || "Não foi possível carregar a empresa."} />
        <Botao variante="secundario" icone="RefreshCw" onClick={recarregar}>
          Tentar novamente
        </Botao>
      </div>
    );
  }

  /* -------------------------------- Render -------------------------------- */

  const descricao = [
    empresa.grupo,
    empresa.nomeFantasia,
    empresa.cnpjFormatado ?? "em abertura",
  ]
    .filter((parte): parte is string => Boolean(parte))
    .join(" · ");

  /**
   * Endereço em uma linha.
   *
   * Montado aqui e não no template para partes ausentes não virarem vírgula
   * sobrando: "Rua X, , , São Paulo" é o resultado de interpolar campo vazio.
   */
  const enderecoCompleto = [
    [empresa.logradouro, empresa.numero].filter(Boolean).join(", ") || null,
    empresa.complemento,
    empresa.bairro,
    empresa.cepFormatado,
  ]
    .filter((parte): parte is string => Boolean(parte))
    .join(" · ");

  return (
    <div className="cz-tarefas mx-auto max-w-[1800px] space-y-6 p-6">
      <Cabecalho
        titulo={empresa.razaoSocial}
        descricao={descricao}
        icone="Building2"
        voltarPara="/admin/empresas"
        voltarTexto="Voltar para empresas"
        acoes={
          <>
            {permissoes.gerenciarEmpresa && (
              <Botao
                variante="secundario"
                icone="Pencil"
                onClick={abrirEdicao}
                disabled={ocupado}
              >
                Editar
              </Botao>
            )}
            {permissoes.alterarRegime && (
              <Botao icone="Landmark" onClick={abrirRegime} disabled={ocupado}>
                Alterar regime
              </Botao>
            )}
          </>
        }
      />

      {mensagemOk && (
        <Aviso
          tom="ok"
          mensagem={mensagemOk}
          onFechar={() => setMensagemOk("")}
        />
      )}

      {erro && (
        <div className="space-y-3">
          <Aviso mensagem={erro} onFechar={() => setErro("")} />
          <Botao variante="secundario" icone="RefreshCw" onClick={recarregar}>
            Tentar novamente
          </Botao>
        </div>
      )}

      {/* ---------------------------- Faixa resumo -------------------------- */}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <SeloRegime regime={empresa.regime} completo />
        <SeloSituacaoEmpresa situacao={empresa.situacao} />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700">
          <Icone nome="Landmark" className="h-3.5 w-3.5" />
          {TRIBUTO_LOCAL_LABEL[empresa.tributoLocal] ?? empresa.tributoLocal}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600">
          <Icone nome="Info" className="h-3.5 w-3.5 text-gray-400" />
          {empresa.uf || empresa.municipio
            ? [empresa.uf, empresa.municipio].filter(Boolean).join(" · ")
            : "Localização não informada"}
        </span>

        <span className="ml-auto flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
            <Icone nome="Calendar" className="h-4 w-4 text-orange-500" />
            <strong className="font-semibold text-gray-900">
              {empresa._count.apuracoes}
            </strong>
            {empresa._count.apuracoes === 1 ? "competência" : "competências"}
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
            <Icone nome="Briefcase" className="h-4 w-4 text-orange-500" />
            <strong className="font-semibold text-gray-900">
              {empresa._count.processos}
            </strong>
            {empresa._count.processos === 1 ? "processo" : "processos"}
          </span>
        </span>
      </div>

      {/* ------------------------------ Cadastro ---------------------------- */}

      <Painel
        titulo="Cadastro"
        descricao="CNPJ e regime não são editados aqui. Ver as notas de cada um abaixo."
      >
        <dl className="grid gap-x-6 gap-y-5 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
          <Dado rotulo="CNPJ">
            {empresa.cnpjFormatado ? (
              <span className="font-mono">{empresa.cnpjFormatado}</span>
            ) : (
              // Empresa em abertura: o texto diz o motivo, porque "não
              // informado" aqui pareceria cadastro pela metade.
              <span className="inline-flex items-center gap-1.5 font-normal text-gray-500">
                <Icone nome="Hourglass" className="h-3.5 w-3.5 shrink-0" />
                Em abertura — o CNPJ ainda não existe
              </span>
            )}
          </Dado>
          <Dado rotulo="Nome do grupo">
            {empresa.grupo ?? (
              <span className="font-normal text-gray-400">Não informado</span>
            )}
          </Dado>
          <Dado rotulo="Razão social">{empresa.razaoSocial}</Dado>
          <Dado rotulo="Nome fantasia">
            {empresa.nomeFantasia ?? (
              <span className="font-normal text-gray-400">Não informado</span>
            )}
          </Dado>
          <Dado rotulo="Plano interno ContaZoom">
            <SeloPlanoInterno plano={empresa.planoInterno} />
          </Dado>
          <Dado rotulo="Regime vigente">
            <SeloRegime regime={empresa.regime} completo />
          </Dado>
          <Dado rotulo="Situação">
            <SeloSituacaoEmpresa situacao={empresa.situacao} />
            {/* A situação passou a ser calculada. Sem esta nota, quem procura o
                campo para editar não encontra e conclui que a tela está
                quebrada. */}
            <span className="mt-1 block text-xs font-normal text-gray-500">
              Calculada a partir do plano interno e do CNPJ.
            </span>
          </Dado>
          <Dado rotulo="Tributo local">
            {TRIBUTO_LOCAL_LABEL[empresa.tributoLocal] ?? empresa.tributoLocal}
          </Dado>
          <Dado rotulo="Inscrição municipal">
            {empresa.inscricaoMunicipal ?? (
              <span className="font-normal text-gray-400">Não informada</span>
            )}
          </Dado>
          <Dado rotulo="Inscrição estadual">
            {empresa.inscricaoEstadual ?? (
              <span className="font-normal text-gray-400">Não informada</span>
            )}
          </Dado>
          <Dado rotulo="Endereço">
            {enderecoCompleto ? (
              <span className="font-normal">{enderecoCompleto}</span>
            ) : (
              <span className="font-normal text-gray-400">Não informado</span>
            )}
          </Dado>
          <Dado rotulo="UF">
            {empresa.uf ?? (
              <span className="font-normal text-gray-400">Não informada</span>
            )}
          </Dado>
          <Dado rotulo="Município">
            {empresa.municipio ?? (
              <span className="font-normal text-gray-400">Não informado</span>
            )}
          </Dado>
          <Dado rotulo="Responsável operacional">
            {empresa.responsavelOperacional ?? (
              <span className="font-normal text-gray-400">Não informado</span>
            )}
          </Dado>
          <Dado rotulo="Sócio administrador">
            {empresa.socioAdmNome ?? (
              <span className="font-normal text-gray-400">Não informado</span>
            )}
            {empresa.socioAdmCpfFormatado && (
              <span className="mt-0.5 block font-mono text-xs font-normal text-gray-500">
                {empresa.socioAdmCpfFormatado}
              </span>
            )}
          </Dado>
          <Dado rotulo="Início de atividade">
            {dataCurta(empresa.inicioAtividade)}
          </Dado>
          <Dado rotulo="Cliente vinculado">
            {empresa.user ? (
              <>
                {empresa.user.name?.trim() || empresa.user.email}
                <span className="mt-0.5 block text-xs font-normal text-gray-500">
                  {empresa.user.email}
                </span>
              </>
            ) : (
              <span className="font-normal text-gray-400">
                Nenhum login vinculado
              </span>
            )}
          </Dado>
          <Dado rotulo="Responsável interno">
            {empresa.responsavel ? (
              <>
                {empresa.responsavel.name?.trim() || empresa.responsavel.email}
                <span className="mt-0.5 block text-xs font-normal text-gray-500">
                  {empresa.responsavel.email}
                </span>
              </>
            ) : (
              <span className="font-normal text-gray-400">
                Sem responsável definido
              </span>
            )}
          </Dado>
          <Dado rotulo="Cadastrada em">{dataCurta(empresa.createdAt)}</Dado>
          <Dado rotulo="Última alteração">{dataHora(empresa.updatedAt)}</Dado>
        </dl>

        {empresa.observacoes && (
          <div className="border-t border-gray-100 px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Observações
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-sm text-gray-700">
              {empresa.observacoes}
            </p>
          </div>
        )}
      </Painel>

      {/* -------------------------- Histórico regime ------------------------ */}

      <Painel
        titulo="Histórico de regime"
        descricao={
          vigente
            ? `Regime vigente desde ${dataCurta(vigente.vigenciaInicio)}.`
            : "Nenhuma vigência registrada."
        }
        acoes={
          permissoes.alterarRegime ? (
            <Botao
              variante="secundario"
              icone="Landmark"
              onClick={abrirRegime}
              disabled={ocupado}
            >
              Alterar regime
            </Botao>
          ) : undefined
        }
      >
        <p className="flex items-start gap-2 border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs text-gray-600">
          <Icone nome="Info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            A apuração guarda o regime CONGELADO no momento em que foi aberta.
            Um desenquadramento em julho não transforma a apuração de março em
            outro regime, porque as etapas executadas em março foram as do
            regime de março. Este histórico é o que permite auditar isso: dada
            uma competência, ele diz qual regime valia naquela data e quem
            registrou a mudança.
          </span>
        </p>

        {empresa.regimeHistorico.length === 0 ? (
          <div className="px-5 py-5">
            <Vazio
              icone="History"
              titulo="Nenhuma vigência de regime registrada."
              descricao="O cadastro da empresa abre a primeira linha do histórico. Se esta lista está vazia, o registro inicial não foi criado."
            />
          </div>
        ) : (
          <ol className="divide-y divide-gray-100">
            {empresa.regimeHistorico.map((linha) => {
              const atual = linha.vigenciaFim === null;
              return (
                <li
                  key={linha.id}
                  className={`flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:gap-4 ${
                    atual ? "border-l-4 border-l-orange-500 bg-orange-50/40" : ""
                  }`}
                >
                  <div className="flex shrink-0 items-center gap-2">
                    <SeloRegime regime={linha.regime} completo />
                    {atual && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-white px-2 py-0.5 text-xs font-semibold text-orange-700">
                        <Icone nome="CircleDot" className="h-3 w-3" />
                        Vigente
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {atual
                        ? `desde ${dataCurta(linha.vigenciaInicio)} (vigente)`
                        : `de ${dataCurta(
                            linha.vigenciaInicio
                          )} a ${dataCurta(linha.vigenciaFim)}`}
                    </p>
                    {linha.motivo && (
                      <p className="mt-1 text-sm text-gray-600">
                        {linha.motivo}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      {linha.registradoPor
                        ? `Registrado por ${linha.registradoPor}`
                        : "Sem registro de autoria"}
                      {" · "}
                      {dataHora(linha.createdAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Painel>

      {/* ------------------------ Últimas competências ---------------------- */}

      <Painel
        titulo="Últimas competências"
        descricao={
          empresa._count.apuracoes > 0
            ? `${plural(
                empresa._count.apuracoes,
                "competência no total",
                "competências no total"
              )}. Esta lista mostra no máximo as 12 mais recentes.`
            : undefined
        }
        acoes={
          <Link
            href={`/admin/tarefas/apuracao?empresaId=${empresa.id}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 transition-colors hover:text-orange-700"
          >
            Ver todas
            <Icone nome="ChevronRight" className="h-4 w-4" />
          </Link>
        }
      >
        {empresa.apuracoes.length === 0 ? (
          <div className="px-5 py-5">
            <Vazio
              icone="CalendarPlus"
              titulo="Nenhuma competência aberta para esta empresa."
              descricao="A competência é aberta na tela de apuração fiscal. Enquanto não existir, não há etapas para o escritório executar neste mês."
            />
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {empresa.apuracoes.map((apuracao) => {
              const total = totalEtapasSeguro(apuracao.regime);
              const congeladoDiferente = apuracao.regime !== empresa.regime;

              return (
                <li key={apuracao.id}>
                  <Link
                    href={`/admin/tarefas/apuracao/${apuracao.id}`}
                    className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-orange-50/40 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <span className="w-36 shrink-0 text-sm font-semibold text-gray-900">
                      {competenciaLabel(apuracao.ano, apuracao.mes)}
                    </span>

                    <span className="flex flex-wrap items-center gap-2">
                      <SeloRegime regime={apuracao.regime} />
                      {congeladoDiferente && (
                        <span
                          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500"
                          title={`Esta competência foi aberta no regime ${
                            REGIME_LABEL[apuracao.regime] ?? apuracao.regime
                          }, que era o vigente na época. A empresa está hoje em ${
                            REGIME_LABEL[empresa.regime] ?? empresa.regime
                          }, e o regime da apuração não muda depois de aberta.`}
                        >
                          <Icone nome="Info" className="h-3.5 w-3.5" />
                          regime da época
                        </span>
                      )}
                      <SeloStatus status={apuracao.status} curto />
                      {apuracao.bloqueada && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-[#FEDF89] bg-[#FFFAEB] px-2.5 py-1 text-xs font-semibold text-[#B54708]"
                          title={
                            apuracao.bloqueioMotivo ??
                            "Pendência aberta, sem motivo registrado."
                          }
                        >
                          <Icone nome="Lock" className="h-3.5 w-3.5" />
                          Pendência
                        </span>
                      )}
                    </span>

                    <span className="text-xs text-gray-600 sm:ml-auto">
                      {total
                        ? `Etapa ${apuracao.etapaAtual} de ${total}`
                        : `Etapa ${apuracao.etapaAtual}`}
                    </span>

                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-gray-600">
                      <Icone
                        nome="CalendarCheck"
                        className="h-3.5 w-3.5 text-gray-400"
                      />
                      {apuracao.prazoEntrega
                        ? dataCurta(apuracao.prazoEntrega)
                        : "Sem prazo"}
                    </span>

                    <Icone
                      nome="ChevronRight"
                      className="hidden h-4 w-4 shrink-0 text-gray-400 sm:block"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Painel>

      {/* ------------------------ Processos em aberto ----------------------- */}

      <Painel
        titulo="Processos em aberto"
        descricao="Legalização em curso: abertura, encerramento, regularização, alteração cadastral e desenquadramento."
        acoes={
          <Link
            href={`/admin/tarefas/legalizacao?empresaId=${empresa.id}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 transition-colors hover:text-orange-700"
          >
            Ver todos
            <Icone nome="ChevronRight" className="h-4 w-4" />
          </Link>
        }
      >
        {empresa.processos.length === 0 ? (
          <div className="px-5 py-5">
            <Vazio
              icone="Briefcase"
              titulo="Nenhum processo de legalização em aberto."
              descricao="Processos já concluídos não aparecem aqui. Use Ver todos para consultar o histórico completo desta empresa."
            />
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {empresa.processos.map((processo) => (
              <li key={processo.id}>
                <Link
                  href={`/admin/tarefas/legalizacao/${processo.id}`}
                  className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-orange-50/40 sm:flex-row sm:items-center sm:gap-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900">
                      {TIPO_PROCESSO_LABEL[processo.tipo] ?? processo.tipo}
                    </span>
                    {(processo.protocoloExterno || processo.orgaoExterno) && (
                      <span className="mt-0.5 block text-xs text-gray-500">
                        {[
                          processo.orgaoExterno
                            ? ORGAO_EXTERNO_LABEL[processo.orgaoExterno] ??
                              processo.orgaoExterno
                            : null,
                          processo.protocoloExterno
                            ? `protocolo ${processo.protocoloExterno}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </span>

                  <span className="flex flex-wrap items-center gap-2">
                    <SeloStatus status={processo.status} curto />
                    {processo.bloqueada && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#FEDF89] bg-[#FFFAEB] px-2.5 py-1 text-xs font-semibold text-[#B54708]">
                        <Icone nome="Lock" className="h-3.5 w-3.5" />
                        Pendência
                      </span>
                    )}
                  </span>

                  <span className="whitespace-nowrap text-xs text-gray-600">
                    Etapa {processo.etapaAtual}
                  </span>

                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-gray-600">
                    <Icone
                      nome="CalendarCheck"
                      className="h-3.5 w-3.5 text-gray-400"
                    />
                    {processo.prazoEstimado
                      ? dataCurta(processo.prazoEstimado)
                      : "Sem prazo"}
                  </span>

                  <Icone
                    nome="ChevronRight"
                    className="hidden h-4 w-4 shrink-0 text-gray-400 sm:block"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Painel>

      {/* ---------------------------- Modal edição -------------------------- */}

      <Modal
        aberto={modalEdicao}
        titulo="Editar empresa"
        icone="Pencil"
        largura="lg"
        descricao="Só os campos alterados são enviados. Apagar um campo opcional limpa o valor gravado."
        onFechar={() => setModalEdicao(false)}
        rodape={
          <>
            <Botao
              variante="secundario"
              onClick={() => setModalEdicao(false)}
              disabled={ocupado}
            >
              Cancelar
            </Botao>
            <Botao
              icone="Save"
              onClick={salvarEdicao}
              carregando={ocupado}
              textoCarregando="Salvando"
            >
              Salvar alterações
            </Botao>
          </>
        }
      >
        {form && (
          <div className="space-y-6">
            {erroEdicao && !campoEdicao && <Aviso mensagem={erroEdicao} />}

            {/* ----------------------- Identificação ---------------------- */}

            <BlocoForm
              icone="Building2"
              titulo="Identificação"
              descricao={
                empresa.cnpj
                  ? "O CNPJ já está preenchido e não muda mais: apuração, processo e histórico apontam para ele."
                  : "Empresa em abertura. Preencha o CNPJ quando o Registro Digital sair — é a única vez que este campo aceita escrita."
              }
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {empresa.cnpj ? (
                  <div className="rounded-[10px] border border-gray-200 bg-gray-50 px-3 py-2.5">
                    <p className="text-[0.8125rem] font-semibold leading-5 text-[#14161B]">
                      CNPJ
                    </p>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-gray-900">
                      {empresa.cnpjFormatado}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      Trocar o número transformaria este histórico no de outra
                      empresa. CNPJ errado se resolve cadastrando o certo.
                    </p>
                  </div>
                ) : (
                  <EntradaDocumento
                    tipo="cnpj"
                    rotulo="CNPJ"
                    value={form.cnpj}
                    erro={erroDoCampo("cnpj")}
                    ajuda="Grava uma vez, no fim da abertura. Depois não muda."
                    onChange={(cnpj) => editar({ cnpj })}
                  />
                )}
                <Entrada
                  rotulo="Nome do grupo"
                  value={form.grupo}
                  erro={erroDoCampo("grupo")}
                  ajuda="Deixe em branco para limpar."
                  onChange={(e) => editar({ grupo: e.target.value })}
                />
                <Entrada
                  rotulo="Razão social"
                  required
                  value={form.razaoSocial}
                  erro={erroDoCampo("razaoSocial")}
                  onChange={(e) => editar({ razaoSocial: e.target.value })}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Entrada
                  rotulo="Nome fantasia"
                  value={form.nomeFantasia}
                  erro={erroDoCampo("nomeFantasia")}
                  ajuda="Deixe em branco para limpar."
                  onChange={(e) => editar({ nomeFantasia: e.target.value })}
                />
                <Entrada
                  rotulo="Inscrição municipal"
                  value={form.inscricaoMunicipal}
                  erro={erroDoCampo("inscricaoMunicipal")}
                  ajuda='Aceita "ISENTO".'
                  onChange={(e) =>
                    editar({ inscricaoMunicipal: e.target.value })
                  }
                />
                <Entrada
                  rotulo="Inscrição estadual"
                  value={form.inscricaoEstadual}
                  erro={erroDoCampo("inscricaoEstadual")}
                  ajuda='Aceita "ISENTO".'
                  onChange={(e) => editar({ inscricaoEstadual: e.target.value })}
                />
              </div>
            </BlocoForm>

            {/* -------------------------- Endereço ------------------------ */}

            <BlocoForm
              icone="MapPin"
              titulo="Endereço completo"
              descricao="É o endereço que vai para a Junta e para a Prefeitura."
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                <EntradaDocumento
                  tipo="cep"
                  rotulo="CEP"
                  wrapperClassName="lg:col-span-2"
                  value={form.cep}
                  erro={erroDoCampo("cep")}
                  onChange={(cep) => editar({ cep })}
                />
                <Entrada
                  rotulo="Logradouro"
                  wrapperClassName="lg:col-span-3"
                  value={form.logradouro}
                  erro={erroDoCampo("logradouro")}
                  onChange={(e) => editar({ logradouro: e.target.value })}
                />
                <Entrada
                  rotulo="Número"
                  wrapperClassName="lg:col-span-1"
                  maxLength={20}
                  value={form.numero}
                  erro={erroDoCampo("numero")}
                  onChange={(e) => editar({ numero: e.target.value })}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                <Entrada
                  rotulo="Complemento"
                  wrapperClassName="lg:col-span-2"
                  value={form.complemento}
                  erro={erroDoCampo("complemento")}
                  onChange={(e) => editar({ complemento: e.target.value })}
                />
                <Entrada
                  rotulo="Bairro"
                  wrapperClassName="lg:col-span-2"
                  value={form.bairro}
                  erro={erroDoCampo("bairro")}
                  onChange={(e) => editar({ bairro: e.target.value })}
                />
                <Entrada
                  rotulo="Município"
                  wrapperClassName="lg:col-span-1"
                  value={form.municipio}
                  erro={erroDoCampo("municipio")}
                  onChange={(e) => editar({ municipio: e.target.value })}
                />
                <Entrada
                  rotulo="UF"
                  wrapperClassName="lg:col-span-1"
                  maxLength={2}
                  placeholder="SP"
                  value={form.uf}
                  erro={erroDoCampo("uf")}
                  onChange={(e) =>
                    editar({ uf: e.target.value.toUpperCase().slice(0, 2) })
                  }
                />
              </div>
            </BlocoForm>

            {/* --------------------------- Pessoas ------------------------ */}

            <BlocoForm
              icone="Contact"
              titulo="Pessoas"
              descricao="Responsável operacional é do lado do cliente. Responsável interno é quem cuida da empresa aqui dentro."
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Entrada
                  rotulo="Responsável operacional"
                  value={form.responsavelOperacional}
                  erro={erroDoCampo("responsavelOperacional")}
                  onChange={(e) =>
                    editar({ responsavelOperacional: e.target.value })
                  }
                />
                <Entrada
                  rotulo="Sócio administrador"
                  value={form.socioAdmNome}
                  erro={erroDoCampo("socioAdmNome")}
                  onChange={(e) => editar({ socioAdmNome: e.target.value })}
                />
                <EntradaDocumento
                  tipo="cpf"
                  rotulo="CPF do sócio administrador"
                  value={form.socioAdmCpf}
                  erro={erroDoCampo("socioAdmCpf")}
                  onChange={(socioAdmCpf) => editar({ socioAdmCpf })}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Escolha
                  rotulo="Responsável interno"
                  vazio="Sem responsável definido"
                  opcoes={opcoesResponsavel}
                  value={form.responsavelId}
                  erro={erroDoCampo("responsavelId")}
                  onChange={(e) => editar({ responsavelId: e.target.value })}
                />
                {semAcessoClientes ? (
                  <p className="flex items-start gap-1.5 self-end rounded-[10px] border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
                    <Icone nome="Lock" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Somente administrador vincula ou desvincula o login do
                      cliente. O vínculo atual é preservado ao salvar:{" "}
                      {empresa.user
                        ? empresa.user.name?.trim() || empresa.user.email
                        : "nenhum login vinculado"}
                      .
                    </span>
                  </p>
                ) : (
                  <Escolha
                    rotulo="Cliente vinculado"
                    vazio="Nenhum login vinculado"
                    opcoes={opcoesCliente}
                    value={form.userId}
                    erro={erroDoCampo("userId")}
                    ajuda="Login pelo qual o cliente acessa o próprio painel."
                    onChange={(e) => editar({ userId: e.target.value })}
                  />
                )}
              </div>
            </BlocoForm>

            {/* ------------------- Plano e tributação --------------------- */}

            <BlocoForm
              icone="Tag"
              titulo="Plano e tributação"
              descricao="O plano decide se a empresa entra na abertura mensal. O regime tem ação própria porque fecha uma vigência e abre outra no histórico."
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Escolha
                  rotulo="Plano interno ContaZoom"
                  opcoes={OPCOES_PLANO}
                  value={form.planoInterno}
                  erro={erroDoCampo("planoInterno")}
                  ajuda="Simples e Presumido geram competência todo mês."
                  onChange={(e) => editar({ planoInterno: e.target.value })}
                />
                <Escolha
                  rotulo="Situação"
                  opcoes={OPCOES_SITUACAO}
                  value={form.situacao}
                  erro={erroDoCampo("situacao")}
                  disabled={form.planoInterno !== empresa.planoInterno}
                  ajuda={
                    form.planoInterno !== empresa.planoInterno
                      ? "Será recalculada a partir do plano novo ao salvar."
                      : "Normalmente derivada do plano. Mexa só para marcar Encerrada."
                  }
                  onChange={(e) => editar({ situacao: e.target.value })}
                />
                <Escolha
                  rotulo="Tributo local"
                  opcoes={OPCOES_TRIBUTO}
                  value={form.tributoLocal}
                  erro={erroDoCampo("tributoLocal")}
                  ajuda="Nomeia a etapa de ICMS/ISS no Lucro Presumido."
                  onChange={(e) => editar({ tributoLocal: e.target.value })}
                />
              </div>

              <div className="rounded-[10px] border border-gray-200 bg-gray-50 px-3 py-2.5">
                <p className="text-[0.8125rem] font-semibold leading-5 text-[#14161B]">
                  Regime tributário
                </p>
                <p className="mt-0.5 text-sm font-semibold text-gray-900">
                  {REGIME_LABEL[empresa.regime] ?? empresa.regime}
                </p>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  Não editável aqui: mudar regime fecha uma vigência e abre
                  outra no histórico, e por isso tem ação própria em Alterar
                  regime.
                </p>
              </div>

              <Area
                rotulo="Observações"
                rows={3}
                value={form.observacoes}
                erro={erroDoCampo("observacoes")}
                onChange={(e) => editar({ observacoes: e.target.value })}
              />
            </BlocoForm>
          </div>
        )}
      </Modal>

      {/* ---------------------------- Modal regime -------------------------- */}

      <Modal
        aberto={modalRegime}
        titulo="Alterar regime"
        icone="Landmark"
        largura="lg"
        descricao={`Regime atual: ${
          REGIME_LABEL[empresa.regime] ?? empresa.regime
        }.`}
        onFechar={() => setModalRegime(false)}
        rodape={
          <>
            <Botao
              variante="secundario"
              onClick={() => setModalRegime(false)}
              disabled={ocupado}
            >
              Cancelar
            </Botao>
            <Botao
              icone="Landmark"
              onClick={alterarRegime}
              carregando={ocupado}
              textoCarregando="Alterando"
            >
              Confirmar mudança
            </Botao>
          </>
        }
      >
        <div className="space-y-4">
          {erroRegime && !campoRegime && <Aviso mensagem={erroRegime} />}

          <div className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-sm text-[#B54708]">
            <p className="flex items-start gap-2 font-semibold">
              <Icone nome="AlertTriangle" className="mt-0.5 h-4 w-4 shrink-0" />
              Antes de confirmar
            </p>
            <ul className="mt-2 space-y-1.5 pl-6 text-xs">
              <li className="list-disc">
                {vigente ? (
                  <>
                    A vigência do novo regime tem de ser{" "}
                    <strong>posterior a {dataCurta(vigente.vigenciaInicio)}</strong>
                    , início do regime atual. Data igual ou anterior é recusada.
                  </>
                ) : (
                  <>
                    Não há vigência aberta no histórico desta empresa; qualquer
                    data válida é aceita.
                  </>
                )}
              </li>
              <li className="list-disc">
                As apurações <strong>já abertas mantêm o regime que tinham</strong>
                . O regime é congelado na criação da competência, então a
                mudança vale só para as próximas.
              </li>
              <li className="list-disc">
                A vigência anterior é encerrada no dia anterior à data
                informada, e a mudança fica registrada no histórico com o seu
                nome.
              </li>
            </ul>
          </div>

          <Escolha
            rotulo="Novo regime"
            required
            opcoes={opcoesNovoRegime}
            value={novoRegime}
            erro={erroDoCampoRegime("regime")}
            ajuda="O regime atual não aparece na lista: a rota recusa mudança para o mesmo regime."
            onChange={(e) => {
              setNovoRegime(e.target.value);
              setCampoRegime(null);
            }}
          />

          <Entrada
            rotulo="Início da vigência"
            type="date"
            required
            value={vigenciaInicio}
            min={minVigencia || undefined}
            erro={erroDoCampoRegime("vigenciaInicio")}
            ajuda={
              vigente
                ? `A partir de ${dataCurta(
                    minVigencia
                  )}. É esta data que decide de qual competência em diante a apuração muda de fluxo.`
                : "É esta data que decide de qual competência em diante a apuração muda de fluxo."
            }
            onChange={(e) => {
              setVigenciaInicio(e.target.value);
              setCampoRegime(null);
            }}
          />

          <Area
            rotulo="Motivo"
            rows={3}
            value={motivoRegime}
            erro={erroDoCampoRegime("motivo")}
            ajuda="Opcional, mas fica no histórico. Exemplo: excesso de faturamento, atividade impeditiva, opção da empresa."
            placeholder="O que motivou a mudança de regime"
            onChange={(e) => setMotivoRegime(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
