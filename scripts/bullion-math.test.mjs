import { pure, lineAmount, tdsAmount, sumSettlements } from "../lib/bullion.ts";

const results = [];
const eq = (n, a, b) => { const ok = Math.abs(a - b) < 1e-9; results.push(ok); console.log(`  ${ok ? "✓" : "✗"} ${n} (${a} == ${b})`); };

eq("pure(100, 91.6) = 91.6", pure(100, 91.6), 91.6);
eq("pure(50, 99.9) = 49.95", pure(50, 99.9), 49.95);
eq("lineAmount(100, 7240) = 724000", lineAmount(100, 7240), 724000);
eq("lineAmount(5000, 92) = 460000", lineAmount(5000, 92), 460000);
eq("tdsAmount(1000000, 0.1) = 1000", tdsAmount(1000000, 0.1), 1000);
eq(
  "sumSettlements cash received = 500000",
  sumSettlements(
    [
      { mode: "cash", direction: "received", amount: 500000 },
      { mode: "bank", direction: "received", amount: 224000 },
      { mode: "cash", direction: "paid", amount: 100 },
    ],
    "cash",
    "received",
  ),
  500000,
);

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} math checks passed`);
process.exit(passed === results.length ? 0 : 1);
