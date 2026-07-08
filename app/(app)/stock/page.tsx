import { getStock } from "@/lib/queries/stock";
import { PageHeader, Card, StatTile } from "@/components/ui";
import { fmtMoney, fmtWeight } from "@/lib/format";
import StockForm from "./StockForm";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const s = await getStock();
  return (
    <>
      <PageHeader title="Stock & Availability" subtitle="Live metal and cash, updated by every transaction." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Gold (pure)" value={fmtWeight(s.currentPureGold)} accent hint={`opening ${fmtWeight(s.openingPureGold)}`} />
        <StatTile label="Silver (pure)" value={fmtWeight(s.currentPureSilver)} hint={`opening ${fmtWeight(s.openingPureSilver)}`} />
        <StatTile label="Cash" value={fmtMoney(s.currentCash)} hint={`opening ${fmtMoney(s.openingCash)}`} />
        <StatTile label="Bank" value={fmtMoney(s.currentBank)} hint={`opening ${fmtMoney(s.openingBank)}`} />
      </div>

      <Card className="p-4">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-mute">Opening balances</div>
        <StockForm
          openingPureGold={s.openingPureGold}
          openingPureSilver={s.openingPureSilver}
          openingCash={s.openingCash}
          openingBank={s.openingBank}
        />
      </Card>
    </>
  );
}
