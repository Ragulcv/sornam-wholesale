// The shared customer lookup, in a real browser, on every screen that has one.
// Types only; saves nothing through the UI, so a tester's staging data is safe.
import puppeteer from "puppeteer-core";
import { sealData } from "iron-session";
const BASE = process.env.LIVE_BASE ?? "http://localhost:3941";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (l, c, d = "") => { if (c) { pass++; console.log(`  ok   ${l}${d ? ` — ${d}` : ""}`); } else { fail++; console.log(`  FAIL ${l}${d ? ` — ${d}` : ""}`); } };

const { db } = await import("../lib/db/index.ts");
const S = await import("../lib/db/schema.ts");
const { eq, inArray } = await import("drizzle-orm");
const { findOrCreateParty } = await import("../lib/queries/parties.ts");

// a customer of our own, so the test never depends on whoever is testing
const NAME = "Zeta Picker Test", PHONE = "9876501234";
const ourId = await findOrCreateParty(NAME, PHONE);
const made = [ourId];

const [op] = await db.select().from(S.operators).limit(1);
const sealed = await sealData({ authed: true, operatorId: op.id, operatorName: op.name, since: Date.now() }, { password: process.env.SESSION_SECRET });
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.setCookie({ name: "sw_session", value: sealed, url: BASE });

const SCREENS = [
  { path: "/bookings", input: 'input[placeholder="type customer"]', newHint: true, label: "Bookings (inside the scrolling row)" },
  { path: "/entry", input: 'input[placeholder="type customer — Enter to add"]', newHint: true, label: "Entry" },
  { path: "/expenses", input: 'input[placeholder="Search party"]', newHint: false, label: "Expenses" },
];

const listInfo = () => page.evaluate(() => {
  const ul = document.querySelector('ul[role="listbox"]');
  if (!ul) return null;
  const r = ul.getBoundingClientRect();
  const first = ul.querySelector("li");
  const fr = first?.getBoundingClientRect();
  // the element actually on top at the first suggestion's centre: if the list
  // were clipped or hidden behind something, this would not be inside it
  const hit = fr ? document.elementFromPoint(fr.left + fr.width / 2, fr.top + fr.height / 2) : null;
  return { h: Math.round(r.height), onTop: !!hit && ul.contains(hit), text: ul.innerText };
});
// select-all then Backspace, the way a person clears a field (triple-click is unreliable headless)
const clear = async (sel) => { await page.focus(sel); await page.$eval(sel, (e) => e.select()); await page.keyboard.press("Backspace"); await sleep(150); };

for (const sc of SCREENS) {
  console.log(`\n[${sc.label}]`);
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(`${BASE}${sc.path}`, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
    if (await page.waitForSelector(sc.input, { timeout: 15000 }).catch(() => null)) break;
  }
  // wait until React has attached to the field (hydrated); typing before that
  // is silently ignored, which is what made earlier runs flaky
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps"));
  }, { timeout: 30000 }, sc.input);
  await sleep(500);

  await page.click(sc.input); await page.type(sc.input, "zeta pick", { delay: 20 }); await sleep(300);
  let li = await listInfo();
  ok("typing part of a name opens the list", !!li && li.text.includes(NAME));
  ok("the list is fully visible, not cut off", !!li && li.h > 20 && li.onTop, li ? `${li.h}px tall, on top: ${li.onTop}` : "no list");

  await page.keyboard.press("Enter"); await sleep(300);
  ok("Enter picks it", (await page.$eval(sc.input, (e) => e.value)) === NAME);
  ok("the list closes after picking", !(await listInfo()));

  await clear(sc.input); await page.type(sc.input, PHONE.slice(-5), { delay: 20 }); await sleep(300);
  li = await listInfo();
  ok("searching by phone digits finds the customer", !!li && li.text.includes(NAME), PHONE.slice(-5));
  await page.evaluate(() => document.querySelector('ul[role="listbox"] li button')?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  await sleep(300);
  ok("clicking a suggestion picks it", (await page.$eval(sc.input, (e) => e.value)) === NAME);

  await clear(sc.input); await page.type(sc.input, "  zeta   picker TEST", { delay: 15 });
  await page.keyboard.press("Tab"); await sleep(400);
  ok("typing the full saved name links it on its own (any case/spacing)", (await page.$eval(sc.input, (e) => e.value)) === NAME);
  if (sc.path === "/entry") {
    const phone = await page.evaluate(() => { const i = [...document.querySelectorAll("input[inputmode=tel]")][0]; return { v: i?.value, ro: i?.readOnly }; });
    ok("…and fills the saved phone", phone.v === PHONE && phone.ro === true, JSON.stringify(phone));
  }

  if (sc.newHint) {
    await clear(sc.input); await page.type(sc.input, "Brand New Person", { delay: 15 }); await sleep(300);
    li = await listInfo();
    ok("a new name says it will be created on save", !!li && /is a new customer/.test(li.text));
  }
  await page.keyboard.press("Escape"); await sleep(200);
  ok("Esc closes the list", !(await listInfo()));
}
await browser.close();
ok("no page errors", errors.length === 0, errors[0] ?? "");

console.log("\n[No more duplicate customers]");
const same = async (n, ph) => (await findOrCreateParty(n, ph)) === ourId;
ok("same name, phone written with +91 and spaces", await same("Zeta Picker Test", "+91 98765 01234"));
ok("same name, different case and spacing", await same("  zeta  picker test "));
ok("same name, no phone", await same("Zeta Picker Test"));
const noPhone = await findOrCreateParty("Zeta Nophone Test"); made.push(noPhone);
ok("a saved customer with no phone gets the phone filled in", (await findOrCreateParty("Zeta Nophone Test", "9000012345")) === noPhone
  && (await db.select().from(S.parties).where(eq(S.parties.id, noPhone)))[0].phone === "9000012345");
ok("…and an existing phone is never overwritten", (await findOrCreateParty("Zeta Picker Test", "9111111111")) === ourId
  && (await db.select().from(S.parties).where(eq(S.parties.id, ourId)))[0].phone === PHONE);

await db.delete(S.parties).where(inArray(S.parties.id, made));
console.log(`\n${pass} passed, ${fail} failed (test customers removed)`);
process.exit(fail ? 1 : 0);
