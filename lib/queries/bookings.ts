import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { bookings, parties } from "../db/schema";
import { createTransaction, type LineInput, type SettleInput } from "./transactions";
import type { Metal, BookMode } from "../bullion";

const num = (v: string | null): number => (v == null ? 0 : parseFloat(v));

export interface BookingRow {
  id: string;
  serialNo: number;
  partyId: string;
  partyName: string | null;
  partyPhone: string | null;
  metal: Metal;
  bookMode: BookMode;
  weightBooked: number | null;
  lockedRate: number | null;
  amount: number | null;
  advancePaid: number;
  status: "open" | "partial" | "delivered" | "cancelled";
  createdBy: string | null;
  createdAt: Date;
}

export async function createBooking(input: {
  partyId: string;
  metal: Metal;
  bookMode: BookMode;
  weightBooked?: number | null;
  lockedRate?: number | null;
  amount?: number | null;
  advancePaid?: number;
  operatorName: string;
  notes?: string | null;
}): Promise<{ id: string; serialNo: number }> {
  const [row] = await db
    .insert(bookings)
    .values({
      partyId: input.partyId,
      metal: input.metal,
      bookMode: input.bookMode,
      weightBooked: input.weightBooked != null ? String(input.weightBooked) : null,
      lockedRate: input.lockedRate != null ? String(input.lockedRate) : null,
      amount: input.amount != null ? String(input.amount) : null,
      advancePaid: String(input.advancePaid ?? 0),
      createdBy: input.operatorName,
      notes: input.notes?.trim() || null,
    })
    .returning({ id: bookings.id, serialNo: bookings.serialNo });
  return row;
}

export async function listBookings(filter?: {
  status?: "open" | "partial" | "delivered" | "cancelled";
}): Promise<BookingRow[]> {
  const rows = await db
    .select({ b: bookings, pName: parties.name, pPhone: parties.phone })
    .from(bookings)
    .innerJoin(parties, eq(bookings.partyId, parties.id))
    .where(filter?.status ? eq(bookings.status, filter.status) : undefined)
    .orderBy(desc(bookings.createdAt));
  return rows.map(({ b, pName, pPhone }) => ({
    id: b.id,
    serialNo: b.serialNo,
    partyId: b.partyId,
    partyName: pName,
    partyPhone: pPhone,
    metal: b.metal,
    bookMode: b.bookMode,
    weightBooked: b.weightBooked == null ? null : num(b.weightBooked),
    lockedRate: b.lockedRate == null ? null : num(b.lockedRate),
    amount: b.amount == null ? null : num(b.amount),
    advancePaid: num(b.advancePaid),
    status: b.status,
    createdBy: b.createdBy,
    createdAt: b.createdAt,
  }));
}

export async function getBooking(id: string): Promise<BookingRow | null> {
  const rows = await listBookings();
  return rows.find((b) => b.id === id) ?? null;
}

/** Deliver a booking: create the linked Sales transaction, mark delivered. */
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
    trnType: "sales",
    partyId: bk.partyId,
    metal: input.metal,
    barRate: input.barRate,
    lines: input.lines,
    movements: [],
    settlements: input.settlements,
    operatorName: input.operatorName,
  });
  await db
    .update(bookings)
    .set({ status: "delivered", deliveredTxnId: txn.id })
    .where(eq(bookings.id, id));
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
