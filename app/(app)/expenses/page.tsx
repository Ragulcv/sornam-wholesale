import { listHistory } from "@/lib/queries/history";
import { listPartyOptions } from "@/lib/queries/parties";
import { getDailyTally } from "@/lib/queries/dailyTally";
import ExpensesClient from "@/components/ExpensesClient";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const [rows, parties, tally] = await Promise.all([
    listHistory({ trnTypes: ["expense"] }),
    listPartyOptions(),
    getDailyTally(),
  ]);
  return (
    <ExpensesClient
      expenses={rows.map((r) => ({
        id: r.id,
        serialNo: r.serialNo,
        date: r.txnDate.toISOString(),
        party: r.partyName,
        // A negative expense was stored as money received; show it as such
        // rather than dropping it, so the day still tallies.
        cash: r.cashPaid - r.cashRecd,
        bank: r.bankPaid - r.bankRecd,
        total: r.cashPaid + r.bankPaid - r.cashRecd - r.bankRecd,
        createdBy: r.createdBy,
      }))}
      parties={parties}
      tally={tally}
    />
  );
}
