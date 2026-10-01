// Full QA pass on live staging, through the real screens, for every area not
// already covered by the guide tests. Everything it creates is named "QA ..."
// (or dated 2020) and removed at the end; the tester's own data is untouched.
import puppeteer from "puppeteer-core";
import { sealData } from "iron-session";
import ExcelJS from "exceljs";
const BASE = "https://sornam-wholesale-staging.vercel.app";
const XLSX = "/Users/ragul/Downloads/Copy of Copy of L K B BOOKING.xlsx";
const W = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0; const failures = [];
const ok = (l, c, d = "") => { c ? pass++ : (fail++, failures.push(`${l}${d ? ` (${d})` : ""}`)); console.log(`  ${c ? "ok  " : "FAIL"} ${l}${d ? ` — ${d}` : ""}`); };
const section = async (name, fn) => { console.log(`\n[${name}]`); try { await fn(); } catch (e) { ok(`${name}: ran to the end`, false, e.message.slice(0, 160)); } };

const { db } = await import("../lib/db/index.ts"); const S = await import("../lib/db/schema.ts");
const { eq, inArray, gte, and, like } = await import("drizzle-orm");
const bk = await import("../lib/queries/bookings.ts");
const { findOrCreateParty } = await import("../lib/queries/parties.ts");
const n = (v) => (v == null ? 0 : parseFloat(v));
const START = new Date();
const todayIST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const partiesBefore = new Set((await db.select({ name: S.parties.name }).from(S.parties)).map((r) => r.name));
const stockBefore = (await db.select().from(S.stock).where(eq(S.stock.id, 1)))[0];

const buyer = await findOrCreateParty("QA Buyer", "9000000101");
const seller = await findOrCreateParty("QA Seller", "9000000102");
const sellBk = await bk.createBooking({ partyId: buyer, bookType: "ready", side: "sell", metal: "gold", weight: 100, rate: 15000, mcxRate: 148000, operatorName: "qa" });
const buyBk = await bk.createBooking({ partyId: seller, bookType: "ready", side: "buy", metal: "gold", weight: 50, rate: 14000, mcxRate: 148000, operatorName: "qa" });

const [op] = await db.select().from(S.operators).limit(1);
const sealed = await sealData({ authed: true, operatorId: op.id, operatorName: op.name, since: Date.now() }, { password: process.env.SESSION_SECRET });
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const p = await browser.newPage(); await p.setViewport({ width: 1440, height: 1000 });
const errors = []; p.on("pageerror", (e) => errors.push(`${p.url().replace(BASE, "")}: ${e.message.slice(0, 100)}`));
await p.setCookie({ name: "sw_session", value: sealed, url: BASE });

const go = async (path) => { await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" }); await p.waitForFunction(() => [...document.querySelectorAll("button,a")].some((x) => Object.keys(x).some((k) => k.startsWith("__react"))), { timeout: 45000 }).catch(() => {}); await W(1500); };
const text = () => p.evaluate(() => document.body.innerText);
const click = (label, nth = 0) => p.evaluate((l, n) => { const xs = [...document.querySelectorAll("button,a")].filter((b) => b.textContent.trim() === l); xs[n]?.click(); return xs.length > n; }, label, nth);
const setInput = (sel, v, idx = 0) => p.evaluate((sel, v, idx) => { const el = document.querySelectorAll(sel)[idx]; if (!el) return false; const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); return true; }, sel, v, idx);
const setByLabel = (lab, v) => p.evaluate((lab, v) => { const sp = [...document.querySelectorAll("span")].find((x) => x.textContent.trim() === lab); let el = sp?.nextElementSibling; while (el && el.tagName !== "INPUT") el = el.querySelector?.("input") ?? el.nextElementSibling; if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); return true; }, lab, v);
const box = (lab) => p.evaluate((l) => { const sp = [...document.querySelectorAll("span")].find((x) => x.textContent.trim() === l); const out = []; let el = sp?.nextElementSibling; while (el && out.length < 2) { const i = el.tagName === "INPUT" ? el : el.querySelector?.("input"); if (i && i.readOnly) out.push(i.value); el = el.nextElementSibling; } return out; }, lab);
const saveEntry = async () => { await click("Save"); await p.waitForFunction(() => /Saved\. Bill No\. \d+|Bill No\. \d+ updated/.test(document.body.innerText), { timeout: 30000 }).catch(() => {}); await W(800); const t = await text(); await click("Not now"); return Number((t.match(/Bill No\. (\d+)/) || [])[1]); };
const booking = async (id) => (await bk.getBooking(id));
let partialBill = null;

await section("A. Partial delivery from a booking", async () => {
  await go(`/entry?booking=${sellBk.id}`);
  await click("Del");                                    // drop the pre-filled 100 g row
  await setInput('select[title^="Pick a pending booking"]', sellBk.id); await W(400);
  await setInput('input[placeholder="Weight"]', "40"); await W(200);
  await p.focus('input[placeholder="Weight"]'); await p.keyboard.press("Enter"); await W(500);
  const t = await text();
  ok("row added: 40 g of booking No." + sellBk.serialNo, new RegExp(`No\\.${sellBk.serialNo}[\\s\\S]{0,60}40\\.000`).test(t));
  await setByLabel("Bank Recd", "600000"); await W(400);
  const c = await box("Clsg. Bal."); ok("40 g x 15000 = 600000 received, Clsg 0.00", c[1] === "0.00", c.join(" | "));
  partialBill = await saveEntry(); ok("saved", partialBill > 0, `bill ${partialBill}`);
  const b = await booking(sellBk.id);
  ok("booking: delivered 40, pending 60, PARTIAL", n(b.delivered) === 40 && n(b.pending) === 60 && b.status === "partial", `${b.delivered}/${b.pending} ${b.status}`);
  await go("/bookings"); await click("R SELL"); await W(600);
  const row = await p.evaluate(() => [...document.querySelectorAll("tr")].find((r) => r.innerText.includes("QA Buyer"))?.innerText.replace(/\s+/g, " ") ?? "");
  ok("bookings sheet shows 40 delivered / 60 pending / PARTIAL with Bill still offered", /40\.000\s+60\.000/.test(row) && /PARTIAL/i.test(row) && /Bill/.test(row), row.slice(0, 110));
});

await section("B. Find a bill by number and Update it", async () => {
  await go("/entry");
  await setInput('input[placeholder="Bill No."]', String(partialBill)); await click("Find"); await W(2500);
  let t = await text();
  ok("loads for editing", t.includes(`Editing bill No. ${partialBill}`) && t.includes("QA Buyer"));
  ok("Save button now says Update", await p.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Update")));
  const c = await box("Clsg. Bal."); ok("reloads settled (Clsg 0.00), not falsely unsettled", c[1] === "0.00", c.join(" | "));
  await click("Update"); await p.waitForFunction(() => /updated/.test(document.body.innerText), { timeout: 30000 }).catch(() => {}); await W(600); await click("Not now");
  const b = await booking(sellBk.id);
  ok("updating does not double-count the delivery (still 40)", n(b.delivered) === 40, `${b.delivered}`);
});

await section("C. Find by date", async () => {
  await go("/entry");
  await setInput('input[type="date"]', todayIST, 0); await click("Find"); await W(2500);
  const t = await text();
  ok("lists the day's bills", /Bills on/.test(t) && t.includes("QA Buyer"));
  const loaded = await p.evaluate((no) => { const row = [...document.querySelectorAll("tr")].find((r) => r.querySelector("td")?.textContent.trim() === String(no)); const b = row?.querySelector("button"); b?.click(); return !!b; }, partialBill);
  await W(2500);
  ok("Load opens that bill", loaded && (await text()).includes(`Editing bill No. ${partialBill}`));
  await click("Cancel"); await W(400);
});

await section("D. Print slip", async () => {
  const txn = (await db.select().from(S.transactions).where(eq(S.transactions.serialNo, partialBill)))[0];
  const r = await p.evaluate(async (u) => { const x = await fetch(u); return { s: x.status, t: await x.text() }; }, `/history/${txn.id}`);
  ok("print page opens", r.s === 200 && r.t.includes("QA Buyer"), `${r.s}`);
});

await section("E. Deleting a delivered bill hands the grams back", async () => {
  await go(`/history?q=QA%20Buyer`);
  const ticked = await p.evaluate((no) => { const row = [...document.querySelectorAll("tr")].find((r) => r.innerText.includes(String(no).padStart(4, "0"))); const cb = row?.querySelector("input[type=checkbox], button[role=checkbox], [aria-checked]"); (cb ?? row?.querySelector("td"))?.click(); return !!row; }, partialBill);
  await W(500); await click("Delete selected"); await W(400); await click("Delete 1"); await W(3500);
  const gone = (await db.select().from(S.transactions).where(eq(S.transactions.serialNo, partialBill))).length === 0;
  ok("bill deleted from History", ticked && gone);
  const b = await booking(sellBk.id);
  ok("booking back to OPEN, pending 100", n(b.delivered) === 0 && n(b.pending) === 100 && b.status === "open", `${b.delivered}/${b.pending} ${b.status}`);
});

await section("F. Purchase from a BUY booking", async () => {
  await go("/bookings"); await click("R BUY"); await W(600);
  const href = await p.evaluate(() => [...document.querySelectorAll("tr")].find((r) => r.innerText.includes("QA Seller"))?.querySelector('a[href*="/entry?booking="]')?.getAttribute("href") ?? null);
  ok("BUY booking offers a Purchase button", !!href && (await p.evaluate(() => [...document.querySelectorAll("tr")].find((r) => r.innerText.includes("QA Seller"))?.innerText.includes("Purchase"))));
  await go(href);
  let t = await text();
  ok("entry opens in PURCHASE mode, prefilled 50 g", t.includes("PURCHASE ENTRIES") && /50\.000/.test(t) && t.includes("M.C. Cash Paid"));
  await setByLabel("M.C. Cash Paid", "700000"); await W(400);
  const c = await box("Clsg. Bal."); ok("50 g x 14000 paid in full, Clsg 0.00", c[1] === "0.00", c.join(" | "));
  const no = await saveEntry();
  const txn = (await db.select().from(S.transactions).where(eq(S.transactions.serialNo, no)))[0];
  const st = await db.select().from(S.settlements).where(eq(S.settlements.transactionId, txn.id));
  ok("stored as cash PAID 700000 (not received)", st.length === 1 && st[0].direction === "paid" && n(st[0].amount) === 700000);
  const b = await booking(buyBk.id);
  ok("BUY booking delivered", b.status === "delivered" && n(b.pending) === 0);
  const acct = await (await import("../lib/queries/partyLedger.ts")).getCarryForward(seller);
  ok("supplier account settled (0.00)", Math.abs(acct.cash) < 0.01, `${acct.cash}`);
});

await section("G. Excel import with their real workbook", async () => {
  await go("/bookings/import");
  const input = await p.$('input[type="file"]'); await input.uploadFile(XLSX); await W(500);
  await click("Preview"); await p.waitForFunction(() => /Import 4 booking/.test(document.body.innerText), { timeout: 30000 }).catch(() => {});
  let t = await text();
  ok("preview: 4 bookings + lot positions", /Import 4 booking/.test(t) && /Suresh/.test(t) && /MCX ID 2/.test(t));
  ok("preview recalculates PREMIUM (486.20) and PENDING", t.includes("486.20") && t.includes("1000.000"));
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Import 4 booking/.test(b.textContent.trim()))?.click());
  await p.waitForFunction(() => /Imported \d+ booking/.test(document.body.innerText), { timeout: 45000 }).catch(() => {});
  t = await text();
  ok("import done", /Imported 4 booking\(s\)/.test(t), (t.match(/Imported[^\n]*/) || [""])[0]);
  const trades = await db.select().from(S.mcxTrades).where(gte(S.mcxTrades.createdAt, START));
  ok("their MCX IDs became opening trades flagged 'add the price'", trades.filter((x) => x.price == null).length === 2, trades.map((x) => `${x.account} ${x.side} ${x.lots}`).join(", "));
});

await section("H. Excel export", async () => {
  const buf = await p.evaluate(async () => { const r = await fetch("/api/bookings/export"); return { s: r.status, ct: r.headers.get("content-type"), b: Array.from(new Uint8Array(await r.arrayBuffer())) }; });
  ok("downloads", buf.s === 200 && buf.ct.includes("spreadsheetml"));
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(buf.b));
  const names = wb.worksheets.map((w) => w.name);
  ok("all their sheets + MCX TRADES", ["R SELL", "R BUY", "F SELL", "F BUY", "UF CUS", "- OR +", "MCX TRADES"].every((x) => names.includes(x)), names.join(", "));
  ok("formulas intact (PENDING, PREMIUM, lots, hedge)", wb.getWorksheet("R SELL").getCell("F2").formula === "C2-E2" && wb.getWorksheet("R SELL").getCell("H2").formula === "D2-G2*0.1" && wb.getWorksheet("- OR +").getCell("K14").formula === "SUM(K11:K13)");
});

await section("I. Parties: add, edit, delete", async () => {
  await go("/parties");
  await setInput('input[name="name"]', "QA Party Temp"); await setInput('input[name="phone"]', "9000000199");
  await click("Save"); await W(3000);
  ok("added", (await text()).includes("QA Party Temp"));
  await p.evaluate(() => { const row = [...document.querySelectorAll("div")].reverse().find((d) => d.innerText?.startsWith("QA Party Temp") && d.querySelector("button")); [...(row?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === "Edit")?.click(); }); await W(800);
  await setInput('input[name="phone"]', "9000000188"); await click("Save"); await W(3000);
  const row = (await db.select().from(S.parties).where(eq(S.parties.name, "QA Party Temp")))[0];
  ok("edited (phone changed, no duplicate)", row?.phone === "9000000188" && (await db.select().from(S.parties).where(eq(S.parties.name, "QA Party Temp"))).length === 1, row?.phone);
  await p.evaluate(() => { const row = [...document.querySelectorAll("div")].reverse().find((d) => d.innerText?.startsWith("QA Party Temp") && d.querySelector("button")); [...(row?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === "Del")?.click(); }); await W(400);
  await click("Delete"); await W(3000);
  ok("deleted", (await db.select().from(S.parties).where(eq(S.parties.name, "QA Party Temp"))).length === 0);
});

await section("J. Stock opening balances flow into History and the daily tally", async () => {
  await go("/stock");
  const { getDailyTally } = await import("../lib/queries/dailyTally.ts");
  const { getOpeningBalance } = await import("../lib/queries/historyBalances.ts");
  const closeBefore = (await getDailyTally()).find((d) => d.date === todayIST)?.closingCash ?? 0;
  const openBefore = (await getOpeningBalance()).cash;
  const newOpening = n(stockBefore.openingCash) + 234000;
  await setInput('input[name="openingCash"]', String(newOpening)); await click("Save opening balances"); await W(3000);
  ok("saved", (await text()).includes("Saved."));
  const closeAfter = (await getDailyTally()).find((d) => d.date === todayIST)?.closingCash ?? 0;
  ok("daily tally closing cash moves by exactly +2,34,000", Math.abs(closeAfter - closeBefore - 234000) < 0.01, `${closeBefore} -> ${closeAfter}`);
  const openAfter = (await getOpeningBalance()).cash;
  ok("History's Opg. Bal cash moves by exactly +2,34,000", Math.abs(openAfter - openBefore - 234000) < 0.01, `${openBefore} -> ${openAfter}`);
  await db.update(S.stock).set({ openingCash: stockBefore.openingCash, openingBank: stockBefore.openingBank, openingPureGold: stockBefore.openingPureGold, openingPureSilver: stockBefore.openingPureSilver }).where(eq(S.stock.id, 1));
});

await section("K. History filters, party search, CSV", async () => {
  await go("/history?type=purchase"); let t = await text();
  ok("type filter: purchases only", t.includes("Purchase") && !/\n0010\s+Sales/.test(t));
  await go(`/history?q=${encodeURIComponent("Test Anand")}`); t = await text();
  ok("party search: Test Anand's 2 bills", /2 entries/.test(t), (t.match(/\d+ entries/) || [""])[0]);
  const csv = await p.evaluate(async () => { const r = await fetch("/api/export/transactions"); return { s: r.status, ct: r.headers.get("content-type"), t: (await r.text()).split("\n").length }; });
  ok("CSV export", csv.s === 200 && /csv/.test(csv.ct) && csv.t > 2, `${csv.t} lines`);
});

await section("L. Combine bills into one slip", async () => {
  const ids = (await db.select().from(S.transactions).where(inArray(S.transactions.serialNo, [10, 11]))).map((x) => x.id);
  const r = await p.evaluate(async (u) => { const x = await fetch(u); return { s: x.status, t: await x.text() }; }, `/history/bill?ids=${ids.join(",")}`);
  ok("combined slip for Test Anand's bills 10 + 11", r.s === 200 && r.t.includes("Test Anand") && /2,25,000|225000/.test(r.t), `${r.s}`);
});

await section("M. MCX trade: edit and delete through the screen", async () => {
  await go("/bookings"); await click("MCX TRADES"); await W(800);
  const L = (x) => `[aria-label="${x}"]`;
  await setInput(L("Trade date"), "2020-03-02"); await setInput(L("MCX ID"), "QA-ACC"); await setInput(L("Buy or sell"), "sell"); await setInput(L("Lots"), "2"); await setInput(L("Price per 10 g"), "150000"); await W(200);
  await click("Add"); await W(3500);
  ok("added: SELL 2", /QA-ACC\s+SELL 2\.000/.test(await text()));
  await p.evaluate(() => [...document.querySelectorAll("tr")].find((r) => r.innerText.includes("QA-ACC") && r.innerText.includes("Edit"))?.querySelectorAll("button")[0]?.click()); await W(500);
  await p.evaluate(() => { const row = document.querySelector("tr.bg-\\[\\#fffbe6\\]"); const ins = row.querySelectorAll('input[inputmode="decimal"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(ins[1], "149000"); ins[1].dispatchEvent(new Event("input", { bubbles: true })); });
  await click("Save"); await W(3500);
  const tr = (await db.select().from(S.mcxTrades).where(eq(S.mcxTrades.account, "QA-ACC")))[0];
  ok("edited price saved", n(tr?.price) === 149000, tr?.price);
  await p.evaluate(() => [...document.querySelectorAll("tr")].find((r) => r.innerText.includes("QA-ACC") && r.innerText.includes("Del"))?.querySelectorAll("button")[1]?.click()); await W(3500);
  ok("deleted", (await db.select().from(S.mcxTrades).where(eq(S.mcxTrades.account, "QA-ACC"))).length === 0);
});

await section("N. Today page", async () => {
  await go("/"); const t = await text();
  const want = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  ok("shows India's date", t.includes(want), want);
});

await section("O. Phone width (390 px): no sideways page scroll", async () => {
  // measured against 390 itself: a mobile browser silently widens its window to
  // fit an oversized page, so comparing to window.innerWidth hides overflow
  await p.setViewport({ width: 390, height: 844 });
  for (const path of ["/", "/entry", "/bookings", "/expenses", "/history", "/pnl", "/stock", "/parties", "/settings", "/prices"]) {
    await go(path);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(`${path.padEnd(10)} fits a 390 px phone`, sw <= 391, `${sw}px`);
  }
  await go("/");
  ok("menu button for the drawer", await p.evaluate(() => !!document.querySelector('[aria-label="Open menu"]')));
  await p.setViewport({ width: 1440, height: 1000 });
});

await section("P. Real login with the PIN, and signed-out protection", async () => {
  const ctx = await browser.createBrowserContext(); const q = await ctx.newPage(); await q.setViewport({ width: 1200, height: 900 });
  await q.goto(`${BASE}/entry`, { waitUntil: "domcontentloaded" });
  ok("signed out: /entry sends you to the lock screen", q.url().includes("/lock"), q.url().replace(BASE, ""));
  await q.waitForFunction(() => [...document.querySelectorAll("button")].some((x) => Object.keys(x).some((k) => k.startsWith("__react"))), { timeout: 45000 }); await W(800);
  for (const d of "1234") { await q.evaluate((d) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === d)?.click(), d); await W(120); }
  await q.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Unlock")?.click());
  await q.waitForFunction(() => /Ravi|Suresh|Meena/.test(document.body.innerText), { timeout: 30000 }).catch(() => {});
  ok("PIN 1234 unlocks and asks who is working", /Ravi/.test(await q.evaluate(() => document.body.innerText)));
  await q.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Ravi"))?.click());
  await q.waitForFunction(() => location.pathname === "/", { timeout: 30000 }).catch(() => {}); await W(1500);
  ok("picking Ravi opens the app", new URL(q.url()).pathname === "/" && /Today/.test(await q.evaluate(() => document.body.innerText)));
  await ctx.close();
  for (const u of ["/api/backup/status", "/api/bookings/export", "/api/export/transactions", "/history"]) {
    const r = await fetch(`${BASE}${u}`, { redirect: "manual" });
    ok(`signed out: ${u} is refused`, r.status === 307 || r.status === 401, `${r.status}`);
  }
});

ok("no page errors anywhere in this pass", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();

// ---- cleanup: only what this pass created ----
const qaParties = (await db.select().from(S.parties).where(like(S.parties.name, "QA %"))).map((r) => r.id);
const newImported = (await db.select().from(S.parties)).filter((r) => !partiesBefore.has(r.name) && r.createdAt >= START).map((r) => r.id);
const kill = [...new Set([...qaParties, ...newImported])];
if (kill.length) { await db.delete(S.transactions).where(inArray(S.transactions.partyId, kill)); await db.delete(S.bookings).where(inArray(S.bookings.partyId, kill)); await db.delete(S.parties).where(inArray(S.parties.id, kill)); }
await db.delete(S.mcxPositions).where(gte(S.mcxPositions.createdAt, START));
await db.delete(S.mcxTrades).where(gte(S.mcxTrades.createdAt, START));
await db.delete(S.bookings).where(gte(S.bookings.createdAt, START));
console.log(`\ncleaned up: ${kill.length} QA/imported customers and everything created after ${START.toISOString()}`);
console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  - " + failures.join("\n  - "));
process.exit(fail ? 1 : 0);
