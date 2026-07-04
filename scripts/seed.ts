import { config } from "dotenv";
config({ path: ".env.local" });

import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import { bookings, collections, customers, settings } from "../lib/db/schema";
import { calcAmount } from "../lib/format";

async function main() {
  console.log("Seeding Sornam Wholesale demo data…");

  // Clean slate.
  await db.delete(collections);
  await db.delete(bookings);
  await db.delete(customers);
  await db.delete(settings);

  // Settings + PIN 1234
  const pinHash = await bcrypt.hash("1234", 10);
  await db.insert(settings).values({
    id: 1,
    pinHash,
    autoLogoffMinutes: 7,
    gstin: "33ABCDE1234F1Z5",
    taxPercent: "3",
    defaultGoldRate: "72500",
    defaultSilverRate: "92000",
    priceUpdatedAt: new Date(),
  });

  const people = [
    { name: "Karthik Bullion", phone: "9842010101", gstin: "33AAAAA0000A1Z1" },
    { name: "Meenakshi Jewellers", phone: "9842020202", gstin: null },
    { name: "Senthil Traders", phone: "9842030303", gstin: "33BBBBB1111B2Z2" },
    { name: "Lakshmi Gold House", phone: "9842040404", gstin: null },
    { name: "Arjun & Sons", phone: "9842050505", gstin: "33CCCCC2222C3Z3" },
    { name: "Priya Bullion", phone: "9842060606", gstin: null },
  ];
  const id: string[] = [];
  for (const p of people) {
    const [row] = await db
      .insert(customers)
      .values(p)
      .returning({ id: customers.id });
    id.push(row.id);
  }

  // 1. Karthik — gold 995, locked, partially collected (400g of 1000g)
  const [b1] = await db
    .insert(bookings)
    .values({
      customerId: id[0],
      metal: "gold",
      purity: "995",
      weightBookedG: "1000.000",
      rateMode: "locked",
      lockedRate: "72500",
      rateUnit: "per_10g",
      advanceAmount: "300000",
      status: "partial",
    })
    .returning({ id: bookings.id });
  await db.insert(collections).values({
    bookingId: b1.id,
    weightCollectedG: "400.000",
    rateApplied: "72500",
    rateUnit: "per_10g",
    paymentMode: "bank",
    amount: String(calcAmount(400, 72500, "per_10g")),
    slipType: "gst",
  });

  // 2. Meenakshi — gold 916, float, open
  await db.insert(bookings).values({
    customerId: id[1],
    metal: "gold",
    purity: "916",
    weightBookedG: "500.000",
    rateMode: "float",
    rateUnit: "per_10g",
    advanceAmount: "0",
    status: "open",
  });

  // 3. Senthil — silver 999, locked, partial (10kg of 25kg)
  const [b3] = await db
    .insert(bookings)
    .values({
      customerId: id[2],
      metal: "silver",
      purity: "999",
      weightBookedG: "25000.000",
      rateMode: "locked",
      lockedRate: "92000",
      rateUnit: "per_kg",
      advanceAmount: "50000",
      status: "partial",
    })
    .returning({ id: bookings.id });
  await db.insert(collections).values({
    bookingId: b3.id,
    weightCollectedG: "10000.000",
    rateApplied: "92000",
    rateUnit: "per_kg",
    paymentMode: "cash",
    amount: String(calcAmount(10000, 92000, "per_kg")),
    slipType: "plain",
  });

  // 4. Lakshmi — gold 999, locked, completed (200g of 200g)
  const [b4] = await db
    .insert(bookings)
    .values({
      customerId: id[3],
      metal: "gold",
      purity: "999",
      weightBookedG: "200.000",
      rateMode: "locked",
      lockedRate: "73100",
      rateUnit: "per_10g",
      advanceAmount: "0",
      status: "completed",
    })
    .returning({ id: bookings.id });
  await db.insert(collections).values({
    bookingId: b4.id,
    weightCollectedG: "200.000",
    rateApplied: "73100",
    rateUnit: "per_10g",
    paymentMode: "bank",
    amount: String(calcAmount(200, 73100, "per_10g")),
    slipType: "plain",
  });

  // 5. Arjun — gold 995, locked, open with advance
  await db.insert(bookings).values({
    customerId: id[4],
    metal: "gold",
    purity: "995",
    weightBookedG: "1500.000",
    rateMode: "locked",
    lockedRate: "72400",
    rateUnit: "per_10g",
    advanceAmount: "200000",
    status: "open",
  });

  // 6. Priya — silver 999, float, open
  await db.insert(bookings).values({
    customerId: id[5],
    metal: "silver",
    purity: "999",
    weightBookedG: "5000.000",
    rateMode: "float",
    rateUnit: "per_kg",
    advanceAmount: "0",
    status: "open",
  });

  console.log("✓ Seed complete — 6 customers, 6 bookings. PIN is 1234.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
