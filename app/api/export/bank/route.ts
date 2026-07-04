import { listCollections } from "@/lib/queries";
import { billNo } from "@/lib/format";

export const dynamic = "force-dynamic";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Bank-only collections as CSV, formatted for import into Tally / account books.
// The route is behind the auth proxy, so only a logged-in session can hit it.
export async function GET() {
  const rows = await listCollections({ paymentMode: "bank" });

  const header = [
    "Bill No",
    "Date",
    "Customer",
    "Metal",
    "Purity",
    "Weight (g)",
    "Rate",
    "Amount",
    "Slip",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const c of rows) {
    lines.push(
      [
        billNo(c.billNumber),
        new Date(c.createdAt).toISOString().slice(0, 10),
        c.customerName,
        c.metal,
        c.purity,
        c.weightCollectedG.toFixed(3),
        c.rateApplied.toFixed(2),
        c.amount.toFixed(2),
        c.slipType,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const csv = lines.join("\n");
  const today = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bank-transactions-${today}.csv"`,
    },
  });
}
