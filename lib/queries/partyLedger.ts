import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { parties, transactions, transactionLines, metalMovements, settlements } from "../db/schema";
import { round2, round3 } from "../bullion";
import { dayStart, dayEnd } from "../dates";

const num = (v: string | null): number => (v == null ? 0 : parseFloat(v));

/**
 * One customer's running book, oldest bill first.
 *
 * Sign convention throughout, matching how they read their own screen:
 *   POSITIVE = the customer owes us.
 *   A receipt (cash in, or bank receipt) is therefore NEGATIVE, and a bill with
 *   nothing received shows 0 in the receipt column rather than blank.
 *
 * Every bill starts from the previous bill's closing balance, so pure and cash
 * carry forward day after day instead of each bill starting at zero.
 */
export interface LedgerRow {
  txnId: string;
  serialNo: number;
  trnType: string;
  txnDate: Date;
  /** pure this bill moved onto the customer's account (+ owed to us) */
  pureMoved: number;
  /** rupee value this bill put on the account (+ owed to us) */
  cashMoved: number;
  /** cash received from them, shown negative; 0 when nothing was received */
  cashReceipt: number;
  /** bank receipt, shown negative; 0 when nothing was received */
  bankReceipt: number;
  openingPure: number;
  openingCash: number;
  closingPure: number;
  closingCash: number;
}

export interface PartyLedger {
  partyId: string;
  partyName: string;
  /** the stored opening the register starts from */
  basePure: number;
  baseCash: number;
  rows: LedgerRow[];
  /** carried-forward position after every bill */
  closingPure: number;
  closingCash: number;
}

export async function getPartyLedger(partyId: string): Promise<PartyLedger | null> {
  const [p] = await db.select().from(parties).where(eq(parties.id, partyId));
  if (!p) return null;

  const txns = await db
    .select()
    .from(transactions)
    .where(eq(transactions.partyId, partyId))
    .orderBy(asc(transactions.txnDate), asc(transactions.serialNo));

  const basePure = round3(num(p.openingPureGold) + num(p.openingPureSilver));
  const baseCash = round2(num(p.openingCash));

  if (txns.length === 0)
    return {
      partyId,
      partyName: p.name,
      basePure,
      baseCash,
      rows: [],
      closingPure: basePure,
      closingCash: baseCash,
    };

  const ids = txns.map((t) => t.id);
  const [lines, moves, setls] = await Promise.all([
    db.select().from(transactionLines).where(inArray(transactionLines.transactionId, ids)),
    db.select().from(metalMovements).where(inArray(metalMovements.transactionId, ids)),
    db.select().from(settlements).where(inArray(settlements.transactionId, ids)),
  ]);

  const per = new Map<string, { pure: number; cash: number; cashRecd: number; bankRecd: number }>(
    ids.map((id) => [id, { pure: 0, cash: 0, cashRecd: 0, bankRecd: 0 }]),
  );

  for (const l of lines) {
    const a = per.get(l.transactionId);
    if (!a) continue;
    // We sold to them (sale) or they returned a purchase -> they owe us.
    const sign = l.kind === "sale" || l.kind === "purchase_return" ? 1 : -1;
    a.pure += sign * num(l.pure);
    a.cash += sign * num(l.amount);
  }
  for (const m of moves) {
    const a = per.get(m.transactionId);
    if (!a) continue;
    // Metal they handed over reduces what they owe us in pure.
    a.pure += (m.direction === "received" ? -1 : 1) * num(m.pure);
  }
  for (const s of setls) {
    const a = per.get(s.transactionId);
    if (!a) continue;
    const amt = num(s.amount);
    if (s.direction === "received") {
      // Money in from the customer: negative on their account.
      if (s.mode === "cash") a.cashRecd -= amt;
      else a.bankRecd -= amt;
      a.cash -= amt;
    } else {
      if (s.mode === "cash") a.cashRecd += amt;
      else a.bankRecd += amt;
      a.cash += amt;
    }
  }

  let runPure = basePure;
  let runCash = baseCash;
  const rows: LedgerRow[] = txns.map((t) => {
    const a = per.get(t.id)!;
    const openingPure = round3(runPure);
    const openingCash = round2(runCash);
    runPure = round3(runPure + a.pure);
    runCash = round2(runCash + a.cash);
    return {
      txnId: t.id,
      serialNo: t.serialNo,
      trnType: t.trnType,
      txnDate: t.txnDate,
      pureMoved: round3(a.pure),
      cashMoved: round2(a.cash),
      cashReceipt: round2(a.cashRecd),
      bankReceipt: round2(a.bankRecd),
      openingPure,
      openingCash,
      closingPure: round3(runPure),
      closingCash: round2(runCash),
    };
  });

  return {
    partyId,
    partyName: p.name,
    basePure,
    baseCash,
    rows,
    closingPure: round3(runPure),
    closingCash: round2(runCash),
  };
}

/**
 * What the customer's Opg Pure / Opg Cash should read on a NEW bill, or on an
 * existing one being edited (the position immediately before that bill).
 */
export async function getCarryForward(
  partyId: string,
  beforeTxnId?: string | null,
): Promise<{ pure: number; cash: number; lastBillNo: number | null; lastBillDate: Date | null }> {
  const led = await getPartyLedger(partyId);
  if (!led) return { pure: 0, cash: 0, lastBillNo: null, lastBillDate: null };
  if (beforeTxnId) {
    const row = led.rows.find((r) => r.txnId === beforeTxnId);
    if (row) {
      const idx = led.rows.indexOf(row);
      const prev = idx > 0 ? led.rows[idx - 1] : null;
      return {
        pure: row.openingPure,
        cash: row.openingCash,
        lastBillNo: prev?.serialNo ?? null,
        lastBillDate: prev?.txnDate ?? null,
      };
    }
  }
  const last = led.rows[led.rows.length - 1] ?? null;
  return {
    pure: led.closingPure,
    cash: led.closingCash,
    lastBillNo: last?.serialNo ?? null,
    lastBillDate: last?.txnDate ?? null,
  };
}

/** Bills on a given date, for the Find-by-date picker on the entry screen. */
export async function findBillsByDate(
  date: string,
  partyId?: string | null,
): Promise<{ id: string; serialNo: number; trnType: string; partyName: string | null; value: number; txnDate: Date }[]> {
  const start = dayStart(date);
  const end = dayEnd(date);

  const rows = await db
    .select({ t: transactions, pName: parties.name })
    .from(transactions)
    .leftJoin(parties, eq(transactions.partyId, parties.id))
    .orderBy(asc(transactions.serialNo));

  const inDay = rows.filter(
    (r) => r.t.txnDate >= start && r.t.txnDate <= end && (!partyId || r.t.partyId === partyId),
  );
  if (!inDay.length) return [];

  const ids = inDay.map((r) => r.t.id);
  const lines = await db
    .select()
    .from(transactionLines)
    .where(inArray(transactionLines.transactionId, ids));
  const value = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const l of lines) value.set(l.transactionId, (value.get(l.transactionId) ?? 0) + num(l.amount));

  return inDay.map((r) => ({
    id: r.t.id,
    serialNo: r.t.serialNo,
    trnType: r.t.trnType,
    partyName: r.pName,
    value: round2(value.get(r.t.id) ?? 0),
    txnDate: r.t.txnDate,
  }));
}
