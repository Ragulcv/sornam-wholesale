import { fmtMoney, fmtWeight, fmtRate, metalLabel } from "./format";

export function normalisePhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  return d;
}

function url(phone: string, lines: string[]): string {
  return `https://wa.me/${normalisePhone(phone)}?text=${encodeURIComponent(lines.join("\n"))}`;
}

// Sales confirmation — gold bar + weight + locked rate, NO purity (#6).
export function buildSalesWhatsapp(
  phone: string,
  d: { partyName: string; metal: string; totalWeight: number; rate: number },
): string {
  return url(phone, [
    `Namaste ${d.partyName},`,
    ``,
    `Your ${metalLabel(d.metal)} bar is confirmed:`,
    `• Weight: ${fmtWeight(d.totalWeight)}`,
    `• Rate: ${fmtRate(d.rate)}/g`,
    ``,
    `Thank you.`,
  ]);
}

// Booking confirmation — always shows booked value + locked rate + pending
// gold together, however the booking was entered (by grams or by amount).
export function buildBookingWhatsapp(
  phone: string,
  d: {
    partyName: string;
    trnType?: "sales" | "purchase";
    metal: string;
    bookMode: "metal" | "amount";
    weight?: number;
    rate?: number;
    amount?: number;
  },
): string {
  const rate = d.rate ?? 0;
  const weight = d.bookMode === "metal" ? d.weight ?? 0 : rate > 0 ? (d.amount ?? 0) / rate : 0;
  const value = d.bookMode === "amount" ? d.amount ?? 0 : rate > 0 ? (d.weight ?? 0) * rate : 0;

  const intro = d.trnType === "purchase" ? "Your sale to us is booked:" : "Your booking is confirmed:";
  const lines = [`Namaste ${d.partyName},`, ``, intro];
  if (value > 0) lines.push(`• Booked value: ${fmtMoney(value)}`);
  if (rate > 0) lines.push(`• Rate (locked): ${fmtRate(rate)}/g`);
  if (weight > 0) lines.push(`• Pending ${metalLabel(d.metal)}: ${fmtWeight(weight)}`);
  lines.push(``, `Thank you.`);
  return url(phone, lines);
}

// Delivered confirmation (#11).
export function buildDeliveredWhatsapp(
  phone: string,
  d: { partyName: string; metal: string; weight: number },
): string {
  return url(phone, [
    `Namaste ${d.partyName},`,
    ``,
    `Your ${metalLabel(d.metal)} has been delivered:`,
    `• Weight: ${fmtWeight(d.weight)}`,
    ``,
    `Thank you.`,
  ]);
}
