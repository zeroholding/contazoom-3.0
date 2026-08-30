/**
 * Lista e abertura de processos de legalização.
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seções 11.6 e 16.3.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireInterno, podeCriarProcesso, negado } from "@/lib/api-guard";
import {
  TIPO_PROCESSO,
  TIPOS_PROCESSO_VALIDOS,
  TIPO_PROCESSO_LABEL,
  SITUACAO_ETAPA,
} from "@/lib/tarefa-etapas";
import { STATUS_VALIDOS, contagemPrazo, situacaoPrazo } from "@/lib/tarefa-status";
import {
  criarProcesso,
  diasEmAberto,
  etapaEmCurso,
  etapasNaoResolvidas,
  lerCorpo,
  parseDataOpcional,
  textoLimpo,
  totalEtapas,
} from "@/lib/legalizacao-service";
import type { Prisma } from "@prisma/client";

const LIMITE_PADRAO = 20;
const LIMITE_MAXIMO = 100;

const SELECAO_EMPRESA = {
  id: true,
  cnpj: true,
  razaoSocial: true,
  nomeFantasia: true,
  regime: true,
  situacao: true,
  planoInterno: true,
} as const;

const SELECAO_USUARIO = { id: true, name: true, email: true } as const;

function erro(mensagem: string, status: number, code?: string): NextResponse {
  return NextResponse.json(code ? { error: mensagem, code } : { error: mensagem }, {
    status,
  });
}

/* -------------------------------------------------------------------------- */
/*                                    GET                                     */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  const params = req.nextUrl.searchParams;

  const tipo = textoLimpo(params.get("tipo"));
  if (tipo && !TIPOS_PROCESSO_VALIDOS.includes(tipo)) {
    return erro(`Tipo de processo inválido: ${tipo}.`, 400, "TIPO_INVALIDO");
  }

  const status = textoLimpo(params.get("status"));
  if (status && !STATUS_VALIDOS.includes(status)) {
    return erro(`Status inválido: ${status}.`, 400, "STATUS_INVALIDO");
  }

  const bloqueadaParam = textoLimpo(params.get("bloqueada"));
  const empresaId = textoLimpo(params.get("empresaId"));
  const responsavelId = textoLimpo(params.get("responsavelId"));
  const abertos = textoLimpo(params.get("abertos")) === "true";
  const busca = textoLimpo(params.get("busca"));

  const page = Math.max(1, Number(params.get("page")) || 1);
  const limitPedido = Number(params.get("limit")) || LIMITE_PADRAO;
  const limit = Math.min(LIMITE_MAXIMO, Math.max(1, limitPedido));

  const where: Prisma.ProcessoLegalizacaoWhereInput = {};
  if (tipo) where.tipo = tipo;
  if (status) where.status = status;
  if (bloqueadaParam === "true") where.bloqueada = true;
  if (bloqueadaParam === "false") where.bloqueada = false;
  if (empresaId) where.empresaId = empresaId;
  if (responsavelId) where.responsavelId = responsavelId;
  // "Aberto" é `concluidoEm null`, não status diferente de CONCLUIDO: o status é
  // derivado e pode marcar CONCLUIDO antes de alguém fechar o processo.
  if (abertos) where.concluidoEm = null;
  if (busca) {
    where.OR = [
      { empresa: { razaoSocial: { contains: busca, mode: "insensitive" } } },
      { empresa: { nomeFantasia: { contains: busca, mode: "insensitive" } } },
      { identificacaoProvisoria: { contains: busca, mode: "insensitive" } },
      { protocoloExterno: { contains: busca, mode: "insensitive" } },
    ];
  }

  try {
    const [total, processos] = await Promise.all([
      prisma.processoLegalizacao.count({ where }),
      prisma.processoLegalizacao.findMany({
        where,
        include: {
          empresa: { select: SELECAO_EMPRESA },
          responsavel: { select: SELECAO_USUARIO },
          etapas: {
            select: { numero: true, titulo: true, situacao: true, opcional: true },
            orderBy: { numero: "asc" },
          },
          // Contagem, não a lista: o cartão mostra "3 anexos", e trazer o
          // metadado de trinta arquivos por cartão só para exibir um número
          // carregaria a página à toa.
          _count: { select: { anexos: true } },
        },
        // Aberto antes de encerrado (`nulls: "first"`, senão o Postgres joga os
        // nulos para o fim), e dentro disso o mais antigo primeiro: processo
        // parado há mais tempo é o que precisa de cobrança.
        orderBy: [
          { concluidoEm: { sort: "asc", nulls: "first" } },
          { abertoEm: "asc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const agora = new Date();
    const itens = processos.map((processo) => {
      const numeroAtual = etapaEmCurso(processo.etapaAtual);
      const etapaAtual =
        processo.etapas.find((e) => e.numero === numeroAtual) ?? null;
      const concluido = Boolean(processo.concluidoEm);
      const prazo = situacaoPrazo(processo.prazoEstimado, concluido, agora);

      return {
        id: processo.id,
        tipo: processo.tipo,
        tipoLabel: TIPO_PROCESSO_LABEL[processo.tipo] ?? processo.tipo,
        status: processo.status,
        empresa: processo.empresa,
        // Quando não há empresa (abertura de CNPJ), é este texto que a tela
        // mostra no lugar da razão social.
        identificacaoProvisoria: processo.identificacaoProvisoria,
        etapaAtual: processo.etapaAtual,
        etapaAtualTitulo: etapaAtual?.titulo ?? null,
        etapasTotal: processo.etapas.length,
        etapasResolvidas:
          processo.etapas.length - etapasNaoResolvidas(processo.etapas).length,
        protocoloExterno: processo.protocoloExterno,
        orgaoExterno: processo.orgaoExterno,
        bloqueada: processo.bloqueada,
        bloqueioMotivo: processo.bloqueioMotivo,
        bloqueioResponsavel: processo.bloqueioResponsavel,
        bloqueioDesde: processo.bloqueioDesde,
        prazoEstimado: processo.prazoEstimado,
        situacaoPrazo: prazo.situacao,
        diasPrazo: prazo.dias,
        // Dias úteis e corridos vêm do SERVIDOR, para lista, cartão e detalhe
        // mostrarem o mesmo número. Calculado no cliente, dependeria do relógio e
        // do fuso da máquina de quem olha.
        contagemPrazo: contagemPrazo(
          processo.prazoEstimado,
          concluido,
          agora
        ),
        abertoEm: processo.abertoEm,
        concluidoEm: processo.concluidoEm,
        diasEmAberto: diasEmAberto(processo.abertoEm, processo.concluidoEm, agora),
        responsavel: processo.responsavel,
        observacoes: processo.observacoes,
        anexos: processo._count.anexos,
      };
    });

    return NextResponse.json({
      itens,
      paginacao: {
        page,
        limit,
        total,
        totalPaginas: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (e) {
    console.error("[legalizacao][GET] falha ao listar processos:", e);
    return erro("Erro ao listar processos de legalização.", 500);
  }
}

/* -------------------------------------------------------------------------- */
/*                                    POST                                    */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;
  if (!podeCriarProcesso(sessao.papel)) {
    return negado("Seu perfil não pode abrir processos de legalização.");
  }

  const corpo = await lerCorpo(req);
  if (!corpo) return erro("Corpo da requisição inválido.", 400, "CORPO_INVALIDO");

  const tipo = textoLimpo(corpo.tipo);
  if (!tipo) return erro("Informe o tipo do processo.", 400, "TIPO_OBRIGATORIO");
  if (!TIPOS_PROCESSO_VALIDOS.includes(tipo)) {
    return erro(`Tipo de processo inválido: ${tipo}.`, 400, "TIPO_INVALIDO");
  }

  const empresaId = textoLimpo(corpo.empresaId);
  const identificacaoProvisoria = textoLimpo(corpo.identificacaoProvisoria);

  /**
   * EMPRESA OBRIGATÓRIA EM TODOS OS TIPOS, inclusive abertura de CNPJ.
   *
   * Mudança de regra pedida pelo escritório em 30/08/2026: "antes de criar o
   * processo de legalização, ou apuração, somente conseguirmos atrelá-los a
   * alguma empresa criada ali anteriormente".
   *
   * Antes, abertura era a exceção — o processo nascia solto, com uma
   * identificação provisória, porque a empresa não podia ser cadastrada sem
   * CNPJ. O que destravou isso foi `empresa.cnpj` virar opcional na mesma
   * mudança: agora a empresa em abertura É cadastrada, sem CNPJ, e o processo
   * nasce atrelado a ela desde o primeiro dia.
   *
   * O ganho prático é que o histórico deixa de ter dois lugares. Antes, o
   * trabalho feito antes do CNPJ ficava no processo e o de depois na empresa, e
   * ninguém juntava os dois. Agora é uma linha do tempo só.
   *
   * `identificacaoProvisoria` continua na tabela e continua aceita: os processos
   * abertos antes desta mudança têm o nome deles ali, e apagar a coluna
   * apagaria o único registro de por qual nome o processo começou.
   */
  if (!empresaId) {
    return erro(
      `${
        TIPO_PROCESSO_LABEL[tipo] ?? "Este tipo de processo"
      } exige uma empresa já cadastrada. Cadastre a empresa primeiro — se ela ainda não foi aberta, cadastre sem CNPJ e preencha o número quando o registro sair.`,
      400,
      "EMPRESA_OBRIGATORIA"
    );
  }

  const prazo = parseDataOpcional(corpo.prazoEstimado);
  if (!prazo.ok) {
    return erro("Prazo estimado inválido.", 400, "PRAZO_INVALIDO");
  }

  const responsavelId = textoLimpo(corpo.responsavelId);
  const observacoes = textoLimpo(corpo.observacoes);

  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { id: true, cnpj: true, razaoSocial: true },
    });
    if (!empresa) {
      return erro("Empresa não encontrada.", 404, "EMPRESA_NAO_ENCONTRADA");
    }

    /**
     * Abertura de CNPJ numa empresa que JÁ TEM CNPJ é 409, não erro de corpo.
     *
     * O corpo está correto; o conflito é com o estado do cadastro. E o erro é
     * quase sempre escolher a empresa errada no seletor, então a mensagem diz
     * qual empresa foi escolhida e qual é o processo certo para o que ela quer.
     */
    if (tipo === TIPO_PROCESSO.ABERTURA_CNPJ && empresa.cnpj) {
      return erro(
        `${empresa.razaoSocial} já tem CNPJ, então não há o que abrir. Para mudar dados de uma empresa aberta, use Alteração cadastral.`,
        409,
        "EMPRESA_JA_ABERTA"
      );
    }

    if (responsavelId) {
      const usuario = await prisma.user.findUnique({
        where: { id: responsavelId },
        select: { id: true },
      });
      if (!usuario) {
        return erro("Responsável não encontrado.", 400, "RESPONSAVEL_INVALIDO");
      }
    }

    const processo = await prisma.$transaction((tx) =>
      criarProcesso(tx, {
        tipo,
        empresaId,
        identificacaoProvisoria,
        prazoEstimado: prazo.valor,
        responsavelId,
        observacoes,
        sessao,
      })
    );

    return NextResponse.json(
      {
        id: processo.id,
        tipo: processo.tipo,
        status: processo.status,
        etapaAtual: processo.etapaAtual,
        etapasTotal: totalEtapas(processo.tipo),
        etapaAtualTitulo:
          processo.etapas.find(
            (e) => e.situacao === SITUACAO_ETAPA.EM_ANDAMENTO
          )?.titulo ?? null,
        identificacaoProvisoria: processo.identificacaoProvisoria,
        empresaId: processo.empresaId,
        abertoEm: processo.abertoEm,
      },
      { status: 201 }
    );
  } catch (e) {
    console.error("[legalizacao][POST] falha ao criar processo:", e);
    return erro("Erro ao abrir o processo de legalização.", 500);
  }
}
