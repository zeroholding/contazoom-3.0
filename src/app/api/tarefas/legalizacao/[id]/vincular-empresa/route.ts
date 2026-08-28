/**
 * Vincula o processo de abertura à empresa que ele produziu.
 *
 * Existe porque abertura de CNPJ não tem CNPJ no começo: o processo nasce só com
 * `identificacaoProvisoria`, e quando o CNPJ sai (etapa 5 do fluxo) a empresa
 * passa a existir. Esta rota é a costura entre as duas coisas, e por isso só
 * aceita ABERTURA_CNPJ — nos outros tipos a empresa é pré-requisito de criação
 * do processo, então vincular depois não significaria nada.
 *
 * Aceita os dois caminhos: `empresaId` de uma empresa já cadastrada, ou os dados
 * para criar a empresa aqui. O segundo é o caso real do dia a dia (ninguém vai
 * abrir outra tela para cadastrar e voltar), e é ele que também cria a primeira
 * linha de `EmpresaRegimeHistorico` — sem essa linha, um desenquadramento futuro
 * não teria vigência anterior para fechar.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireInterno, podeCriarProcesso, negado } from "@/lib/api-guard";
import {
  ACAO_LOG,
  SITUACAO_EMPRESA,
  TIPO_PROCESSO,
  TIPO_PROCESSO_LABEL,
} from "@/lib/tarefa-etapas";
import {
  formatarCnpj,
  hojeUtc,
  normalizarCnpj,
  usuariosInexistentes,
  validarPayloadEmpresa,
} from "@/lib/empresa";
import {
  lerCorpo,
  registrarLogProcesso,
  textoLimpo,
} from "@/lib/legalizacao-service";

function erro(
  mensagem: string,
  status: number,
  code?: string,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    { error: mensagem, ...(code ? { code } : {}), ...(extra ?? {}) },
    { status }
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  // Mesmo conjunto de papéis que abre processo: quem abre a legalização é quem
  // amarra a empresa que ela gerou.
  if (!podeCriarProcesso(sessao.papel)) {
    return negado("Seu perfil não pode vincular empresa ao processo.");
  }

  const corpo = await lerCorpo(req);
  if (!corpo) return erro("Corpo da requisição inválido.", 400, "CORPO_INVALIDO");

  try {
    const processo = await prisma.processoLegalizacao.findUnique({
      where: { id },
      select: {
        id: true,
        tipo: true,
        empresaId: true,
        identificacaoProvisoria: true,
        concluidoEm: true,
      },
    });
    if (!processo) {
      return erro("Processo não encontrado.", 404, "PROCESSO_NAO_ENCONTRADO");
    }

    if (processo.tipo !== TIPO_PROCESSO.ABERTURA_CNPJ) {
      return erro(
        `Vincular empresa só faz sentido em abertura de CNPJ. Este processo é ${
          TIPO_PROCESSO_LABEL[processo.tipo] ?? processo.tipo
        }, e nesse tipo a empresa é informada na criação do processo.`,
        400,
        "TIPO_NAO_PERMITE_VINCULO"
      );
    }

    if (processo.empresaId) {
      return erro(
        "Este processo já está vinculado a uma empresa.",
        409,
        "EMPRESA_JA_VINCULADA",
        { empresaId: processo.empresaId }
      );
    }

    const empresaIdInformado = textoLimpo(corpo.empresaId);
    const identificacao = processo.identificacaoProvisoria ?? "sem identificação";

    /* ------------------------- Caminho 1: já existe ------------------------ */

    if (empresaIdInformado) {
      const empresa = await prisma.empresa.findUnique({
        where: { id: empresaIdInformado },
        select: { id: true, cnpj: true, razaoSocial: true, regime: true },
      });
      if (!empresa) {
        return erro("Empresa não encontrada.", 404, "EMPRESA_NAO_ENCONTRADA");
      }

      const resultado = await prisma.$transaction(async (tx) => {
        const atualizado = await tx.processoLegalizacao.update({
          where: { id },
          data: { empresaId: empresa.id },
        });

        await registrarLogProcesso(tx, {
          processoId: id,
          acao: ACAO_LOG.EMPRESA_VINCULADA,
          de: identificacao,
          para: `${empresa.razaoSocial} (${formatarCnpj(empresa.cnpj)})`,
          detalhe: "Empresa já cadastrada vinculada ao processo.",
          sessao,
        });

        return atualizado;
      });

      return NextResponse.json({
        processo: resultado,
        empresa,
        empresaCriada: false,
      });
    }

    /* ------------------------ Caminho 2: criar agora ----------------------- */

    const cnpj = normalizarCnpj(corpo.cnpj);
    if (!cnpj.ok) {
      return erro(cnpj.erro, 400, "CNPJ_INVALIDO");
    }

    // Reaproveita a validação de `/api/empresas` de propósito: empresa criada
    // por aqui tem de nascer com as mesmas regras da criada pela tela de
    // cadastro, senão o mesmo campo aceitaria coisas diferentes em cada porta.
    const payload = validarPayloadEmpresa(corpo);
    if (!payload.ok) {
      return erro(payload.erro, 400, "PAYLOAD_INVALIDO", { campo: payload.campo });
    }

    const duplicada = await prisma.empresa.findUnique({
      where: { cnpj: cnpj.digitos },
      select: { id: true, razaoSocial: true },
    });
    if (duplicada) {
      return erro(
        `O CNPJ ${formatarCnpj(cnpj.digitos)} já está cadastrado para ${
          duplicada.razaoSocial
        }. Vincule pelo empresaId.`,
        409,
        "CNPJ_DUPLICADO",
        { empresaId: duplicada.id }
      );
    }

    const inexistentes = await usuariosInexistentes([
      payload.dados.userId,
      payload.dados.responsavelId,
    ]);
    if (inexistentes.length) {
      return erro(
        `Usuário não encontrado: ${inexistentes.join(", ")}.`,
        400,
        "USUARIO_INVALIDO"
      );
    }

    // Enquanto o processo de abertura não termina, a empresa está EM_ABERTURA:
    // o CNPJ existe, mas inscrição, alvará e habilitação de nota ainda não. Se
    // quem chamou disse a situação explicitamente, respeita o que veio.
    const situacao = "situacao" in corpo
      ? payload.dados.situacao
      : processo.concluidoEm
        ? SITUACAO_EMPRESA.ATIVA
        : SITUACAO_EMPRESA.EM_ABERTURA;

    // Início de vigência do regime = início de atividade quando informado. É a
    // data que a apuração vai usar para decidir qual regime valia na competência.
    const vigenciaInicio = payload.dados.inicioAtividade ?? hojeUtc();

    const resultado = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({
        data: {
          cnpj: cnpj.digitos,
          razaoSocial: payload.dados.razaoSocial,
          nomeFantasia: payload.dados.nomeFantasia,
          regime: payload.dados.regime,
          situacao,
          tributoLocal: payload.dados.tributoLocal,
          uf: payload.dados.uf,
          municipio: payload.dados.municipio,
          inicioAtividade: payload.dados.inicioAtividade,
          userId: payload.dados.userId,
          responsavelId: payload.dados.responsavelId,
          observacoes: payload.dados.observacoes,
          regimeHistorico: {
            create: {
              regime: payload.dados.regime,
              vigenciaInicio,
              motivo: "Regime inicial definido na abertura do CNPJ",
              registradoPor: sessao.userId,
            },
          },
        },
        select: {
          id: true,
          cnpj: true,
          razaoSocial: true,
          regime: true,
          situacao: true,
        },
      });

      const atualizado = await tx.processoLegalizacao.update({
        where: { id },
        data: { empresaId: empresa.id },
      });

      await registrarLogProcesso(tx, {
        processoId: id,
        acao: ACAO_LOG.EMPRESA_VINCULADA,
        de: identificacao,
        para: `${empresa.razaoSocial} (${formatarCnpj(empresa.cnpj)})`,
        detalhe:
          "Empresa criada a partir do processo de abertura, com a primeira linha do histórico de regime.",
        sessao,
      });

      return { processo: atualizado, empresa };
    });

    return NextResponse.json(
      {
        processo: resultado.processo,
        empresa: resultado.empresa,
        empresaCriada: true,
      },
      { status: 201 }
    );
  } catch (e) {
    console.error("[legalizacao][vincular-empresa] falha ao vincular empresa:", e);
    return erro("Erro ao vincular a empresa ao processo.", 500);
  }
}
