import Link from "next/link";
import { listCollections } from "@/lib/queries";
import {
  fmtMoney,
  fmtWeight,
  fmtDateTime,
  billNo,
  PAYMENT_MODES,
  paymentModeLabel,
  type PaymentMode,
} from "@/lib/format";
import {
  Card,
  EmptyState,
  MetalBadge,
  ModeBadge,
  PageHeader,
  StatTile,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const activeMode = (PAYMENT_MODES as readonly string[]).includes(mode ?? "")
    ? (mode as PaymentMode)
    : undefined;

  const all = await listCollections();
  const rows = activeMode
    ? all.filter((c) => c.paymentMode === activeMode)
    : all;

  const totals = PAYMENT_MODES.map((m) => ({
    mode: m,
    amount: all
      .filter((c) => c.paymentMode === m)
      .reduce((a, c) => a + c.amount, 0),
  }));
  const grand = all.reduce((a, c) => a + c.amount, 0);
  const bankCount = all.filter((c) => c.paymentMode === "bank").length;

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Every collection, in one place."
        action={
          bankCount > 0 ? (
            <a
              href="/api/export/bank"
              className="flex items-center gap-2 rounded-xl border border-line bg-pearl px-4 py-2.5 text-sm font-semibold text-ink hover:bg-cream"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" strokeLinecap="round" />
              </svg>
              Download bank (CSV)
            </a>
          ) : undefined
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="All" value={fmtMoney(grand)} accent />
        {totals.map((t) => (
          <StatTile
            key={t.mode}
            label={paymentModeLabel[t.mode]}
            value={fmtMoney(t.amount)}
          />
        ))}
      </div>

      <div className="mb-4 mt-5 flex gap-1.5">
        <Link
          href="/transactions"
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            !activeMode ? "bg-onyx text-gold-hi" : "bg-cream text-mid hover:bg-line2"
          }`}
        >
          All
        </Link>
        {PAYMENT_MODES.map((m) => (
          <Link
            key={m}
            href={`/transactions?mode=${m}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              activeMode === m
                ? "bg-onyx text-gold-hi"
                : "bg-cream text-mid hover:bg-line2"
            }`}
          >
            {paymentModeLabel[m]}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No transactions yet"
          hint="Collections you record show up here with running totals per payment mode."
        />
      ) : (
        <Card className="divide-y divide-line2">
          {rows.map((c) => (
            <Link
              key={c.id}
              href={`/slip/${c.id}`}
              className="flex items-center gap-3 px-4 py-3 transition hover:bg-cream"
            >
              <div className="num w-14 text-xs font-semibold text-gold-deep">
                {billNo(c.billNumber)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">
                  {c.customerName}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-mute">
                  <MetalBadge metal={c.metal} />
                  <span>· {fmtWeight(c.weightCollectedG)}</span>
                  <span>· {fmtDateTime(c.createdAt)}</span>
                  {c.slipType === "gst" && (
                    <span className="rounded bg-[#eef4ff] px-1 text-[10px] font-semibold text-info">
                      GST
                    </span>
                  )}
                </div>
              </div>
              <ModeBadge mode={c.paymentMode} />
              <div className="num w-28 text-right text-ink">
                {fmtMoney(c.amount)}
              </div>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
