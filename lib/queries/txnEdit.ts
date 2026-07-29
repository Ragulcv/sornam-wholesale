import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { transactions, transactionLines, metalMovements, settlements } from "../db/schema";
import { pure, lineAmount, round2 } from "../bullion";
import type { TxnInput } from "./transactions";

/**
 * Edit an existing bill (item #3). Updates the header and fully replaces the
 * child rows (lines / metal movements / settlements) — preserves serialNo.
 */
export async function updateTransaction(
  id: string,
  input: TxnInput,
): Promise<{ id: string; serialNo: number } | null> {
  const existing = await db
    .select({ id: transactions.id, serialNo: transactions.serialNo })
    .from(transactions)
    .where(eq(transactions.id, id));
  if (!existing[0]) return null;

  await db
    .update(transactions)
    .set({
      trnType: input.trnType,
      partyId: input.partyId,
      metal: input.metal,
      txnDate: input.txnDate ? new Date(input.txnDate) : new Date(),
      barRate: input.barRate != null ? String(input.barRate) : null,
      refNo: input.refNo?.trim() || null,
      thru: input.thru?.trim() || null,
      narration: input.narration?.trim() || null,
      tdsAmount: String(input.tdsAmount ?? 0),
      modifiedBy: input.operatorName,
      modifiedAt: new Date(),
    })
    .where(eq(transactions.id, id));

  // replace children
  await db.delete(transactionLines).where(eq(transactionLines.transactionId, id));
  await db.delete(metalMovements).where(eq(metalMovements.transactionId, id));
  await db.delete(settlements).where(eq(settlements.transactionId, id));

  const lineRows = input.lines
    .filter((l) => l.weight > 0)
    .map((l, i) => ({
      transactionId: id,
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
      transactionId: id,
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
      transactionId: id,
      mode: s.mode,
      direction: s.direction,
      amount: String(s.amount),
      bankName: s.bankName?.trim() || null,
    }));
  if (setRows.length) await db.insert(settlements).values(setRows);

  return existing[0];
}

export interface PartyHistoryRow {
  id: string;
  serialNo: number;
  trnType: string;
  txnDate: Date;
  gross: number;
}

/** Recent bills for a party — shown in-place when editing (item #16). */
export async function getPartyTxnHistory(partyId: string, limit = 20): Promise<PartyHistoryRow[]> {
  const rows = await db
    .select({ t: transactions })
    .from(transactions)
    .where(eq(transactions.partyId, partyId))
    .orderBy(desc(transactions.txnDate))
    .limit(limit);
  const ids = rows.map((r) => r.t.id);
  if (!ids.length) return [];
  const lines = await db.select().from(transactionLines).where(inArray(transactionLines.transactionId, ids));
  const gross = new Map<string, number>();
  for (const l of lines) gross.set(l.transactionId, (gross.get(l.transactionId) ?? 0) + Number(l.amount));
  return rows.map((r) => ({
    id: r.t.id,
    serialNo: r.t.serialNo,
    trnType: r.t.trnType,
    txnDate: r.t.txnDate,
    gross: round2(gross.get(r.t.id) ?? 0),
  }));
}

/** Find a bill id by its serial number (the "No." shown on the entry screen). */
export async function findTransactionBySerial(serialNo: number): Promise<string | null> {
  const rows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.serialNo, serialNo))
    .limit(1);
  return rows[0]?.id ?? null;
}
