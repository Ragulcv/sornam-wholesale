import { listHistory } from "@/lib/queries/history";

export const dynamic = "force-dynamic";

function cell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const types = u.searchParams.getAll("type").filter((t) => ["sales", "purchase", "expense"].includes(t)) as ("sales" | "purchase" | "expense")[];
  const rows = await listHistory({
    from: u.searchParams.get("from") || undefined,
    to: u.searchParams.get("to") || undefined,
    trnTypes: types,
    search: u.searchParams.get("q") || undefined,
  });

  const header = ["No", "Type", "Date", "Party", "Metal", "Outward Wg", "Inward Wg", "Outward Pure", "Inward Pure", "Metal Wg Recd", "Metal Wg Paid", "Metal Pure Recd", "Metal Pure Paid", "Cash Recd", "Cash Paid", "Bank Recd", "Bank Paid", "Value", "TDS", "Total", "Created By", "Created Date", "Modified By", "Modified Date"];
  const lines = [header.map(cell).join(",")];
  for (const r of rows) {
    lines.push([
      r.serialNo, r.trnType, new Date(r.txnDate).toISOString().slice(0, 10), r.partyName ?? "", r.metal,
      r.outwardWg, r.inwardWg, r.outwardPure, r.inwardPure, r.metalWgRecd, r.metalWgPaid, r.metalPureRecd, r.metalPurePaid,
      r.cashRecd, r.cashPaid, r.bankRecd, r.bankPaid, r.value, r.tds, r.total,
      r.createdBy ?? "", new Date(r.createdAt).toISOString().slice(0, 10), r.modifiedBy ?? "", new Date(r.modifiedAt).toISOString().slice(0, 10),
    ].map(cell).join(","));
  }
  const today = new Date().toISOString().slice(0, 10);
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${today}.csv"`,
    },
  });
}
