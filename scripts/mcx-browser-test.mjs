// MCX TRADES tab and P&L page in a real browser on live staging.
// Uses its own MCX id and a 2020 date; removes everything it made.
import puppeteer from "puppeteer-core";
import { sealData } from "iron-session";
const BASE = process.env.LIVE_BASE ?? "http://localhost:3941";
const W = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (l, c, d = "") => { c ? pass++ : fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${l}${d ? ` — ${d}` : ""}`); };
const { db } = await import("../lib/db/index.ts"); const S = await import("../lib/db/schema.ts");
const { eq } = await import("drizzle-orm");
const ACC = `ZZ-UI-${Date.now() % 100000}`, DAY = "2020-02-03";
const [op] = await db.select().from(S.operators).limit(1);
const sealed = await sealData({ authed: true, operatorId: op.id, operatorName: op.name, since: Date.now() }, { password: process.env.SESSION_SECRET });
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const errors = [];
try {
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 1000 });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.setCookie({ name: "sw_session", value: sealed, url: BASE });
  const live = () => p.waitForFunction(() => [...document.querySelectorAll("button")].some((x) => Object.keys(x).some((k) => k.startsWith("__reactProps"))), { timeout: 45000 }).then(() => W(500));
  const text = () => p.evaluate(() => document.body.innerText);
  const clickBtn = (t) => p.evaluate((t) => { const x = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t); x?.click(); return !!x; }, t);
  const setVal = (sel, v, idx = 0) => p.evaluate((sel, v, idx) => {
    const el = document.querySelectorAll(sel)[idx];
    const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  }, sel, v, idx);

  await p.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" }); await live();
  ok("MCX TRADES tab exists", await clickBtn("MCX TRADES")); await W(800);
  let t = await text();
  ok("tab shows the register and the close box", /record an mcx trade/i.test(t) && /mcx closing rate for/i.test(t));
  // any trade still missing a price must be flagged; none missing = nothing flagged
  const unpriced = (await db.select().from(S.mcxTrades)).filter((x) => x.price == null).length;
  ok(unpriced ? "trades without a price are flagged 'no price'" : "no unpriced trades, and none flagged", unpriced ? /no price/i.test(t) : !/no price/i.test(t), `${unpriced} unpriced`);

  // record a trade: every field found by its label
  const L = (name) => `[aria-label="${name}"]`;
  await setVal(L("Trade date"), DAY);
  await setVal(L("MCX ID"), ACC);
  await setVal(L("Buy or sell"), "buy");
  await setVal(L("Lots"), "1");
  await setVal(L("Price per 10 g"), "148000"); await W(300);
  t = await text();
  ok("live hint: 1 lot = 1,000 g, Rs 100 per Rs 1", /1 lot\(s\) = 1,000 g · every ₹1 move in the price = ₹100\.00/.test(t));
  await clickBtn("Add"); await W(3500);
  t = await text();
  ok("trade saved", /Bought 1 lot\(s\) on/.test(t));
  ok("position shows BUY 1.000 for the id", new RegExp(`${ACC}\\s+BUY 1\\.000`).test(t));

  // the day's MCX close
  await setVal(L("Close date"), DAY);
  await setVal(L("MCX close per 10 g"), "148500"); await W(200);
  await clickBtn("Save close"); await W(3500);
  t = await text();
  ok("close saved", /Close saved for/.test(t));

  // the hedge box reads it
  await clickBtn("- OR +"); await W(800);
  t = await text();
  ok("hedge MCX box lists the id from the register", t.includes(ACC));
  ok("hedge box is read-only with a link to record", /Record MCX trade/.test(t) && /From the MCX trade register/.test(t));

  // P&L page
  await p.goto(`${BASE}/pnl?from=${DAY}&to=${DAY}`, { waitUntil: "domcontentloaded" }); await W(2500);
  t = await text();
  ok("P&L has Physical / MCX hedge / Bottom line", /physical \(sales/i.test(t) && /mcx hedge/i.test(t) && /bottom line/i.test(t));
  const seg = (t.match(/MCX hedge[\s\S]{0,400}/i) || [""])[0].replace(/\s+/g, " ");
  ok("MCX profit for the day = +50,000 (open +500 x 100)", /MCX profit\s*₹50,000\.00/i.test(t), seg.slice(0, 260));
  ok("net includes it", /= Net profit\s*₹50,000\.00/i.test(t));
} catch (e) { ok("no crash", false, e.message); }
finally {
  await b.close();
  await db.delete(S.mcxTrades).where(eq(S.mcxTrades.account, ACC));
  await db.delete(S.mcxCloses).where(eq(S.mcxCloses.day, DAY));
}
ok("no page errors", errors.length === 0, errors[0] ?? "");
console.log(`\n${pass} passed, ${fail} failed (test trade and 2020 close removed)`);
process.exit(fail ? 1 : 0);
