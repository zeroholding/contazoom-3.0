
export function roundCurrency(v: number): number {
  const r = Math.round((v + Number.EPSILON) * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

export function truncateString(
  str: string | null | undefined,
  maxLength: number
): string {
  if (!str) return "";
  return str.length > maxLength ? str.substring(0, maxLength) : str;
}

// Preserve complete JSON payloads (no truncation to keep shipping data intact)
export function truncateJsonData<T>(data: T): T {
  return data === undefined ? (null as T) : data;
}
