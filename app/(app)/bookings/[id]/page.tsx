import Link from "next/link";
import { notFound } from "next/navigation";
import { getBooking } from "@/lib/queries";
import {
  fmtMoney,
  fmtWeight,
  fmtRate,
  fmtDateTime,
  unitLabel,
} from "@/lib/format";
import {
  Card,
  MetalBadge,
  ModeBadge,
  PageHeader,
  StatTile,
  StatusBadge,
} from "@/components/ui";
import { billNo } from "@/lib/format";
import RecordCollectionForm from "./RecordCollectionForm";

export const dynamic = "force-dynamic";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getBooking(id);
  if (!data) notFound();
  const { booking: b, collections } = data;

  return (
    <>
      <div className="mb-4">
        <Link href="/bookings" className="text-sm text-mute hover:text-ink">
          ← Bookings
        </Link>
      </div>
      <PageHeader
        title={b.customerName}
        subtitle={b.customerPhone ?? undefined}
        action={<StatusBadge status={b.status} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Booked" value={fmtWeight(b.weightBookedG)} />
        <StatTile label="Collected" value={fmtWeight(b.weightCollectedG)} />
        <StatTile label="Pending" value={fmtWeight(b.weightPendingG)} accent />
        <StatTile
          label="Advance"
          value={fmtMoney(b.advanceAmount)}
        />
      </div>

      <Card className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
        <div className="flex items-center gap-2">
          <MetalBadge metal={b.metal} />
          <span className="text-mute">· {b.purity}</span>
        </div>
        <div className="text-mute">
          {b.rateMode === "locked" && b.lockedRate != null ? (
            <>
              Locked rate:{" "}
              <span className="num text-ink">
                {fmtRate(b.lockedRate)} {unitLabel(b.rateUnit)}
              </span>
            </>
          ) : (
            "Rate: market on collection"
          )}
        </div>
        <div className="text-mute">Booked {fmtDateTime(b.createdAt)}</div>
        {b.notes && <div className="text-mute">Note: {b.notes}</div>}
      </Card>

      {/* Record collection */}
      {b.weightPendingG > 0 ? (
        <>
          <h2 className="mb-3 mt-8 font-serif text-xl font-semibold text-ink">
            Record a collection
          </h2>
          <RecordCollectionForm
            bookingId={b.id}
            pendingWeightG={b.weightPendingG}
            rateMode={b.rateMode}
            defaultRate={b.lockedRate}
            rateUnit={b.rateUnit}
          />
        </>
      ) : (
        <Card className="mt-8 bg-[#eaf6ef] p-4 text-center text-sm font-medium text-pos">
          Fully collected — this booking is complete.
        </Card>
      )}

      {/* History */}
      <h2 className="mb-3 mt-8 font-serif text-xl font-semibold text-ink">
        Collection history
      </h2>
      {collections.length === 0 ? (
        <Card className="p-6 text-center text-sm text-mute">
          No collections recorded yet.
        </Card>
      ) : (
        <Card className="divide-y divide-line2">
          {collections.map((c) => (
            <Link
              key={c.id}
              href={`/slip/${c.id}`}
              className="flex items-center gap-3 px-4 py-3 transition hover:bg-cream"
            >
              <div className="num w-16 text-xs font-semibold text-gold-deep">
                {billNo(c.billNumber)}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <div className="num text-ink">{fmtWeight(c.weightCollectedG)}</div>
                <div className="text-xs text-mute">
                  {fmtRate(c.rateApplied)} {unitLabel(b.rateUnit)} ·{" "}
                  {fmtDateTime(c.createdAt)}
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
