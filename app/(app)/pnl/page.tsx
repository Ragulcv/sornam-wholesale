import Link from "next/link";
import { getPnl } from "@/lib/queries/pnl";
import { PageHeader, Card } from "@/components/ui";
import { fmtMoney, fmtWeight } from "@/lib/format";

export const dynamic = "force-dynamic";

const cell = "border border-line2 px-2 py-1.5 text-[12px] whitespace-nowrap";
const hc = "border border-[#17527a] bg-[#1c5f8b] px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-white";
const numCell = `${cell} num text-right`;

function money(n: number, colour = false) {
  const cls = !colour ? "" : n > 0.005 ? "text-pos font-semibold" : n < -0.005 ? "text-neg font-semibold" : "";
  return <span className={cls}>{fmtMoney(n)}</span>;
}

export default async function PnlPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const pnl = await getPnl({ from: sp.from, to: sp.to });
  const t = pnl.totals;

  const tiles = [
    { label: "Avg buy rate /g", value: t.avgBuyRate ? fmtMoney(t.avgBuyRate) : "—" },
    { label: "Avg sell rate /g", value: t.avgSellRate ? fmtMoney(t.avgSellRate) : "—" },
    { label: "Margin /g", value: t.avgBuyRate && t.avgSellRate ? fmtMoney(t.avgSellRate - t.avgBuyRate) : "—", colour: t.avgSellRate - t.avgBuyRate },
    { label: "Gross profit", value: fmtMoney(t.grossProfit), colour: t.grossProfit },
    { label: "Expenses", value: fmtMoney(t.expenses) },
    { label: "Net profit", value: fmtMoney(t.netProfit), colour: t.netProfit },
  ];

  return (
    <>
      <PageHeader
        title="Profit & Loss"
        subtitle={`${pnl.days.length} trading day(s) · sold ${fmtWeight(t.sellWeight)} · bought ${fmtWeight(t.buyWeight)}`}
      />

      <Card className="mb-4 p-4">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-mute">From<input type="date" name="from" defaultValue={sp.from} className="mt-1 block rounded-md border border-line bg-cream px-2 py-1.5 text-sm" /></label>
          <label className="text-xs text-mute">To<input type="date" name="to" defaultValue={sp.to} className="mt-1 block rounded-md border border-line bg-cream px-2 py-1.5 text-sm" /></label>
          <button className="gold-grad rounded-md px-4 py-1.5 text-sm font-bold text-onyx">Go</button>
          <Link href="/pnl" className="rounded-md border border-line px-3 py-1.5 text-sm text-mid hover:bg-cream">Reset</Link>
        </form>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((x) => (
          <Card key={x.label} className="p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-mute">{x.label}</div>
            <div className={`mt-1 num text-[15px] font-bold ${x.colour == null ? "text-ink" : x.colour > 0.005 ? "text-pos" : x.colour < -0.005 ? "text-neg" : "text-ink"}`}>
              {x.value}
            </div>
          </Card>
        ))}
      </div>

      {(pnl.bestDay || pnl.worstDay) && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs text-mid">
          {pnl.bestDay && <span className="rounded-lg border border-[#cde9d8] bg-[#eaf6ef] px-3 py-1.5">Best day {pnl.bestDay.date}: {fmtMoney(pnl.bestDay.netProfit)}</span>}
          {pnl.worstDay && pnl.worstDay.date !== pnl.bestDay?.date && <span className="rounded-lg border border-[#f1c9c4] bg-[#fdf0ee] px-3 py-1.5">Worst day {pnl.worstDay.date}: {fmtMoney(pnl.worstDay.netProfit)}</span>}
          <span className="rounded-lg border border-line bg-pearl px-3 py-1.5">Stock cost carried: {pnl.closingCostRate ? `${fmtMoney(pnl.closingCostRate)}/g` : "—"}</span>
        </div>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr>
              {["Date", "Bills", "Buy wt", "Buy value", "Avg buy /g", "Sell wt", "Sell value", "Avg sell /g", "Cost /g", "Cost of sales", "Gross P/L", "Expenses", "Net P/L"].map((h) => (
                <th key={h} className={hc}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pnl.days.length === 0 && (
              <tr><td className={`${cell} py-8 text-center text-mute`} colSpan={13}>No transactions in this range.</td></tr>
            )}
            {pnl.days.map((d) => (
              <tr key={d.date} className="hover:bg-cream">
                <td className={cell}>{new Date(d.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}</td>
                <td className={numCell}>{d.bills}</td>
                <td className={numCell}>{d.buyWeight ? fmtWeight(d.buyWeight) : ""}</td>
                <td className={numCell}>{d.buyAmount ? fmtMoney(d.buyAmount) : ""}</td>
                <td className={numCell}>{d.avgBuyRate ? fmtMoney(d.avgBuyRate) : ""}</td>
                <td className={numCell}>{d.sellWeight ? fmtWeight(d.sellWeight) : ""}</td>
                <td className={numCell}>{d.sellAmount ? fmtMoney(d.sellAmount) : ""}</td>
                <td className={numCell}>{d.avgSellRate ? fmtMoney(d.avgSellRate) : ""}</td>
                <td className={numCell}>{d.costRate ? fmtMoney(d.costRate) : ""}</td>
                <td className={numCell}>{d.costOfSales ? fmtMoney(d.costOfSales) : ""}</td>
                <td className={numCell}>{money(d.grossProfit, true)}</td>
                <td className={numCell}>{d.expenses ? fmtMoney(d.expenses) : ""}</td>
                <td className={numCell}>{money(d.netProfit, true)}</td>
              </tr>
            ))}
            <tr className="bg-cream font-semibold">
              <td className={cell}>Total</td>
              <td className={numCell}>{t.bills}</td>
              <td className={numCell}>{fmtWeight(t.buyWeight)}</td>
              <td className={numCell}>{fmtMoney(t.buyAmount)}</td>
              <td className={numCell}>{t.avgBuyRate ? fmtMoney(t.avgBuyRate) : ""}</td>
              <td className={numCell}>{fmtWeight(t.sellWeight)}</td>
              <td className={numCell}>{fmtMoney(t.sellAmount)}</td>
              <td className={numCell}>{t.avgSellRate ? fmtMoney(t.avgSellRate) : ""}</td>
              <td className={numCell}></td>
              <td className={numCell}>{fmtMoney(t.costOfSales)}</td>
              <td className={numCell}>{money(t.grossProfit, true)}</td>
              <td className={numCell}>{fmtMoney(t.expenses)}</td>
              <td className={numCell}>{money(t.netProfit, true)}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <p className="mt-3 text-xs text-mute">
        Profit is costed on a running weighted average: each day&apos;s purchases roll into the cost per gram, and that day&apos;s sales are
        costed at it. Expenses come off the gross, so Net P/L is what the day actually made.
      </p>
    </>
  );
}
