import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://localhost:3940";

const results = [];
const check = (name, cond) => {
  results.push({ name, ok: !!cond });
  console.log(`  ${cond ? "✓" : "✗"} ${name}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();

  // 1. Lock page branding + login
  await page.goto(`${BASE}/lock`, { waitUntil: "networkidle2" });
  const lockText = await page.evaluate(() => document.body.innerText);
  check("lock shows 'Tracker'", lockText.includes("Tracker"));
  check("lock has no 'Sornam'", !lockText.includes("Sornam"));

  for (const d of ["1", "2", "3", "4"])
    await page.evaluate((digit) => {
      [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === digit)?.click();
    }, d);
  const t0 = Date.now();
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {}),
    page.evaluate(() =>
      [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Unlock"))?.click(),
    ),
  ]);
  await new Promise((r) => setTimeout(r, 1500));
  const loginMs = Date.now() - t0;
  const dash = await page.evaluate(() => document.body.innerText);
  check(`login lands on dashboard (${loginMs}ms)`, new URL(page.url()).pathname === "/" && dash.includes("Today"));

  // 2. Dashboard: price bar + cash/bank filter, nav rename, brand
  check("dashboard price bar (Gold)", dash.includes("Gold"));
  check("dashboard has Cash + Bank filter chips", dash.includes("Cash") && dash.includes("Bank"));
  check("nav renamed to Transactions", dash.includes("Transactions") && !dash.includes("Ledger"));
  check("brand is Tracker", dash.includes("Tracker") && !dash.includes("Sornam"));

  // 3. New booking: custom purity + current price button
  await page.goto(`${BASE}/new`, { waitUntil: "networkidle2" });
  const newText = await page.evaluate(() => document.body.innerText);
  const hasCustomPurity = await page.evaluate(() =>
    [...document.querySelectorAll("input")].some((i) => (i.placeholder || "").includes("custom")),
  );
  check("new booking has custom purity input", hasCustomPurity);
  check("new booking has 'Use current price'", newText.includes("Use current price"));

  // 4. Bookings: quick-action icons
  await page.goto(`${BASE}/bookings`, { waitUntil: "networkidle2" });
  const printLinks = await page.evaluate(
    () => [...document.querySelectorAll('a[href*="/print"]')].length,
  );
  check("bookings list has print icons", printLinks > 0);
  const completeBtns = await page.evaluate(
    () => [...document.querySelectorAll('button[title="Mark collected"]')].length,
  );
  check("bookings list has complete icons", completeBtns > 0);

  // 5. Quick-complete modal flow
  await page.evaluate(() =>
    document.querySelector('button[title="Mark collected"]')?.click(),
  );
  await new Promise((r) => setTimeout(r, 400));
  const modalOpen = await page.evaluate(() => document.body.innerText.includes("Record collection"));
  check("complete modal opens", modalOpen);
  const beforeText = await page.evaluate(() => document.body.innerText);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    btns.find((b) => b.textContent.trim() === "Full lot")?.click();
  });
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() =>
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Confirm")?.click(),
  );
  await new Promise((r) => setTimeout(r, 2500));
  const afterText = await page.evaluate(() => document.body.innerText);
  check("collection recorded (list changed)", afterText !== beforeText);

  // 6. Transactions page + CSV link
  await page.goto(`${BASE}/transactions`, { waitUntil: "networkidle2" });
  const txText = await page.evaluate(() => document.body.innerText);
  check("transactions page title", txText.includes("Transactions"));
  const csvLink = await page.evaluate(
    () => !!document.querySelector('a[href="/api/export/bank"]'),
  );
  check("bank CSV download link present", csvLink);

  // 7. Settings tax field
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle2" });
  const taxField = await page.evaluate(
    () => !!document.querySelector('input[name="taxPercent"]'),
  );
  check("settings has tax rate field", taxField);

  // 8. Bank CSV export content
  const cookies = await browser.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const csv = await fetch(`${BASE}/api/export/bank`, { headers: { cookie: cookieHeader } });
  const csvBody = await csv.text();
  check("CSV export returns rows", csv.status === 200 && csvBody.includes("Bill No") && csvBody.split("\n").length > 1);

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  await browser.close();
}
