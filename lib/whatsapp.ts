import { fmtMoney, fmtRate, fmtWeight, unitLabel, type RateUnit } from "./format";

/** Normalise an Indian phone number to wa.me digits (adds 91 for 10-digit). */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}

export function buildWhatsappUrl(
  phone: string,
  b: {
    name: string;
    metal: "gold" | "silver";
    purity: string;
    weight: number;
    rateMode: "locked" | "float";
    rate: number;
    rateUnit: RateUnit;
    advance: number;
  },
): string {
  const metal = b.metal === "gold" ? "Gold" : "Silver";
  const lines = [
    `Namaste ${b.name},`,
    ``,
    `Your booking is confirmed:`,
    `• ${metal} ${b.purity}`,
    `• Weight: ${fmtWeight(b.weight)}`,
    b.rateMode === "locked"
      ? `• Rate (locked): ${fmtRate(b.rate)} ${unitLabel(b.rateUnit)}`
      : `• Rate: at market on collection`,
  ];
  if (b.advance > 0) lines.push(`• Advance received: ${fmtMoney(b.advance)}`);
  lines.push(``, `Thank you.`);
  const text = encodeURIComponent(lines.join("\n"));
  return `https://wa.me/${normalisePhone(phone)}?text=${text}`;
}
