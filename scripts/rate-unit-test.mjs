import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://localhost:3940";
const sql = neon(process.env.DATABASE_URL);
const results = [];
const check = (n, ok) => { results.push(ok); console.log(`  ${ok ? "✓" : "✗"} ${n}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.goto(`${BASE}/lock`, { waitUntil: "networkidle2" });
  for (const d of ["1", "2", "3", "4"])
    await page.evaluate((x) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === x)?.click(), d);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}),
    page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Unlock"))?.click()),
  ]);
  await sleep(800);

  await page.goto(`${BASE}/bookings`, { waitUntil: "networkidle2" });
  // open the first "Mark collected" modal
  await page.evaluate(() => document.querySelector('button[title="Mark collected"]')?.click());
  await sleep(400);

  check("modal has rate unit dropdown", await page.evaluate(() => {
    const sels = [...document.querySelectorAll("select")];
    return sels.some((s) => [...s.options].some((o) => o.value === "per_g") && [...s.options].some((o) => o.value === "per_kg"));
  }));
  check("modal has 'Use current price'", await page.evaluate(() => document.body.innerText.includes("Use current price")));

  // fill rate manually and check amount reacts to unit change
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll('input[inputmode="decimal"]')].find((i) => i.value && parseFloat(i.value) === 0 ? false : true);
  });
  // set a known rate
  await page.evaluate(() => {
    const rate = [...document.querySelectorAll('input[inputmode="decimal"]')].pop();
  });
  // Use current price
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Use current price"))?.click());
  await sleep(2500);
  const liveShown = await page.evaluate(() => document.body.innerText.includes("Live ·"));
  check("live price fills in modal", liveShown);

  const amtBefore = await page.evaluate(() => {
    const m = document.body.innerText.match(/Amount[\s\S]*?₹([\d,]+)/);
    return m ? m[1] : null;
  });
  // switch unit to /g and expect amount to change
  await page.evaluate(() => {
    const sel = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "per_g"));
    if (sel) { sel.value = "per_g"; sel.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  await sleep(300);
  const amtAfter = await page.evaluate(() => {
    const m = document.body.innerText.match(/Amount[\s\S]*?₹([\d,]+)/);
    return m ? m[1] : null;
  });
  check(`amount recalcs on unit change (${amtBefore} → ${amtAfter})`, amtBefore && amtAfter && amtBefore !== amtAfter);

  // confirm and verify stored rate_unit + amount in DB
  const colBefore = (await sql`select count(*)::int n from collections`)[0].n;
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Confirm")?.click());
  await sleep(2500);
  const latest = (await sql`select rate_unit, rate_applied::float, weight_collected_g::float, amount::float from collections order by bill_number desc limit 1`)[0];
  const colAfter = (await sql`select count(*)::int n from collections`)[0].n;
  const expected = Math.round((latest.weight_collected_g * latest.rate_applied) / (latest.rate_unit === "per_kg" ? 1000 : latest.rate_unit === "per_g" ? 1 : 10) * 100) / 100;
  check(`collection stored with rate_unit=${latest?.rate_unit}`, colAfter === colBefore + 1 && !!latest.rate_unit);
  check(`stored amount matches unit math (${latest.amount} == ${expected})`, Math.abs(latest.amount - expected) < 1);

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  await browser.close();
}
