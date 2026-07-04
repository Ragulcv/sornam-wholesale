import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "./db";
import {
  bookings,
  collections,
  customers,
  settings as settingsTable,
} from "./db/schema";
import {
  calcAmount,
  PAYMENT_MODES,
  type PaymentMode,
  type RateUnit,
} from "./format";

// ---- View models --------------------------------------------------------

export interface BookingRow {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  metal: "gold" | "silver";
  purity: string;
  weightBookedG: number;
  weightCollectedG: number;
  weightPendingG: number;
  rateMode: "locked" | "float";
  lockedRate: number | null;
  rateUnit: RateUnit;
  advanceAmount: number;
  status: "open" | "partial" | "completed";
  notes: string | null;
  createdAt: Date;
}

export interface CollectionRow {
  id: string;
  billNumber: number;
  bookingId: string;
  customerName: string;
  metal: "gold" | "silver";
  purity: string;
  weightCollectedG: number;
  rateApplied: number;
  paymentMode: PaymentMode;
  amount: number;
  slipType: "gst" | "plain";
  createdAt: Date;
}

const num = (v: string | null): number => (v == null ? 0 : parseFloat(v));

// ---- Reads --------------------------------------------------------------

/** Collected-weight totals keyed by booking id. */
async function collectedByBooking(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      bookingId: collections.bookingId,
      total: sql<string>`sum(${collections.weightCollectedG})`,
    })
    .from(collections)
    .groupBy(collections.bookingId);
  return new Map(rows.map((r) => [r.bookingId, num(r.total)]));
}

export async function listBookings(filter?: {
  status?: "open" | "partial" | "completed";
  customerId?: string;
}): Promise<BookingRow[]> {
  const conditions = [];
  if (filter?.status) conditions.push(eq(bookings.status, filter.status));
  if (filter?.customerId)
    conditions.push(eq(bookings.customerId, filter.customerId));

  const [rows, collected] = await Promise.all([
    db
      .select({ b: bookings, cName: customers.name, cPhone: customers.phone })
      .from(bookings)
      .innerJoin(customers, eq(bookings.customerId, customers.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(bookings.createdAt)),
    collectedByBooking(),
  ]);

  return rows.map(({ b, cName, cPhone }) => {
    const booked = num(b.weightBookedG);
    const got = collected.get(b.id) ?? 0;
    return {
      id: b.id,
      customerId: b.customerId,
      customerName: cName,
      customerPhone: cPhone,
      metal: b.metal,
      purity: b.purity,
      weightBookedG: booked,
      weightCollectedG: got,
      weightPendingG: Math.max(0, Math.round((booked - got) * 1000) / 1000),
      rateMode: b.rateMode,
      lockedRate: b.lockedRate == null ? null : num(b.lockedRate),
      rateUnit: b.rateUnit,
      advanceAmount: num(b.advanceAmount),
      status: b.status,
      notes: b.notes,
      createdAt: b.createdAt,
    };
  });
}

export async function getBooking(id: string): Promise<{
  booking: BookingRow;
  collections: CollectionRow[];
} | null> {
  const [rows, cols] = await Promise.all([
    db
      .select({ b: bookings, cName: customers.name, cPhone: customers.phone })
      .from(bookings)
      .innerJoin(customers, eq(bookings.customerId, customers.id))
      .where(eq(bookings.id, id)),
    listCollections({ bookingId: id }),
  ]);
  const row = rows[0];
  if (!row) return null;
  const got = cols.reduce((a, c) => a + c.weightCollectedG, 0);
  const booked = num(row.b.weightBookedG);

  return {
    booking: {
      id: row.b.id,
      customerId: row.b.customerId,
      customerName: row.cName,
      customerPhone: row.cPhone,
      metal: row.b.metal,
      purity: row.b.purity,
      weightBookedG: booked,
      weightCollectedG: got,
      weightPendingG: Math.max(0, Math.round((booked - got) * 1000) / 1000),
      rateMode: row.b.rateMode,
      lockedRate: row.b.lockedRate == null ? null : num(row.b.lockedRate),
      rateUnit: row.b.rateUnit,
      advanceAmount: num(row.b.advanceAmount),
      status: row.b.status,
      notes: row.b.notes,
      createdAt: row.b.createdAt,
    },
    collections: cols,
  };
}

export async function listCollections(filter?: {
  bookingId?: string;
  paymentMode?: PaymentMode;
  since?: Date;
}): Promise<CollectionRow[]> {
  const conditions = [];
  if (filter?.bookingId)
    conditions.push(eq(collections.bookingId, filter.bookingId));
  if (filter?.paymentMode)
    conditions.push(eq(collections.paymentMode, filter.paymentMode));
  if (filter?.since) conditions.push(gte(collections.createdAt, filter.since));

  const rows = await db
    .select({
      c: collections,
      metal: bookings.metal,
      purity: bookings.purity,
      cName: customers.name,
    })
    .from(collections)
    .innerJoin(bookings, eq(collections.bookingId, bookings.id))
    .innerJoin(customers, eq(bookings.customerId, customers.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(collections.createdAt));

  return rows.map(({ c, metal, purity, cName }) => ({
    id: c.id,
    billNumber: c.billNumber,
    bookingId: c.bookingId,
    customerName: cName,
    metal,
    purity,
    weightCollectedG: num(c.weightCollectedG),
    rateApplied: num(c.rateApplied),
    paymentMode: c.paymentMode,
    amount: num(c.amount),
    slipType: c.slipType,
    createdAt: c.createdAt,
  }));
}

export async function getCollection(id: string): Promise<
  | (CollectionRow & {
      customerPhone: string | null;
      customerGstin: string | null;
      rateUnit: RateUnit;
      bookingWeightG: number;
    })
  | null
> {
  const rows = await db
    .select({
      c: collections,
      metal: bookings.metal,
      purity: bookings.purity,
      rateUnit: bookings.rateUnit,
      bookingWeightG: bookings.weightBookedG,
      cName: customers.name,
      cPhone: customers.phone,
      cGstin: customers.gstin,
    })
    .from(collections)
    .innerJoin(bookings, eq(collections.bookingId, bookings.id))
    .innerJoin(customers, eq(bookings.customerId, customers.id))
    .where(eq(collections.id, id));
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.c.id,
    billNumber: r.c.billNumber,
    bookingId: r.c.bookingId,
    customerName: r.cName,
    customerPhone: r.cPhone,
    customerGstin: r.cGstin,
    metal: r.metal,
    purity: r.purity,
    rateUnit: r.rateUnit,
    bookingWeightG: num(r.bookingWeightG),
    weightCollectedG: num(r.c.weightCollectedG),
    rateApplied: num(r.c.rateApplied),
    paymentMode: r.c.paymentMode,
    amount: num(r.c.amount),
    slipType: r.c.slipType,
    createdAt: r.c.createdAt,
  };
}

export interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  gstin: string | null;
  bookingCount: number;
  pendingWeightG: number;
}

export async function listCustomers(): Promise<CustomerRow[]> {
  const custs = await db.select().from(customers).orderBy(customers.name);
  const allBookings = await listBookings();
  return custs.map((c) => {
    const mine = allBookings.filter((b) => b.customerId === c.id);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      gstin: c.gstin,
      bookingCount: mine.length,
      pendingWeightG: mine.reduce((a, b) => a + b.weightPendingG, 0),
    };
  });
}

export async function dashboard(): Promise<{
  today: { mode: PaymentMode; amount: number; count: number }[];
  todayTotal: number;
  openBookings: number;
  pendingWeightG: number;
  recentCollections: CollectionRow[];
}> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const [todayCols, allBookings] = await Promise.all([
    listCollections({ since: start }),
    listBookings(),
  ]);
  const byMode = new Map<PaymentMode, { amount: number; count: number }>();
  for (const c of todayCols) {
    const cur = byMode.get(c.paymentMode) ?? { amount: 0, count: 0 };
    cur.amount += c.amount;
    cur.count += 1;
    byMode.set(c.paymentMode, cur);
  }
  const today = PAYMENT_MODES.map((mode) => ({
    mode,
    amount: byMode.get(mode)?.amount ?? 0,
    count: byMode.get(mode)?.count ?? 0,
  }));

  return {
    today,
    todayTotal: today.reduce((a, t) => a + t.amount, 0),
    openBookings: allBookings.filter((b) => b.status !== "completed").length,
    pendingWeightG: allBookings.reduce((a, b) => a + b.weightPendingG, 0),
    recentCollections: todayCols.slice(0, 8),
  };
}

// ---- Writes -------------------------------------------------------------

export async function createCustomer(data: {
  name: string;
  phone?: string | null;
  gstin?: string | null;
  notes?: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(customers)
    .values({
      name: data.name.trim(),
      phone: data.phone?.trim() || null,
      gstin: data.gstin?.trim() || null,
      notes: data.notes?.trim() || null,
    })
    .returning({ id: customers.id });
  return row.id;
}

/** Reuse a customer by exact (case-insensitive) name + phone, else create. */
export async function findOrCreateCustomer(
  name: string,
  phone?: string | null,
): Promise<string> {
  const trimmed = name.trim();
  const existing = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        sql`lower(${customers.name}) = lower(${trimmed})`,
        phone ? eq(customers.phone, phone.trim()) : sql`true`,
      ),
    );
  if (existing[0]) return existing[0].id;
  return createCustomer({ name: trimmed, phone });
}

export async function createBooking(data: {
  customerId: string;
  metal: "gold" | "silver";
  purity: string;
  weightBookedG: number;
  rateMode: "locked" | "float";
  lockedRate: number | null;
  rateUnit: RateUnit;
  advanceAmount: number;
  notes?: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(bookings)
    .values({
      customerId: data.customerId,
      metal: data.metal,
      purity: data.purity,
      weightBookedG: String(data.weightBookedG),
      rateMode: data.rateMode,
      lockedRate:
        data.rateMode === "locked" && data.lockedRate != null
          ? String(data.lockedRate)
          : null,
      rateUnit: data.rateUnit,
      advanceAmount: String(data.advanceAmount ?? 0),
      notes: data.notes?.trim() || null,
    })
    .returning({ id: bookings.id });
  return row.id;
}

export async function recordCollection(data: {
  bookingId: string;
  weightCollectedG: number;
  rate: number;
  paymentMode: PaymentMode;
  slipType: "gst" | "plain";
}): Promise<{ id: string; billNumber: number }> {
  const b = (
    await db.select().from(bookings).where(eq(bookings.id, data.bookingId))
  )[0];
  if (!b) throw new Error("Booking not found");

  const unit = b.rateUnit as RateUnit;
  const amount = calcAmount(data.weightCollectedG, data.rate, unit);

  const [row] = await db
    .insert(collections)
    .values({
      bookingId: data.bookingId,
      weightCollectedG: String(data.weightCollectedG),
      rateApplied: String(data.rate),
      paymentMode: data.paymentMode,
      amount: String(amount),
      slipType: data.slipType,
    })
    .returning({ id: collections.id, billNumber: collections.billNumber });

  // Recompute booking status from total collected weight.
  const totalRows = await db
    .select({ total: sql<string>`sum(${collections.weightCollectedG})` })
    .from(collections)
    .where(eq(collections.bookingId, data.bookingId));
  const collected = num(totalRows[0]?.total ?? null);
  const booked = num(b.weightBookedG);
  const status =
    collected >= booked ? "completed" : collected > 0 ? "partial" : "open";
  await db
    .update(bookings)
    .set({ status })
    .where(eq(bookings.id, data.bookingId));

  return row;
}

export async function updateSettings(data: {
  autoLogoffMinutes?: number;
  gstin?: string | null;
  taxPercent?: number;
  defaultGoldRate?: number | null;
  defaultSilverRate?: number | null;
}): Promise<void> {
  await db
    .update(settingsTable)
    .set({
      ...(data.autoLogoffMinutes != null
        ? { autoLogoffMinutes: data.autoLogoffMinutes }
        : {}),
      ...(data.gstin !== undefined ? { gstin: data.gstin?.trim() || null } : {}),
      ...(data.taxPercent != null ? { taxPercent: String(data.taxPercent) } : {}),
      ...(data.defaultGoldRate !== undefined
        ? {
            defaultGoldRate:
              data.defaultGoldRate == null ? null : String(data.defaultGoldRate),
          }
        : {}),
      ...(data.defaultSilverRate !== undefined
        ? {
            defaultSilverRate:
              data.defaultSilverRate == null
                ? null
                : String(data.defaultSilverRate),
          }
        : {}),
    })
    .where(eq(settingsTable.id, 1));
}

/** Update the live gold/silver rates (used by the price cron). */
export async function updatePrices(data: {
  goldRate?: number | null;
  silverRate?: number | null;
  at?: Date;
}): Promise<void> {
  await db
    .update(settingsTable)
    .set({
      ...(data.goldRate != null ? { defaultGoldRate: String(data.goldRate) } : {}),
      ...(data.silverRate != null
        ? { defaultSilverRate: String(data.silverRate) }
        : {}),
      priceUpdatedAt: data.at ?? new Date(),
    })
    .where(eq(settingsTable.id, 1));
}
