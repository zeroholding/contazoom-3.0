/**
 * Período usado na comparação do faturamento do Dashboard.
 *
 * Regra definida pela demanda: comparar com o MESMO RECORTE DO MÊS ANTERIOR.
 * Ex.: 01/10/2026–16/10/2026 → 01/09/2026–16/09/2026.
 *
 * A conta é feita em datas civis de São Paulo, não no fuso do processo Node:
 * produção normalmente roda em UTC, enquanto o filtro representa dias no
 * Brasil. Quando o mês anterior não tem o mesmo dia (31/03 → fevereiro), o dia
 * é limitado ao último dia existente, sem transbordar de volta para março.
 * Um mês histórico completo compara com o mês anterior completo; assim,
 * 01/02–29/02 compara com 01/01–31/01, e não só com 01/01–29/01.
 */

export const FUSO_DASHBOARD = "America/Sao_Paulo";

export type DataCivil = { ano: number; mes: number; dia: number };

export type PeriodoComparativo = {
  inicio: Date;
  fim: Date;
  /** Datas civis, próprias para exibição sem conversão de fuso. */
  dataInicio: string;
  dataFim: string;
};

/**
 * Variação percentual do atual contra o anterior.
 *
 * Base zero ou negativa não gera "0%": não existe comparação percentual útil.
 * `null` faz a tela dizer explicitamente que o período anterior não tem base.
 */
export function variacaoPercentual(atual: number, anterior: number | null): number | null {
  if (anterior === null || !Number.isFinite(atual) || !Number.isFinite(anterior) || anterior <= 0) {
    return null;
  }
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

const FORMATADOR_DATA_CIVIL = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_DASHBOARD,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Data civil que um instante representa no horário de São Paulo. */
export function dataCivilNoBrasil(instante: Date): DataCivil | null {
  if (Number.isNaN(instante.getTime())) return null;
  const partes = FORMATADOR_DATA_CIVIL.formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((parte) => parte.type === tipo)?.value);
  const data = { ano: valor("year"), mes: valor("month"), dia: valor("day") };
  return Object.values(data).every(Number.isInteger) ? data : null;
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function mesAnterior({ ano, mes, dia }: DataCivil): DataCivil {
  const indice = ano * 12 + (mes - 1) - 1;
  const novoAno = Math.floor(indice / 12);
  const novoMes = indice - novoAno * 12 + 1;
  return {
    ano: novoAno,
    mes: novoMes,
    dia: Math.min(dia, diasNoMes(novoAno, novoMes)),
  };
}

function isoCivil({ ano, mes, dia }: DataCivil): string {
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * O Brasil está em UTC−03 desde 2019 (sem horário de verão). Estas bordas são
 * as mesmas já usadas pelos presets da rota do Dashboard:
 * 00:00 Brasil = 03:00Z; 23:59:59.999 Brasil = 02:59:59.999Z do dia seguinte.
 */
function inicioDoDia(data: DataCivil): Date {
  return new Date(Date.UTC(data.ano, data.mes - 1, data.dia, 3, 0, 0, 0));
}

function fimDoDia(data: DataCivil): Date {
  return new Date(Date.UTC(data.ano, data.mes - 1, data.dia + 1, 2, 59, 59, 999));
}

function ehMesCompleto(inicio: DataCivil, fim: DataCivil): boolean {
  return (
    inicio.ano === fim.ano &&
    inicio.mes === fim.mes &&
    inicio.dia === 1 &&
    fim.dia === diasNoMes(fim.ano, fim.mes)
  );
}

/** Mesmo intervalo civil, deslocado exatamente um mês para trás. */
export function periodoDoMesAnterior(inicio: Date, fim: Date): PeriodoComparativo | null {
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || inicio > fim) return null;

  const inicioCivil = dataCivilNoBrasil(inicio);
  const fimCivil = dataCivilNoBrasil(fim);
  if (!inicioCivil || !fimCivil) return null;

  const inicioAnterior = mesAnterior(inicioCivil);
  let fimAnterior = mesAnterior(fimCivil);

  // Mês completo precisa continuar completo mesmo quando os meses têm números
  // diferentes de dias (fevereiro ↔ janeiro, abril ↔ março etc.).
  if (ehMesCompleto(inicioCivil, fimCivil)) {
    fimAnterior = {
      ano: inicioAnterior.ano,
      mes: inicioAnterior.mes,
      dia: diasNoMes(inicioAnterior.ano, inicioAnterior.mes),
    };
  }

  return {
    inicio: inicioDoDia(inicioAnterior),
    fim: fimDoDia(fimAnterior),
    dataInicio: isoCivil(inicioAnterior),
    dataFim: isoCivil(fimAnterior),
  };
}
