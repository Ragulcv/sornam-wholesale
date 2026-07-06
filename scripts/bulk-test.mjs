import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";
import { execSync } from "node:child_process";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://localhost:3940";
const sql = neon(process.env.DATABASE_URL);
const results = [];
const check = (n, ok) => { results.push(ok); console.log(`  ${ok ? "✓" : "✗"} ${n}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reseed = () => execSync("npm run db:seed", { stdio: "ignore" });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
async function login() {
  await page.goto(`${BASE}/lock`, { waitUntil: "networkidle2" });
  for (const d of ["1", "2", "3", "4"])
    await page.evaluate((x) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === x)?.click(), d);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}),
    page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Unlock"))?.click()),
  ]);
  await sleep(800);
}
async function selectAllAndDelete() {
  // first role=checkbox is the toolbar select-all
  await page.evaluate(() => document.querySelector('button[role="checkbox"]')?.click());
  await sleep(200);
  const label = await page.evaluate(() => document.body.innerText.match(/(\d+) selected/)?.[0] || "");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Delete selected")?.click());
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Delete \d+$/.test(b.textContent.trim()))?.click());
  await sleep(2500);
  return label;
}

try {
  await login();

  // ---- Bookings: select all, delete all ----
  reseed();
  await page.goto(`${BASE}/bookings`, { waitUntil: "networkidle2" });
  check("bookings has select-all checkbox", await page.evaluate(() => !!document.querySelector('button[role="checkbox"]')));
  const bLabel = await selectAllAndDelete();
  const bLeft = (await sql`select count(*)::int n from bookings`)[0].n;
  check(`bookings bulk delete-all (${bLabel} → ${bLeft} left)`, bLeft === 0);

  // ---- Transactions: select all, delete all, verify recompute ----
  reseed();
  await page.goto(`${BASE}/transactions`, { waitUntil: "networkidle2" });
  const tLabel = await selectAllAndDelete();
  const cLeft = (await sql`select count(*)::int n from collections`)[0].n;
  const orphans = (await sql`select count(*)::int n from bookings where status in ('partial','completed') and not exists (select 1 from collections c where c.booking_id=bookings.id)`)[0].n;
  check(`transactions bulk delete-all (${tLabel} → ${cLeft} left)`, cLeft === 0);
  check("bookings recomputed to open after bulk collection delete", orphans === 0);

  // ---- Customers: select all seed (all have bookings) → all skipped ----
  reseed();
  await page.goto(`${BASE}/customers`, { waitUntil: "networkidle2" });
  await selectAllAndDelete();
  await sleep(300);
  const custLeft = (await sql`select count(*)::int n from customers`)[0].n;
  const keptMsg = await page.evaluate(() => document.body.innerText.includes("kept (have bookings)"));
  check("customers with bookings are kept on bulk delete", custLeft === 6 && keptMsg);

  reseed();
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  await browser.close();
}
