import Link from "next/link";
import { getStock } from "@/lib/queries/stock";
import { listHistory } from "@/lib/queries/history";
import { getSettings } from "@/lib/auth";
import { PageHeader, Card, StatTile } from "@/components/ui";
import { fmtMoney, fmtWeight, fmtDate, metalLabel } from "@/lib/format";
import LivePriceStrip from "@/components/LivePriceStrip";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [stock, todays, s] = await Promise.all([
    getStock(),
    listHistory({ from: today, to: today }),
    getSettings(),
  ]);
  const salesValue = todays.filter((t) => t.trnType === "sales").reduce((a, t) => a + t.value, 0);
  const purchaseValue = todays.filter((t) => t.trnType === "purchase").reduce((a, t) => a + t.value, 0);

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        action={<Link href="/entry" className="gold-grad rounded-xl px-4 py-2.5 text-sm font-bold text-onyx">+ New entry</Link>}
      />

      <LivePriceStrip
        initialGold={s.defaultGoldRate ? parseFloat(s.defaultGoldRate) : null}
        initialSilver={s.defaultSilverRate ? parseFloat(s.defaultSilverRate) : null}
      />

      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Gold in stock" value={fmtWeight(stock.currentPureGold)} accent />
        <StatTile label="Silver in stock" value={fmtWeight(stock.currentPureSilver)} />
        <StatTile label="Cash" value={fmtMoney(stock.currentCash)} />
        <StatTile label="Bank" value={fmtMoney(stock.currentBank)} />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3">
        <StatTile label="Sales today" value={fmtMoney(salesValue)} hint={`${todays.filter((t) => t.trnType === "sales").length} entries`} />
        <StatTile label="Purchases today" value={fmtMoney(purchaseValue)} hint={`${todays.filter((t) => t.trnType === "purchase").length} entries`} />
      </div>

      <h2 className="mb-3 font-serif text-xl font-semibold text-ink">Today&apos;s transactions</h2>
      {todays.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-mute">Nothing yet today. <Link href="/entry" className="text-gold-deep underline">Create an entry.</Link></Card>
      ) : (
        <Card className="divide-y divide-line2">
          {todays.map((t) => (
            <Link key={t.id} href={`/history/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cream">
              <span className="num w-12 text-xs font-semibold text-gold-deep">#{String(t.serialNo).padStart(4, "0")}</span>
              <span className="w-20 text-xs capitalize text-mute">{t.trnType}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{t.partyName ?? "—"}</span>
              <span className="text-xs text-mute">{metalLabel(t.metal)} · {fmtDate(t.txnDate)}</span>
              <span className="num w-28 text-right font-semibold text-ink">{fmtMoney(t.total)}</span>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
