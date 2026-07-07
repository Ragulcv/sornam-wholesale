import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";
import { sealData } from "iron-session";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://localhost:3940";
const sql = neon(process.env.DATABASE_URL);
const results = [];
const check = (n, ok) => { results.push(ok); console.log(`  ${ok ? "✓" : "✗"} ${n}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
async function login(page) {
  const op = (await sql`select id, name from operators where name='Ravi'`)[0];
  const sealed = await sealData(
    { authed: true, operatorId: op.id, operatorName: op.name, since: 1 },
    { password: process.env.SESSION_SECRET },
  );
  await page.setCookie({ name: "sw_session", value: sealed, url: BASE });
}
try {
  const page = await browser.newPage();
  await login(page);
  await page.goto(`${BASE}/parties`, { waitUntil: "domcontentloaded" });
  await sleep(1800); // let React hydrate before interacting

  const before = (await sql`select count(*)::int n from parties`)[0].n;
  await page.type('input[name="name"]', "Test Party ZZ");
  await page.type('input[name="phone"]', "9111100000");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save")?.click());
  let added = 0;
  for (let i = 0; i < 20; i++) { added = (await sql`select count(*)::int n from parties where name='Test Party ZZ'`)[0].n; if (added) break; await sleep(400); }
  const after = (await sql`select count(*)::int n from parties`)[0].n;
  check(`add party (${before}→${after})`, after === before + 1);
  await page.reload({ waitUntil: "domcontentloaded" }); await sleep(1600);
  await sleep(500);
  check("new party appears", (await page.evaluate(() => document.body.innerText)).includes("Test Party ZZ"));

  // edit it
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll("div")].filter((d) => d.textContent?.includes("Test Party ZZ"));
    const row = rows[rows.length - 1];
    row?.querySelector("button")?.click(); // not reliable; use Edit buttons
  });
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Edit");
    // find the Edit next to Test Party ZZ
    for (const b of btns) { const row = b.closest("div.flex"); if (row?.textContent?.includes("Test Party ZZ")) { b.click(); break; } }
  });
  await sleep(500);
  await page.evaluate(() => { const i = document.querySelector('input[name="name"]'); i.value = "Test Party ZZ Edited"; });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save")?.click());
  await sleep(2000);
  const edited = (await sql`select count(*)::int n from parties where name='Test Party ZZ Edited'`)[0].n;
  check("edit party name", edited === 1);

  // import CSV
  const impBefore = (await sql`select count(*)::int n from parties`)[0].n;
  const fs = await import("node:fs");
  fs.writeFileSync("/tmp/parties.csv", "Name,Phone,GSTIN\nImp Party A,9222200001,\nImp Party B,9222200002,\n");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Import")?.click());
  await sleep(400);
  const input = await page.$('input[type="file"]');
  await input.uploadFile("/tmp/parties.csv");
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Upload")?.click());
  await sleep(2500);
  const impAfter = (await sql`select count(*)::int n from parties`)[0].n;
  check(`import 2 parties (${impBefore}→${impAfter})`, impAfter === impBefore + 2);

  // delete the fresh edited party (no activity)
  const p = (await sql`select id from parties where name='Test Party ZZ Edited'`)[0];
  await page.reload({ waitUntil: "domcontentloaded" }); await sleep(1600);
  await page.evaluate((name) => {
    const btns = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Del");
    for (const b of btns) { const row = b.closest("div.flex"); if (row?.textContent?.includes(name)) { b.click(); break; } }
  }, "Test Party ZZ Edited");
  await sleep(300);
  await page.evaluate((name) => {
    const btns = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Delete");
    for (const b of btns) { const row = b.closest("div.flex"); if (row?.textContent?.includes(name)) { b.click(); break; } }
  }, "Test Party ZZ Edited");
  await sleep(2000);
  const gone = (await sql`select count(*)::int n from parties where id=${p.id}`)[0].n;
  check("delete a no-activity party", gone === 0);

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  await browser.close();
}
