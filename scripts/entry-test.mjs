import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";
import { sealData } from "iron-session";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://localhost:3940";
const sql = neon(process.env.DATABASE_URL);
const results = [];
const check = (n, ok) => { results.push(ok); console.log(`  ${ok ? "✓" : "✗"} ${n}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Set a React-controlled input's value so onChange fires.
const REACT_SET = `(el, value) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  const op = (await sql`select id, name from operators where name='Ravi'`)[0];
  const sealed = await sealData({ authed: true, operatorId: op.id, operatorName: op.name, since: 1 }, { password: process.env.SESSION_SECRET });
  await page.setCookie({ name: "sw_session", value: sealed, url: BASE });

  await page.goto(`${BASE}/entry`, { waitUntil: "domcontentloaded" });
  await sleep(2000); // hydrate

  const txnBefore = (await sql`select count(*)::int n from transactions`)[0].n;

  // pick party (Karthik Bullion — has phone)
  await page.evaluate((setStr) => {
    const set = eval(setStr);
    set(document.querySelector('input[placeholder="Search or add customer"]'), "Karthik");
  }, REACT_SET);
  await sleep(400);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("ul button")].find((b) => b.textContent.includes("Karthik"));
    btn?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await sleep(300);

  // fill first line: weight 100, rate 7250 (no touch — pure gold)
  await page.evaluate((setStr) => {
    const set = eval(setStr);
    const inputs = document.querySelectorAll("tbody tr input");
    set(inputs[1], "100");   // weight
    set(inputs[2], "7250");  // rate
  }, REACT_SET);
  await sleep(300);

  // cash received 500000, bank received 225000  (gross 725000)
  await page.evaluate((setStr) => {
    const set = eval(setStr);
    const findInput = (label) => [...document.querySelectorAll("div")].find((d) => d.querySelector("span")?.textContent === label)?.querySelector("input");
    set(findInput("Cash received"), "500000");
    set(findInput("Bank received"), "225000");
  }, REACT_SET);
  await sleep(300);

  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save entry")?.click());

  // wait for the new transaction AND its child rows to all commit
  let t = null;
  for (let i = 0; i < 25; i++) {
    await sleep(400);
    t = (await sql`select id, serial_no, tds_amount::float tds from transactions order by created_at desc limit 1`)[0];
    if (!t) continue;
    const [{ n: lc }] = await sql`select count(*)::int n from transaction_lines where transaction_id=${t.id}`;
    const [{ n: sc }] = await sql`select count(*)::int n from settlements where transaction_id=${t.id}`;
    if ((await sql`select count(*)::int n from transactions`)[0].n === txnBefore + 1 && lc >= 1 && sc >= 2) break;
  }
  const txnAfter = (await sql`select count(*)::int n from transactions`)[0].n;
  check(`transaction saved (${txnBefore}→${txnAfter})`, txnAfter === txnBefore + 1);

  const line = (await sql`select weight::float w, touch::float t, pure::float p, rate::float r, amount::float a from transaction_lines where transaction_id=${t.id}`)[0];
  check("line amount = weight × rate (100×7250=725000)", line && line.a === 725000);
  check("line pure = weight (pure gold → 100)", line && line.p === 100);

  const setls = await sql`select mode, direction, amount::float a from settlements where transaction_id=${t.id} order by mode`;
  const cash = setls.find((s) => s.mode === "cash");
  const bank = setls.find((s) => s.mode === "bank");
  check("split settlement: cash 500000 + bank 225000", cash?.a === 500000 && bank?.a === 225000);
  check("TDS auto-computed (0.1% of 725000 = 725)", Math.abs(t.tds - 725) < 1);

  check("WhatsApp confirmation shown after save", (await page.evaluate(() => document.body.innerText)).includes("WhatsApp"));

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  await browser.close();
}
