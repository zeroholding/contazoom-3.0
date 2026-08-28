"use client";

/**
 * Detalhe de um processo de legalização.
 *
 * Quatro decisões que atravessam o arquivo:
 *
 * 1. DEPOIS DE CADA ESCRITA, RECARREGO O GET INTEIRO. Quase toda rota de
 *    escrita da legalização devolve o registro cru: `PATCH /[id]` vem sem
 *    relações, `POST /bloqueio` vem sem etapas, `PATCH /protocolo` com
 *    `alterado:false` vem com TRÊS campos. Montar o estado a partir dessas
 *    respostas faria a tela divergir do banco em silêncio — o pior tipo de bug
 *    numa tela que serve de prova do que foi feito.
 *
 * 2. UMA flag `ocupado` para toda escrita. Duas ações em voo no mesmo processo
 *    (concluir etapa e encerrar, por exemplo) produzem log fora de ordem.
 *
 * 3. Abertura de CNPJ é o caso especial do módulo: o processo existe ANTES da
 *    empresa, porque o CNPJ é o que ele produz. A tela diz isso na cara e
 *    avisa que a última etapa não fecha sem vínculo, em vez de deixar o
 *    operador tomar 409 `empresa_nao_vinculada` no fim do trabalho.
 *
 * 4. Desenquadramento é o único processo que altera cadastro: concluir a última
 *    etapa TROCA o regime da empresa. Então o modal exige o regime novo, explica
 *    o efeito e avisa que reabrir depois não desfaz a troca.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  ErroApi,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  mensagemDeErro,
  query,
} from "@/app/components/views/ui/tarefas/api";
import type {
  EmpresaLista,
  Etapa,
  Pagination,
  ProcessoDetalhe,
  UsuarioInterno,
} from "@/app/components/views/ui/tarefas/tipos";
import {
  dataCurta,
  dataHora,
  formatarCnpj,
  iniciais,
  nomeEmpresa,
  plural,
} from "@/app/components/views/ui/tarefas/formato";
import {
  Aviso,
  Cabecalho,
  Carregando,
  Dado,
  Painel,
  Progresso,
  Vazio,
} from "@/app/components/views/ui/tarefas/Base";
import {
  Abas,
  Area,
  Botao,
  Entrada,
  Escolha,
  type Opcao,
} from "@/app/components/views/ui/tarefas/Campos";
import { Modal, ModalMotivo } from "@/app/components/views/ui/tarefas/Modal";
import {
  SeloBloqueio,
  SeloPrazo,
  SeloRegime,
  SeloSituacaoEmpresa,
  SeloStatus,
} from "@/app/components/views/ui/tarefas/Selos";
import ListaEtapas from "@/app/components/views/ui/tarefas/ListaEtapas";
import Historico from "@/app/components/views/ui/tarefas/Historico";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import {
  BLOQUEIO_RESPONSAVEL_LABEL,
  ORGAO_EXTERNO,
  ORGAO_EXTERNO_LABEL,
  REGIME,
  REGIME_LABEL,
  SITUACAO_EMPRESA_LABEL,
  TIPO_PROCESSO,
  TIPO_PROCESSO_LABEL,
  TRIBUTO_LOCAL,
  TRIBUTO_LOCAL_LABEL,
} from "@/lib/tarefa-etapas";
import { useSessao } from "@/hooks/useSessao";

/* -------------------------------------------------------------------------- */
/*                            Contratos das rotas                             */
/* -------------------------------------------------------------------------- */

type RespostaConcluir = {
  etapaConcluida: number;
  proximaEtapa: { numero: number; titulo: string } | null;
  processoConcluido: boolean;
  status: string;
  regimeAlterado: { de: string; para: string } | null;
};

type RespostaDispensar = {
  etapaDispensada: number;
  proximaEtapa: { numero: number; titulo: string } | null;
  status: string;
};

type RespostaResolverBloqueio = { status: string; diasBloqueado: number | null };

/**
 * ARMADILHA do protocolo: com `alterado:false` o `processo` devolvido tem só
 * `id`, `protocoloExterno` e `orgaoExterno`. Por isso o tipo aqui não promete
 * mais que `alterado` — quem usar o resto tem de recarregar o GET.
 */
type RespostaProtocolo = { alterado: boolean };

type RespostaVinculo = {
  empresa: {
    id: string;
    cnpj: string;
    razaoSocial: string;
    regime: string;
    situacao?: string;
  };
  empresaCriada: boolean;
};

type RespostaEmpresas = { empresas: EmpresaLista[]; pagination: Pagination };
type RespostaUsuarios = { usuarios: UsuarioInterno[]; total: number };

/* -------------------------------------------------------------------------- */
/*                                  Domínio                                   */
/* -------------------------------------------------------------------------- */

const OPCOES_ORGAO: Opcao[] = (Object.values(ORGAO_EXTERNO) as string[]).map(
  (valor) => ({ valor, texto: ORGAO_EXTERNO_LABEL[valor] ?? valor })
);

const OPCOES_REGIME: Opcao[] = (Object.values(REGIME) as string[]).map(
  (valor) => ({ valor, texto: REGIME_LABEL[valor] ?? valor })
);

const OPCOES_TRIBUTO: Opcao[] = (Object.values(TRIBUTO_LOCAL) as string[]).map(
  (valor) => ({ valor, texto: TRIBUTO_LOCAL_LABEL[valor] ?? valor })
);

const OPCOES_BLOQUEIO: Opcao[] = [
  "CLIENTE",
  "ESCRITORIO",
  "COMERCIAL_CZ",
  "TERCEIRO",
].map((valor) => ({
  valor,
  texto: BLOQUEIO_RESPONSAVEL_LABEL[valor] ?? valor,
}));

/** Motivo de bloqueio e de retorno exige 3 caracteres na legalização (5 na apuração). */
const MINIMO_MOTIVO = 3;

/**
 * ISO para o valor de `<input type="date">`.
 *
 * As datas do módulo são gravadas à meia-noite UTC; converter com o fuso local
 * imprimiria o dia anterior no campo e a pessoa "corrigiria" um prazo certo.
 */
function paraCampoData(valor: string | null | undefined): string {
  if (!valor) return "";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(data.getUTCDate()).padStart(2, "0");
  return `${data.getUTCFullYear()}-${mes}-${dia}`;
}

/** Máscara de CNPJ conforme se digita. A rota valida o dígito verificador. */
function mascararCnpj(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 14);
  let saida = digitos;
  if (digitos.length > 2) saida = `${digitos.slice(0, 2)}.${digitos.slice(2)}`;
  if (digitos.length > 5) {
    saida = `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5)}`;
  }
  if (digitos.length > 8) {
    saida = `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(
      5,
      8
    )}/${digitos.slice(8)}`;
  }
  if (digitos.length > 12) {
    saida = `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(
      5,
      8
    )}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
  }
  return saida;
}

function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** Etapas que ainda não foram concluídas nem dispensadas. */
function etapasNaoResolvidas(etapas: Etapa[]): Etapa[] {
  return etapas.filter(
    (e) => e.situacao !== "CONCLUIDA" && e.situacao !== "NAO_APLICAVEL"
  );
}

/**
 * É a última etapa que ainda se aplica?
 *
 * Espelha `proximaEtapaAplicavel` do servidor: etapa dispensada não conta, então
 * a etapa 7 pode ser a última se a 8 estiver marcada como não aplicável. É essa
 * conta que decide se o desenquadramento vai exigir o regime novo.
 */
function ehUltimaAplicavel(etapa: Etapa, etapas: Etapa[]): boolean {
  return !etapas.some(
    (e) => e.numero > etapa.numero && e.situacao !== "NAO_APLICAVEL"
  );
}

/* -------------------------------------------------------------------------- */
/*                                    View                                    */
/* -------------------------------------------------------------------------- */

export default function LegalizacaoDetalheView({ id }: { id: string }) {
  const { permissoes } = useSessao();

  const [processo, setProcesso] = useState<ProcessoDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [primeiraCarga, setPrimeiraCarga] = useState(true);
  const [erro, setErro] = useState("");
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [mensagemOk, setMensagemOk] = useState("");
  const [avisoInfo, setAvisoInfo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [aba, setAba] = useState("etapas");

  /* ------------------------------- Carga ---------------------------------- */

  useEffect(() => {
    const controlador = new AbortController();
    let vivo = true;

    setCarregando(true);
    setErro("");

    apiGet<ProcessoDetalhe>(
      `/api/tarefas/legalizacao/${id}`,
      controlador.signal
    )
      .then((dados) => {
        if (!vivo) return;
        setProcesso(dados);
        setNaoEncontrado(false);
      })
      .catch((falha) => {
        if (!vivo) return;
        const mensagem = mensagemDeErro(falha);
        if (!mensagem) return; // Abortado.
        if (
          falha instanceof ErroApi &&
          (falha.code === "processo_nao_encontrado" || falha.status === 404)
        ) {
          setNaoEncontrado(true);
          return;
        }
        setErro(mensagem);
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
  }, [id, recarga]);

  const recarregar = useCallback(() => setRecarga((n) => n + 1), []);

  const [usuarios, setUsuarios] = useState<UsuarioInterno[]>([]);

  useEffect(() => {
    const controlador = new AbortController();
    apiGet<RespostaUsuarios>("/api/usuarios-internos", controlador.signal)
      .then((dados) => setUsuarios(dados.usuarios ?? []))
      .catch(() => {
        // Sem a lista, o campo de responsável fica vazio; o resto funciona.
      });
    return () => controlador.abort();
  }, []);

  const opcoesResponsavel = useMemo<Opcao[]>(
    () => usuarios.map((u) => ({ valor: u.id, texto: u.rotulo })),
    [usuarios]
  );

  /* ------------------------------ Derivados ------------------------------- */

  const encerrado = !!processo?.concluidoEm;
  const ehAbertura = processo?.tipo === TIPO_PROCESSO.ABERTURA_CNPJ;
  const ehDesenquadramento = processo?.tipo === TIPO_PROCESSO.DESENQUADRAMENTO;
  const semEmpresa = !!processo && !processo.empresaId;

  const naoResolvidas = useMemo(
    () => (processo ? etapasNaoResolvidas(processo.etapas) : []),
    [processo]
  );

  /* --------------------------- Concluir etapa ----------------------------- */

  const [etapaConcluir, setEtapaConcluir] = useState<Etapa | null>(null);
  const [obsConcluir, setObsConcluir] = useState("");
  const [regimeNovo, setRegimeNovo] = useState("");
  const [motivoRegime, setMotivoRegime] = useState("");
  const [erroConcluir, setErroConcluir] = useState("");

  const exigeRegime =
    !!ehDesenquadramento &&
    !!etapaConcluir &&
    !!processo &&
    ehUltimaAplicavel(etapaConcluir, processo.etapas);

  const opcoesRegimeNovo = useMemo<Opcao[]>(
    () =>
      OPCOES_REGIME.filter(
        (opcao) => opcao.valor !== processo?.empresa?.regime
      ),
    [processo?.empresa?.regime]
  );

  const abrirConcluir = useCallback((etapa: Etapa) => {
    setObsConcluir("");
    setRegimeNovo("");
    setMotivoRegime("");
    setErroConcluir("");
    setEtapaConcluir(etapa);
  }, []);

  async function concluirEtapa() {
    if (!processo || !etapaConcluir) return;

    if (exigeRegime && !regimeNovo) {
      setErroConcluir(
        "Escolha o novo regime. Esta é a última etapa do desenquadramento e é ela que grava a mudança no cadastro da empresa."
      );
      return;
    }

    setOcupado(true);
    setErroConcluir("");
    try {
      const resposta = await apiPost<RespostaConcluir>(
        `/api/tarefas/legalizacao/${processo.id}/etapa/concluir`,
        {
          observacao: obsConcluir.trim() || undefined,
          regimeNovo: exigeRegime ? regimeNovo : undefined,
          motivoRegime:
            exigeRegime && motivoRegime.trim() ? motivoRegime.trim() : undefined,
        }
      );

      setEtapaConcluir(null);

      const partes: string[] = [
        `Etapa ${resposta.etapaConcluida} concluída.`,
      ];
      if (resposta.regimeAlterado) {
        partes.push(
          `Regime alterado de ${
            REGIME_LABEL[resposta.regimeAlterado.de] ?? resposta.regimeAlterado.de
          } para ${
            REGIME_LABEL[resposta.regimeAlterado.para] ??
            resposta.regimeAlterado.para
          }.`
        );
      }
      if (resposta.processoConcluido) {
        partes.push("Processo concluído.");
      } else if (resposta.proximaEtapa) {
        partes.push(
          `Agora na etapa ${resposta.proximaEtapa.numero}: ${resposta.proximaEtapa.titulo}.`
        );
      }
      setMensagemOk(partes.join(" "));
      recarregar();
    } catch (falha) {
      if (falha instanceof ErroApi) {
        // A rota exige o vínculo antes de fechar abertura e desenquadramento.
        if (falha.code === "empresa_nao_vinculada") {
          setErroConcluir(
            `${falha.message} Vincule a empresa no aviso no topo da tela e conclua a etapa depois.`
          );
        } else {
          setErroConcluir(falha.message);
        }
      } else {
        setErroConcluir(
          mensagemDeErro(falha) || "Não foi possível concluir a etapa."
        );
      }
    } finally {
      setOcupado(false);
    }
  }

  /* ---------------------------- Voltar etapa ------------------------------ */

  const [etapaVoltar, setEtapaVoltar] = useState<Etapa | null>(null);
  const [erroVoltar, setErroVoltar] = useState("");

  const abrirVoltar = useCallback((etapa: Etapa) => {
    setErroVoltar("");
    setEtapaVoltar(etapa);
  }, []);

  async function voltarEtapa(motivo: string) {
    if (!processo) return;

    setOcupado(true);
    setErroVoltar("");
    try {
      await apiPost(`/api/tarefas/legalizacao/${processo.id}/etapa/voltar`, {
        motivo,
      });
      setEtapaVoltar(null);
      setMensagemOk("Processo retornado para a etapa anterior.");
      recarregar();
    } catch (falha) {
      setErroVoltar(mensagemDeErro(falha) || "Não foi possível retornar.");
    } finally {
      setOcupado(false);
    }
  }

  /* --------------------------- Dispensar etapa ---------------------------- */

  const [etapaDispensar, setEtapaDispensar] = useState<Etapa | null>(null);
  const [erroDispensar, setErroDispensar] = useState("");

  const abrirDispensar = useCallback((etapa: Etapa) => {
    setErroDispensar("");
    setEtapaDispensar(etapa);
  }, []);

  async function dispensarEtapa(motivo: string) {
    if (!processo || !etapaDispensar) return;

    setOcupado(true);
    setErroDispensar("");
    try {
      const resposta = await apiPost<RespostaDispensar>(
        `/api/tarefas/legalizacao/${processo.id}/etapa/${etapaDispensar.numero}/nao-aplicavel`,
        { motivo: motivo || undefined }
      );
      setEtapaDispensar(null);
      setMensagemOk(
        resposta.proximaEtapa
          ? `Etapa ${resposta.etapaDispensada} marcada como não aplicável. Agora na etapa ${resposta.proximaEtapa.numero}: ${resposta.proximaEtapa.titulo}.`
          : `Etapa ${resposta.etapaDispensada} marcada como não aplicável.`
      );
      recarregar();
    } catch (falha) {
      setErroDispensar(mensagemDeErro(falha) || "Não foi possível dispensar.");
    } finally {
      setOcupado(false);
    }
  }

  /* ------------------------------ Pendência ------------------------------- */

  const [modalPendencia, setModalPendencia] = useState(false);
  const [responsavelPendencia, setResponsavelPendencia] = useState("CLIENTE");
  const [erroPendencia, setErroPendencia] = useState("");

  const [modalResolver, setModalResolver] = useState(false);
  const [erroResolver, setErroResolver] = useState("");

  const abrirPendencia = useCallback(() => {
    setResponsavelPendencia("CLIENTE");
    setErroPendencia("");
    setModalPendencia(true);
  }, []);

  async function registrarPendencia(motivo: string) {
    if (!processo) return;
    if (!responsavelPendencia) {
      setErroPendencia("Informe quem está travando o processo.");
      return;
    }

    setOcupado(true);
    setErroPendencia("");
    try {
      await apiPost(`/api/tarefas/legalizacao/${processo.id}/bloqueio`, {
        motivo,
        responsavel: responsavelPendencia,
      });
      setModalPendencia(false);
      setMensagemOk("Pendência registrada. O processo fica travado até ser resolvida.");
      recarregar();
    } catch (falha) {
      setErroPendencia(mensagemDeErro(falha) || "Não foi possível registrar.");
    } finally {
      setOcupado(false);
    }
  }

  async function resolverPendencia(detalhe: string) {
    if (!processo) return;

    setOcupado(true);
    setErroResolver("");
    try {
      // ATENÇÃO: aqui o campo é `detalhe`. A apuração usa `observacao`.
      const resposta = await apiDelete<RespostaResolverBloqueio>(
        `/api/tarefas/legalizacao/${processo.id}/bloqueio`,
        { detalhe: detalhe || undefined }
      );
      setModalResolver(false);
      setMensagemOk(
        resposta.diasBloqueado === null || resposta.diasBloqueado === undefined
          ? "Pendência resolvida."
          : `Pendência resolvida após ${plural(
              resposta.diasBloqueado,
              "dia",
              "dias"
            )}.`
      );
      recarregar();
    } catch (falha) {
      setErroResolver(mensagemDeErro(falha) || "Não foi possível resolver.");
    } finally {
      setOcupado(false);
    }
  }

  /* ------------------------------- Encerrar ------------------------------- */

  const [modalEncerrar, setModalEncerrar] = useState(false);
  const [obsEncerrar, setObsEncerrar] = useState("");
  const [erroEncerrar, setErroEncerrar] = useState("");
  const [pendentesDoErro, setPendentesDoErro] = useState<number[]>([]);

  const abrirEncerrar = useCallback(() => {
    setObsEncerrar("");
    setErroEncerrar("");
    setPendentesDoErro([]);
    setModalEncerrar(true);
  }, []);

  async function encerrarProcesso() {
    if (!processo) return;

    setOcupado(true);
    setErroEncerrar("");
    setPendentesDoErro([]);
    try {
      await apiPost(`/api/tarefas/legalizacao/${processo.id}/encerrar`, {
        observacao: obsEncerrar.trim() || undefined,
      });
      setModalEncerrar(false);
      setMensagemOk("Processo encerrado.");
      recarregar();
    } catch (falha) {
      if (falha instanceof ErroApi && falha.code === "etapas_pendentes") {
        // `etapasPendentes` é array de NÚMEROS. Cruzo com `etapas` para exibir
        // os títulos, senão a mensagem vira "faltam 6, 7" e ninguém sabe o quê.
        const cru = falha.corpo.etapasPendentes;
        const numeros = Array.isArray(cru)
          ? cru.filter((n): n is number => typeof n === "number")
          : [];
        setPendentesDoErro(numeros);
        setErroEncerrar(falha.message);
      } else {
        setErroEncerrar(mensagemDeErro(falha) || "Não foi possível encerrar.");
      }
    } finally {
      setOcupado(false);
    }
  }

  const titulosPendentes = useMemo(() => {
    if (!processo || pendentesDoErro.length === 0) return [];
    return pendentesDoErro.map((numero) => {
      const etapa = processo.etapas.find((e) => e.numero === numero);
      return etapa ? `${numero}. ${etapa.titulo}` : `Etapa ${numero}`;
    });
  }, [pendentesDoErro, processo]);

  /* -------------------------------- Reabrir ------------------------------- */

  const [modalReabrir, setModalReabrir] = useState(false);
  const [erroReabrir, setErroReabrir] = useState("");

  async function reabrirProcesso(motivo: string) {
    if (!processo) return;

    setOcupado(true);
    setErroReabrir("");
    try {
      await apiPost(`/api/tarefas/legalizacao/${processo.id}/reabrir`, {
        motivo,
      });
      setModalReabrir(false);
      setMensagemOk(
        "Processo reaberto na última etapa concluída. Etapas dispensadas continuam dispensadas."
      );
      recarregar();
    } catch (falha) {
      setErroReabrir(mensagemDeErro(falha) || "Não foi possível reabrir.");
    } finally {
      setOcupado(false);
    }
  }

  /* ------------------------------- Protocolo ------------------------------ */

  const [protocolo, setProtocolo] = useState("");
  const [orgao, setOrgao] = useState("");
  const [erroProtocolo, setErroProtocolo] = useState("");

  // Sincroniza com o servidor a cada carga, para não sobrescrever com o que a
  // pessoa digitou e não salvou de propósito em outra aba do navegador.
  useEffect(() => {
    setProtocolo(processo?.protocoloExterno ?? "");
    setOrgao(processo?.orgaoExterno ?? "");
  }, [processo?.protocoloExterno, processo?.orgaoExterno]);

  const protocoloMudou =
    protocolo.trim() !== (processo?.protocoloExterno ?? "") ||
    orgao !== (processo?.orgaoExterno ?? "");

  async function salvarProtocolo() {
    if (!processo) return;

    setOcupado(true);
    setErroProtocolo("");
    setAvisoInfo("");
    try {
      const resposta = await apiPatch<RespostaProtocolo>(
        `/api/tarefas/legalizacao/${processo.id}/protocolo`,
        {
          // String vazia é o jeito de LIMPAR nas duas pontas.
          protocoloExterno: protocolo.trim(),
          orgaoExterno: orgao,
        }
      );

      if (!resposta.alterado) {
        // Com `alterado:false` o `processo` da resposta traz apenas três campos.
        // Não toco nele: só aviso e mantenho o estado que veio do GET.
        setAvisoInfo(
          "Nada mudou no protocolo: os valores enviados são iguais aos que já estavam gravados."
        );
        return;
      }

      setMensagemOk("Protocolo no órgão atualizado.");
      recarregar();
    } catch (falha) {
      setErroProtocolo(
        mensagemDeErro(falha) || "Não foi possível salvar o protocolo."
      );
    } finally {
      setOcupado(false);
    }
  }

  /* --------------------------- Vincular empresa --------------------------- */

  const [modalVinculo, setModalVinculo] = useState(false);
  const [abaVinculo, setAbaVinculo] = useState("existente");
  const [empresas, setEmpresas] = useState<EmpresaLista[]>([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(false);
  const [empresaEscolhida, setEmpresaEscolhida] = useState("");
  const [nova, setNova] = useState({
    cnpj: "",
    razaoSocial: "",
    nomeFantasia: "",
    regime: REGIME.SIMPLES_NACIONAL as string,
    tributoLocal: "",
    uf: "",
    municipio: "",
    inicioAtividade: "",
  });
  const [erroVinculo, setErroVinculo] = useState("");
  const [campoVinculo, setCampoVinculo] = useState("");
  const [empresaDoConflito, setEmpresaDoConflito] = useState<string | null>(null);

  const abrirVinculo = useCallback(() => {
    setAbaVinculo("existente");
    setEmpresaEscolhida("");
    setErroVinculo("");
    setCampoVinculo("");
    setEmpresaDoConflito(null);
    setModalVinculo(true);
  }, []);

  // Sem filtro de situação de propósito: a empresa desta abertura pode já
  // existir em EM_ABERTURA, e `situacao=ATIVA` a esconderia justamente aqui.
  useEffect(() => {
    if (!modalVinculo || empresas.length > 0) return;

    const controlador = new AbortController();
    setCarregandoEmpresas(true);
    apiGet<RespostaEmpresas>(
      `/api/empresas${query({ limit: 200 })}`,
      controlador.signal
    )
      .then((dados) => setEmpresas(dados.empresas ?? []))
      .catch((falha) => {
        const mensagem = mensagemDeErro(falha);
        if (mensagem) setErroVinculo(mensagem);
      })
      .finally(() => setCarregandoEmpresas(false));

    return () => controlador.abort();
  }, [modalVinculo, empresas.length]);

  const opcoesEmpresa = useMemo<Opcao[]>(
    () =>
      empresas.map((e) => ({
        valor: e.id,
        texto: `${e.razaoSocial} · ${e.cnpjFormatado} · ${
          SITUACAO_EMPRESA_LABEL[e.situacao] ?? e.situacao
        }`,
      })),
    [empresas]
  );

  function tratarErroVinculo(falha: unknown) {
    if (falha instanceof ErroApi) {
      const conflito =
        typeof falha.corpo.empresaId === "string" ? falha.corpo.empresaId : null;
      if (
        falha.code === "empresa_ja_vinculada" ||
        falha.code === "cnpj_duplicado"
      ) {
        setEmpresaDoConflito(conflito);
      }
      if (falha.code === "payload_invalido" && falha.campo) {
        setCampoVinculo(falha.campo);
      }
      setErroVinculo(falha.message);
      return;
    }
    setErroVinculo(mensagemDeErro(falha) || "Não foi possível vincular.");
  }

  async function vincularExistente() {
    if (!processo) return;
    if (!empresaEscolhida) {
      setCampoVinculo("empresaId");
      setErroVinculo("Escolha a empresa que será vinculada ao processo.");
      return;
    }

    setOcupado(true);
    setErroVinculo("");
    setCampoVinculo("");
    setEmpresaDoConflito(null);
    try {
      const resposta = await apiPost<RespostaVinculo>(
        `/api/tarefas/legalizacao/${processo.id}/vincular-empresa`,
        { empresaId: empresaEscolhida }
      );
      setModalVinculo(false);
      setMensagemOk(
        `Empresa ${resposta.empresa.razaoSocial} vinculada ao processo.`
      );
      recarregar();
    } catch (falha) {
      tratarErroVinculo(falha);
    } finally {
      setOcupado(false);
    }
  }

  async function cadastrarEVincular() {
    if (!processo) return;

    setErroVinculo("");
    setCampoVinculo("");
    setEmpresaDoConflito(null);

    const cnpj = apenasDigitos(nova.cnpj);
    if (cnpj.length !== 14) {
      setCampoVinculo("cnpj");
      setErroVinculo("O CNPJ precisa ter 14 dígitos.");
      return;
    }
    if (!nova.razaoSocial.trim()) {
      setCampoVinculo("razaoSocial");
      setErroVinculo("Informe a razão social.");
      return;
    }
    if (!nova.regime) {
      setCampoVinculo("regime");
      setErroVinculo("Escolha o regime tributário.");
      return;
    }

    setOcupado(true);
    try {
      const resposta = await apiPost<RespostaVinculo>(
        `/api/tarefas/legalizacao/${processo.id}/vincular-empresa`,
        {
          cnpj,
          razaoSocial: nova.razaoSocial.trim(),
          regime: nova.regime,
          nomeFantasia: nova.nomeFantasia.trim() || undefined,
          tributoLocal: nova.tributoLocal || undefined,
          uf: nova.uf.trim().toUpperCase() || undefined,
          municipio: nova.municipio.trim() || undefined,
          inicioAtividade: nova.inicioAtividade || undefined,
          // `situacao` de propósito ausente: a empresa nasce EM_ABERTURA e
          // vira ATIVA quando a abertura for concluída.
        }
      );
      setModalVinculo(false);
      setMensagemOk(
        `Empresa ${resposta.empresa.razaoSocial} cadastrada em ${
          SITUACAO_EMPRESA_LABEL[resposta.empresa.situacao ?? "EM_ABERTURA"] ??
          "Em abertura"
        } e vinculada ao processo.`
      );
      recarregar();
    } catch (falha) {
      tratarErroVinculo(falha);
    } finally {
      setOcupado(false);
    }
  }

  /* --------------------------------- Dados -------------------------------- */

  const [dados, setDados] = useState({
    responsavelId: "",
    prazoEstimado: "",
    observacoes: "",
    identificacaoProvisoria: "",
  });
  const [erroDados, setErroDados] = useState("");

  useEffect(() => {
    setDados({
      responsavelId: processo?.responsavelId ?? "",
      prazoEstimado: paraCampoData(processo?.prazoEstimado),
      observacoes: processo?.observacoes ?? "",
      identificacaoProvisoria: processo?.identificacaoProvisoria ?? "",
    });
  }, [
    processo?.responsavelId,
    processo?.prazoEstimado,
    processo?.observacoes,
    processo?.identificacaoProvisoria,
  ]);

  async function salvarDados() {
    if (!processo) return;

    setErroDados("");
    setAvisoInfo("");

    const corpo: Record<string, unknown> = {};

    if (dados.observacoes !== (processo.observacoes ?? "")) {
      corpo.observacoes = dados.observacoes;
    }

    // Com processo encerrado a rota só aceita `observacoes` (409
    // `processo_encerrado` nos outros). Os campos ficam desabilitados, mas a
    // trava aqui também protege contra estado velho depois de um encerramento.
    if (!encerrado) {
      if (dados.responsavelId !== (processo.responsavelId ?? "")) {
        corpo.responsavelId = dados.responsavelId || null;
      }
      if (dados.prazoEstimado !== paraCampoData(processo.prazoEstimado)) {
        corpo.prazoEstimado = dados.prazoEstimado || null;
      }
      if (
        dados.identificacaoProvisoria !==
        (processo.identificacaoProvisoria ?? "")
      ) {
        corpo.identificacaoProvisoria = dados.identificacaoProvisoria;
      }
    }

    if (Object.keys(corpo).length === 0) {
      // Evita o 400 `nada_a_alterar`, que o operador leria como defeito.
      setAvisoInfo("Nenhum campo foi alterado, então não houve o que salvar.");
      return;
    }

    setOcupado(true);
    try {
      await apiPatch(`/api/tarefas/legalizacao/${processo.id}`, corpo);
      setMensagemOk("Dados do processo atualizados.");
      recarregar();
    } catch (falha) {
      setErroDados(mensagemDeErro(falha) || "Não foi possível salvar.");
    } finally {
      setOcupado(false);
    }
  }

  /* ------------------------------- Estados -------------------------------- */

  if (naoEncontrado) {
    return (
      <div className="cz-tarefas mx-auto max-w-[1800px] space-y-6 p-6">
        <Cabecalho
          titulo="Processo não encontrado"
          icone="Landmark"
          voltarPara="/admin/tarefas/legalizacao"
          voltarTexto="Voltar para Legalização"
        />
        <Vazio
          icone="Search"
          titulo="Este processo não existe ou foi removido."
          descricao="O endereço pode estar desatualizado, ou o processo pode ter sido apagado depois que o link foi compartilhado."
          acao={
            <Link
              href="/admin/tarefas/legalizacao"
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
            >
              <Icone nome="ArrowLeft" className="h-4 w-4" />
              Ver todos os processos
            </Link>
          }
        />
      </div>
    );
  }

  if (primeiraCarga && carregando) {
    return (
      <div className="cz-tarefas mx-auto max-w-[1800px] space-y-6 p-6">
        <Carregando texto="Carregando processo" />
      </div>
    );
  }

  if (!processo) {
    return (
      <div className="cz-tarefas mx-auto max-w-[1800px] space-y-6 p-6">
        <Cabecalho
          titulo="Legalização"
          icone="Landmark"
          voltarPara="/admin/tarefas/legalizacao"
          voltarTexto="Voltar para Legalização"
        />
        <Aviso mensagem={erro || "Não foi possível carregar o processo."} />
        <Botao variante="secundario" icone="RefreshCw" onClick={recarregar}>
          Tentar novamente
        </Botao>
      </div>
    );
  }

  /* -------------------------------- Render ------------------------------- */

  const descricao = processo.empresa
    ? `${nomeEmpresa(processo.empresa)} · ${formatarCnpj(processo.empresa.cnpj)}`
    : `Empresa em abertura: ${
        processo.identificacaoProvisoria?.trim() || "sem identificação"
      }`;

  const acoes = (
    <>
      {permissoes.gerenciarBloqueio && !encerrado && (
        <Botao
          variante={processo.bloqueada ? "secundario" : "escuro"}
          icone={processo.bloqueada ? "Unlock" : "AlertTriangle"}
          disabled={ocupado}
          onClick={
            processo.bloqueada
              ? () => {
                  setErroResolver("");
                  setModalResolver(true);
                }
              : abrirPendencia
          }
        >
          {processo.bloqueada ? "Resolver pendência" : "Registrar pendência"}
        </Botao>
      )}

      {permissoes.encerrarTarefa && !encerrado && (
        <Botao icone="ClipboardCheck" disabled={ocupado} onClick={abrirEncerrar}>
          Encerrar processo
        </Botao>
      )}

      {permissoes.reabrirTarefa && encerrado && (
        <Botao
          variante="secundario"
          icone="Unlock"
          disabled={ocupado}
          onClick={() => {
            setErroReabrir("");
            setModalReabrir(true);
          }}
        >
          Reabrir
        </Botao>
      )}
    </>
  );

  return (
    <div className="cz-tarefas mx-auto max-w-[1800px] space-y-6 p-6">
      <Cabecalho
        titulo={processo.tipoLabel || TIPO_PROCESSO_LABEL[processo.tipo] || processo.tipo}
        descricao={descricao}
        icone="Landmark"
        voltarPara="/admin/tarefas/legalizacao"
        voltarTexto="Voltar para Legalização"
        acoes={acoes}
      />

      {mensagemOk && (
        <Aviso tom="ok" mensagem={mensagemOk} onFechar={() => setMensagemOk("")} />
      )}
      {avisoInfo && (
        <Aviso tom="info" mensagem={avisoInfo} onFechar={() => setAvisoInfo("")} />
      )}
      {erro && <Aviso mensagem={erro} onFechar={() => setErro("")} />}

      {/* ------------------------------ Resumo ------------------------------ */}

      <Painel>
        <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <SeloStatus status={processo.status} />
            <SeloPrazo
              situacao={processo.situacaoPrazo}
              dias={processo.diasPrazo}
            />
            {processo.bloqueada && (
              <SeloBloqueio
                responsavel={processo.bloqueioResponsavel}
                dias={processo.diasEmBloqueio}
              />
            )}
            {processo.empresa && (
              <SeloRegime regime={processo.empresa.regime} completo />
            )}
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <Icone nome="Clock" className="h-3.5 w-3.5" />
              {processo.diasEmAberto === null ||
              processo.diasEmAberto === undefined
                ? `aberto em ${dataCurta(processo.abertoEm)}`
                : `aberto há ${plural(processo.diasEmAberto, "dia", "dias")}`}
            </span>
          </div>

          <div className="w-full lg:w-80">
            <p className="flex items-center justify-between gap-2 text-xs font-medium text-gray-500">
              <span>
                Etapa {processo.etapaAtual} de {processo.etapasTotal}
              </span>
              <span>
                {processo.etapasResolvidas}/{processo.etapasTotal} resolvidas
              </span>
            </p>
            <p className="mt-0.5 truncate text-sm font-medium text-gray-900">
              {processo.etapaAtualTitulo ?? "Etapa não identificada"}
            </p>
            <Progresso
              feito={processo.etapasResolvidas}
              total={processo.etapasTotal}
              className="mt-2"
            />
          </div>
        </div>
      </Painel>

      {processo.bloqueada && (
        <Aviso
          tom="atencao"
          mensagem={`Pendência aberta${
            processo.bloqueioResponsavelLabel
              ? ` com ${processo.bloqueioResponsavelLabel}`
              : ""
          }${
            processo.diasEmBloqueio === null ||
            processo.diasEmBloqueio === undefined
              ? ""
              : ` há ${plural(processo.diasEmBloqueio, "dia", "dias")}`
          }: ${
            processo.bloqueioMotivo ?? "motivo não informado"
          }. Nenhuma etapa avança enquanto a pendência existir.`}
        />
      )}

      {encerrado && (
        <Aviso
          tom="ok"
          mensagem={`Processo encerrado em ${dataCurta(
            processo.concluidoEm
          )}. A partir daqui só o protocolo no órgão e as observações continuam editáveis.`}
        />
      )}

      {/* ----------------- Abertura de CNPJ sem empresa vinculada ----------- */}

      {ehAbertura && semEmpresa && (
        <div className="rounded-lg border border-[#B2DDFF] bg-[#EFF8FF] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <Icone
                nome="Info"
                className="mt-0.5 h-4 w-4 shrink-0 text-[#175CD3]"
              />
              <div className="min-w-0 text-sm text-[#175CD3]">
                <p className="font-semibold">
                  Este processo ainda não tem empresa vinculada.
                </p>
                <p className="mt-1">
                  Normal em abertura: o CNPJ é justamente o que o processo vai
                  produzir, e até lá o acompanhamento é feito pela identificação
                  provisória. Só que a última etapa não fecha sem vínculo — sem
                  empresa não existe cadastro para receber o resultado, e a
                  conclusão é recusada.
                </p>
              </div>
            </div>
            {permissoes.criarProcesso && (
              <Botao
                icone="Link2"
                disabled={ocupado}
                onClick={abrirVinculo}
                className="shrink-0"
              >
                Vincular empresa
              </Botao>
            )}
          </div>
        </div>
      )}

      {/* --------------------- Desenquadramento: o efeito ------------------- */}

      {ehDesenquadramento && !encerrado && (
        <Aviso
          tom="info"
          mensagem={`Concluir a última etapa deste processo TROCA o regime da empresa${
            processo.empresa
              ? ` (hoje ${REGIME_LABEL[processo.empresa.regime] ?? processo.empresa.regime})`
              : ""
          } e cria a linha correspondente no histórico de regime. Reabrir o processo depois não desfaz a troca.`}
        />
      )}

      {/* -------------------------- Grade de dados -------------------------- */}

      <Painel titulo="Dados do processo">
        <dl className="grid gap-5 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <Dado rotulo="Tipo">
            {processo.tipoLabel ||
              TIPO_PROCESSO_LABEL[processo.tipo] ||
              processo.tipo}
          </Dado>

          <Dado rotulo="Empresa">
            {processo.empresa && processo.empresaId ? (
              <Link
                href={`/admin/empresas/${processo.empresaId}`}
                className="inline-flex items-center gap-1.5 text-orange-600 transition-colors hover:text-orange-700 hover:underline"
              >
                <span className="truncate">{nomeEmpresa(processo.empresa)}</span>
                <Icone nome="ExternalLink" className="h-3.5 w-3.5 shrink-0" />
              </Link>
            ) : (
              <span className="text-gray-500">Não vinculada</span>
            )}
          </Dado>

          <Dado rotulo="CNPJ">
            {processo.empresa ? formatarCnpj(processo.empresa.cnpj) : "—"}
          </Dado>

          <Dado rotulo="Situação da empresa">
            {processo.empresa ? (
              <SeloSituacaoEmpresa situacao={processo.empresa.situacao} />
            ) : (
              "—"
            )}
          </Dado>

          <Dado rotulo="Regime">
            {processo.empresa ? (
              <SeloRegime regime={processo.empresa.regime} completo />
            ) : (
              "—"
            )}
          </Dado>

          <Dado rotulo="Identificação provisória">
            {processo.identificacaoProvisoria?.trim() || "—"}
          </Dado>

          <Dado rotulo="Protocolo externo">
            {processo.protocoloExterno?.trim() || "—"}
          </Dado>

          <Dado rotulo="Órgão">
            {processo.orgaoExternoLabel ??
              (processo.orgaoExterno
                ? ORGAO_EXTERNO_LABEL[processo.orgaoExterno] ??
                  processo.orgaoExterno
                : "—")}
          </Dado>

          <Dado rotulo="Prazo estimado">
            {dataCurta(processo.prazoEstimado)}
          </Dado>

          <Dado rotulo="Responsável">
            {processo.responsavel ? (
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[10px] font-bold text-white">
                  {iniciais(
                    processo.responsavel.name ?? processo.responsavel.email
                  )}
                </span>
                <span className="truncate">
                  {processo.responsavel.name ?? processo.responsavel.email}
                </span>
              </span>
            ) : (
              <span className="text-gray-500">Sem responsável</span>
            )}
          </Dado>

          <Dado rotulo="Aberto em">{dataCurta(processo.abertoEm)}</Dado>

          <Dado rotulo="Encerrado em">
            {processo.concluidoEm ? dataCurta(processo.concluidoEm) : "—"}
          </Dado>

          <Dado rotulo="Última alteração">{dataHora(processo.updatedAt)}</Dado>
        </dl>
      </Painel>

      {/* -------------------------- Protocolo no órgão ---------------------- */}

      <Painel
        titulo="Protocolo no órgão"
        descricao="Único bloco que continua editável depois do encerramento: o número costuma chegar dias após o processo acabar."
      >
        <div className="space-y-4 px-5 py-4">
          {erroProtocolo && (
            <Aviso mensagem={erroProtocolo} onFechar={() => setErroProtocolo("")} />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Entrada
              rotulo="Protocolo externo"
              value={protocolo}
              onChange={(e) => setProtocolo(e.target.value)}
              placeholder="Número do protocolo no órgão"
              ajuda="Deixe vazio para limpar o protocolo gravado."
            />
            <Escolha
              rotulo="Órgão"
              vazio="Sem órgão definido (limpa o campo)"
              opcoes={OPCOES_ORGAO}
              value={orgao}
              onChange={(e) => setOrgao(e.target.value)}
              ajuda="Junta Comercial, Receita, Prefeitura, SEFAZ ou Certificadora."
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Botao
              icone="Save"
              disabled={ocupado || !protocoloMudou}
              onClick={salvarProtocolo}
            >
              Salvar protocolo
            </Botao>
            {!protocoloMudou && (
              <p className="text-xs text-gray-500">
                Nada mudou em relação ao que está gravado.
              </p>
            )}
          </div>
        </div>
      </Painel>

      {/* ---------------------------- Abas ---------------------------------- */}

      <Painel>
        <Abas
          abas={[
            { chave: "etapas", texto: "Etapas", contagem: processo.etapasTotal },
            {
              chave: "pendencias",
              texto: "Pendências",
              contagem: processo.bloqueada ? 1 : 0,
            },
            {
              chave: "historico",
              texto: "Histórico",
              contagem: processo.logs.length,
            },
            { chave: "dados", texto: "Dados" },
          ]}
          ativa={aba}
          onMudar={setAba}
        />

        {aba === "etapas" && (
          <ListaEtapas
            etapas={processo.etapas}
            etapaAtual={processo.etapaAtual}
            permissoes={permissoes}
            bloqueada={processo.bloqueada}
            encerrada={encerrado}
            podeVoltar={permissoes.retornarEtapa}
            ocupado={ocupado}
            onConcluir={abrirConcluir}
            onVoltar={abrirVoltar}
            onDispensar={abrirDispensar}
          />
        )}

        {aba === "pendencias" && (
          <div className="space-y-4 px-5 py-4">
            {processo.bloqueada ? (
              <div className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] p-4">
                <div className="flex items-start gap-3">
                  <Icone
                    nome="AlertTriangle"
                    className="mt-0.5 h-4 w-4 shrink-0 text-[#B54708]"
                  />
                  <div className="min-w-0 flex-1 space-y-2 text-sm text-[#B54708]">
                    <p className="font-semibold">
                      {processo.bloqueioResponsavelLabel
                        ? `Travado com ${processo.bloqueioResponsavelLabel}`
                        : "Pendência aberta"}
                      {processo.diasEmBloqueio === null ||
                      processo.diasEmBloqueio === undefined
                        ? ""
                        : ` há ${plural(processo.diasEmBloqueio, "dia", "dias")}`}
                    </p>
                    <p>{processo.bloqueioMotivo ?? "Motivo não informado."}</p>
                    <p className="text-xs">
                      Desde {dataHora(processo.bloqueioDesde)}
                    </p>
                    {permissoes.gerenciarBloqueio && !encerrado && (
                      <Botao
                        variante="secundario"
                        icone="Unlock"
                        disabled={ocupado}
                        onClick={() => {
                          setErroResolver("");
                          setModalResolver(true);
                        }}
                      >
                        Resolver pendência
                      </Botao>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center">
                <p className="text-sm font-medium text-gray-900">
                  Nenhuma pendência aberta.
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Registre uma pendência quando o processo travar esperando
                  cliente, escritório, comercial ou órgão externo. O tempo
                  travado passa a contar e aparece na lista.
                </p>
                {permissoes.gerenciarBloqueio && !encerrado && (
                  <div className="mt-4 flex justify-center">
                    <Botao
                      variante="escuro"
                      icone="AlertTriangle"
                      disabled={ocupado}
                      onClick={abrirPendencia}
                    >
                      Registrar pendência
                    </Botao>
                  </div>
                )}
              </div>
            )}

            {/* Pendências passadas ficam no log; repetir aqui só o que é
                pendência evita mandar a pessoa caçar no histórico inteiro. */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">
                Pendências já registradas
              </h3>
              <div className="rounded-lg border border-gray-200">
                <Historico
                  logs={processo.logs.filter(
                    (log) =>
                      log.acao === "BLOQUEIO_REGISTRADO" ||
                      log.acao === "BLOQUEIO_RESOLVIDO"
                  )}
                  vazio="Nenhuma pendência foi registrada neste processo."
                />
              </div>
            </div>
          </div>
        )}

        {aba === "historico" && (
          <Historico logs={processo.logs} truncado={processo.logsTruncados} />
        )}

        {aba === "dados" && (
          <div className="space-y-4 px-5 py-4">
            {erroDados && (
              <Aviso mensagem={erroDados} onFechar={() => setErroDados("")} />
            )}

            {encerrado && (
              <Aviso
                tom="info"
                mensagem="Processo encerrado: responsável, prazo e identificação provisória ficam travados, porque a rota recusa a alteração (409). Só as observações continuam liberadas — e o protocolo, no painel acima."
              />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Escolha
                rotulo="Responsável"
                vazio="Sem responsável definido"
                opcoes={opcoesResponsavel}
                value={dados.responsavelId}
                disabled={encerrado || ocupado}
                onChange={(e) =>
                  setDados((atual) => ({ ...atual, responsavelId: e.target.value }))
                }
                ajuda={
                  encerrado
                    ? "Travado porque o processo está encerrado."
                    : "Quem responde por este processo no dia a dia."
                }
              />
              <Entrada
                rotulo="Prazo estimado"
                type="date"
                value={dados.prazoEstimado}
                disabled={encerrado || ocupado}
                onChange={(e) =>
                  setDados((atual) => ({ ...atual, prazoEstimado: e.target.value }))
                }
                ajuda={
                  encerrado
                    ? "Travado porque o processo está encerrado."
                    : "Vazio remove o prazo e o alerta de atraso."
                }
              />
            </div>

            <Entrada
              rotulo="Identificação provisória"
              value={dados.identificacaoProvisoria}
              disabled={encerrado || ocupado}
              onChange={(e) =>
                setDados((atual) => ({
                  ...atual,
                  identificacaoProvisoria: e.target.value,
                }))
              }
              ajuda={
                encerrado
                  ? "Travado porque o processo está encerrado."
                  : "Como o processo aparece na lista enquanto não há empresa vinculada."
              }
            />

            <Area
              rotulo="Observações"
              rows={4}
              value={dados.observacoes}
              disabled={ocupado}
              onChange={(e) =>
                setDados((atual) => ({ ...atual, observacoes: e.target.value }))
              }
              ajuda="Liberado mesmo com o processo encerrado."
            />

            <Botao icone="Save" disabled={ocupado} onClick={salvarDados}>
              Salvar dados
            </Botao>
          </div>
        )}
      </Painel>

      {/* --------------------------- Concluir etapa ------------------------- */}

      <Modal
        aberto={!!etapaConcluir}
        titulo={
          etapaConcluir
            ? `Concluir etapa ${etapaConcluir.numero}`
            : "Concluir etapa"
        }
        descricao={etapaConcluir?.titulo}
        icone="CheckCircle2"
        largura={exigeRegime ? "lg" : "md"}
        onFechar={() => setEtapaConcluir(null)}
        rodape={
          <>
            <Botao
              variante="secundario"
              onClick={() => setEtapaConcluir(null)}
              disabled={ocupado}
            >
              Cancelar
            </Botao>
            <Botao
              icone="CheckCircle2"
              carregando={ocupado}
              textoCarregando="Concluindo"
              onClick={concluirEtapa}
            >
              Concluir etapa
            </Botao>
          </>
        }
      >
        <div className="space-y-4">
          {erroConcluir && <Aviso mensagem={erroConcluir} />}

          {/* O aviso de troca de regime vem ANTES do campo, para a decisão ser
              tomada sabendo o efeito, não descoberta depois no cadastro. */}
          {exigeRegime && (
            <Aviso
              tom="atencao"
              mensagem="Esta é a última etapa do desenquadramento. Concluir TROCA o regime da empresa, fecha a vigência do regime atual e abre a do novo no histórico de regime. Reabrir o processo depois não desfaz a troca."
            />
          )}

          {exigeRegime && (
            <>
              <Escolha
                rotulo="Novo regime da empresa"
                required
                vazio="Selecione o novo regime"
                opcoes={opcoesRegimeNovo}
                value={regimeNovo}
                onChange={(e) => setRegimeNovo(e.target.value)}
                ajuda={
                  processo.empresa
                    ? `Hoje a empresa está em ${
                        REGIME_LABEL[processo.empresa.regime] ??
                        processo.empresa.regime
                      }. O regime atual não aparece na lista porque desenquadramento precisa mudar de regime.`
                    : "Sem empresa vinculada a conclusão será recusada: não há cadastro para receber o novo regime."
                }
              />
              <Area
                rotulo="Motivo da mudança de regime"
                rows={2}
                value={motivoRegime}
                onChange={(e) => setMotivoRegime(e.target.value)}
                placeholder="Ultrapassou o limite de faturamento do Simples"
                ajuda="Opcional. Vai para a linha do histórico de regime da empresa."
              />
            </>
          )}

          {ehAbertura && semEmpresa && (
            <Aviso
              tom="atencao"
              mensagem="Este processo não tem empresa vinculada. Se esta for a última etapa, a conclusão será recusada até a empresa ser vinculada."
            />
          )}

          <Area
            rotulo="Observação da etapa"
            rows={3}
            value={obsConcluir}
            onChange={(e) => setObsConcluir(e.target.value)}
            placeholder="O que foi feito nesta etapa"
            ajuda="Opcional. Fica gravada na etapa e no histórico, com seu nome."
          />
        </div>
      </Modal>

      {/* ---------------------------- Voltar etapa -------------------------- */}

      <ModalMotivo
        aberto={!!etapaVoltar}
        titulo="Voltar para a etapa anterior"
        descricao={
          etapaVoltar
            ? `O processo sai da etapa ${etapaVoltar.numero} e volta para a anterior que ainda se aplica.`
            : undefined
        }
        icone="RotateCcw"
        rotulo="Motivo do retorno"
        minimo={MINIMO_MOTIVO}
        textoConfirmar="Voltar etapa"
        varianteConfirmar="escuro"
        erro={erroVoltar}
        enviando={ocupado}
        onFechar={() => setEtapaVoltar(null)}
        onConfirmar={voltarEtapa}
        ajuda="Retroceder etapa é exceção e fica registrado no histórico com seu nome. Mínimo de 3 caracteres."
      />

      {/* --------------------------- Dispensar etapa ------------------------ */}

      <ModalMotivo
        aberto={!!etapaDispensar}
        titulo={
          etapaDispensar
            ? `Marcar a etapa ${etapaDispensar.numero} como não aplicável`
            : "Etapa não aplicável"
        }
        descricao={etapaDispensar?.titulo}
        icone="MinusCircle"
        rotulo="Motivo"
        obrigatorio={false}
        textoConfirmar="Não se aplica"
        varianteConfirmar="escuro"
        erro={erroDispensar}
        enviando={ocupado}
        onFechar={() => setEtapaDispensar(null)}
        onConfirmar={dispensarEtapa}
        ajuda="Opcional, mas ajuda: a etapa continua visível e riscada, e o motivo explica a decisão. Só etapa opcional pode ser dispensada."
      />

      {/* --------------------------- Pendência ----------------------------- */}

      <ModalMotivo
        aberto={modalPendencia}
        titulo="Registrar pendência"
        descricao="O processo fica travado e nenhuma etapa avança até a pendência ser resolvida."
        icone="AlertTriangle"
        rotulo="Motivo da pendência"
        minimo={MINIMO_MOTIVO}
        textoConfirmar="Registrar pendência"
        varianteConfirmar="escuro"
        erro={erroPendencia}
        enviando={ocupado}
        onFechar={() => setModalPendencia(false)}
        onConfirmar={registrarPendencia}
        extra={
          <Escolha
            rotulo="Quem está travando"
            required
            opcoes={OPCOES_BLOQUEIO}
            value={responsavelPendencia}
            onChange={(e) => setResponsavelPendencia(e.target.value)}
            ajuda="Travado com o cliente vira “Aguardando documentação”; nos outros casos, “Pendência identificada”."
          />
        }
      />

      <ModalMotivo
        aberto={modalResolver}
        titulo="Resolver pendência"
        descricao="O processo volta a andar da etapa em que parou."
        icone="Unlock"
        rotulo="Detalhe da resolução"
        obrigatorio={false}
        textoConfirmar="Resolver pendência"
        erro={erroResolver}
        enviando={ocupado}
        onFechar={() => setModalResolver(false)}
        onConfirmar={resolverPendencia}
        ajuda="Opcional. Fica no histórico junto com o tempo total que o processo passou travado."
      />

      {/* ----------------------------- Encerrar ---------------------------- */}

      <Modal
        aberto={modalEncerrar}
        titulo="Encerrar processo"
        descricao="Encerrar marca o processo como concluído e tranca a edição, menos protocolo e observações."
        icone="ClipboardCheck"
        largura="lg"
        onFechar={() => setModalEncerrar(false)}
        rodape={
          <>
            <Botao
              variante="secundario"
              onClick={() => setModalEncerrar(false)}
              disabled={ocupado}
            >
              Cancelar
            </Botao>
            <Botao
              icone="ClipboardCheck"
              carregando={ocupado}
              textoCarregando="Encerrando"
              onClick={encerrarProcesso}
            >
              Encerrar processo
            </Botao>
          </>
        }
      >
        <div className="space-y-4">
          {erroEncerrar && <Aviso mensagem={erroEncerrar} />}

          {titulosPendentes.length > 0 && (
            <div className="rounded-lg border border-[#FECDCA] bg-[#FEF2F2] px-4 py-3">
              <p className="text-sm font-semibold text-[#B42318]">
                O servidor recusou o encerramento por estas etapas:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-[#B42318]">
                {titulosPendentes.map((texto) => (
                  <li key={texto}>{texto}</li>
                ))}
              </ul>
            </div>
          )}

          {processo.bloqueada && (
            <Aviso
              tom="atencao"
              mensagem="Existe pendência aberta. Resolva a pendência antes de encerrar, senão a ação é recusada."
            />
          )}

          {/* Aviso ANTES de tentar: o 409 `etapas_pendentes` é evitável, e
              descobrir a lista só depois do clique parece defeito. */}
          {naoResolvidas.length > 0 ? (
            <div className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3">
              <p className="text-sm font-semibold text-[#B54708]">
                {plural(
                  naoResolvidas.length,
                  "etapa ainda não resolvida",
                  "etapas ainda não resolvidas"
                )}
                :
              </p>
              <ul className="mt-2 space-y-1 text-sm text-[#B54708]">
                {naoResolvidas.map((etapa) => (
                  <li key={etapa.id}>
                    {etapa.numero}. {etapa.titulo}
                    {etapa.opcional ? " (opcional)" : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[#B54708]">
                Conclua cada etapa, ou marque as opcionais como não aplicáveis.
                O encerramento será recusado enquanto sobrar alguma.
              </p>
            </div>
          ) : (
            <Aviso
              tom="ok"
              mensagem="Todas as etapas estão resolvidas. O processo pode ser encerrado."
            />
          )}

          <Area
            rotulo="Observação de encerramento"
            rows={3}
            value={obsEncerrar}
            onChange={(e) => setObsEncerrar(e.target.value)}
            placeholder="O que fica registrado sobre o fechamento"
            ajuda="Opcional. Fica no histórico com seu nome."
          />
        </div>
      </Modal>

      {/* ------------------------------ Reabrir ---------------------------- */}

      <ModalMotivo
        aberto={modalReabrir}
        titulo="Reabrir processo"
        descricao="O processo volta para a última etapa concluída. Etapas dispensadas continuam dispensadas, e um desenquadramento já aplicado não é desfeito."
        icone="Unlock"
        rotulo="Motivo da reabertura"
        minimo={MINIMO_MOTIVO}
        textoConfirmar="Reabrir processo"
        varianteConfirmar="escuro"
        erro={erroReabrir}
        enviando={ocupado}
        onFechar={() => setModalReabrir(false)}
        onConfirmar={reabrirProcesso}
        ajuda="Reabertura é exceção e fica registrada no histórico com seu nome. Mínimo de 3 caracteres."
      />

      {/* ------------------------- Vincular empresa ------------------------ */}

      <Modal
        aberto={modalVinculo}
        titulo="Vincular empresa ao processo"
        descricao="Disponível só em abertura de CNPJ, e só uma vez: depois de vinculado, o processo não troca de empresa."
        icone="Link2"
        largura="lg"
        onFechar={() => setModalVinculo(false)}
        rodape={
          <>
            <Botao
              variante="secundario"
              onClick={() => setModalVinculo(false)}
              disabled={ocupado}
            >
              Cancelar
            </Botao>
            <Botao
              icone="Link2"
              carregando={ocupado}
              textoCarregando="Vinculando"
              onClick={
                abaVinculo === "existente" ? vincularExistente : cadastrarEVincular
              }
            >
              {abaVinculo === "existente"
                ? "Vincular empresa"
                : "Cadastrar e vincular"}
            </Botao>
          </>
        }
      >
        <div className="space-y-4">
          {erroVinculo && <Aviso mensagem={erroVinculo} />}

          {empresaDoConflito && (
            <div className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-sm text-[#B54708]">
              <p>
                O conflito aponta para uma empresa que já existe no cadastro.
              </p>
              <Link
                href={`/admin/empresas/${empresaDoConflito}`}
                className="mt-2 inline-flex items-center gap-1.5 font-semibold underline"
              >
                <Icone nome="ExternalLink" className="h-3.5 w-3.5" />
                Abrir essa empresa
              </Link>
            </div>
          )}

          <Abas
            abas={[
              { chave: "existente", texto: "Empresa já cadastrada" },
              { chave: "nova", texto: "Cadastrar agora" },
            ]}
            ativa={abaVinculo}
            onMudar={(chave) => {
              setAbaVinculo(chave);
              setErroVinculo("");
              setCampoVinculo("");
            }}
          />

          {abaVinculo === "existente" ? (
            <Escolha
              rotulo="Empresa"
              required
              vazio="Selecione a empresa"
              opcoes={opcoesEmpresa}
              value={empresaEscolhida}
              disabled={carregandoEmpresas || ocupado}
              erro={campoVinculo === "empresaId" ? "Campo obrigatório." : null}
              onChange={(e) => setEmpresaEscolhida(e.target.value)}
              ajuda={
                carregandoEmpresas
                  ? "Carregando empresas"
                  : "A lista inclui empresas em abertura, que é o caso comum aqui."
              }
            />
          ) : (
            <div className="space-y-4">
              <Aviso
                tom="info"
                mensagem="Sem informar a situação, a empresa nasce Em abertura e passa a Ativa automaticamente quando a última etapa desta abertura for concluída."
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Entrada
                  rotulo="CNPJ"
                  required
                  value={nova.cnpj}
                  inputMode="numeric"
                  erro={campoVinculo === "cnpj" ? "CNPJ inválido." : null}
                  onChange={(e) =>
                    setNova((atual) => ({
                      ...atual,
                      cnpj: mascararCnpj(e.target.value),
                    }))
                  }
                  placeholder="00.000.000/0000-00"
                  ajuda="O dígito verificador é validado pelo servidor."
                />
                <Escolha
                  rotulo="Regime tributário"
                  required
                  opcoes={OPCOES_REGIME}
                  value={nova.regime}
                  erro={campoVinculo === "regime" ? "Campo obrigatório." : null}
                  onChange={(e) =>
                    setNova((atual) => ({ ...atual, regime: e.target.value }))
                  }
                />
              </div>

              <Entrada
                rotulo="Razão social"
                required
                value={nova.razaoSocial}
                erro={
                  campoVinculo === "razaoSocial" ? "Campo obrigatório." : null
                }
                onChange={(e) =>
                  setNova((atual) => ({ ...atual, razaoSocial: e.target.value }))
                }
              />

              <Entrada
                rotulo="Nome fantasia"
                value={nova.nomeFantasia}
                onChange={(e) =>
                  setNova((atual) => ({ ...atual, nomeFantasia: e.target.value }))
                }
                ajuda="Opcional. É o nome usado nos cartões da lista."
              />

              <div className="grid gap-4 sm:grid-cols-3">
                <Entrada
                  rotulo="UF"
                  value={nova.uf}
                  maxLength={2}
                  erro={campoVinculo === "uf" ? "UF inválida." : null}
                  onChange={(e) =>
                    setNova((atual) => ({
                      ...atual,
                      uf: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="SP"
                />
                <Entrada
                  rotulo="Município"
                  value={nova.municipio}
                  onChange={(e) =>
                    setNova((atual) => ({ ...atual, municipio: e.target.value }))
                  }
                />
                <Entrada
                  rotulo="Início de atividade"
                  type="date"
                  value={nova.inicioAtividade}
                  onChange={(e) =>
                    setNova((atual) => ({
                      ...atual,
                      inicioAtividade: e.target.value,
                    }))
                  }
                />
              </div>

              <Escolha
                rotulo="Imposto local"
                vazio="Definir depois"
                opcoes={OPCOES_TRIBUTO}
                value={nova.tributoLocal}
                onChange={(e) =>
                  setNova((atual) => ({ ...atual, tributoLocal: e.target.value }))
                }
                ajuda="Comércio e indústria apuram ICMS; serviço apura ISS. Ajusta o nome da etapa condicional do Lucro Presumido."
              />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
