/**
 * Detalhe, edição cadastral e exclusão de uma empresa.
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seção 16.1.
 *
 * GET    — qualquer papel interno.
 * PATCH  — ADMIN e COMERCIAL (`podeGerenciarEmpresa`).
 * DELETE — SOMENTE ADMIN, e por um motivo de tamanho: o cascade leva o histórico
 *          de regime, todas as competências, todos os processos, e de cada um
 *          deles as etapas, o histórico e os anexos. Editar empresa é ato
 *          comercial; destruir a carteira de um cliente não é.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  negado,
  podeGerenciarEmpresa,
  requireAdmin,
  requireInterno,
  requireSessao,
} from "@/lib/api-guard";
import {
  formatarCnpj,
  lerCorpo,
  usuariosInexistentes,
  validarAtualizacaoEmpresa,
} from "@/lib/empresa";
import { formatarCep, formatarCpf } from "@/lib/documento";
import {
  apagarArquivosDeAnexos,
  confirmacaoConfere,
  registrarExclusao,
  resumirExclusaoEmpresa,
  textoArrastado,
  validarMotivo,
} from "@/lib/exclusao";

export const runtime = "nodejs";

/** Um ano de competências. Mais que isso é assunto da tela de histórico. */
const APURACOES_NO_DETALHE = 12;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  try {
    const { id } = await params;

    const empresa = await prisma.empresa.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        responsavel: { select: { id: true, name: true, email: true } },
        regimeHistorico: {
          // Vigente primeiro: é a linha que o operador procura ao abrir a tela.
          orderBy: { vigenciaInicio: "desc" },
        },
        apuracoes: {
          orderBy: [{ ano: "desc" }, { mes: "desc" }],
          take: APURACOES_NO_DETALHE,
          select: {
            id: true,
            ano: true,
            mes: true,
            regime: true,
            etapaAtual: true,
            status: true,
            bloqueada: true,
            bloqueioMotivo: true,
            prazoEntrega: true,
            concluidaEm: true,
          },
        },
        processos: {
          // Aberto é o que não tem data de conclusão. O status não serve de
          // critério: um processo pode estar "ENTREGUE" e ainda faltar encerrar.
          where: { concluidoEm: null },
          orderBy: { abertoEm: "desc" },
          select: {
            id: true,
            tipo: true,
            status: true,
            etapaAtual: true,
            bloqueada: true,
            protocoloExterno: true,
            orgaoExterno: true,
            prazoEstimado: true,
            abertoEm: true,
          },
        },
        _count: { select: { apuracoes: true, processos: true } },
      },
    });

    if (!empresa) {
      return NextResponse.json(
        { error: "Empresa não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      empresa: {
        ...empresa,
        cnpjFormatado: empresa.cnpj ? formatarCnpj(empresa.cnpj) : null,
        cepFormatado: empresa.cep ? formatarCep(empresa.cep) : null,
        socioAdmCpfFormatado: empresa.socioAdmCpf
          ? formatarCpf(empresa.socioAdmCpf)
          : null,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar empresa:", error);
    return NextResponse.json(
      { error: "Erro interno ao buscar empresa." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessao = await requireSessao(req);
  if (sessao instanceof NextResponse) return sessao;
  if (!podeGerenciarEmpresa(sessao.papel)) {
    return negado("Somente administrador e comercial podem editar empresa.");
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

    // Regime tem rota própria porque mudar regime não é editar um campo: fecha a
    // vigência anterior e abre a nova em EmpresaRegimeHistorico. Um UPDATE
    // simples aqui apagaria a linha do tempo fiscal, e a permissão é outra
    // (ADMIN e CONTABIL, não COMERCIAL).
    if ("regime" in corpo) {
      return NextResponse.json(
        {
          error:
            "O regime muda por POST /api/empresas/[id]/regime, que registra a vigência no histórico.",
          campo: "regime",
        },
        { status: 400 }
      );
    }

    const existente = await prisma.empresa.findUnique({
      where: { id },
      select: { id: true, cnpj: true, planoInterno: true },
    });
    if (!existente) {
      return NextResponse.json(
        { error: "Empresa não encontrada." },
        { status: 404 }
      );
    }

    const atualizacao = validarAtualizacaoEmpresa(corpo, {
      cnpjAtual: existente.cnpj,
      planoAtual: existente.planoInterno,
    });
    if (!atualizacao.ok) {
      return NextResponse.json(
        { error: atualizacao.erro, campo: atualizacao.campo },
        { status: 400 }
      );
    }
    const dados = atualizacao.dados;

    if (Object.keys(dados).length === 0) {
      return NextResponse.json(
        { error: "Informe ao menos um campo para atualizar." },
        { status: 400 }
      );
    }

    /**
     * CNPJ: pode ser PREENCHIDO uma vez, nunca trocado nem apagado.
     *
     * Antes era proibido em qualquer hipótese, porque o CNPJ era a identidade da
     * empresa e trocá-lo transformaria o histórico de uma empresa no histórico de
     * outra. Isso continua verdade — o que mudou é que agora existe empresa
     * cadastrada SEM CNPJ (a que está sendo aberta), e o momento em que o número
     * sai da Junta é exatamente quando ele precisa ser gravado.
     *
     * Então a regra é assimétrica de propósito:
     *   vazio -> preenchido : permitido, é o fim do processo de abertura
     *   preenchido -> outro : recusado, seria trocar de empresa
     *   preenchido -> vazio : recusado, apagaria a identidade
     */
    if (dados.cnpj !== undefined) {
      if (existente.cnpj && dados.cnpj !== existente.cnpj) {
        return NextResponse.json(
          {
            error:
              "O CNPJ já está preenchido e não pode ser alterado. Cadastre a empresa correta e ajuste o plano desta.",
            campo: "cnpj",
          },
          { status: 400 }
        );
      }
      if (existente.cnpj && !dados.cnpj) {
        return NextResponse.json(
          {
            error: "O CNPJ não pode ser apagado depois de preenchido.",
            campo: "cnpj",
          },
          { status: 400 }
        );
      }
      if (dados.cnpj && dados.cnpj !== existente.cnpj) {
        const conflito = await prisma.empresa.findUnique({
          where: { cnpj: dados.cnpj },
          select: { id: true, razaoSocial: true },
        });
        if (conflito) {
          return NextResponse.json(
            {
              error: `O CNPJ ${formatarCnpj(dados.cnpj)} já está cadastrado para ${
                conflito.razaoSocial
              }.`,
              code: "cnpj_duplicado",
              empresaId: conflito.id,
            },
            { status: 409 }
          );
        }
      }
    }

    const inexistentes = await usuariosInexistentes([
      dados.userId,
      dados.responsavelId,
    ]);
    if (inexistentes.length > 0) {
      return NextResponse.json(
        { error: "Usuário informado não existe.", ids: inexistentes },
        { status: 400 }
      );
    }

    const empresa = await prisma.empresa.update({
      where: { id },
      data: dados,
      select: {
        id: true,
        cnpj: true,
        grupo: true,
        razaoSocial: true,
        nomeFantasia: true,
        regime: true,
        planoInterno: true,
        situacao: true,
        tributoLocal: true,
        inscricaoMunicipal: true,
        inscricaoEstadual: true,
        cep: true,
        logradouro: true,
        numero: true,
        complemento: true,
        bairro: true,
        uf: true,
        municipio: true,
        responsavelOperacional: true,
        socioAdmNome: true,
        socioAdmCpf: true,
        userId: true,
        responsavelId: true,
        observacoes: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      empresa: {
        ...empresa,
        cnpjFormatado: empresa.cnpj ? formatarCnpj(empresa.cnpj) : null,
        cepFormatado: empresa.cep ? formatarCep(empresa.cep) : null,
        socioAdmCpfFormatado: empresa.socioAdmCpf
          ? formatarCpf(empresa.socioAdmCpf)
          : null,
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Corpo da requisição inválido." },
        { status: 400 }
      );
    }
    console.error("Erro ao atualizar empresa:", error);
    return NextResponse.json(
      { error: "Erro interno ao atualizar empresa." },
      { status: 500 }
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                                  DELETE                                    */
/* -------------------------------------------------------------------------- */

type CorpoExclusao = { motivo?: unknown; confirmacao?: unknown };

/**
 * Exclui a empresa e tudo que pende dela.
 *
 * SOMENTE ADMIN. Duas travas antes de apagar:
 *
 * 1. MOTIVO obrigatório. Vai para `registro_exclusao` e é a única coisa que
 *    responde "por que essa empresa não está mais aqui" meses depois.
 *
 * 2. CONFIRMAÇÃO por digitação da razão social. Só a empresa exige isto, por
 *    causa do tamanho do cascade — um clique pode levar mais de mil linhas. É o
 *    mesmo recurso que o GitHub usa para apagar repositório, e serve para o erro
 *    que de fato acontece: apagar a empresa errada da lista.
 *
 * A ordem das operações é o que importa:
 *
 *    contar  ->  [transação: registrar + apagar]  ->  apagar arquivos
 *
 * Registro e delete na MESMA transação, porque o pior jeito de errar é apagar sem
 * registrar. Arquivos DEPOIS do commit: se a transação voltar atrás, os arquivos
 * continuam lá.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessao = await requireAdmin(req);
  if (sessao instanceof NextResponse) return sessao;

  try {
    const { id } = await params;

    const corpo = (await req.json().catch(() => null)) as CorpoExclusao | null;
    if (!corpo) {
      return NextResponse.json(
        {
          error:
            "Informe o motivo e a confirmação para excluir a empresa.",
          code: "corpo_invalido",
        },
        { status: 400 }
      );
    }

    const motivo = validarMotivo(corpo.motivo);
    if (!motivo.ok) {
      return NextResponse.json(
        { error: motivo.erro, campo: "motivo" },
        { status: 400 }
      );
    }

    // A contagem vem ANTES de qualquer escrita: depois do cascade não há mais
    // como saber o que existia, e é justamente o que o registro precisa guardar.
    const resumo = await resumirExclusaoEmpresa(id);
    if (!resumo) {
      return NextResponse.json(
        { error: "Empresa não encontrada.", code: "nao_encontrada" },
        { status: 404 }
      );
    }

    if (!confirmacaoConfere(corpo.confirmacao, resumo.descricao)) {
      return NextResponse.json(
        {
          error: `Para confirmar, digite a razão social exatamente como está cadastrada: ${resumo.descricao}`,
          code: "confirmacao_invalida",
          campo: "confirmacao",
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await registrarExclusao(tx, {
        resumo,
        motivo: motivo.motivo,
        sessao,
      });
      // Uma linha só: o banco cascateia o resto. Apagar filho por filho aqui
      // seria reimplementar em TypeScript o que a FK já garante — e a cada tabela
      // nova alguém esqueceria de acrescentar.
      await tx.empresa.delete({ where: { id } });
    });

    // Fora da transação, de propósito. Ver a nota no topo.
    const arquivos = await apagarArquivosDeAnexos(resumo.arquivos);
    if (arquivos.falhas > 0) {
      console.warn(
        `[empresas][DELETE] ${arquivos.falhas} de ${resumo.arquivos.length} arquivos de anexo não foram removidos do disco (empresa ${id}).`
      );
    }

    return NextResponse.json({
      excluida: true,
      id,
      descricao: resumo.descricao,
      arrastado: textoArrastado(resumo),
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Corpo da requisição inválido." },
        { status: 400 }
      );
    }
    console.error("Erro ao excluir empresa:", error);
    return NextResponse.json(
      { error: "Erro interno ao excluir empresa." },
      { status: 500 }
    );
  }
}
