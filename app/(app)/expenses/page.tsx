import { listHistory } from "@/lib/queries/history";
import { listPartyOptions } from "@/lib/queries/parties";
import ExpensesClient from "@/components/ExpensesClient";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const [rows, parties] = await Promise.all([
    listHistory({ trnTypes: ["expense"] }),
    listPartyOptions(),
  ]);
  return (
    <ExpensesClient
      expenses={rows.map((r) => ({ id: r.id, serialNo: r.serialNo, date: r.txnDate.toISOString(), party: r.partyName, cash: r.cashPaid, bank: r.bankPaid, total: r.value + r.cashPaid + r.bankPaid, createdBy: r.createdBy }))}
      parties={parties}
    />
  );
}
