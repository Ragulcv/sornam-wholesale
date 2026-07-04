import Link from "next/link";
import { notFound } from "next/navigation";
import { getBooking } from "@/lib/queries";
import {
  fmtDate,
  fmtMoney,
  fmtRate,
  fmtWeight,
  unitLabel,
} from "@/lib/format";
import PrintOnLoad from "@/components/PrintOnLoad";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <span className="text-[13px] text-mid">{label}</span>
      <span className="num text-[14px] text-ink">{value}</span>
    </div>
  );
}

export default async function BookingPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getBooking(id);
  if (!data) notFound();
  const b = data.booking;

  return (
    <div className="mx-auto max-w-md p-4">
      <PrintOnLoad />
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/bookings/${id}`} className="text-sm text-mute hover:text-ink">
          ← Back
        </Link>
        <span className="text-xs text-mute">Printing…</span>
      </div>

      <div className="print-slip mx-auto rounded-2xl border border-line bg-pearl p-6">
        <div className="mb-3 flex items-baseline justify-between border-b border-line pb-3">
          <span className="text-xs uppercase tracking-widest text-mute">Booking</span>
          <span className="num text-sm text-ink">{fmtDate(b.createdAt)}</span>
        </div>

        <Row label="Customer" value={b.customerName} />
        {b.customerPhone && <Row label="Phone" value={b.customerPhone} />}

        <div className="my-2 border-t border-dashed border-line" />

        <Row label="Item" value={`${b.metal === "gold" ? "Gold" : "Silver"} ${b.purity}`} />
        <Row label="Weight booked" value={fmtWeight(b.weightBookedG)} />
        <Row
          label="Rate"
          value={
            b.rateMode === "locked" && b.lockedRate != null
              ? `${fmtRate(b.lockedRate)} ${unitLabel(b.rateUnit)}`
              : "Market on collection"
          }
        />
        {b.advanceAmount > 0 && (
          <Row label="Advance" value={fmtMoney(b.advanceAmount)} />
        )}

        <div className="my-2 border-t border-dashed border-line" />

        <Row label="Collected" value={fmtWeight(b.weightCollectedG)} />
        <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
          <span className="text-sm font-semibold text-ink">Pending</span>
          <span className="num text-lg font-bold text-ink">
            {fmtWeight(b.weightPendingG)}
          </span>
        </div>
      </div>
    </div>
  );
}
