// Read-only audit of whatever is on staging: recomputes every headline number
// straight from the database rows and checks the app's own queries agree.
const { db } = await import("../lib/db/index.ts");
const S = await import("../lib/db/schema.ts");
const { getFullPnl } = await import("../lib/queries/pnl.ts");
const { listHistory } = await import("../lib/queries/history.ts");
const { getDailyTally } = await import("../lib/queries/dailyTally.ts");
const { getPosition, listBookings } = await import("../lib/queries/bookings.ts");
const { getMcxBook } = await import("../lib/queries/mcx.ts");
const { getPartyLedger } = await import("../lib/queries/partyLedger.ts");
const n = (v) => (v == null ? 0 : parseFloat(v));
let pass = 0, fail = 0;
const ok = (l, c, d = "") => { c ? pass++ : fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${l}${d ? ` — ${d}` : ""}`); };
const near = (a, b) => Math.abs(a - b) < 0.01;

const [txns, lines, setls, parties] = await Promise.all([
  db.select().from(S.transactions), db.select().from(S.transactionLines), db.select().from(S.settlements), db.select().from(S.parties)]);
const pname = new Map(parties.map((p) => [p.id, p.name]));
console.log("\nData on staging:");
for (const t of txns.sort((a, b) => a.serialNo - b.serialNo)) {
  const L = lines.filter((l) => l.transactionId === t.id), St = setls.filter((s) => s.transactionId === t.id);
  console.log(`  #${t.serialNo} ${t.trnType.padEnd(8)} ${String(pname.get(t.partyId) ?? "-").padEnd(11)} ${L.map((l) => `${n(l.weight)}g@${n(l.rate)}`).join(",").padEnd(12)} ${St.map((s) => `${s.mode} ${s.direction} ${n(s.amount)}`).join(", ")}`);
}

console.log("\n1. Physical P&L, recomputed by hand from the rows");
const buyW = lines.filter((l) => l.kind === "purchase").reduce((a, l) => a + n(l.weight), 0);
const buyA = lines.filter((l) => l.kind === "purchase").reduce((a, l) => a + n(l.amount), 0);
const sellW = lines.filter((l) => l.kind === "sale").reduce((a, l) => a + n(l.weight), 0);
const sellA = lines.filter((l) => l.kind === "sale").reduce((a, l) => a + n(l.amount), 0);
const expTx = new Set(txns.filter((t) => t.trnType === "expense").map((t) => t.id));
const exp = setls.filter((s) => expTx.has(s.transactionId)).reduce((a, s) => a + (s.direction === "paid" ? 1 : -1) * n(s.amount), 0);
const handGross = sellA - sellW * (buyA / buyW);
const full = await getFullPnl();
ok("avg buy", near(full.physical.totals.avgBuyRate, buyA / buyW), `${buyA / buyW}`);
ok("avg sell", near(full.physical.totals.avgSellRate, sellA / sellW), `${sellA / sellW}`);
ok("physical profit", near(full.totals.physicalGross, handGross), `${handGross}`);
ok("expenses (paid - received back)", near(full.totals.expenses, exp), `${exp}`);

console.log("\n2. MCX P&L, recomputed by hand");
const trades = await db.select().from(S.mcxTrades), closes = await db.select().from(S.mcxCloses);
const lastClose = closes.sort((a, b) => a.day.localeCompare(b.day)).at(-1);
let handOpen = 0;
for (const t of trades) if (t.price != null && lastClose) handOpen += (t.side === "buy" ? 1 : -1) * (n(lastClose.price) - n(t.price)) * n(t.lots) * 100;
ok("MCX open value", near(full.mcx.open, handOpen), `${handOpen} (close ${lastClose?.price} on ${lastClose?.day})`);
ok("MCX total = booked + open", near(full.mcx.total, full.mcx.realised + full.mcx.open));
ok("net = physical + MCX - expenses", near(full.totals.net, handGross + full.mcx.total - exp), `${full.totals.net}`);
ok("daily rows add up to the totals", near(full.days.reduce((a, d) => a + d.total, 0), full.totals.net));

console.log("\n3. Hedge check");
const pos = await getPosition();
const mcxBook = await getMcxBook();
ok("MCX lots in hedge = net of the trade register", near(pos.position.mcxLots, mcxBook.netLots), `${pos.position.mcxLots}`);
ok("hedge state", true, `book ${pos.position.bookLots} + MCX ${pos.position.mcxLots} = ${pos.position.netLots} (${pos.position.hedged ? "square" : "NOT square"})`);

console.log("\n4. History and the daily tally agree");
const h = await listHistory({});
let cash = 0, bank = 0;
for (const r of h) { cash += r.cashRecd - r.cashPaid; bank += r.bankRecd - r.bankPaid; }
const tally = await getDailyTally();
const cashT = tally.length ? tally[0].closingCash : 0, bankT = tally.length ? tally[0].closingBank : 0;
ok("cash: history running total = expenses-page closing", near(cash, cashT), `${cash}`);
ok("bank: history running total = expenses-page closing", near(bank, bankT), `${bank}`);
const purchase = h.find((r) => r.trnType === "purchase");
ok("purchase cash landed in Cash PAID (not recd)", !purchase || (purchase.cashPaid > 0 && purchase.cashRecd === 0));

console.log("\n5. Every customer's carry-forward chains");
for (const p of parties) {
  const led = await getPartyLedger(p.id);
  let chained = true;
  led.rows.forEach((r, i) => { if (i > 0 && !near(r.openingCash, led.rows[i - 1].closingCash)) chained = false; });
  ok(`${p.name}: each bill opens where the last closed`, chained, `${led.rows.length} bill(s), carried ${led.closingCash}`);
}

console.log("\n6. Bookings");
const bk = await listBookings();
for (const b of bk) ok(`booking #${b.serialNo} ${b.partyName}: pending = WT - delivered`, near(b.pending, b.weight - b.delivered), `${b.bookType} ${b.side} pending ${b.pending}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
