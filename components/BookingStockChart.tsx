import { Card } from "@/components/ui";
import { fmtWeight, metalLabel } from "@/lib/format";
import { round3 } from "@/lib/bullion";

function Bar({ metal, available, booked }: { metal: string; available: number; booked: number }) {
  const shortfall = round3(Math.max(0, booked - available));
  const free = round3(Math.max(0, available - booked));
  const total = Math.max(available, booked, 0.0001);
  const bookedPct = Math.min(100, (booked / total) * 100);
  const bookedColor = shortfall > 0 ? "#a23a2e" : "#C9A227";

  return (
    <div className="min-w-[280px] flex-1">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="font-serif text-base font-semibold text-ink">{metalLabel(metal)}</span>
        <span className="text-xs text-mute">
          In stock <span className="num font-semibold text-ink">{fmtWeight(available)}</span>
        </span>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#e9e3d4]">
        <div style={{ width: `${bookedPct}%`, background: bookedColor }} />
        <div style={{ width: `${100 - bookedPct}%`, background: "#2f7d5b" }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: bookedColor }} />
          Booked <span className="num font-semibold text-ink">{fmtWeight(booked)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#2f7d5b]" />
          Free <span className="num font-semibold text-ink">{fmtWeight(free)}</span>
        </span>
      </div>
      {shortfall > 0 ? (
        <div className="mt-2 inline-block rounded-md bg-[#fdecea] px-2 py-1 text-[11px] font-semibold text-neg">
          Short by {fmtWeight(shortfall)} — add this much {metalLabel(metal).toLowerCase()} to cover all bookings.
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-pos">Enough stock for all bookings.</div>
      )}
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
      <div className="flex flex-wrap gap-x-10 gap-y-5">
        <Bar metal="gold" available={gold.available} booked={gold.booked} />
        {(silver.booked > 0 || silver.available > 0) && <Bar metal="silver" available={silver.available} booked={silver.booked} />}
      </div>
    </Card>
  );
}
