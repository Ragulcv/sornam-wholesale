import "server-only";
import { db } from "../db";
import { stock, transactions, transactionLines, metalMovements, settlements } from "../db/schema";
import { eq } from "drizzle-orm";
import { round2, round3 } from "../bullion";

const num = (v: string | null): number => (v == null ? 0 : parseFloat(v));

export interface OpeningBalance {
  /** net metal weight carried in (received − paid), org-wide, before the cutoff */
  metalWg: number;
  /** net metal pure carried in, before the cutoff */
  metalPure: number;
  /** net cash position before the cutoff */
  cash: number;
  /** net bank position before the cutoff */
  bank: number;
}

/**
 * Carried-forward org position BEFORE `from` (or before today when `from` is
 * omitted). Mirrors the before-today bucketing in stock.getStock(): every
 * transaction strictly earlier than the cutoff contributes its net metal / cash
 * / bank movement, on top of the configured opening-stock balances.
 */
export async function getOpeningBalance(from?: string): Promise<OpeningBalance> {
  const cutoff = from ? new Date(from) : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

  const [stockRows, txns, lines, moves, setls] = await Promise.all([
    db.select().from(stock).where(eq(stock.id, 1)),
    db.select({ id: transactions.id, txnDate: transactions.txnDate }).from(transactions),
    db.select({ transactionId: transactionLines.transactionId, kind: transactionLines.kind, weight: transactionLines.weight, pure: transactionLines.pure }).from(transactionLines),
    db.select({ transactionId: metalMovements.transactionId, direction: metalMovements.direction, weight: metalMovements.weight, pure: metalMovements.pure }).from(metalMovements),
    db.select({ transactionId: settlements.transactionId, mode: settlements.mode, direction: settlements.direction, amount: settlements.amount }).from(settlements),
  ]);

  const dateOf = new Map(txns.map((t) => [t.id, t.txnDate]));
  const before = (id: string) => {
    const d = dateOf.get(id);
    return d != null && d < cutoff;
  };

  const s = stockRows[0];
  // Opening stock is a single org base; only counts toward the "before" position.
  let metalWg = 0;
  let metalPure = round3(num(s?.openingPureGold ?? null) + num(s?.openingPureSilver ?? null));
  let cash = num(s?.openingCash ?? null);
  let bank = num(s?.openingBank ?? null);

  for (const l of lines) {
    if (!before(l.transactionId)) continue;
    // purchase / sale_return → metal IN (+); sale / purchase_return → metal OUT (−)
    const sign = l.kind === "purchase" || l.kind === "sale_return" ? 1 : -1;
    metalWg += sign * num(l.weight);
    metalPure += sign * num(l.pure);
  }
  for (const m of moves) {
    if (!before(m.transactionId)) continue;
    const sign = m.direction === "received" ? 1 : -1;
    metalWg += sign * num(m.weight);
    metalPure += sign * num(m.pure);
  }
  for (const st of setls) {
    if (!before(st.transactionId)) continue;
    const amt = num(st.amount) * (st.direction === "received" ? 1 : -1);
    if (st.mode === "cash") cash += amt; else bank += amt;
  }

  return {
    metalWg: round3(metalWg),
    metalPure: round3(metalPure),
    cash: round2(cash),
    bank: round2(bank),
  };
}
