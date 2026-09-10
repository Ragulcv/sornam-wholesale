// Validates lib/lkb.ts against the client's own workbook, cell by cell.
// Source: "Copy of Copy of L K B BOOKING.xlsx" (R SELL / R BUY / F / UF CUS / - OR +).
const { premium, pendingWeight, gramsToLots, computePosition, computeBooking } = await import("../lib/lkb.ts");

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = Math.abs((got ?? 0) - (want ?? 0)) < 0.0005 || got === want;
  if (ok) { pass++; console.log(`  ok   ${label} = ${got}`); }
  else { fail++; console.log(`  FAIL ${label}: got ${got}, want ${want}`); }
};

console.log("\n-- R SELL row 2 (Ragul 1000g @ 15768, MCX 152818) --");
eq("F2 pending = C2-E2", pendingWeight(1000, 0), 1000);
eq("H2 premium = D2-G2*0.1", premium(15768, 152818), 486.2);

console.log("\n-- R SELL row 3 (rate 15500, MCX blank) --");
// Their sheet computes 15500 here (blank MCX treated as 0). We blank it instead.
eq("H3 premium blanked when MCX missing", premium(15500, null), null);

console.log("\n-- UF CUS row 2 (Ragul 1000g, MCX 152818, RATE blank) --");
eq("F2 premium blanked when RATE missing", premium(null, 152818), null);

console.log("\n-- lots conversion (=x*0.1%) --");
eq("1000 g -> lots", gramsToLots(1000), 1);
eq("-1000 g -> lots", gramsToLots(-1000), -1);
eq("500 g -> lots", gramsToLots(500), 0.5);

console.log("\n-- '- OR +' sheet, whole workbook state --");
const pos = computePosition({
  readySellPending: 1500,   // 'R SELL'!F59
  readyBuyPending: 500,     // 'R BUY'!F61
  forwardSellPending: 0,    // 'F SELL'!F31
  forwardBuyPending: 0,     // 'F BUY'!F20
  unfixedSellWeight: 1000,  // 'UF CUS'!C31
  unfixedBuyWeight: 0,      // 'UF CUS'!C59
  customerLots: [
    { name: "Suresh", sellLots: 0.5, buyLots: 0 },
    { name: "Ganesh", sellLots: 0, buyLots: 2 },
  ],
  accountLots: [
    { name: "MCX ID", sellLots: 0.5, buyLots: 1 },
    { name: "MCX ID 2", sellLots: 1, buyLots: 2 },
  ],
});
eq("O3 ready net grams (N3-M3)", pos.readyNetGrams, -1000);
eq("K3 ready lots", pos.readyLots, -1);
eq("O6 forward net grams", pos.forwardNetGrams, 0);
eq("K6 forward lots", pos.forwardLots, 0);
eq("O9 unfixed net grams (M9-N9)", pos.unfixedNetGrams, 1000);
eq("K9 unfixed lots", pos.unfixedLots, 1);
eq("B21 customer sell lots", pos.customerSellLots, 0.5);
eq("C21 customer buy lots", pos.customerBuyLots, 2);
eq("C22/K10 customer net lots", pos.customerNetLots, -1.5);
eq("K11 book exposure lots", pos.bookLots, -1.5);
eq("G11 account sell lots", pos.accountSellLots, 1.5);
eq("H11 account buy lots", pos.accountBuyLots, 3);
eq("H12/K12 MCX net lots", pos.mcxLots, 1.5);
eq("K14 hedge check (must be 0)", pos.netLots, 0);
eq("hedged", pos.hedged, true);

console.log("\n-- unhedged case: drop one MCX buy lot --");
const un = computePosition({
  readySellPending: 1500, readyBuyPending: 500,
  forwardSellPending: 0, forwardBuyPending: 0,
  unfixedSellWeight: 1000, unfixedBuyWeight: 0,
  customerLots: [{ name: "Suresh", sellLots: 0.5, buyLots: 0 }, { name: "Ganesh", sellLots: 0, buyLots: 2 }],
  accountLots: [{ name: "MCX ID", sellLots: 0.5, buyLots: 1 }, { name: "MCX ID 2", sellLots: 1, buyLots: 1 }],
});
eq("K14 off by one lot", un.netLots, -1);
eq("hedged", un.hedged, false);
eq("action = buy 1 lot", un.actionLots, 1);

console.log("\n-- booking row status --");
eq("open pending", computeBooking({ bookType: "ready", side: "sell", weight: 1000, delivered: 0, rate: 15768, mcxRate: 152818 }).pending, 1000);
eq("partial status", computeBooking({ bookType: "ready", side: "sell", weight: 1000, delivered: 400, rate: null, mcxRate: null }).status === "partial" ? 1 : 0, 1);
eq("delivered status", computeBooking({ bookType: "ready", side: "sell", weight: 1000, delivered: 1000, rate: null, mcxRate: null }).status === "delivered" ? 1 : 0, 1);
eq("value = wt x rate", computeBooking({ bookType: "ready", side: "sell", weight: 1000, delivered: 0, rate: 15768, mcxRate: null }).value, 15768000);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
