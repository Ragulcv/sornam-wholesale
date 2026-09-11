// Covers the two things the workbook rebuild dropped and that are now back:
// WhatsApp on bookings, and the booked-more-than-stock warning.
import puppeteer from "puppeteer-core";
import { sealData } from "iron-session";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3941";
const tag = `R${Date.now().toString().slice(-6)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (l, c, d = "") => { if (c) { pass++; console.log(`  ok   ${l}${d ? ` — ${d}` : ""}`); } else { fail++; console.log(`  FAIL ${l}${d ? ` — ${d}` : ""}`); } };

const { db } = await import("../lib/db/index.ts");
const schema = await import("../lib/db/schema.ts");
const { inArray, eq } = await import("drizzle-orm");
const bkq = await import("../lib/queries/bookings.ts");
const { findOrCreateParty } = await import("../lib/queries/parties.ts");
const { getMessageTemplates } = await import("../lib/queries/settings.ts");

const before = await getMessageTemplates();
const made = { parties: [], bookings: [] };

const partyId = await findOrCreateParty(`${tag} Devi`, "9800011122");
made.parties.push(partyId);
// A sell booking far bigger than any stock on hand, so the shortage must show.
const b = await bkq.createBooking({
  partyId, bookType: "ready", side: "sell", metal: "gold",
  weight: 9_000_000, rate: 15768, mcxRate: 152818, operatorName: "test",
});
made.bookings.push(b.id);

const [op] = await db.select().from(schema.operators).limit(1);
const sealed = await sealData({ authed: true, operatorId: op.id, operatorName: op.name, since: Date.now() }, { password: process.env.SESSION_SECRET });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.setCookie({ name: "sw_session", value: sealed, url: BASE });
  const bodyText = () => page.evaluate(() => document.body.innerText);

  console.log("\n[1] Booked-more-than-stock warning is back");
  await page.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" });
  await sleep(2200);
  let txt = await bodyText();
  ok("shortage strip shows", /booked more than stock/i.test(txt));
  ok("it names the short weight in gold", /short by .*gold/i.test(txt));
  ok("it says bookings still save", /still saved/i.test(txt));

  console.log("\n[2] WhatsApp is back on the booking rows");
  const wa = await page.evaluate(() =>
    [...document.querySelectorAll("a")]
      .map((a) => a.getAttribute("href") ?? "")
      .filter((h) => h.startsWith("https://wa.me/")));
  ok("a wa.me link exists on the row", wa.length > 0, `${wa.length} link(s)`);
  const msg = wa.length ? decodeURIComponent(wa[0].split("text=")[1] ?? "") : "";
  ok("message names the customer", msg.includes(`${tag} Devi`));
  ok("message carries the rate", msg.includes("15,768"));
  ok("phone normalised to 91…", wa[0]?.includes("wa.me/919800011122"), wa[0]?.split("?")[0] ?? "");

  console.log("\n[3] The Settings wording drives that message");
  await db.update(schema.settings).set({ bookingTemplate: `Vanakkam {customer}, ${tag} pending {pending}.` }).where(eq(schema.settings.id, 1));
  await page.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" });
  await sleep(2200);
  const wa2 = await page.evaluate(() =>
    [...document.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "").filter((h) => h.startsWith("https://wa.me/")));
  const msg2 = wa2.length ? decodeURIComponent(wa2[0].split("text=")[1] ?? "") : "";
  ok("row message uses the custom template", msg2.includes(`${tag} pending`), msg2.slice(0, 60));

  console.log("\n[4] Adding a booking still offers Send WhatsApp");
  const hasSendBtn = await page.evaluate(() => document.body.innerText.includes("Send WhatsApp"));
  ok("no stale banner before adding", hasSendBtn === false);
} catch (e) {
  console.error("\nERROR:", e.message);
  fail++;
} finally {
  await browser.close();
  try {
    if (made.bookings.length) await db.delete(schema.bookings).where(inArray(schema.bookings.id, made.bookings));
    if (made.parties.length) await db.delete(schema.parties).where(inArray(schema.parties.id, made.parties));
    await db.update(schema.settings).set({ bookingTemplate: before.booking }).where(eq(schema.settings.id, 1));
  } catch (e) { console.log("cleanup warning:", e.message); }
  console.log("cleaned up");
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
