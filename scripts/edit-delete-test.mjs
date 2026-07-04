import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://localhost:3940";
const sql = neon(process.env.DATABASE_URL);
const results = [];
const check = (n, ok) => { results.push(ok); console.log(`  ${ok ? "✓" : "✗"} ${n}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Direct DB unit check: deleting a collection recomputes booking status.
{
  const b = (await sql`select b.id, b.status from bookings b join collections c on c.booking_id=b.id where b.status='partial' limit 1`)[0];
  const col = (await sql`select id from collections where booking_id=${b.id} limit 1`)[0];
  // simulate what deleteCollection does is covered by the app; here just verify
  // the app endpoint path via UI below. This block only sanity-checks fixtures.
  check("fixture: a partial booking with a collection exists", !!b && !!col);
}

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

  // ---- Transaction delete ----
  await page.goto(`${BASE}/transactions`, { waitUntil: "networkidle2" });
  check("transaction delete icon present", await page.evaluate(() => !!document.querySelector('button[title="Delete transaction"]')));
  const colBefore = (await sql`select count(*)::int n from collections`)[0].n;
  await page.evaluate(() => document.querySelector('button[title="Delete transaction"]')?.click());
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Delete")?.click());
  await sleep(2500);
  const colAfter = (await sql`select count(*)::int n from collections`)[0].n;
  check(`transaction deleted in DB (${colBefore}→${colAfter})`, colAfter === colBefore - 1);
  // status recompute: no booking should be 'partial'/'completed' with 0 collections
  const orphan = (await sql`select count(*)::int n from bookings b where b.status in ('partial','completed') and not exists (select 1 from collections c where c.booking_id=b.id)`)[0].n;
  check("booking status recomputed after delete (no orphan partial/completed)", orphan === 0);

  // ---- Customer edit ----
  await page.goto(`${BASE}/customers`, { waitUntil: "networkidle2" });
  check("customer edit icon present", await page.evaluate(() => !!document.querySelector('button[title="Edit customer"]')));
  await page.evaluate(() => document.querySelector('button[title="Edit customer"]')?.click());
  await sleep(400);
  const modalOpen = await page.evaluate(() => document.body.innerText.includes("Edit customer") && !!document.querySelector('input[name="name"]'));
  check("edit modal opens with prefilled form", modalOpen);
  await page.evaluate(() => {
    const inp = document.querySelector('input[name="name"]');
    inp.value = "";
  });
  await page.type('input[name="name"]', "Edited Customer Xyz");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save")?.click());
  await sleep(2500);
  await page.reload({ waitUntil: "networkidle2" });
  const showsEdited = await page.evaluate(() => document.body.innerText.includes("Edited Customer Xyz"));
  const dbEdited = (await sql`select count(*)::int n from customers where name='Edited Customer Xyz'`)[0].n;
  check("customer name edited (UI + DB)", showsEdited && dbEdited === 1);

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  await browser.close();
}
