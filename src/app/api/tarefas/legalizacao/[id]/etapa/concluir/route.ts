/**
 * Conclusão da etapa em curso de um processo de legalização.
 *
 * Uma chamada faz de quatro a sete escritas: marca a etapa, avança o processo,
 * inicia a próxima, recalcula o status, grava os logs e, no desenquadramento,
 * ainda reescreve o regime da empresa. Ou tudo vale, ou nada vale — daí a
 * transação única. Processo na etapa 6 com log dizendo etapa 5 destrói a única
 * coisa que o log precisa ser: confiável.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireInterno, podeConcluirEtapa, negado } from "@/lib/api-guard";
import {
  ACAO_LOG,
  REGIME_LABEL,
  REGIMES_VALIDOS,
  RESPONSAVEL_LABEL,
  SITUACAO_EMPRESA,
  SITUACAO_ETAPA,
  TIPO_PROCESSO,
} from "@/lib/tarefa-etapas";
import { hojeUtc } from "@/lib/empresa";
import {
  aplicarNovoRegime,
  etapaEmCurso,
  lerCorpo,
  proximaEtapaAplicavel,
  recalcularStatusProcesso,
  registrarLogProcesso,
  rotuloEtapa,
  textoLimpo,
} from "@/lib/legalizacao-service";

function erro(mensagem: string, status: number, code?: string): NextResponse {
  return NextResponse.json(code ? { error: mensagem, code } : { error: mensagem }, {
    status,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  const corpo = await lerCorpo(req);
  if (!corpo) return erro("Corpo da requisição inválido.", 400, "CORPO_INVALIDO");

  const observacao = textoLimpo(corpo.observacao);
  const regimeNovo = textoLimpo(corpo.regimeNovo);
  const motivoRegime = textoLimpo(corpo.motivoRegime);

  try {
    const processo = await prisma.processoLegalizacao.findUnique({
      where: { id },
      include: {
        etapas: { orderBy: { numero: "asc" } },
        empresa: {
          select: {
            id: true,
            regime: true,
            razaoSocial: true,
            situacao: true,
          },
        },
      },
    });
    if (!processo) {
      return erro("Processo não encontrado.", 404, "PROCESSO_NAO_ENCONTRADO");
    }

    if (processo.concluidoEm) {
      return erro(
        "Processo já encerrado. Reabra o processo para movimentar etapas.",
        409,
        "PROCESSO_ENCERRADO"
      );
    }

    if (processo.bloqueada) {
      return erro(
        "Processo com pendência ativa. Resolva a pendência antes de concluir a etapa.",
        409,
        "PROCESSO_BLOQUEADO"
      );
    }

    const numeroAtual = etapaEmCurso(processo.etapaAtual);
    const etapa = processo.etapas.find((e) => e.numero === numeroAtual);
    if (!etapa) {
      return erro(
        "Etapa atual não encontrada no processo.",
        409,
        "ETAPA_NAO_ENCONTRADA"
      );
    }

    if (
      etapa.situacao === SITUACAO_ETAPA.CONCLUIDA ||
      etapa.situacao === SITUACAO_ETAPA.NAO_APLICAVEL
    ) {
      return erro(
        `A etapa ${etapa.numero} já está resolvida.`,
        409,
        "ETAPA_JA_RESOLVIDA"
      );
    }

    // Você só conclui etapa que é sua. É o que impede o comercial marcar como
    // registrada na Junta uma coisa que ele não protocolou.
    if (!podeConcluirEtapa(sessao.papel, etapa.responsavelTipo)) {
      return negado(
        `Esta etapa é de responsabilidade de ${
          RESPONSAVEL_LABEL[etapa.responsavelTipo] ?? etapa.responsavelTipo
        }. Seu perfil não pode concluí-la.`
      );
    }

    const proxima = proximaEtapaAplicavel(processo.etapas, etapa.numero);
    const ultimaDoFluxo = processo.etapas[processo.etapas.length - 1];
    const total = processo.etapas.length;
    const ehUltima = proxima === null;

    // Desenquadramento é o único processo que PODE terminar alterando o cadastro:
    // concluir a última etapa aplica o regime informado à empresa.
    //
    // O REGIME É OPCIONAL, e antes era obrigatório e tinha de ser DIFERENTE do
    // atual. Estava errado: desenquadramento não é sinônimo de troca de regime
    // tributário. Desenquadramento de porte (ME -> EPP) e saída do MEI mantêm a
    // empresa no Simples Nacional, e como o sistema só conhece dois regimes, a
    // regra antiga deixava uma única opção na tela — Lucro Presumido. Para fechar
    // o processo, o operador tinha de escolher um regime que não é o da empresa, e
    // isso reescrevia `Empresa.regime`, criava vigência falsa no histórico e
    // trocava o fluxo mensal de apuração. Concluir sem tocar no cadastro é melhor
    // que gravar dado falso para conseguir concluir.
    //
    // Regime IGUAL ao atual também é aceito: `aplicarNovoRegime` devolve null e
    // nada é escrito, o mesmo efeito de não informar nada. Recusar seria um erro
    // que o operador não tem como resolver a não serem mentir na escolha.
    const ehDesenquadramento = processo.tipo === TIPO_PROCESSO.DESENQUADRAMENTO;
    if (ehUltima && ehDesenquadramento && regimeNovo) {
      // Só exige o vínculo quando há regime a aplicar: sem mudança de regime, não
      // há escrita em cadastro nenhum e o processo pode fechar sozinho.
      if (!processo.empresa) {
        return erro(
          "Para gravar o novo regime o processo precisa de empresa vinculada. Vincule a empresa, ou conclua sem informar regime — o processo fecha sem alterar cadastro.",
          409,
          "EMPRESA_NAO_VINCULADA"
        );
      }
      if (!REGIMES_VALIDOS.includes(regimeNovo)) {
        return erro(
          `Regime inválido: ${regimeNovo}. Valores aceitos: ${REGIMES_VALIDOS.join(", ")}.`,
          400,
          "REGIME_INVALIDO"
        );
      }
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const agora = new Date();

      await tx.processoLegalizacaoEtapa.update({
        where: { id: etapa.id },
        data: {
          situacao: SITUACAO_ETAPA.CONCLUIDA,
          concluidaEm: agora,
          concluidaPor: sessao.userId,
          ...(observacao ? { observacao } : {}),
          iniciadaEm: etapa.iniciadaEm ?? agora,
        },
      });

      await registrarLogProcesso(tx, {
        processoId: id,
        acao: ACAO_LOG.ETAPA_CONCLUIDA,
        para: rotuloEtapa(etapa.numero, etapa.titulo, total),
        detalhe: observacao,
        sessao,
      });

      if (proxima) {
        await tx.processoLegalizacaoEtapa.update({
          where: { id: proxima.id },
          data: {
            situacao: SITUACAO_ETAPA.EM_ANDAMENTO,
            iniciadaEm: proxima.iniciadaEm ?? agora,
          },
        });
        await tx.processoLegalizacao.update({
          where: { id },
          data: { etapaAtual: proxima.numero },
        });
        await registrarLogProcesso(tx, {
          processoId: id,
          acao: ACAO_LOG.ETAPA_AVANCADA,
          de: String(etapa.numero),
          para: rotuloEtapa(proxima.numero, proxima.titulo, total),
          sessao,
        });
      } else {
        // Sem próxima etapa aplicável, o processo acabou. `etapaAtual` vai para
        // o número da última etapa do fluxo porque é assim que a derivação de
        // status reconhece CONCLUIDO.
        await tx.processoLegalizacao.update({
          where: { id },
          data: { etapaAtual: ultimaDoFluxo.numero, concluidoEm: agora },
        });

        // Empresa criada por uma abertura fica EM_ABERTURA enquanto o processo
        // corre (o CNPJ existe, mas alvará e habilitação de nota, não). Ao
        // terminar a abertura ela passa a ATIVA — senão o cadastro ficaria preso
        // num estado que nada mais mudaria.
        const ativouEmpresa =
          processo.tipo === TIPO_PROCESSO.ABERTURA_CNPJ &&
          processo.empresa?.situacao === SITUACAO_EMPRESA.EM_ABERTURA;
        if (ativouEmpresa && processo.empresa) {
          await tx.empresa.update({
            where: { id: processo.empresa.id },
            data: { situacao: SITUACAO_EMPRESA.ATIVA },
          });
        }

        await registrarLogProcesso(tx, {
          processoId: id,
          acao: ACAO_LOG.TAREFA_CONCLUIDA,
          para: "Processo concluído",
          detalhe: ativouEmpresa
            ? `Última etapa concluída: ${etapa.titulo}. Empresa passou de "Em abertura" para "Ativa".`
            : `Última etapa concluída: ${etapa.titulo}`,
          sessao,
        });
      }

      let regime: { de: string; para: string } | null = null;
      if (ehUltima && ehDesenquadramento && processo.empresa && regimeNovo) {
        regime = await aplicarNovoRegime(tx, {
          empresaId: processo.empresa.id,
          regimeNovo,
          motivo:
            motivoRegime ??
            `Desenquadramento concluído (processo ${processo.id})`,
          registradoPor: sessao.userId,
          // Meia-noite UTC, mesma convenção de `src/lib/empresa.ts`: vigência é
          // DIA, não instante. Gravar o horário faria a apuração comparar
          // vigência com hora e errar a virada de mês em fuso negativo.
          vigenciaInicio: hojeUtc(),
        });

        if (regime) {
          // ACAO_LOG não tem ação de regime (a lista é compartilhada com
          // apuração e não é editável por esta rota). de/para carregam a
          // mudança e o detalhe explica o efeito.
          await registrarLogProcesso(tx, {
            processoId: id,
            acao: ACAO_LOG.OBSERVACAO_ADICIONADA,
            de: REGIME_LABEL[regime.de] ?? regime.de,
            para: REGIME_LABEL[regime.para] ?? regime.para,
            detalhe:
              "Regime da empresa alterado pelo desenquadramento. Vigência anterior fechada no histórico; competências futuras nascem com o fluxo novo e as passadas mantêm o regime antigo.",
            sessao,
          });
        }
      }

      const status = await recalcularStatusProcesso(tx, id, sessao);

      const atualizado = await tx.processoLegalizacao.findUnique({
        where: { id },
        include: { etapas: { orderBy: { numero: "asc" } } },
      });

      return { processo: atualizado, status, regime };
    });

    return NextResponse.json({
      processo: resultado.processo,
      etapaConcluida: etapa.numero,
      proximaEtapa: proxima
        ? { numero: proxima.numero, titulo: proxima.titulo }
        : null,
      processoConcluido: ehUltima,
      status: resultado.status.novo,
      regimeAlterado: resultado.regime,
    });
  } catch (e) {
    console.error("[legalizacao][concluir] falha ao concluir etapa:", e);
    return erro("Erro ao concluir a etapa.", 500);
  }
}
