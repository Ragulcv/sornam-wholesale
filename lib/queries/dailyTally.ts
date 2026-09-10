import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { stock, transactions, settlements } from "../db/schema";
import { round2 } from "../bullion";
import { dayKey } from "../dates";

const num = (v: string | null): number => (v == null ? 0 : parseFloat(v));

/**
 * Day-by-day cash and bank tally with expenses folded in, so the closing
 * balance on screen is the balance that should be in the drawer.
 *
 * An expense keyed in as a negative amount is stored as money received, so it
 * lands in the "received" column here and lifts the closing balance instead of
 * dropping it.
 */
export interface DayTally {
  date: string;
  openingCash: number;
  openingBank: number;
  tradeCashIn: number;
  tradeCashOut: number;
  tradeBankIn: number;
  tradeBankOut: number;
  expenseCash: number;
  expenseBank: number;
  /** expenses entered negative: money that came back in */
  expenseCashIn: number;
  expenseBankIn: number;
  closingCash: number;
  closingBank: number;
}

export async function getDailyTally(limitDays = 60): Promise<DayTally[]> {
  const [stockRows, txns, setls] = await Promise.all([
    db.select().from(stock).where(eq(stock.id, 1)),
    db.select({ id: transactions.id, trnType: transactions.trnType, txnDate: transactions.txnDate })
      .from(transactions)
      .orderBy(asc(transactions.txnDate)),
    db.select().from(settlements),
  ]);

  const s = stockRows[0];
  let cash = num(s?.openingCash ?? null);
  let bank = num(s?.openingBank ?? null);

  const typeOf = new Map(txns.map((t) => [t.id, t.trnType]));
  const dateOf = new Map(txns.map((t) => [t.id, t.txnDate]));

  type Acc = Omit<DayTally, "date" | "openingCash" | "openingBank" | "closingCash" | "closingBank">;
  const blank = (): Acc => ({
    tradeCashIn: 0, tradeCashOut: 0, tradeBankIn: 0, tradeBankOut: 0,
    expenseCash: 0, expenseBank: 0, expenseCashIn: 0, expenseBankIn: 0,
  });
  const byDay = new Map<string, Acc>();

  for (const st of setls) {
    const d = dateOf.get(st.transactionId);
    if (!d) continue;
    const k = dayKey(d);
    let a = byDay.get(k);
    if (!a) { a = blank(); byDay.set(k, a); }
    const amt = num(st.amount);
    const isExpense = typeOf.get(st.transactionId) === "expense";
    if (isExpense) {
      if (st.direction === "paid") {
        if (st.mode === "cash") a.expenseCash += amt; else a.expenseBank += amt;
      } else {
        if (st.mode === "cash") a.expenseCashIn += amt; else a.expenseBankIn += amt;
      }
    } else if (st.direction === "received") {
      if (st.mode === "cash") a.tradeCashIn += amt; else a.tradeBankIn += amt;
    } else {
      if (st.mode === "cash") a.tradeCashOut += amt; else a.tradeBankOut += amt;
    }
  }

  const days = [...byDay.keys()].sort();
  const out: DayTally[] = days.map((k) => {
    const a = byDay.get(k)!;
    const openingCash = round2(cash);
    const openingBank = round2(bank);
    cash += a.tradeCashIn - a.tradeCashOut - a.expenseCash + a.expenseCashIn;
    bank += a.tradeBankIn - a.tradeBankOut - a.expenseBank + a.expenseBankIn;
    return {
      date: k,
      openingCash,
      openingBank,
      tradeCashIn: round2(a.tradeCashIn),
      tradeCashOut: round2(a.tradeCashOut),
      tradeBankIn: round2(a.tradeBankIn),
      tradeBankOut: round2(a.tradeBankOut),
      expenseCash: round2(a.expenseCash),
      expenseBank: round2(a.expenseBank),
      expenseCashIn: round2(a.expenseCashIn),
      expenseBankIn: round2(a.expenseBankIn),
      closingCash: round2(cash),
      closingBank: round2(bank),
    };
  });

  return out.slice(-limitDays).reverse(); // newest day first
}
