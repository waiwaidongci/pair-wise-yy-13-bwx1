export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function fmtTime(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function fmtNum(n: number | null, digits = 3): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function parseNum(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
}
