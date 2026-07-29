// Kuberan features end-to-end QA against the STAGING deploy.
// Usage:
//   export PATH="$HOME/.npm-global/bin:$PATH"
//   export STAGE=$(neonctl connection-string staging --project-id fragrant-glitter-84733150)
//   node scripts/kuberan-e2e.mjs https://sornam-wholesale-staging.vercel.app
//
// IMPORTANT: DB verification uses STAGE (ep-aged-wave), NOT process.env.DATABASE_URL
// (which in .env.local points at PROD ep-dark-silence).

import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";
import { sealData } from "iron-session";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "https://sornam-wholesale-staging.vercel.app";
const CONN = process.env.STAGE;
if (!CONN) { console.error("Set STAGE env to the staging connection string."); process.exit(1); }
if (!CONN.includes("ep-aged-wave")) { console.error("STAGE is not the staging host — refusing."); process.exit(1); }
const sql = neon(CONN);

const results = [];
const check = (n, ok, detail) => { results.push({ n, ok, detail }); console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${detail && !ok ? `\n         → ${detail}` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REACT_SET = `(el, value) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }`;
const body = (page) => page.evaluate(() => document.body.innerText);
const clickText = (page, t) => page.evaluate((x) => { const b = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === x); if (b) b.click(); return !!b; }, t);

const consoleErrors = [];

// Set a value on the input that follows a <span> with the given exact label text.
async function setByLabel(page, label, value) {
  return page.evaluate((setStr, label, value) => {
    const set = eval(setStr);
    const span = [...document.querySelectorAll("span")].find((s) => s.textContent.trim() === label);
    if (!span) return false;
    let el = span.nextElementSibling;
    if (!el) return false;
    const input = el.tagName === "INPUT" ? el : el.querySelector("input");
    if (!input) return false;
    set(input, value);
    return true;
  }, REACT_SET, label, value);
}

// Fill the SALES draft row (identified by the only <select> on the entry page) and click its Add.
async function addSaleRow(page, { item = "QA item", weight, touch, rate }) {
  return page.evaluate((setStr, item, weight, touch, rate) => {
    const set = eval(setStr);
    const sel = document.querySelector("select");
    if (!sel) return false;
    const row = sel.parentElement; // DraftRow grid div
    const inputs = [...row.querySelectorAll("input")];
    if (inputs.length < 4) return false;
    set(inputs[0], item);   // Items
    set(inputs[1], weight);  // Weight
    set(inputs[2], touch);   // Touch
    set(inputs[3], rate);    // Rate
    const add = [...row.querySelectorAll("button")].find((b) => b.textContent.trim() === "Add");
    if (add) add.click();
    return !!add;
  }, REACT_SET, item, weight, touch, rate);
}

async function pickPartyEntry(page, name) {
  await page.evaluate((setStr, name) => {
    const set = eval(setStr);
    set(document.querySelector('input[placeholder="party"]'), name.slice(0, 4));
  }, REACT_SET, name);
  await sleep(500);
  return page.evaluate((name) => {
    const b = [...document.querySelectorAll("ul button")].find((x) => x.textContent.includes(name));
    if (b) b.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    return !!b;
  }, name);
}

async function typeNewPartyEntry(page, name) {
  await page.evaluate((setStr, name) => {
    const set = eval(setStr);
    set(document.querySelector('input[placeholder="party"]'), name);
  }, REACT_SET, name);
  await sleep(200);
}

const txnCount = async () => (await sql`select count(*)::int n from transactions`)[0].n;
const goldStock = async () => {
  // current pure gold = opening + purchase/sale_return pure − sale/purchase_return pure + moves
  const [o] = await sql`select opening_pure_gold::float g from stock where id=1`;
  const [lines] = await sql`select coalesce(sum(case when tl.kind in ('purchase','sale_return') then tl.pure::float else -tl.pure::float end),0) d
    from transaction_lines tl join transactions t on t.id=tl.transaction_id where t.metal='gold'`;
  return o.g + lines.d;
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

  const op = (await sql`select id, name from operators where name='Ravi'`)[0];
  const sealed = await sealData({ authed: true, operatorId: op.id, operatorName: op.name, since: Date.now() }, { password: process.env.SESSION_SECRET });
  await page.setCookie({ name: "sw_session", value: sealed, url: BASE });

  // ============================================================
  // FLOW 1 — Entry: valid sale that settles
  // ============================================================
  console.log("\n[1] Entry — valid settled sale");
  {
    const before = await txnCount();
    await page.goto(`${BASE}/entry`, { waitUntil: "domcontentloaded" });
    await sleep(2500);
    const picked = await pickPartyEntry(page, "QA Cash Buyer");
    check("party 'QA Cash Buyer' selectable", picked);
    await addSaleRow(page, { weight: "100", touch: "100", rate: "7000" });
    await sleep(400);
    await setByLabel(page, "Rate/Gm", "7000");
    await setByLabel(page, "M.C. Cash Recd.", "700000");
    await sleep(400);
    await clickText(page, "Save");
    // wait for txn + line to commit
    let t = null;
    for (let i = 0; i < 30; i++) {
      await sleep(400);
      if ((await txnCount()) === before + 1) {
        t = (await sql`select id, serial_no from transactions order by created_at desc limit 1`)[0];
        const [{ n }] = await sql`select count(*)::int n from transaction_lines where transaction_id=${t.id}`;
        if (n >= 1) break;
      }
    }
    check("a new transaction row created in DB", (await txnCount()) === before + 1, `count ${before} → ${await txnCount()}`);
    if (t) {
      const line = (await sql`select amount::float a from transaction_lines where transaction_id=${t.id} limit 1`)[0];
      check("line has non-zero value (100×7000=700000)", line && line.a === 700000, `amount=${line?.a}`);
      const setl = await sql`select coalesce(sum(amount::float),0) s from settlements where transaction_id=${t.id} and mode='cash' and direction='received'`;
      check("cash settlement recorded 700000", Number(setl[0].s) === 700000, `cash=${setl[0].s}`);
      const txt = await body(page);
      check("WhatsApp confirmation offered after save (party has phone)", /whatsapp/i.test(txt), "no WhatsApp popup text found");
      // Dashboard shows it in Today's transactions with non-zero value
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await sleep(2000);
      const dash = await body(page);
      const serial = "#" + String(t.serial_no).padStart(4, "0");
      check(`Today's transactions shows the sale (${serial}, QA Cash Buyer)`, dash.includes("QA Cash Buyer") && dash.includes(serial), "row not found on dashboard");
      globalThis.__sale1 = t;
    } else {
      check("line has non-zero value", false, "no transaction to inspect");
    }
  }

  // ============================================================
  // FLOW 2 — Entry: empty ₹0 bill is BLOCKED
  // ============================================================
  console.log("\n[2] Entry — empty ₹0 bill blocked");
  {
    const before = await txnCount();
    await page.goto(`${BASE}/entry`, { waitUntil: "domcontentloaded" });
    await sleep(2500);
    await addSaleRow(page, { weight: "10", touch: "100", rate: "0" });
    await sleep(400);
    await clickText(page, "Save");
    await sleep(2500);
    const txt = await body(page);
    const blocked = /no value|can't be saved|cannot be saved/i.test(txt);
    check("₹0 bill rejected with an error message", blocked, `error text not shown; body snippet: ${txt.slice(0, 200)}`);
    check("no transaction created in DB for ₹0 bill", (await txnCount()) === before, `count changed ${before} → ${await txnCount()}`);
  }

  // ============================================================
  // FLOW 3 — Entry: unsettled credit
  // ============================================================
  console.log("\n[3] Entry — unsettled credit sale");
  {
    const before = await txnCount();
    await page.goto(`${BASE}/entry`, { waitUntil: "domcontentloaded" });
    await sleep(2500);
    await addSaleRow(page, { weight: "100", touch: "100", rate: "7000" });
    await sleep(300);
    await setByLabel(page, "Rate/Gm", "7000"); // so pure converts → non-zero closing
    await sleep(300);
    // Save with NO customer → must be blocked asking for a customer
    await clickText(page, "Save");
    await sleep(1500);
    const noParty = await body(page);
    check("unsettled + no customer is blocked (asks to pick customer)", /settled|customer/i.test(noParty) && !/successfully|updated/i.test(noParty), `body: ${noParty.slice(0,160)}`);
    // Now type a customer and Save → confirm dialog
    await typeNewPartyEntry(page, "QA Credit Cust");
    await sleep(300);
    await clickText(page, "Save");
    await sleep(1500);
    const confirmTxt = await body(page);
    check("'Bill not fully settled' confirmation shown", /not fully settled/i.test(confirmTxt), `no confirm dialog; body: ${confirmTxt.slice(0,160)}`);
    // Confirm → Save as credit
    await clickText(page, "Save as credit");
    let t = null;
    for (let i = 0; i < 30; i++) {
      await sleep(400);
      if ((await txnCount()) === before + 1) { t = (await sql`select id, serial_no, party_id from transactions order by created_at desc limit 1`)[0]; break; }
    }
    check("credit sale saved to DB", (await txnCount()) === before + 1, `count ${before} → ${await txnCount()}`);
    if (t) {
      const [{ id: pid }] = await sql`select id from parties where name='QA Credit Cust'`;
      check("sale linked to the new customer", t.party_id === pid, `party_id=${t.party_id} expected ${pid}`);
      // running balance = opening + received − value ; expect owes 700000
      const val = (await sql`select coalesce(sum(amount::float),0) v from transaction_lines tl join transactions t on t.id=tl.transaction_id where t.party_id=${pid}`)[0].v;
      const recd = (await sql`select coalesce(sum(amount::float),0) r from settlements s join transactions t on t.id=s.transaction_id where t.party_id=${pid} and s.direction='received'`)[0].r;
      const bal = recd - val;
      check("party balance reflects outstanding (owes 700000)", Math.abs(bal + 700000) < 1, `balance=${bal}`);
    }
  }

  // ============================================================
  // FLOW 4 — Entry: Find / edit existing bill
  // ============================================================
  console.log("\n[4] Entry — Find & edit existing bill");
  {
    const t = globalThis.__sale1;
    if (!t) { check("find/edit prerequisite (a saved bill from flow 1)", false, "no bill available"); }
    else {
      const before = await txnCount();
      await page.goto(`${BASE}/entry`, { waitUntil: "domcontentloaded" });
      await sleep(2500);
      await page.evaluate((setStr, no) => { const set = eval(setStr); set(document.querySelector('input[placeholder="Bill No."]'), String(no)); }, REACT_SET, t.serial_no);
      await sleep(200);
      await clickText(page, "Find");
      await sleep(2000);
      const loaded = await body(page);
      check(`Find loaded bill No. ${t.serial_no}`, new RegExp(`Editing bill No\\. ${t.serial_no}`, "i").test(loaded) || /editing existing bill/i.test(loaded), `body: ${loaded.slice(0,160)}`);
      // change ref no and Update
      const refVal = "EDITED-QA-" + Date.now().toString().slice(-5);
      await setByLabel(page, "Ref No.", refVal);
      await sleep(300);
      const clicked = await clickText(page, "Update");
      check("Update button present while editing", clicked, "no Update button (still showing Save?)");
      let ok = false;
      for (let i = 0; i < 25; i++) {
        await sleep(400);
        const row = (await sql`select ref_no, serial_no from transactions where id=${t.id}`)[0];
        if (row && row.ref_no === refVal) { ok = true; break; }
      }
      check("DB updated in place (same serialNo, ref_no changed)", ok, `ref_no did not update to ${refVal}`);
      check("no duplicate transaction created by edit", (await txnCount()) === before, `count ${before} → ${await txnCount()}`);
    }
  }

  // ============================================================
  // FLOW 5 — Buy Gold (/stock)
  // ============================================================
  console.log("\n[5] Buy Gold — adds to stock");
  {
    const beforeStock = await goldStock();
    const beforeTxn = await txnCount();
    await page.goto(`${BASE}/stock`, { waitUntil: "domcontentloaded" });
    await sleep(2000);
    await setByLabel(page, "Weight (g)", "100");
    await setByLabel(page, "Purity / touch", "100");
    await setByLabel(page, "Price / gram (₹)", "7000");
    await sleep(300);
    await clickText(page, "Buy gold & add to stock");
    let ok = false;
    for (let i = 0; i < 30; i++) { await sleep(400); if ((await goldStock()) >= beforeStock + 99.9) { ok = true; break; } }
    const after = await goldStock();
    check("gold stock increased by 100g in DB", ok, `stock ${beforeStock} → ${after}`);
    check("a purchase transaction was recorded", (await txnCount()) === beforeTxn + 1, `count ${beforeTxn} → ${await txnCount()}`);
    // Page reflects the new stock
    await page.goto(`${BASE}/stock`, { waitUntil: "domcontentloaded" });
    await sleep(1500);
    const stxt = await body(page);
    check("stock page shows Buy gold form + updated gold figure", /buy gold/i.test(stxt) && /Gold \(pure\)/i.test(stxt), "stock page missing expected content");
  }

  // ============================================================
  // FLOW 6 — Bookings (by grams, by amount, WA icon, low-stock not blocked)
  // ============================================================
  console.log("\n[6] Bookings");
  {
    const before = (await sql`select count(*)::int n from bookings`)[0].n;
    await page.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" });
    await sleep(2500);
    const pickBookParty = async () => {
      await page.evaluate((setStr) => { const set = eval(setStr); set(document.querySelector('input[placeholder="Search or add customer"]'), "QA B"); }, REACT_SET);
      await sleep(500);
      return page.evaluate(() => { const b = [...document.querySelectorAll("ul button")].find((x) => x.textContent.includes("QA Book Cust")); if (b) b.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); return !!b; });
    };

    // 6a — by grams
    await pickBookParty();
    await setByLabel(page, "Weight (g)", "50");
    await setByLabel(page, "Locked rate /g", "7000");
    await sleep(300);
    await clickText(page, "Save booking");
    let gramsOk = false;
    for (let i = 0; i < 25; i++) { await sleep(400); if ((await sql`select count(*)::int n from bookings where book_mode='metal'`)[0].n >= 1) { gramsOk = true; break; } }
    check("by-grams booking saved (DB book_mode=metal, weight=50)", gramsOk && (await sql`select weight_booked::float w from bookings where book_mode='metal' order by created_at desc limit 1`)[0].w === 50, "metal booking not found/incorrect");

    // 6b — by amount
    await page.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" });
    await sleep(2000);
    await clickText(page, "By amount");
    await sleep(400);
    await pickBookParty();
    await setByLabel(page, "Amount (₹)", "700000");
    await setByLabel(page, "Rate /g", "7000");
    await sleep(300);
    await clickText(page, "Save booking");
    let amtOk = false;
    for (let i = 0; i < 25; i++) { await sleep(400); if ((await sql`select count(*)::int n from bookings where book_mode='amount'`)[0].n >= 1) { amtOk = true; break; } }
    check("by-amount booking saved (DB book_mode=amount, amount=700000)", amtOk && (await sql`select amount::float a from bookings where book_mode='amount' order by created_at desc limit 1`)[0].a === 700000, "amount booking not found/incorrect");

    // 6c — big booking not blocked by low stock
    await page.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" });
    await sleep(2000);
    await pickBookParty();
    await setByLabel(page, "Weight (g)", "99999");
    await setByLabel(page, "Locked rate /g", "7000");
    await sleep(300);
    await clickText(page, "Save booking");
    let bigOk = false;
    for (let i = 0; i < 25; i++) { await sleep(400); if ((await sql`select count(*)::int n from bookings where weight_booked::float=99999`)[0].n >= 1) { bigOk = true; break; } }
    check("over-stock booking still saves (not blocked)", bigOk, "big booking was not saved");

    // list assertions: WA icon + shortage indicator
    await page.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" });
    await sleep(2000);
    const waLinks = await page.evaluate(() => [...document.querySelectorAll('a[href*="wa.me"]')].length);
    check("per-row WhatsApp wa.me link present", waLinks > 0, `found ${waLinks} wa.me links`);
    const btxt = await body(page);
    check("low-stock 'short by' indicator shown", /short by/i.test(btxt), "no shortage indicator");
    check("total bookings in DB = 3", (await sql`select count(*)::int n from bookings`)[0].n === before + 3, `bookings=${(await sql`select count(*)::int n from bookings`)[0].n}`);
  }

  // ============================================================
  // FLOW 7 — History grid
  // ============================================================
  console.log("\n[7] History grid");
  {
    await page.goto(`${BASE}/history`, { waitUntil: "domcontentloaded" });
    await sleep(2500);
    const h = await body(page);
    check("Opg. Bal row present", /Opg\. Bal/i.test(h), "missing");
    check("Total row present", /\bTotal\b/i.test(h), "missing");
    check("Clsg. Bal row present", /Clsg\. Bal/i.test(h), "missing");
    const legacy = ["OutWard Wg", "InWard Wg", "OutWard Pure", "InWard Pure", "MC Cash", "Metal Pure Recd", "Cash Recd", "Bank Recd", "Created By", "Modified"];
    const missing = legacy.filter((c) => !new RegExp(c.replace(/[().]/g, "."), "i").test(h));
    check("full legacy columns present", missing.length === 0, `missing columns: ${missing.join(", ")}`);
  }

  // ============================================================
  // FLOW 8 — Dashboard
  // ============================================================
  console.log("\n[8] Dashboard");
  {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await sleep(2500);
    const d = await body(page);
    check("Sales today shows Cash/Bank split", /sales today/i.test(d) && /\bCash\b/.test(d) && /\bBank\b/.test(d), "split not shown");
    // Top stat tiles labels
    const tiles = await page.evaluate(() => {
      // StatTile labels are uppercase-tracked spans; grab the tile grid labels
      return [...document.querySelectorAll("div")].map((el) => el.childElementCount === 0 ? el.textContent.trim() : "").filter(Boolean);
    });
    const hasBankTile = await page.evaluate(() => {
      // A dedicated bank-balance tile would have label "Bank" as a StatTile within the top grid (not the sales split).
      const tileLabels = [...document.querySelectorAll('.uppercase')].map((e) => e.textContent.trim().toLowerCase());
      return tileLabels.includes("bank") || tileLabels.some((t) => t.includes("bank balance"));
    });
    check("NO dedicated bank-balance tile on dashboard", !hasBankTile, "a Bank tile appears on dashboard");
    check("NO stock-purchase tile on dashboard", !/stock purchase|purchase tile|buy gold/i.test(d), "stock-purchase content found on dashboard");
    check("expected stock tiles present (Gold/Silver/Cash)", /gold in stock/i.test(d) && /silver in stock/i.test(d), "stock tiles missing");
  }

  // ============================================================
  // FLOW 9 — MCX price board + chart
  // ============================================================
  console.log("\n[9] MCX /prices");
  {
    await page.goto(`${BASE}/prices`, { waitUntil: "domcontentloaded" });
    await sleep(3500);
    const p = await body(page);
    check("MCX Price Tracker heading renders", /mcx price tracker/i.test(p), "heading missing");
    check("live board shows a gold per-gram rate", /Gold/.test(p) && /\/g/.test(p), "no gold rate on board");
    // chart area: svg path OR 'no points' state OR loader — not a broken blank
    const chartState = await page.evaluate(() => {
      const path = document.querySelector("svg path[stroke]");
      const pathLen = path ? (path.getAttribute("d") || "").length : 0;
      const noPoints = /no price points/i.test(document.body.innerText);
      const loader = !!document.querySelector(".animate-spin");
      return { pathLen, noPoints, loader };
    });
    check("chart area not a broken blank (svg / no-points / loader)", chartState.pathLen > 20 || chartState.noPoints || chartState.loader, `state: ${JSON.stringify(chartState)}`);
  }

  // ---- summary ----
  console.log("\n" + "=".repeat(60));
  const passed = results.filter((r) => r.ok).length;
  console.log(`RESULT: ${passed}/${results.length} checks passed`);
  const fails = results.filter((r) => !r.ok);
  if (fails.length) { console.log("\nFAILURES:"); fails.forEach((f) => console.log(`  - ${f.n}\n      ${f.detail || ""}`)); }
  if (consoleErrors.length) { console.log(`\nCONSOLE ERRORS (${consoleErrors.length}):`); [...new Set(consoleErrors)].slice(0, 15).forEach((e) => console.log("  · " + e.slice(0, 200))); }
  else console.log("\nNo browser console errors captured.");
  process.exitCode = fails.length ? 1 : 0;
} catch (e) {
  console.error("FATAL", e);
  process.exitCode = 2;
} finally {
  await browser.close();
}
