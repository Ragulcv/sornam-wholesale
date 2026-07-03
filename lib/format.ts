// Pure helpers — safe to import from client or server components.

export type RateUnit = "per_10g" | "per_kg" | "per_g";

export function unitDivisor(unit: RateUnit): number {
  switch (unit) {
    case "per_10g":
      return 10;
    case "per_kg":
      return 1000;
    case "per_g":
      return 1;
  }
}

export function unitLabel(unit: RateUnit): string {
  switch (unit) {
    case "per_10g":
      return "/10g";
    case "per_kg":
      return "/kg";
    case "per_g":
      return "/g";
  }
}

/** amount = weight(grams) × rate ÷ unit divisor, rounded to 2 decimals. */
export function calcAmount(weightG: number, rate: number, unit: RateUnit): number {
  const raw = (weightG * rate) / unitDivisor(unit);
  return Math.round(raw * 100) / 100;
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0;
  return inr.format(Number.isFinite(v as number) ? (v as number) : 0);
}

const weightFmt = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

export function fmtWeight(g: number | string | null | undefined): string {
  const v = typeof g === "string" ? parseFloat(g) : g ?? 0;
  return `${weightFmt.format(Number.isFinite(v as number) ? (v as number) : 0)} g`;
}

const rateFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export function fmtRate(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0;
  return `₹${rateFmt.format(Number.isFinite(v as number) ? (v as number) : 0)}`;
}

export function billNo(n: number): string {
  return `B-${String(n).padStart(4, "0")}`;
}

export function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const PAYMENT_MODES = ["cash", "bank", "upi"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const paymentModeLabel: Record<PaymentMode, string> = {
  cash: "Cash",
  bank: "Bank",
  upi: "UPI",
};
