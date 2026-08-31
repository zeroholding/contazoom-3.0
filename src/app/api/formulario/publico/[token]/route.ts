/**
 * Consulta pública do formulário pelo token da URL.
 *
 * GET /api/formulario/publico/[token]
 *
 * É a rota que sustenta `/formulario/recibo/<token>`: o cliente enviou, recebeu o
 * link, e volta nele para conferir o que mandou.
 *
 * SÓ LEITURA. Não existe PATCH nem DELETE aqui, e não é esquecimento: o envio é a
 * declaração do cliente, e declaração editável não prova nada. Correção vem de um
 * envio novo, com protocolo novo.
 *
 * O QUE ESTA ROTA NÃO DEVOLVE, de propósito:
 *
 *   - `id`: o token já identifica, e vazar o id interno convida a tentar a rota
 *     interna com ele;
 *   - `observacaoInterna`: é anotação do escritório sobre o cliente. Vazar isso
 *     para o próprio cliente é o tipo de acidente que não tem desfazer;
 *   - `ipOrigem` e `navegadorInfo`: existem para investigar abuso, não para exibir;
 *   - link de download dos documentos: o cliente já tem os arquivos dele. Servir
 *     download por token transformaria o link em distribuidor de RG para quem
 *     encaminhasse a mensagem sem pensar. A tela mostra o NOME e o tamanho, que é
 *     o que responde "chegou?".
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

function erro(mensagem: string, status: number, code?: string): NextResponse {
  return NextResponse.json(
    code ? { error: mensagem, code } : { error: mensagem },
    { status }
  );
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;

  // Recusa antes de ir ao banco. O token gerado tem 32 hex; qualquer coisa fora
  // desse formato é varredura, e varredura não merece uma consulta.
  if (!token || !/^[a-f0-9]{24,64}$/.test(token)) {
    return erro("Link inválido.", 404, "NAO_ENCONTRADO");
  }

  try {
    const formulario = await prisma.formularioAbertura.findUnique({
      where: { token },
      select: {
        protocolo: true,
        dados: true,
        situacao: true,
        createdAt: true,
        documentos: {
          select: {
            slot: true,
            dono: true,
            rotulo: true,
            nomeOriginal: true,
            tamanhoBytes: true,
          },
          orderBy: { slot: "asc" },
        },
      },
    });

    if (!formulario) return erro("Link inválido.", 404, "NAO_ENCONTRADO");

    return NextResponse.json({ formulario });
  } catch (e) {
    console.error("[formulario][publico] falha ao consultar:", e);
    return erro("Erro ao consultar o formulário.", 500);
  }
}
