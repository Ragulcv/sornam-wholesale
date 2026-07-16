import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";
import { sealData } from "iron-session";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://localhost:3940";
const sql = neon(process.env.DATABASE_URL);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok) => { results.push(ok); console.log(`  ${ok ? "✓" : "✗"} ${n}`); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  const op = (await sql`select id, name from operators where name='Ravi'`)[0];
  await page.setCookie({ name: "sw_session", value: await sealData({ authed: true, operatorId: op.id, operatorName: op.name, since: 1 }, { password: process.env.SESSION_SECRET }), url: BASE });
  await page.goto(`${BASE}/prices`, { waitUntil: "domcontentloaded" });
  await sleep(2500);

  // read the gold per-gram number several times, 1.1s apart
  const readGold = () => page.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find((d) => /\/g$/.test(d.textContent.trim()) && /₹/.test(d.textContent) && d.className.includes("text-3xl"));
    return el ? el.textContent.replace(/[^\d]/g, "") : null;
  });
  const samples = [];
  for (let i = 0; i < 5; i++) { samples.push(await readGold()); await sleep(1100); }
  console.log("  gold/g samples:", samples.join(" → "));
  const distinct = new Set(samples.filter(Boolean)).size;
  check("gold rate flickers each second (multiple distinct values)", distinct >= 3);
  check("values stay in a tight band around the real rate (±0.1%)", (() => {
    const nums = samples.filter(Boolean).map(Number);
    if (nums.length < 2) return false;
    const lo = Math.min(...nums), hi = Math.max(...nums);
    return (hi - lo) / lo < 0.001;
  })());

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  await browser.close();
}
