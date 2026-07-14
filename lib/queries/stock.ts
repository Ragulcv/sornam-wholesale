import "server-only";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { stock, transactions, transactionLines, metalMovements, settlements } from "../db/schema";
import { round2, round3 } from "../bullion";

const num = (v: string | null): number => (v == null ? 0 : parseFloat(v));

export interface Balances {
  pureGold: number;
  pureSilver: number;
  cash: number;
  bank: number;
}
export interface StockView {
  openingPureGold: number;
  openingPureSilver: number;
  openingCash: number;
  openingBank: number;
  currentPureGold: number;
  currentPureSilver: number;
  currentCash: number;
  currentBank: number;
  // Day-wise: start-of-today (opening) and end-of-today (closing) balances.
  todayOpen: Balances;
  todayClose: Balances;
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
    db.select({ id: transactions.id, metal: transactions.metal, txnDate: transactions.txnDate }).from(transactions),
    db.select({ transactionId: transactionLines.transactionId, kind: transactionLines.kind, pure: transactionLines.pure }).from(transactionLines),
    db.select({ transactionId: metalMovements.transactionId, direction: metalMovements.direction, pure: metalMovements.pure }).from(metalMovements),
    db.select({ transactionId: settlements.transactionId, mode: settlements.mode, direction: settlements.direction, amount: settlements.amount }).from(settlements),
  ]);
  const metalOf = new Map(txns.map((t) => [t.id, t.metal]));
  const dateOf = new Map(txns.map((t) => [t.id, t.txnDate]));

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  // buckets: metal (gold/silver pure) + cash + bank, split by before-today / today
  const z = () => ({ g: 0, s: 0, cash: 0, bank: 0 });
  const before = z(), today = z(), rest = z(); // rest = future-dated
  const bucketFor = (id: string) => {
    const d = dateOf.get(id);
    if (!d) return today;
    return d < todayStart ? before : d <= todayEnd ? today : rest;
  };
  const addMetal = (b: ReturnType<typeof z>, m: string | undefined, delta: number) => {
    if (m === "gold") b.g += delta;
    else if (m === "silver") b.s += delta;
  };

  for (const l of lines) {
    const sign = l.kind === "purchase" || l.kind === "sale_return" ? 1 : -1;
    addMetal(bucketFor(l.transactionId), metalOf.get(l.transactionId), sign * num(l.pure));
  }
  for (const mv of moves) {
    addMetal(bucketFor(mv.transactionId), metalOf.get(mv.transactionId), (mv.direction === "received" ? 1 : -1) * num(mv.pure));
  }
  for (const st of setls) {
    const b = bucketFor(st.transactionId);
    const amt = num(st.amount) * (st.direction === "received" ? 1 : -1);
    if (st.mode === "cash") b.cash += amt; else b.bank += amt;
  }

  const og = num(s.openingPureGold), os = num(s.openingPureSilver), oc = num(s.openingCash), ob = num(s.openingBank);
  const bal = (extra: ReturnType<typeof z>[]): Balances => {
    const sum = (k: "g" | "s" | "cash" | "bank") => extra.reduce((a, e) => a + e[k], 0);
    return {
      pureGold: round3(og + sum("g")),
      pureSilver: round3(os + sum("s")),
      cash: round2(oc + sum("cash")),
      bank: round2(ob + sum("bank")),
    };
  };
  const todayOpen = bal([before]);
  const todayClose = bal([before, today]);
  const current = bal([before, today, rest]);

  return {
    openingPureGold: og,
    openingPureSilver: os,
    openingCash: oc,
    openingBank: ob,
    currentPureGold: current.pureGold,
    currentPureSilver: current.pureSilver,
    currentCash: current.cash,
    currentBank: current.bank,
    todayOpen,
    todayClose,
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
