import Link from "next/link";
import { dashboard } from "@/lib/queries";
import { getSettings } from "@/lib/auth";
import { fmtMoney, fmtWeight } from "@/lib/format";
import { PageHeader, StatTile } from "@/components/ui";
import DashboardCollections from "./DashboardCollections";
import LivePriceStrip from "@/components/LivePriceStrip";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const [d, s] = await Promise.all([dashboard(), getSettings()]);
  const gold = s.defaultGoldRate ? parseFloat(s.defaultGoldRate) : null;
  const silver = s.defaultSilverRate ? parseFloat(s.defaultSilverRate) : null;

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

      <LivePriceStrip
        initialGold={gold}
        initialSilver={silver}
        initialAt={
          s.priceUpdatedAt
            ? s.priceUpdatedAt.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : null
        }
      />

      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatTile label="Collected today" value={fmtMoney(d.todayTotal)} accent />
        <StatTile
          label="Open bookings"
          value={String(d.openBookings)}
          hint="awaiting collection"
        />
        <StatTile
          label="Pending weight"
          value={fmtWeight(d.pendingWeightG)}
          hint="all open bookings"
        />
      </div>

      <h2 className="mb-3 font-serif text-xl font-semibold text-ink">
        Today&apos;s collections
      </h2>
      <DashboardCollections today={d.today} collections={d.recentCollections} />
    </>
  );
}
