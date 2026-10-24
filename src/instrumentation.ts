/**
 * Ganchos de inicialização do servidor (Next.js chama `register` uma vez por
 * processo).
 *
 * 1. Liga a varredura da fila de e-mail das notificações: o envio agrupado
 *    depende de um temporizador em memória, e um reinício do container entre o
 *    upload do documento e o horário do e-mail o apagaria. A varredura do novo
 *    processo recolhe o que ficou na fila (ver `src/lib/notificacoes/despacho.ts`).
 * 2. Leva os XMLs importados com uma regra de faturamento antiga para a atual (ver
 *    `src/lib/faturamento-regra-atual.ts`). Em segundo plano: subir o servidor não
 *    espera por isso, e a primeira leitura do faturamento espera se ainda estiver
 *    rodando.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // `next build` também carrega este arquivo; durante o build não há fila.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { iniciarVarreduraEmails } = await import("./lib/notificacoes/despacho");
  iniciarVarreduraEmails();

  void import("./lib/faturamento-regra-atual")
    .then(({ garantirRegraFaturamentoAtual }) => garantirRegraFaturamentoAtual())
    .catch((erro) => {
      console.error("[faturamento] Não foi possível iniciar a atualização da regra:", erro);
    });
}
