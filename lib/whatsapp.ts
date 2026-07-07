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

// Booking confirmation — adapts to metal-grams vs amount (#7).
export function buildBookingWhatsapp(
  phone: string,
  d: {
    partyName: string;
    metal: string;
    bookMode: "metal" | "amount";
    weight?: number;
    rate?: number;
    amount?: number;
    advance?: number;
  },
): string {
  const lines = [`Namaste ${d.partyName},`, ``, `Your booking is confirmed:`];
  if (d.bookMode === "metal") {
    lines.push(`• ${metalLabel(d.metal)} bar: ${fmtWeight(d.weight ?? 0)}`);
    if (d.rate) lines.push(`• Rate (locked): ${fmtRate(d.rate)}/g`);
  } else {
    lines.push(`• Amount booked: ${fmtMoney(d.amount ?? 0)}`);
    lines.push(`• ${metalLabel(d.metal)} — to be converted at delivery`);
  }
  if (d.advance && d.advance > 0) lines.push(`• Advance received: ${fmtMoney(d.advance)}`);
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
