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

/**
 * Só a HORA, para quando a data já está numa linha acima.
 *
 * `timeZone` explícito e não o fuso do navegador: as datas de venda vêm como
 * instante UTC, e sem essa opção a mesma venda apareceria em horas diferentes num
 * notebook com o relógio em outro fuso. O negócio é brasileiro, e a hora que
 * interessa é a de São Paulo.
 *
 * A hora importa em "última venda": vendeu hoje de manhã ou hoje às 23h50 são
 * leituras diferentes de "está parado", e só a data trata as duas como iguais.
 *
 * NÃO existe um `dataHora` aqui de propósito. Já há DOIS no projeto —
 * `ui/tarefas/formato.ts` (fuso do navegador) e `lib/contas.ts::dataHoraSP`
 * (São Paulo) — e acrescentar um terceiro com o mesmo nome e comportamento
 * ligeiramente diferente é exatamente a duplicação que este arquivo existe para
 * acabar. Quem precisa de data e hora compõe `dataCurta` + `horaCurta`, que é o
 * que as telas de anúncios fazem (em duas linhas, para a coluna não alargar).
 */
export function horaCurta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Classe do input/select padrão das telas novas.
 *
 * O FOCO É LARANJA, NÃO VERDE. Antes era
 * `focus:border-emerald-500 focus:ring-emerald-100`, e isso brigava com o
 * significado do verde nas próprias telas onde a classe é usada: em Estoque Full
 * e em Anúncios, verde quer dizer "saudável" e "no pódio". O anel de foco é
 * resposta a uma AÇÃO da pessoa — a mesma coisa que o botão do login, o item
 * ativo do menu e a coluna ordenada — e no produto essa cor é o laranja da marca.
 *
 * As cores neutras passaram a tokens (`--cz-hairline-forte`, `--cz-superficie`,
 * `--cz-texto`) em vez de `gray-300`/`bg-white`/`text-gray-900`. Com cinza cru, o
 * campo ficava com um cinza levemente diferente do fio dos cartões ao lado, o que
 * a olho nu não se nomeia mas se percebe como desalinho.
 *
 * ALTURA 11 (2,75rem) E TEXTO 13,5px, e não 10/13.
 *
 * A altura casa com a dos botões do kit (`BotaoPrimario`, `BotaoAtualizar` e
 * `BotaoSecundario` são todos `h-11`). Com o campo em `h-10`, qualquer linha que
 * tivesse um campo ao lado de um botão saía com 4px de degrau — e é esse tipo de
 * diferença que faz uma tela "não parecer do sistema" sem que se consiga apontar
 * o quê. 13,5px porque 13 era o menor texto de formulário do produto inteiro,
 * dentro de um campo de 40px de altura: sobrava caixa e faltava letra.
 *
 * Quem escrever um campo à mão deve usar `ALTURA_CAMPO` para não reintroduzir o
 * degrau.
 */
export const ALTURA_CAMPO = "h-11";

export const ENTRADA =
  "h-11 w-full rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-3 text-[13.5px] text-[var(--cz-texto)] outline-none transition-colors focus:border-[var(--cz-laranja)] focus:ring-2 focus:ring-[var(--cz-laranja-suave)]";

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
