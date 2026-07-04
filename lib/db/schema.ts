import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

// ---- Enums --------------------------------------------------------------

export const metalEnum = pgEnum("metal", ["gold", "silver"]);
export const rateModeEnum = pgEnum("rate_mode", ["locked", "float"]);
export const rateUnitEnum = pgEnum("rate_unit", ["per_10g", "per_kg", "per_g"]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "open",
  "partial",
  "completed",
]);
export const paymentModeEnum = pgEnum("payment_mode", ["cash", "bank", "upi"]);
export const slipTypeEnum = pgEnum("slip_type", ["gst", "plain"]);

// ---- Tables -------------------------------------------------------------

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone"),
  gstin: text("gstin"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "restrict" }),
  metal: metalEnum("metal").notNull(),
  purity: text("purity").notNull(), // e.g. "995", "999", "22K"
  weightBookedG: numeric("weight_booked_g", { precision: 12, scale: 3 }).notNull(),
  rateMode: rateModeEnum("rate_mode").notNull(),
  // For 'locked' bookings this is the agreed rate; null for 'float'.
  lockedRate: numeric("locked_rate", { precision: 12, scale: 2 }),
  rateUnit: rateUnitEnum("rate_unit").notNull().default("per_10g"),
  advanceAmount: numeric("advance_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  status: bookingStatusEnum("status").notNull().default("open"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "cascade" }),
  // Sequential human-facing bill number, e.g. displayed as "B-0001".
  billNumber: integer("bill_number").generatedAlwaysAsIdentity(),
  weightCollectedG: numeric("weight_collected_g", { precision: 12, scale: 3 }).notNull(),
  rateApplied: numeric("rate_applied", { precision: 12, scale: 2 }).notNull(),
  rateUnit: rateUnitEnum("rate_unit").notNull().default("per_10g"),
  paymentMode: paymentModeEnum("payment_mode").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  slipType: slipTypeEnum("slip_type").notNull().default("plain"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Single-row app configuration (id is always 1).
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  pinHash: text("pin_hash"),
  autoLogoffMinutes: integer("auto_logoff_minutes").notNull().default(7),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  gstin: text("gstin"),
  // Total GST / tax percentage applied on GST slips (split evenly into CGST/SGST).
  taxPercent: numeric("tax_percent", { precision: 5, scale: 2 }).notNull().default("3"),
  defaultGoldRate: numeric("default_gold_rate", { precision: 12, scale: 2 }),
  defaultSilverRate: numeric("default_silver_rate", { precision: 12, scale: 2 }),
  priceUpdatedAt: timestamp("price_updated_at", { withTimezone: true }),
});

// ---- Inferred types -----------------------------------------------------

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;
export type Settings = typeof settings.$inferSelect;
