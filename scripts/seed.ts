import { config } from "dotenv";
config({ path: ".env.local" });

import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import {
  operators,
  parties,
  transactions,
  transactionLines,
  metalMovements,
  settlements,
  bookings,
  stock,
  settings,
} from "../lib/db/schema";
import { pure, lineAmount } from "../lib/bullion";

async function main() {
  console.log("Seeding Logimax-style bullion ledger…");

  await db.delete(transactions); // cascades lines/movements/settlements
  await db.delete(bookings);
  await db.delete(parties);
  await db.delete(operators);
  await db.delete(stock);
  await db.delete(settings);

  const pinHash = await bcrypt.hash("1234", 10);
  await db.insert(settings).values({
    id: 1,
    pinHash,
    autoLogoffMinutes: 7,
    gstin: "33ABCDE1234F1Z5",
    taxPercent: "3",
    tdsPercent: "0.1",
    defaultGoldRate: "7250",
    defaultSilverRate: "92",
    priceUpdatedAt: new Date(),
  });

  await db.insert(stock).values({
    id: 1,
    openingPureGold: "2500.000",
    openingPureSilver: "40000.000",
    openingCash: "1500000",
    openingBank: "5000000",
  });

  const [ravi, suresh] = await db
    .insert(operators)
    .values([{ name: "Ravi" }, { name: "Suresh" }, { name: "Meena" }])
    .returning({ id: operators.id, name: operators.name });

  const partyRows = await db
    .insert(parties)
    .values([
      { name: "Karthik Bullion", phone: "9842010101", gstin: "33AAAAA0000A1Z1", type: "customer" },
      { name: "Senthil Traders", phone: "9842020202", type: "both" },
      { name: "Lakshmi Gold House", phone: "9842030303", type: "customer" },
      { name: "Anand Vendor", phone: "9842040404", type: "vendor" },
    ])
    .returning({ id: parties.id });

  // Sales #1 — gold, 2 lines at different rates, split cash+bank
  const [s1] = await db
    .insert(transactions)
    .values({
      trnType: "sales",
      partyId: partyRows[0].id,
      metal: "gold",
      barRate: "7250",
      refNo: "S-1001",
      createdBy: ravi.name,
      modifiedBy: ravi.name,
    })
    .returning({ id: transactions.id });
  await db.insert(transactionLines).values([
    { transactionId: s1.id, kind: "sale", particulars: "Gold bar 100g", weight: "100.000", touch: "99.500", pure: String(pure(100, 99.5)), rate: "7250", amount: String(lineAmount(100, 7250)), sortOrder: 0 },
    { transactionId: s1.id, kind: "sale", particulars: "Gold coin 50g", weight: "50.000", touch: "99.900", pure: String(pure(50, 99.9)), rate: "7260", amount: String(lineAmount(50, 7260)), sortOrder: 1 },
  ]);
  await db.insert(settlements).values([
    { transactionId: s1.id, mode: "cash", direction: "received", amount: "500000" },
    { transactionId: s1.id, mode: "bank", direction: "received", amount: String(lineAmount(100, 7250) + lineAmount(50, 7260) - 500000), bankName: "HDFC" },
  ]);

  // Sales #2 — silver, single cash
  const [s2] = await db
    .insert(transactions)
    .values({ trnType: "sales", partyId: partyRows[2].id, metal: "silver", barRate: "92", refNo: "S-1002", createdBy: suresh.name, modifiedBy: suresh.name })
    .returning({ id: transactions.id });
  await db.insert(transactionLines).values({
    transactionId: s2.id, kind: "sale", particulars: "Silver bar 5kg", weight: "5000.000", touch: "99.900", pure: String(pure(5000, 99.9)), rate: "92", amount: String(lineAmount(5000, 92)), sortOrder: 0,
  });
  await db.insert(settlements).values({ transactionId: s2.id, mode: "cash", direction: "received", amount: String(lineAmount(5000, 92)) });

  // Purchase #1 — gold in, metal received + cash paid
  const [p1] = await db
    .insert(transactions)
    .values({ trnType: "purchase", partyId: partyRows[3].id, metal: "gold", barRate: "7240", refNo: "P-2001", createdBy: ravi.name, modifiedBy: ravi.name })
    .returning({ id: transactions.id });
  await db.insert(transactionLines).values({
    transactionId: p1.id, kind: "purchase", particulars: "Old gold 200g", weight: "200.000", touch: "91.600", pure: String(pure(200, 91.6)), rate: "7240", amount: String(lineAmount(200, 7240)), sortOrder: 0,
  });
  await db.insert(metalMovements).values({ transactionId: p1.id, direction: "received", particulars: "Old gold", weight: "200.000", touch: "91.600", aTouch: "91.500", pure: String(pure(200, 91.6)) });
  await db.insert(settlements).values({ transactionId: p1.id, mode: "bank", direction: "paid", amount: String(lineAmount(200, 7240)), bankName: "ICICI" });

  // Bookings — one by metal, one by amount
  await db.insert(bookings).values([
    { partyId: partyRows[1].id, metal: "gold", bookMode: "metal", weightBooked: "500.000", lockedRate: "7250", advancePaid: "1000000", status: "open", createdBy: ravi.name },
    { partyId: partyRows[2].id, metal: "gold", bookMode: "amount", amount: "2000000", advancePaid: "2000000", status: "open", createdBy: suresh.name },
  ]);

  console.log("✓ Seed complete — 3 operators, 4 parties, 3 transactions, 2 bookings. PIN 1234.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
