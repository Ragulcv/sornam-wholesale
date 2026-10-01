// Second browser pass: purchase labelling, negative expenses, message templates.
import puppeteer from "puppeteer-core";
import { sealData } from "iron-session";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.LIVE_BASE ?? "http://localhost:3941";
const tag = `C${Date.now().toString().slice(-6)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// clicks before React hydrates are silently dropped; wait for it on every page
const live = (page) => page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => Object.keys(b).some((k) => k.startsWith("__reactProps"))), { timeout: 45000 }).then(() => sleep(400));
let pass = 0, fail = 0;
const ok = (l, c, d = "") => { if (c) { pass++; console.log(`  ok   ${l}${d ? ` — ${d}` : ""}`); } else { fail++; console.log(`  FAIL ${l}${d ? ` — ${d}` : ""}`); } };

const { db } = await import("../lib/db/index.ts");
const schema = await import("../lib/db/schema.ts");
const { inArray, eq } = await import("drizzle-orm");
const { getMessageTemplates } = await import("../lib/queries/settings.ts");
const { getDailyTally } = await import("../lib/queries/dailyTally.ts");

const before = await getMessageTemplates();
const madeTxns = [];

const [op] = await db.select().from(schema.operators).limit(1);
const sealed = await sealData({ authed: true, operatorId: op.id, operatorName: op.name, since: Date.now() }, { password: process.env.SESSION_SECRET });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.setCookie({ name: "sw_session", value: sealed, url: BASE });
  const bodyText = () => page.evaluate(() => document.body.innerText);

  // ------------------------------------------------- purchase says purchase
  console.log("\n[1] Purchase mode labels everything Purchase");
  await page.goto(`${BASE}/entry`, { waitUntil: "domcontentloaded" });
  await live(page);
  let txt = await bodyText();
  ok("sales mode reads SALES", txt.includes("SALES ENTRIES") && txt.includes("SALES RETURN"));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().toLowerCase() === "purchase");
    b?.click();
  });
  await sleep(800);
  txt = await bodyText();
  ok("title flips to PURCHASE ENTRIES", txt.includes("PURCHASE ENTRIES"));
  ok("main grid heading reads PURCHASE", /\bPURCHASE\b/.test(txt));
  ok("return grid reads PURCHASE RETURN", txt.includes("PURCHASE RETURN"));
  ok("no stray SALES heading left", !txt.includes("SALES RETURN") && !txt.includes("SALES ENTRIES"));

  // -------------------------------------------------- expense entered as -1000
  console.log("\n[2] Expense of -1000 reads as received");
  await page.goto(`${BASE}/expenses`, { waitUntil: "domcontentloaded" });
  await live(page);
  const filled = await page.evaluate(() => {
    const s = [...document.querySelectorAll("span")].find((x) => x.textContent.trim() === "Cash");
    const inp = s?.parentElement?.querySelector("input");
    if (!inp) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(inp, "-1000");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  });
  ok("cash field accepts a minus figure", filled);
  await sleep(500);
  txt = await bodyText();
  ok("it reads back as 'Cash received'", txt.includes("Cash received: Rupees One Thousand Only"), "in words, live");

  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Save");
    b?.click();
  });
  await sleep(3000);
  txt = await bodyText();
  const savedRow = await page.evaluate(() =>
    [...document.querySelectorAll("span")].some((s) => /^cash received ₹?[\d,]/i.test(s.textContent.trim())));
  ok("the saved row says cash received", savedRow);
  ok("daily closing tally is on the page", /daily closing tally/i.test(txt) && /recd back/i.test(txt));

  const tally = await getDailyTally();
  const today = tally.find((d) => d.date === new Date().toLocaleDateString("en-CA"));
  ok("the tally counts it as received back", today && today.expenseCashIn >= 1000, `${today?.expenseCashIn}`);

  const exp = await db.select({ id: schema.transactions.id }).from(schema.transactions).where(eq(schema.transactions.trnType, "expense"));
  madeTxns.push(...exp.map((t) => t.id));

  // ------------------------------------------------------- message templates
  console.log("\n[3] Editable WhatsApp templates");
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await live(page);
  txt = await bodyText();
  ok("placeholders are listed", txt.includes("{customer}") && txt.includes("{pending}"));
  ok("a live preview is shown", /preview/i.test(txt));

  const typed = await page.evaluate((t) => {
    const ta = document.querySelector('textarea[name="bookingTemplate"]');
    if (!ta) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, `Vanakkam {customer}, ${t} booked {weight} at {rate}.`);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, tag);
  ok("booking template is editable", typed);
  await sleep(500);
  txt = await bodyText();
  ok("preview renders the real values", txt.includes(`Vanakkam Ragul, ${tag} booked 1,000.000 g at 15,768.00.`),
    "placeholders filled in the preview");

  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Save settings");
    b?.click();
  });
  await sleep(3000);
  const saved = await getMessageTemplates();
  ok("template persisted", (saved.booking ?? "").includes(`${tag} booked`), (saved.booking ?? "").slice(0, 40));

  // the message actually built from it
  const { buildBookingWhatsapp } = await import("../lib/whatsapp.ts");
  const url = buildBookingWhatsapp("9876543210", {
    partyName: "Kumar", metal: "gold", weight: 500, rate: 15768, template: saved.booking,
  });
  ok("WhatsApp link uses the custom wording", decodeURIComponent(url).includes(`${tag} booked 500.000 g`), decodeURIComponent(url).split("text=")[1] ?? "");
} catch (e) {
  console.error("\nERROR:", e.message);
  fail++;
} finally {
  await browser.close();
  try {
    if (madeTxns.length) await db.delete(schema.transactions).where(inArray(schema.transactions.id, madeTxns));
    await db.update(schema.settings).set({
      bookingTemplate: before.booking, salesTemplate: before.sales,
      purchaseTemplate: before.purchase, deliveredTemplate: before.delivered,
    }).where(eq(schema.settings.id, 1));
  } catch (e) { console.log("cleanup warning:", e.message); }
  console.log("cleaned up (templates restored)");
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
