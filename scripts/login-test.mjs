import puppeteer from "puppeteer-core";

const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://localhost:3940";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  await page.goto(`${BASE}/lock`, { waitUntil: "networkidle2" });
  console.log("1. on /lock, url =", page.url());

  // Type the PIN via the keypad buttons.
  for (const d of ["1", "2", "3", "4"]) {
    await page.evaluate((digit) => {
      const btn = [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === digit,
      );
      btn?.click();
    }, d);
  }
  console.log("2. entered PIN 1234");

  // Click Unlock and wait for the navigation the app performs on success.
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {}),
    page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) =>
        b.textContent.trim().startsWith("Unlock"),
      );
      btn?.click();
    }),
  ]);
  // give the hard-navigation a moment
  await new Promise((r) => setTimeout(r, 2500));

  const finalUrl = page.url();
  const body = await page.evaluate(() => document.body.innerText);
  const onDashboard =
    new URL(finalUrl).pathname === "/" &&
    (body.includes("Today") || body.includes("Collected today"));
  const stillLocked = body.includes("shop PIN");

  console.log("3. after Unlock, url =", finalUrl);
  console.log("   on dashboard:", onDashboard, "| still on lock:", stillLocked);
  console.log(
    onDashboard ? "\nLOGIN WORKS ✅" : "\nLOGIN STILL BROKEN ❌",
  );
  process.exitCode = onDashboard ? 0 : 1;
} finally {
  await browser.close();
}
