/**
 * Ganchos de inicialização do servidor (Next.js chama `register` uma vez por
 * processo).
 *
 * Só liga a varredura da fila de e-mail das notificações: o envio agrupado
 * depende de um temporizador em memória, e um reinício do container entre o
 * upload do documento e o horário do e-mail o apagaria. A varredura do novo
 * processo recolhe o que ficou na fila (ver `src/lib/notificacoes/despacho.ts`).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // `next build` também carrega este arquivo; durante o build não há fila.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { iniciarVarreduraEmails } = await import("./lib/notificacoes/despacho");
  iniciarVarreduraEmails();
}
