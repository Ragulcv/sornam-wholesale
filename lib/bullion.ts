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

// ---------------------------------------------------------------------------
// Logimax reconciliation — mirrors the legacy SALES/PURCHASE ENTRIES screen.
// Pure and cash are tracked on two ledgers that a "conversion" bridges at the
// bar rate/gram so the closing balance settles to zero when fully paid.
// ---------------------------------------------------------------------------

export interface ReconLine { weight: number; touch: number }
export interface ReconMove { weight: number; aTouch: number; dir: MoveDir }

export interface ReconInput {
  saleLines: ReconLine[];        // SALES grid
  returnLines: ReconLine[];      // SALES RETURN grid
  metalMoves: ReconMove[];       // METAL RECEIPTS / PAYMENTS grid (A.Touch → pure)
  ratePerGram: number;           // Rate/Gm used for pure↔cash conversion
  intDisPure: number;            // Int/Dis-Pure manual adjustment (pure)
  intDisCash: number;            // Int/Dis manual adjustment (cash)
  mcCashRecd: number;            // M.C. Cash Recd.
  bankRecd: number;              // Bank Recd
  cashBankRecd: number;          // Cash/Bank Recd (conversion row)
  conversion: "pure" | "cash" | null; // which side the net converts into
  discountPure: number;
  discountCash: number;
}

export interface ReconResult {
  salePure: number;
  returnPure: number;
  movePure: number;              // net metal received − paid (by A.Touch)
  totalPure: number;             // net pure before conversion
  totalCash: number;             // net cash before conversion
  closingPure: number;           // Clsg. Bal. (Pure)
  closingCash: number;           // Clsg. Bal. (Cash)
  billValue: number;             // Total row, cash side: pure × rate/gram
  receipts: number;              // cash + bank + cash/bank taken in, as entered
  receiptsSigned: number;        // the same money shown the way they read it: negative
}

const sumPure = (rows: ReconLine[]) => round3(rows.reduce((a, r) => a + pure(r.weight, r.touch), 0));

/**
 * Full two-ledger reconciliation matching the Logimax entry screen.
 *
 * Sign convention, as Logimax shows it (Ragul confirmed 2 Oct 2026):
 * Clsg. Bal. = what was received minus what the bill is worth, so a customer
 * who still OWES reads NEGATIVE (150000 bill, 50000 paid -> -100000), a settled
 * bill reads 0, and a customer in credit reads positive. Pure follows the same
 * rule. The receipt row shows money taken in as negative (receiptsSigned).
 *
 * (11 Sep 2026 briefly flipped this to owed-positive; that was a misreading.)
 */
export function reconcile(inp: ReconInput): ReconResult {
  const salePure = sumPure(inp.saleLines);
  const returnPure = sumPure(inp.returnLines);
  const movePure = round3(
    inp.metalMoves.reduce((a, m) => {
      const p = pure(m.weight, m.aTouch);
      return a + (m.dir === "received" ? p : -p);
    }, 0),
  );

  // Net pure the customer owes us (sale) minus what we owe back (return + metal received).
  const totalPure = round3(salePure - returnPure - movePure + inp.intDisPure - inp.discountPure);

  // Cash side: metal-cash received + bank + int/dis − discount.
  const totalCash = round2(
    inp.mcCashRecd + inp.bankRecd + inp.cashBankRecd + inp.intDisCash - inp.discountCash,
  );

  const billValue = round2(totalPure * inp.ratePerGram);
  const receipts = round2(inp.mcCashRecd + inp.bankRecd + inp.cashBankRecd);

  // owed reads negative on both ledgers
  let closingPure = round3(-totalPure);
  let closingCash = round2(totalCash);

  if (inp.conversion === "cash") {
    // Convert the net pure to cash at rate/gram: received minus bill value.
    closingCash = round2(totalCash - totalPure * inp.ratePerGram);
    closingPure = 0;
  } else if (inp.conversion === "pure") {
    // Convert the cash received into pure at rate/gram and net it off.
    closingPure = inp.ratePerGram ? round3(totalCash / inp.ratePerGram - totalPure) : round3(-totalPure);
    closingCash = 0;
  }

  return {
    salePure,
    returnPure,
    movePure,
    totalPure,
    totalCash,
    closingPure,
    closingCash,
    billValue,
    receipts,
    receiptsSigned: round2(-receipts),
  };
}
