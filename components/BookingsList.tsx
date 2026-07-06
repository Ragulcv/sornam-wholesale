"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtWeight, fmtRate, unitLabel } from "@/lib/format";
import { Card, MetalBadge, StatusBadge } from "@/components/ui";
import { useSelection, Check, BulkToolbar } from "@/components/selection";
import BookingRowActions from "@/components/BookingRowActions";
import { bulkDeleteBookingsAction } from "@/app/actions";
import type { BookingRow } from "@/lib/queries";

export default function BookingsList({ bookings }: { bookings: BookingRow[] }) {
  const router = useRouter();
  const sel = useSelection();
  const ids = bookings.map((b) => b.id);

  async function onDelete(selectedIds: string[]) {
    await bulkDeleteBookingsAction(selectedIds);
    router.refresh();
    return `Deleted ${selectedIds.length}`;
  }

  return (
    <>
      <BulkToolbar ids={ids} selection={sel} onDelete={onDelete} />
      <Card className="divide-y divide-line2">
        {bookings.map((b) => (
          <div
            key={b.id}
            className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-cream"
          >
            <Check checked={sel.isSelected(b.id)} onChange={() => sel.toggle(b.id)} />
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
    </>
  );
}
