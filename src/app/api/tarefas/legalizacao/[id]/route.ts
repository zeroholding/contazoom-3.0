/**
 * Detalhe e edição de campos de um processo de legalização.
 *
 * Mover etapa, bloquear, encerrar e reabrir têm rotas próprias: aqui só entram
 * campos que não alteram a posição no fluxo.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireInterno } from "@/lib/api-guard";
import {
  ACAO_LOG,
  TIPO_PROCESSO_LABEL,
  ORGAO_EXTERNO_LABEL,
  BLOQUEIO_RESPONSAVEL_LABEL,
} from "@/lib/tarefa-etapas";
import { situacaoPrazo, diasEmBloqueio } from "@/lib/tarefa-status";
import {
  diasEmAberto,
  etapaEmCurso,
  etapasNaoResolvidas,
  lerCorpo,
  parseDataOpcional,
  registrarLogProcesso,
  textoLimpo,
} from "@/lib/legalizacao-service";

const LIMITE_LOGS = 100;

function erro(mensagem: string, status: number, code?: string): NextResponse {
  return NextResponse.json(code ? { error: mensagem, code } : { error: mensagem }, {
    status,
  });
}

/** Data no formato de dia, para o log ficar legível ("20/03/2026"). */
function dataLegivel(valor: Date | null): string | null {
  if (!valor) return null;
  return valor.toISOString().slice(0, 10).split("-").reverse().join("/");
}

/* -------------------------------------------------------------------------- */
/*                                    GET                                     */
/* -------------------------------------------------------------------------- */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  try {
    const processo = await prisma.processoLegalizacao.findUnique({
      where: { id },
      include: {
        empresa: {
          select: {
            id: true,
            cnpj: true,
            razaoSocial: true,
            nomeFantasia: true,
            regime: true,
            planoInterno: true,
            // `situacao` continua vindo porque a coluna existe e é derivada, mas a
            // tela não a mostra mais: quem responde pelo estado operacional da
            // empresa é o plano interno.
            situacao: true,
            uf: true,
            municipio: true,
          },
        },
        responsavel: { select: { id: true, name: true, email: true } },
        etapas: { orderBy: { numero: "asc" } },
        logs: {
          orderBy: { createdAt: "desc" },
          take: LIMITE_LOGS,
          select: {
            id: true,
            acao: true,
            de: true,
            para: true,
            detalhe: true,
            autorNome: true,
            autorPapel: true,
            createdAt: true,
          },
        },
      },
    });

    if (!processo) {
      return erro("Processo não encontrado.", 404, "PROCESSO_NAO_ENCONTRADO");
    }

    const agora = new Date();
    const concluido = Boolean(processo.concluidoEm);
    const numeroAtual = etapaEmCurso(processo.etapaAtual);
    const etapaAtual = processo.etapas.find((e) => e.numero === numeroAtual) ?? null;
    const pendentes = etapasNaoResolvidas(processo.etapas);
    const prazo = situacaoPrazo(processo.prazoEstimado, concluido, agora);

    return NextResponse.json({
      ...processo,
      tipoLabel: TIPO_PROCESSO_LABEL[processo.tipo] ?? processo.tipo,
      orgaoExternoLabel: processo.orgaoExterno
        ? ORGAO_EXTERNO_LABEL[processo.orgaoExterno] ?? processo.orgaoExterno
        : null,
      bloqueioResponsavelLabel: processo.bloqueioResponsavel
        ? BLOQUEIO_RESPONSAVEL_LABEL[processo.bloqueioResponsavel] ??
          processo.bloqueioResponsavel
        : null,
      etapaAtualTitulo: etapaAtual?.titulo ?? null,
      etapasTotal: processo.etapas.length,
      etapasResolvidas: processo.etapas.length - pendentes.length,
      etapasPendentes: pendentes,
      situacaoPrazo: prazo.situacao,
      diasPrazo: prazo.dias,
      diasEmAberto: diasEmAberto(processo.abertoEm, processo.concluidoEm, agora),
      diasEmBloqueio: processo.bloqueada
        ? diasEmBloqueio(processo.bloqueioDesde, agora)
        : null,
      // O log é sempre parcial na tela de detalhe; a auditoria completa vive em
      // /api/tarefas/log. A flag evita a tela dar a impressão de log truncado
      // sem avisar.
      logsTruncados: processo.logs.length === LIMITE_LOGS,
    });
  } catch (e) {
    console.error("[legalizacao][GET id] falha ao carregar processo:", e);
    return erro("Erro ao carregar o processo.", 500);
  }
}

/* -------------------------------------------------------------------------- */
/*                                   PATCH                                    */
/* -------------------------------------------------------------------------- */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  const corpo = await lerCorpo(req);
  if (!corpo) return erro("Corpo da requisição inválido.", 400, "CORPO_INVALIDO");

  const alteraResponsavel = "responsavelId" in corpo;
  const alteraPrazo = "prazoEstimado" in corpo;
  const alteraObservacoes = "observacoes" in corpo;
  const alteraIdentificacao = "identificacaoProvisoria" in corpo;

  if (
    !alteraResponsavel &&
    !alteraPrazo &&
    !alteraObservacoes &&
    !alteraIdentificacao
  ) {
    return erro(
      "Informe pelo menos um campo: responsavelId, prazoEstimado, observacoes ou identificacaoProvisoria.",
      400,
      "NADA_A_ALTERAR"
    );
  }

  let prazoInformado: Date | null = null;
  if (alteraPrazo) {
    const prazo = parseDataOpcional(corpo.prazoEstimado);
    if (!prazo.ok) {
      return erro("Prazo estimado inválido.", 400, "PRAZO_INVALIDO");
    }
    prazoInformado = prazo.valor;
  }

  try {
    const processo = await prisma.processoLegalizacao.findUnique({
      where: { id },
      select: {
        id: true,
        concluidoEm: true,
        responsavelId: true,
        prazoEstimado: true,
        observacoes: true,
        identificacaoProvisoria: true,
        responsavel: { select: { name: true, email: true } },
      },
    });
    if (!processo) {
      return erro("Processo não encontrado.", 404, "PROCESSO_NAO_ENCONTRADO");
    }

    // Processo encerrado é registro fechado. Observação continua liberada porque
    // esclarecimento posterior é legítimo e não muda a execução; responsável,
    // prazo e identificação mudariam a leitura do que foi entregue.
    if (
      processo.concluidoEm &&
      (alteraResponsavel || alteraPrazo || alteraIdentificacao)
    ) {
      return erro(
        "Processo encerrado. Reabra o processo para alterar responsável, prazo ou identificação.",
        409,
        "PROCESSO_ENCERRADO"
      );
    }

    const novoResponsavelId = alteraResponsavel
      ? textoLimpo(corpo.responsavelId)
      : processo.responsavelId;

    let nomeNovoResponsavel: string | null = null;
    if (alteraResponsavel && novoResponsavelId) {
      const usuario = await prisma.user.findUnique({
        where: { id: novoResponsavelId },
        select: { name: true, email: true },
      });
      if (!usuario) {
        return erro("Responsável não encontrado.", 400, "RESPONSAVEL_INVALIDO");
      }
      nomeNovoResponsavel = usuario.name || usuario.email;
    }

    const novaObservacao = alteraObservacoes
      ? textoLimpo(corpo.observacoes)
      : processo.observacoes;
    const novaIdentificacao = alteraIdentificacao
      ? textoLimpo(corpo.identificacaoProvisoria)
      : processo.identificacaoProvisoria;
    const novoPrazo = alteraPrazo ? prazoInformado : processo.prazoEstimado;

    const atualizado = await prisma.$transaction(async (tx) => {
      const dados: {
        responsavelId?: string | null;
        prazoEstimado?: Date | null;
        observacoes?: string | null;
        identificacaoProvisoria?: string | null;
      } = {};

      if (alteraResponsavel && novoResponsavelId !== processo.responsavelId) {
        dados.responsavelId = novoResponsavelId;
      }
      if (
        alteraPrazo &&
        (novoPrazo?.getTime() ?? null) !==
          (processo.prazoEstimado?.getTime() ?? null)
      ) {
        dados.prazoEstimado = novoPrazo;
      }
      if (alteraObservacoes && novaObservacao !== processo.observacoes) {
        dados.observacoes = novaObservacao;
      }
      if (alteraIdentificacao && novaIdentificacao !== processo.identificacaoProvisoria) {
        dados.identificacaoProvisoria = novaIdentificacao;
      }

      // Um log por campo que realmente mudou. Campo reenviado com o mesmo valor
      // não gera linha: log cheio de "alterou de X para X" esconde o que
      // importa.
      if ("responsavelId" in dados) {
        await registrarLogProcesso(tx, {
          processoId: id,
          acao: ACAO_LOG.RESPONSAVEL_ALTERADO,
          de: processo.responsavel
            ? processo.responsavel.name || processo.responsavel.email
            : "sem responsável",
          para: nomeNovoResponsavel ?? "sem responsável",
          sessao,
        });
      }
      if ("prazoEstimado" in dados) {
        await registrarLogProcesso(tx, {
          processoId: id,
          acao: ACAO_LOG.PRAZO_ALTERADO,
          de: dataLegivel(processo.prazoEstimado) ?? "sem prazo",
          para: dataLegivel(novoPrazo) ?? "sem prazo",
          sessao,
        });
      }
      if ("observacoes" in dados) {
        await registrarLogProcesso(tx, {
          processoId: id,
          acao: ACAO_LOG.OBSERVACAO_ADICIONADA,
          detalhe: novaObservacao ?? "Observação removida.",
          sessao,
        });
      }
      if ("identificacaoProvisoria" in dados) {
        // Não existe ação específica para identificação provisória na lista de
        // ACAO_LOG (que é compartilhada com apuração e não pode ser alterada
        // aqui). OBSERVACAO_ADICIONADA com de/para preenchidos mantém a
        // rastreabilidade sem inventar valor de enum.
        await registrarLogProcesso(tx, {
          processoId: id,
          acao: ACAO_LOG.OBSERVACAO_ADICIONADA,
          de: processo.identificacaoProvisoria,
          para: novaIdentificacao,
          detalhe: "Identificação provisória alterada.",
          sessao,
        });
      }

      if (Object.keys(dados).length === 0) {
        return tx.processoLegalizacao.findUnique({ where: { id } });
      }

      return tx.processoLegalizacao.update({ where: { id }, data: dados });
    });

    return NextResponse.json(atualizado);
  } catch (e) {
    console.error("[legalizacao][PATCH] falha ao atualizar processo:", e);
    return erro("Erro ao atualizar o processo.", 500);
  }
}
