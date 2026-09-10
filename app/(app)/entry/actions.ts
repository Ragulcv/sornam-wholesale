"use server";

import { revalidatePath } from "next/cache";
import { requireSession, currentOperatorName } from "@/lib/auth";
import { getTransaction, type TransactionDetail } from "@/lib/queries/transactions";
import {
  updateTransaction,
  getPartyTxnHistory,
  findTransactionBySerial,
  type PartyHistoryRow,
} from "@/lib/queries/txnEdit";
import {
  getPartyLedger,
  getCarryForward,
  findBillsByDate,
  type LedgerRow,
} from "@/lib/queries/partyLedger";
import { unlinkDeliveriesForTransaction, recordDelivery } from "@/lib/queries/bookings";
import type { TxnActionInput } from "@/app/actions";

/**
 * What Opg Pure / Opg Cash must read for this customer: the carried-forward
 * closing balance of their previous bill, not the static opening figure.
 */
export async function carryForwardAction(
  partyId: string,
  beforeTxnId?: string | null,
): Promise<{ pure: number; cash: number; lastBillNo: number | null; lastBillDate: string | null }> {
  await requireSession();
  const cf = await getCarryForward(partyId, beforeTxnId);
  return {
    pure: cf.pure,
    cash: cf.cash,
    lastBillNo: cf.lastBillNo,
    lastBillDate: cf.lastBillDate ? cf.lastBillDate.toISOString() : null,
  };
}

/** The customer's whole linked history, every bill chained to the last. */
export async function partyLedgerAction(partyId: string): Promise<{
  basePure: number;
  baseCash: number;
  closingPure: number;
  closingCash: number;
  rows: (Omit<LedgerRow, "txnDate"> & { txnDate: string })[];
} | null> {
  await requireSession();
  const led = await getPartyLedger(partyId);
  if (!led) return null;
  return {
    basePure: led.basePure,
    baseCash: led.baseCash,
    closingPure: led.closingPure,
    closingCash: led.closingCash,
    rows: led.rows.map((r) => ({ ...r, txnDate: r.txnDate.toISOString() })),
  };
}

/** Find: pick a date, see that day's bills, load one. */
export async function billsByDateAction(
  date: string,
  partyId?: string | null,
): Promise<{ id: string; serialNo: number; trnType: string; partyName: string | null; value: number; txnDate: string }[]> {
  await requireSession();
  const rows = await findBillsByDate(date, partyId);
  return rows.map((r) => ({ ...r, txnDate: r.txnDate.toISOString() }));
}

/** Party running cash balance shown on the bill. */
export async function partyBalanceAction(partyId: string): Promise<number> {
  await requireSession();
  const cf = await getCarryForward(partyId);
  return cf.cash;
}

/** Find + load an existing bill by its serial No. */
export async function loadBillAction(
  serialNo: number,
): Promise<{ ok: true; detail: TransactionDetail } | { ok: false; error: string }> {
  await requireSession();
  const id = await findTransactionBySerial(serialNo);
  if (!id) return { ok: false, error: `No bill No. ${serialNo}` };
  const detail = await getTransaction(id);
  if (!detail) return { ok: false, error: "Bill not found" };
  return { ok: true, detail };
}

export async function loadBillByIdAction(
  id: string,
): Promise<{ ok: true; detail: TransactionDetail } | { ok: false; error: string }> {
  await requireSession();
  const detail = await getTransaction(id);
  if (!detail) return { ok: false, error: "Bill not found" };
  return { ok: true, detail };
}

/** Save edits back to an existing bill. */
export async function updateBillAction(
  id: string,
  input: TxnActionInput,
): Promise<{ ok: true; serialNo: number } | { ok: false; error: string }> {
  await requireSession();
  const operatorName = await currentOperatorName();
  // Re-point the booking links: drop what this bill claimed before, then
  // re-claim from the lines as they now stand.
  await unlinkDeliveriesForTransaction(id);
  const res = await updateTransaction(id, {
    trnType: input.trnType,
    partyId: input.partyId,
    metal: input.metal,
    txnDate: input.txnDate,
    barRate: input.barRate,
    refNo: input.refNo,
    thru: input.thru,
    narration: input.narration,
    tdsAmount: input.tdsAmount,
    operatorName,
    lines: input.lines,
    movements: input.movements,
    settlements: input.settlements,
  });
  if (!res) return { ok: false, error: "Bill not found" };
  for (const l of input.lines) {
    if (l.bookingId && l.weight > 0) await recordDelivery(l.bookingId, id, l.weight);
  }
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/stock");
  revalidatePath("/bookings");
  return { ok: true, serialNo: res.serialNo };
}

/** A party's recent bills — shown in-place while editing. */
export async function partyHistoryAction(partyId: string): Promise<PartyHistoryRow[]> {
  await requireSession();
  return getPartyTxnHistory(partyId);
}
