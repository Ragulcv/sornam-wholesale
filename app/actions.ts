"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  isPinSet,
  logout,
  requireSession,
  setPin,
  setSessionOperator,
  verifyPinAndLogin,
  currentOperatorName,
} from "@/lib/auth";
import {
  createTransaction,
  deleteTransaction,
  type LineInput,
  type MoveInput,
  type SettleInput,
} from "@/lib/queries/transactions";
import { buildSalesWhatsapp } from "@/lib/whatsapp";
import type { Metal } from "@/lib/bullion";
import { getOperator, listOperators } from "@/lib/queries/operators";
import { updateSettings } from "@/lib/queries/settings";
import {
  createParty,
  updateParty,
  deleteParty,
  bulkDeleteParties,
} from "@/lib/queries/parties";

export interface ActionState {
  error?: string;
  ok?: boolean;
  [key: string]: unknown;
}

function str(fd: FormData, k: string): string {
  return (fd.get(k) as string | null)?.trim() ?? "";
}
function numField(fd: FormData, k: string): number {
  return parseFloat(str(fd, k)) || 0;
}

// ---- Auth + operator ----------------------------------------------------

export async function setPinAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (await isPinSet()) return { error: "PIN already set." };
  const pin = str(fd, "pin");
  if (!/^\d{4,8}$/.test(pin)) return { error: "PIN must be 4–8 digits." };
  if (pin !== str(fd, "confirm")) return { error: "PINs do not match." };
  await setPin(pin);
  return { ok: true, operators: await listOperators() };
}

export async function loginAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const result = await verifyPinAndLogin(str(fd, "pin"));
  if (result.ok) return { ok: true, operators: await listOperators() };
  if (result.reason === "locked")
    return { error: `Too many attempts. Try again in ${result.retryInSeconds}s.` };
  return { error: `Wrong PIN. ${result.attemptsLeft} attempt(s) left.` };
}

export async function setOperatorAction(operatorId: string): Promise<ActionState> {
  await requireSession();
  const op = await getOperator(operatorId);
  if (!op) return { error: "Unknown operator." };
  await setSessionOperator(op.id, op.name);
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/lock");
}

/** Keep the shop unlocked but clear the operator, so the picker shows again. */
export async function switchOperatorAction(): Promise<void> {
  await requireSession();
  const { getSession } = await import("@/lib/session");
  const session = await getSession();
  session.operatorId = undefined;
  session.operatorName = undefined;
  await session.save();
  redirect("/lock");
}

// ---- Parties ------------------------------------------------------------

function partyFromForm(fd: FormData) {
  return {
    name: str(fd, "name"),
    phone: str(fd, "phone") || null,
    gstin: str(fd, "gstin") || null,
    type: str(fd, "type") || "customer",
    openingPureGold: numField(fd, "openingPureGold"),
    openingPureSilver: numField(fd, "openingPureSilver"),
    openingCash: numField(fd, "openingCash"),
    notes: str(fd, "notes") || null,
  };
}

export async function createPartyAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  await requireSession();
  const data = partyFromForm(fd);
  if (!data.name) return { error: "Name is required." };
  await createParty(data);
  revalidatePath("/parties");
  return { ok: true };
}

export async function updatePartyAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = str(fd, "id");
  const data = partyFromForm(fd);
  if (!id || !data.name) return { error: "Name is required." };
  await updateParty(id, data);
  revalidatePath("/parties");
  return { ok: true };
}

export async function savePartyAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = str(fd, "id");
  const data = partyFromForm(fd);
  if (!data.name) return { error: "Name is required." };
  if (id) await updateParty(id, data);
  else await createParty(data);
  revalidatePath("/parties");
  return { ok: true };
}

export async function deletePartyAction(
  id: string,
): Promise<{ ok: boolean; reason?: "has_activity" }> {
  await requireSession();
  const res = await deleteParty(id);
  if (res.ok) revalidatePath("/parties");
  return res;
}

export async function bulkDeletePartiesAction(
  ids: string[],
): Promise<{ deleted: number; skipped: number }> {
  await requireSession();
  const res = await bulkDeleteParties(ids);
  revalidatePath("/parties");
  return res;
}

// ---- Transactions -------------------------------------------------------

export interface TxnActionInput {
  trnType: "sales" | "purchase";
  partyId: string | null;
  partyName?: string;
  partyPhone?: string;
  metal: Metal;
  txnDate?: string;
  barRate?: number;
  refNo?: string;
  thru?: string;
  narration?: string;
  tdsAmount?: number;
  lines: LineInput[];
  movements: MoveInput[];
  settlements: SettleInput[];
}

export async function createTransactionAction(
  input: TxnActionInput,
): Promise<ActionState> {
  await requireSession();
  const validLines = (input.lines || []).filter((l) => l.weight > 0);
  if (validLines.length === 0) return { error: "Add at least one line item." };
  if (!input.metal) return { error: "Pick a metal." };

  const operatorName = await currentOperatorName();
  const { id, serialNo } = await createTransaction({
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
    lines: validLines,
    movements: input.movements || [],
    settlements: input.settlements || [],
  });

  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/stock");

  let whatsappUrl: string | null = null;
  if (input.trnType === "sales" && input.partyPhone) {
    const totalWeight = validLines.reduce((a, l) => a + l.weight, 0);
    const rate = input.barRate || validLines[0]?.rate || 0;
    whatsappUrl = buildSalesWhatsapp(input.partyPhone, {
      partyName: input.partyName || "Customer",
      metal: input.metal,
      totalWeight,
      rate,
    });
  }
  return { ok: true, id, serialNo, whatsappUrl };
}

export async function deleteTransactionAction(id: string): Promise<void> {
  await requireSession();
  await deleteTransaction(id);
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/stock");
}

// ---- Settings -----------------------------------------------------------

export async function updateSettingsAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  await requireSession();
  const minutes = Math.min(60, Math.max(1, numField(fd, "autoLogoffMinutes") || 7));
  await updateSettings({
    autoLogoffMinutes: minutes,
    gstin: str(fd, "gstin") || null,
    taxPercent: Math.min(100, Math.max(0, numField(fd, "taxPercent"))),
    tdsPercent: Math.min(100, Math.max(0, numField(fd, "tdsPercent"))),
    defaultGoldRate: str(fd, "defaultGoldRate") ? numField(fd, "defaultGoldRate") : null,
    defaultSilverRate: str(fd, "defaultSilverRate") ? numField(fd, "defaultSilverRate") : null,
  });
  revalidatePath("/settings");
  return { ok: true };
}
