import Link from "next/link";
import { dashboard } from "@/lib/queries";
import { fmtMoney, fmtWeight, fmtDateTime } from "@/lib/format";
import {
  Card,
  EmptyState,
  MetalBadge,
  ModeBadge,
  PageHeader,
  StatTile,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const d = await dashboard();

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={new Date().toLocaleDateString("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
        action={
          <Link
            href="/new"
            className="gold-grad rounded-xl px-4 py-2.5 text-sm font-bold text-onyx shadow-[0_10px_24px_-10px_rgba(201,162,39,.6)]"
          >
            + New booking
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Collected today"
          value={fmtMoney(d.todayTotal)}
          accent
        />
        {d.today.map((t) => (
          <StatTile
            key={t.mode}
            label={t.mode === "upi" ? "UPI" : t.mode}
            value={fmtMoney(t.amount)}
            hint={`${t.count} bill${t.count === 1 ? "" : "s"}`}
          />
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <StatTile
          label="Open bookings"
          value={String(d.openBookings)}
          hint="awaiting collection"
        />
        <StatTile
          label="Pending weight"
          value={fmtWeight(d.pendingWeightG)}
          hint="across all open bookings"
        />
      </div>

      <h2 className="mb-3 mt-8 font-serif text-xl font-semibold text-ink">
        Today&apos;s collections
      </h2>
      {d.recentCollections.length === 0 ? (
        <EmptyState
          title="No collections yet today"
          hint="When a customer collects against a booking, it appears here and on the ledger."
          cta={{ href: "/new", label: "Create a booking" }}
        />
      ) : (
        <Card className="divide-y divide-line2">
          {d.recentCollections.map((c) => (
            <Link
              key={c.id}
              href={`/slip/${c.id}`}
              className="flex items-center gap-3 px-4 py-3 transition hover:bg-cream"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-ink">
                  {c.customerName}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-mute">
                  <MetalBadge metal={c.metal} />
                  <span>·</span>
                  <span>{fmtWeight(c.weightCollectedG)}</span>
                  <span>·</span>
                  <span>{fmtDateTime(c.createdAt)}</span>
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
