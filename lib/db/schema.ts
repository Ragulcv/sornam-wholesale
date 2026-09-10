import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

// ---- Enums --------------------------------------------------------------

export const metalEnum = pgEnum("metal", ["gold", "silver"]);
export const trnTypeEnum = pgEnum("trn_type", [
  "booking",
  "sales",
  "purchase",
  "expense",
]);
export const lineKindEnum = pgEnum("line_kind", [
  "sale",
  "sale_return",
  "purchase",
  "purchase_return",
]);
export const moveDirEnum = pgEnum("move_dir", ["received", "paid"]);
export const payModeEnum = pgEnum("pay_mode", ["cash", "bank"]);
export const bookModeEnum = pgEnum("book_mode", ["metal", "amount"]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "open",
  "partial",
  "delivered",
  "cancelled",
]);
// LKB workbook sheets: Ready (R), Forward (F), Unfixed (UF).
export const bookTypeEnum = pgEnum("book_type", ["ready", "forward", "unfixed"]);
// "- OR +" sheet: the left block is customers dealing in lots, the right block
// is the shop's own MCX trading accounts.
export const lotBlockEnum = pgEnum("lot_block", ["customer", "account"]);

// ---- Operators (staff picked at login for created-by audit) -------------

export const operators = pgTable("operators", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---- Parties (customers / vendors) --------------------------------------

export const parties = pgTable("parties", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone"),
  gstin: text("gstin"),
  type: text("type").notNull().default("customer"), // customer | vendor | both
  openingPureGold: numeric("opening_pure_gold", { precision: 14, scale: 3 })
    .notNull()
    .default("0"),
  openingPureSilver: numeric("opening_pure_silver", { precision: 14, scale: 3 })
    .notNull()
    .default("0"),
  openingCash: numeric("opening_cash", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---- Transactions (header) ----------------------------------------------

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  serialNo: integer("serial_no").generatedAlwaysAsIdentity(),
  trnType: trnTypeEnum("trn_type").notNull(),
  partyId: uuid("party_id").references(() => parties.id, { onDelete: "restrict" }),
  metal: metalEnum("metal").notNull(),
  txnDate: timestamp("txn_date", { withTimezone: true }).defaultNow().notNull(),
  barRate: numeric("bar_rate", { precision: 12, scale: 2 }), // per gram
  refNo: text("ref_no"),
  thru: text("thru"),
  narration: text("narration"),
  tdsAmount: numeric("tds_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  modifiedBy: text("modified_by"),
  modifiedAt: timestamp("modified_at", { withTimezone: true }).defaultNow().notNull(),
});

export const transactionLines = pgTable("transaction_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  kind: lineKindEnum("kind").notNull(),
  particulars: text("particulars"),
  weight: numeric("weight", { precision: 12, scale: 3 }).notNull(),
  touch: numeric("touch", { precision: 6, scale: 3 }),
  pure: numeric("pure", { precision: 12, scale: 3 }).notNull().default("0"),
  rate: numeric("rate", { precision: 12, scale: 2 }).notNull(), // per gram
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  // Set when the line was filled from a booking, so delivering closes the book.
  bookingId: uuid("booking_id"),
});

// ---- Metal receipts / payments ------------------------------------------

export const metalMovements = pgTable("metal_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  direction: moveDirEnum("direction").notNull(),
  particulars: text("particulars"),
  weight: numeric("weight", { precision: 12, scale: 3 }).notNull(),
  touch: numeric("touch", { precision: 6, scale: 3 }),
  aTouch: numeric("a_touch", { precision: 6, scale: 3 }),
  pure: numeric("pure", { precision: 12, scale: 3 }).notNull().default("0"),
});

// ---- Cash / bank settlements (single or split) --------------------------

export const settlements = pgTable("settlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  mode: payModeEnum("mode").notNull(),
  direction: moveDirEnum("direction").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  bankName: text("bank_name"),
});

// ---- Bookings (ours; not in Logimax) ------------------------------------

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  serialNo: integer("serial_no").generatedAlwaysAsIdentity(),
  partyId: uuid("party_id")
    .notNull()
    .references(() => parties.id, { onDelete: "restrict" }),
  trnType: trnTypeEnum("trn_type").notNull().default("sales"), // sales (we sell) | purchase (we buy)
  // ---- LKB workbook columns ----
  bookType: bookTypeEnum("book_type").notNull().default("ready"),
  bookDate: timestamp("book_date", { withTimezone: true }).defaultNow().notNull(),
  /** DELIVERY column: grams delivered so far. PENDING = weightBooked - this. */
  deliveredWeight: numeric("delivered_weight", { precision: 12, scale: 3 })
    .notNull()
    .default("0"),
  /** MCX BUY column, quoted per 10 g. PREMIUM = lockedRate - mcxRate x 0.1. */
  mcxRate: numeric("mcx_rate", { precision: 12, scale: 2 }),
  remarks: text("remarks"),
  metal: metalEnum("metal").notNull(),
  bookMode: bookModeEnum("book_mode").notNull(),
  weightBooked: numeric("weight_booked", { precision: 12, scale: 3 }),
  lockedRate: numeric("locked_rate", { precision: 12, scale: 2 }),
  amount: numeric("amount", { precision: 14, scale: 2 }),
  advancePaid: numeric("advance_paid", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  status: bookingStatusEnum("status").notNull().default("open"),
  deliveredTxnId: uuid("delivered_txn_id"),
  createdBy: text("created_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---- Booking deliveries (booking -> the bill that delivered it) ---------

export const bookingDeliveries = pgTable("booking_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "cascade" }),
  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  weight: numeric("weight", { precision: 12, scale: 3 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---- MCX lot positions ("- OR +" sheet) ---------------------------------

export const mcxPositions = pgTable("mcx_positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  block: lotBlockEnum("block").notNull(),
  name: text("name").notNull(),
  sellLots: numeric("sell_lots", { precision: 10, scale: 3 }).notNull().default("0"),
  buyLots: numeric("buy_lots", { precision: 10, scale: 3 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---- Stock / opening balances (single row) ------------------------------

export const stock = pgTable("stock", {
  id: integer("id").primaryKey().default(1),
  openingPureGold: numeric("opening_pure_gold", { precision: 14, scale: 3 })
    .notNull()
    .default("0"),
  openingPureSilver: numeric("opening_pure_silver", { precision: 14, scale: 3 })
    .notNull()
    .default("0"),
  openingCash: numeric("opening_cash", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  openingBank: numeric("opening_bank", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---- Settings (single row) ----------------------------------------------

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  pinHash: text("pin_hash"),
  autoLogoffMinutes: integer("auto_logoff_minutes").notNull().default(7),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  gstin: text("gstin"),
  taxPercent: numeric("tax_percent", { precision: 5, scale: 2 }).notNull().default("3"),
  tdsPercent: numeric("tds_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  defaultGoldRate: numeric("default_gold_rate", { precision: 12, scale: 2 }),
  defaultSilverRate: numeric("default_silver_rate", { precision: 12, scale: 2 }),
  priceUpdatedAt: timestamp("price_updated_at", { withTimezone: true }),
  // Editable WhatsApp wording. NULL falls back to the built-in template.
  bookingTemplate: text("booking_template"),
  salesTemplate: text("sales_template"),
  purchaseTemplate: text("purchase_template"),
  deliveredTemplate: text("delivered_template"),
});

// ---- Inferred types -----------------------------------------------------

export type Operator = typeof operators.$inferSelect;
export type Party = typeof parties.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type TransactionLine = typeof transactionLines.$inferSelect;
export type MetalMovement = typeof metalMovements.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type BookingDelivery = typeof bookingDeliveries.$inferSelect;
export type McxPosition = typeof mcxPositions.$inferSelect;
export type Stock = typeof stock.$inferSelect;
export type Settings = typeof settings.$inferSelect;
