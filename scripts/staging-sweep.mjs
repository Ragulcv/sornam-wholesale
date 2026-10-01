// Read-only: opens every screen and every Bookings tab on live staging and
// reports page errors, failed requests and broken renders. Saves nothing.
import puppeteer from "puppeteer-core";
import { sealData } from "iron-session";
const BASE = process.env.LIVE_BASE ?? "https://sornam-wholesale-staging.vercel.app";
const W = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (l, c, d = "") => { c ? pass++ : fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${l}${d ? ` — ${d}` : ""}`); };
const { db } = await import("../lib/db/index.ts"); const S = await import("../lib/db/schema.ts");
const [op] = await db.select().from(S.operators).limit(1);
const sealed = await sealData({ authed: true, operatorId: op.id, operatorName: op.name, since: Date.now() }, { password: process.env.SESSION_SECRET });
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
let errs = [], bad = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 120)); });
p.on("response", (r) => { if (r.status() >= 500) bad.push(`${r.status()} ${r.url().replace(BASE, "")}`); });
await p.setCookie({ name: "sw_session", value: sealed, url: BASE });
const live = () => p.waitForFunction(() => [...document.querySelectorAll("button,a")].some((x) => Object.keys(x).some((k) => k.startsWith("__react"))), { timeout: 45000 }).then(() => W(1200)).catch(() => {});
const PAGES = [["/", /today/i], ["/entry", /SALES ENTRIES/], ["/bookings", /BOOKING/], ["/expenses", /daily closing tally/i], ["/history", /Transaction History/], ["/pnl", /bottom line/i], ["/stock", /Stock/], ["/prices", /MCX Price Tracker/], ["/parties", /Parties/i], ["/settings", /daily backup/i], ["/bookings/import", /Import booking workbook/]];
for (const [path, mustSay] of PAGES) {
  errs = []; bad = [];
  const r = await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" }); await live();
  const t = await p.evaluate(() => document.body.innerText);
  ok(`${path.padEnd(16)} loads`, r.status() === 200 && mustSay.test(t) && !/Application error|Something went wrong/i.test(t), `${r.status()}`);
  ok(`${path.padEnd(16)} no errors`, errs.length === 0 && bad.length === 0, [...errs, ...bad].slice(0, 2).join(" | "));
}
console.log("\nBookings tabs:");
await p.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" }); await live();
for (const tab of ["R SELL", "R BUY", "F SELL", "F BUY", "UF SELL", "UF BUY", "CUSTOMERS", "- OR +", "MCX TRADES"]) {
  errs = [];
  const clicked = await p.evaluate((t) => { const x = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t); x?.click(); return !!x; }, tab);
  await W(600);
  const t = await p.evaluate(() => document.body.innerText);
  ok(`tab ${tab.padEnd(11)} opens cleanly`, clicked && errs.length === 0 && !/Application error/.test(t), errs[0] ?? "");
}
const exp = await p.evaluate(async () => (await fetch("/api/bookings/export")).status);
ok("Excel export downloads", exp === 200, `${exp}`);
const bs = await p.evaluate(async () => (await fetch("/api/backup/status")).json());
ok("backup card endpoint answers (not connected yet, as expected)", bs.connected === false, JSON.stringify(bs));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
