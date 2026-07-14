import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";
import { sealData } from "iron-session";
import { createTransaction } from "../lib/queries/transactions.ts";
import { createBooking } from "../lib/queries/bookings.ts";
import { getStock } from "../lib/queries/stock.ts";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://localhost:3000";
const sql = neon(process.env.DATABASE_URL);
const results = [];
const check = (n, ok) => { results.push(ok); console.log(`  ${ok ? "✓" : "✗"} ${n}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickText = (page, t) => page.evaluate((x) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === x)?.click(), t);
const body = (page) => page.evaluate(() => document.body.innerText).then((s) => s.toLowerCase());

// ---- setup: deterministic 3-distinct-party dataset + over-booking to force shortfall ----
const pid = async (name) => (await sql`select id from parties where name=${name}`)[0].id;
const karthik = { id: await pid("Karthik Bullion") };
const lakshmi = { id: await pid("Lakshmi Gold House") };
const anand = { id: await pid("Anand Vendor") };
const today = new Date().toISOString().slice(0, 10);
await sql`delete from transactions`;
await createTransaction({ trnType: "sales", partyId: karthik.id, metal: "gold", txnDate: today, lines: [{ kind: "sale", weight: 30, touch: 100, rate: 14000 }], movements: [], settlements: [], operatorName: "Ravi" });
await createTransaction({ trnType: "sales", partyId: lakshmi.id, metal: "gold", txnDate: today, lines: [{ kind: "sale", weight: 25, touch: 100, rate: 14000 }], movements: [], settlements: [], operatorName: "Ravi" });
await createTransaction({ trnType: "purchase", partyId: anand.id, metal: "gold", txnDate: today, lines: [{ kind: "purchase", weight: 40, touch: 100, rate: 14000 }], movements: [], settlements: [], operatorName: "Ravi" });
const stock = await getStock();
const overWeight = Math.round(stock.currentPureGold + 500); // guarantees booked > available
await sql`delete from bookings where notes='__pie_test__'`;
await createBooking({ partyId: karthik.id, metal: "gold", bookMode: "metal", weightBooked: overWeight, lockedRate: 14000, operatorName: "Ravi", notes: "__pie_test__" });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  const op = (await sql`select id, name from operators where name='Ravi'`)[0];
  await page.setCookie({ name: "sw_session", value: await sealData({ authed: true, operatorId: op.id, operatorName: op.name, since: 1 }, { password: process.env.SESSION_SECRET }), url: BASE });

  // ---- A. History party autosuggest datalist ----
  await page.goto(`${BASE}/history`, { waitUntil: "domcontentloaded" });
  await sleep(2000);
  const suggest = await page.evaluate(() => {
    const dl = document.querySelector("datalist#party-suggest");
    return dl ? [...dl.querySelectorAll("option")].map((o) => o.value) : null;
  });
  check("party search has autosuggest datalist", !!suggest && suggest.length > 0);
  check("autosuggest lists real party names (Karthik Bullion)", !!suggest && suggest.includes("Karthik Bullion"));

  // ---- B. Multi-party combine → warning, then bill-to prompt ----
  await page.goto(`${BASE}/history`, { waitUntil: "domcontentloaded" });
  await sleep(2000);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button[role="checkbox"]')]; b[1]?.click(); b[2]?.click(); });
  await sleep(400);
  await clickText(page, "Create bill");
  await sleep(600);
  const warnText = await body(page);
  check("combining different parties shows a warning (not a silent merge)", warnText.includes("multiple parties"));
  check("warning offers to pick which party to bill", warnText.includes("bill to"));
  // pick Karthik → should land on bill billed to Karthik with combined note
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Bill to"))?.click());
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("combined bill"), { timeout: 12000 }).catch(() => {});
  const billText = await body(page);
  check("multi-party bill renders a combined bill", billText.includes("combined bill"));
  check("multi-party bill notes it's combined across parties", billText.includes("across multiple parties"));

  // ---- C. Same-party combine proceeds directly (no warning) ----
  // add a 2nd Karthik sale so there's a same-party pair to combine
  await createTransaction({ trnType: "sales", partyId: karthik.id, metal: "gold", txnDate: today, lines: [{ kind: "sale", weight: 15, touch: 100, rate: 14000 }], movements: [], settlements: [], operatorName: "Ravi" });
  await page.goto(`${BASE}/history?q=${encodeURIComponent("Karthik Bullion")}`, { waitUntil: "domcontentloaded" });
  await sleep(2000);
  const karthikRows = await page.evaluate(() => [...document.querySelectorAll('button[role="checkbox"]')].length - 1);
  check("history search filters to Karthik rows (≥2)", karthikRows >= 2);
  await page.evaluate(() => document.querySelector('button[role="checkbox"]')?.click()); // select-all header
  await sleep(400);
  await clickText(page, "Create bill");
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("combined bill"), { timeout: 12000 }).catch(() => {});
  const sameText = await body(page);
  check("same-party combine skips the warning and bills directly", sameText.includes("combined bill") && !sameText.includes("multiple parties"));

  // ---- D. Bookings stock-vs-booked pie + shortfall ----
  await page.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" });
  await sleep(2000);
  const bkText = await body(page);
  check("bookings page shows a stock-vs-booked chart", bkText.includes("stock vs booked"));
  check("chart flags a shortfall when bookings exceed stock", bkText.includes("short by") && bkText.includes("add this much"));

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  await browser.close();
  await sql`delete from bookings where notes='__pie_test__'`;
}
