import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";
import { sealData } from "iron-session";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://localhost:3940";
const sql = neon(process.env.DATABASE_URL);
const results = [];
const check = (n, ok) => { results.push(ok); console.log(`  ${ok ? "✓" : "✗"} ${n}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickText = (page, t) => page.evaluate((x) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === x)?.click(), t);
const body = (page) => page.evaluate(() => document.body.innerText);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  const op = (await sql`select id, name from operators where name='Ravi'`)[0];
  await page.setCookie({ name: "sw_session", value: await sealData({ authed: true, operatorId: op.id, operatorName: op.name, since: 1 }, { password: process.env.SESSION_SECRET }), url: BASE });

  // proxy routes reachable?
  await page.goto(`${BASE}/api/mcx/current`, { waitUntil: "domcontentloaded" });
  const cur = await page.evaluate(() => document.body.innerText);
  check("proxy /api/mcx/current returns live price", /"per_gram"/.test(cur) && /"gold"/.test(cur));

  await page.goto(`${BASE}/prices`, { waitUntil: "domcontentloaded" });
  await sleep(2500);
  const t1 = await body(page);
  check("page shows the MCX Price Tracker heading", /mcx price tracker/i.test(t1));
  check("live board shows a gold ₹ rate per gram", /₹[\d,]+\s*\/g/.test(t1) && /Gold/.test(t1));
  check("live board shows silver", /Silver/.test(t1));

  // history chart populated (default 24h; feed has been running a while)
  const svgPts = await page.evaluate(() => {
    const p = document.querySelector("svg path[stroke]");
    return p ? (p.getAttribute("d") || "").length : 0;
  });
  check("history chart rendered an SVG line path", svgPts > 20);
  const pointCount = await page.evaluate(() => {
    const m = document.body.innerText.match(/(\d+)\s+points?/);
    return m ? parseInt(m[1], 10) : -1;
  });
  check(`history has data points (${pointCount})`, pointCount > 0);

  // point-in-time lookup: default datetime is "now"; Get price
  await clickText(page, "Get price");
  await sleep(2500);
  const t2 = await body(page);
  check("point-in-time lookup returns a per-gram price", /per gram/i.test(t2) && /nearest recorded tick/i.test(t2));

  // availability hint shows the earliest recorded time
  check("shows the 'available from' range hint", /recorded prices available from/i.test(t2));

  // out-of-range lookup: pick a time before the feed started → informative msg
  const RS = `(el, value) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); }`;
  await page.evaluate((s) => {
    const set = eval(s);
    const inp = [...document.querySelectorAll('input[type="datetime-local"]')][0];
    set(inp, "2026-07-01T10:00");
  }, RS);
  await sleep(300);
  await clickText(page, "Get price");
  await sleep(2500);
  const t3 = await body(page);
  check("out-of-range lookup explains when data starts", /feed has data from/i.test(t3));

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  await browser.close();
}
