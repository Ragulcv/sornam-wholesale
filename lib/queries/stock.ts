import "server-only";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { stock, transactions, transactionLines, metalMovements, settlements } from "../db/schema";
import { round2, round3 } from "../bullion";

const num = (v: string | null): number => (v == null ? 0 : parseFloat(v));

export interface StockView {
  openingPureGold: number;
  openingPureSilver: number;
  openingCash: number;
  openingBank: number;
  currentPureGold: number;
  currentPureSilver: number;
  currentCash: number;
  currentBank: number;
}

async function ensureStock() {
  const rows = await db.select().from(stock).where(eq(stock.id, 1));
  if (rows[0]) return rows[0];
  await db.insert(stock).values({ id: 1 }).onConflictDoNothing();
  return (await db.select().from(stock).where(eq(stock.id, 1)))[0];
}

export async function getStock(): Promise<StockView> {
  const s = await ensureStock();
  const [txns, lines, moves, setls] = await Promise.all([
    db.select({ id: transactions.id, metal: transactions.metal }).from(transactions),
    db.select({ transactionId: transactionLines.transactionId, kind: transactionLines.kind, pure: transactionLines.pure }).from(transactionLines),
    db.select({ transactionId: metalMovements.transactionId, direction: metalMovements.direction, pure: metalMovements.pure }).from(metalMovements),
    db.select({ mode: settlements.mode, direction: settlements.direction, amount: settlements.amount }).from(settlements),
  ]);
  const metalOf = new Map(txns.map((t) => [t.id, t.metal]));

  let dGold = 0, dSilver = 0;
  const addMetal = (m: string | undefined, delta: number) => {
    if (m === "gold") dGold += delta;
    else if (m === "silver") dSilver += delta;
  };
  for (const l of lines) {
    const p = num(l.pure);
    // metal in (increase): purchase / sale_return ; metal out (decrease): sale / purchase_return
    const sign = l.kind === "purchase" || l.kind === "sale_return" ? 1 : -1;
    addMetal(metalOf.get(l.transactionId), sign * p);
  }
  for (const mv of moves) {
    addMetal(metalOf.get(mv.transactionId), (mv.direction === "received" ? 1 : -1) * num(mv.pure));
  }

  let dCash = 0, dBank = 0;
  for (const st of setls) {
    const amt = num(st.amount) * (st.direction === "received" ? 1 : -1);
    if (st.mode === "cash") dCash += amt;
    else dBank += amt;
  }

  const og = num(s.openingPureGold), os = num(s.openingPureSilver), oc = num(s.openingCash), ob = num(s.openingBank);
  return {
    openingPureGold: og,
    openingPureSilver: os,
    openingCash: oc,
    openingBank: ob,
    currentPureGold: round3(og + dGold),
    currentPureSilver: round3(os + dSilver),
    currentCash: round2(oc + dCash),
    currentBank: round2(ob + dBank),
  };
}

export async function updateStockOpening(data: {
  openingPureGold: number;
  openingPureSilver: number;
  openingCash: number;
  openingBank: number;
}): Promise<void> {
  await ensureStock();
  await db
    .update(stock)
    .set({
      openingPureGold: String(data.openingPureGold),
      openingPureSilver: String(data.openingPureSilver),
      openingCash: String(data.openingCash),
      openingBank: String(data.openingBank),
      updatedAt: new Date(),
    })
    .where(eq(stock.id, 1));
}
