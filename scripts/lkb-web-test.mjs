// Web-layer smoke test + Excel round trip against the dev server on :3941
// (which must be pointed at the STAGING database).
import { sealData } from "iron-session";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";

const BASE = "http://localhost:3941";
const XLSX = "/Users/ragul/Downloads/Copy of Copy of L K B BOOKING.xlsx";
let pass = 0, fail = 0;
const ok = (l, c, d = "") => { if (c) { pass++; console.log(`  ok   ${l}${d ? ` — ${d}` : ""}`); } else { fail++; console.log(`  FAIL ${l}${d ? ` — ${d}` : ""}`); } };

const { db } = await import("../lib/db/index.ts");
const schema = await import("../lib/db/schema.ts");
// Prove we are talking to staging, not production.
const url = process.env.DATABASE_URL ?? "";
ok("dev server DB is the staging branch", url.includes("ep-aged-wave"), url.match(/ep-[a-z0-9-]+/)?.[0] ?? "unknown");

const [op] = await db.select().from(schema.operators).limit(1);
const sealed = await sealData(
  { authed: true, operatorId: op.id, operatorName: op.name, since: Date.now() },
  { password: process.env.SESSION_SECRET },
);
const cookie = `sw_session=${sealed}`;
const get = (p) => fetch(`${BASE}${p}`, { headers: { cookie } });

console.log("\n-- pages render --");
for (const p of ["/", "/entry", "/bookings", "/bookings/import", "/expenses", "/history", "/pnl", "/stock", "/parties", "/settings"]) {
  const r = await get(p);
  const body = await r.text();
  ok(`${p} → ${r.status}`, r.status === 200 && !/Application error|Internal Server Error/i.test(body));
}

console.log("\n-- the new screens show what they should --");
const bookingsHtml = await (await get("/bookings")).text();
// The sheet tabs and the default R SELL grid are in the server HTML; the hedge
// panel only renders once the "- OR +" tab is clicked, so it is asserted in
// scripts/lkb-browser-test.mjs instead.
for (const s of ["R SELL", "R BUY", "F SELL", "F BUY", "UF SELL", "UF BUY", "CUSTOMERS", "- OR +", "PENDING", "PREMIUM"])
  ok(`bookings page has "${s}"`, bookingsHtml.includes(s));

const entryHtml = await (await get("/entry")).text();
ok("entry has the booking picker", entryHtml.includes("Booking…"));
ok("entry no longer offers a Live rate button", !/>Live</.test(entryHtml));
ok("entry shows Bank Recd in words", /Bank Recd(<!-- -->)?:/.test(entryHtml));
ok("entry shows the carried-forward labels", entryHtml.includes("OpgPure") && entryHtml.includes("OpgCash"));

const pnlHtml = await (await get("/pnl")).text();
ok("P&L has average buy and sell rates", pnlHtml.includes("Avg buy rate") && pnlHtml.includes("Avg sell rate"));

const histHtml = await (await get("/history")).text();
ok("history shows the booking tally", histHtml.includes("Book exposure") && histHtml.includes("Net (must be 0)"));
ok("history shows cash/bank tally", histHtml.includes("Cash net") && histHtml.includes("Bank net"));
ok("history dropped the fake MC Cash placeholders", !histHtml.includes("MC Cash(O)"));
ok("history has running balances", histHtml.includes("Cash Bal") && histHtml.includes("Bank Bal"));

const setHtml = await (await get("/settings")).text();
ok("settings has editable templates", setHtml.includes("WhatsApp message wording") && setHtml.includes("{customer}"));

console.log("\n-- import their real workbook (dry run) --");
const fd = new FormData();
fd.append("file", new Blob([readFileSync(XLSX)]), "L K B BOOKING.xlsx");
fd.append("dryRun", "1");
const impRes = await fetch(`${BASE}/api/bookings/import`, { method: "POST", headers: { cookie }, body: fd });
const imp = await impRes.json();
ok("import parses the file", imp.ok === true, imp.error ?? "");
if (imp.ok) {
  const b = imp.bookings;
  // R SELL: Ragul 1000 + Ragul 500 · R BUY: Vivek 500 · UF SELL: Ragul 1000
  ok("4 booking rows found across the sheets", imp.counts.bookings === 4, JSON.stringify(imp.counts));
  const ragul1000 = b.find((x) => x.name === "Ragul" && x.weight === 1000 && x.sheet === "R SELL");
  ok("R SELL Ragul 1000g @ 15768 read", !!ragul1000 && ragul1000.rate === 15768 && ragul1000.mcxRate === 152818);
  ok("R BUY Vivek 500g @ 15450 read", b.some((x) => x.sheet === "R BUY" && x.name === "Vivek" && x.weight === 500 && x.rate === 15450));
  ok("UF SELL Ragul 1000g read", b.some((x) => x.sheet.includes("UF") && x.weight === 1000 && x.mcxRate === 152818));
  ok("lot positions read (Suresh, Ganesh, 2 MCX ids)", imp.counts.lots === 4, JSON.stringify(imp.lots));
  const suresh = imp.lots.find((l) => l.name === "Suresh");
  ok("Suresh 0.5 sell lots", suresh && suresh.sellLots === 0.5);
  const mcx2 = imp.lots.find((l) => l.name === "MCX ID 2");
  ok("MCX ID 2 = 1 sell / 2 buy", mcx2 && mcx2.sellLots === 1 && mcx2.buyLots === 2);
}

console.log("\n-- export writes their workbook back --");
const expRes = await fetch(`${BASE}/api/bookings/export`, { headers: { cookie } });
ok("export responds as an xlsx", expRes.status === 200 && (expRes.headers.get("content-type") ?? "").includes("spreadsheetml"));
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(await expRes.arrayBuffer());
const names = wb.worksheets.map((w) => w.name);
ok("all six sheets present", ["R SELL", "R BUY", "F SELL", "F BUY", "UF CUS", "- OR +"].every((n) => names.includes(n)), names.join(", "));
const rs = wb.getWorksheet("R SELL");
ok("R SELL headers match theirs",
  ["DATE", "NAME", "WT", "RATE", "DELIVERY", "PENDING", "MCX BUY", "PREMIUM", "REMARKS"]
    .every((h, i) => rs.getRow(1).getCell(i + 1).value === h));
ok("PENDING is a live formula", rs.getCell("F2").formula === "C2-E2", rs.getCell("F2").formula ?? "none");
ok("PREMIUM is a live formula", rs.getCell("H2").formula === "D2-G2*0.1", rs.getCell("H2").formula ?? "none");
const pos = wb.getWorksheet("- OR +");
ok("lots conversion formula kept", pos.getCell("K3").formula === "O3*0.1%", pos.getCell("K3").formula ?? "none");
ok("hedge check formula kept", pos.getCell("K14").formula === "SUM(K11:K13)", pos.getCell("K14").formula ?? "none");
ok("position sheet pulls from R SELL", (pos.getCell("M3").formula ?? "").startsWith("'R SELL'!$F$"), pos.getCell("M3").formula ?? "none");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
