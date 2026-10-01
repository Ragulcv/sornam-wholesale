// End-to-end against the STAGING database (ep-aged-wave).
// Exercises the booking register, booking->bill delivery, carry-forward,
// negative expenses, the daily tally, P&L and the hedge position.
// Creates its own uniquely-named data and deletes it at the end.

const tag = `T${Date.now().toString().slice(-6)}`;
let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};
const near = (a, b, eps = 0.005) => Math.abs(a - b) < eps;

const { db } = await import("../lib/db/index.ts");
const schema = await import("../lib/db/schema.ts");
const { eq, inArray, like } = await import("drizzle-orm");
const bk = await import("../lib/queries/bookings.ts");
const { createTransaction } = await import("../lib/queries/transactions.ts");
const { findOrCreateParty } = await import("../lib/queries/parties.ts");
const { getPartyLedger, getCarryForward } = await import("../lib/queries/partyLedger.ts");
const { getDailyTally } = await import("../lib/queries/dailyTally.ts");
const { getPnl } = await import("../lib/queries/pnl.ts");
const { computePosition } = await import("../lib/lkb.ts");

const created = { parties: [], txns: [], bookings: [], lots: [] };

async function cleanup() {
  try {
    if (created.txns.length) await db.delete(schema.transactions).where(inArray(schema.transactions.id, created.txns));
    if (created.bookings.length) await db.delete(schema.bookings).where(inArray(schema.bookings.id, created.bookings));
    if (created.lots.length) await db.delete(schema.mcxPositions).where(inArray(schema.mcxPositions.id, created.lots));
    if (created.parties.length) await db.delete(schema.parties).where(inArray(schema.parties.id, created.parties));
  } catch (e) { console.log("cleanup warning:", e.message); }
}

try {
  console.log(`\n=== LKB end-to-end (${tag}) ===`);

  // ---------------------------------------------------------------- bookings
  console.log("\n-- 1. booking register, their sheet's own numbers --");
  const pRagul = await findOrCreateParty(`${tag} Ragul`, "9876500001");
  const pVivek = await findOrCreateParty(`${tag} Vivek`, "9876500002");
  created.parties.push(pRagul, pVivek);

  const b1 = await bk.createBooking({ partyId: pRagul, bookType: "ready", side: "sell", metal: "gold", weight: 1000, rate: 15768, mcxRate: 152818, operatorName: "test" });
  const b2 = await bk.createBooking({ partyId: pRagul, bookType: "ready", side: "sell", metal: "gold", weight: 500, rate: 15500, operatorName: "test" });
  const b3 = await bk.createBooking({ partyId: pVivek, bookType: "ready", side: "buy", metal: "gold", weight: 500, rate: 15450, operatorName: "test" });
  const b4 = await bk.createBooking({ partyId: pRagul, bookType: "unfixed", side: "sell", metal: "gold", weight: 1000, mcxRate: 152818, operatorName: "test" });
  created.bookings.push(b1.id, b2.id, b3.id, b4.id);

  const mine = (rows) => rows.filter((r) => created.bookings.includes(r.id));
  let rows = mine(await bk.listBookings());
  ok("4 bookings created", rows.length === 4);
  const r1 = rows.find((r) => r.id === b1.id);
  ok("PENDING = WT - DELIVERY", near(r1.pending, 1000), `${r1.pending}`);
  ok("PREMIUM = RATE - MCX x 0.1", near(r1.premium, 486.2), `${r1.premium}`);
  const r2 = rows.find((r) => r.id === b2.id);
  ok("PREMIUM blank when MCX missing (their sheet showed 15500)", r2.premium === null, `${r2.premium}`);
  ok("newest booking is on top", rows[0].serialNo === Math.max(...rows.map((r) => r.serialNo)));

  // ------------------------------------------------------- delivery closes it
  console.log("\n-- 2. billing a booking reduces PENDING and closes it --");
  const partial = await createTransaction({
    trnType: "sales", partyId: pRagul, metal: "gold", barRate: 15768,
    lines: [{ kind: "sale", particulars: "Gold pure", weight: 400, touch: 100, rate: 15768, bookingId: b1.id }],
    movements: [], settlements: [{ mode: "cash", direction: "received", amount: 6307200 }],
    operatorName: "test",
  });
  created.txns.push(partial.id);
  await bk.recordDelivery(b1.id, partial.id, 400);
  let after = await bk.getBooking(b1.id);
  ok("partial delivery leaves the remainder pending", near(after.pending, 600), `pending ${after.pending}`);
  ok("status goes to partial", after.status === "partial", after.status);

  const rest = await createTransaction({
    trnType: "sales", partyId: pRagul, metal: "gold", barRate: 15768,
    lines: [{ kind: "sale", particulars: "Gold pure", weight: 600, touch: 100, rate: 15768, bookingId: b1.id }],
    movements: [], settlements: [],
    operatorName: "test",
  });
  created.txns.push(rest.id);
  await bk.recordDelivery(b1.id, rest.id, 600);
  after = await bk.getBooking(b1.id);
  ok("fully delivered leaves nothing pending", near(after.pending, 0), `pending ${after.pending}`);
  ok("status goes to delivered", after.status === "delivered", after.status);

  const stillOffered = (await bk.listBookings({ pendingOnly: true })).filter((r) => r.id === b1.id);
  ok("a delivered booking drops out of the entry picker", stillOffered.length === 0);

  // ----------------------------------------------------------- carry forward
  console.log("\n-- 3. carry-forward per customer (receipts negative) --");
  const led = await getPartyLedger(pRagul);
  ok("both bills are chained to the customer", led.rows.length === 2, `${led.rows.length} rows`);
  const [bill1, bill2] = led.rows;
  ok("bill 1 receipt shows negative", bill1.cashReceipt < 0, `${bill1.cashReceipt}`);
  ok("bill 1 settles to zero", near(bill1.closingCash, 0), `closing ${bill1.closingCash}`);
  ok("bill 2 opens where bill 1 closed", near(bill2.openingCash, bill1.closingCash), `${bill2.openingCash} vs ${bill1.closingCash}`);
  ok("bill 2 with no receipt shows 0, not blank", bill2.cashReceipt === 0, `${bill2.cashReceipt}`);
  const owed = 600 * 15768;
  ok("unpaid bill leaves the customer owing (negative)", near(bill2.closingCash, -owed), `${bill2.closingCash} vs ${-owed}`);
  const cf = await getCarryForward(pRagul);
  ok("next bill opens at the carried balance", near(cf.cash, -owed), `${cf.cash}`);
  const cfMid = await getCarryForward(pRagul, rest.id);
  ok("editing a bill shows the position before it", near(cfMid.cash, bill2.openingCash), `${cfMid.cash}`);

  // ------------------------------------------------------- negative expenses
  console.log("\n-- 4. an expense of -1000 reads as cash received --");
  const expOut = await createTransaction({
    trnType: "expense", partyId: null, metal: "gold",
    lines: [], movements: [], settlements: [{ mode: "cash", direction: "paid", amount: 5000 }],
    operatorName: "test",
  });
  const expIn = await createTransaction({
    trnType: "expense", partyId: null, metal: "gold",
    lines: [], movements: [],
    // what the action does when -1000 is keyed in
    settlements: [{ mode: "cash", direction: "received", amount: 1000 }],
    operatorName: "test",
  });
  created.txns.push(expOut.id, expIn.id);

  const tally = await getDailyTally();
  const todayKey = new Date().toLocaleDateString("en-CA"); // local day, as the shop counts it
  const today = tally.find((d) => d.date === todayKey);
  ok("today appears in the daily tally", !!today);
  ok("the -1000 lands in 'received back'", today && today.expenseCashIn >= 1000, `${today?.expenseCashIn}`);
  ok("the 5000 lands in expenses", today && today.expenseCash >= 5000, `${today?.expenseCash}`);
  const expectedClose = today.openingCash + today.tradeCashIn - today.tradeCashOut - today.expenseCash + today.expenseCashIn;
  ok("closing = opening + in - out - expense + received", near(today.closingCash, expectedClose), `${today.closingCash} vs ${expectedClose}`);

  // ------------------------------------------------------------------- P & L
  console.log("\n-- 5. profit and loss --");
  const buy = await createTransaction({
    trnType: "purchase", partyId: pVivek, metal: "gold", barRate: 15000,
    lines: [{ kind: "purchase", particulars: "Gold pure", weight: 1000, touch: 100, rate: 15000 }],
    movements: [], settlements: [{ mode: "bank", direction: "paid", amount: 15000000 }],
    operatorName: "test",
  });
  created.txns.push(buy.id);
  const pnl = await getPnl({ from: todayKey, to: todayKey });
  const day = pnl.days[0];
  ok("day has an average buy rate", day && day.avgBuyRate > 0, `${day?.avgBuyRate}`);
  ok("day has an average sell rate", day && day.avgSellRate > 0, `${day?.avgSellRate}`);
  ok("gross profit = sales value - cost of sales", near(day.grossProfit, day.sellAmount - day.costOfSales), `${day.grossProfit}`);
  ok("net profit = gross - expenses", near(day.netProfit, day.grossProfit - day.expenses), `${day.netProfit}`);
  ok("expenses net off the -1000", near(day.expenses, 4000), `${day.expenses}`);

  // --------------------------------------------------------------- hedge book
  console.log("\n-- 6. hedge position (the '- OR +' sheet) --");
  const l1 = await bk.saveLotPosition({ block: "customer", name: `${tag} Suresh`, sellLots: 0.5, buyLots: 0 });
  const l2 = await bk.saveLotPosition({ block: "account", name: `${tag} MCX ID`, sellLots: 0, buyLots: 1 });
  const lotRows = (await bk.listLotPositions()).filter((l) => l.name.startsWith(tag));
  created.lots.push(...lotRows.map((l) => l.id));
  ok("lot positions saved", lotRows.length === 2);

  const myRows = mine(await bk.listBookings());
  const totals = bk.bookTotals(myRows);
  ok("R SELL pending totals only what is left", near(totals.readySellPending, 500), `${totals.readySellPending}`);
  ok("R BUY pending", near(totals.readyBuyPending, 500), `${totals.readyBuyPending}`);
  ok("UF SELL carries the whole WT", near(totals.unfixedSellWeight, 1000), `${totals.unfixedSellWeight}`);

  const pos = computePosition({
    ...totals,
    customerLots: [{ name: "Suresh", sellLots: 0.5, buyLots: 0 }],
    accountLots: [{ name: "MCX ID", sellLots: 0, buyLots: 1 }],
  });
  // R: buy 500 - sell 500 = 0 lots. UF: sell 1000 - buy 0 = +1 lot. CUS: +0.5.
  ok("book exposure in lots", near(pos.bookLots, 1.5), `${pos.bookLots}`);
  ok("MCX position in lots", near(pos.mcxLots, 1), `${pos.mcxLots}`);
  ok("net is not zero, so it flags", !pos.hedged && near(pos.netLots, 2.5), `${pos.netLots}`);
  ok("it says which way to trade", pos.actionLots < 0, `sell ${Math.abs(pos.actionLots)} lots`);

  console.log(`\n${pass} passed, ${fail} failed`);
} catch (e) {
  console.error("\nERROR:", e);
  fail++;
} finally {
  await cleanup();
  console.log("cleaned up test data");
}
process.exit(fail ? 1 : 0);
