/**
 * Calendário de dias úteis e contagem de prazo.
 *
 * ARQUIVO SEM IMPORTS, de propósito, por dois motivos:
 *
 * 1. O cartão do Kanban é componente de cliente e precisa dizer quantos dias
 *    úteis faltam. Se isto morasse em `tarefa-status.ts` (que importa
 *    `tarefa-etapas.ts`) já estaria acoplado; morando sozinho, serve ao
 *    navegador e ao servidor sem arrastar nada.
 *
 * 2. É a única parte do módulo que dá para testar de fora sem banco, e
 *    `scripts/test-dias-uteis.mjs` faz exatamente isso. Feriado móvel calculado
 *    errado é o tipo de defeito que só aparece em abril do ano seguinte.
 *
 * `tarefa-status.ts` reexporta tudo daqui, então quem já importava de lá
 * continua funcionando.
 */

/* -------------------------------------------------------------------------- */
/*                                 Feriados                                   */
/* -------------------------------------------------------------------------- */

/**
 * Domingo de Páscoa do ano, em UTC.
 *
 * Algoritmo gregoriano anônimo (Meeus/Jones/Butcher). Vale de 1583 a 4099 e não
 * depende de tabela — o que importa aqui é não ter uma lista de feriados móveis
 * chumbada que envelhece e passa a mentir a partir de 2027.
 */
export function domingoDePascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function somarDias(data: Date, dias: number): Date {
  return new Date(data.getTime() + dias * 86_400_000);
}

/** "2026-09-15" — chave de dia, sem fuso, para comparar feriado. */
function chaveDia(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/**
 * Feriados que tiram o dia da contagem, por ano.
 *
 * Escopo: FERIADOS NACIONAIS, mais os três pontos facultativos que na prática
 * fecham escritório e banco (segunda e terça de carnaval, Corpus Christi). É o
 * mesmo calendário que a B3 e os bancos usam, e é o que decide se dá para
 * protocolar na Junta e se a guia é paga — o que torna esse conjunto o certo
 * para prazo de tarefa contábil.
 *
 * O que NÃO entra: feriado estadual e municipal. Precisaria de tabela por
 * cidade, e o dado nem existe no processo — `ProcessoLegalizacao` não tem UF nem
 * município; só a empresa tem, e processo pode existir sem empresa vinculada.
 * Contar aniversário de São Paulo como dia útil erra em um dia; inventar uma
 * tabela municipal incompleta erraria de forma silenciosa e imprevisível. Quando
 * o escritório definir as praças que importam, o lugar de mexer é aqui.
 *
 * Consciência Negra (20/11) entra: é feriado nacional desde a Lei 14.759/2023.
 */
function feriadosDoAno(ano: number): Set<string> {
  const pascoa = domingoDePascoa(ano);

  const fixos: [number, number][] = [
    [1, 1], // Confraternização Universal
    [4, 21], // Tiradentes
    [5, 1], // Dia do Trabalho
    [9, 7], // Independência
    [10, 12], // Nossa Senhora Aparecida
    [11, 2], // Finados
    [11, 15], // Proclamação da República
    [11, 20], // Consciência Negra
    [12, 25], // Natal
  ];

  const dias = fixos.map(([mes, dia]) =>
    chaveDia(new Date(Date.UTC(ano, mes - 1, dia)))
  );

  dias.push(chaveDia(somarDias(pascoa, -48))); // Carnaval, segunda
  dias.push(chaveDia(somarDias(pascoa, -47))); // Carnaval, terça
  dias.push(chaveDia(somarDias(pascoa, -2))); // Sexta-feira Santa
  dias.push(chaveDia(somarDias(pascoa, 60))); // Corpus Christi

  return new Set(dias);
}

/**
 * Cache por ano.
 *
 * A lista de cartões chama isto uma vez por linha, e recalcular Páscoa e montar
 * treze strings por linha é desperdício puro. O ano vira chave e o conjunto é
 * imutável.
 */
const cacheFeriados = new Map<number, Set<string>>();

function feriados(ano: number): Set<string> {
  let conjunto = cacheFeriados.get(ano);
  if (!conjunto) {
    conjunto = feriadosDoAno(ano);
    cacheFeriados.set(ano, conjunto);
  }
  return conjunto;
}

/** O dia é feriado do calendário acima. */
export function ehFeriado(data: Date): boolean {
  return feriados(data.getUTCFullYear()).has(chaveDia(data));
}

/** Dia útil = não é sábado, não é domingo e não é feriado nacional. */
export function ehDiaUtil(data: Date): boolean {
  const semana = data.getUTCDay();
  if (semana === 0 || semana === 6) return false;
  return !ehFeriado(data);
}

/* -------------------------------------------------------------------------- */
/*                                 Contagem                                   */
/* -------------------------------------------------------------------------- */

/** Meia-noite UTC do dia da data. Prazo é DIA, não instante. */
function inicioDoDiaUtc(data: Date): Date {
  return new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate())
  );
}

/**
 * Dias úteis entre duas datas, contando o fim e não o começo.
 *
 * A convenção é a do prazo: "faltam 3 dias úteis" para um prazo na quinta,
 * contado a partir de uma segunda, quer dizer terça, quarta e quinta. O dia de
 * hoje não conta como restante, porque ele já está sendo gasto.
 *
 * Devolve negativo quando o fim já passou, com o mesmo sentido: quantos dias
 * úteis de atraso. O laço tem teto de dez anos para nunca travar a renderização
 * por causa de uma data absurda gravada por engano (ano 9999 num campo de data).
 */
export function diasUteisEntre(inicio: Date, fim: Date): number {
  const de = inicioDoDiaUtc(inicio);
  const ate = inicioDoDiaUtc(fim);
  if (de.getTime() === ate.getTime()) return 0;

  const atrasado = ate.getTime() < de.getTime();
  const passo = atrasado ? -1 : 1;
  const limite = 3660;

  let contagem = 0;
  let cursor = de;
  for (let i = 0; i < limite; i += 1) {
    cursor = somarDias(cursor, passo);
    if (ehDiaUtil(cursor)) contagem += 1;
    if (cursor.getTime() === ate.getTime()) break;
  }

  return atrasado ? -contagem : contagem;
}

/** Dias corridos entre duas datas, comparando dia cheio em UTC. */
export function diasCorridosEntre(inicio: Date, fim: Date): number {
  return Math.round(
    (inicioDoDiaUtc(fim).getTime() - inicioDoDiaUtc(inicio).getTime()) /
      86_400_000
  );
}

/**
 * Dias corridos e dias úteis até o prazo, prontos para o cartão.
 *
 * As duas contagens juntas porque respondem perguntas diferentes e o escritório
 * usa as duas: dias corridos é o que o cliente cobra ("faz 15 dias que mandei"),
 * dias úteis é o que dá para trabalhar. Mostrar só uma das duas obriga a fazer a
 * outra conta de cabeça, que é onde erra.
 *
 * `null` quando não há prazo. Quando a tarefa está concluída também é `null`:
 * contagem regressiva de tarefa entregue não pede ação nenhuma e só polui.
 */
export type ContagemPrazo = {
  /** Dias corridos até o prazo. Negativo = atraso. */
  corridos: number;
  /** Dias úteis até o prazo, sem sábado, domingo e feriado nacional. */
  uteis: number;
  /** O prazo é hoje. */
  hoje: boolean;
  /** O prazo já passou. */
  atrasado: boolean;
};

export function contagemPrazo(
  prazo: Date | string | null | undefined,
  concluido: boolean,
  referencia: Date = new Date()
): ContagemPrazo | null {
  if (concluido || !prazo) return null;

  const alvo = prazo instanceof Date ? prazo : new Date(prazo);
  if (Number.isNaN(alvo.getTime())) return null;

  const corridos = diasCorridosEntre(referencia, alvo);

  return {
    corridos,
    uteis: diasUteisEntre(referencia, alvo),
    hoje: corridos === 0,
    atrasado: corridos < 0,
  };
}

function plural(n: number, singular: string, muitos: string): string {
  return Math.abs(n) === 1 ? singular : muitos;
}

/**
 * Texto pronto: "Faltam 3 dias úteis · 5 corridos".
 *
 * Vive aqui e não no componente porque a lista, o cartão e o detalhe têm de
 * dizer a mesma coisa com as mesmas palavras. Três versões do mesmo texto é como
 * a tela passa a se contradizer.
 */
export function textoContagemPrazo(
  contagem: ContagemPrazo | null
): string | null {
  if (!contagem) return null;

  const { corridos, uteis, hoje, atrasado } = contagem;
  if (hoje) return "O prazo é hoje";

  if (atrasado) {
    const c = Math.abs(corridos);
    const u = Math.abs(uteis);
    return `Atrasado há ${c} ${plural(c, "dia", "dias")} · ${u} ${plural(
      u,
      "dia útil",
      "dias úteis"
    )}`;
  }

  return `Faltam ${uteis} ${plural(
    uteis,
    "dia útil",
    "dias úteis"
  )} · ${corridos} ${plural(corridos, "corrido", "corridos")}`;
}

/** Versão curta para caber no cartão: "3 úteis · 5 corridos". */
export function textoContagemCurto(
  contagem: ContagemPrazo | null
): string | null {
  if (!contagem) return null;
  if (contagem.hoje) return "Prazo hoje";
  if (contagem.atrasado) {
    return `${Math.abs(contagem.uteis)} úteis · ${Math.abs(
      contagem.corridos
    )} corridos de atraso`;
  }
  return `${contagem.uteis} úteis · ${contagem.corridos} corridos`;
}
