// End-to-end check of the core flow against the live DB.
// Run: node --env-file=.env.local --import tsx scripts/verify.ts
import {
  dashboard,
  listBookings,
  listCollections,
  findOrCreateCustomer,
  createBooking,
  recordCollection,
  getBooking,
} from "../lib/queries";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("  ✓ " + msg);
}

async function main() {
  console.log("1. Seed data present");
  const bookings0 = await listBookings();
  assert(bookings0.length >= 4, `>=4 seeded bookings (got ${bookings0.length})`);
  const d0 = await dashboard();
  assert(d0.openBookings >= 2, `open bookings counted (${d0.openBookings})`);

  console.log("2. Create booking → partial collection → balances");
  const custId = await findOrCreateCustomer("Verify Test Co", "9800000000");
  const bId = await createBooking({
    customerId: custId,
    metal: "gold",
    purity: "995",
    weightBookedG: 100,
    rateMode: "locked",
    lockedRate: 72000,
    rateUnit: "per_10g",
    advanceAmount: 0,
  });
  let b = await getBooking(bId);
  assert(b!.booking.status === "open", "new booking is open");
  assert(b!.booking.weightPendingG === 100, "pending = 100g");

  // collect 40g → partial, amount = 40 * 72000 / 10 = 288000
  const c1 = await recordCollection({
    bookingId: bId,
    weightCollectedG: 40,
    rate: 72000,
    paymentMode: "bank",
    slipType: "gst",
  });
  b = await getBooking(bId);
  assert(b!.booking.status === "partial", "status → partial after 40g");
  assert(
    Math.abs(b!.booking.weightPendingG - 60) < 1e-6,
    `pending → 60g (got ${b!.booking.weightPendingG})`,
  );
  const col = (await listCollections({ bookingId: bId }))[0];
  assert(Math.abs(col.amount - 288000) < 0.01, `amount = ₹288000 (got ${col.amount})`);
  assert(col.billNumber > 0, `bill number assigned (${col.billNumber})`);

  // collect remaining 60g → completed
  await recordCollection({
    bookingId: bId,
    weightCollectedG: 60,
    rate: 72000,
    paymentMode: "cash",
    slipType: "plain",
  });
  b = await getBooking(bId);
  assert(b!.booking.status === "completed", "status → completed after full collection");
  assert(b!.booking.weightPendingG === 0, "pending → 0g");

  console.log("3. Ledger reflects both new collections");
  const cols = await listCollections({ bookingId: bId });
  assert(cols.length === 2, `2 collections on booking (got ${cols.length})`);
  const bankOnly = await listCollections({ bookingId: bId, paymentMode: "bank" });
  assert(bankOnly.length === 1, "payment-mode filter works");

  console.log("\nALL CHECKS PASSED ✅");
  void c1;
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  });
