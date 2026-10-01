import Link from "next/link";
import { getFullPnl } from "@/lib/queries/pnl";
import { PageHeader, Card } from "@/components/ui";
import { fmtMoney, fmtWeight } from "@/lib/format";
import { SHOP_TZ, todayKey } from "@/lib/dates";

export const dynamic = "force-dynamic";

const cell = "border border-line2 px-2 py-1.5 text-[12px] whitespace-nowrap";
const hc = "border border-[#17527a] bg-[#1c5f8b] px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-white";
const hcMcx = "border border-[#5a3f8a] bg-[#6b4ea3] px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-white";
const hcNet = "border border-[#1f5c1f] bg-[#2f7a3a] px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-white";
const numCell = `${cell} num text-right`;
const tone = (n: number) => (n > 0.005 ? "text-pos" : n < -0.005 ? "text-neg" : "text-ink");

function money(n: number, colour = false) {
  return <span className={colour ? `${tone(n)} font-semibold` : ""}>{fmtMoney(n)}</span>;
}
const dmy = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: SHOP_TZ, day: "2-digit", month: "short", year: "2-digit" });

function Tile({ label, value, colour, sub }: { label: string; value: string; colour?: number; sub?: string }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-mute">{label}</div>
      <div className={`mt-1 num text-[15px] font-bold ${colour == null ? "text-ink" : tone(colour)}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-mute">{sub}</div>}
    </Card>
  );
}

export default async function PnlPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const pnl = await getFullPnl({ from: sp.from, to: sp.to });
  const t = pnl.physical.totals;
  const m = pnl.mcx;
  const close = m.latestClose;
  const needsClose = Math.abs(m.netLots) > 0.0005 && (!close || close.day !== todayKey());

  return (
    <>
      <PageHeader
        title="Profit & Loss"
        subtitle={`${pnl.days.length} day(s) · sold ${fmtWeight(t.sellWeight)} · bought ${fmtWeight(t.buyWeight)} · MCX open ${m.netLots > 0 ? "+" : ""}${m.netLots.toFixed(3)} lots`}
      />

      <Card className="mb-4 p-4">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-mute">From<input type="date" name="from" defaultValue={sp.from} className="mt-1 block rounded-md border border-line bg-cream px-2 py-1.5 text-sm" /></label>
          <label className="text-xs text-mute">To<input type="date" name="to" defaultValue={sp.to} className="mt-1 block rounded-md border border-line bg-cream px-2 py-1.5 text-sm" /></label>
          <button className="gold-grad rounded-md px-4 py-1.5 text-sm font-bold text-onyx">Go</button>
          <Link href="/pnl" className="rounded-md border border-line px-3 py-1.5 text-sm text-mid hover:bg-cream">Reset</Link>
        </form>
      </Card>

      {needsClose && (
        <div className="mb-3 rounded-lg border border-[#e6cf8a] bg-[#fff8e1] px-3 py-2 text-xs font-semibold text-[#8a6d10]">
          MCX lots are open but today&apos;s MCX close isn&apos;t entered{close ? `; using ${fmtMoney(close.price)} from ${dmy(close.day)}` : ", so open MCX lots are not valued yet"}.{" "}
          <Link href="/bookings" className="underline">Enter it under Bookings → MCX TRADES</Link>.
        </div>
      )}
      {(m.unpricedOpenLots > 0 || m.unpricedMatchedLots > 0) && (
        <div className="mb-3 rounded-lg border border-[#e6cf8a] bg-[#fff8e1] px-3 py-2 text-xs font-semibold text-[#8a6d10]">
          Some MCX lots have no trade price, so their profit isn&apos;t counted. Add the price under Bookings → MCX TRADES.
        </div>
      )}

      {/* 1. physical */}
      <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#1c5f8b]">Physical (sales &amp; purchase entries)</h2>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Avg buy rate /g" value={t.avgBuyRate ? fmtMoney(t.avgBuyRate) : "—"} />
        <Tile label="Avg sell rate /g" value={t.avgSellRate ? fmtMoney(t.avgSellRate) : "—"} />
        <Tile label="Margin /g" value={t.avgBuyRate && t.avgSellRate ? fmtMoney(t.avgSellRate - t.avgBuyRate) : "—"} colour={t.avgSellRate - t.avgBuyRate} />
        <Tile label="Physical profit" value={fmtMoney(t.grossProfit)} colour={t.grossProfit} sub="sales value − cost of the gold sold" />
      </div>

      {/* 2. MCX */}
      <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#6b4ea3]">MCX hedge</h2>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile label="MCX booked" value={fmtMoney(m.realised)} colour={m.realised} sub="trades squared off" />
        <Tile label="MCX open" value={fmtMoney(m.open)} colour={m.open} sub={close ? `open lots at close ${fmtMoney(close.price)} (${dmy(close.day)})` : "no MCX close entered"} />
        <Tile label="MCX profit" value={fmtMoney(m.total)} colour={m.total} sub="booked + open" />
      </div>

      {/* 3. bottom line */}
      <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#2f7a3a]">Bottom line</h2>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Physical profit" value={fmtMoney(pnl.totals.physicalGross)} colour={pnl.totals.physicalGross} />
        <Tile label="+ MCX profit" value={fmtMoney(pnl.totals.mcx)} colour={pnl.totals.mcx} />
        <Tile label="− Expenses" value={fmtMoney(pnl.totals.expenses)} />
        <Tile label="= Net profit" value={fmtMoney(pnl.totals.net)} colour={pnl.totals.net} />
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[1200px] border-collapse">
          <thead>
            <tr>
              <th className={hc}>Date</th>
              {["Buy wt", "Avg buy /g", "Sell wt", "Avg sell /g", "Cost /g", "Physical P/L"].map((h) => <th key={h} className={hc}>{h}</th>)}
              {["MCX close", "MCX booked", "MCX P/L"].map((h) => <th key={h} className={hcMcx}>{h}</th>)}
              {["Expenses", "Net P/L"].map((h) => <th key={h} className={hcNet}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {pnl.days.length === 0 && (
              <tr><td className={`${cell} py-8 text-center text-mute`} colSpan={12}>No transactions or MCX trades in this range.</td></tr>
            )}
            {pnl.days.map((d) => (
              <tr key={d.date} className="hover:bg-cream">
                <td className={cell}>{dmy(d.date)}</td>
                <td className={numCell}>{d.buyWeight ? fmtWeight(d.buyWeight) : ""}</td>
                <td className={numCell}>{d.avgBuyRate ? fmtMoney(d.avgBuyRate) : ""}</td>
                <td className={numCell}>{d.sellWeight ? fmtWeight(d.sellWeight) : ""}</td>
                <td className={numCell}>{d.avgSellRate ? fmtMoney(d.avgSellRate) : ""}</td>
                <td className={numCell}>{d.costRate ? fmtMoney(d.costRate) : ""}</td>
                <td className={numCell}>{d.sellWeight || d.grossProfit ? money(d.grossProfit, true) : ""}</td>
                <td className={numCell}>{d.mcxClose != null ? <span className={d.mcxCloseCarried ? "text-mute" : ""} title={d.mcxCloseCarried ? "no close entered this day; previous close reused" : ""}>{fmtMoney(d.mcxClose)}{d.mcxCloseCarried ? "*" : ""}</span> : ""}</td>
                <td className={numCell}>{d.mcxRealised ? money(d.mcxRealised, true) : ""}</td>
                <td className={numCell}>{d.mcxPnl ? money(d.mcxPnl, true) : ""}</td>
                <td className={numCell}>{d.expenses ? fmtMoney(d.expenses) : ""}</td>
                <td className={`${numCell} font-semibold`}>{money(d.total, true)}</td>
              </tr>
            ))}
            <tr className="bg-cream font-semibold">
              <td className={cell}>Total</td>
              <td className={numCell}>{fmtWeight(t.buyWeight)}</td>
              <td className={numCell}>{t.avgBuyRate ? fmtMoney(t.avgBuyRate) : ""}</td>
              <td className={numCell}>{fmtWeight(t.sellWeight)}</td>
              <td className={numCell}>{t.avgSellRate ? fmtMoney(t.avgSellRate) : ""}</td>
              <td className={numCell}></td>
              <td className={numCell}>{money(t.grossProfit, true)}</td>
              <td className={numCell}></td>
              <td className={numCell}>{money(m.realised, true)}</td>
              <td className={numCell}>{money(m.total, true)}</td>
              <td className={numCell}>{fmtMoney(t.expenses)}</td>
              <td className={numCell}>{money(pnl.totals.net, true)}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <p className="mt-3 text-xs text-mute">
        Physical profit is costed on a running weighted average: each day&apos;s purchases roll into the cost per gram, and that day&apos;s
        sales are costed at it. MCX P/L for a day is what was booked that day plus the change in value of the open lots at that day&apos;s
        close (* = no close entered, previous one reused), so the days add up to the total. Net = physical + MCX − expenses.
      </p>
    </>
  );
}
