import Link from "next/link";
import { listHistory } from "@/lib/queries/history";
import { getOpeningBalance } from "@/lib/queries/historyBalances";
import { listPartyOptions } from "@/lib/queries/parties";
import { getPosition } from "@/lib/queries/bookings";
import { getFullPnl } from "@/lib/queries/pnl";
import { PageHeader, Card } from "@/components/ui";
import { fmtMoney, fmtWeight } from "@/lib/format";
import HistoryGrid from "@/components/HistoryGrid";
import HistoryTypeFilter from "@/components/HistoryTypeFilter";

export const dynamic = "force-dynamic";

const TYPES = ["sales", "purchase", "expense"] as const;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; type?: string | string[]; q?: string }>;
}) {
  const sp = await searchParams;
  const typeParam = sp.type ? (Array.isArray(sp.type) ? sp.type : [sp.type]) : [];
  const trnTypes = TYPES.filter((t) => typeParam.includes(t)) as ("sales" | "purchase" | "expense")[];
  const [rows, parties, opening, position, pnl] = await Promise.all([
    listHistory({ from: sp.from, to: sp.to, trnTypes, search: sp.q }),
    listPartyOptions(),
    getOpeningBalance(sp.from),
    getPosition(),
    getFullPnl({ from: sp.from, to: sp.to }),
  ]);
  const totalValue = rows.reduce((a, r) => a + r.value, 0);

  // Money moved in the visible range, so cash and bank line up on screen.
  const money = rows.reduce(
    (a, r) => ({
      cashIn: a.cashIn + r.cashRecd,
      cashOut: a.cashOut + r.cashPaid,
      bankIn: a.bankIn + r.bankRecd,
      bankOut: a.bankOut + r.bankPaid,
    }),
    { cashIn: 0, cashOut: 0, bankIn: 0, bankOut: 0 },
  );

  const t = position.totals;
  const p = position.position;
  const bookingTally = [
    { label: "Booking SELL pending", value: fmtWeight(t.readySellPending + t.forwardSellPending + t.unfixedSellWeight) },
    { label: "Booking BUY pending", value: fmtWeight(t.readyBuyPending + t.forwardBuyPending + t.unfixedBuyWeight) },
    { label: "Book exposure", value: `${p.bookLots.toFixed(3)} lots` },
    { label: "MCX position", value: `${p.mcxLots.toFixed(3)} lots` },
    { label: "Net (must be 0)", value: `${p.netLots.toFixed(3)} lots`, bad: !p.hedged },
  ];

  const moneyTally = [
    { label: "Cash in", value: fmtMoney(money.cashIn) },
    { label: "Cash out", value: fmtMoney(money.cashOut) },
    { label: "Cash net", value: fmtMoney(money.cashIn - money.cashOut), colour: money.cashIn - money.cashOut },
    { label: "Bank in", value: fmtMoney(money.bankIn) },
    { label: "Bank out", value: fmtMoney(money.bankOut) },
    { label: "Bank net", value: fmtMoney(money.bankIn - money.bankOut), colour: money.bankIn - money.bankOut },
  ];

  const pnlTally = [
    { label: "Avg buy /g", value: pnl.physical.totals.avgBuyRate ? fmtMoney(pnl.physical.totals.avgBuyRate) : "—" },
    { label: "Avg sell /g", value: pnl.physical.totals.avgSellRate ? fmtMoney(pnl.physical.totals.avgSellRate) : "—" },
    { label: "Physical P/L", value: fmtMoney(pnl.totals.physicalGross), colour: pnl.totals.physicalGross },
    { label: "MCX P/L", value: fmtMoney(pnl.totals.mcx), colour: pnl.totals.mcx },
    { label: "Expenses", value: fmtMoney(pnl.totals.expenses) },
    { label: "Net P/L", value: fmtMoney(pnl.totals.net), colour: pnl.totals.net },
  ];

  const exportUrl =
    "/api/export/transactions?" +
    new URLSearchParams({ ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}), ...(sp.q ? { q: sp.q } : {}) }).toString() +
    trnTypes.map((t) => `&type=${t}`).join("");

  return (
    <>
      <PageHeader
        title="Transaction History"
        subtitle={`${rows.length} entries · value ${fmtMoney(totalValue)} · tick rows to bill or delete`}
        action={<a href={exportUrl} className="rounded-xl border border-line bg-pearl px-4 py-2.5 text-sm font-semibold text-ink hover:bg-cream">Export CSV</a>}
      />

      <TallyBand title="Bookings" items={bookingTally} />
      <TallyBand title="Cash & bank in this range" items={moneyTally} />
      <TallyBand title="Profit & loss in this range" items={pnlTally} link={{ href: "/pnl", label: "Full P&L" }} />

      <Card className="mb-4 p-4">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-mute">From<input type="date" name="from" defaultValue={sp.from} className="mt-1 block rounded-md border border-line bg-cream px-2 py-1.5 text-sm" /></label>
          <label className="text-xs text-mute">To<input type="date" name="to" defaultValue={sp.to} className="mt-1 block rounded-md border border-line bg-cream px-2 py-1.5 text-sm" /></label>
          <div className="text-xs text-mute">Type
            <HistoryTypeFilter selected={trnTypes} />
          </div>
          <label className="text-xs text-mute">Party
            <input name="q" defaultValue={sp.q} list="party-suggest" autoComplete="off" placeholder="type to suggest" className="mt-1 block rounded-md border border-line bg-cream px-2 py-1.5 text-sm" />
            <datalist id="party-suggest">{parties.map((p) => <option key={p.id} value={p.name} />)}</datalist>
          </label>
          <button className="gold-grad rounded-md px-4 py-1.5 text-sm font-bold text-onyx">Go</button>
          <Link href="/history" className="rounded-md border border-line px-3 py-1.5 text-sm text-mid hover:bg-cream">Reset</Link>
        </form>
        <p className="mt-2 text-xs text-mute">
          Tip: search a party, tick their deliveries, then <b>Create bill</b> to club them into one slip. Pure / Cash / Bank Bal are running
          balances, so the last row is the closing position.
        </p>
      </Card>

      <HistoryGrid rows={rows} opening={opening} />
    </>
  );
}

function TallyBand({
  title, items, link,
}: {
  title: string;
  items: { label: string; value: string; colour?: number; bad?: boolean }[];
  link?: { href: string; label: string };
}) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-mute">{title}</span>
        {link && <Link href={link.href} className="text-[11px] text-info hover:underline">{link.label}</Link>}
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <div
            key={i.label}
            className={`min-w-[120px] flex-1 rounded-lg border px-3 py-1.5 ${i.bad ? "border-[#f1c9c4] bg-[#fdf0ee]" : "border-line bg-pearl"}`}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-mute">{i.label}</div>
            <div
              className={`num text-[14px] font-bold ${
                i.bad ? "text-neg" : i.colour == null ? "text-ink" : i.colour > 0.005 ? "text-pos" : i.colour < -0.005 ? "text-neg" : "text-ink"
              }`}
            >
              {i.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
