/**
 * Contas de plataforma conectadas, com o estado real de cada uma.
 *
 * POR QUE UMA ROTA NOVA EM VEZ DE REUSAR /api/meli/accounts
 *
 * Duas razões, e a segunda é a que importa.
 *
 * 1. Aquelas rotas devolvem uma conta por plataforma e nada além do cadastro. A
 *    tela precisa do CONJUNTO (as duas plataformas de uma vez) e de dados que só
 *    existem cruzando com as vendas: quantas foram sincronizadas, qual a última,
 *    quando o sync rodou. Sem isso, "dados da conta" seria só o que já está no
 *    nome do cartão.
 *
 * 2. `/api/meli/accounts` faz `findMany` sem `select` e manda a linha INTEIRA
 *    para o navegador — inclusive `access_token` e `refresh_token`. Um refresh
 *    token do Mercado Livre é a credencial de longo prazo da conta: com ele se
 *    emitem access tokens novos indefinidamente. Ele não deveria sair do
 *    servidor, e a tela antiga não só recebia como IMPRIMIA os dois numa coluna
 *    da tabela (só com um `blur` de CSS, que é enfeite: o valor está no DOM).
 *
 *    Esta rota não seleciona os tokens. Devolve a SITUAÇÃO derivada deles
 *    (ativa / expirada / precisa reconectar), que é a única coisa que a tela
 *    precisa saber para decidir se mostra o botão de renovar.
 *
 *    As rotas antigas seguem intactas: são consumidas por oito telas (dashboard,
 *    vendas, sync, anúncios) e mexer no formato delas aqui quebraria todas. O
 *    vazamento continua lá e precisa ser tratado à parte.
 */

import { NextRequest, NextResponse } from "next/server";

import { assertSessionToken } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type {
  CanalConta,
  ContaPlataforma,
  RespostaContas,
  SituacaoConta,
} from "@/lib/contas";

export const runtime = "nodejs";

/* -------------------------------------------------------------------------- */
/*                                  Auxiliares                                */
/* -------------------------------------------------------------------------- */

function iso(valor: Date | null | undefined): string | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function situacao(
  expiraEm: Date | null | undefined,
  refreshInvalidoAte: Date | null | undefined,
): SituacaoConta {
  const agora = Date.now();

  // Ordem importa: refresh morto vence qualquer coisa. Uma conta pode ter access
  // token ainda dentro da validade E refresh recusado — nesse caso ela funciona
  // por mais alguns minutos e depois para, e dizer "ativa" esconderia isso até o
  // sync falhar.
  if (refreshInvalidoAte && new Date(refreshInvalidoAte).getTime() > agora) {
    return "reconectar";
  }
  if (!expiraEm || new Date(expiraEm).getTime() <= agora) {
    return "expirada";
  }
  return "ativa";
}

/* -------------------------------------------------------------------------- */
/*                                    GET                                     */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("session")?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let session;
  try {
    session = await assertSessionToken(sessionCookie);
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const userId = session.sub;

  try {
    // `groupBy` e não uma contagem por conta dentro de um laço: com três contas
    // seriam sete idas ao banco em vez de quatro, e a tela abre com todas as
    // plataformas de uma vez.
    const [contasMeli, contasShopee, vendasMeli, vendasShopee] = await Promise.all([
      prisma.meliAccount.findMany({
        where: { userId },
        // `select` explícito, e é o ponto principal desta rota: sem ele o Prisma
        // traz `access_token` e `refresh_token` e eles seguem para o navegador.
        select: {
          id: true,
          nickname: true,
          ml_user_id: true,
          expires_at: true,
          refresh_token_invalid_until: true,
          created_at: true,
          updated_at: true,
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.shopeeAccount.findMany({
        where: { userId },
        select: {
          id: true,
          shop_id: true,
          shop_name: true,
          expires_at: true,
          refresh_token_invalid_until: true,
          created_at: true,
          updated_at: true,
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.meliVenda.groupBy({
        by: ["meliAccountId"],
        where: { userId },
        _count: { _all: true },
        _max: { dataVenda: true, sincronizadoEm: true },
      }),
      prisma.shopeeVenda.groupBy({
        by: ["shopeeAccountId"],
        where: { userId },
        _count: { _all: true },
        _max: { dataVenda: true, sincronizadoEm: true },
      }),
    ]);

    const porContaMeli = new Map(vendasMeli.map((v) => [v.meliAccountId, v]));
    const porContaShopee = new Map(vendasShopee.map((v) => [v.shopeeAccountId, v]));

    const contas: ContaPlataforma[] = [
      ...contasMeli.map((c) => {
        const agg = porContaMeli.get(c.id);
        return {
          id: c.id,
          canal: "ML" as CanalConta,
          // `ml_user_id` é BigInt e não sobrevive ao JSON: `JSON.stringify` de
          // BigInt levanta TypeError e derrubaria a rota inteira.
          nome: c.nickname ?? `Vendedor ${c.ml_user_id.toString()}`,
          identificador: c.ml_user_id.toString(),
          situacao: situacao(c.expires_at, c.refresh_token_invalid_until),
          tokenExpiraEm: iso(c.expires_at),
          conectadaEm: iso(c.created_at),
          tokenAtualizadoEm: iso(c.updated_at),
          vendas: agg?._count._all ?? 0,
          ultimaVenda: iso(agg?._max.dataVenda),
          ultimoSync: iso(agg?._max.sincronizadoEm),
        };
      }),
      ...contasShopee.map((c) => {
        const agg = porContaShopee.get(c.id);
        return {
          id: c.id,
          canal: "SP" as CanalConta,
          nome: c.shop_name?.trim() || `Loja ${c.shop_id}`,
          identificador: c.shop_id,
          situacao: situacao(c.expires_at, c.refresh_token_invalid_until),
          tokenExpiraEm: iso(c.expires_at),
          conectadaEm: iso(c.created_at),
          tokenAtualizadoEm: iso(c.updated_at),
          vendas: agg?._count._all ?? 0,
          ultimaVenda: iso(agg?._max.dataVenda),
          ultimoSync: iso(agg?._max.sincronizadoEm),
        };
      }),
    ];

    const payload: RespostaContas = {
      contas,
      precisamReconectar: contas.filter((c) => c.situacao === "reconectar").length,
    };

    // Sem cache: a tela é aberta justamente depois de conectar ou excluir uma
    // conta, e trinta segundos de cache aqui fariam a conta nova não aparecer —
    // o que se conclui disso é que a conexão falhou.
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("Erro ao listar contas de plataforma:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
