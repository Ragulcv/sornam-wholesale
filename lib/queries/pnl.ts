import "server-only";
import { and, asc, gte, lte } from "drizzle-orm";
import { db } from "../db";
import { transactions, transactionLines, settlements } from "../db/schema";
import { round2, round3 } from "../bullion";
import { dayStart, dayEnd, dayKey } from "../dates";

const num = (v: string | null): number => (v == null ? 0 : parseFloat(v));

/**
 * Daily profit and loss on a weighted-average cost basis.
 *
 * Buys raise the running cost per gram; every gram sold that day is costed at
 * that running rate, so a day that sells out of earlier stock is still valued
 * correctly instead of showing an infinite margin. Expenses come off the gross.
 */
export interface PnlDay {
  date: string;
  buyWeight: number;
  buyAmount: number;
  avgBuyRate: number;
  sellWeight: number;
  sellAmount: number;
  avgSellRate: number;
  /** cost per gram carried into the day's sales after that day's purchases */
  costRate: number;
  costOfSales: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  bills: number;
}

export interface PnlSummary {
  days: PnlDay[];
  totals: {
    buyWeight: number;
    buyAmount: number;
    avgBuyRate: number;
    sellWeight: number;
    sellAmount: number;
    avgSellRate: number;
    costOfSales: number;
    grossProfit: number;
    expenses: number;
    netProfit: number;
    bills: number;
  };
  /** cost per gram still carried after the last day in the range */
  closingCostRate: number;
  /** best and worst day in the range, for the headline strip */
  bestDay: PnlDay | null;
  worstDay: PnlDay | null;
}

export async function getPnl(filter?: { from?: string; to?: string }): Promise<PnlSummary> {
  const cond = [];
  if (filter?.from) cond.push(gte(transactions.txnDate, dayStart(filter.from)));
  if (filter?.to) cond.push(lte(transactions.txnDate, dayEnd(filter.to)));

  const txns = await db
    .select()
    .from(transactions)
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(asc(transactions.txnDate), asc(transactions.serialNo));

  if (txns.length === 0)
    return {
      days: [],
      totals: { buyWeight: 0, buyAmount: 0, avgBuyRate: 0, sellWeight: 0, sellAmount: 0, avgSellRate: 0, costOfSales: 0, grossProfit: 0, expenses: 0, netProfit: 0, bills: 0 },
      closingCostRate: 0,
      bestDay: null,
      worstDay: null,
    };

  const ids = new Set(txns.map((t) => t.id));
  const [lines, setls] = await Promise.all([
    db.select().from(transactionLines),
    db.select().from(settlements),
  ]);

  type Bucket = { buyW: number; buyA: number; sellW: number; sellA: number; expense: number; bills: Set<string> };
  const buckets = new Map<string, Bucket>();
  const bucket = (k: string): Bucket => {
    let b = buckets.get(k);
    if (!b) { b = { buyW: 0, buyA: 0, sellW: 0, sellA: 0, expense: 0, bills: new Set() }; buckets.set(k, b); }
    return b;
  };

  const dateOf = new Map(txns.map((t) => [t.id, t.txnDate]));
  const typeOf = new Map(txns.map((t) => [t.id, t.trnType]));

  for (const l of lines) {
    if (!ids.has(l.transactionId)) continue;
    const d = dateOf.get(l.transactionId)!;
    const b = bucket(dayKey(d));
    b.bills.add(l.transactionId);
    const w = num(l.weight), a = num(l.amount);
    // Metal in at cost: purchases and sales that came back.
    if (l.kind === "purchase") { b.buyW += w; b.buyA += a; }
    else if (l.kind === "purchase_return") { b.buyW -= w; b.buyA -= a; }
    else if (l.kind === "sale") { b.sellW += w; b.sellA += a; }
    else if (l.kind === "sale_return") { b.sellW -= w; b.sellA -= a; }
  }

  for (const s of setls) {
    if (!ids.has(s.transactionId)) continue;
    if (typeOf.get(s.transactionId) !== "expense") continue;
    const d = dateOf.get(s.transactionId)!;
    const b = bucket(dayKey(d));
    b.bills.add(s.transactionId);
    // An expense entered as a negative amount was stored as money received, so
    // it reduces the day's expense rather than adding to it.
    b.expense += num(s.amount) * (s.direction === "paid" ? 1 : -1);
  }

  const keys = [...buckets.keys()].sort();
  let costRate = 0;
  let stockWeight = 0;
  let stockValue = 0;

  const days: PnlDay[] = keys.map((k) => {
    const b = buckets.get(k)!;
    // roll the day's purchases into the running average cost
    if (b.buyW > 0) {
      stockWeight += b.buyW;
      stockValue += b.buyA;
      costRate = stockWeight > 0 ? stockValue / stockWeight : costRate;
    }
    // a day with no purchase history yet falls back to its own sale rate, which
    // books zero profit rather than a fictitious one
    const effectiveCost = costRate || (b.sellW > 0 ? b.sellA / b.sellW : 0);
    const costOfSales = round2(b.sellW * effectiveCost);
    const grossProfit = round2(b.sellA - costOfSales);
    if (b.sellW > 0) {
      stockWeight = Math.max(0, stockWeight - b.sellW);
      stockValue = Math.max(0, stockValue - costOfSales);
    }
    return {
      date: k,
      buyWeight: round3(b.buyW),
      buyAmount: round2(b.buyA),
      avgBuyRate: b.buyW > 0 ? round2(b.buyA / b.buyW) : 0,
      sellWeight: round3(b.sellW),
      sellAmount: round2(b.sellA),
      avgSellRate: b.sellW > 0 ? round2(b.sellA / b.sellW) : 0,
      costRate: round2(effectiveCost),
      costOfSales,
      grossProfit,
      expenses: round2(b.expense),
      netProfit: round2(grossProfit - b.expense),
      bills: b.bills.size,
    };
  });

  const totals = days.reduce(
    (a, d) => ({
      buyWeight: round3(a.buyWeight + d.buyWeight),
      buyAmount: round2(a.buyAmount + d.buyAmount),
      avgBuyRate: 0,
      sellWeight: round3(a.sellWeight + d.sellWeight),
      sellAmount: round2(a.sellAmount + d.sellAmount),
      avgSellRate: 0,
      costOfSales: round2(a.costOfSales + d.costOfSales),
      grossProfit: round2(a.grossProfit + d.grossProfit),
      expenses: round2(a.expenses + d.expenses),
      netProfit: round2(a.netProfit + d.netProfit),
      bills: a.bills + d.bills,
    }),
    { buyWeight: 0, buyAmount: 0, avgBuyRate: 0, sellWeight: 0, sellAmount: 0, avgSellRate: 0, costOfSales: 0, grossProfit: 0, expenses: 0, netProfit: 0, bills: 0 },
  );
  totals.avgBuyRate = totals.buyWeight > 0 ? round2(totals.buyAmount / totals.buyWeight) : 0;
  totals.avgSellRate = totals.sellWeight > 0 ? round2(totals.sellAmount / totals.sellWeight) : 0;

  const traded = days.filter((d) => d.sellWeight > 0 || d.buyWeight > 0 || d.expenses !== 0);
  const sorted = [...traded].sort((a, b) => b.netProfit - a.netProfit);

  return {
    days: days.slice().reverse(), // newest day first for the screen
    totals,
    closingCostRate: round2(costRate),
    bestDay: sorted[0] ?? null,
    worstDay: sorted.length > 1 ? sorted[sorted.length - 1] : null,
  };
}
