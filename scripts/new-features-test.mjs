import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://localhost:3940";
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
  await sleep(900);

  // 1. Privacy button removed
  const dash = await page.evaluate(() => document.body.innerText);
  check("privacy button removed from UI", !dash.includes("Privacy"));

  // 2. Customer dropdown autofills phone
  await page.goto(`${BASE}/new`, { waitUntil: "networkidle2" });
  await page.type('input[name="customerName"]', "Kar");
  await sleep(400);
  const optClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("ul button")].find((b) => b.textContent.includes("Karthik"));
    if (btn) { btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); return true; }
    return false;
  });
  await sleep(300);
  const phoneVal = await page.evaluate(() => document.querySelector('input[name="customerPhone"]')?.value);
  const idVal = await page.evaluate(() => document.querySelector('input[name="customerId"]')?.value);
  check("customer dropdown shows + selects", optClicked);
  check("selecting customer autofills phone", !!phoneVal && phoneVal.length >= 6);
  check("selecting customer sets hidden id", !!idVal);

  // 3. Booking delete
  await page.goto(`${BASE}/bookings`, { waitUntil: "networkidle2" });
  const before = await page.evaluate(() => document.querySelectorAll('a[href*="/print"]').length);
  check("booking delete icon present", await page.evaluate(() => !!document.querySelector('button[title="Delete booking"]')));
  await page.evaluate(() => document.querySelector('button[title="Delete booking"]')?.click());
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Delete")?.click());
  await sleep(2500);
  await page.reload({ waitUntil: "networkidle2" });
  const after = await page.evaluate(() => document.querySelectorAll('a[href*="/print"]').length);
  check(`booking deleted (${before}→${after})`, after === before - 1);

  // 4. Customer delete — blocked when they have bookings
  await page.goto(`${BASE}/customers`, { waitUntil: "networkidle2" });
  check("customer delete icon present", await page.evaluate(() => !!document.querySelector('button[title="Delete customer"]')));
  await page.evaluate(() => document.querySelector('button[title="Delete customer"]')?.click());
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Delete")?.click());
  await sleep(1500);
  const blocked = await page.evaluate(() => document.body.innerText.includes("Has bookings"));
  check("customer with bookings is blocked from delete", blocked);

  // 5. Customer delete — succeeds for a fresh (no-booking) customer
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Add customer"))?.click());
  await sleep(300);
  await page.type('input[name="name"]', "ZZ Delete Me");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save customer")?.click());
  await sleep(2000);
  const hasNew = await page.evaluate(() => document.body.innerText.includes("ZZ Delete Me"));
  // delete it (it is last alphabetically → last delete button)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button[title="Delete customer"]')];
    btns[btns.length - 1]?.click();
  });
  await sleep(200);
  await page.evaluate(() => {
    const dels = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Delete");
    dels[dels.length - 1]?.click();
  });
  await sleep(2000);
  const goneNow = await page.evaluate(() => !document.body.innerText.includes("ZZ Delete Me"));
  check("fresh customer added then deleted", hasNew && goneNow);

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  await browser.close();
}
