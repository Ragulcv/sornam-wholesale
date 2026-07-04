"use client";

import { useState } from "react";
import { fmtRate } from "@/lib/format";
import { Card } from "@/components/ui";

export default function LivePriceStrip({
  initialGold,
  initialSilver,
  initialAt,
}: {
  initialGold: number | null;
  initialSilver: number | null;
  initialAt: string | null;
}) {
  const [gold, setGold] = useState(initialGold);
  const [silver, setSilver] = useState(initialSilver);
  const [note, setNote] = useState(initialAt);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/price/current", { cache: "no-store" });
      const d = await r.json();
      if (d.ok) {
        if (d.gold != null) setGold(d.gold);
        if (d.silver != null) setSilver(d.silver);
        setNote(d.sourceTime ?? "just now");
        setLive(true);
      }
    } catch {
      /* keep last-known values */
    } finally {
      setLoading(false);
    }
  }

  // No auto-fetch — the endpoint is only hit when the user clicks refresh
  // (or the "Use current price" button in a booking).
  if (gold == null && silver == null) return null;

  return (
    <Card className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-mute">
        <span
          className={`h-2 w-2 rounded-full ${
            live ? "bg-pos" : "bg-mute"
          } ${loading ? "animate-pulse" : ""}`}
        />
        Live price
      </span>
      {gold != null && (
        <span className="text-sm text-ink">
          Gold <span className="num font-semibold">{fmtRate(gold)}</span>
          <span className="text-xs text-mute"> /10g</span>
        </span>
      )}
      {silver != null && (
        <span className="text-sm text-ink">
          Silver <span className="num font-semibold">{fmtRate(silver)}</span>
          <span className="text-xs text-mute"> /kg</span>
        </span>
      )}
      <button
        onClick={refresh}
        disabled={loading}
        className="ml-auto text-xs text-mute hover:text-ink disabled:opacity-50"
      >
        {note ? `updated ${note}` : "refresh"} ↻
      </button>
    </Card>
  );
}
