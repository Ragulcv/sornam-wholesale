"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  isPinSet,
  logout,
  requireSession,
  setPin,
  verifyPinAndLogin,
  verifyPinOnly,
} from "@/lib/auth";
import {
  createBooking,
  createCustomer,
  findOrCreateCustomer,
  recordCollection,
  updateSettings,
} from "@/lib/queries";
import type { PaymentMode, RateUnit } from "@/lib/format";
import { buildWhatsappUrl } from "@/lib/whatsapp";

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

// ---- Auth ---------------------------------------------------------------

export async function setPinAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (await isPinSet()) return { error: "PIN already set." };
  const pin = str(fd, "pin");
  if (!/^\d{4,8}$/.test(pin))
    return { error: "PIN must be 4–8 digits." };
  if (pin !== str(fd, "confirm"))
    return { error: "PINs do not match." };
  await setPin(pin);
  redirect("/");
}

export async function loginAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const pin = str(fd, "pin");
  const result = await verifyPinAndLogin(pin);
  if (result.ok) redirect("/");
  if (result.reason === "locked")
    return {
      error: `Too many attempts. Try again in ${result.retryInSeconds}s.`,
    };
  return { error: `Wrong PIN. ${result.attemptsLeft} attempt(s) left.` };
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/lock");
}

export async function verifyPanicAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ok = await verifyPinOnly(str(fd, "pin"));
  return ok ? { ok: true } : { error: "Wrong PIN." };
}

// ---- Bookings & collections --------------------------------------------

export async function createBookingAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  await requireSession();

  const name = str(fd, "customerName");
  if (!name) return { error: "Customer name is required." };
  const phone = str(fd, "customerPhone");

  const metal = str(fd, "metal") === "silver" ? "silver" : "gold";
  const purity = str(fd, "purity") || (metal === "gold" ? "995" : "999");
  const weight = numField(fd, "weight");
  if (weight <= 0) return { error: "Enter a booking weight." };

  const rateMode = str(fd, "rateMode") === "float" ? "float" : "locked";
  const rateUnit = (str(fd, "rateUnit") || "per_10g") as RateUnit;
  const lockedRate = rateMode === "locked" ? numField(fd, "lockedRate") : 0;
  if (rateMode === "locked" && lockedRate <= 0)
    return { error: "Enter the locked rate." };
  const advance = numField(fd, "advance");

  const customerId = await findOrCreateCustomer(name, phone);
  const bookingId = await createBooking({
    customerId,
    metal,
    purity,
    weightBookedG: weight,
    rateMode,
    lockedRate: rateMode === "locked" ? lockedRate : null,
    rateUnit,
    advanceAmount: advance,
    notes: str(fd, "notes") || null,
  });

  revalidatePath("/");
  revalidatePath("/bookings");

  const whatsappUrl = phone
    ? buildWhatsappUrl(phone, {
        name,
        metal,
        purity,
        weight,
        rateMode,
        rate: lockedRate,
        rateUnit,
        advance,
      })
    : null;

  return { ok: true, bookingId, whatsappUrl };
}

export async function recordCollectionAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  await requireSession();

  const bookingId = str(fd, "bookingId");
  const weight = numField(fd, "weight");
  if (weight <= 0) return { error: "Enter the collected weight." };
  const rate = numField(fd, "rate");
  if (rate <= 0) return { error: "Enter the rate." };
  const paymentMode = (str(fd, "paymentMode") || "cash") as PaymentMode;
  const slipType = str(fd, "slipType") === "gst" ? "gst" : "plain";

  const { id } = await recordCollection({
    bookingId,
    weightCollectedG: weight,
    rate,
    paymentMode,
    slipType,
  });

  revalidatePath("/");
  revalidatePath("/ledger");
  revalidatePath(`/bookings/${bookingId}`);

  return { ok: true, collectionId: id };
}

// ---- Customers ----------------------------------------------------------

export async function createCustomerAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  await requireSession();
  const name = str(fd, "name");
  if (!name) return { error: "Name is required." };
  await createCustomer({
    name,
    phone: str(fd, "phone") || null,
    gstin: str(fd, "gstin") || null,
    notes: str(fd, "notes") || null,
  });
  revalidatePath("/customers");
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
    defaultGoldRate: str(fd, "defaultGoldRate")
      ? numField(fd, "defaultGoldRate")
      : null,
    defaultSilverRate: str(fd, "defaultSilverRate")
      ? numField(fd, "defaultSilverRate")
      : null,
  });
  revalidatePath("/settings");
  return { ok: true };
}
