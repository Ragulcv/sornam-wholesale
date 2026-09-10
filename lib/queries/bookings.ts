import "server-only";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { bookings, bookingDeliveries, parties, mcxPositions } from "../db/schema";
import { createTransaction, type LineInput, type SettleInput } from "./transactions";
import type { Metal } from "../bullion";
import { dayStart } from "../dates";
import {
  computeBooking,
  computePosition,
  round3,
  type BookType,
  type BookSide,
  type PositionResult,
} from "../lkb";

const num = (v: string | null): number => (v == null ? 0 : parseFloat(v));

/** One row of the booking register, shaped like a row of their workbook. */
export interface BookingRow {
  id: string;
  serialNo: number;
  partyId: string;
  partyName: string | null;
  partyPhone: string | null;
  /** sheet: ready | forward | unfixed */
  bookType: BookType;
  /** sell = we sell to them, buy = we buy from them */
  side: BookSide;
  metal: Metal;
  bookDate: Date;
  /** WT */
  weight: number;
  /** RATE, per gram */
  rate: number | null;
  /** DELIVERY */
  delivered: number;
  /** PENDING = WT - DELIVERY */
  pending: number;
  /** MCX, per 10 g */
  mcxRate: number | null;
  /** PREMIUM = RATE - MCX x 0.1 */
  premium: number | null;
  value: number;
  remarks: string | null;
  status: "open" | "partial" | "delivered" | "cancelled";
  createdBy: string | null;
  createdAt: Date;
}

const sideOf = (trnType: string): BookSide => (trnType === "purchase" ? "buy" : "sell");
const trnOf = (side: BookSide) => (side === "buy" ? ("purchase" as const) : ("sales" as const));

function toRow(b: typeof bookings.$inferSelect, pName: string | null, pPhone: string | null): BookingRow {
  const weight = num(b.weightBooked);
  const delivered = num(b.deliveredWeight);
  const rate = b.lockedRate == null ? null : num(b.lockedRate);
  const mcxRate = b.mcxRate == null ? null : num(b.mcxRate);
  const c = computeBooking({
    bookType: b.bookType,
    side: sideOf(b.trnType),
    weight,
    delivered,
    rate,
    mcxRate,
  });
  return {
    id: b.id,
    serialNo: b.serialNo,
    partyId: b.partyId,
    partyName: pName,
    partyPhone: pPhone,
    bookType: b.bookType,
    side: sideOf(b.trnType),
    metal: b.metal,
    bookDate: b.bookDate,
    weight,
    rate,
    delivered,
    pending: c.pending,
    mcxRate,
    premium: c.premium,
    value: c.value,
    remarks: b.remarks ?? b.notes ?? null,
    status: b.status === "cancelled" ? "cancelled" : c.status,
    createdBy: b.createdBy,
    createdAt: b.createdAt,
  };
}

export interface BookingInput {
  partyId: string;
  bookType: BookType;
  side: BookSide;
  metal: Metal;
  bookDate?: string;
  weight: number;
  rate?: number | null;
  delivered?: number;
  mcxRate?: number | null;
  remarks?: string | null;
  operatorName: string;
}

export async function createBooking(input: BookingInput): Promise<{ id: string; serialNo: number }> {
  const delivered = input.delivered ?? 0;
  const [row] = await db
    .insert(bookings)
    .values({
      partyId: input.partyId,
      trnType: trnOf(input.side),
      bookType: input.bookType,
      metal: input.metal,
      bookMode: "metal",
      bookDate: input.bookDate ? dayStart(input.bookDate) : new Date(),
      weightBooked: String(input.weight),
      lockedRate: input.rate != null ? String(input.rate) : null,
      deliveredWeight: String(delivered),
      mcxRate: input.mcxRate != null ? String(input.mcxRate) : null,
      remarks: input.remarks?.trim() || null,
      status: delivered >= input.weight && input.weight > 0 ? "delivered" : delivered > 0 ? "partial" : "open",
      createdBy: input.operatorName,
    })
    .returning({ id: bookings.id, serialNo: bookings.serialNo });
  return row;
}

export async function updateBooking(id: string, input: Partial<BookingInput>): Promise<void> {
  const [current] = await db.select().from(bookings).where(eq(bookings.id, id));
  if (!current) return;
  const weight = input.weight ?? num(current.weightBooked);
  const delivered = input.delivered ?? num(current.deliveredWeight);
  await db
    .update(bookings)
    .set({
      ...(input.partyId ? { partyId: input.partyId } : {}),
      ...(input.side ? { trnType: trnOf(input.side) } : {}),
      ...(input.bookType ? { bookType: input.bookType } : {}),
      ...(input.metal ? { metal: input.metal } : {}),
      ...(input.bookDate ? { bookDate: dayStart(input.bookDate) } : {}),
      weightBooked: String(weight),
      deliveredWeight: String(delivered),
      lockedRate: input.rate !== undefined ? (input.rate != null ? String(input.rate) : null) : current.lockedRate,
      mcxRate: input.mcxRate !== undefined ? (input.mcxRate != null ? String(input.mcxRate) : null) : current.mcxRate,
      ...(input.remarks !== undefined ? { remarks: input.remarks?.trim() || null } : {}),
      status:
        current.status === "cancelled"
          ? "cancelled"
          : delivered >= weight && weight > 0
            ? "delivered"
            : delivered > 0
              ? "partial"
              : "open",
    })
    .where(eq(bookings.id, id));
}

export async function listBookings(filter?: {
  status?: "open" | "partial" | "delivered" | "cancelled";
  bookType?: BookType;
  side?: BookSide;
  pendingOnly?: boolean;
}): Promise<BookingRow[]> {
  const rows = await db
    .select({ b: bookings, pName: parties.name, pPhone: parties.phone })
    .from(bookings)
    .innerJoin(parties, eq(bookings.partyId, parties.id))
    // Newest booking on top, oldest at the bottom (descending, as asked).
    .orderBy(desc(bookings.bookDate), desc(bookings.serialNo));

  let out = rows.map((r) => toRow(r.b, r.pName, r.pPhone));
  if (filter?.status) out = out.filter((b) => b.status === filter.status);
  if (filter?.bookType) out = out.filter((b) => b.bookType === filter.bookType);
  if (filter?.side) out = out.filter((b) => b.side === filter.side);
  if (filter?.pendingOnly)
    out = out.filter((b) => b.status !== "cancelled" && b.status !== "delivered" && b.pending > 0.0005);
  return out;
}

export async function getBooking(id: string): Promise<BookingRow | null> {
  const rows = await db
    .select({ b: bookings, pName: parties.name, pPhone: parties.phone })
    .from(bookings)
    .innerJoin(parties, eq(bookings.partyId, parties.id))
    .where(eq(bookings.id, id));
  if (!rows.length) return null;
  return toRow(rows[0].b, rows[0].pName, rows[0].pPhone);
}

/**
 * Record `weight` grams delivered against a booking and link it to the bill.
 * Partial deliveries are native to their sheet (PENDING = WT - DELIVERY), so a
 * short delivery leaves the booking open with the remainder still pending.
 */
export async function recordDelivery(
  bookingId: string,
  transactionId: string,
  weight: number,
): Promise<void> {
  const [bk] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!bk) return;
  await db.insert(bookingDeliveries).values({ bookingId, transactionId, weight: String(weight) });
  const booked = num(bk.weightBooked);
  const delivered = round3(num(bk.deliveredWeight) + weight);
  await db
    .update(bookings)
    .set({
      deliveredWeight: String(delivered),
      deliveredTxnId: transactionId,
      status: delivered >= booked - 0.0005 && booked > 0 ? "delivered" : delivered > 0 ? "partial" : "open",
    })
    .where(eq(bookings.id, bookingId));
}

/** Undo the delivery rows a bill created, when that bill is edited or deleted. */
export async function unlinkDeliveriesForTransaction(transactionId: string): Promise<void> {
  const rows = await db
    .select()
    .from(bookingDeliveries)
    .where(eq(bookingDeliveries.transactionId, transactionId));
  if (!rows.length) return;
  await db.delete(bookingDeliveries).where(eq(bookingDeliveries.transactionId, transactionId));
  for (const r of rows) {
    const [bk] = await db.select().from(bookings).where(eq(bookings.id, r.bookingId));
    if (!bk) continue;
    const booked = num(bk.weightBooked);
    const delivered = round3(Math.max(0, num(bk.deliveredWeight) - num(r.weight)));
    await db
      .update(bookings)
      .set({
        deliveredWeight: String(delivered),
        status: delivered >= booked - 0.0005 && booked > 0 ? "delivered" : delivered > 0 ? "partial" : "open",
      })
      .where(eq(bookings.id, r.bookingId));
  }
}

/** Deliver from the Bookings screen: creates the bill, then closes the book. */
export async function deliverBooking(
  id: string,
  input: {
    metal: Metal;
    barRate?: number;
    lines: LineInput[];
    settlements: SettleInput[];
    operatorName: string;
  },
): Promise<{ txnId: string; serialNo: number }> {
  const bk = (await db.select().from(bookings).where(eq(bookings.id, id)))[0];
  if (!bk) throw new Error("Booking not found");
  const txn = await createTransaction({
    trnType: bk.trnType === "purchase" ? "purchase" : "sales",
    partyId: bk.partyId,
    metal: input.metal,
    barRate: input.barRate,
    lines: input.lines,
    movements: [],
    settlements: input.settlements,
    operatorName: input.operatorName,
  });
  const weight = input.lines.reduce((a, l) => a + (l.weight || 0), 0);
  await recordDelivery(id, txn.id, weight);
  return { txnId: txn.id, serialNo: txn.serialNo };
}

export async function deleteBooking(id: string): Promise<void> {
  await db.delete(bookings).where(eq(bookings.id, id));
}

export async function bulkDeleteBookings(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  await db.delete(bookings).where(inArray(bookings.id, ids));
  return ids.length;
}

// ---- "- OR +" lot positions ----------------------------------------------

export interface LotRow {
  id: string;
  block: "customer" | "account";
  name: string;
  sellLots: number;
  buyLots: number;
  notes: string | null;
}

export async function listLotPositions(): Promise<LotRow[]> {
  const rows = await db.select().from(mcxPositions).orderBy(asc(mcxPositions.createdAt));
  return rows.map((r) => ({
    id: r.id,
    block: r.block,
    name: r.name,
    sellLots: num(r.sellLots),
    buyLots: num(r.buyLots),
    notes: r.notes,
  }));
}

export async function saveLotPosition(input: {
  id?: string | null;
  block: "customer" | "account";
  name: string;
  sellLots: number;
  buyLots: number;
  notes?: string | null;
}): Promise<void> {
  if (input.id) {
    await db
      .update(mcxPositions)
      .set({
        block: input.block,
        name: input.name,
        sellLots: String(input.sellLots),
        buyLots: String(input.buyLots),
        notes: input.notes?.trim() || null,
      })
      .where(eq(mcxPositions.id, input.id));
    return;
  }
  await db.insert(mcxPositions).values({
    block: input.block,
    name: input.name,
    sellLots: String(input.sellLots),
    buyLots: String(input.buyLots),
    notes: input.notes?.trim() || null,
  });
}

export async function deleteLotPosition(id: string): Promise<void> {
  await db.delete(mcxPositions).where(eq(mcxPositions.id, id));
}

// ---- the position sheet, computed from the whole register ----------------

export interface BookTotals {
  readySellPending: number;
  readyBuyPending: number;
  forwardSellPending: number;
  forwardBuyPending: number;
  unfixedSellWeight: number;
  unfixedBuyWeight: number;
}

export function bookTotals(rows: BookingRow[]): BookTotals {
  const live = rows.filter((b) => b.status !== "cancelled");
  const pend = (t: BookType, s: BookSide) =>
    round3(live.filter((b) => b.bookType === t && b.side === s).reduce((a, b) => a + Math.max(0, b.pending), 0));
  // Unfixed sheets total the WT column, not pending: the rate is not fixed yet,
  // so the whole booked weight is still exposed.
  const wt = (s: BookSide) =>
    round3(
      live
        .filter((b) => b.bookType === "unfixed" && b.side === s && b.status !== "delivered")
        .reduce((a, b) => a + b.weight, 0),
    );
  return {
    readySellPending: pend("ready", "sell"),
    readyBuyPending: pend("ready", "buy"),
    forwardSellPending: pend("forward", "sell"),
    forwardBuyPending: pend("forward", "buy"),
    unfixedSellWeight: wt("sell"),
    unfixedBuyWeight: wt("buy"),
  };
}

export async function getPosition(): Promise<{
  totals: BookTotals;
  lots: LotRow[];
  position: PositionResult;
}> {
  const [rows, lots] = await Promise.all([listBookings(), listLotPositions()]);
  const totals = bookTotals(rows);
  const position = computePosition({
    ...totals,
    customerLots: lots.filter((l) => l.block === "customer"),
    accountLots: lots.filter((l) => l.block === "account"),
  });
  return { totals, lots, position };
}

/** Customers + pending counts for the summary strip on the bookings grid. */
export async function bookingSummary(): Promise<{
  customers: number;
  pendingCount: number;
  pendingCustomers: number;
  deliveredCount: number;
  totalCount: number;
  pendingGrams: number;
}> {
  const rows = await listBookings();
  const live = rows.filter((b) => b.status !== "cancelled");
  const pending = live.filter((b) => b.status !== "delivered" && b.pending > 0.0005);
  return {
    customers: new Set(live.map((b) => b.partyId)).size,
    pendingCount: pending.length,
    pendingCustomers: new Set(pending.map((b) => b.partyId)).size,
    deliveredCount: live.filter((b) => b.status === "delivered").length,
    totalCount: live.length,
    pendingGrams: round3(pending.reduce((a, b) => a + b.pending, 0)),
  };
}

/** Kept for the legacy count query on the dashboard. */
export async function countOpenBookings(): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(inArray(bookings.status, ["open", "partial"]));
  return r?.n ?? 0;
}
