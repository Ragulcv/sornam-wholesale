import ExcelJS from "exceljs";
import { requireSession } from "@/lib/auth";
import { listBookings, listLotPositions } from "@/lib/queries/bookings";
import type { BookingRow } from "@/lib/queries/bookings";

export const dynamic = "force-dynamic";

// Writes back the client's own workbook: same six sheets, same column order,
// same live formulas, so the file they download behaves exactly like the one
// they keep today and can go straight back into their hedging routine.
//
//   PENDING = WT - DELIVERY          -> =Cn-En
//   PREMIUM = RATE - MCX x 0.1       -> =Dn-Gn*0.1
//   lots    = grams x 0.1%           -> =On*0.1%
//   the "- OR +" sheet must foot to zero

const FIXED = { RSELL: 58, RBUY: 60, FSELL: 30, FBUY: 19, UFSELL: 30, UFBUY: 58 };

function sheetHeader(ws: ExcelJS.Worksheet, headers: string[]) {
  ws.addRow(headers);
  const row = ws.getRow(1);
  row.font = { bold: true };
  row.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF31797A" } };
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
}

/** A fixed-rate sheet (R SELL / R BUY / F SELL / F BUY). */
function fixedSheet(wb: ExcelJS.Workbook, name: string, rows: BookingRow[], lastDataRow: number) {
  const ws = wb.addWorksheet(name);
  sheetHeader(ws, ["DATE", "NAME", "WT", "RATE", "DELIVERY", "PENDING", "MCX BUY", "PREMIUM", "REMARKS"]);
  for (let i = 0; i < lastDataRow; i++) {
    const r = rows[i];
    const n = i + 2;
    ws.addRow([
      r ? new Date(r.bookDate) : null,
      r ? r.partyName : null,
      r ? r.weight : null,
      r && r.rate != null ? r.rate : null,
      r && r.delivered ? r.delivered : null,
      { formula: `C${n}-E${n}` },
      r && r.mcxRate != null ? r.mcxRate : null,
      { formula: `D${n}-G${n}*0.1` },
      r ? r.remarks : null,
    ]);
    ws.getCell(`A${n}`).numFmt = "dd-mmm-yy";
    ["C", "E", "F"].forEach((c) => (ws.getCell(`${c}${n}`).numFmt = "0.000"));
    ["D", "G", "H"].forEach((c) => (ws.getCell(`${c}${n}`).numFmt = "0.00"));
  }
  const sumRow = lastDataRow + 2;
  ws.getCell(`E${sumRow}`).value = "TOTAL";
  ws.getCell(`F${sumRow}`).value = { formula: `SUM(F2:F${lastDataRow + 1})` };
  ws.getCell(`F${sumRow}`).numFmt = "0.000";
  ws.getRow(sumRow).font = { bold: true };
  ws.columns.forEach((c, i) => (c.width = [12, 22, 12, 12, 12, 12, 14, 12, 24][i] ?? 12));
  return sumRow;
}

export async function GET() {
  await requireSession();
  const [bookings, lots] = await Promise.all([listBookings(), listLotPositions()]);
  const live = bookings.filter((b) => b.status !== "cancelled");
  const pick = (t: string, s: string) => live.filter((b) => b.bookType === t && b.side === s);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Bullion Tracker";
  wb.created = new Date();

  const rSell = fixedSheet(wb, "R SELL", pick("ready", "sell"), FIXED.RSELL);
  const rBuy = fixedSheet(wb, "R BUY", pick("ready", "buy"), FIXED.RBUY);
  const fSell = fixedSheet(wb, "F SELL", pick("forward", "sell"), FIXED.FSELL);
  const fBuy = fixedSheet(wb, "F BUY", pick("forward", "buy"), FIXED.FBUY);

  // ---- UF CUS: two blocks on one sheet, exactly as they keep it ----
  const uf = wb.addWorksheet("UF CUS");
  const ufSell = pick("unfixed", "sell");
  const ufBuy = pick("unfixed", "buy");

  const ufBlock = (startRow: number, title: string, rows: BookingRow[], count: number) => {
    uf.getCell(`A${startRow}`).value = "DATE";
    uf.getCell(`B${startRow}`).value = title;
    uf.getCell(`C${startRow}`).value = "WT";
    uf.getCell(`D${startRow}`).value = "MCX";
    uf.getCell(`E${startRow}`).value = "RATE";
    uf.getCell(`F${startRow}`).value = "PREMIUM";
    uf.getRow(startRow).eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF31797A" } };
    });
    for (let i = 0; i < count; i++) {
      const n = startRow + 1 + i;
      const r = rows[i];
      uf.getCell(`A${n}`).value = r ? new Date(r.bookDate) : null;
      uf.getCell(`B${n}`).value = r ? r.partyName : null;
      uf.getCell(`C${n}`).value = r ? r.weight : null;
      uf.getCell(`D${n}`).value = r && r.mcxRate != null ? r.mcxRate : null;
      uf.getCell(`E${n}`).value = r && r.rate != null ? r.rate : null;
      uf.getCell(`F${n}`).value = { formula: `E${n}-D${n}*0.1` };
      uf.getCell(`A${n}`).numFmt = "dd-mmm-yy";
      uf.getCell(`C${n}`).numFmt = "0.000";
      ["D", "E", "F"].forEach((c) => (uf.getCell(`${c}${n}`).numFmt = "0.00"));
    }
    const sumRow = startRow + count + 1;
    uf.getCell(`C${sumRow}`).value = { formula: `SUM(C${startRow + 1}:C${startRow + count})` };
    uf.getCell(`C${sumRow}`).numFmt = "0.000";
    uf.getRow(sumRow).font = { bold: true };
    return sumRow;
  };

  const ufSellSum = ufBlock(1, "UF SELL  NAME", ufSell, FIXED.UFSELL);
  const ufBuySum = ufBlock(ufSellSum + 4, "UF BUY NAME", ufBuy, FIXED.UFBUY);
  uf.columns.forEach((c, i) => (c.width = [12, 22, 12, 14, 12, 12][i] ?? 12));

  // ---- "- OR +": the position sheet, wired to the others ----
  const pos = wb.addWorksheet("- OR +");
  const cust = lots.filter((l) => l.block === "customer").slice(0, 19);
  const acct = lots.filter((l) => l.block === "account").slice(0, 9);

  pos.getCell("A1").value = "NAME";
  pos.getCell("B1").value = "SELL";
  pos.getCell("C1").value = "BUY";
  cust.forEach((l, i) => {
    const n = i + 2;
    pos.getCell(`A${n}`).value = l.name;
    pos.getCell(`B${n}`).value = l.sellLots || null;
    pos.getCell(`C${n}`).value = l.buyLots || null;
  });
  pos.getCell("B21").value = { formula: "SUM(B2:B20)" };
  pos.getCell("C21").value = { formula: "SUM(C2:C20)" };
  pos.getCell("B22").value = "SELL +";
  pos.getCell("B23").value = "BUY -";
  pos.getCell("C22").value = { formula: "B21-C21" };

  pos.getCell("F2").value = "MCX ID";
  pos.getCell("G1").value = "SELL";
  pos.getCell("H1").value = "BUY";
  acct.forEach((l, i) => {
    const n = i + 2;
    pos.getCell(`F${n}`).value = l.name;
    pos.getCell(`G${n}`).value = l.sellLots || null;
    pos.getCell(`H${n}`).value = l.buyLots || null;
  });
  pos.getCell("G11").value = { formula: "SUM(G2:G10)" };
  pos.getCell("H11").value = { formula: "SUM(H2:H10)" };
  pos.getCell("G12").value = "BUY +";
  pos.getCell("G13").value = "SELL -";
  pos.getCell("H12").value = { formula: "H11-G11" };

  pos.getCell("M2").value = "R SELL";
  pos.getCell("N2").value = "R BUY";
  pos.getCell("M3").value = { formula: `'R SELL'!$F$${rSell}` };
  pos.getCell("N3").value = { formula: `'R BUY'!$F$${rBuy}` };
  pos.getCell("O3").value = { formula: "N3-M3" };
  pos.getCell("K3").value = { formula: "O3*0.1%" };

  pos.getCell("M5").value = "F SELL";
  pos.getCell("N5").value = "F BUY";
  pos.getCell("M6").value = { formula: `'F SELL'!$F$${fSell}` };
  pos.getCell("N6").value = { formula: `'F BUY'!$F$${fBuy}` };
  pos.getCell("O6").value = { formula: "N6-M6" };
  pos.getCell("K6").value = { formula: "O6*0.1%" };

  pos.getCell("M8").value = "UF SELL";
  pos.getCell("N8").value = "UF BUY";
  pos.getCell("M9").value = { formula: `'UF CUS'!$C$${ufSellSum}` };
  pos.getCell("N9").value = { formula: `'UF CUS'!$C$${ufBuySum}` };
  pos.getCell("O9").value = { formula: "M9-N9" };
  pos.getCell("K9").value = { formula: "O9*0.1%" };

  pos.getCell("M10").value = "CUS";
  pos.getCell("K10").value = { formula: "C22" };
  pos.getCell("K11").value = { formula: "SUM(K3:K10)" };
  pos.getCell("K12").value = { formula: "H12" };
  pos.getCell("K14").value = { formula: "SUM(K11:K13)" };

  pos.getCell("J11").value = "BOOK";
  pos.getCell("J12").value = "MCX";
  pos.getCell("J14").value = "NET (0 = hedged)";
  ["K11", "K12", "K14"].forEach((c) => (pos.getCell(c).font = { bold: true }));
  pos.getCell("K14").numFmt = "0.000";
  pos.columns.forEach((c, i) => (c.width = [16, 10, 10, 4, 4, 14, 10, 10, 4, 18, 12, 4, 4, 12, 12, 12][i] ?? 10));

  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="BOOKING-${stamp}.xlsx"`,
    },
  });
}
