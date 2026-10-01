import { fmtMoney, fmtWeight, fmtRate, metalLabel } from "./format";
import { SHOP_TZ } from "./dates";

export function normalisePhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  return d;
}

function url(phone: string, body: string): string {
  return `https://wa.me/${normalisePhone(phone)}?text=${encodeURIComponent(body)}`;
}

// ---------------------------------------------------------------------------
// Templates. The wording is editable in Settings; these are the fallbacks used
// when nothing has been customised. Placeholders are {name} style and any that
// have no value for a given message are dropped along with their whole line, so
// a template can mention {rate} without leaving "Rate: " dangling on a booking
// that has no rate yet.
// ---------------------------------------------------------------------------

export const PLACEHOLDERS = [
  "{customer}",
  "{metal}",
  "{weight}",
  "{rate}",
  "{amount}",
  "{pending}",
  "{bill_no}",
  "{date}",
  "{type}",
] as const;

export const DEFAULT_BOOKING_TEMPLATE = `Namaste {customer},

{type} is confirmed:
• Booked value: {amount}
• Rate: {rate}/g
• Pending {metal}: {pending}

Thank you.`;

export const DEFAULT_SALES_TEMPLATE = `Namaste {customer},

Your {metal} is confirmed:
• Bill No: {bill_no}
• Weight: {weight}
• Rate: {rate}/g
• Value: {amount}

Thank you.`;

export const DEFAULT_PURCHASE_TEMPLATE = `Namaste {customer},

We have recorded your {metal}:
• Bill No: {bill_no}
• Weight: {weight}
• Rate: {rate}/g
• Value: {amount}

Thank you.`;

export const DEFAULT_DELIVERED_TEMPLATE = `Namaste {customer},

Your {metal} has been delivered:
• Weight: {weight}

Thank you.`;

/**
 * Fill a template. A line whose only placeholder resolves to nothing is removed
 * entirely, so blank fields never leave half-written lines in the message.
 */
export function renderTemplate(template: string, values: Record<string, string | null | undefined>): string {
  const lines = template.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const used = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    if (used.length && used.every((k) => !values[k])) continue; // drop empty line
    kept.push(line.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? ""));
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export interface BookingMsg {
  partyName: string;
  side?: "sell" | "buy";
  bookType?: "ready" | "forward" | "unfixed";
  metal: string;
  weight?: number;
  rate?: number;
  amount?: number;
  delivered?: number;
  template?: string | null;
}

export function buildBookingWhatsapp(phone: string, d: BookingMsg): string {
  const weight = d.weight ?? 0;
  const rate = d.rate ?? 0;
  const value = d.amount ?? (rate > 0 ? weight * rate : 0);
  const pending = Math.max(0, weight - (d.delivered ?? 0));
  const typeLabel =
    d.side === "buy"
      ? "Your sale to us"
      : d.bookType === "forward"
        ? "Your forward booking"
        : d.bookType === "unfixed"
          ? "Your unfixed booking"
          : "Your booking";
  const body = renderTemplate(d.template || DEFAULT_BOOKING_TEMPLATE, {
    customer: d.partyName,
    metal: metalLabel(d.metal),
    weight: weight > 0 ? fmtWeight(weight) : "",
    rate: rate > 0 ? fmtRate(rate) : "",
    amount: value > 0 ? fmtMoney(value) : "",
    pending: pending > 0 ? fmtWeight(pending) : "",
    type: typeLabel,
    date: new Date().toLocaleDateString("en-IN", { timeZone: SHOP_TZ }),
  });
  return url(phone, body);
}

export interface SalesMsg {
  partyName: string;
  metal: string;
  totalWeight: number;
  rate: number;
  amount?: number;
  billNo?: number;
  trnType?: "sales" | "purchase";
  template?: string | null;
}

export function buildSalesWhatsapp(phone: string, d: SalesMsg): string {
  const fallback = d.trnType === "purchase" ? DEFAULT_PURCHASE_TEMPLATE : DEFAULT_SALES_TEMPLATE;
  const body = renderTemplate(d.template || fallback, {
    customer: d.partyName,
    metal: metalLabel(d.metal),
    weight: d.totalWeight > 0 ? fmtWeight(d.totalWeight) : "",
    rate: d.rate > 0 ? fmtRate(d.rate) : "",
    amount: d.amount && d.amount !== 0 ? fmtMoney(d.amount) : "",
    bill_no: d.billNo != null ? String(d.billNo) : "",
    type: d.trnType === "purchase" ? "Purchase" : "Sale",
    date: new Date().toLocaleDateString("en-IN", { timeZone: SHOP_TZ }),
  });
  return url(phone, body);
}

export interface DeliveredMsg {
  partyName: string;
  metal: string;
  weight: number;
  template?: string | null;
}

export function buildDeliveredWhatsapp(phone: string, d: DeliveredMsg): string {
  const body = renderTemplate(d.template || DEFAULT_DELIVERED_TEMPLATE, {
    customer: d.partyName,
    metal: metalLabel(d.metal),
    weight: d.weight > 0 ? fmtWeight(d.weight) : "",
    date: new Date().toLocaleDateString("en-IN", { timeZone: SHOP_TZ }),
  });
  return url(phone, body);
}
