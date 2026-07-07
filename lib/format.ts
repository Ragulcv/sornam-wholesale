// Display formatters. Rate is always per gram.
import type { PayMode } from "./bullion";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
export function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0;
  return inr.format(Number.isFinite(v as number) ? (v as number) : 0);
}

const wt = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
export function fmtWeight(g: number | string | null | undefined): string {
  const v = typeof g === "string" ? parseFloat(g) : g ?? 0;
  return `${wt.format(Number.isFinite(v as number) ? (v as number) : 0)} g`;
}
export const fmtPure = fmtWeight;

const rateFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
export function fmtRate(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0;
  return `₹${rateFmt.format(Number.isFinite(v as number) ? (v as number) : 0)}`;
}

export function fmtTouch(n: number | string | null | undefined): string {
  if (n == null || n === "") return "-";
  const v = typeof n === "string" ? parseFloat(n) : n;
  return Number.isFinite(v as number) ? (v as number).toFixed(2) : "-";
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

export function txnNo(n: number): string {
  return `#${String(n).padStart(4, "0")}`;
}

export const PAY_MODES = ["cash", "bank"] as const;
export const payModeLabel: Record<PayMode, string> = { cash: "Cash", bank: "Bank" };
export const metalLabel = (m: string) => (m === "gold" ? "Gold" : "Silver");
