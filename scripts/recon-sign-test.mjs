const { reconcile } = await import("../lib/bullion.ts");
let pass=0, fail=0;
const eq=(l,g,w)=>{ if(Math.abs(g-w)<0.005){pass++;console.log(`  ok   ${l} = ${g}`);} else {fail++;console.log(`  FAIL ${l}: got ${g} want ${w}`);} };
const base = { saleLines:[{weight:100,touch:100}], returnLines:[], metalMoves:[], ratePerGram:10000,
  intDisPure:0, intDisCash:0, mcCashRecd:0, bankRecd:0, cashBankRecd:0, conversion:"cash", discountPure:0, discountCash:0 };

console.log("\n-- 100 g @ 10000/g, nothing received --");
let r = reconcile(base);
eq("bill value", r.billValue, 1000000);
eq("receipts shown negative", r.receiptsSigned, 0);
eq("closing cash = received - bill: owed reads negative", r.closingCash, -1000000);

console.log("\n-- 4,00,000 received in cash --");
r = reconcile({ ...base, mcCashRecd: 400000 });
eq("receipts", r.receipts, 400000);
eq("receipts shown negative", r.receiptsSigned, -400000);
eq("closing cash", r.closingCash, -600000);

console.log("\n-- fully settled: 6,00,000 cash + 4,00,000 bank --");
r = reconcile({ ...base, mcCashRecd: 600000, bankRecd: 400000 });
eq("receipts shown negative", r.receiptsSigned, -1000000);
eq("closing cash settles to zero", r.closingCash, 0);

console.log("\n-- overpaid by 50,000 --");
r = reconcile({ ...base, mcCashRecd: 1050000 });
eq("overpaid reads positive (we owe them)", r.closingCash, 50000);

console.log("\n-- their sheet's own numbers: 995.000 / 995.134 / -0.134 --");
r = reconcile({ saleLines:[{weight:1000,touch:99.5}], returnLines:[], metalMoves:[{weight:1000,aTouch:99.5134,dir:"received"}],
  ratePerGram:0, intDisPure:0, intDisCash:0, mcCashRecd:0, bankRecd:0, cashBankRecd:0, conversion:null, discountPure:0, discountCash:0 });
eq("sale pure", r.salePure, 995.0);
eq("metal pure in", r.movePure, 995.134);
eq("net pure", r.totalPure, -0.134);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
