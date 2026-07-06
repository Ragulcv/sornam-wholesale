"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtMoney, fmtWeight, fmtDateTime, billNo } from "@/lib/format";
import { Card, MetalBadge, ModeBadge } from "@/components/ui";
import { useSelection, Check, BulkToolbar } from "@/components/selection";
import TransactionRowActions from "@/components/TransactionRowActions";
import { bulkDeleteCollectionsAction } from "@/app/actions";
import type { CollectionRow } from "@/lib/queries";

export default function TransactionsList({
  collections,
}: {
  collections: CollectionRow[];
}) {
  const router = useRouter();
  const sel = useSelection();
  const ids = collections.map((c) => c.id);

  async function onDelete(selectedIds: string[]) {
    await bulkDeleteCollectionsAction(selectedIds);
    router.refresh();
    return `Deleted ${selectedIds.length}`;
  }

  return (
    <>
      <BulkToolbar ids={ids} selection={sel} onDelete={onDelete} />
      <Card className="divide-y divide-line2">
        {collections.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3 px-4 py-3 transition hover:bg-cream"
          >
            <Check checked={sel.isSelected(c.id)} onChange={() => sel.toggle(c.id)} />
            <Link
              href={`/slip/${c.id}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <div className="num w-14 text-xs font-semibold text-gold-deep">
                {billNo(c.billNumber)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">
                  {c.customerName}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-mute">
                  <MetalBadge metal={c.metal} />
                  <span>· {fmtWeight(c.weightCollectedG)}</span>
                  <span>· {fmtDateTime(c.createdAt)}</span>
                  {c.slipType === "gst" && (
                    <span className="rounded bg-[#eef4ff] px-1 text-[10px] font-semibold text-info">
                      GST
                    </span>
                  )}
                </div>
              </div>
              <ModeBadge mode={c.paymentMode} />
              <div className="num w-28 text-right text-ink">
                {fmtMoney(c.amount)}
              </div>
            </Link>
            <TransactionRowActions collectionId={c.id} />
          </div>
        ))}
      </Card>
    </>
  );
}
