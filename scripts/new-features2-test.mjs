import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";
import { sealData } from "iron-session";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://localhost:3940";
const sql = neon(process.env.DATABASE_URL);
const results = [];
const check = (n, ok) => { results.push(ok); console.log(`  ${ok ? "✓" : "✗"} ${n}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RS = `(el, value) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); }`;
const clickText = (page, t) => page.evaluate((x) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === x)?.click(), t);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  const op = (await sql`select id, name from operators where name='Ravi'`)[0];
  await page.setCookie({ name: "sw_session", value: await sealData({ authed: true, operatorId: op.id, operatorName: op.name, since: 1 }, { password: process.env.SESSION_SECRET }), url: BASE });

  // ---- A. New customer on the fly (booking) ----
  await sql`delete from parties where name='Brand New Cust XYZ'`;
  await page.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" });
  await sleep(2000);
  await page.evaluate((s) => { const set = eval(s); set(document.querySelector('input[placeholder="Search or add customer"]'), "Brand New Cust XYZ"); }, RS);
  await sleep(300);
  await page.evaluate((s) => {
    const set = eval(s);
    const find = (l) => [...document.querySelectorAll("div")].find((d) => d.querySelector("span")?.textContent?.startsWith(l))?.querySelector("input");
    set(find("Phone"), "9333300001"); set(find("Weight"), "100"); set(find("Locked rate"), "14740");
  }, RS);
  await sleep(300);
  await clickText(page, "Save");
  let created = null;
  for (let i = 0; i < 20; i++) { await sleep(400); created = (await sql`select id from parties where name='Brand New Cust XYZ'`)[0]; if (created) break; }
  check("typing a new customer auto-creates the party", !!created);
  const bk = created ? (await sql`select count(*)::int n from bookings where party_id=${created.id}`)[0].n : 0;
  check("booking saved for the new customer", bk === 1);

  // ---- B. Live rate button (entry) ----
  await page.goto(`${BASE}/entry`, { waitUntil: "domcontentloaded" });
  await sleep(2000);
  await clickText(page, "Live");
  await sleep(2500);
  const barRate = await page.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find((d) => d.querySelector("span")?.textContent === "Bar rate /g")?.querySelector("input");
    return el?.value;
  });
  check(`Live button fills MCX rate (${barRate})`, parseFloat(barRate) > 1000);

  // ---- C. History: create bill from selected + multi-delete ----
  await page.goto(`${BASE}/history`, { waitUntil: "domcontentloaded" });
  await sleep(2000);
  // select first two data rows (skip header checkbox at index 0)
  await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('button[role="checkbox"]')];
    boxes[1]?.click(); boxes[2]?.click();
  });
  await sleep(400);
  check("selection toolbar shows Create bill", (await page.evaluate(() => document.body.innerText)).includes("Create bill"));
  await clickText(page, "Create bill");
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("combined bill"), { timeout: 12000 }).catch(() => {});
  const billText = await page.evaluate(() => document.body.innerText).then((s) => s.toLowerCase());
  check("combined bill page clubs the entries", billText.includes("combined bill") && billText.includes("total"));

  // multi-delete
  const txnBefore = (await sql`select count(*)::int n from transactions`)[0].n;
  await page.goto(`${BASE}/history`, { waitUntil: "domcontentloaded" });
  await sleep(2000);
  await page.evaluate(() => { const b = document.querySelector('button[role="checkbox"]'); b?.click(); }); // select all
  await sleep(400);
  await clickText(page, "Delete selected");
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Delete \d+$/.test(b.textContent.trim()))?.click());
  await sleep(2500);
  const txnAfter = (await sql`select count(*)::int n from transactions`)[0].n;
  check(`multi-select delete removed all (${txnBefore}→${txnAfter})`, txnAfter === 0);

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  await browser.close();
}
