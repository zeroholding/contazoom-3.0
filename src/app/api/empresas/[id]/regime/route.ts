/**
 * Mudança de regime tributário da empresa.
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seção 16.1.
 *
 * Rota separada do PATCH cadastral por dois motivos. O primeiro é permissão:
 * quem muda regime é ADMIN ou CONTABIL (`podeAlterarRegime`), não o comercial —
 * desenquadramento é decisão contábil. O segundo é que a operação não é um
 * UPDATE: ela fecha a vigência anterior e abre a nova em
 * EmpresaRegimeHistorico. É a linha do tempo fiscal sendo escrita.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { negado, podeAlterarRegime, requireSessao } from "@/lib/api-guard";
import {
  formatarData,
  lerCorpo,
  normalizarData,
  validarRegime,
} from "@/lib/empresa";
import { REGIME_LABEL } from "@/lib/tarefa-etapas";

export const runtime = "nodejs";

/**
 * Dia anterior em UTC. Aritmética de componentes, não subtração de
 * milissegundos: `Date.UTC` já resolve virada de mês e de ano, e em UTC não há
 * horário de verão para deslocar o resultado.
 */
function diaAnterior(data: Date): Date {
  return new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate() - 1)
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessao = await requireSessao(req);
  if (sessao instanceof NextResponse) return sessao;
  if (!podeAlterarRegime(sessao.papel)) {
    return negado(
      "Somente administrador e contabilidade podem alterar o regime tributário."
    );
  }

  try {
    const { id } = await params;
    const body: unknown = await req.json();

    const corpo = lerCorpo(body);
    if (!corpo) {
      return NextResponse.json(
        { error: "Corpo da requisição inválido." },
        { status: 400 }
      );
    }

    const regime = validarRegime(corpo.regime);
    if (!regime.ok) {
      return NextResponse.json(
        { error: regime.erro, campo: regime.campo },
        { status: 400 }
      );
    }

    // Data obrigatória e sem default: a vigência decide a partir de qual
    // competência a apuração muda de fluxo. Chutar "hoje" aqui seria inventar
    // um fato fiscal.
    const vigenciaInicio = normalizarData(corpo.vigenciaInicio);
    if (!vigenciaInicio) {
      return NextResponse.json(
        {
          error: "Informe a data de início da vigência do novo regime.",
          campo: "vigenciaInicio",
        },
        { status: 400 }
      );
    }

    const motivo =
      typeof corpo.motivo === "string" && corpo.motivo.trim()
        ? corpo.motivo.trim()
        : null;

    const empresa = await prisma.empresa.findUnique({
      where: { id },
      select: { id: true, razaoSocial: true, regime: true },
    });
    if (!empresa) {
      return NextResponse.json(
        { error: "Empresa não encontrada." },
        { status: 404 }
      );
    }

    if (empresa.regime === regime.dados) {
      return NextResponse.json(
        {
          error: `A empresa já está no regime ${
            REGIME_LABEL[regime.dados] ?? regime.dados
          }.`,
          campo: "regime",
        },
        { status: 400 }
      );
    }

    const vigente = await prisma.empresaRegimeHistorico.findFirst({
      where: { empresaId: id, vigenciaFim: null },
      orderBy: { vigenciaInicio: "desc" },
      select: { id: true, regime: true, vigenciaInicio: true },
    });

    // Data igual ou anterior ao início da linha vigente também é recusada: o
    // fechamento grava vigenciaFim = vigenciaInicio - 1 dia, então uma data
    // igual produziria uma linha que termina antes de começar.
    if (vigente && vigenciaInicio <= vigente.vigenciaInicio) {
      return NextResponse.json(
        {
          error: `A vigência do novo regime deve ser posterior a ${formatarData(
            vigente.vigenciaInicio
          )}, início do regime atual.`,
          campo: "vigenciaInicio",
        },
        { status: 400 }
      );
    }

    // Uma transação para as três escritas. Fechar a vigência sem abrir a nova
    // deixa a empresa sem regime vigente; abrir a nova sem atualizar
    // `Empresa.regime` faz o cadastro discordar do histórico, e é o cadastro que
    // decide o fluxo da próxima competência. As apurações já criadas ficam como
    // estão: o regime delas é congelado na criação, de propósito.
    const resultado = await prisma.$transaction(async (tx) => {
      // updateMany com a condição no WHERE em vez de update pelo id lido acima:
      // fecha o que estiver aberto no instante da transação e, se por acidente
      // houver mais de uma linha aberta, corrige todas.
      await tx.empresaRegimeHistorico.updateMany({
        where: { empresaId: id, vigenciaFim: null },
        data: { vigenciaFim: diaAnterior(vigenciaInicio) },
      });

      const novaLinha = await tx.empresaRegimeHistorico.create({
        data: {
          empresaId: id,
          regime: regime.dados,
          vigenciaInicio,
          motivo,
          // Nome congelado no registro: funcionário sai da empresa, o histórico
          // continua dizendo quem registrou a mudança.
          registradoPor: sessao.nome,
        },
      });

      const empresaAtualizada = await tx.empresa.update({
        where: { id },
        data: { regime: regime.dados },
        select: {
          id: true,
          cnpj: true,
          razaoSocial: true,
          regime: true,
          situacao: true,
          updatedAt: true,
        },
      });

      return { novaLinha, empresa: empresaAtualizada };
    });

    return NextResponse.json({
      empresa: resultado.empresa,
      historico: resultado.novaLinha,
      regimeAnterior: empresa.regime,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Corpo da requisição inválido." },
        { status: 400 }
      );
    }
    console.error("Erro ao alterar regime da empresa:", error);
    return NextResponse.json(
      { error: "Erro interno ao alterar o regime da empresa." },
      { status: 500 }
    );
  }
}
