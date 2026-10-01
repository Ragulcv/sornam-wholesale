// MCX register end to end through the real queries: trades -> positions ->
// hedge box -> P&L. Uses its own MCX id and 2020 dates, cleans up after.
const { db } = await import("../lib/db/index.ts");
const S = await import("../lib/db/schema.ts");
const { eq, inArray, like } = await import("drizzle-orm");
const mq = await import("../lib/queries/mcx.ts");
const { getPosition } = await import("../lib/queries/bookings.ts");
const { getFullPnl } = await import("../lib/queries/pnl.ts");
let pass = 0, fail = 0;
const eq_ = (l, g, w) => { const ok = Math.abs(g - w) < 0.005; ok ? pass++ : fail++; console.log(`  ${ok ? "ok  " : "FAIL"} ${l}: ${g}${ok ? "" : ` (want ${w})`}`); };
const ACC = `ZZ-TEST-${Date.now() % 100000}`;
const D = ["2020-01-06", "2020-01-07", "2020-01-08"];
const before = await getPosition();
try {
  // the guide's story: sold 1 kg ready at a fixed rate, so hedge by BUYING 1 lot
  await mq.saveMcxTrade({ day: D[0], account: ACC, side: "buy", lots: 1, price: 148000, operatorName: "t" });
  await mq.saveMcxClose(D[0], 148500, "t");
  await mq.saveMcxClose(D[1], 149000, "t");
  let book = await mq.getMcxBook();
  const p = book.positions.find((x) => x.account === ACC);
  eq_("open position BUY 1", p.netLots, 1);
  eq_("avg price", p.avgPrice, 148000);
  let pos = await getPosition();
  eq_("hedge box MCX lots moved by +1", pos.position.mcxLots - before.position.mcxLots, 1);

  let pnl = await getFullPnl({ from: D[0], to: D[1] });
  eq_("day 1 MCX P/L (open +500 x 100)", pnl.days.find((d) => d.date === D[0]).mcxPnl, 50000);
  eq_("day 2 MCX P/L (another +500)", pnl.days.find((d) => d.date === D[1]).mcxPnl, 50000);
  eq_("range MCX total", pnl.mcx.total, 100000);
  eq_("nothing booked yet", pnl.mcx.realised, 0);
  eq_("net = physical + MCX - expenses", pnl.totals.net, pnl.totals.physicalGross + pnl.totals.mcx - pnl.totals.expenses);

  // square off
  await mq.saveMcxTrade({ day: D[2], account: ACC, side: "sell", lots: 1, price: 149200, operatorName: "t" });
  await mq.saveMcxClose(D[2], 149100, "t");
  pnl = await getFullPnl({ from: D[0], to: D[2] });
  eq_("day 3 booked", pnl.days.find((d) => d.date === D[2]).mcxRealised, 120000);
  eq_("day 3 MCX P/L", pnl.days.find((d) => d.date === D[2]).mcxPnl, 20000);
  eq_("range MCX total = booked", pnl.mcx.total, 120000);
  book = await mq.getMcxBook();
  eq_("account squared off", book.positions.find((x) => x.account === ACC).netLots, 0);
  pos = await getPosition();
  eq_("hedge box back where it was", pos.position.mcxLots - before.position.mcxLots, 0);

  // edit a price: profit follows
  const sell = (await mq.listMcxTrades()).find((t) => t.account === ACC && t.side === "sell");
  await mq.saveMcxTrade({ id: sell.id, day: D[2], account: ACC, side: "sell", lots: 1, price: 149000, operatorName: "t" });
  pnl = await getFullPnl({ from: D[0], to: D[2] });
  eq_("after editing the sell price to 149000", pnl.mcx.realised, 100000);
} finally {
  await db.delete(S.mcxTrades).where(eq(S.mcxTrades.account, ACC));
  await db.delete(S.mcxCloses).where(inArray(S.mcxCloses.day, D));
}
console.log(`\n${pass} passed, ${fail} failed (test trades and 2020 closes removed)`);
process.exit(fail ? 1 : 0);
