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
        <StatTile label="Gold (pure)" value={fmtWeight(s.currentPureGold)} accent hint={`base opening ${fmtWeight(s.openingPureGold)}`} />
        <StatTile label="Silver (pure)" value={fmtWeight(s.currentPureSilver)} hint={`base opening ${fmtWeight(s.openingPureSilver)}`} />
        <StatTile label="Cash" value={fmtMoney(s.currentCash)} hint={`base opening ${fmtMoney(s.openingCash)}`} />
        <StatTile label="Bank" value={fmtMoney(s.currentBank)} hint={`base opening ${fmtMoney(s.openingBank)}`} />
      </div>

      <Card className="mb-6 overflow-x-auto p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-mute">
          Today&apos;s opening → closing (moves with each day&apos;s billing)
        </div>
        <table className="w-full min-w-[520px] text-left">
          <thead className="text-[11px] uppercase tracking-wider text-mute">
            <tr><th className="px-2 py-1"></th><th className="px-2 py-1">Gold (pure)</th><th className="px-2 py-1">Silver (pure)</th><th className="px-2 py-1">Cash</th><th className="px-2 py-1">Bank</th></tr>
          </thead>
          <tbody>
            <tr className="border-t border-line2">
              <td className="px-2 py-1.5 text-sm font-semibold text-mid">Opening (start of today)</td>
              <td className="num px-2 py-1.5">{fmtWeight(s.todayOpen.pureGold)}</td>
              <td className="num px-2 py-1.5">{fmtWeight(s.todayOpen.pureSilver)}</td>
              <td className="num px-2 py-1.5">{fmtMoney(s.todayOpen.cash)}</td>
              <td className="num px-2 py-1.5">{fmtMoney(s.todayOpen.bank)}</td>
            </tr>
            <tr className="border-t border-line2 bg-[#faf7f0]">
              <td className="px-2 py-1.5 text-sm font-semibold text-ink">Closing (now)</td>
              <td className="num px-2 py-1.5 font-semibold">{fmtWeight(s.todayClose.pureGold)}</td>
              <td className="num px-2 py-1.5 font-semibold">{fmtWeight(s.todayClose.pureSilver)}</td>
              <td className="num px-2 py-1.5 font-semibold">{fmtMoney(s.todayClose.cash)}</td>
              <td className="num px-2 py-1.5 font-semibold">{fmtMoney(s.todayClose.bank)}</td>
            </tr>
          </tbody>
        </table>
      </Card>

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
