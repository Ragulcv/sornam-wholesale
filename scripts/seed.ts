import { config } from "dotenv";
config({ path: ".env.local" });

import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import { bookings, collections, customers, settings } from "../lib/db/schema";
import { calcAmount } from "../lib/format";

async function main() {
  console.log("Seeding Sornam Wholesale demo data…");

  // Clean slate (dev only).
  await db.delete(collections);
  await db.delete(bookings);
  await db.delete(customers);
  await db.delete(settings);

  // Settings + demo PIN 1234
  const pinHash = await bcrypt.hash("1234", 10);
  await db.insert(settings).values({
    id: 1,
    pinHash,
    autoLogoffMinutes: 7,
    gstin: "33ABCDE1234F1Z5",
    defaultGoldRate: "72500",
    defaultSilverRate: "92000",
  });

  const demoCustomers = [
    { name: "Ramesh Bullion", phone: "9842011111", gstin: "33AAAAA0000A1Z1" },
    { name: "Sri Lakshmi Jewellers", phone: "9842022222", gstin: null },
    { name: "Anand Traders", phone: "9842033333", gstin: "33BBBBB1111B2Z2" },
    { name: "Kumar Gold House", phone: "9842044444", gstin: null },
  ];
  const custIds: string[] = [];
  for (const c of demoCustomers) {
    const [row] = await db
      .insert(customers)
      .values(c)
      .returning({ id: customers.id });
    custIds.push(row.id);
  }

  // Booking 1: gold, locked rate, partially collected
  const [b1] = await db
    .insert(bookings)
    .values({
      customerId: custIds[0],
      metal: "gold",
      purity: "995",
      weightBookedG: "2000.000",
      rateMode: "locked",
      lockedRate: "72500",
      rateUnit: "per_10g",
      advanceAmount: "500000",
      status: "partial",
    })
    .returning({ id: bookings.id });
  await db.insert(collections).values({
    bookingId: b1.id,
    weightCollectedG: "1000.000",
    rateApplied: "72500",
    paymentMode: "bank",
    amount: String(calcAmount(1000, 72500, "per_10g")),
    slipType: "gst",
  });

  // Booking 2: gold, float rate, fully collected
  const [b2] = await db
    .insert(bookings)
    .values({
      customerId: custIds[1],
      metal: "gold",
      purity: "999",
      weightBookedG: "500.000",
      rateMode: "float",
      rateUnit: "per_10g",
      advanceAmount: "0",
      status: "completed",
    })
    .returning({ id: bookings.id });
  await db.insert(collections).values({
    bookingId: b2.id,
    weightCollectedG: "500.000",
    rateApplied: "73100",
    paymentMode: "cash",
    amount: String(calcAmount(500, 73100, "per_10g")),
    slipType: "plain",
  });

  // Booking 3: silver, locked, open (no collection yet)
  await db.insert(bookings).values({
    customerId: custIds[2],
    metal: "silver",
    purity: "999",
    weightBookedG: "50000.000",
    rateMode: "locked",
    lockedRate: "92000",
    rateUnit: "per_kg",
    advanceAmount: "100000",
    status: "open",
  });

  // Booking 4: gold, locked, open
  await db.insert(bookings).values({
    customerId: custIds[3],
    metal: "gold",
    purity: "916 (22K)".split(" ")[0],
    weightBookedG: "1000.000",
    rateMode: "locked",
    lockedRate: "66400",
    rateUnit: "per_10g",
    advanceAmount: "0",
    status: "open",
  });

  console.log("✓ Seed complete. Demo PIN is 1234.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
