// Date handling for a shop that works in one local timezone.
//
// A "YYYY-MM-DD" filter must mean local midnight, not UTC midnight. Parsing it
// with new Date("2026-09-11") gives 05:30 IST, which quietly drops the first
// few hours of the day's bills from every filtered report.

/** Local start of the given YYYY-MM-DD (or of today when omitted). */
export function dayStart(ymd?: string): Date {
  if (!ymd) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

/** Local end of the given YYYY-MM-DD. */
export function dayEnd(ymd: string): Date {
  const d = dayStart(ymd);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Local YYYY-MM-DD key for a timestamp — the date the shop would call it. */
export function dayKey(d: Date | string): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/** Today's local YYYY-MM-DD. */
export const todayKey = (): string => dayKey(new Date());
