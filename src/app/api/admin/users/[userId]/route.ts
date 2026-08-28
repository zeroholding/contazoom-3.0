/**
 * Alteração do perfil de acesso de um usuário.
 *
 * A tela de usuários do admin nasceu com dois papéis ("USER" e "ADMIN") e nunca
 * teve como mudá-los depois do cadastro: errar o papel na criação significava
 * apagar e recriar a pessoa. Com cinco papéis no módulo de tarefas isso deixa de
 * ser aceitável — o assistente contábil que virou contábil pleno precisa de uma
 * troca, não de um novo cadastro.
 *
 * Só PATCH. Não existe DELETE aqui de propósito: `usuario` é referenciada por
 * contas de marketplace, documentos e histórico de etapas, então apagar usuário
 * é uma decisão de dado, não de tela de permissão.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  PAPEIS_VALIDOS,
  PAPEL,
  PAPEL_LABEL,
  invalidarCachePapel,
  requireAdmin,
} from "@/lib/api-guard";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    const sessao = await requireAdmin(req);
    if (sessao instanceof NextResponse) return sessao;

    const corpo = (await req.json().catch(() => null)) as
      | { role?: unknown }
      | null;
    if (!corpo) {
      return NextResponse.json(
        { error: "Corpo da requisição inválido." },
        { status: 400 }
      );
    }

    const role = typeof corpo.role === "string" ? corpo.role.trim() : "";
    if (!PAPEIS_VALIDOS.includes(role)) {
      return NextResponse.json(
        { error: "Perfil de acesso inválido.", campo: "role" },
        { status: 400 }
      );
    }

    const alvo = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!alvo) {
      return NextResponse.json(
        { error: "Usuário não encontrado." },
        { status: 404 }
      );
    }

    const papelAnterior = alvo.role || PAPEL.USER;

    // Nada a fazer. Responder 200 sem escrever evita gravação inútil e evita que
    // um duplo clique no botão gere duas linhas iguais de alteração.
    if (papelAnterior === role) {
      return NextResponse.json({
        alterado: false,
        usuario: {
          id: alvo.id,
          name: alvo.name,
          email: alvo.email,
          role: papelAnterior,
        },
        mensagem: "O usuário já está neste perfil.",
      });
    }

    /**
     * Salvaguarda 1 — ninguém se rebaixa.
     *
     * A tela oferece "Alterar perfil" em toda a linha da tabela, inclusive na
     * linha de quem está logado. Sem esta trava, dois cliques distraídos tiram o
     * próprio ADMIN do administrador, a tela de usuários passa a devolver 403
     * para ele, e não sobra caminho pela interface para desfazer: a única forma
     * de voltar seria um UPDATE direto no banco. A troca continua possível, só
     * não por conta própria — outro administrador faz.
     */
    if (userId === sessao.userId && role !== PAPEL.ADMIN) {
      return NextResponse.json(
        {
          error:
            "Você não pode alterar o seu próprio perfil de administrador. Peça a outro administrador.",
          code: "auto_rebaixamento",
        },
        { status: 409 }
      );
    }

    /**
     * Salvaguarda 2 — o sistema nunca fica sem administrador.
     *
     * A primeira trava cobre o caso comum, mas não todos: um administrador pode
     * rebaixar OUTRO administrador, e se esse outro for o último da instalação o
     * resultado é o mesmo bloqueio permanente. Acontece na prática quando duas
     * contas administrativas existem, uma é desativada por engano no cadastro e a
     * outra é rebaixada achando que a primeira ainda responde.
     *
     * A contagem é feita só quando ADMIN está saindo, para não pagar um COUNT em
     * toda troca de papel.
     */
    if (papelAnterior === PAPEL.ADMIN && role !== PAPEL.ADMIN) {
      const administradores = await prisma.user.count({
        where: { role: PAPEL.ADMIN },
      });
      if (administradores === 1) {
        return NextResponse.json(
          {
            error:
              "Este é o único administrador do sistema. Promova outro usuário antes de alterar este.",
            code: "ultimo_admin",
          },
          { status: 409 }
        );
      }
    }

    const atualizado = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });

    /**
     * O guard mantém o papel em memória por trinta segundos para não ler a tabela
     * `usuario` a cada requisição. Sem invalidar, a pessoa recém-promovida
     * continuaria levando 403 nas rotas do módulo até o cache expirar, e o
     * recém-rebaixado seguiria com poder que já não tem. Meio minuto de
     * permissão errada é bug reportável, então a escrita e a limpeza andam juntas.
     */
    invalidarCachePapel(userId);

    return NextResponse.json({
      alterado: true,
      usuario: atualizado,
      papelAnterior,
      papelLabel: PAPEL_LABEL[role] ?? role,
    });
  } catch (erro) {
    console.error("Erro ao alterar perfil de usuário:", erro);
    return NextResponse.json(
      { error: "Erro interno ao alterar o perfil." },
      { status: 500 }
    );
  }
}
