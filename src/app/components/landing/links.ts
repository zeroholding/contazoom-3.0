/**
 * Destinos do produto usados pela landing.
 *
 * Em produção, a landing mora em `contazoom.com.br` e o sistema em
 * `app.contazoom.com.br`. Link relativo faria a pessoa criar sessão no domínio
 * da landing e não no app. Em desenvolvimento continua relativo, para os botões
 * abrirem o localhost que está sendo acompanhado.
 */
const APP_ORIGIN =
  process.env.NODE_ENV === "production" ? "https://app.contazoom.com.br" : "";

export function linkDoApp(caminho: string): string {
  const path = caminho.startsWith("/") ? caminho : `/${caminho}`;
  return `${APP_ORIGIN}${path}`;
}
