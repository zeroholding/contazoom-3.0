/**
 * POST /api/estoque-full/sync — consulta a API do Mercado Livre e regrava o
 * snapshot de estoque Full.
 *
 * Segue o padrão de job longo do projeto: a ROTA roda o trabalho inteiro e
 * responde no fim; o cliente dispara sem esperar (fire-and-forget) e acompanha
 * pelo SSE. Não existe worker nem agendador ativo neste projeto, então inventar
 * um só para esta tela seria criar infraestrutura que ninguém mais usa e que
 * ninguém saberia operar.
 */

import { NextRequest, NextResponse } from "next/server";

import { assertSessionToken } from "@/lib/auth";
import { cache } from "@/lib/cache";
import { sincronizarEstoqueFull } from "@/lib/estoque-full-sync";
import { acquireSyncLock } from "@/lib/sync-lock";
import { sendProgressToUser } from "@/lib/sse-progress";

export const runtime = "nodejs";

/**
 * 300s, o mesmo teto que o projeto já usa nas importações pesadas.
 *
 * O sync respeita um orçamento de tempo INTERNO menor que este (ver
 * `sincronizarEstoqueFull`): quando ele acaba, a função para de começar contas
 * novas e devolve `faltouTempo`, em vez de ser cortada no meio pela plataforma.
 * A diferença importa: cortado no meio, o cliente não recebe resposta nem sabe o
 * que foi gravado; parando por conta própria, ele recebe o resumo e o aviso de
 * clicar de novo.
 */
export const maxDuration = 300;

/** Deixa uma folga de 45s entre o orçamento interno e o teto da plataforma. */
const ORCAMENTO_MS = 240_000;

export async function POST(req: NextRequest) {
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

  // Trava por USUÁRIO, sem incluir as contas na chave.
  //
  // O sync de vendas usa a lista de contas na chave, o que permite dois syncs
  // paralelos sobre subconjuntos diferentes. Aqui isso seria um defeito: o sync
  // de estoque APAGA os inventários que saíram do Full, e duas execuções
  // concorrentes na mesma conta poderiam apagar o que a outra acabou de gravar.
  const lock = await acquireSyncLock(["estoque-full", "meli", userId]);

  if (!lock.acquired) {
    sendProgressToUser(userId, {
      type: "estoque_full_warning",
      message: "Já existe uma atualização de estoque em andamento.",
      alreadyRunning: true,
    });
    return NextResponse.json(
      {
        success: false,
        alreadyRunning: true,
        message: "Já existe uma atualização de estoque em andamento.",
      },
      { status: 409 },
    );
  }

  try {
    const resumo = await sincronizarEstoqueFull(userId, ORCAMENTO_MS);

    // Limpa o cache de leitura deste usuário. A chave inclui o `userId`, e
    // `deletePattern` casa por substring, então isto derruba todas as
    // combinações de filtro de uma vez — sem isso a tela mostraria o número
    // velho por até 30 segundos depois de sincronizar.
    cache.deletePattern(`estoque-full:${userId}`);

    return NextResponse.json({
      success: true,
      ...resumo,
      hasMoreToSync: resumo.faltouTempo,
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Erro ao atualizar o estoque.";
    console.error("[estoque-full] sync falhou:", err);
    sendProgressToUser(userId, {
      type: "estoque_full_error",
      message: mensagem,
    });
    return NextResponse.json({ success: false, error: mensagem }, { status: 500 });
  } finally {
    // Sempre libera, inclusive em erro. Sem isto um sync que falhou deixaria a
    // trava presa por 30 minutos (o TTL) e ninguém conseguiria tentar de novo.
    await lock.release();
  }
}
