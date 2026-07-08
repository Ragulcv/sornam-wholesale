import { neon } from "@neondatabase/serverless";
import { getStock, updateStockOpening } from "../lib/queries/stock.ts";
import { createTransaction } from "../lib/queries/transactions.ts";

const sql = neon(process.env.DATABASE_URL);
const results = [];
const check = (n, ok) => { results.push(ok); console.log(`  ${ok ? "✓" : "✗"} ${n}`); };
const near = (a, b) => Math.abs(a - b) < 0.01;

// clean slate
await sql`delete from transactions`;
await updateStockOpening({ openingPureGold: 1000, openingPureSilver: 500, openingCash: 100000, openingBank: 200000 });

// one gold sale: 100g @ 99.5 touch out (pure 99.5), cash 725000 in
await createTransaction({
  trnType: "sales", partyId: null, metal: "gold",
  lines: [{ kind: "sale", particulars: "bar", weight: 100, touch: 99.5, rate: 7250 }],
  movements: [],
  settlements: [{ mode: "cash", direction: "received", amount: 725000 }],
  operatorName: "Test",
});

const s = await getStock();
check("gold pure decreases by 99.5 (1000→900.5)", near(s.currentPureGold, 900.5));
check("cash increases by 725000 (100000→825000)", near(s.currentCash, 825000));
check("silver unchanged (500)", near(s.currentPureSilver, 500));
check("bank unchanged (200000)", near(s.currentBank, 200000));

// one gold purchase: 200g @ 91.6 in (pure 183.2), bank 1000000 paid
await createTransaction({
  trnType: "purchase", partyId: null, metal: "gold",
  lines: [{ kind: "purchase", particulars: "old gold", weight: 200, touch: 91.6, rate: 5000 }],
  movements: [],
  settlements: [{ mode: "bank", direction: "paid", amount: 1000000 }],
  operatorName: "Test",
});
const s2 = await getStock();
check("gold pure increases by 183.2 (900.5→1083.7)", near(s2.currentPureGold, 1083.7));
check("bank decreases by 1000000 (200000→-800000)", near(s2.currentBank, -800000));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
