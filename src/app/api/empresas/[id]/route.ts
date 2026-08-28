/**
 * Detalhe e edição cadastral de uma empresa.
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seção 16.1.
 *
 * GET   — qualquer papel interno.
 * PATCH — ADMIN e COMERCIAL (`podeGerenciarEmpresa`).
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  negado,
  podeGerenciarEmpresa,
  requireInterno,
  requireSessao,
} from "@/lib/api-guard";
import {
  formatarCnpj,
  lerCorpo,
  usuariosInexistentes,
  validarAtualizacaoEmpresa,
} from "@/lib/empresa";

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
      empresa: { ...empresa, cnpjFormatado: formatarCnpj(empresa.cnpj) },
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

    // CNPJ é a identidade da empresa: apuração, processo e histórico apontam
    // para ela. Trocar o número transformaria o histórico de uma empresa no
    // histórico de outra. CNPJ errado se resolve cadastrando o certo.
    if ("cnpj" in corpo) {
      return NextResponse.json(
        {
          error:
            "O CNPJ não pode ser alterado. Cadastre a empresa correta e ajuste a situação desta.",
          campo: "cnpj",
        },
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

    const atualizacao = validarAtualizacaoEmpresa(corpo);
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

    const existente = await prisma.empresa.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existente) {
      return NextResponse.json(
        { error: "Empresa não encontrada." },
        { status: 404 }
      );
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
        razaoSocial: true,
        nomeFantasia: true,
        regime: true,
        situacao: true,
        tributoLocal: true,
        uf: true,
        municipio: true,
        userId: true,
        responsavelId: true,
        observacoes: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      empresa: { ...empresa, cnpjFormatado: formatarCnpj(empresa.cnpj) },
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
