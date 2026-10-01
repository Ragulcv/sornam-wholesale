// Plays the exact steps of the testing guide through the real code paths
// (same functions the screens call, same inputs the forms send), checks every
// expected value the guide states, then wipes staging back to empty.
const { db } = await import("../lib/db/index.ts");
const S = await import("../lib/db/schema.ts");
const { sql } = await import("drizzle-orm");
const bk = await import("../lib/queries/bookings.ts");
const { createTransaction } = await import("../lib/queries/transactions.ts");
const { findOrCreateParty } = await import("../lib/queries/parties.ts");
const { getPartyLedger, getCarryForward } = await import("../lib/queries/partyLedger.ts");
const { getPnl } = await import("../lib/queries/pnl.ts");
const { getDailyTally } = await import("../lib/queries/dailyTally.ts");
const { listHistory } = await import("../lib/queries/history.ts");
const { reconcile } = await import("../lib/bullion.ts");
const { computePosition } = await import("../lib/lkb.ts");
const { rupeesInWords } = await import("../lib/words.ts");
const { buildBookingWhatsapp, buildSalesWhatsapp } = await import("../lib/whatsapp.ts");
const { fmtMoney } = await import("../lib/format.ts");

if (!process.env.DATABASE_URL.includes("ep-aged-wave")) throw new Error("staging only");
let pass = 0, fail = 0;
const eq = (l, got, want) => { const ok = typeof want === "number" ? Math.abs(got - want) < 0.005 : got === want;
  ok ? pass++ : fail++; console.log(`  ${ok ? "ok  " : "FAIL"} ${l}: ${JSON.stringify(got)}${ok ? "" : `  (want ${JSON.stringify(want)})`}`); };
const today = new Date().toLocaleDateString("en-CA");
const recon = (o) => reconcile({ saleLines: [], returnLines: [], metalMoves: [], ratePerGram: 0, intDisPure: 0, intDisCash: 0,
  mcCashRecd: 0, bankRecd: 0, cashBankRecd: 0, conversion: "cash", discountPure: 0, discountCash: 0, ...o });
const pos = async () => { const g = await bk.getPosition(); return g.position; };

console.log("\n== STEP 0: customers ==");
const kumar = await findOrCreateParty("Test Kumar", "9999900001");
const vivek = await findOrCreateParty("Test Vivek");

console.log("\n== TEST 1: hedge ==");
const bR = await bk.createBooking({ partyId: kumar, bookType: "ready", side: "sell", metal: "gold", weight: 1000, rate: 15000, mcxRate: 148000, operatorName: "t" });
await bk.createBooking({ partyId: vivek, bookType: "ready", side: "buy", metal: "gold", weight: 500, rate: 14900, mcxRate: 148000, operatorName: "t" });
await bk.createBooking({ partyId: kumar, bookType: "unfixed", side: "sell", metal: "gold", weight: 1000, mcxRate: 148000, operatorName: "t" });
const rows = await bk.listBookings();
eq("R SELL premium", rows.find((r) => r.bookType === "ready" && r.side === "sell").premium, 200);
eq("R SELL value", rows.find((r) => r.bookType === "ready" && r.side === "sell").value, 15000000);
eq("R BUY premium", rows.find((r) => r.side === "buy").premium, 100);
eq("UF premium blank", rows.find((r) => r.bookType === "unfixed").premium, null);
let p = await pos();
eq("before lots: R lots", p.readyLots, -0.5); eq("UF lots", p.unfixedLots, 1); eq("book", p.bookLots, 0.5); eq("net", p.netLots, 0.5); eq("action", p.actionLots, -0.5);
await bk.saveLotPosition({ block: "customer", name: "Suresh", sellLots: 0.5, buyLots: 0 });
p = await pos(); eq("after Suresh: net", p.netLots, 1);
await bk.saveLotPosition({ block: "account", name: "MCX ID 1", sellLots: 1, buyLots: 0 });
p = await pos(); eq("after MCX ID 1 sell 1: mcx", p.mcxLots, -1); eq("net", p.netLots, 0); eq("hedged", p.hedged, true);
const summ = await bk.bookingSummary();
eq("summary customers", summ.customers, 2); eq("summary bookings", summ.totalCount, 3); eq("pending", summ.pendingCount, 3); eq("pending grams", summ.pendingGrams, 2500);

console.log("\n== TEST 2: carry-forward ==");
let r = recon({ saleLines: [{ weight: 10, touch: 100 }], ratePerGram: 15000, mcCashRecd: 50000 });
eq("bill1 total pure", r.totalPure, 10); eq("bill1 total cash", r.billValue, 150000); eq("bill1 recd box", r.receiptsSigned, -50000); eq("bill1 clsg pure", r.closingPure, 0); eq("bill1 clsg cash", r.closingCash, -100000);
eq("words 50000", rupeesInWords(50000), "Rupees Fifty Thousand Only");
const anand = await findOrCreateParty("Test Anand");
const b1 = await createTransaction({ trnType: "sales", partyId: anand, metal: "gold", txnDate: today, barRate: 15000, operatorName: "t",
  lines: [{ kind: "sale", particulars: "Gold pure", weight: 10, touch: 100, rate: 15000 }], movements: [],
  settlements: [{ mode: "cash", direction: "received", amount: 50000 }] });
eq("bill1 number", b1.serialNo, 1);
let cf = await getCarryForward(anand);
eq("bill2 OpgCash", cf.cash, -100000); eq("bill2 OpgPure", cf.pure, 0); eq("after bill No.", cf.lastBillNo, 1);
r = recon({ saleLines: [{ weight: 5, touch: 100 }], ratePerGram: 15000, bankRecd: 175000 });
eq("bill2 total cash", r.billValue, 75000); eq("bill2 recd box", r.receiptsSigned, -175000); eq("bill2 clsg cash", r.closingCash, 100000);
eq("bill2 after-this-bill", cf.cash + r.closingCash, 0);
eq("words 175000", rupeesInWords(175000), "Rupees One Lakh Seventy Five Thousand Only");
const b2 = await createTransaction({ trnType: "sales", partyId: anand, metal: "gold", txnDate: today, barRate: 15000, operatorName: "t",
  lines: [{ kind: "sale", particulars: "Gold pure", weight: 5, touch: 100, rate: 15000 }], movements: [],
  settlements: [{ mode: "bank", direction: "received", amount: 175000 }] });
const led = await getPartyLedger(anand);
eq("ledger rows", led.rows.length, 2);
eq("L1 opg cash", led.rows[0].openingCash, 0); eq("L1 cash", led.rows[0].cashMoved, -100000); eq("L1 cash paid", led.rows[0].cashReceipt, -50000); eq("L1 bank", led.rows[0].bankReceipt, 0); eq("L1 clsg pure", led.rows[0].closingPure, 0); eq("L1 clsg cash", led.rows[0].closingCash, -100000);
eq("L2 opg cash", led.rows[1].openingCash, -100000); eq("L2 cash", led.rows[1].cashMoved, 100000); eq("L2 bank", led.rows[1].bankReceipt, -175000); eq("L2 clsg cash", led.rows[1].closingCash, 0); eq("L2 clsg pure", led.rows[1].closingPure, 0);
cf = await getCarryForward(anand); eq("bill3 OpgCash", cf.cash, 0);

console.log("\n== TEST 3: P&L (purchase + expenses) ==");
r = recon({ saleLines: [{ weight: 20, touch: 100 }], ratePerGram: 14000, mcCashRecd: 280000 });
eq("purchase total cash", r.billValue, 280000); eq("purchase clsg", r.closingCash, 0);
const cfV = await getCarryForward(vivek); eq("vivek opg before", cfV.cash, 0);
const b3 = await createTransaction({ trnType: "purchase", partyId: vivek, metal: "gold", txnDate: today, barRate: 14000, operatorName: "t",
  lines: [{ kind: "purchase", particulars: "Gold pure", weight: 20, touch: 100, rate: 14000 }], movements: [],
  settlements: [{ mode: "cash", direction: "paid", amount: 280000 }] });
eq("vivek account after purchase (settled)", (await getCarryForward(vivek)).cash, 0);
let pnl = (await getPnl({ from: today, to: today })).totals;
eq("buy wt", pnl.buyWeight, 20); eq("avg buy", pnl.avgBuyRate, 14000); eq("sell wt", pnl.sellWeight, 15); eq("sell value", pnl.sellAmount, 225000); eq("avg sell", pnl.avgSellRate, 15000);
eq("cost of sales", pnl.costOfSales, 210000); eq("gross", pnl.grossProfit, 15000); eq("net", pnl.netProfit, 15000);
await createTransaction({ trnType: "expense", partyId: null, metal: "gold", txnDate: today, operatorName: "t", lines: [], movements: [], settlements: [{ mode: "cash", direction: "paid", amount: 5000 }] });
pnl = (await getPnl({ from: today, to: today })).totals; eq("after 5000 expense: net", pnl.netProfit, 10000);
await createTransaction({ trnType: "expense", partyId: null, metal: "gold", txnDate: today, operatorName: "t", lines: [], movements: [], settlements: [{ mode: "cash", direction: "received", amount: 1000 }] });
pnl = (await getPnl({ from: today, to: today })).totals; eq("after -1000: expenses", pnl.expenses, 4000); eq("net", pnl.netProfit, 11000);
console.log("  formats:", fmtMoney(15000), fmtMoney(-234000), fmtMoney(14000));

console.log("\n== TEST 4: history ==");
const h = await listHistory({});
eq("history rows", h.length, 5);
const by = Object.fromEntries(h.map((x) => [x.serialNo, x]));
eq("#1 outward wg", by[1].outwardWg, 10); eq("#1 cash recd", by[1].cashRecd, 50000);
eq("#2 bank recd", by[2].bankRecd, 175000);
eq("#3 inward wg", by[3].inwardWg, 20); eq("#3 cash PAID (was wrongly 'recd')", by[3].cashPaid, 280000); eq("#3 cash recd", by[3].cashRecd, 0);
eq("#4 cash paid", by[4].cashPaid, 5000); eq("#5 cash recd", by[5].cashRecd, 1000);
let pure = 0, cash = 0, bank = 0;
for (const x of [...h].reverse()) { pure += x.inwardPure + x.metalPureRecd - x.outwardPure - x.metalPurePaid; cash += x.cashRecd - x.cashPaid; bank += x.bankRecd - x.bankPaid; }
eq("closing pure bal", pure, 5); eq("closing cash bal", cash, -234000); eq("closing bank bal", bank, 175000);
const day = (await getDailyTally()).find((d) => d.date === today);
eq("expenses page closing cash", day.closingCash, -234000); eq("expenses page closing bank", day.closingBank, 175000);
eq("expenses page recd back", day.expenseCashIn, 1000);

console.log("\n== TEST 5: booking -> bill ==");
r = recon({ saleLines: [{ weight: 1000, touch: 100 }], ratePerGram: 15000, bankRecd: 15000000 });
eq("kumar bill clsg", r.closingCash, 0); eq("words 1.5cr", rupeesInWords(15000000), "Rupees One Crore Fifty Lakh Only");
const b6 = await createTransaction({ trnType: "sales", partyId: kumar, metal: "gold", txnDate: today, barRate: 15000, operatorName: "t",
  lines: [{ kind: "sale", particulars: "Gold pure", weight: 1000, touch: 100, rate: 15000, bookingId: bR.id }], movements: [],
  settlements: [{ mode: "bank", direction: "received", amount: 15000000 }] });
await bk.recordDelivery(bR.id, b6.id, 1000);
const done = await bk.getBooking(bR.id);
eq("bill no", b6.serialNo, 6); eq("delivered", done.delivered, 1000); eq("pending", done.pending, 0); eq("status", done.status, "delivered");
p = await pos(); eq("hedge net after delivery", p.netLots, 1); eq("action", p.actionLots, -1);
console.log("  sales whatsapp text:\n" + decodeURIComponent(buildSalesWhatsapp("9999900001", { partyName: "Test Kumar", metal: "gold", totalWeight: 1000, rate: 15000, amount: 15000000, billNo: 6, trnType: "sales" }).split("text=")[1]).replace(/^/gm, "    | "));

console.log("\n== TEST 6: whatsapp ==");
const uf = (await bk.listBookings()).find((x) => x.bookType === "unfixed");
console.log("  default UF booking text:\n" + decodeURIComponent(buildBookingWhatsapp("9999900001", { partyName: uf.partyName, side: uf.side, bookType: uf.bookType, metal: uf.metal, weight: uf.weight, rate: uf.rate ?? undefined, delivered: uf.delivered }).split("text=")[1]).replace(/^/gm, "    | "));
const custom = "Vanakkam {customer}, your {metal} booking of {weight} is confirmed.";
const t1 = decodeURIComponent(buildBookingWhatsapp("9999900001", { partyName: "Ragul", metal: "gold", weight: 1000, rate: 15768, template: custom }).split("text=")[1]);
eq("settings preview text", t1, "Vanakkam Ragul, your Gold booking of 1,000.000 g is confirmed.");
const t2 = decodeURIComponent(buildBookingWhatsapp("9999900001", { partyName: "Test Kumar", side: "sell", bookType: "unfixed", metal: "gold", weight: 1000, template: custom }).split("text=")[1]);
eq("custom text on the UF row", t2, "Vanakkam Test Kumar, your Gold booking of 1,000.000 g is confirmed.");
eq("phone becomes", buildBookingWhatsapp("9999900001", { partyName: "x", metal: "gold" }).split("?")[0], "https://wa.me/919999900001");

console.log(`\n${pass} passed, ${fail} failed`);
// wipe staging back to empty so the guide starts from zero
await db.execute(sql`truncate booking_deliveries, mcx_positions, transactions, transaction_lines, metal_movements, settlements, bookings, parties restart identity cascade`);
console.log("staging wiped back to empty");
process.exit(fail ? 1 : 0);
