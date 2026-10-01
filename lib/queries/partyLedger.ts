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
 * Sign convention throughout, the same as the bill's Clsg. Bal. (Logimax):
 *   NEGATIVE = the customer owes us; POSITIVE = we owe them (they are in credit).
 *   A receipt shows NEGATIVE in its own column, and a bill with nothing
 *   received shows 0 there rather than blank.
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

  // Replay every bill exactly as the entry screen settled it, so the balance a
  // customer carries into the next bill is the "After this bill" figure they
  // saw on this one. A priced bill (rate > 0) converts its pure into cash at the
  // bill rate, so it moves CASH only; an unpriced, metal-for-metal bill moves
  // PURE. Adding both would count the same gold twice.
  const per = new Map<string, { pure: number; cash: number; cashRecd: number; bankRecd: number }>();
  for (const t of txns) {
    if (t.trnType === "expense") continue; // shop costs, not the customer's account
    const isPurchase = t.trnType === "purchase";
    const tl = lines.filter((l) => l.transactionId === t.id);
    const main = tl.filter((l) => l.kind === "sale" || l.kind === "purchase");
    const ret = tl.filter((l) => l.kind === "sale_return" || l.kind === "purchase_return");
    const mv = moves.filter((m) => m.transactionId === t.id);
    const st = setls.filter((x) => x.transactionId === t.id);

    const rate = t.barRate != null ? num(t.barRate) : main.length ? num(main[0].rate) : 0;
    const totalPure =
      main.reduce((a, l) => a + num(l.pure), 0) -
      ret.reduce((a, l) => a + num(l.pure), 0) -
      mv.reduce((a, m) => a + (m.direction === "received" ? 1 : -1) * num(m.pure), 0);

    // money in the bill's own direction: a sale is paid TO us, a purchase BY us
    const own = isPurchase ? "paid" : "received";
    const amt = (mode: "cash" | "bank") =>
      st.filter((x) => x.mode === mode).reduce((a, x) => a + (x.direction === own ? 1 : -1) * num(x.amount), 0);
    const cashPaid = amt("cash"), bankPaid = amt("bank");
    const payments = cashPaid + bankPaid;

    // exactly the bill's Clsg. Bal.: received minus value, so owed is negative
    const billPure = rate > 0 ? 0 : -totalPure;
    const billCash = rate > 0 ? payments - totalPure * rate : payments;

    // on a purchase the bill's "owed" is ours, so it lands on their side as credit
    const side = isPurchase ? -1 : 1;
    per.set(t.id, {
      pure: side * billPure,
      cash: side * billCash,
      cashRecd: -side * cashPaid, // a receipt shows negative; a payment we make shows positive
      bankRecd: -side * bankPaid,
    });
  }
  // keep only bills that touch the customer's account
  const kept = txns.filter((t) => per.has(t.id));

  let runPure = basePure;
  let runCash = baseCash;
  const rows: LedgerRow[] = kept.map((t) => {
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
