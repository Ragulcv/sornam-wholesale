import { neon } from "@neondatabase/serverless";
import { getStock, updateStockOpening } from "../lib/queries/stock.ts";
import { createTransaction } from "../lib/queries/transactions.ts";

const sql = neon(process.env.DATABASE_URL);
const results = [];
const check = (n, ok) => { results.push(ok); console.log(`  ${ok ? "✓" : "✗"} ${n}`); };
const near = (a, b) => Math.abs(a - b) < 0.01;

await sql`delete from transactions`;
await updateStockOpening({ openingPureGold: 1000, openingPureSilver: 0, openingCash: 0, openingBank: 0 });

const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

// yesterday: sell 100g gold (out)
await createTransaction({ trnType: "sales", partyId: null, metal: "gold", txnDate: yesterday, lines: [{ kind: "sale", weight: 100, touch: 100, rate: 14000 }], movements: [], settlements: [], operatorName: "T" });
// today: sell 50g gold (out)
await createTransaction({ trnType: "sales", partyId: null, metal: "gold", txnDate: today, lines: [{ kind: "sale", weight: 50, touch: 100, rate: 14000 }], movements: [], settlements: [], operatorName: "T" });

const s = await getStock();
check("today's OPENING = 1000 − 100 (yesterday) = 900", near(s.todayOpen.pureGold, 900));
check("today's CLOSING = 900 − 50 (today) = 850", near(s.todayClose.pureGold, 850));
check("current all-time = 850", near(s.currentPureGold, 850));

// add another today sale of 50g → closing moves, opening unchanged
await createTransaction({ trnType: "sales", partyId: null, metal: "gold", txnDate: today, lines: [{ kind: "sale", weight: 50, touch: 100, rate: 14000 }], movements: [], settlements: [], operatorName: "T" });
const s2 = await getStock();
check("opening unchanged after another today sale (900)", near(s2.todayOpen.pureGold, 900));
check("closing moved with today's billing (800)", near(s2.todayClose.pureGold, 800));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
