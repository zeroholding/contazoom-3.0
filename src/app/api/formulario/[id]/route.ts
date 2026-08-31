/**
 * Um formulário recebido, para a tela interna.
 *
 * GET   /api/formulario/[id]  — tudo, inclusive documentos e dados de origem
 * PATCH /api/formulario/[id]  — situação da análise e observação interna
 *
 * NÃO EXISTE DELETE, e isso é decisão, não omissão.
 *
 * Formulário recebido é a declaração do cliente, e os documentos anexados
 * sustentam um contrato social. O banco reforça: `formulario_abertura_documento`
 * referencia o formulário com `ON DELETE RESTRICT`, então mesmo um `DELETE` escrito
 * à mão no banco é recusado enquanto houver documento.
 *
 * O PATCH mexe em DOIS campos e só neles: `situacao` (andamento da análise) e
 * `observacaoInterna` (anotação do escritório). O conteúdo declarado pelo cliente
 * é imutável — corrigir um dado é pedir um envio novo, que gera protocolo novo e
 * preserva o que foi declarado antes.
 */

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireInterno } from "@/lib/api-guard";
import { SITUACAO_FORMULARIO } from "@/lib/formulario-abertura";
import { tamanhoLegivel, iconeDoAnexo, ehImagem } from "@/lib/tarefa-anexo";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

function erro(mensagem: string, status: number, code?: string): NextResponse {
  return NextResponse.json(
    code ? { error: mensagem, code } : { error: mensagem },
    { status }
  );
}

const SELECAO = {
  id: true,
  protocolo: true,
  token: true,
  dados: true,
  razaoSocialPretendida: true,
  nomeFantasia: true,
  socioPrincipalNome: true,
  socioPrincipalCpf: true,
  socioPrincipalEmail: true,
  socioPrincipalTelefone: true,
  quantidadeSocios: true,
  capitalTotalCentavos: true,
  situacao: true,
  observacaoInterna: true,
  ipOrigem: true,
  navegadorInfo: true,
  createdAt: true,
  updatedAt: true,
  documentos: {
    select: {
      id: true,
      slot: true,
      dono: true,
      rotulo: true,
      nomeOriginal: true,
      tipoMime: true,
      tamanhoBytes: true,
      createdAt: true,
    },
    orderBy: { slot: "asc" },
  },
} satisfies Prisma.FormularioAberturaSelect;

export async function GET(req: NextRequest, { params }: Params) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  const { id } = await params;

  try {
    const formulario = await prisma.formularioAbertura.findUnique({
      where: { id },
      select: SELECAO,
    });
    if (!formulario) {
      return erro("Formulário não encontrado.", 404, "NAO_ENCONTRADO");
    }

    return NextResponse.json({
      formulario: {
        ...formulario,
        // A URL do download é montada no servidor porque o arquivo NUNCA é
        // servido como estático: `/uploads/x.pdf` aberto deixaria qualquer pessoa
        // com o nome baixar o RG de um cliente, e nomes vazam em log e print.
        documentos: formulario.documentos.map((d) => ({
          ...d,
          url: `/api/formulario/documento/${d.id}`,
          tamanhoLegivel: tamanhoLegivel(d.tamanhoBytes),
          icone: iconeDoAnexo(d.tipoMime),
          ehImagem: ehImagem(d.tipoMime),
        })),
      },
    });
  } catch (e) {
    console.error("[formulario][GET id] falha ao carregar:", e);
    return erro("Erro ao carregar o formulário.", 500);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  const { id } = await params;

  let corpo: { situacao?: unknown; observacaoInterna?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return erro("Corpo inválido.", 400, "CORPO_INVALIDO");
  }

  const dados: Prisma.FormularioAberturaUpdateInput = {};

  if (corpo.situacao !== undefined) {
    const valor = String(corpo.situacao);
    // Lista branca: `situacao` é `String` no banco (o schema não usa enum), então
    // sem esta checagem qualquer texto entraria e a tela mostraria um selo vazio.
    if (!Object.values(SITUACAO_FORMULARIO).includes(valor as never)) {
      return erro("Situação inválida.", 400, "SITUACAO_INVALIDA");
    }
    dados.situacao = valor;
  }

  if (corpo.observacaoInterna !== undefined) {
    const valor =
      typeof corpo.observacaoInterna === "string"
        ? corpo.observacaoInterna.trim()
        : "";
    dados.observacaoInterna = valor.length ? valor.slice(0, 4000) : null;
  }

  if (!Object.keys(dados).length) {
    return erro("Nada para alterar.", 400, "SEM_ALTERACAO");
  }

  try {
    const atualizado = await prisma.formularioAbertura.update({
      where: { id },
      data: dados,
      select: { id: true, situacao: true, observacaoInterna: true, updatedAt: true },
    });
    return NextResponse.json({ formulario: atualizado });
  } catch (e) {
    console.error("[formulario][PATCH] falha ao atualizar:", e);
    return erro("Erro ao atualizar o formulário.", 500);
  }
}
