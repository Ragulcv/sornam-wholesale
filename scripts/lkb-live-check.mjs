// Confirms the deployed staging build actually serves the new screens.
import { sealData } from "iron-session";
const BASE = process.env.LIVE_BASE ?? "https://sornam-wholesale-staging.vercel.app";
let pass = 0, fail = 0;
const ok = (l, c, d = "") => { if (c) { pass++; console.log(`  ok   ${l}${d ? ` — ${d}` : ""}`); } else { fail++; console.log(`  FAIL ${l}${d ? ` — ${d}` : ""}`); } };

const { db } = await import("../lib/db/index.ts");
const schema = await import("../lib/db/schema.ts");
const [op] = await db.select().from(schema.operators).limit(1);
const sealed = await sealData({ authed: true, operatorId: op.id, operatorName: op.name, since: Date.now() }, { password: process.env.SESSION_SECRET });
const get = (p) => fetch(`${BASE}${p}`, { headers: { cookie: `sw_session=${sealed}` }, redirect: "manual" });

console.log(`\nchecking ${BASE}`);
const lock = await fetch(`${BASE}/lock`);
ok("/lock reachable", lock.status === 200);

for (const p of ["/", "/entry", "/bookings", "/bookings/import", "/expenses", "/history", "/pnl", "/stock", "/parties", "/settings"]) {
  const r = await get(p);
  ok(`${p} → ${r.status}`, r.status === 200);
}
const bookings = await (await get("/bookings")).text();
ok("workbook sheets deployed", ["R SELL", "UF BUY", "CUSTOMERS", "- OR +", "PREMIUM"].every((s) => bookings.includes(s)));
const entry = await (await get("/entry")).text();
ok("entry: booking picker deployed", entry.includes("Booking…"));
ok("entry: no Live rate button", !/>Live</.test(entry));
ok("entry: amounts in words", /Bank Recd(<!-- -->)?:/.test(entry));
const pnl = await (await get("/pnl")).text();
ok("P&L deployed", pnl.includes("Avg buy rate") && pnl.includes("Avg sell rate"));
const settings = await (await get("/settings")).text();
ok("message templates deployed", settings.includes("WhatsApp message wording"));
const hist = await (await get("/history")).text();
ok("history running balances deployed", hist.includes("Cash Bal") && !hist.includes("MC Cash(O)"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
