"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtWeight } from "@/lib/format";
import { Card } from "@/components/ui";
import { useSelection, Check, BulkToolbar } from "@/components/selection";
import CustomerRowActions from "@/components/CustomerRowActions";
import { bulkDeleteCustomersAction } from "@/app/actions";

interface Row {
  id: string;
  name: string;
  phone: string | null;
  gstin: string | null;
  notes: string | null;
  bookingCount: number;
  pendingWeightG: number;
}

export default function CustomersList({ customers }: { customers: Row[] }) {
  const router = useRouter();
  const sel = useSelection();
  const ids = customers.map((c) => c.id);

  async function onDelete(selectedIds: string[]) {
    const r = await bulkDeleteCustomersAction(selectedIds);
    router.refresh();
    return r.skipped > 0
      ? `Deleted ${r.deleted} · ${r.skipped} kept (have bookings)`
      : `Deleted ${r.deleted}`;
  }

  return (
    <div className="mt-4">
      <BulkToolbar ids={ids} selection={sel} onDelete={onDelete} />
      <Card className="divide-y divide-line2">
        {customers.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-cream"
          >
            <Check checked={sel.isSelected(c.id)} onChange={() => sel.toggle(c.id)} />
            <Link
              href={`/bookings?customer=${c.id}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cream font-serif text-sm font-bold text-gold-deep">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-ink">{c.name}</div>
                <div className="text-xs text-mute">
                  {c.phone ?? "no phone"}
                  {c.gstin ? ` · GSTIN ${c.gstin}` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="num text-sm text-ink">
                  {fmtWeight(c.pendingWeightG)}
                </div>
                <div className="text-[11px] text-mute">
                  pending · {c.bookingCount} booking
                  {c.bookingCount === 1 ? "" : "s"}
                </div>
              </div>
            </Link>
            <CustomerRowActions
              customer={{
                id: c.id,
                name: c.name,
                phone: c.phone,
                gstin: c.gstin,
                notes: c.notes,
              }}
            />
          </div>
        ))}
      </Card>
    </div>
  );
}
