import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A ready-to-fill Excel template for bulk contact import.
export async function GET() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Contacts");

  ws.columns = [
    { header: "Name (required)", key: "name", width: 28 },
    { header: "Phone", key: "phone", width: 18 },
    { header: "GSTIN", key: "gstin", width: 20 },
    { header: "Note", key: "note", width: 24 },
  ];
  ws.getRow(1).font = { bold: true };

  // Example rows (delete before/while filling in real contacts).
  ws.addRow({ name: "Ramesh Bullion", phone: "9842000000", gstin: "33ABCDE1234F1Z5", note: "Regular" });
  ws.addRow({ name: "Anand Traders", phone: "9842011111", gstin: "", note: "" });

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="contacts-template.xlsx"',
    },
  });
}
