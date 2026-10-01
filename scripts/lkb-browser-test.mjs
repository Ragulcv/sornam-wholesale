// Real-browser test of the flows a person actually performs:
// bookings workbook tabs, one-click billing, save-clears-the-form, and the
// booking closing itself. Runs against the dev server on :3941 (staging DB).
import puppeteer from "puppeteer-core";
import { sealData } from "iron-session";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.LIVE_BASE ?? "http://localhost:3941";
const tag = `B${Date.now().toString().slice(-6)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// clicks before React hydrates are silently dropped; wait for it on every page
const live = (page) => page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => Object.keys(b).some((k) => k.startsWith("__reactProps"))), { timeout: 45000 }).then(() => sleep(400));
let pass = 0, fail = 0;
const ok = (l, c, d = "") => { if (c) { pass++; console.log(`  ok   ${l}${d ? ` — ${d}` : ""}`); } else { fail++; console.log(`  FAIL ${l}${d ? ` — ${d}` : ""}`); } };

const { db } = await import("../lib/db/index.ts");
const schema = await import("../lib/db/schema.ts");
const { inArray, eq } = await import("drizzle-orm");
const bkq = await import("../lib/queries/bookings.ts");
const { findOrCreateParty } = await import("../lib/queries/parties.ts");

const made = { parties: [], bookings: [], txns: [] };
const consoleErrors = [];

const partyId = await findOrCreateParty(`${tag} Kumar`, "9876512345");
made.parties.push(partyId);
const booking = await bkq.createBooking({
  partyId, bookType: "ready", side: "sell", metal: "gold",
  weight: 1000, rate: 15768, mcxRate: 152818, operatorName: "test",
});
made.bookings.push(booking.id);

const [op] = await db.select().from(schema.operators).limit(1);
const sealed = await sealData({ authed: true, operatorId: op.id, operatorName: op.name, since: Date.now() }, { password: process.env.SESSION_SECRET });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
  await page.setCookie({ name: "sw_session", value: sealed, url: BASE });

  const clickText = async (sel, text) => {
    const handle = (await page.$$(sel)).find(async () => true);
    return page.evaluate((s, t) => {
      const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim() === t);
      if (el) { el.click(); return true; }
      return false;
    }, sel, text);
  };
  const bodyText = () => page.evaluate(() => document.body.innerText);

  // ---------------------------------------------------------------- bookings
  console.log("\n[1] Bookings workbook");
  await page.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" });
  await live(page);
  let txt = await bodyText();
  ok("R SELL sheet shows the booking", txt.includes(`${tag} Kumar`));
  ok("PENDING column carries 1000.000", txt.includes("1000.000"));
  ok("PREMIUM computed as 486.20", txt.includes("486.20"), "RATE − MCX × 0.1");
  ok("summary strip counts customers", /CUSTOMERS\s*\n?/i.test(txt) || txt.includes("Customers"));

  console.log("\n[2] '- OR +' position sheet");
  await clickText("button", "- OR +");
  await sleep(900);
  txt = await bodyText();
  ok("hedge check panel renders", /hedge check/i.test(txt));
  ok("it states the net in lots", /-?\d+\.\d{3} lots/.test(txt));
  ok("it says what to trade to flatten", /BUY .* lot|SELL .* lot|square/i.test(txt));
  ok("book vs MCX bridge shown", txt.includes("BOOK EXPOSURE") && txt.includes("MCX POSITION"));

  console.log("\n[3] CUSTOMERS roll-up");
  await clickText("button", "CUSTOMERS");
  await sleep(900);
  txt = await bodyText();
  ok("customer row present", txt.includes(`${tag} Kumar`));
  ok("pending bookings counted", txt.includes("PENDING BOOKINGS"));
  const hasBillBtn = await page.evaluate(() => [...document.querySelectorAll("a")].some((a) => a.textContent.includes("Sales entry")));
  ok("one-click 'Sales entry' button per customer", hasBillBtn);

  // ------------------------------------------------------- one-click billing
  console.log("\n[4] One click from booking to entry");
  await page.goto(`${BASE}/entry?booking=${booking.id}`, { waitUntil: "domcontentloaded" });
  await live(page);
  txt = await bodyText();
  ok("entry opens pre-filled with the customer", txt.includes(`${tag} Kumar`));
  ok("the booked weight is on the line", txt.includes("1000.000"));
  ok("the booked rate came across", txt.includes("15768"));
  ok("Opg/Clsg carried-forward strip shown", txt.includes("Brought forward") && txt.includes("After this bill"));

  // ------------------------------------------------- receipts read negative
  console.log("\n[5] Receipts read negative, words under the money");
  // The label span and its input are siblings in the grid, so walk forward from
  // the label rather than grabbing the parent's first input.
  const setField = async (label, value) => {
    const hit = await page.evaluate((lab, val) => {
      const s = [...document.querySelectorAll("span")].find((x) => x.textContent.trim() === lab);
      if (!s) return "no label";
      let el = s.nextElementSibling;
      while (el && el.tagName !== "INPUT") el = el.querySelector?.("input") ?? el.nextElementSibling;
      if (!el || el.tagName !== "INPUT") return "no input";
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return "ok";
    }, label, value);
    await sleep(400);
    return hit;
  };
  const hit = await setField("Bank Recd", "250000");
  ok("Bank Recd field found and filled", hit === "ok", hit);
  txt = await bodyText();
  ok("bank receipt spelled out in English", txt.includes("Rupees Two Lakh Fifty Thousand Only"), "Bank Recd words");
  // read the reconciliation boxes themselves (input values never appear in innerText)
  const box = (lab) => page.evaluate((l) => {
    const sp = [...document.querySelectorAll("span")].find((x) => x.textContent.trim() === l);
    const out = []; let el = sp?.nextElementSibling;
    while (el && out.length < 2) { const i = el.tagName === "INPUT" ? el : el.querySelector?.("input"); if (i && i.readOnly) out.push(i.value); el = el.nextElementSibling; }
    return out;
  }, lab);
  const recd = await box("Cash/Bank Recd"), total = await box("Total."), clsg = await box("Clsg. Bal.");
  ok("receipt shown as a negative figure", recd[0] === "-250000.00", recd.join(" | "));
  ok("booked gold counts in Total. with Touch left empty (as 100)", total[0] === "1000.000" && total[1] === "15768000.00", total.join(" | "));
  ok("Clsg. Bal. = received - bill (owed reads negative)", clsg[1] === "-15518000.00", clsg.join(" | "));

  // ------------------------------------------------------------ save & clear
  console.log("\n[6] Save clears the form and locks the button");
  const saveBtn = async () => page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => ["Save", "Saving…", "Saved", "Update"].includes(x.textContent.trim()));
    return b ? { label: b.textContent.trim(), disabled: b.disabled } : null;
  });
  ok("Save is enabled before saving", (await saveBtn())?.disabled === false);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Save");
    b?.click();
  });
  await sleep(3000);
  const after = await saveBtn();
  txt = await bodyText();
  ok("banner confirms the save", /Saved\. Bill No\. \d+/.test(txt), txt.match(/Saved\. Bill No\. \d+/)?.[0] ?? "");
  ok("form is cleared for the next entry", txt.includes("Form cleared for the next entry"));
  // Check the actual fields, not the page text: the booking dropdown legitimately
  // still lists other customers.
  const cleared = await page.evaluate(() => {
    const val = (ph) => document.querySelector(`input[placeholder="${ph}"]`)?.value ?? null;
    const rows = document.querySelectorAll("table tbody tr").length;
    return { name: val("type customer — Enter to add"), rows };
  });
  ok("the customer field is empty again", cleared.name === "", `"${cleared.name}"`);
  ok("Save is now disabled", after?.disabled === true, `label "${after?.label}"`);
  ok("Save reads 'Saved'", after?.label === "Saved");

  // ------------------------------------------------------- booking closed out
  console.log("\n[7] The booking closed itself");
  const closed = await bkq.getBooking(booking.id);
  ok("delivered weight recorded", Math.abs(closed.delivered - 1000) < 0.005, `${closed.delivered}`);
  ok("pending is now zero", Math.abs(closed.pending) < 0.005, `${closed.pending}`);
  ok("status is delivered", closed.status === "delivered", closed.status);

  await page.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" });
  await live(page);
  txt = await bodyText();
  ok("bookings sheet shows it as delivered", /delivered/i.test(txt));

  const txns = await db.select({ id: schema.transactions.id }).from(schema.transactions).where(eq(schema.transactions.partyId, partyId));
  made.txns.push(...txns.map((t) => t.id));

  ok("no console errors on any screen", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));
} catch (e) {
  console.error("\nERROR:", e.message);
  fail++;
} finally {
  await browser.close();
  try {
    if (made.txns.length) await db.delete(schema.transactions).where(inArray(schema.transactions.id, made.txns));
    if (made.bookings.length) await db.delete(schema.bookings).where(inArray(schema.bookings.id, made.bookings));
    if (made.parties.length) await db.delete(schema.parties).where(inArray(schema.parties.id, made.parties));
  } catch (e) { console.log("cleanup warning:", e.message); }
  console.log("cleaned up");
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
