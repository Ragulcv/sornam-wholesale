// Replays guide Test 2 with a throwaway customer (never touches the tester's
// own rows), checks every value the guide states, then removes what it made.
const { db } = await import("../lib/db/index.ts");
const S = await import("../lib/db/schema.ts");
const { inArray } = await import("drizzle-orm");
const { createTransaction } = await import("../lib/queries/transactions.ts");
const { findOrCreateParty } = await import("../lib/queries/parties.ts");
const { getPartyLedger, getCarryForward } = await import("../lib/queries/partyLedger.ts");
const { reconcile } = await import("../lib/bullion.ts");
let pass = 0, fail = 0;
const eq = (l, got, want) => { const ok = Math.abs(got - want) < 0.005; ok ? pass++ : fail++; console.log(`  ${ok ? "ok  " : "FAIL"} ${l}: ${got}${ok ? "" : ` (want ${want})`}`); };
const R = (o) => reconcile({ saleLines: [], returnLines: [], metalMoves: [], ratePerGram: 0, intDisPure: 0, intDisCash: 0, mcCashRecd: 0, bankRecd: 0, cashBankRecd: 0, conversion: "cash", discountPure: 0, discountCash: 0, ...o });
const today = new Date().toLocaleDateString("en-CA");
const id = await findOrCreateParty(`Zz T2 ${Date.now()}`);
const txns = [];
try {
  console.log("Bill 1: 10 g @ 15000, 50000 cash");
  let r = R({ saleLines: [{ weight: 10, touch: 100 }], ratePerGram: 15000, mcCashRecd: 50000 });
  eq("Total cash", r.billValue, 150000); eq("Cash/Bank Recd box", r.receiptsSigned, -50000); eq("Clsg. Bal. cash", r.closingCash, -100000); eq("Clsg. Bal. pure", r.closingPure, 0);
  txns.push((await createTransaction({ trnType: "sales", partyId: id, metal: "gold", txnDate: today, barRate: 15000, operatorName: "t", lines: [{ kind: "sale", weight: 10, touch: 100, rate: 15000 }], movements: [], settlements: [{ mode: "cash", direction: "received", amount: 50000 }] })).id);
  console.log("Bill 2: 5 g @ 15000, 175000 bank");
  let cf = await getCarryForward(id);
  eq("OpgCash", cf.cash, -100000);
  r = R({ saleLines: [{ weight: 5, touch: 100 }], ratePerGram: 15000, bankRecd: 175000 });
  eq("Clsg. Bal. cash", r.closingCash, 100000); eq("After this bill", cf.cash + r.closingCash, 0);
  txns.push((await createTransaction({ trnType: "sales", partyId: id, metal: "gold", txnDate: today, barRate: 15000, operatorName: "t", lines: [{ kind: "sale", weight: 5, touch: 100, rate: 15000 }], movements: [], settlements: [{ mode: "bank", direction: "received", amount: 175000 }] })).id);
  console.log("Linked history");
  const L = (await getPartyLedger(id)).rows;
  eq("row1 Opg", L[0].openingCash, 0); eq("row1 Cash", L[0].cashMoved, -100000); eq("row1 Cash paid", L[0].cashReceipt, -50000); eq("row1 Clsg", L[0].closingCash, -100000);
  eq("row2 Opg", L[1].openingCash, -100000); eq("row2 Cash", L[1].cashMoved, 100000); eq("row2 Bank paid", L[1].bankReceipt, -175000); eq("row2 Clsg", L[1].closingCash, 0);
  eq("next bill OpgCash", (await getCarryForward(id)).cash, 0);
  console.log("Purchase on credit (we owe the supplier)");
  const sup = await findOrCreateParty(`Zz T2 sup ${Date.now()}`);
  r = R({ saleLines: [{ weight: 20, touch: 100 }], ratePerGram: 14000, mcCashRecd: 100000 });
  eq("purchase Clsg (screen)", r.closingCash, -180000);
  txns.push((await createTransaction({ trnType: "purchase", partyId: sup, metal: "gold", txnDate: today, barRate: 14000, operatorName: "t", lines: [{ kind: "purchase", weight: 20, touch: 100, rate: 14000 }], movements: [], settlements: [{ mode: "cash", direction: "paid", amount: 100000 }] })).id);
  eq("supplier account: we owe them (positive)", (await getCarryForward(sup)).cash, 180000);
  await db.delete(S.parties).where(inArray(S.parties.id, [sup])).catch(() => {});
  txns.push(sup);
} finally {
  await db.delete(S.transactions).where(inArray(S.transactions.id, txns)).catch(() => {});
  const ps = await db.select({ id: S.parties.id, name: S.parties.name }).from(S.parties);
  const mine = ps.filter((p) => p.name.startsWith("Zz T2")).map((p) => p.id);
  if (mine.length) await db.delete(S.parties).where(inArray(S.parties.id, mine));
}
console.log(`\n${pass} passed, ${fail} failed (throwaway rows removed)`);
process.exit(fail ? 1 : 0);
