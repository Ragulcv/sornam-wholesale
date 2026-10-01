// Same answers whether the machine runs on UTC (Vercel) or IST (a shop PC).
const { dayKey, dayStart, dayEnd, todayKey } = await import("../lib/dates.ts");
const { fmtDate } = await import("../lib/format.ts");
const out = {
  // 02:30 IST on 2 Oct = 21:00 UTC on 1 Oct: the shop calls it the 2nd
  earlyMorning: dayKey(new Date("2026-10-01T21:00:00Z")),
  lateNight: dayKey(new Date("2026-10-02T18:29:00Z")),   // 23:59 IST 2 Oct
  justAfter: dayKey(new Date("2026-10-02T18:31:00Z")),   // 00:01 IST 3 Oct
  start: dayStart("2026-10-02").toISOString(),
  end: dayEnd("2026-10-02").toISOString(),
  shown: fmtDate(new Date("2026-10-01T21:00:00Z")),
  todayIsIndiaToday: todayKey() === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()),
};
console.log(JSON.stringify(out));
