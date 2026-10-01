// Runs guide Tests 5 and 6 through the real screens on live staging, exactly
// as a person would, checks every stated outcome, and saves screenshots.
import puppeteer from "puppeteer-core";
import { sealData } from "iron-session";
const BASE = "https://sornam-wholesale-staging.vercel.app";
const SHOTS = "/private/tmp/claude-501/-Users-ragul-lynky-AI/7a3ab26c-90c5-45cf-b64d-3daddf0ccd88/scratchpad/shots";
const W = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (l, c, d = "") => { c ? pass++ : fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${l}${d ? ` — ${d}` : ""}`); };
const { db } = await import("../lib/db/index.ts"); const S = await import("../lib/db/schema.ts");
const { eq } = await import("drizzle-orm");
const [op] = await db.select().from(S.operators).limit(1);
const sealed = await sealData({ authed: true, operatorId: op.id, operatorName: op.name, since: Date.now() }, { password: process.env.SESSION_SECRET });
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const p = await browser.newPage(); await p.setViewport({ width: 1440, height: 1000 });
const errors = []; p.on("pageerror", (e) => errors.push(e.message));
await p.setCookie({ name: "sw_session", value: sealed, url: BASE });
const live = () => p.waitForFunction(() => [...document.querySelectorAll("button,a")].some((x) => Object.keys(x).some((k) => k.startsWith("__react"))), { timeout: 45000 }).then(() => W(1500));
const text = () => p.evaluate(() => document.body.innerText);
const tab = (t) => p.evaluate((t) => { const x = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t); x?.click(); return !!x; }, t).then((r) => W(700).then(() => r));
const box = (lab) => p.evaluate((l) => { const sp = [...document.querySelectorAll("span")].find((x) => x.textContent.trim() === l); const out = []; let el = sp?.nextElementSibling; while (el && out.length < 2) { const i = el.tagName === "INPUT" ? el : el.querySelector?.("input"); if (i && i.readOnly) out.push(i.value); el = el.nextElementSibling; } return out; }, lab);
const field = (lab) => p.evaluate((l) => { const sp = [...document.querySelectorAll("span")].find((x) => x.textContent.trim() === l); let el = sp?.nextElementSibling; while (el && el.tagName !== "INPUT") el = el.querySelector?.("input") ?? el.nextElementSibling; return el?.value ?? null; }, lab);
const shot = (name) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
const before = await db.select().from(S.settings).where(eq(S.settings.id, 1));
try {
  console.log("\n=== TEST 5: booking -> bill ===");
  await p.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" }); await live();
  await tab("R SELL");
  const billHref = await p.evaluate(() => { const row = [...document.querySelectorAll("tr")].find((r) => r.innerText.includes("Test Ragul")); return row?.querySelector('a[href*="/entry?booking="]')?.getAttribute("href") ?? null; });
  ok("R SELL has a Bill button on Test Ragul's row", !!billHref, billHref ?? "");
  await p.goto(`${BASE}${billHref}`, { waitUntil: "domcontentloaded" }); await live();
  let t = await text();
  ok("step 1: name is Test Ragul", (await p.$eval('input[placeholder="type customer — Enter to add"]', (e) => e.value)) === "Test Ragul");
  ok("step 1: Rate/Gm 15000", (await field("Rate/Gm")) === "15000");
  ok("step 1: grid row is booking No.7, 1000.000 g, 15000000.00", /No\.7[\s\S]{0,80}1000\.000[\s\S]{0,120}15000000\.00/.test(t));
  const tot = await box("Total.");
  ok("step 1: Total. 1000.000 | 15000000.00", tot[0] === "1000.000" && tot[1] === "15000000.00", tot.join(" | "));
  await shot("test5-step1-entry-prefilled");

  await p.evaluate(() => { const sp = [...document.querySelectorAll("span")].find((x) => x.textContent.trim() === "Bank Recd"); let el = sp.nextElementSibling; while (el && el.tagName !== "INPUT") el = el.nextElementSibling; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "15000000"); el.dispatchEvent(new Event("input", { bubbles: true })); });
  await W(600); t = await text();
  ok("step 2: words 'Rupees One Crore Fifty Lakh Only'", t.includes("Rupees One Crore Fifty Lakh Only"));
  const cl = await box("Clsg. Bal.");
  ok("step 2: Clsg. Bal. 0.000 | 0.00", cl[0] === "0.000" && cl[1] === "0.00", cl.join(" | "));
  ok("step 2: strip says settled", /After this bill:[\s\S]{0,60}settled/.test(t));
  await shot("test5-step2-bank-received");

  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save").click());
  await p.waitForFunction(() => document.body.innerText.includes("Entry saved"), { timeout: 30000 }).catch(() => {});
  await W(800); t = await text();
  ok("step 3: WhatsApp popup appears", t.includes("Entry saved") && t.includes("Send WhatsApp"));
  const salesWa = await p.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Send WhatsApp")?.getAttribute("href") ?? "");
  const billNo = (t.match(/Saved\. Bill No\. (\d+)/) || [])[1];
  await shot("test5-step3-whatsapp-popup");
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Not now")?.click()); await W(500);

  await p.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" }); await live();
  await tab("R SELL"); t = await text();
  const row7 = await p.evaluate(() => [...document.querySelectorAll("tr")].find((r) => r.innerText.includes("Test Ragul"))?.innerText.replace(/\s+/g, " ") ?? "");
  ok("step 4: DELIVERY 1000.000, PENDING 0.000, DELIVERED", /1000\.000.*1000\.000\s+0\.000/.test(row7) && /delivered/i.test(row7), row7.slice(0, 120));
  ok("step 4: no Bill button left on the row", !(await p.evaluate(() => !![...document.querySelectorAll("tr")].find((r) => r.innerText.includes("Test Ragul"))?.querySelector('a[href*="/entry?booking="]'))));
  ok("step 4: strip Delivered 1 · Pending 2", /DELIVERED\s*1/i.test(t) && /PENDING\s*2/i.test(t));
  await shot("test5-step4-booking-delivered");

  await tab("- OR +"); t = await text();
  ok("step 5: R lots +0.500", /R \(ready\)[\s\S]{0,80}0\.500/.test(t));
  ok("step 5: book 2.000, MCX -1.000, net 1.000", /BOOK EXPOSURE\s*2\.000/i.test(t) && /MCX POSITION\s*-1\.000/i.test(t) && /1\.000 lots/.test(t));
  ok("step 5: says SELL 1.000 lot(s)", /SELL 1\.000 lot\(s\)/.test(t));
  await shot("test5-step5-hedge");

  console.log("\n=== TEST 6: WhatsApp ===");
  const salesMsg = decodeURIComponent(salesWa.split("text=")[1] ?? "");
  ok("sales message goes to your number", salesWa.startsWith("https://wa.me/919994755353"), salesWa.split("?")[0]);
  ok("sales message text", salesMsg.includes("Namaste Test Ragul") && salesMsg.includes(`Bill No: ${billNo}`) && salesMsg.includes("Weight: 1,000.000 g") && salesMsg.includes("Value: ₹1,50,00,000.00"), salesMsg.replace(/\n/g, " / "));

  await tab("UF SELL");
  const ufWa = await p.evaluate(() => [...document.querySelectorAll("tr")].find((r) => r.innerText.includes("Test Ragul"))?.querySelector('a[href^="https://wa.me/"]')?.getAttribute("href") ?? "");
  const ufMsg = decodeURIComponent(ufWa.split("text=")[1] ?? "");
  ok("step 1: UF row WhatsApp, standard wording", ufMsg === "Namaste Test Ragul,\n\nYour unfixed booking is confirmed:\n• Pending Gold: 1,000.000 g\n\nThank you.", ufMsg.replace(/\n/g, " / "));

  await p.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" }); await live();
  const custom = "Vanakkam {customer}, your {metal} booking of {weight} is confirmed.";
  await p.evaluate((v) => { const ta = document.querySelector('textarea[name="bookingTemplate"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, v); ta.dispatchEvent(new Event("input", { bubbles: true })); }, custom);
  await W(600); t = await text();
  ok("step 2: preview shows the real values", t.includes("Vanakkam Ragul, your Gold booking of 1,000.000 g is confirmed."));
  await shot("test6-step2-settings-preview");
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save settings").click()); await W(3500);
  const saved = (await db.select().from(S.settings).where(eq(S.settings.id, 1)))[0];
  ok("step 3: template saved", saved.bookingTemplate === custom);
  await p.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" }); await live(); await tab("UF SELL");
  const ufWa2 = await p.evaluate(() => [...document.querySelectorAll("tr")].find((r) => r.innerText.includes("Test Ragul"))?.querySelector('a[href^="https://wa.me/"]')?.getAttribute("href") ?? "");
  ok("step 3: UF row now sends your wording", decodeURIComponent(ufWa2.split("text=")[1] ?? "") === "Vanakkam Test Ragul, your Gold booking of 1,000.000 g is confirmed.", decodeURIComponent(ufWa2.split("text=")[1] ?? ""));
  ok("no page errors anywhere", errors.length === 0, errors[0] ?? "");
} catch (e) { ok("ran to the end", false, e.message); }
finally {
  await browser.close();
  // put the wording back to standard, as promised
  await db.update(S.settings).set({ bookingTemplate: before[0].bookingTemplate }).where(eq(S.settings.id, 1));
  console.log("booking wording restored to:", before[0].bookingTemplate ?? "standard");
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
