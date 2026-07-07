// Bullion metal + cash math. Pure content and line amounts, computed the same
// way on server (authoritative) and client (preview).

export type Metal = "gold" | "silver";
export type TxnType = "booking" | "sales" | "purchase" | "expense";
export type LineKind = "sale" | "sale_return" | "purchase" | "purchase_return";
export type MoveDir = "received" | "paid";
export type PayMode = "cash" | "bank";
export type BookMode = "metal" | "amount";

export const round3 = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000;
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Pure fine-metal content = Weight × Touch ÷ 100. (100g @ 91.6 = 91.6g pure) */
export function pure(weightG: number, touch: number): number {
  if (!Number.isFinite(weightG) || !Number.isFinite(touch)) return 0;
  return round3((weightG * touch) / 100);
}

/** Line total billed on weight: Weight × Rate(/g). */
export function lineAmount(weightG: number, rate: number): number {
  if (!Number.isFinite(weightG) || !Number.isFinite(rate)) return 0;
  return round2(weightG * rate);
}

/** TDS deduction = taxable × pct ÷ 100. */
export function tdsAmount(taxable: number, pct: number): number {
  if (!Number.isFinite(taxable) || !Number.isFinite(pct)) return 0;
  return round2((taxable * pct) / 100);
}

export interface SettlementLike {
  mode: PayMode;
  direction: MoveDir;
  amount: number;
}

/** Sum settlements for a mode + direction. */
export function sumSettlements(
  settlements: SettlementLike[],
  mode: PayMode,
  dir: MoveDir,
): number {
  return round2(
    settlements
      .filter((s) => s.mode === mode && s.direction === dir)
      .reduce((a, s) => a + (Number(s.amount) || 0), 0),
  );
}
