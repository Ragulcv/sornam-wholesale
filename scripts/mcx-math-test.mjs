// The MCX engine against hand-worked trades.
const { computeMcxBook } = await import("../lib/mcx.ts");
let pass = 0, fail = 0;
const eq = (l, g, w) => { const ok = typeof w === "number" ? Math.abs(g - w) < 0.005 : g === w; ok ? pass++ : fail++; console.log(`  ${ok ? "ok  " : "FAIL"} ${l}: ${g}${ok ? "" : `  (want ${w})`}`); };
let seq = 0;
const T = (day, account, side, lots, price) => ({ id: String(++seq), day, seq, account, side, lots, price });

console.log("\n-- hedge a 1 kg ready sale: buy 1 lot, gold rises, close the hedge --");
// day 1 buy 1 lot @ 148000, close 148500 -> open value +50,000
// day 2 close 149000 -> open value +100,000, day P&L +50,000
// day 3 sell 1 lot @ 149200 -> booked +120,000, open 0, day P&L = 120000 + 0 - 100000 = +20,000
let b = computeMcxBook(
  [T("2026-10-01", "ID1", "buy", 1, 148000), T("2026-10-03", "ID1", "sell", 1, 149200)],
  { "2026-10-01": 148500, "2026-10-02": 149000, "2026-10-03": 149100 },
);
eq("day1 P&L", b.days[0].pnl, 50000);
eq("day2 P&L", b.days[1].pnl, 50000);
eq("day3 booked", b.days[2].realised, 120000);
eq("day3 P&L", b.days[2].pnl, 20000);
eq("days add up to total", b.days.reduce((a, d) => a + d.pnl, 0), b.total);
eq("total booked", b.realised, 120000);
eq("nothing open", b.netLots, 0);
eq("unrealised", b.unrealised, 0);

console.log("\n-- short hedge, partly closed, FIFO --");
// sell 2 @ 150000, sell 1 @ 151000, buy 2 @ 149000 -> closes the two oldest short lots:
// (150000-149000)*2*100 = +200,000 ; 1 lot short left @ 151000; close 150500 -> open +50,000
b = computeMcxBook(
  [T("2026-10-05", "ID2", "sell", 2, 150000), T("2026-10-05", "ID2", "sell", 1, 151000), T("2026-10-06", "ID2", "buy", 2, 149000)],
  { "2026-10-06": 150500 },
);
eq("booked", b.realised, 200000);
eq("open lots", b.netLots, -1);
eq("avg of what is open", b.positions[0].avgPrice, 151000);
eq("unrealised at 150500", b.unrealised, 50000);
eq("total", b.total, 250000);
eq("no close on day 1: open value 0", b.days[0].openValue, 0);

console.log("\n-- a buy that flips a short into a long --");
// sell 1 @ 150000, then buy 3 @ 149000: closes 1 (+100,000) and opens 2 long @ 149000
b = computeMcxBook([T("2026-10-07", "ID3", "sell", 1, 150000), T("2026-10-07", "ID3", "buy", 3, 149000)], { "2026-10-07": 149500 });
eq("booked", b.realised, 100000);
eq("now long 2", b.netLots, 2);
eq("open +2 lots * 500 * 100", b.unrealised, 100000);

console.log("\n-- accounts stay separate --");
b = computeMcxBook([T("2026-10-08", "A", "buy", 1, 148000), T("2026-10-08", "B", "sell", 1, 149000)], {});
eq("A long 1", b.positions.find((p) => p.account === "A").netLots, 1);
eq("B short 1", b.positions.find((p) => p.account === "B").netLots, -1);
eq("no cross-account matching", b.realised, 0);

console.log("\n-- imported opening lots without a price --");
b = computeMcxBook([T("2026-10-09", "X", "sell", 1, null), T("2026-10-10", "X", "buy", 1, 149000)], { "2026-10-10": 149000 });
eq("closing an unpriced lot books nothing", b.realised, 0);
eq("and is flagged", b.unpricedMatchedLots, 1);
b = computeMcxBook([T("2026-10-09", "X", "sell", 1, null)], { "2026-10-09": 149000 });
eq("unpriced open lots counted for the hedge", b.netLots, -1);
eq("but not valued", b.unrealised, 0);
eq("and flagged", b.unpricedOpenLots, 1);

console.log("\n-- close carried forward over a day with no close typed --");
b = computeMcxBook([T("2026-10-11", "ID", "buy", 1, 148000), T("2026-10-13", "ID", "buy", 1, 148000)], { "2026-10-11": 148100 });
eq("day 13 reuses the 11th's close", b.days[1].close, 148100);
eq("marked as carried", b.days[1].closeCarried, true);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
