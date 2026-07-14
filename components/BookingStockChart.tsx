import { Card } from "@/components/ui";
import { fmtWeight, metalLabel } from "@/lib/format";
import { round3 } from "@/lib/bullion";

function Donut({ metal, available, booked }: { metal: string; available: number; booked: number }) {
  const shortfall = round3(Math.max(0, booked - available));
  const free = round3(Math.max(0, available - booked));
  // Booked slice as a % of the larger of (available, booked) so an over-booking
  // reads as a fully-booked ring.
  const denom = Math.max(available, booked, 0.0001);
  const bookedPct = Math.min(100, (booked / denom) * 100);
  const bookedColor = shortfall > 0 ? "#a23a2e" : "#C9A227";
  const freeColor = "#2f7d5b";

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative h-28 w-28 flex-none rounded-full"
        style={{ background: `conic-gradient(${bookedColor} 0 ${bookedPct}%, ${freeColor} ${bookedPct}% 100%)` }}
      >
        <div className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full bg-pearl text-center">
          <span className="num text-sm font-bold text-ink">{fmtWeight(available)}</span>
          <span className="text-[9px] uppercase tracking-wide text-mute">in stock</span>
        </div>
      </div>
      <div className="text-sm">
        <div className="mb-1 font-serif text-base font-semibold text-ink">{metalLabel(metal)}</div>
        <div className="flex items-center gap-1.5 text-xs"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: bookedColor }} /> Booked <span className="num font-semibold">{fmtWeight(booked)}</span></div>
        <div className="flex items-center gap-1.5 text-xs"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: freeColor }} /> Free <span className="num font-semibold">{fmtWeight(free)}</span></div>
        {shortfall > 0 ? (
          <div className="mt-1 rounded-md bg-[#fdecea] px-2 py-1 text-[11px] font-semibold text-neg">
            Short by {fmtWeight(shortfall)} — add this much {metalLabel(metal).toLowerCase()} to cover all bookings.
          </div>
        ) : (
          <div className="mt-1 text-[11px] text-pos">Enough stock for all bookings.</div>
        )}
      </div>
    </div>
  );
}

export default function BookingStockChart({
  gold,
  silver,
}: {
  gold: { available: number; booked: number };
  silver: { available: number; booked: number };
}) {
  return (
    <Card className="mb-5 p-4">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-mute">Stock vs booked</div>
      <div className="flex flex-wrap gap-8">
        <Donut metal="gold" available={gold.available} booked={gold.booked} />
        {(silver.booked > 0 || silver.available > 0) && <Donut metal="silver" available={silver.available} booked={silver.booked} />}
      </div>
    </Card>
  );
}
