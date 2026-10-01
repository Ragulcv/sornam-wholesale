// Dates for a shop that works in India time, wherever the code runs.
//
// The app's servers (Vercel) run on UTC, so anything that leans on the
// machine's own timezone is 5h30 behind the shop: between midnight and 05:30
// IST the server still thinks it is yesterday. Every shop-day decision and
// every date shown on screen goes through here instead, pinned to Asia/Kolkata.
// India has no daylight saving, so the offset is a constant.

export const SHOP_TZ = "Asia/Kolkata";
const IST_OFFSET_MS = 330 * 60_000; // +05:30

const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** India-time YYYY-MM-DD for a timestamp: the day the shop would call it. */
export function dayKey(d: Date | string): string {
  return keyFmt.format(new Date(d));
}

/** Today's India-time YYYY-MM-DD. */
export const todayKey = (): string => dayKey(new Date());

/** Midnight India time at the start of the given YYYY-MM-DD (today when omitted). */
export function dayStart(ymd?: string): Date {
  const [y, m, d] = (ymd ?? todayKey()).split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1) - IST_OFFSET_MS);
}

/** The last millisecond of the given YYYY-MM-DD, India time. */
export function dayEnd(ymd?: string): Date {
  return new Date(dayStart(ymd).getTime() + 86_400_000 - 1);
}
