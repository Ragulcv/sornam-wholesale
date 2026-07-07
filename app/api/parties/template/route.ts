import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Parties");
  ws.columns = [
    { header: "Name (required)", key: "name", width: 28 },
    { header: "Phone", key: "phone", width: 18 },
    { header: "GSTIN", key: "gstin", width: 20 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRow({ name: "Ramesh Bullion", phone: "9842000000", gstin: "33ABCDE1234F1Z5" });
  ws.addRow({ name: "Anand Traders", phone: "9842011111", gstin: "" });
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="parties-template.xlsx"',
    },
  });
}
