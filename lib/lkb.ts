// ---------------------------------------------------------------------------
// LKB booking + MCX hedge engine.
//
// Ported cell-for-cell from the client's own workbook ("L K B BOOKING.xlsx"),
// which is the book they hedge from. Six sheets, three formulas, one rule:
//
//   PENDING  = WT - DELIVERY                         (R/F sheets, col F)
//   PREMIUM  = RATE - MCX * 0.1                      (all sheets)
//   LOTS     = grams * 0.1%                          (= grams / 1000, 1 lot = 1kg)
//
//   book exposure (lots) + MCX futures net (lots) = 0   ("- OR +" sheet, K14)
//
// The MCX column is quoted per 10 g and RATE per gram, which is why the premium
// multiplies MCX by 0.1 before subtracting.
// ---------------------------------------------------------------------------

export type BookType = "ready" | "forward" | "unfixed";
export type BookSide = "sell" | "buy";

export const round3 = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000;
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Grams still to move on a booking: WT - DELIVERY. Never rendered below zero. */
export function pendingWeight(weight: number, delivered: number): number {
  const w = Number.isFinite(weight) ? weight : 0;
  const d = Number.isFinite(delivered) ? delivered : 0;
  return round3(w - d);
}

/**
 * Premium over MCX, per gram: RATE - MCX x 0.1.
 *
 * Returns null when either leg is missing. Their sheet returns the bare RATE in
 * that case (H3 = 15500 - 0), which reads as a nonsense premium; we blank it
 * instead so nobody hedges off it.
 */
export function premium(ratePerGram: number | null, mcxPer10g: number | null): number | null {
  if (ratePerGram == null || mcxPer10g == null) return null;
  if (!Number.isFinite(ratePerGram) || !Number.isFinite(mcxPer10g)) return null;
  if (ratePerGram === 0 || mcxPer10g === 0) return null;
  return round2(ratePerGram - mcxPer10g * 0.1);
}

/** Grams -> MCX lots. Their sheet writes it as `=O3*0.1%`; 1000 g = 1 lot. */
export function gramsToLots(grams: number): number {
  if (!Number.isFinite(grams)) return 0;
  return round3(grams * 0.001);
}

/** MCX lots -> grams. */
export function lotsToGrams(lots: number): number {
  if (!Number.isFinite(lots)) return 0;
  return round3(lots * 1000);
}

// ---- one booking row ------------------------------------------------------

export interface BookingLike {
  bookType: BookType;
  side: BookSide;
  weight: number;
  delivered: number;
  rate: number | null;
  mcxRate: number | null;
}

export interface BookingComputed {
  pending: number;
  premium: number | null;
  /** value of the booked metal at the booked rate */
  value: number;
  status: "open" | "partial" | "delivered";
}

export function computeBooking(b: BookingLike): BookingComputed {
  const pending = pendingWeight(b.weight, b.delivered);
  const delivered = Number.isFinite(b.delivered) ? b.delivered : 0;
  // Unfixed rows carry no delivery column in their sheet - they sit open until
  // the rate is fixed and they move onto a fixed sheet.
  const status: BookingComputed["status"] =
    b.bookType === "unfixed"
      ? delivered > 0 && pending <= 0.0005
        ? "delivered"
        : delivered > 0
          ? "partial"
          : "open"
      : pending <= 0.0005
        ? "delivered"
        : delivered > 0
          ? "partial"
          : "open";
  return {
    pending,
    premium: premium(b.rate, b.mcxRate),
    value: round2((b.weight || 0) * (b.rate || 0)),
    status,
  };
}

// ---- the "- OR +" position sheet -----------------------------------------

/** One line of the per-name lot blocks (customers on the left, MCX ids right). */
export interface LotPosition {
  name: string;
  sellLots: number;
  buyLots: number;
}

export interface PositionInput {
  /** pending grams, summed per sheet */
  readySellPending: number;
  readyBuyPending: number;
  forwardSellPending: number;
  forwardBuyPending: number;
  /** unfixed sheets total the WT column, not pending */
  unfixedSellWeight: number;
  unfixedBuyWeight: number;
  /** left block: customers who deal in lots directly */
  customerLots: LotPosition[];
  /** right block: the shop's own MCX trading accounts */
  accountLots: LotPosition[];
}

export interface PositionResult {
  /** net grams per sheet pair, in their sign convention */
  readyNetGrams: number;
  forwardNetGrams: number;
  unfixedNetGrams: number;

  readyLots: number;
  forwardLots: number;
  unfixedLots: number;
  customerNetLots: number;

  /** K11 - everything the book owes, in lots */
  bookLots: number;
  /** K12 - the shop's live MCX futures position, in lots */
  mcxLots: number;
  /** K14 - must be zero when fully hedged */
  netLots: number;

  customerSellLots: number;
  customerBuyLots: number;
  accountSellLots: number;
  accountBuyLots: number;

  hedged: boolean;
  /** what to do to flatten: lots to buy (+) or sell (-) on MCX */
  actionLots: number;
}

const sumLots = (rows: LotPosition[], k: "sellLots" | "buyLots") =>
  round3(rows.reduce((a, r) => a + (Number(r[k]) || 0), 0));

/**
 * The whole "- OR +" sheet in one function.
 *
 * Ready and Forward net BUY minus SELL; Unfixed and the customer lot block net
 * SELL minus BUY. That flip is not a mistake in their sheet: a fixed-rate sale
 * leaves the shop short metal (hedge by buying), while an unfixed sale leaves it
 * long the price (hedge by selling).
 */
export function computePosition(inp: PositionInput): PositionResult {
  const readyNetGrams = round3(inp.readyBuyPending - inp.readySellPending);
  const forwardNetGrams = round3(inp.forwardBuyPending - inp.forwardSellPending);
  const unfixedNetGrams = round3(inp.unfixedSellWeight - inp.unfixedBuyWeight);

  const readyLots = gramsToLots(readyNetGrams);
  const forwardLots = gramsToLots(forwardNetGrams);
  const unfixedLots = gramsToLots(unfixedNetGrams);

  const customerSellLots = sumLots(inp.customerLots, "sellLots");
  const customerBuyLots = sumLots(inp.customerLots, "buyLots");
  const customerNetLots = round3(customerSellLots - customerBuyLots);

  const accountSellLots = sumLots(inp.accountLots, "sellLots");
  const accountBuyLots = sumLots(inp.accountLots, "buyLots");

  const bookLots = round3(readyLots + forwardLots + unfixedLots + customerNetLots);
  const mcxLots = round3(accountBuyLots - accountSellLots);
  const netLots = round3(bookLots + mcxLots);

  return {
    readyNetGrams,
    forwardNetGrams,
    unfixedNetGrams,
    readyLots,
    forwardLots,
    unfixedLots,
    customerNetLots,
    bookLots,
    mcxLots,
    netLots,
    customerSellLots,
    customerBuyLots,
    accountSellLots,
    accountBuyLots,
    hedged: Math.abs(netLots) < 0.0005,
    // netLots > 0 means the book is over-bought on MCX: sell that many to flatten.
    actionLots: round3(-netLots),
  };
}
