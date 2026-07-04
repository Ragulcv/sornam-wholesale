import Link from "next/link";
import { notFound } from "next/navigation";
import { getCollection, getBooking } from "@/lib/queries";
import { getSettings } from "@/lib/auth";
import {
  billNo,
  fmtDate,
  fmtMoney,
  fmtRate,
  fmtWeight,
  unitLabel,
} from "@/lib/format";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

const HSN: Record<"gold" | "silver", string> = {
  gold: "7108",
  silver: "7106",
};

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <span className="text-[13px] text-mid">{label}</span>
      <span className={`num text-[14px] ${strong ? "text-ink" : "text-ink"} ${strong ? "font-bold" : ""}`}>
        {value}
      </span>
    </div>
  );
}

export default async function SlipPage({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) {
  const { collectionId } = await params;
  const c = await getCollection(collectionId);
  if (!c) notFound();
  const [bookingData, settings] = await Promise.all([
    getBooking(c.bookingId),
    getSettings(),
  ]);
  const pending = bookingData?.booking.weightPendingG ?? 0;

  const isGst = c.slipType === "gst";
  const taxPercent = parseFloat(settings.taxPercent ?? "3") || 0;
  const halfPercent = taxPercent / 2;
  const taxable = c.amount;
  const cgst = isGst ? Math.round(taxable * halfPercent) / 100 : 0;
  const sgst = isGst ? Math.round(taxable * halfPercent) / 100 : 0;
  const total = isGst ? Math.round((taxable + cgst + sgst) * 100) / 100 : c.amount;

  return (
    <div className="mx-auto max-w-md">
      {/* Controls — not printed */}
      <div className="no-print mb-4 flex items-center justify-between">
        <Link
          href={`/bookings/${c.bookingId}`}
          className="text-sm text-mute hover:text-ink"
        >
          ← Back to booking
        </Link>
        <PrintButton />
      </div>

      {/* The slip */}
      <div className="print-slip mx-auto rounded-2xl border border-line bg-pearl p-6">
        {/* No logo, no header text — kept intentionally minimal & confidential */}
        <div className="mb-3 flex items-baseline justify-between border-b border-line pb-3">
          <span className="text-xs uppercase tracking-widest text-mute">
            {isGst ? "Tax Invoice" : "Receipt"}
          </span>
          <span className="num text-sm font-bold text-ink">
            {billNo(c.billNumber)}
          </span>
        </div>

        <Row label="Date" value={fmtDate(c.createdAt)} />
        <Row label="Customer" value={c.customerName} />
        {c.customerPhone && <Row label="Phone" value={c.customerPhone} />}
        {isGst && c.customerGstin && (
          <Row label="Customer GSTIN" value={c.customerGstin} />
        )}

        <div className="my-2 border-t border-dashed border-line" />

        <Row
          label="Item"
          value={`${c.metal === "gold" ? "Gold" : "Silver"} ${c.purity}`}
        />
        {isGst && <Row label="HSN" value={HSN[c.metal]} />}
        <Row label="Weight" value={fmtWeight(c.weightCollectedG)} />
        <Row
          label="Rate"
          value={`${fmtRate(c.rateApplied)} ${unitLabel(c.rateUnit)}`}
        />

        <div className="my-2 border-t border-dashed border-line" />

        {isGst ? (
          <>
            <Row label="Taxable value" value={fmtMoney(taxable)} />
            <Row label={`CGST @ ${halfPercent}%`} value={fmtMoney(cgst)} />
            <Row label={`SGST @ ${halfPercent}%`} value={fmtMoney(sgst)} />
          </>
        ) : null}

        <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
          <span className="text-sm font-semibold text-ink">Total</span>
          <span className="num text-lg font-bold text-ink">
            {fmtMoney(total)}
          </span>
        </div>
        <div className="mt-1 text-right text-[11px] uppercase tracking-wide text-mute">
          Paid via {c.paymentMode === "upi" ? "UPI" : c.paymentMode}
        </div>

        <div className="mt-3 border-t border-dashed border-line pt-2 text-[12px] text-mid">
          <div className="flex justify-between">
            <span>Booking weight</span>
            <span className="num">{fmtWeight(c.bookingWeightG)}</span>
          </div>
          <div className="flex justify-between">
            <span>Still pending</span>
            <span className="num">{fmtWeight(pending)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
