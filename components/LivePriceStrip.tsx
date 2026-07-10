"use client";

import { useState } from "react";
import { fmtRate } from "@/lib/format";
import { Card } from "@/components/ui";

export default function LivePriceStrip({
  initialGold,
  initialSilver,
}: {
  initialGold: number | null;
  initialSilver: number | null;
}) {
  const [gold, setGold] = useState(initialGold);
  const [silver, setSilver] = useState(initialSilver);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(false);

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
      /* keep last known */
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-mute">
        <span className={`h-2 w-2 rounded-full ${live ? "bg-pos" : "bg-mute"} ${loading ? "animate-pulse" : ""}`} />
        Live rate (MCX)
      </span>
      <span className="text-sm text-ink">Gold <span className="num font-semibold">{gold != null ? fmtRate(gold) : "—"}</span><span className="text-xs text-mute">/g</span></span>
      <span className="text-sm text-ink">Silver <span className="num font-semibold">{silver != null ? fmtRate(silver) : "—"}</span><span className="text-xs text-mute">/g</span></span>
      <button onClick={refresh} disabled={loading} className="ml-auto rounded-lg border border-line bg-pearl px-3 py-1.5 text-xs font-semibold text-mid hover:bg-cream disabled:opacity-50">
        {loading ? "Fetching…" : note ? `Updated ${note} · Refresh ↻` : "Fetch live ↻"}
      </button>
    </Card>
  );
}
