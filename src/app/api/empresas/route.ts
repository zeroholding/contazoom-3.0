/**
 * Lista e cadastro de empresas do módulo de tarefas contábeis.
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seção 16.1.
 *
 * GET  — qualquer papel interno. A carteira é compartilhada: comercial e
 *        escritório precisam ver as mesmas empresas para conversar sobre elas.
 * POST — ADMIN e COMERCIAL (`podeGerenciarEmpresa`). Cadastro é ato comercial;
 *        a contabilidade opera a empresa, não a cria.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  negado,
  podeGerenciarEmpresa,
  requireInterno,
  requireSessao,
} from "@/lib/api-guard";
import {
  formatarCnpj,
  hojeUtc,
  lerCorpo,
  normalizarCnpjOpcional,
  usuariosInexistentes,
  validarPayloadEmpresa,
} from "@/lib/empresa";
import { formatarCep, formatarCpf } from "@/lib/documento";
import {
  PLANOS_INTERNOS_VALIDOS,
  REGIMES_VALIDOS,
  SITUACOES_EMPRESA_VALIDAS,
} from "@/lib/tarefa-etapas";

export const runtime = "nodejs";

const LIMITE_PADRAO = 50;
/** Teto de página. Sem ele, `?limit=100000` transforma a listagem em dump. */
const LIMITE_MAXIMO = 200;

const CAMPOS_LISTA = {
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
  createdAt: true,
  _count: { select: { apuracoes: true, processos: true } },
} satisfies Prisma.EmpresaSelect;

/**
 * Endereço em uma linha, montado no servidor.
 *
 * Vem daqui e não da tela para as três telas que mostram endereço escreverem
 * igual. Partes ausentes simplesmente não entram, em vez de virarem vírgula
 * sobrando — "Rua X, , , São Paulo" é o resultado de montar isso no template.
 */
function enderecoLinha(empresa: {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
}): string | null {
  const via = [empresa.logradouro, empresa.numero].filter(Boolean).join(", ");
  const partes = [
    via || null,
    empresa.complemento,
    empresa.bairro,
    [empresa.municipio, empresa.uf].filter(Boolean).join(" - ") || null,
    empresa.cep ? formatarCep(empresa.cep) : null,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : null;
}

/** Campos derivados que toda tela consome do mesmo jeito. */
function comFormatacao<T extends Prisma.EmpresaGetPayload<{ select: typeof CAMPOS_LISTA }>>(
  empresa: T
) {
  return {
    ...empresa,
    // Máscara vem do servidor para que toda tela mostre o mesmo formato.
    cnpjFormatado: empresa.cnpj ? formatarCnpj(empresa.cnpj) : null,
    cepFormatado: empresa.cep ? formatarCep(empresa.cep) : null,
    socioAdmCpfFormatado: empresa.socioAdmCpf
      ? formatarCpf(empresa.socioAdmCpf)
      : null,
    enderecoLinha: enderecoLinha(empresa),
  };
}

/** Violação de unicidade do Prisma. Aqui só pode ser o `cnpj @unique`. */
function ehCnpjDuplicado(erro: unknown): boolean {
  return (
    typeof erro === "object" &&
    erro !== null &&
    (erro as { code?: unknown }).code === "P2002"
  );
}

function inteiroPositivo(valor: string | null, padrao: number): number {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 1) return padrao;
  return Math.floor(numero);
}

export async function GET(req: NextRequest) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  try {
    const { searchParams } = new URL(req.url);
    const regime = searchParams.get("regime")?.trim() || "";
    const situacao = searchParams.get("situacao")?.trim() || "";
    const planoInterno = searchParams.get("planoInterno")?.trim() || "";
    const grupo = searchParams.get("grupo")?.trim() || "";
    const semCnpj = searchParams.get("semCnpj")?.trim() || "";
    const busca = searchParams.get("busca")?.trim() || "";
    const page = inteiroPositivo(searchParams.get("page"), 1);
    const limit = Math.min(
      inteiroPositivo(searchParams.get("limit"), LIMITE_PADRAO),
      LIMITE_MAXIMO
    );

    // Filtro com valor desconhecido devolve 400 em vez de lista vazia: lista
    // vazia parece "não tem empresa nesse regime" e esconde o erro de digitação.
    if (regime && !REGIMES_VALIDOS.includes(regime)) {
      return NextResponse.json({ error: "Regime inválido." }, { status: 400 });
    }
    // `situacao` continua aceito para não quebrar link antigo já compartilhado,
    // mas a tela filtra por plano interno agora.
    if (situacao && !SITUACOES_EMPRESA_VALIDAS.includes(situacao)) {
      return NextResponse.json({ error: "Situação inválida." }, { status: 400 });
    }
    if (planoInterno && !PLANOS_INTERNOS_VALIDOS.includes(planoInterno)) {
      return NextResponse.json(
        { error: "Plano interno inválido." },
        { status: 400 }
      );
    }

    const where: Prisma.EmpresaWhereInput = {};
    if (regime) where.regime = regime;
    if (situacao) where.situacao = situacao;
    if (planoInterno) where.planoInterno = planoInterno;
    if (grupo) where.grupo = { equals: grupo, mode: "insensitive" };
    // Empresa em abertura, para a tela de legalização oferecer o cadastro que
    // ainda não tem CNPJ sem precisar carregar a carteira inteira.
    if (semCnpj === "true") where.cnpj = null;
    if (semCnpj === "false") where.cnpj = { not: null };

    if (busca) {
      // O CNPJ é gravado só com dígitos, então a busca por CNPJ compara dígitos.
      // Quem cola "12.345.678/0001-95" da nota fiscal encontra a empresa.
      const digitosBusca = busca.replace(/\D/g, "");
      where.OR = [
        { razaoSocial: { contains: busca, mode: "insensitive" } },
        { nomeFantasia: { contains: busca, mode: "insensitive" } },
        { grupo: { contains: busca, mode: "insensitive" } },
        { socioAdmNome: { contains: busca, mode: "insensitive" } },
        ...(digitosBusca
          ? [
              { cnpj: { contains: digitosBusca } },
              // Busca por CPF do sócio: é assim que se acha o grupo de um dono
              // quando ninguém lembra a razão social de cada empresa dele.
              ...(digitosBusca.length >= 6
                ? [{ socioAdmCpf: { contains: digitosBusca } }]
                : []),
            ]
          : []),
      ];
    }

    const [total, empresas] = await Promise.all([
      prisma.empresa.count({ where }),
      prisma.empresa.findMany({
        where,
        select: CAMPOS_LISTA,
        orderBy: { razaoSocial: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      empresas: empresas.map(comFormatacao),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("Erro ao listar empresas:", error);
    return NextResponse.json(
      { error: "Erro interno ao listar empresas." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const sessao = await requireSessao(req);
  if (sessao instanceof NextResponse) return sessao;
  if (!podeGerenciarEmpresa(sessao.papel)) {
    return negado(
      "Somente administrador e comercial podem cadastrar empresa."
    );
  }

  try {
    const body: unknown = await req.json();

    const corpo = lerCorpo(body);
    if (!corpo) {
      return NextResponse.json(
        { error: "Corpo da requisição inválido." },
        { status: 400 }
      );
    }

    /**
     * CNPJ OPCIONAL desde a mudança de 30/08/2026.
     *
     * A regra nova do módulo é que processo de legalização — inclusive abertura —
     * só nasce atrelado a uma empresa já cadastrada. Para isso valer, o cadastro
     * tem de aceitar a empresa que ainda não tem CNPJ, que é justamente a que
     * está sendo aberta.
     *
     * Ausente e torto continuam sendo coisas diferentes: sem CNPJ passa, com
     * CNPJ inválido é 400 com o campo apontado.
     */
    const cnpj = normalizarCnpjOpcional(corpo.cnpj);
    if (!cnpj.ok) {
      return NextResponse.json(
        { error: cnpj.erro, campo: "cnpj" },
        { status: 400 }
      );
    }

    const payload = validarPayloadEmpresa(corpo);
    if (!payload.ok) {
      return NextResponse.json(
        { error: payload.erro, campo: payload.campo },
        { status: 400 }
      );
    }
    const dados = payload.dados;

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

    // 409 e não 400: o corpo está correto, o conflito é com o estado do banco.
    // O `code` deixa a tela oferecer "abrir a empresa existente" em vez de só
    // mostrar erro, e a razão social identifica quem já tem o CNPJ — sem ela o
    // operador não sabe se é a mesma empresa cadastrada por outro colega.
    // Só há duplicidade a conferir quando existe CNPJ: empresa em abertura não
    // tem número para colidir, e o índice único aceita vários NULL.
    if (cnpj.digitos) {
      const existente = await prisma.empresa.findUnique({
        where: { cnpj: cnpj.digitos },
        select: { id: true, razaoSocial: true },
      });
      if (existente) {
        return NextResponse.json(
          {
            error: `O CNPJ ${formatarCnpj(cnpj.digitos)} já está cadastrado para ${
              existente.razaoSocial
            }.`,
            code: "cnpj_duplicado",
            empresaId: existente.id,
          },
          { status: 409 }
        );
      }
    }

    // Transação porque empresa sem a primeira linha de histórico é empresa com
    // linha do tempo fiscal vazia: `POST /empresas/[id]/regime` fecha a linha
    // vigente para abrir a nova, e sem linha vigente não há o que fechar. As
    // duas escritas valem juntas ou não valem.
    const empresa = await prisma.$transaction(async (tx) => {
      const criada = await tx.empresa.create({
        data: {
          cnpj: cnpj.digitos,
          grupo: dados.grupo,
          razaoSocial: dados.razaoSocial,
          nomeFantasia: dados.nomeFantasia,
          regime: dados.regime,
          planoInterno: dados.planoInterno,
          situacao: dados.situacao,
          tributoLocal: dados.tributoLocal,
          inscricaoMunicipal: dados.inscricaoMunicipal,
          inscricaoEstadual: dados.inscricaoEstadual,
          cep: dados.cep,
          logradouro: dados.logradouro,
          numero: dados.numero,
          complemento: dados.complemento,
          bairro: dados.bairro,
          uf: dados.uf,
          municipio: dados.municipio,
          responsavelOperacional: dados.responsavelOperacional,
          socioAdmNome: dados.socioAdmNome,
          socioAdmCpf: dados.socioAdmCpf,
          inicioAtividade: dados.inicioAtividade,
          userId: dados.userId,
          responsavelId: dados.responsavelId,
          observacoes: dados.observacoes,
        },
        select: CAMPOS_LISTA,
      });

      await tx.empresaRegimeHistorico.create({
        data: {
          empresaId: criada.id,
          regime: dados.regime,
          // Início de atividade quando informado: é a data em que o regime
          // passou a valer de fato. Sem ela, vale a data do cadastro.
          vigenciaInicio: dados.inicioAtividade ?? hojeUtc(),
          motivo: "Cadastro inicial",
          registradoPor: sessao.nome,
        },
      });

      return criada;
    });

    return NextResponse.json({ empresa: comFormatacao(empresa) }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Corpo da requisição inválido." },
        { status: 400 }
      );
    }
    // Dois cadastros do mesmo CNPJ ao mesmo tempo passam pela checagem acima e
    // batem na constraint. A trava de verdade é o banco; aqui só traduzimos.
    if (ehCnpjDuplicado(error)) {
      return NextResponse.json(
        { error: "Este CNPJ já está cadastrado.", code: "cnpj_duplicado" },
        { status: 409 }
      );
    }
    console.error("Erro ao cadastrar empresa:", error);
    return NextResponse.json(
      { error: "Erro interno ao cadastrar empresa." },
      { status: 500 }
    );
  }
}
