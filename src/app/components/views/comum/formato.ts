/**
 * Formatação e classes compartilhadas pelas telas novas.
 *
 * Vive numa pasta neutra e não dentro de `anuncios/` porque nada aqui tem a ver
 * com anúncios: é dinheiro, número e a classe do campo de formulário. Deixar em
 * `anuncios/` fazia a tela de Estoque Full importar de uma pasta chamada
 * "anuncios", o que é o tipo de acoplamento que confunde quem abre o arquivo
 * seis meses depois.
 */

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const inteiro = (v: number) => v.toLocaleString("pt-BR");

export const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

/** Classe do input/select padrão das telas novas. */
export const ENTRADA =
  "h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-[13px] text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

/**
 * "há 5 min", "há 3h", "há 2d".
 *
 * Data absoluta obriga a pessoa a fazer a conta de cabeça para saber se o número
 * na tela é de agora ou de ontem — e essa conta é justamente a que decide se ela
 * confia no estoque exibido.
 */
export function tempoRelativo(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "agora";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}
