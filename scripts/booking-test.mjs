import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";
import { sealData } from "iron-session";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://localhost:3940";
const sql = neon(process.env.DATABASE_URL);
const results = [];
const check = (n, ok) => { results.push(ok); console.log(`  ${ok ? "✓" : "✗"} ${n}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REACT_SET = `(el, value) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
async function pickParty(page, name) {
  await page.evaluate((setStr) => { const set = eval(setStr); set(document.querySelector('input[placeholder="Search or add customer"]'), "Kar"); }, REACT_SET);
  await sleep(400);
  await page.evaluate((nm) => { const b = [...document.querySelectorAll("ul button")].find((x) => x.textContent.includes(nm)); b?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); }, name);
  await sleep(300);
}
const clickText = (page, t) => page.evaluate((x) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === x)?.click(), t);

try {
  const page = await browser.newPage();
  const op = (await sql`select id, name from operators where name='Ravi'`)[0];
  const sealed = await sealData({ authed: true, operatorId: op.id, operatorName: op.name, since: 1 }, { password: process.env.SESSION_SECRET });
  await page.setCookie({ name: "sw_session", value: sealed, url: BASE });
  await sql`delete from bookings`; // clean slate so checks aren't fooled by seed bookings

  await page.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" });
  await sleep(2000);

  // 1. metal booking
  const bkBefore = (await sql`select count(*)::int n from bookings`)[0].n;
  await pickParty(page, "Karthik");
  await page.evaluate((setStr) => { const set = eval(setStr); const ins = [...document.querySelectorAll("input.num")]; }, REACT_SET);
  await page.evaluate((setStr) => {
    const set = eval(setStr);
    const find = (label) => [...document.querySelectorAll("div")].find((d) => d.querySelector("span")?.textContent?.startsWith(label))?.querySelector("input");
    set(find("Weight"), "500"); set(find("Locked rate"), "7250"); set(find("Advance"), "100000");
  }, REACT_SET);
  await sleep(300);
  await clickText(page, "Save");
  let mb = null;
  for (let i = 0; i < 20; i++) { await sleep(400); mb = (await sql`select book_mode, weight_booked::float w, status from bookings order by created_at desc limit 1`)[0]; if ((await sql`select count(*)::int n from bookings`)[0].n === bkBefore + 1) break; }
  check("metal booking saved (mode=metal, w=500)", mb && mb.book_mode === "metal" && mb.w === 500 && mb.status === "open");
  check("booking WhatsApp shown", (await page.evaluate(() => document.body.innerText)).includes("WhatsApp"));

  // 2. amount booking
  await clickText(page, "Add");
  await sleep(300);
  await clickText(page, "By amount");
  await sleep(200);
  await pickParty(page, "Karthik");
  await page.evaluate((setStr) => { const set = eval(setStr); const find = (label) => [...document.querySelectorAll("div")].find((d) => d.querySelector("span")?.textContent?.startsWith(label))?.querySelector("input"); set(find("Amount"), "2000000"); }, REACT_SET);
  await sleep(300);
  await clickText(page, "Save");
  let ab = null;
  for (let i = 0; i < 20; i++) { await sleep(400); ab = (await sql`select book_mode, amount::float a from bookings where book_mode='amount' order by created_at desc limit 1`)[0]; if (ab) break; }
  check("amount booking saved (mode=amount, amt=2000000)", ab && ab.a === 2000000);

  // 3. deliver an open booking
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2000);
  const txnBefore = (await sql`select count(*)::int n from transactions`)[0].n;
  await clickText(page, "Deliver");
  await sleep(600);
  await page.evaluate((setStr) => {
    const set = eval(setStr);
    const modal = [...document.querySelectorAll("div")].find((d) => d.className.includes("fixed") && d.className.includes("inset-0"));
    const find = (label) => [...modal.querySelectorAll("div")].find((d) => d.querySelector("span")?.textContent === label)?.querySelector("input");
    set(find("Weight (g)"), "500"); set(find("Touch"), "99.5"); set(find("Rate /g"), "7250"); set(find("Cash received"), "1000000"); set(find("Bank received"), "2625000");
  }, REACT_SET);
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Deliver &"))?.click());
  let delivered = null;
  for (let i = 0; i < 25; i++) { await sleep(400); delivered = (await sql`select status, delivered_txn_id from bookings where status='delivered' limit 1`)[0]; const t = (await sql`select count(*)::int n from transactions`)[0].n; if (delivered && t === txnBefore + 1) break; }
  check("delivery created a sales transaction", (await sql`select count(*)::int n from transactions`)[0].n === txnBefore + 1);
  check("booking marked delivered + linked", delivered && delivered.status === "delivered" && !!delivered.delivered_txn_id);

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  await browser.close();
}
