import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  transactions,
  transactionLines,
  metalMovements,
  settlements,
  parties,
} from "../db/schema";
import {
  pure,
  lineAmount,
  round2,
  type Metal,
  type LineKind,
  type MoveDir,
  type PayMode,
} from "../bullion";

export interface LineInput {
  kind: LineKind;
  particulars?: string;
  weight: number;
  touch?: number;
  rate: number;
}
export interface MoveInput {
  direction: MoveDir;
  particulars?: string;
  weight: number;
  touch?: number;
  aTouch?: number;
}
export interface SettleInput {
  mode: PayMode;
  direction: MoveDir;
  amount: number;
  bankName?: string;
}
export interface TxnInput {
  trnType: "sales" | "purchase" | "expense";
  partyId: string | null;
  metal: Metal;
  txnDate?: string;
  barRate?: number;
  refNo?: string;
  thru?: string;
  narration?: string;
  tdsAmount?: number;
  operatorName: string;
  lines: LineInput[];
  movements: MoveInput[];
  settlements: SettleInput[];
}

const num = (v: string | null): number => (v == null ? 0 : parseFloat(v));

export async function createTransaction(
  input: TxnInput,
): Promise<{ id: string; serialNo: number }> {
  const [txn] = await db
    .insert(transactions)
    .values({
      trnType: input.trnType,
      partyId: input.partyId,
      metal: input.metal,
      txnDate: input.txnDate ? new Date(input.txnDate) : new Date(),
      barRate: input.barRate != null ? String(input.barRate) : null,
      refNo: input.refNo?.trim() || null,
      thru: input.thru?.trim() || null,
      narration: input.narration?.trim() || null,
      tdsAmount: String(input.tdsAmount ?? 0),
      createdBy: input.operatorName,
      modifiedBy: input.operatorName,
    })
    .returning({ id: transactions.id, serialNo: transactions.serialNo });

  const lineRows = input.lines
    .filter((l) => l.weight > 0)
    .map((l, i) => ({
      transactionId: txn.id,
      kind: l.kind,
      particulars: l.particulars?.trim() || null,
      weight: String(l.weight),
      touch: l.touch != null ? String(l.touch) : null,
      pure: String(pure(l.weight, l.touch ?? 0)),
      rate: String(l.rate),
      amount: String(lineAmount(l.weight, l.rate)),
      sortOrder: i,
    }));
  if (lineRows.length) await db.insert(transactionLines).values(lineRows);

  const moveRows = input.movements
    .filter((m) => m.weight > 0)
    .map((m) => ({
      transactionId: txn.id,
      direction: m.direction,
      particulars: m.particulars?.trim() || null,
      weight: String(m.weight),
      touch: m.touch != null ? String(m.touch) : null,
      aTouch: m.aTouch != null ? String(m.aTouch) : null,
      pure: String(pure(m.weight, m.touch ?? 0)),
    }));
  if (moveRows.length) await db.insert(metalMovements).values(moveRows);

  const setRows = input.settlements
    .filter((s) => s.amount > 0)
    .map((s) => ({
      transactionId: txn.id,
      mode: s.mode,
      direction: s.direction,
      amount: String(s.amount),
      bankName: s.bankName?.trim() || null,
    }));
  if (setRows.length) await db.insert(settlements).values(setRows);

  return txn;
}

export interface TransactionDetail {
  id: string;
  serialNo: number;
  trnType: string;
  partyId: string | null;
  partyName: string | null;
  metal: Metal;
  txnDate: Date;
  barRate: number | null;
  refNo: string | null;
  tdsAmount: number;
  createdBy: string | null;
  createdAt: Date;
  lines: {
    id: string;
    kind: string;
    particulars: string | null;
    weight: number;
    touch: number | null;
    pure: number;
    rate: number;
    amount: number;
  }[];
  movements: {
    id: string;
    direction: MoveDir;
    particulars: string | null;
    weight: number;
    touch: number | null;
    aTouch: number | null;
    pure: number;
  }[];
  settlements: { id: string; mode: PayMode; direction: MoveDir; amount: number; bankName: string | null }[];
  grossAmount: number;
  netAmount: number;
}

export async function getTransaction(id: string): Promise<TransactionDetail | null> {
  const rows = await db
    .select({ t: transactions, pName: parties.name })
    .from(transactions)
    .leftJoin(parties, eq(transactions.partyId, parties.id))
    .where(eq(transactions.id, id));
  const row = rows[0];
  if (!row) return null;
  const [lines, moves, setls] = await Promise.all([
    db.select().from(transactionLines).where(eq(transactionLines.transactionId, id)).orderBy(transactionLines.sortOrder),
    db.select().from(metalMovements).where(eq(metalMovements.transactionId, id)),
    db.select().from(settlements).where(eq(settlements.transactionId, id)),
  ]);
  const gross = round2(lines.reduce((a, l) => a + num(l.amount), 0));
  const tds = num(row.t.tdsAmount);
  return {
    id: row.t.id,
    serialNo: row.t.serialNo,
    trnType: row.t.trnType,
    partyId: row.t.partyId,
    partyName: row.pName,
    metal: row.t.metal,
    txnDate: row.t.txnDate,
    barRate: row.t.barRate == null ? null : num(row.t.barRate),
    refNo: row.t.refNo,
    tdsAmount: tds,
    createdBy: row.t.createdBy,
    createdAt: row.t.createdAt,
    lines: lines.map((l) => ({ id: l.id, kind: l.kind, particulars: l.particulars, weight: num(l.weight), touch: l.touch == null ? null : num(l.touch), pure: num(l.pure), rate: num(l.rate), amount: num(l.amount) })),
    movements: moves.map((m) => ({ id: m.id, direction: m.direction, particulars: m.particulars, weight: num(m.weight), touch: m.touch == null ? null : num(m.touch), aTouch: m.aTouch == null ? null : num(m.aTouch), pure: num(m.pure) })),
    settlements: setls.map((s) => ({ id: s.id, mode: s.mode, direction: s.direction, amount: num(s.amount), bankName: s.bankName })),
    grossAmount: gross,
    netAmount: round2(gross - tds),
  };
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.delete(transactions).where(eq(transactions.id, id));
}

export async function bulkDeleteTransactions(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  await db.delete(transactions).where(inArray(transactions.id, ids));
  return ids.length;
}

export interface CombinedBill {
  partyName: string | null;
  serialNos: number[];
  lines: { particulars: string | null; weight: number; pure: number; rate: number; amount: number }[];
  gross: number;
  tds: number;
  total: number;
}

/** Merge multiple transactions' line items into one combined bill. */
export async function getCombinedBill(ids: string[]): Promise<CombinedBill | null> {
  if (!ids.length) return null;
  const txns = await db
    .select({ t: transactions, pName: parties.name })
    .from(transactions)
    .leftJoin(parties, eq(transactions.partyId, parties.id))
    .where(inArray(transactions.id, ids));
  if (txns.length === 0) return null;
  const lines = await db
    .select()
    .from(transactionLines)
    .where(inArray(transactionLines.transactionId, ids));

  const gross = round2(lines.reduce((a, l) => a + num(l.amount), 0));
  const tds = round2(txns.reduce((a, r) => a + num(r.t.tdsAmount), 0));
  return {
    partyName: txns[0].pName,
    serialNos: txns.map((r) => r.t.serialNo).sort((a, b) => a - b),
    lines: lines.map((l) => ({ particulars: l.particulars, weight: num(l.weight), pure: num(l.pure), rate: num(l.rate), amount: num(l.amount) })),
    gross,
    tds,
    total: round2(gross - tds),
  };
}

export async function recentTransactions(limit = 10) {
  const rows = await db
    .select({ t: transactions, pName: parties.name })
    .from(transactions)
    .leftJoin(parties, eq(transactions.partyId, parties.id))
    .orderBy(desc(transactions.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.t.id,
    serialNo: r.t.serialNo,
    trnType: r.t.trnType,
    partyName: r.pName,
    metal: r.t.metal,
    txnDate: r.t.txnDate,
    createdBy: r.t.createdBy,
  }));
}
