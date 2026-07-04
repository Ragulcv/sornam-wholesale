"use client";

import { useState } from "react";
import Link from "next/link";
import {
  fmtMoney,
  fmtWeight,
  fmtDateTime,
  paymentModeLabel,
  PAYMENT_MODES,
  type PaymentMode,
} from "@/lib/format";
import { Card, MetalBadge, ModeBadge } from "@/components/ui";
import type { CollectionRow } from "@/lib/queries";

type Filter = "all" | PaymentMode;

export default function DashboardCollections({
  today,
  collections,
}: {
  today: { mode: PaymentMode; amount: number; count: number }[];
  collections: CollectionRow[];
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const total = today.reduce((a, t) => a + t.amount, 0);
  const rows =
    filter === "all"
      ? collections
      : collections.filter((c) => c.paymentMode === filter);

  const chip = (key: Filter, label: string, amount: number) => (
    <button
      key={key}
      onClick={() => setFilter(key)}
      className={`flex min-w-[120px] flex-1 flex-col items-start rounded-xl border px-4 py-3 text-left transition ${
        filter === key
          ? "border-gold bg-[rgba(201,162,39,.1)]"
          : "border-line bg-pearl hover:bg-cream"
      }`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-mute">
        {label}
      </span>
      <span
        className={`num mt-1 text-xl ${
          filter === key ? "gold-text" : "text-ink"
        }`}
      >
        {fmtMoney(amount)}
      </span>
    </button>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {chip("all", "All today", total)}
        {PAYMENT_MODES.map((m) =>
          chip(m, paymentModeLabel[m], today.find((t) => t.mode === m)?.amount ?? 0),
        )}
      </div>

      {rows.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-mute">
          {filter === "all"
            ? "No collections yet today."
            : `No ${paymentModeLabel[filter as PaymentMode].toLowerCase()} collections today.`}
        </Card>
      ) : (
        <Card className="divide-y divide-line2">
          {rows.map((c) => (
            <Link
              key={c.id}
              href={`/slip/${c.id}`}
              className="flex items-center gap-3 px-4 py-3 transition hover:bg-cream"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-ink">{c.customerName}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-mute">
                  <MetalBadge metal={c.metal} />
                  <span>·</span>
                  <span>{fmtWeight(c.weightCollectedG)}</span>
                  <span>·</span>
                  <span>{fmtDateTime(c.createdAt)}</span>
                </div>
              </div>
              <ModeBadge mode={c.paymentMode} />
              <div className="num w-28 text-right text-ink">{fmtMoney(c.amount)}</div>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
