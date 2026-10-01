// Drives the Settings backup card in a real browser. STATE = ok | failed | off
import puppeteer from "puppeteer-core";
import { sealData } from "iron-session";
const STATE = process.env.STATE;
const BASE = "http://localhost:3941";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (l, c, d = "") => { if (c) { pass++; console.log(`  ok   ${l}${d ? ` — ${d}` : ""}`); } else { fail++; console.log(`  FAIL ${l}${d ? ` — ${d}` : ""}`); } };

const { db } = await import("../lib/db/index.ts");
const schema = await import("../lib/db/schema.ts");
const [op] = await db.select().from(schema.operators).limit(1);
const sealed = await sealData({ authed: true, operatorId: op.id, operatorName: op.name, since: Date.now() }, { password: process.env.SESSION_SECRET });

const anon = await fetch(`${BASE}/api/backup/status`, { redirect: "manual" });
ok("signed-out request is refused", anon.status === 307 || anon.status === 401, `${anon.status}`);
const anonRun = await fetch(`${BASE}/api/backup/run`, { method: "POST", redirect: "manual" });
ok("signed-out 'back up now' is refused", anonRun.status === 307 || anonRun.status === 401, `${anonRun.status}`);

const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setCookie({ name: "sw_session", value: sealed, url: BASE });
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await sleep(3500);
  const text = () => page.evaluate(() => document.body.innerText);
  let t = await text();
  ok("card is on the Settings page", /daily backup/i.test(t));
  const html = await page.content();
  ok("the API key never reaches the browser", !html.includes(process.env.BACKUP_API_KEY ?? "@@none@@"));
  ok("no download offered", !/download/i.test(t.split(/daily backup/i)[1] ?? ""));

  if (STATE === "ok") {
    ok("shows Backed up", t.includes("Backed up"));
    ok("shows the schedule", t.includes("23:30 IST"));
    ok("shows retention", t.includes("Keeps 30 days and 12 months"));
    ok("shows what was captured", /Captured \d+ bills, \d+ bookings, \d+ customers/.test(t));
    ok("shows the size", /\d+ KB/.test(t));
    ok("shows how many are kept", /Kept: \d+ daily, \d+ monthly/.test(t));
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Back up now")?.click());
    await sleep(1200);
    t = await text();
    ok("button responds", /Running…|Backing up now|Backup started|wait a minute/i.test(t), t.match(/Running…|Backing up now|Backup started|wait a minute[^.]*/i)?.[0] ?? "");
    for (let i = 0; i < 20; i++) { await sleep(2000); t = await text(); if (/Backed up/.test(t) && !/Running…/.test(t)) break; }
    ok("returns to Backed up after the run", t.includes("Backed up") && !t.includes("Running…"));
    ok("run history strip shows", /last \d+ runs/.test(t));
  }
  if (STATE === "failed") {
    ok("shows Last backup FAILED", t.includes("Last backup FAILED"));
    ok("shows the reason", /pg_dump exited|password authentication/i.test(t));
  }
  if (STATE === "off") {
    ok("shows Not connected yet", t.includes("Not connected yet"));
    const disabled = await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Back up now")?.disabled);
    ok("Back up now is disabled", disabled === true);
  }
  ok("no page errors", errors.length === 0, errors[0] ?? "");
} finally { await browser.close(); }
console.log(`\n${STATE}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
