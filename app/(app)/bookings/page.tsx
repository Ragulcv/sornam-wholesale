import Link from "next/link";
import { listBookings } from "@/lib/queries";
import { fmtWeight, fmtRate, unitLabel } from "@/lib/format";
import {
  Card,
  EmptyState,
  MetalBadge,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import BookingRowActions from "@/components/BookingRowActions";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "", label: "All" },
  { key: "open", label: "Open" },
  { key: "partial", label: "Partial" },
  { key: "completed", label: "Completed" },
];

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; customer?: string }>;
}) {
  const { status, customer } = await searchParams;
  const filter =
    status === "open" || status === "partial" || status === "completed"
      ? status
      : undefined;
  const rows = await listBookings({
    ...(filter ? { status: filter } : {}),
    ...(customer ? { customerId: customer } : {}),
  });

  return (
    <>
      <PageHeader
        title="Bookings"
        action={
          <Link
            href="/new"
            className="gold-grad rounded-xl px-4 py-2.5 text-sm font-bold text-onyx"
          >
            + New booking
          </Link>
        }
      />

      <div className="mb-4 flex gap-1.5">
        {TABS.map((t) => {
          const active = (t.key || undefined) === filter;
          return (
            <Link
              key={t.key}
              href={t.key ? `/bookings?status=${t.key}` : "/bookings"}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active ? "bg-onyx text-gold-hi" : "bg-cream text-mid hover:bg-line2"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No bookings here"
          hint="Create a booking to start tracking collections and balances."
          cta={{ href: "/new", label: "Create a booking" }}
        />
      ) : (
        <Card className="divide-y divide-line2">
          {rows.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-cream"
            >
              <Link href={`/bookings/${b.id}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-ink">
                    {b.customerName}
                  </span>
                  <StatusBadge status={b.status} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-mute">
                  <MetalBadge metal={b.metal} />
                  <span>· {b.purity}</span>
                  {b.rateMode === "locked" && b.lockedRate != null ? (
                    <span>
                      · {fmtRate(b.lockedRate)} {unitLabel(b.rateUnit)}
                    </span>
                  ) : (
                    <span>· market rate</span>
                  )}
                </div>
              </Link>
              <Link href={`/bookings/${b.id}`} className="text-right">
                <div className="num text-sm text-ink">
                  {fmtWeight(b.weightPendingG)}
                </div>
                <div className="text-[11px] text-mute">
                  pending / {fmtWeight(b.weightBookedG)}
                </div>
              </Link>
              <BookingRowActions
                booking={{
                  id: b.id,
                  metal: b.metal,
                  rateMode: b.rateMode,
                  lockedRate: b.lockedRate,
                  rateUnit: b.rateUnit,
                  weightPendingG: b.weightPendingG,
                  status: b.status,
                }}
              />
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
