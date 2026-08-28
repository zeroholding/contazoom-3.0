/**
 * Formatação de data, prazo e texto para as telas do módulo.
 *
 * Um cuidado que atravessa o arquivo: as datas do módulo (prazo, vigência,
 * competência) são gravadas à meia-noite UTC. `new Date("2026-01-31").
 * toLocaleDateString("pt-BR")` no fuso de Brasília imprime 30/01 — o prazo
 * aparece um dia antes. Por isso lemos as partes em UTC, sempre.
 *
 * Já `createdAt` de log é instante real, e aí o fuso local é o certo: o operador
 * quer ver a hora em que a coisa aconteceu no relógio dele.
 */

/** Data de calendário (prazo, vigência): dd/mm/aaaa lido em UTC. */
export function dataCurta(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  const dia = String(data.getUTCDate()).padStart(2, "0");
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${data.getUTCFullYear()}`;
}

/** Instante (log, última alteração): dd/mm/aaaa HH:mm no fuso de quem olha. */
export function dataHora(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "há 3 dias", "hoje". Para o log ficar legível sem fazer conta de cabeça. */
export function tempoRelativo(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";

  const segundos = Math.floor((Date.now() - data.getTime()) / 1000);
  if (segundos < 60) return "agora";
  if (segundos < 3600) {
    const min = Math.floor(segundos / 60);
    return `há ${min} min`;
  }
  if (segundos < 86_400) {
    const horas = Math.floor(segundos / 3600);
    return horas === 1 ? "há 1 hora" : `há ${horas} horas`;
  }
  const dias = Math.floor(segundos / 86_400);
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "há 1 mês" : `há ${meses} meses`;
}

/**
 * Texto do prazo a partir de `situacao` + `dias`.
 *
 * `dias` é negativo quando atrasado (é a diferença até o alvo), então o texto de
 * atraso usa o valor absoluto — "atrasado -3 dias" não se lê.
 */
export function textoPrazo(
  situacao: string,
  dias: number | null | undefined
): string {
  switch (situacao) {
    case "SEM_PRAZO":
      return "Sem prazo";
    case "CONCLUIDO":
      return "Concluído";
    case "ATRASADO": {
      const atraso = Math.abs(dias ?? 0);
      if (atraso === 0) return "Vence hoje";
      return atraso === 1 ? "1 dia de atraso" : `${atraso} dias de atraso`;
    }
    case "VENCE_EM_BREVE": {
      if (dias === 0) return "Vence hoje";
      return dias === 1 ? "Vence amanhã" : `Vence em ${dias} dias`;
    }
    case "NO_PRAZO":
      return dias === null || dias === undefined
        ? "No prazo"
        : `Faltam ${dias} dias`;
    default:
      return "—";
  }
}

/** Selo do prazo. Atrasado é o único caso em vermelho — senão tudo grita. */
export function corPrazo(situacao: string): string {
  switch (situacao) {
    case "ATRASADO":
      return "bg-[#FEF2F2] text-[#B42318] border-[#FECDCA]";
    case "VENCE_EM_BREVE":
      return "bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]";
    case "NO_PRAZO":
      return "bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6]";
    case "CONCLUIDO":
      return "bg-gray-100 text-gray-600 border-gray-200";
    default:
      return "bg-gray-50 text-gray-500 border-gray-200";
  }
}

/** Ícone lucide do prazo. Nunca emoji. */
export function iconePrazo(situacao: string): string {
  switch (situacao) {
    case "ATRASADO":
      return "AlarmClock";
    case "VENCE_EM_BREVE":
      return "Timer";
    case "NO_PRAZO":
      return "CalendarCheck";
    case "CONCLUIDO":
      return "CheckCircle2";
    default:
      return "CalendarOff";
  }
}

/** 14 dígitos em 00.000.000/0000-00. Devolve o original se não for CNPJ. */
export function formatarCnpj(valor: string | null | undefined): string {
  if (!valor) return "—";
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length !== 14) return valor;
  return digitos.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5"
  );
}

/** "2026-01" para "Janeiro/2026", sem depender de Date (evita fuso). */
const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function competenciaLabel(ano: number, mes: number): string {
  return `${MESES[mes - 1] ?? mes}/${ano}`;
}

export function competenciaChave(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export { MESES };

/** Nome curto da empresa para cartão: fantasia se houver, senão razão social. */
export function nomeEmpresa(empresa: {
  razaoSocial: string;
  nomeFantasia?: string | null;
} | null): string {
  if (!empresa) return "Empresa não vinculada";
  return empresa.nomeFantasia?.trim() || empresa.razaoSocial;
}

/** Iniciais para o avatar. Duas letras no máximo. */
export function iniciais(nome: string | null | undefined): string {
  if (!nome?.trim()) return "?";
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Percentual inteiro de 0 a 100, sem divisão por zero. */
export function percentual(feito: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((feito / total) * 100)));
}

/** Plural simples: `plural(1,"dia","dias")` → "1 dia". */
export function plural(
  quantidade: number,
  singular: string,
  plural_: string
): string {
  return `${quantidade} ${quantidade === 1 ? singular : plural_}`;
}
