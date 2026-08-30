"use client";

/**
 * Detalhe de uma competência de apuração fiscal.
 *
 * É a tela onde a etapa de fato se move e onde o histórico é lido. Duas decisões
 * estruturais atravessam o arquivo:
 *
 * 1. TODA ação de escrita recarrega o GET inteiro. As rotas devolvem resposta
 *    parcial ("concluí a etapa 4, próxima é a 5"), e remontar o estado à mão a
 *    partir disso é a forma mais fácil de a tela mostrar etapa e status
 *    divergentes do banco. A resposta parcial serve só para a MENSAGEM.
 *
 * 2. Uma única flag `ocupado` trava todas as ações. Dois cliques concorrentes em
 *    "Concluir etapa" seriam duas etapas avançadas, e o log registraria as duas.
 *
 * O que a tela recusa antes de chamar a API é sempre o que a API também recusaria
 * (etapa que não é do seu papel, encerrar com etapa em aberto). Divergir disso
 * geraria 403/409 que o operador leria como defeito do sistema.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSessao } from "@/hooks/useSessao";
import {
  ACAO_LOG_LABEL,
  BLOQUEIO_RESPONSAVEL_LABEL,
  REGIME_LABEL,
  TRIBUTO_LOCAL_LABEL,
} from "@/lib/tarefa-etapas";
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  ErroApi,
  mensagemDeErro,
} from "@/app/components/views/ui/tarefas/api";
import type {
  ApuracaoDetalhe,
  Etapa,
  LogItem,
  UsuarioInterno,
} from "@/app/components/views/ui/tarefas/tipos";
import {
  dataCurta,
  dataHora,
  formatarCnpj,
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
} from "@/app/components/views/ui/tarefas/Base";
import {
  Abas,
  Area,
  Botao,
  Entrada,
  Escolha,
} from "@/app/components/views/ui/tarefas/Campos";
import type { Opcao } from "@/app/components/views/ui/tarefas/Campos";
import { Modal, ModalMotivo } from "@/app/components/views/ui/tarefas/Modal";
import {
  SeloBloqueio,
  SeloPrazo,
  SeloRegime,
  SeloResponsavelEtapa,
  SeloSituacaoEmpresa,
  SeloStatus,
} from "@/app/components/views/ui/tarefas/Selos";
import ListaEtapas from "@/app/components/views/ui/tarefas/ListaEtapas";
import Historico from "@/app/components/views/ui/tarefas/Historico";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import { AnexosDaTarefa } from "@/app/components/views/ui/tarefas/Anexos";
import { PAPEL } from "@/lib/papeis";

/* -------------------------------------------------------------------------- */
/*                        Respostas parciais das rotas                        */
/* -------------------------------------------------------------------------- */

type EtapaResumo = { numero: number; titulo: string };

type RespostaConcluir = {
  concluida: EtapaResumo;
  etapaAtual: number;
  proximaEtapa: EtapaResumo | null;
  status: string;
  tarefaConcluida: boolean;
};

type RespostaVoltar = {
  etapaAtual: number;
  tituloEtapaAtual: string | null;
  etapaRetornada: number;
  status: string;
  motivo: string;
};

type RespostaNaoAplicavel = {
  etapa: EtapaResumo;
  situacao: string;
  etapaAtual: number;
  status: string;
  tarefaConcluida: boolean;
};

type RespostaBloqueio = {
  bloqueada: boolean;
  bloqueioMotivo: string | null;
  bloqueioResponsavel: string | null;
  bloqueioDesde: string | null;
  status: string;
};

type RespostaResolver = {
  bloqueada: boolean;
  diasEmBloqueio: number | null;
  status: string;
};

type RespostaEncerrar = {
  encerrada: boolean;
  concluidaEm: string | null;
  status: string;
  etapaAtual: number;
  totalEtapas: number;
};

type RespostaReabrir = {
  reaberta: boolean;
  etapaAtual: number;
  tituloEtapaAtual: string | null;
  status: string;
  motivo: string;
};

type RespostaPatch = {
  atualizada: boolean;
  mensagem?: string;
  alteracoes?: string[];
};

type RespostaUsuarios = { usuarios: UsuarioInterno[]; total: number };

/* -------------------------------------------------------------------------- */
/*                                  Apoio                                     */
/* -------------------------------------------------------------------------- */

type Tom = "erro" | "atencao" | "info" | "ok";
type Recado = { mensagem: string; tom: Tom };
type NomeModal =
  | null
  | "concluir"
  | "voltar"
  | "dispensar"
  | "bloquear"
  | "resolver"
  | "encerrar"
  | "reabrir";

const RESOLVIDA = ["CONCLUIDA", "NAO_APLICAVEL"];

const OPCOES_BLOQUEIO: Opcao[] = [
  "CLIENTE",
  "ESCRITORIO",
  "COMERCIAL_CZ",
  "TERCEIRO",
].map((chave) => ({
  valor: chave,
  texto: BLOQUEIO_RESPONSAVEL_LABEL[chave] ?? chave,
}));

/**
 * ISO para o `aaaa-mm-dd` do input.
 *
 * O prazo é gravado à meia-noite UTC. Ler com `getFullYear/getMonth/getDate`
 * deslocaria um dia para trás em qualquer fuso negativo — o operador abriria a
 * competência e veria o prazo mudar sozinho.
 */
function paraInputData(valor: string | null | undefined): string {
  if (!valor) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(valor)) return valor.slice(0, 10);
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  return data.toISOString().slice(0, 10);
}

/** Lista "3 (Conferência), 5 (Guia)" das etapas que faltam. */
function listaEtapas(etapas: EtapaResumo[]): string {
  return etapas.map((e) => `${e.numero} (${e.titulo})`).join(", ");
}

/** `etapas` do 409 `etapas_pendentes`, quando o corpo trouxer. */
function etapasDoErro(erro: unknown): EtapaResumo[] {
  if (!(erro instanceof ErroApi)) return [];
  const bruto = erro.corpo.etapas;
  if (!Array.isArray(bruto)) return [];
  return bruto.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const registro = item as Record<string, unknown>;
    const numero = Number(registro.numero);
    if (!Number.isFinite(numero)) return [];
    return [
      {
        numero,
        titulo:
          typeof registro.titulo === "string" ? registro.titulo : "Etapa",
      },
    ];
  });
}

/* -------------------------------------------------------------------------- */
/*                                    View                                    */
/* -------------------------------------------------------------------------- */

export default function ApuracaoDetalheView({ id }: { id: string }) {
  const { permissoes, sessao, papel } = useSessao();

  const [dados, setDados] = useState<ApuracaoDetalhe | null>(null);
  const [carregandoPagina, setCarregandoPagina] = useState(true);
  const [erroCarga, setErroCarga] = useState("");
  const [naoEncontrada, setNaoEncontrada] = useState(false);

  const [aba, setAba] = useState("etapas");
  /**
   * Quantos anexos existem, para a contagem da aba.
   *
   * `null` até a aba ser aberta uma vez: a lista é carregada sob demanda, e
   * disparar essa requisição no carregamento do detalhe inteiro só para pintar um
   * número na aba não se paga. Depois de aberta, o número fica.
   */
  const [totalAnexos, setTotalAnexos] = useState<number | null>(null);
  const [recado, setRecado] = useState<Recado | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [modal, setModal] = useState<NomeModal>(null);
  const [etapaAlvo, setEtapaAlvo] = useState<Etapa | null>(null);
  const [erroModal, setErroModal] = useState<string | null>(null);
  const [observacaoModal, setObservacaoModal] = useState("");
  const [bloqueioResponsavel, setBloqueioResponsavel] = useState("");
  const [etapasBloqueando, setEtapasBloqueando] = useState<EtapaResumo[]>([]);

  const [usuarios, setUsuarios] = useState<UsuarioInterno[]>([]);
  const [formulario, setFormulario] = useState({
    responsavelId: "",
    prazoEntrega: "",
    observacoes: "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erroDados, setErroDados] = useState("");

  /* ------------------------------- Carga --------------------------------- */

  const buscar = useCallback(
    async (sinal?: AbortSignal) => {
      try {
        const resposta = await apiGet<ApuracaoDetalhe>(
          `/api/tarefas/apuracao/${id}`,
          sinal
        );
        setDados(resposta);
        setErroCarga("");
        setNaoEncontrada(false);
        setCarregandoPagina(false);
      } catch (erro) {
        // Abort não é falha: acontece em toda troca de rota.
        const mensagem = mensagemDeErro(erro);
        if (!mensagem) return;

        if (
          erro instanceof ErroApi &&
          (erro.status === 404 || erro.code === "nao_encontrada")
        ) {
          setNaoEncontrada(true);
        } else {
          setErroCarga(mensagem);
        }
        setCarregandoPagina(false);
      }
    },
    [id]
  );

  useEffect(() => {
    const controlador = new AbortController();
    setCarregandoPagina(true);
    void buscar(controlador.signal);
    return () => controlador.abort();
  }, [buscar]);

  useEffect(() => {
    const controlador = new AbortController();
    apiGet<RespostaUsuarios>("/api/usuarios-internos", controlador.signal)
      .then((resposta) => setUsuarios(resposta.usuarios ?? []))
      .catch(() => {
        // Sem a lista o campo de responsável fica vazio, e o resto da tela
        // continua utilizável. Não vale derrubar a competência por isso.
      });
    return () => controlador.abort();
  }, []);

  // O formulário espelha o que foi carregado. Recarregar depois de uma ação
  // reposiciona os campos no valor real do banco.
  useEffect(() => {
    if (!dados) return;
    setFormulario({
      responsavelId: dados.tarefa.responsavel?.id ?? "",
      prazoEntrega: paraInputData(dados.tarefa.prazoEntrega),
      observacoes: dados.tarefa.observacoes ?? "",
    });
    setErroDados("");
  }, [dados]);

  /* ------------------------------- Derivados ------------------------------ */

  const tarefa = dados?.tarefa ?? null;
  const empresa = dados?.empresa ?? null;
  const etapas = dados?.etapas ?? [];
  const logs = dados?.logs ?? [];

  const encerrada = !!tarefa?.concluidaEm;
  const bloqueada = !!tarefa?.bloqueada;

  const totalEtapas = etapas.length || tarefa?.totalEtapas || 0;
  const resolvidas = etapas.filter((e) => RESOLVIDA.includes(e.situacao)).length;

  const logsPendencia = useMemo<LogItem[]>(
    () =>
      logs.filter(
        (log) =>
          log.acao === "BLOQUEIO_REGISTRADO" ||
          log.acao === "BLOQUEIO_RESOLVIDO"
      ),
    [logs]
  );

  /**
   * Etapas que impedem o encerramento.
   *
   * A última etapa fica FORA da conta de propósito: ela é o próprio ato de
   * encerrar, e a rota a conclui sozinha. Incluí-la deixaria o botão de
   * confirmar desabilitado para sempre.
   */
  const pendentesParaEncerrar = useMemo<EtapaResumo[]>(() => {
    if (etapas.length === 0) return [];
    const ultima = etapas[etapas.length - 1];
    return etapas
      .filter(
        (e) => e.numero !== ultima.numero && !RESOLVIDA.includes(e.situacao)
      )
      .map((e) => ({ numero: e.numero, titulo: e.titulo }));
  }, [etapas]);

  const proximaDoAlvo = useMemo<Etapa | null>(() => {
    if (!etapaAlvo) return null;
    return (
      etapas.find(
        (e) => e.numero > etapaAlvo.numero && e.situacao !== "NAO_APLICAVEL"
      ) ?? null
    );
  }, [etapas, etapaAlvo]);

  const opcoesResponsavel = useMemo<Opcao[]>(() => {
    const lista: Opcao[] = usuarios.map((u) => ({
      valor: u.id,
      texto: u.rotulo,
    }));
    // Responsável atual fora da lista (papel alterado, por exemplo) sumiria do
    // select e o "Salvar" acusaria mudança que ninguém fez.
    const atual = tarefa?.responsavel;
    if (atual && !lista.some((o) => o.valor === atual.id)) {
      lista.unshift({ valor: atual.id, texto: atual.name || atual.email });
    }
    return lista;
  }, [usuarios, tarefa]);

  const inicial = useMemo(
    () => ({
      responsavelId: tarefa?.responsavel?.id ?? "",
      prazoEntrega: paraInputData(tarefa?.prazoEntrega),
      observacoes: tarefa?.observacoes ?? "",
    }),
    [tarefa]
  );

  const mudou =
    formulario.responsavelId !== inicial.responsavelId ||
    formulario.prazoEntrega !== inicial.prazoEntrega ||
    formulario.observacoes.trim() !== inicial.observacoes.trim();

  /* --------------------------------- Ações -------------------------------- */

  const abrirModal = useCallback((nome: NomeModal, etapa?: Etapa) => {
    setModal(nome);
    setEtapaAlvo(etapa ?? null);
    setErroModal(null);
    setObservacaoModal("");
    setBloqueioResponsavel("");
    setEtapasBloqueando([]);
    setRecado(null);
  }, []);

  const fecharModal = useCallback(() => {
    if (ocupado) return;
    setModal(null);
    setEtapaAlvo(null);
    setErroModal(null);
  }, [ocupado]);

  /**
   * Executa a ação, mostra a mensagem específica dela e recarrega o GET.
   *
   * O erro fica DENTRO do modal: fechar o modal e jogar o erro na página faria a
   * pessoa perder o texto que acabou de escrever.
   */
  const rodar = useCallback(
    async function <T>(
      executor: () => Promise<T>,
      aoSucesso: (resultado: T) => Recado,
      aoFalhar?: (erro: unknown) => string | null
    ) {
      if (ocupado) return;
      setOcupado(true);
      setErroModal(null);
      try {
        const resultado = await executor();
        setModal(null);
        setEtapaAlvo(null);
        setRecado(aoSucesso(resultado));
        await buscar();
      } catch (erro) {
        setErroModal(aoFalhar?.(erro) ?? mensagemDeErro(erro));
      } finally {
        setOcupado(false);
      }
    },
    [buscar, ocupado]
  );

  const concluirEtapa = useCallback(() => {
    if (!etapaAlvo) return;
    const alvo = etapaAlvo;
    void rodar<RespostaConcluir>(
      () =>
        apiPost(`/api/tarefas/apuracao/${id}/etapa/concluir`, {
          observacao: observacaoModal.trim() || undefined,
        }),
      (resposta) => {
        if (resposta.tarefaConcluida) {
          return {
            tom: "ok",
            mensagem: `Etapa ${resposta.concluida.numero} concluída. Era a última etapa aplicável desta competência, que já pode ser encerrada.`,
          };
        }
        const proxima = resposta.proximaEtapa;
        return {
          tom: "ok",
          mensagem: proxima
            ? `Etapa ${resposta.concluida.numero} concluída. A competência avançou para a etapa ${proxima.numero}: ${proxima.titulo}.`
            : `Etapa ${resposta.concluida.numero} concluída.`,
        };
      },
      (erro) => {
        if (erro instanceof ErroApi && erro.code === "etapa_ja_concluida") {
          return `A etapa ${alvo.numero} já estava concluída. A tela vai recarregar com a posição atual.`;
        }
        return null;
      }
    );
  }, [etapaAlvo, id, observacaoModal, rodar]);

  const voltarEtapa = useCallback(
    (motivo: string) => {
      void rodar<RespostaVoltar>(
        () => apiPost(`/api/tarefas/apuracao/${id}/etapa/voltar`, { motivo }),
        (resposta) => ({
          tom: "atencao",
          mensagem: `Etapa ${resposta.etapaRetornada} retornada. A competência voltou para a etapa ${resposta.etapaAtual}${
            resposta.tituloEtapaAtual ? `: ${resposta.tituloEtapaAtual}` : ""
          }. O motivo ficou no histórico.`,
        })
      );
    },
    [id, rodar]
  );

  const dispensarEtapa = useCallback(
    (motivo: string) => {
      if (!etapaAlvo) return;
      const numero = etapaAlvo.numero;
      void rodar<RespostaNaoAplicavel>(
        () =>
          apiPost(
            `/api/tarefas/apuracao/${id}/etapa/${numero}/nao-aplicavel`,
            { motivo: motivo || undefined }
          ),
        (resposta) => ({
          tom: "info",
          mensagem: `Etapa ${resposta.etapa.numero} registrada como não aplicável. Ela continua visível no fluxo, marcada como dispensada.`,
        })
      );
    },
    [etapaAlvo, id, rodar]
  );

  const registrarPendencia = useCallback(
    (motivo: string) => {
      if (!bloqueioResponsavel) {
        setErroModal("Informe quem está com a pendência.");
        return;
      }
      void rodar<RespostaBloqueio>(
        () =>
          apiPost(`/api/tarefas/apuracao/${id}/bloqueio`, {
            motivo,
            responsavel: bloqueioResponsavel,
          }),
        (resposta) => ({
          tom: "atencao",
          mensagem: `Pendência registrada para ${
            BLOQUEIO_RESPONSAVEL_LABEL[resposta.bloqueioResponsavel ?? ""] ??
            "o responsável informado"
          }. A competência fica travada até a pendência ser resolvida.`,
        })
      );
    },
    [bloqueioResponsavel, id, rodar]
  );

  const resolverPendencia = useCallback(
    (observacao: string) => {
      void rodar<RespostaResolver>(
        () =>
          apiDelete(`/api/tarefas/apuracao/${id}/bloqueio`, {
            observacao: observacao || undefined,
          }),
        (resposta) => ({
          tom: "ok",
          mensagem:
            resposta.diasEmBloqueio === null
              ? "Pendência resolvida. A competência voltou a andar."
              : `Pendência resolvida depois de ${plural(
                  resposta.diasEmBloqueio,
                  "dia",
                  "dias"
                )}. A competência voltou a andar.`,
        })
      );
    },
    [id, rodar]
  );

  const encerrarCompetencia = useCallback(() => {
    void rodar<RespostaEncerrar>(
      () =>
        apiPost(`/api/tarefas/apuracao/${id}/encerrar`, {
          observacao: observacaoModal.trim() || undefined,
        }),
      (resposta) => ({
        tom: "ok",
        mensagem: `Competência encerrada em ${dataHora(resposta.concluidaEm)}.`,
      }),
      (erro) => {
        if (erro instanceof ErroApi && erro.code === "etapas_pendentes") {
          const faltando = etapasDoErro(erro);
          setEtapasBloqueando(faltando);
          setModal("encerrar");
          return faltando.length
            ? `${erro.message} Etapas em aberto: ${listaEtapas(faltando)}.`
            : erro.message;
        }
        return null;
      }
    );
  }, [id, observacaoModal, rodar]);

  const reabrirCompetencia = useCallback(
    (motivo: string) => {
      void rodar<RespostaReabrir>(
        () => apiPost(`/api/tarefas/apuracao/${id}/reabrir`, { motivo }),
        (resposta) => ({
          tom: "atencao",
          mensagem: `Competência reaberta na etapa ${resposta.etapaAtual}${
            resposta.tituloEtapaAtual ? `: ${resposta.tituloEtapaAtual}` : ""
          }. O encerramento anterior continua no histórico.`,
        })
      );
    },
    [id, rodar]
  );

  /**
   * PATCH da aba Dados.
   *
   * Manda SÓ o que mudou, e manda `null` (não `""`) para limpar: a rota trata
   * string vazia como limpeza também, mas `null` é o contrato explícito e não
   * depende dessa gentileza.
   */
  const salvarDados = useCallback(async () => {
    if (!mudou || salvando) return;

    const corpo: Record<string, string | null> = {};
    if (formulario.responsavelId !== inicial.responsavelId) {
      corpo.responsavelId = formulario.responsavelId || null;
    }
    if (formulario.prazoEntrega !== inicial.prazoEntrega) {
      corpo.prazoEntrega = formulario.prazoEntrega || null;
    }
    if (formulario.observacoes.trim() !== inicial.observacoes.trim()) {
      corpo.observacoes = formulario.observacoes.trim() || null;
    }

    setSalvando(true);
    setErroDados("");
    setRecado(null);
    try {
      const resposta = await apiPatch<RespostaPatch>(
        `/api/tarefas/apuracao/${id}`,
        corpo
      );

      if (!resposta.atualizada) {
        setRecado({
          tom: "info",
          mensagem: resposta.mensagem ?? "Nenhuma alteração a aplicar.",
        });
        return;
      }

      const traduzidas = (resposta.alteracoes ?? []).map(
        (acao) => ACAO_LOG_LABEL[acao] ?? acao
      );
      setRecado({
        tom: "ok",
        mensagem: traduzidas.length
          ? `Dados salvos: ${traduzidas.join(", ")}.`
          : "Dados da competência salvos.",
      });

      // A rota não devolve a tarefa; sem recarregar, prazo e responsável na
      // ficha continuariam mostrando o valor antigo.
      await buscar();
    } catch (erro) {
      setErroDados(mensagemDeErro(erro));
    } finally {
      setSalvando(false);
    }
  }, [buscar, formulario, id, inicial, mudou, salvando]);

  /* ------------------------------- Estados -------------------------------- */

  if (naoEncontrada) {
    return (
      <div className="cz-tarefas p-6 max-w-[1800px] mx-auto space-y-6">
        <Cabecalho
          titulo="Competência não encontrada"
          descricao="O registro pode ter sido removido ou o endereço está incorreto."
          icone="Calculator"
          voltarPara="/admin/tarefas/apuracao"
          voltarTexto="Apuração fiscal"
        />
        <Painel>
          <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
              <Icone nome="CalendarOff" className="h-7 w-7 text-gray-400" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Esta competência não existe mais
              </h2>
              <p className="mt-1 max-w-md text-sm text-gray-500">
                Volte para a lista de apuração fiscal e escolha uma competência
                pela empresa e pelo mês.
              </p>
            </div>
            <Link
              href="/admin/tarefas/apuracao"
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
            >
              <Icone nome="ArrowLeft" className="h-4 w-4" />
              Ir para a apuração fiscal
            </Link>
          </div>
        </Painel>
      </div>
    );
  }

  if (carregandoPagina && !dados) {
    return (
      <div className="cz-tarefas p-6 max-w-[1800px] mx-auto space-y-6">
        <Carregando texto="Carregando a competência" />
      </div>
    );
  }

  if (!dados || !tarefa || !empresa) {
    return (
      <div className="cz-tarefas p-6 max-w-[1800px] mx-auto space-y-6">
        <Cabecalho
          titulo="Apuração fiscal"
          descricao="Não foi possível carregar esta competência."
          icone="Calculator"
          voltarPara="/admin/tarefas/apuracao"
          voltarTexto="Apuração fiscal"
        />
        <Aviso
          tom="erro"
          mensagem={erroCarga || "Não foi possível carregar esta competência."}
        />
        <Botao
          variante="primario"
          icone="RefreshCw"
          onClick={() => {
            setCarregandoPagina(true);
            void buscar();
          }}
        >
          Tentar novamente
        </Botao>
      </div>
    );
  }

  /* -------------------------------- Render -------------------------------- */

  const etapaExibida = totalEtapas
    ? Math.min(Math.max(tarefa.etapaAtual, 1), totalEtapas)
    : tarefa.etapaAtual;

  return (
    <div className="cz-tarefas p-6 max-w-[1800px] mx-auto space-y-6">
      <Cabecalho
        titulo={nomeEmpresa(empresa)}
        descricao={`${tarefa.competenciaLabel} · ${
          REGIME_LABEL[tarefa.regime] ?? tarefa.regime
        } · ${formatarCnpj(empresa.cnpj)}`}
        icone="Calculator"
        voltarPara="/admin/tarefas/apuracao"
        voltarTexto="Apuração fiscal"
        acoes={
          <>
            {permissoes.gerenciarBloqueio && !bloqueada && !encerrada && (
              <Botao
                variante="secundario"
                icone="AlertTriangle"
                disabled={ocupado}
                onClick={() => abrirModal("bloquear")}
              >
                Registrar pendência
              </Botao>
            )}
            {permissoes.gerenciarBloqueio && bloqueada && (
              <Botao
                variante="primario"
                icone="Unlock"
                disabled={ocupado}
                onClick={() => abrirModal("resolver")}
              >
                Resolver pendência
              </Botao>
            )}
            {permissoes.encerrarTarefa && !encerrada && (
              <Botao
                variante="escuro"
                icone="ClipboardCheck"
                disabled={ocupado}
                onClick={() => abrirModal("encerrar")}
              >
                Encerrar competência
              </Botao>
            )}
            {permissoes.reabrirTarefa && encerrada && (
              <Botao
                variante="perigo"
                icone="RotateCcw"
                disabled={ocupado}
                onClick={() => abrirModal("reabrir")}
              >
                Reabrir
              </Botao>
            )}
          </>
        }
      />

      {recado && (
        <Aviso
          tom={recado.tom}
          mensagem={recado.mensagem}
          onFechar={() => setRecado(null)}
        />
      )}

      {erroCarga && (
        <Aviso
          tom="erro"
          mensagem={`${erroCarga} Os dados na tela podem estar defasados.`}
          onFechar={() => setErroCarga("")}
        />
      )}

      {/* Faixa de resumo: estado da competência em uma linha de leitura. */}
      <Painel className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeloStatus status={tarefa.status} />
          <SeloRegime regime={tarefa.regime} completo />
          <SeloPrazo situacao={tarefa.prazo.situacao} dias={tarefa.prazo.dias} />
          {bloqueada && (
            <SeloBloqueio
              responsavel={tarefa.bloqueioResponsavel}
              dias={tarefa.diasEmBloqueio}
            />
          )}
          {tarefa.responsavelEtapaAtual && !encerrada && (
            <SeloResponsavelEtapa tipo={tarefa.responsavelEtapaAtual} />
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-gray-900">
            Etapa {etapaExibida} de {totalEtapas}
            {tarefa.tituloEtapaAtual && !encerrada && (
              <span className="font-normal text-gray-500">
                {" "}
                · {tarefa.tituloEtapaAtual}
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500">
            {resolvidas} de {totalEtapas} etapas resolvidas
          </p>
        </div>
        <Progresso feito={resolvidas} total={totalEtapas} className="mt-2" />
      </Painel>

      {bloqueada && (
        <Aviso
          tom="atencao"
          mensagem={`Pendência aberta com ${
            BLOQUEIO_RESPONSAVEL_LABEL[tarefa.bloqueioResponsavel ?? ""] ??
            "responsável não informado"
          } há ${plural(tarefa.diasEmBloqueio ?? 0, "dia", "dias")}: ${
            tarefa.bloqueioMotivo ?? "sem motivo registrado"
          }`}
        />
      )}

      {encerrada && (
        <Aviso
          tom="ok"
          mensagem={`Competência encerrada em ${dataHora(tarefa.concluidaEm)}.`}
        />
      )}

      {/* Ficha de dados. */}
      <Painel
        titulo="Dados da competência"
        descricao="Cadastro da empresa e marcos desta apuração."
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-5 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
          <Dado rotulo="Empresa">
            <Link
              href={`/admin/empresas/${empresa.id}`}
              className="inline-flex items-center gap-1.5 text-orange-600 transition-colors hover:text-orange-700 hover:underline"
            >
              <span className="truncate">{empresa.razaoSocial}</span>
              <Icone nome="ExternalLink" className="h-3.5 w-3.5 shrink-0" />
            </Link>
          </Dado>
          <Dado rotulo="CNPJ">{formatarCnpj(empresa.cnpj)}</Dado>
          <Dado rotulo="Situação da empresa">
            <SeloSituacaoEmpresa situacao={empresa.situacao} />
          </Dado>
          <Dado rotulo="Regime">
            <SeloRegime regime={tarefa.regime} completo />
          </Dado>
          <Dado rotulo="Tributo local">
            {TRIBUTO_LOCAL_LABEL[empresa.tributoLocal] ?? empresa.tributoLocal}
          </Dado>
          <Dado rotulo="UF / Município">
            {empresa.uf || empresa.municipio
              ? `${empresa.uf ?? "—"} / ${empresa.municipio ?? "—"}`
              : "—"}
          </Dado>
          <Dado rotulo="Competência">{tarefa.competenciaLabel}</Dado>
          <Dado rotulo="Prazo de entrega">
            {dataCurta(tarefa.prazoEntrega)}
          </Dado>
          <Dado rotulo="Responsável">
            {tarefa.responsavel
              ? tarefa.responsavel.name || tarefa.responsavel.email
              : "Sem responsável"}
          </Dado>
          <Dado rotulo="Iniciada em">{dataHora(tarefa.iniciadaEm)}</Dado>
          <Dado rotulo="Encerrada em">{dataHora(tarefa.concluidaEm)}</Dado>
          <Dado rotulo="Última alteração">{dataHora(tarefa.atualizadaEm)}</Dado>
        </dl>

        {tarefa.observacoes && (
          <div className="border-t border-gray-200 px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Observações
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-gray-700">
              {tarefa.observacoes}
            </p>
          </div>
        )}
      </Painel>

      {/* Abas. */}
      <div>
        <Abas
          abas={[
            { chave: "etapas", texto: "Etapas", contagem: etapas.length },
            {
              chave: "pendencias",
              texto: "Pendências",
              contagem: bloqueada ? 1 : 0,
            },
            {
              chave: "anexos",
              texto: "Anexos",
              // A contagem só existe depois de a aba ser aberta uma vez: a lista
              // de anexos é carregada sob demanda, e disparar essa requisição no
              // detalhe inteiro só para pintar um número não se paga.
              contagem: totalAnexos ?? undefined,
            },
            { chave: "historico", texto: "Histórico", contagem: logs.length },
            { chave: "dados", texto: "Dados" },
          ]}
          ativa={aba}
          onMudar={setAba}
        />

        <div className="mt-5">
          {aba === "anexos" && (
            <Painel
              titulo="Anexos da competência"
              descricao="Documento e imagem que sustentam o trabalho do mês: planilha de faturamento, XML, guia paga, recibo de entrega."
            >
              <div
                className="px-5 py-4"
                role="tabpanel"
                aria-label="Anexos da competência"
              >
                <AnexosDaTarefa
                  alvo={{ apuracaoId: tarefa.id }}
                  usuarioId={sessao?.userId}
                  ehAdmin={papel === PAPEL.ADMIN}
                  onMudou={setTotalAnexos}
                />
              </div>
            </Painel>
          )}

          {aba === "etapas" && (
            <Painel
              titulo="Trilha de etapas"
              descricao="A etapa em curso é a única que se move. Cada movimento vai para o histórico."
            >
              <div role="tabpanel" aria-label="Etapas">
                <ListaEtapas
                  etapas={etapas}
                  etapaAtual={tarefa.etapaAtual}
                  permissoes={permissoes}
                  bloqueada={bloqueada}
                  encerrada={encerrada}
                  podeVoltar={permissoes.retornarEtapa}
                  ocupado={ocupado}
                  onConcluir={(etapa) => abrirModal("concluir", etapa)}
                  onVoltar={(etapa) => abrirModal("voltar", etapa)}
                  onDispensar={(etapa) => abrirModal("dispensar", etapa)}
                />
              </div>
            </Painel>
          )}

          {aba === "pendencias" && (
            <div className="space-y-5" role="tabpanel" aria-label="Pendências">
              {bloqueada ? (
                <Painel
                  titulo="Pendência aberta"
                  descricao="Enquanto existir pendência, a etapa não avança e a competência não encerra."
                  acoes={
                    permissoes.gerenciarBloqueio ? (
                      <Botao
                        variante="primario"
                        icone="Unlock"
                        disabled={ocupado}
                        onClick={() => abrirModal("resolver")}
                      >
                        Resolver pendência
                      </Botao>
                    ) : undefined
                  }
                >
                  <div className="space-y-4 px-5 py-5">
                    <div className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3">
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#B54708]">
                        <Icone nome="AlertTriangle" className="h-4 w-4" />
                        Motivo registrado
                      </p>
                      <p className="mt-1.5 whitespace-pre-line text-sm text-[#93370D]">
                        {tarefa.bloqueioMotivo ?? "Sem motivo registrado."}
                      </p>
                    </div>

                    <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-3">
                      <Dado rotulo="Quem está com a pendência">
                        {BLOQUEIO_RESPONSAVEL_LABEL[
                          tarefa.bloqueioResponsavel ?? ""
                        ] ?? "Não informado"}
                      </Dado>
                      <Dado rotulo="Aberta em">
                        {dataHora(tarefa.bloqueioDesde)}
                      </Dado>
                      <Dado rotulo="Tempo travada">
                        {plural(tarefa.diasEmBloqueio ?? 0, "dia", "dias")}
                      </Dado>
                    </dl>
                  </div>
                </Painel>
              ) : (
                <Painel>
                  <div className="flex items-start gap-3 px-5 py-5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ECFDF3] text-[#027A48]">
                      <Icone nome="CheckCircle2" className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">
                        Nenhuma pendência aberta
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {logsPendencia.length > 0
                          ? `Esta competência já teve pendências, todas resolvidas. O registro está abaixo.`
                          : "Esta competência nunca ficou travada. A etapa segue o fluxo normal."}
                      </p>
                    </div>
                  </div>
                </Painel>
              )}

              <Painel
                titulo="Histórico de pendências"
                descricao="Só as entradas de pendência registrada e resolvida."
              >
                <Historico
                  logs={logsPendencia}
                  vazio="Nenhuma pendência registrada nesta competência."
                />
              </Painel>
            </div>
          )}

          {aba === "historico" && (
            <Painel
              titulo="Histórico de alterações"
              descricao="O que mudou, quem mudou e quando."
            >
              <div role="tabpanel" aria-label="Histórico">
                <Historico logs={logs} truncado={logs.length >= 100} />
              </div>
            </Painel>
          )}

          {aba === "dados" && (
            <Painel
              titulo="Editar dados da competência"
              descricao="Responsável, prazo e observações. Cada alteração vai para o histórico."
            >
              <form
                role="tabpanel"
                aria-label="Dados"
                className="space-y-5 px-5 py-5"
                onSubmit={(evento) => {
                  evento.preventDefault();
                  void salvarDados();
                }}
              >
                {erroDados && <Aviso tom="erro" mensagem={erroDados} />}

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Escolha
                    rotulo="Responsável"
                    vazio="Sem responsável"
                    opcoes={opcoesResponsavel}
                    value={formulario.responsavelId}
                    disabled={salvando}
                    ajuda="Quem responde por esta competência dentro do escritório."
                    onChange={(evento) =>
                      setFormulario((atual) => ({
                        ...atual,
                        responsavelId: evento.target.value,
                      }))
                    }
                  />

                  <Entrada
                    rotulo="Prazo de entrega"
                    type="date"
                    value={formulario.prazoEntrega}
                    disabled={salvando}
                    ajuda="Deixe em branco para remover o prazo."
                    onChange={(evento) =>
                      setFormulario((atual) => ({
                        ...atual,
                        prazoEntrega: evento.target.value,
                      }))
                    }
                  />
                </div>

                <Area
                  rotulo="Observações"
                  rows={4}
                  value={formulario.observacoes}
                  disabled={salvando}
                  ajuda="Contexto que a próxima pessoa precisa saber ao abrir esta competência."
                  placeholder="Ex.: cliente entrega o faturamento sempre depois do dia 10"
                  onChange={(evento) =>
                    setFormulario((atual) => ({
                      ...atual,
                      observacoes: evento.target.value,
                    }))
                  }
                />

                <div className="flex flex-wrap items-center gap-3">
                  <Botao
                    type="submit"
                    variante="primario"
                    icone="Save"
                    disabled={!mudou || salvando}
                    carregando={salvando}
                    textoCarregando="Salvando"
                  >
                    Salvar
                  </Botao>
                  {mudou && !salvando && (
                    <Botao
                      variante="fantasma"
                      icone="RotateCcw"
                      onClick={() => setFormulario(inicial)}
                    >
                      Descartar alterações
                    </Botao>
                  )}
                  {!mudou && !salvando && (
                    <span className="text-xs text-gray-500">
                      Nada alterado desde o último carregamento.
                    </span>
                  )}
                </div>
              </form>
            </Painel>
          )}
        </div>
      </div>

      {/* ------------------------------- Modais ------------------------------ */}

      {/* Concluir etapa: observação OPCIONAL, então Modal comum, não ModalMotivo. */}
      <Modal
        aberto={modal === "concluir"}
        titulo="Concluir etapa"
        descricao={
          etapaAlvo
            ? `Etapa ${etapaAlvo.numero}: ${etapaAlvo.titulo}`
            : undefined
        }
        icone="CheckCircle2"
        onFechar={fecharModal}
        rodape={
          <>
            <Botao
              variante="secundario"
              onClick={fecharModal}
              disabled={ocupado}
            >
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              icone="CheckCircle2"
              onClick={concluirEtapa}
              carregando={ocupado}
              textoCarregando="Concluindo"
            >
              Concluir etapa
            </Botao>
          </>
        }
      >
        <div className="space-y-4">
          {erroModal && <Aviso tom="erro" mensagem={erroModal} />}

          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
            <p className="flex items-start gap-2 text-gray-700">
              <Icone
                nome="CheckCircle2"
                className="mt-0.5 h-4 w-4 shrink-0 text-[#027A48]"
              />
              <span>
                Concluindo:{" "}
                <span className="font-semibold text-gray-900">
                  {etapaAlvo
                    ? `etapa ${etapaAlvo.numero} — ${etapaAlvo.titulo}`
                    : "etapa atual"}
                </span>
              </span>
            </p>
            <p className="mt-2 flex items-start gap-2 text-gray-700">
              <Icone
                nome="ChevronRight"
                className="mt-0.5 h-4 w-4 shrink-0 text-orange-500"
              />
              <span>
                {proximaDoAlvo ? (
                  <>
                    Em seguida:{" "}
                    <span className="font-semibold text-gray-900">
                      etapa {proximaDoAlvo.numero} — {proximaDoAlvo.titulo}
                    </span>
                  </>
                ) : (
                  "Esta é a última etapa aplicável. Depois dela a competência já pode ser encerrada."
                )}
              </span>
            </p>
          </div>

          <Area
            rotulo="Observação"
            rows={3}
            value={observacaoModal}
            ajuda="Opcional. Fica registrada na etapa e no histórico, com seu nome."
            placeholder="Ex.: cliente enviou o faturamento por e-mail"
            onChange={(evento) => setObservacaoModal(evento.target.value)}
          />
        </div>
      </Modal>

      {/* Voltar etapa. */}
      <ModalMotivo
        aberto={modal === "voltar"}
        titulo="Voltar etapa"
        descricao="A etapa atual volta a ficar pendente e a competência retrocede para a etapa anterior. O motivo fica registrado no histórico com seu nome."
        icone="RotateCcw"
        minimo={5}
        textoConfirmar="Voltar etapa"
        varianteConfirmar="perigo"
        erro={erroModal}
        enviando={ocupado}
        onFechar={fecharModal}
        onConfirmar={voltarEtapa}
        extra={
          etapaAlvo ? (
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              Etapa em curso:{" "}
              <span className="font-semibold text-gray-900">
                {etapaAlvo.numero} — {etapaAlvo.titulo}
              </span>
            </p>
          ) : undefined
        }
      />

      {/* Marcar etapa como não aplicável: a rota aceita motivo vazio. */}
      <ModalMotivo
        aberto={modal === "dispensar"}
        titulo="Marcar etapa como não aplicável"
        descricao="A etapa fica registrada como dispensada, não é apagada: ela continua visível no fluxo, riscada, com o motivo ao lado."
        icone="MinusCircle"
        rotulo="Motivo"
        obrigatorio={false}
        minimo={5}
        textoConfirmar="Marcar como não aplicável"
        varianteConfirmar="escuro"
        erro={erroModal}
        enviando={ocupado}
        onFechar={fecharModal}
        onConfirmar={dispensarEtapa}
        extra={
          etapaAlvo ? (
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              Etapa:{" "}
              <span className="font-semibold text-gray-900">
                {etapaAlvo.numero} — {etapaAlvo.titulo}
              </span>
            </p>
          ) : undefined
        }
      />

      {/* Registrar pendência. */}
      <ModalMotivo
        aberto={modal === "bloquear"}
        titulo="Registrar pendência"
        descricao="A competência fica travada: a etapa não avança e não é possível encerrar até a pendência ser resolvida."
        icone="AlertTriangle"
        rotulo="Motivo da pendência"
        minimo={5}
        textoConfirmar="Registrar pendência"
        varianteConfirmar="escuro"
        erro={erroModal}
        enviando={ocupado}
        onFechar={fecharModal}
        onConfirmar={registrarPendencia}
        extra={
          <Escolha
            rotulo="Quem está com a pendência"
            required
            vazio="Selecione o responsável"
            opcoes={OPCOES_BLOQUEIO}
            value={bloqueioResponsavel}
            disabled={ocupado}
            ajuda="É o que define de quem se cobra a solução, e a contagem de dias travados."
            onChange={(evento) => setBloqueioResponsavel(evento.target.value)}
          />
        }
      />

      {/* Resolver pendência: observação opcional. */}
      <ModalMotivo
        aberto={modal === "resolver"}
        titulo="Resolver pendência"
        descricao="A competência volta a andar e o tempo total travado fica registrado no histórico."
        icone="Unlock"
        rotulo="Observação"
        obrigatorio={false}
        ajuda="Opcional. Como a pendência foi resolvida."
        textoConfirmar="Resolver pendência"
        varianteConfirmar="primario"
        erro={erroModal}
        enviando={ocupado}
        onFechar={fecharModal}
        onConfirmar={resolverPendencia}
        extra={
          <div className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-sm text-[#93370D]">
            <p className="font-semibold">
              {BLOQUEIO_RESPONSAVEL_LABEL[tarefa.bloqueioResponsavel ?? ""] ??
                "Pendência"}
              {" · "}
              {plural(tarefa.diasEmBloqueio ?? 0, "dia", "dias")}
            </p>
            <p className="mt-1 whitespace-pre-line">
              {tarefa.bloqueioMotivo ?? "Sem motivo registrado."}
            </p>
          </div>
        }
      />

      {/* Encerrar competência. */}
      <Modal
        aberto={modal === "encerrar"}
        titulo="Encerrar competência"
        descricao={`${tarefa.competenciaLabel} · ${nomeEmpresa(empresa)}`}
        icone="ClipboardCheck"
        largura="lg"
        onFechar={fecharModal}
        rodape={
          <>
            <Botao
              variante="secundario"
              onClick={fecharModal}
              disabled={ocupado}
            >
              Cancelar
            </Botao>
            <Botao
              variante="escuro"
              icone="ClipboardCheck"
              onClick={encerrarCompetencia}
              carregando={ocupado}
              textoCarregando="Encerrando"
              disabled={pendentesParaEncerrar.length > 0}
              title={
                pendentesParaEncerrar.length > 0
                  ? "Resolva as etapas em aberto antes de encerrar"
                  : undefined
              }
            >
              Encerrar competência
            </Botao>
          </>
        }
      >
        <div className="space-y-4">
          {erroModal && <Aviso tom="erro" mensagem={erroModal} />}

          {pendentesParaEncerrar.length > 0 ? (
            <Aviso
              tom="atencao"
              mensagem={`Ainda ${
                pendentesParaEncerrar.length === 1
                  ? "falta 1 etapa"
                  : `faltam ${pendentesParaEncerrar.length} etapas`
              } para encerrar: ${listaEtapas(
                pendentesParaEncerrar
              )}. Conclua ou marque como não aplicável antes de encerrar.`}
            />
          ) : (
            <Aviso
              tom="ok"
              mensagem="Todas as etapas anteriores estão resolvidas. A última etapa é o próprio encerramento e será concluída agora."
            />
          )}

          {etapasBloqueando.length > 0 && (
            <Aviso
              tom="erro"
              mensagem={`O servidor recusou o encerramento: etapas em aberto ${listaEtapas(
                etapasBloqueando
              )}. Alguém pode ter mexido nas etapas enquanto esta tela estava aberta.`}
            />
          )}

          <Area
            rotulo="Observação de encerramento"
            rows={3}
            value={observacaoModal}
            ajuda="Opcional. Fica no histórico junto com o encerramento."
            placeholder="Ex.: guias enviadas e arquivos anexados no portal"
            onChange={(evento) => setObservacaoModal(evento.target.value)}
          />
        </div>
      </Modal>

      {/* Reabrir competência. */}
      <ModalMotivo
        aberto={modal === "reabrir"}
        titulo="Reabrir competência"
        descricao="A competência volta para a última etapa concluída e passa a aceitar movimentação de novo. O encerramento anterior continua no histórico."
        icone="RotateCcw"
        minimo={5}
        textoConfirmar="Reabrir competência"
        varianteConfirmar="perigo"
        erro={erroModal}
        enviando={ocupado}
        onFechar={fecharModal}
        onConfirmar={reabrirCompetencia}
        extra={
          <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
            Encerrada em{" "}
            <span className="font-semibold text-gray-900">
              {dataHora(tarefa.concluidaEm)}
            </span>
          </p>
        }
      />
    </div>
  );
}
