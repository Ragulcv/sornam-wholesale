import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://localhost:3940";
const results = [];
const check = (n, ok) => { results.push(ok); console.log(`  ${ok ? "✓" : "✗"} ${n}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.goto(`${BASE}/lock`, { waitUntil: "domcontentloaded" });
  await sleep(1500); // hydrate
  for (const d of ["1", "2", "3", "4"]) {
    await page.evaluate((x) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === x)?.click(), d);
    await sleep(90);
  }
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Unlock"))?.click());
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Ravi"), { timeout: 15000 }).catch(() => {});

  const txt = await page.evaluate(() => document.body.innerText);
  check("operator picker shows after PIN", txt.includes("Who's working") || txt.includes("Ravi"));
  check("seeded operators listed", txt.includes("Ravi") && txt.includes("Suresh") && txt.includes("Meena"));

  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Ravi")?.click());
  await page.waitForFunction(() => location.pathname === "/" && document.body.innerText.includes("Today"), { timeout: 10000 }).catch(() => {});
  check("lands on dashboard after picking operator", new URL(page.url()).pathname === "/");
  check("topbar shows operator name", (await page.evaluate(() => document.body.innerText)).includes("Ravi"));

  // proxy: no session → /lock
  const ctx = await browser.createBrowserContext();
  const anon = await ctx.newPage();
  await anon.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
  await sleep(500);
  check("unauthenticated route redirects to /lock", anon.url().includes("/lock"));
  await ctx.close();

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  await browser.close();
}
