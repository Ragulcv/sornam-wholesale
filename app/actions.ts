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
  bulkDeleteTransactions,
  type LineInput,
  type MoveInput,
  type SettleInput,
} from "@/lib/queries/transactions";
import { buildSalesWhatsapp, buildBookingWhatsapp, buildDeliveredWhatsapp } from "@/lib/whatsapp";
import type { Metal } from "@/lib/bullion";
import type { BookType, BookSide } from "@/lib/lkb";
import {
  createBooking,
  updateBooking,
  deliverBooking,
  deleteBooking,
  bulkDeleteBookings,
  saveLotPosition,
  deleteLotPosition,
  recordDelivery,
} from "@/lib/queries/bookings";
import { getOperator, listOperators } from "@/lib/queries/operators";
import { updateSettings, getMessageTemplates } from "@/lib/queries/settings";
import { updateStockOpening } from "@/lib/queries/stock";
import {
  createParty,
  updateParty,
  deleteParty,
  bulkDeleteParties,
  findOrCreateParty,
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

  // Auto-create the party if a new name was typed instead of picked.
  let partyId = input.partyId;
  if (!partyId && input.partyName?.trim())
    partyId = await findOrCreateParty(input.partyName, input.partyPhone);

  const operatorName = await currentOperatorName();
  const { id, serialNo } = await createTransaction({
    trnType: input.trnType,
    partyId,
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

  // Saving a bill against a booking is what marks that booking delivered.
  for (const l of validLines) {
    if (l.bookingId) await recordDelivery(l.bookingId, id, l.weight);
  }
  revalidatePath("/bookings");

  let whatsappUrl: string | null = null;
  if (input.partyPhone) {
    const totalWeight = validLines.reduce((a, l) => a + l.weight, 0);
    const rate = input.barRate || validLines[0]?.rate || 0;
    const tpl = await getMessageTemplates();
    whatsappUrl = buildSalesWhatsapp(input.partyPhone, {
      partyName: input.partyName || "Customer",
      metal: input.metal,
      totalWeight,
      rate,
      amount: validLines.reduce((a, l) => a + l.weight * l.rate, 0),
      billNo: serialNo,
      template: input.trnType === "purchase" ? tpl.purchase : tpl.sales,
      trnType: input.trnType,
    });
  }
  return { ok: true, id, serialNo, whatsappUrl };
}

export interface ExpenseActionInput {
  partyId?: string | null;
  txnDate?: string;
  cashPaid?: number;
  bankPaid?: number;
  bankName?: string;
  narration?: string;
}

export async function createExpenseAction(input: ExpenseActionInput): Promise<ActionState> {
  await requireSession();
  const cash = input.cashPaid ?? 0;
  const bank = input.bankPaid ?? 0;
  if (cash === 0 && bank === 0) return { error: "Enter a cash or bank amount." };
  const operatorName = await currentOperatorName();
  // A negative amount is money coming back IN (cash received), not going out.
  // Storing it as a "received" settlement of the absolute value is what makes
  // it land in the Cash Recd column of history and tally the day correctly.
  const signed = (amount: number, mode: "cash" | "bank", bankName?: string) => ({
    mode,
    direction: (amount < 0 ? "received" : "paid") as "received" | "paid",
    amount: Math.abs(amount),
    ...(bankName ? { bankName } : {}),
  });
  const { serialNo } = await createTransaction({
    trnType: "expense",
    partyId: input.partyId ?? null,
    metal: "gold",
    txnDate: input.txnDate,
    narration: input.narration,
    lines: [],
    movements: [],
    settlements: [signed(cash, "cash"), signed(bank, "bank", input.bankName)].filter((s) => s.amount > 0),
    operatorName,
  });
  revalidatePath("/expenses");
  revalidatePath("/history");
  revalidatePath("/stock");
  revalidatePath("/");
  return { ok: true, serialNo };
}

export async function deleteTransactionAction(id: string): Promise<void> {
  await requireSession();
  await deleteTransaction(id);
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/stock");
}

export async function bulkDeleteTransactionsAction(ids: string[]): Promise<void> {
  await requireSession();
  await bulkDeleteTransactions(ids);
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/stock");
}

// ---- Bookings -----------------------------------------------------------

export interface BookingActionInput {
  id?: string | null;
  partyId?: string | null;
  partyName?: string;
  partyPhone?: string;
  bookType: BookType;
  side: BookSide;
  metal: Metal;
  bookDate?: string;
  weight: number;
  rate?: number | null;
  delivered?: number;
  mcxRate?: number | null;
  remarks?: string | null;
}

export async function saveBookingAction(input: BookingActionInput): Promise<ActionState> {
  await requireSession();
  let partyId = input.partyId;
  if (!partyId && input.partyName?.trim())
    partyId = await findOrCreateParty(input.partyName, input.partyPhone);
  if (!partyId) return { error: "Pick or type a customer." };
  if (!(input.weight > 0)) return { error: "Enter the weight (WT)." };

  const operatorName = await currentOperatorName();

  if (input.id) {
    await updateBooking(input.id, { ...input, partyId, operatorName });
    revalidatePath("/bookings");
    revalidatePath("/entry");
    return { ok: true, id: input.id };
  }

  const { id, serialNo } = await createBooking({ ...input, partyId, operatorName });
  revalidatePath("/bookings");
  revalidatePath("/entry");
  revalidatePath("/");

  const tpl = await getMessageTemplates();
  const whatsappUrl = input.partyPhone
    ? buildBookingWhatsapp(input.partyPhone, {
        partyName: input.partyName || "Customer",
        side: input.side,
        bookType: input.bookType,
        metal: input.metal,
        weight: input.weight,
        rate: input.rate ?? undefined,
        template: tpl.booking,
      })
    : null;
  return { ok: true, id, serialNo, whatsappUrl };
}

export interface DeliverActionInput {
  bookingId: string;
  partyName?: string;
  partyPhone?: string;
  metal: Metal;
  barRate?: number;
  lines: LineInput[];
  settlements: SettleInput[];
}

export async function deliverBookingAction(input: DeliverActionInput): Promise<ActionState> {
  await requireSession();
  const validLines = (input.lines || []).filter((l) => l.weight > 0);
  if (validLines.length === 0) return { error: "Add the delivered items." };
  const operatorName = await currentOperatorName();
  const { txnId, serialNo } = await deliverBooking(input.bookingId, {
    metal: input.metal,
    barRate: input.barRate,
    lines: validLines,
    settlements: input.settlements || [],
    operatorName,
  });
  revalidatePath("/bookings");
  revalidatePath("/history");
  revalidatePath("/stock");
  revalidatePath("/");

  const totalWeight = validLines.reduce((a, l) => a + l.weight, 0);
  const tpl = await getMessageTemplates();
  const whatsappUrl = input.partyPhone
    ? buildDeliveredWhatsapp(input.partyPhone, {
        partyName: input.partyName || "Customer",
        metal: input.metal,
        weight: totalWeight,
        template: tpl.delivered,
      })
    : null;
  return { ok: true, txnId, serialNo, whatsappUrl };
}

export async function deleteBookingAction(id: string): Promise<void> {
  await requireSession();
  await deleteBooking(id);
  revalidatePath("/bookings");
  revalidatePath("/entry");
}

export async function bulkDeleteBookingsAction(ids: string[]): Promise<void> {
  await requireSession();
  await bulkDeleteBookings(ids);
  revalidatePath("/bookings");
  revalidatePath("/entry");
}

// ---- MCX lot positions ("- OR +" sheet) ---------------------------------

export async function saveLotPositionAction(input: {
  id?: string | null;
  block: "customer" | "account";
  name: string;
  sellLots: number;
  buyLots: number;
  notes?: string | null;
}): Promise<ActionState> {
  await requireSession();
  if (!input.name.trim()) return { error: "Enter a name." };
  await saveLotPosition({ ...input, name: input.name.trim() });
  revalidatePath("/bookings");
  return { ok: true };
}

export async function deleteLotPositionAction(id: string): Promise<void> {
  await requireSession();
  await deleteLotPosition(id);
  revalidatePath("/bookings");
}

// ---- Stock --------------------------------------------------------------

export async function updateStockAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  await updateStockOpening({
    openingPureGold: numField(fd, "openingPureGold"),
    openingPureSilver: numField(fd, "openingPureSilver"),
    openingCash: numField(fd, "openingCash"),
    openingBank: numField(fd, "openingBank"),
  });
  revalidatePath("/stock");
  revalidatePath("/");
  return { ok: true };
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
    bookingTemplate: str(fd, "bookingTemplate") || null,
    salesTemplate: str(fd, "salesTemplate") || null,
    purchaseTemplate: str(fd, "purchaseTemplate") || null,
    deliveredTemplate: str(fd, "deliveredTemplate") || null,
  });
  revalidatePath("/settings");
  return { ok: true };
}
