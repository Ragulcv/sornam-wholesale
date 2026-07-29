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
import { getPartyCashBalance } from "@/lib/queries/partyBalance";
import type { TxnActionInput } from "@/app/actions";

/** Party running cash balance shown on the bill (item #9). */
export async function partyBalanceAction(partyId: string): Promise<number> {
  await requireSession();
  return getPartyCashBalance(partyId);
}

/** Find + load an existing bill by its serial No. (item #3 Find/Edit). */
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

/** Save edits back to an existing bill (item #3). */
export async function updateBillAction(
  id: string,
  input: TxnActionInput,
): Promise<{ ok: true; serialNo: number } | { ok: false; error: string }> {
  await requireSession();
  const operatorName = await currentOperatorName();
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
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/stock");
  return { ok: true, serialNo: res.serialNo };
}

/** A party's recent bills — shown in-place while editing (item #16). */
export async function partyHistoryAction(partyId: string): Promise<PartyHistoryRow[]> {
  await requireSession();
  return getPartyTxnHistory(partyId);
}
