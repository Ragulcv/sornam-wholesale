"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader, Card } from "@/components/ui";

// ---- types (mirror the price-feed payloads) ----
type Metal = "gold" | "silver";
type Sym = "XAU" | "XAG";

interface Current {
  spot: {
    gold_usd: { price: number };
    silver_usd: { price: number };
    usd_inr: { price: number };
  };
  gold: { per_gram: number; per_10g: number };
  silver: { per_gram: number; per_kg: number };
  basis: {
    gold: { duty_pct: number; gst_pct: number; market_premium_pct: number; effective_pct: number };
    silver: { duty_pct: number; gst_pct: number; market_premium_pct: number; effective_pct: number };
  };
  updatedAt: string;
}
interface HistRow {
  price_inr_per_oz: number;
  fetched_at: string;
  inr_per_gram_intl: number;
  inr_per_gram_india: number;
}

// ---- formatting ----
const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const rup = (n: number, dp = 0) => `₹${(dp === 2 ? inr2 : inr0).format(n)}`;
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

// datetime-local <-> UTC helpers
const pad = (n: number) => String(n).padStart(2, "0");
function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// Local "YYYY-MM-DDTHH:MM" -> UTC "YYYY-MM-DDTHH:MM:SSZ" (no ms, matches stored shape).
function toUtcBound(local: string): string {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

const SYM: Record<Metal, Sym> = { gold: "XAU", silver: "XAG" };
const WEIGHTS: Record<Metal, { label: string; g: number }[]> = {
  gold: [
    { label: "1 g", g: 1 },
    { label: "8 g · sovereign", g: 8 },
    { label: "10 g", g: 10 },
    { label: "100 g", g: 100 },
  ],
  silver: [
    { label: "1 g", g: 1 },
    { label: "10 g", g: 10 },
    { label: "100 g", g: 100 },
    { label: "1 kg", g: 1000 },
  ],
};

// =====================================================================
// Inline SVG line chart (no external chart lib — matches the app style).
// =====================================================================
function PriceChart({
  rows,
  metal,
}: {
  rows: HistRow[];
  metal: Metal;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement | null>(null);

  const W = 760, H = 300, padL = 64, padR = 16, padT = 16, padB = 28;
  const accent = metal === "gold" ? "#C9A227" : "#8a94a3";
  const unitScale = metal === "gold" ? 10 : 1000;
  const unitLabel = metal === "gold" ? "per 10 g" : "per kg";

  const pts = useMemo(
    () => rows.map((r) => ({ t: new Date(r.fetched_at).getTime(), perGram: r.inr_per_gram_india, iso: r.fetched_at })),
    [rows]
  );

  const { min, max } = useMemo(() => {
    if (!pts.length) return { min: 0, max: 1 };
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) {
      const v = p.perGram * unitScale;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.08;
    return { min: lo - pad, max: hi + pad };
  }, [pts, unitScale]);

  const n = pts.length;
  const xOf = (i: number) => (n <= 1 ? padL + (W - padL - padR) / 2 : padL + (i / (n - 1)) * (W - padL - padR));
  const yOf = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(p.perGram * unitScale).toFixed(1)}`).join(" ");
  const area =
    n > 0
      ? `M${xOf(0).toFixed(1)},${(H - padB).toFixed(1)} ` +
        pts.map((p, i) => `L${xOf(i).toFixed(1)},${yOf(p.perGram * unitScale).toFixed(1)}`).join(" ") +
        ` L${xOf(n - 1).toFixed(1)},${(H - padB).toFixed(1)} Z`
      : "";

  // y-axis ticks (4)
  const yTicks = Array.from({ length: 4 }, (_, k) => min + ((max - min) * k) / 3);
  // x-axis labels (up to 5)
  const xTickIdx = n <= 1 ? [0] : Array.from({ length: Math.min(5, n) }, (_, k) => Math.round((k / (Math.min(5, n) - 1)) * (n - 1)));

  const onMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!ref.current || n === 0) return;
      const rect = ref.current.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width; // 0..1 over element
      const plotL = padL / W, plotR = 1 - padR / W;
      const f = Math.max(0, Math.min(1, (fx - plotL) / (plotR - plotL)));
      setHover(Math.round(f * (n - 1)));
    },
    [n]
  );

  if (!n) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed border-line text-sm text-mute">
        No price points in this range yet — the feed logs one every 30s, so history fills as it runs.
      </div>
    );
  }

  const hv = hover != null ? pts[hover] : null;

  return (
    <div className="relative w-full">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        style={{ height: "auto" }}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="mcxfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.20" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* y gridlines + labels */}
        {yTicks.map((v, k) => (
          <g key={k}>
            <line x1={padL} y1={yOf(v)} x2={W - padR} y2={yOf(v)} stroke="#ece6d8" strokeWidth={1} />
            <text x={padL - 8} y={yOf(v) + 3} textAnchor="end" fontSize={11} fill="#8a8478">
              {rup(Math.round(v))}
            </text>
          </g>
        ))}
        {/* x labels */}
        {xTickIdx.map((i) => (
          <text key={i} x={xOf(i)} y={H - 8} textAnchor="middle" fontSize={10.5} fill="#8a8478">
            {new Date(pts[i].t).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </text>
        ))}
        <path d={area} fill="url(#mcxfill)" />
        <path d={path} fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* hover guide */}
        {hv && (
          <g>
            <line x1={xOf(hover!)} y1={padT} x2={xOf(hover!)} y2={H - padB} stroke={accent} strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={xOf(hover!)} cy={yOf(hv.perGram * unitScale)} r={4} fill={accent} stroke="#fff" strokeWidth={1.5} />
          </g>
        )}
      </svg>

      {hv && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border border-line bg-pearl px-3 py-2 text-xs shadow-lg"
          style={{
            left: `min(max(${(xOf(hover!) / W) * 100}%, 90px), calc(100% - 150px))`,
            transform: "translateX(-50%)",
          }}
        >
          <div className="mb-1 font-semibold text-ink">{timeLabel(hv.iso)}</div>
          <div className="mb-1 num text-sm font-bold" style={{ color: accent === "#C9A227" ? "#8a6d10" : "#5a6472" }}>
            {rup(Math.round(hv.perGram * unitScale))} <span className="text-[10px] font-normal text-mute">{unitLabel}</span>
          </div>
          {WEIGHTS[metal].map((w) => (
            <div key={w.label} className="flex justify-between gap-3 text-[11px] text-mid">
              <span>{w.label}</span>
              <span className="num font-medium text-ink">{rup(Math.round(hv.perGram * w.g))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Main tracker
// =====================================================================
export default function McxPriceTracker({ initialCurrent }: { initialCurrent: Current | null }) {
  const [current, setCurrent] = useState<Current | null>(initialCurrent);
  const [feedDown, setFeedDown] = useState(false);

  // ---- live board: poll /api/mcx/current every 30s ----
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/mcx/current", { cache: "no-store" });
        if (!alive) return;
        if (r.ok) { setCurrent(await r.json()); setFeedDown(false); }
        else setFeedDown(true);
      } catch {
        if (alive) setFeedDown(true);
      }
    };
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // ---- history chart controls ----
  const now = useMemo(() => new Date(), []);
  const dayAgo = useMemo(() => new Date(Date.now() - 24 * 3600 * 1000), []);
  const [metal, setMetal] = useState<Metal>("gold");
  const [from, setFrom] = useState(toLocalInput(dayAgo));
  const [to, setTo] = useState(toLocalInput(now));
  const [rows, setRows] = useState<HistRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ symbol: SYM[metal], from: toUtcBound(from), to: toUtcBound(to) });
      const r = await fetch(`/api/mcx/history?${qs.toString()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`feed responded ${r.status}`);
      const data = await r.json();
      setRows(data.rows || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load history");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [metal, from, to]);

  // load on mount + whenever metal changes
  useEffect(() => { loadHistory(); /* eslint-disable-next-line */ }, [metal]);

  // ---- point-in-time lookup ----
  const [atTime, setAtTime] = useState(toLocalInput(now));
  const [lookup, setLookup] = useState<{ row: HistRow; metal: Metal; asked: string } | null>(null);
  const [lookupErr, setLookupErr] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const doLookup = useCallback(async () => {
    setLookupLoading(true);
    setLookupErr(null);
    setLookup(null);
    try {
      const target = new Date(atTime);
      if (Number.isNaN(target.getTime())) throw new Error("pick a valid date & time");
      // Ask for a window ending at the chosen instant; take the most recent
      // tick at or before it — that's the price "as of" that time.
      const winStart = new Date(target.getTime() - 3 * 24 * 3600 * 1000);
      const qs = new URLSearchParams({
        symbol: SYM[metal],
        from: toUtcBound(toLocalInput(winStart)),
        to: target.toISOString().replace(/\.\d{3}Z$/, "Z"),
      });
      const r = await fetch(`/api/mcx/history?${qs.toString()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`feed responded ${r.status}`);
      const data = await r.json();
      const list: HistRow[] = data.rows || [];
      if (!list.length) throw new Error("no price recorded at/before that time yet");
      setLookup({ row: list[list.length - 1], metal, asked: atTime });
    } catch (e) {
      setLookupErr(e instanceof Error ? e.message : "lookup failed");
    } finally {
      setLookupLoading(false);
    }
  }, [atTime, metal]);

  const g = current?.gold, s = current?.silver;

  return (
    <>
      <PageHeader title="MCX Price Tracker" subtitle="Live gold & silver in INR, calibrated to the IBJA benchmark. Pick any date & time to see the per-gram rate then." />

      {feedDown && (
        <div className="mb-4 rounded-lg bg-[#fdecea] px-3 py-2 text-sm font-medium text-neg">
          Price feed is unreachable right now — showing the last value received.
        </div>
      )}

      {/* ---- Live board ---- */}
      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-serif text-lg font-semibold text-ink">Gold <span className="text-xs font-normal text-mute">999 fine</span></span>
            <span className="rounded-md bg-[#f5edd2] px-2 py-0.5 text-[11px] font-semibold text-[#8a6d10]">LIVE</span>
          </div>
          <div className="num text-3xl font-bold text-ink">{g ? rup(g.per_gram) : "—"}<span className="ml-1 text-sm font-normal text-mute">/g</span></div>
          <div className="num mt-0.5 text-sm text-mid">{g ? rup(g.per_10g) : "—"} <span className="text-xs text-mute">/ 10 g</span></div>
          {current && (
            <div className="mt-2 text-[11px] text-mute">
              Intl spot ${current.spot.gold_usd.price} · USD/INR {current.spot.usd_inr.price} · +{current.basis.gold.effective_pct}% India
            </div>
          )}
        </Card>
        <Card className="p-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-serif text-lg font-semibold text-ink">Silver <span className="text-xs font-normal text-mute">999 fine</span></span>
            <span className="rounded-md bg-[#eef0f2] px-2 py-0.5 text-[11px] font-semibold text-[#5a6472]">LIVE</span>
          </div>
          <div className="num text-3xl font-bold text-ink">{s ? rup(s.per_gram, 2) : "—"}<span className="ml-1 text-sm font-normal text-mute">/g</span></div>
          <div className="num mt-0.5 text-sm text-mid">{s ? rup(s.per_kg) : "—"} <span className="text-xs text-mute">/ kg</span></div>
          {current && (
            <div className="mt-2 text-[11px] text-mute">
              Intl spot ${current.spot.silver_usd.price} · USD/INR {current.spot.usd_inr.price} · +{current.basis.silver.effective_pct}% India
            </div>
          )}
        </Card>
      </div>
      {current && (
        <div className="mb-6 -mt-3 text-[11px] text-mute">
          Updated {timeLabel(current.updatedAt)} · duty {current.basis.gold.duty_pct}% + GST {current.basis.gold.gst_pct}% + market premium (gold {current.basis.gold.market_premium_pct}%, silver {current.basis.silver.market_premium_pct}%)
        </div>
      )}

      {/* ---- Point-in-time lookup ---- */}
      <Card className="mb-6 p-4">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-mute">Price at a specific date &amp; time</div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-mute">Metal
            <select value={metal} onChange={(e) => setMetal(e.target.value as Metal)} className="mt-1 block rounded-md border border-line bg-cream px-2 py-1.5 text-sm">
              <option value="gold">Gold</option>
              <option value="silver">Silver</option>
            </select>
          </label>
          <label className="text-xs text-mute">Date &amp; time
            <input type="datetime-local" value={atTime} max={toLocalInput(now)} onChange={(e) => setAtTime(e.target.value)} className="mt-1 block rounded-md border border-line bg-cream px-2 py-1.5 text-sm" />
          </label>
          <button onClick={doLookup} disabled={lookupLoading} className="rounded-lg bg-onyx px-4 py-2 text-sm font-semibold text-gold-hi disabled:opacity-50">
            {lookupLoading ? "Looking up…" : "Get price"}
          </button>
        </div>
        {lookupErr && <div className="mt-3 text-sm text-neg">{lookupErr}</div>}
        {lookup && (
          <div className="mt-4 rounded-xl border border-line bg-pearl p-4">
            <div className="text-xs text-mute">
              {lookup.metal === "gold" ? "Gold" : "Silver"} rate as of {new Date(lookup.asked).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              <span className="text-mute"> · nearest recorded tick {timeLabel(lookup.row.fetched_at)}</span>
            </div>
            <div className="num mt-1 text-2xl font-bold text-ink">
              {rup(lookup.row.inr_per_gram_india, 2)} <span className="text-sm font-normal text-mute">per gram</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
              {WEIGHTS[lookup.metal].map((w) => (
                <div key={w.label} className="flex justify-between gap-2 border-b border-line2 py-1 text-xs">
                  <span className="text-mid">{w.label}</span>
                  <span className="num font-semibold text-ink">{rup(Math.round(lookup.row.inr_per_gram_india * w.g))}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ---- History chart ---- */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="mr-auto text-[11px] font-semibold uppercase tracking-wider text-mute">
            {metal === "gold" ? "Gold" : "Silver"} rate history
          </div>
          <label className="text-xs text-mute">From
            <input type="datetime-local" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-md border border-line bg-cream px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-mute">To
            <input type="datetime-local" value={to} min={from} max={toLocalInput(now)} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-md border border-line bg-cream px-2 py-1.5 text-sm" />
          </label>
          <button onClick={loadHistory} disabled={loading} className="rounded-lg border border-line bg-cream px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
            {loading ? "Loading…" : "Apply"}
          </button>
          <span className="text-xs text-mute">{error ? `Error: ${error}` : `${rows.length} point${rows.length === 1 ? "" : "s"}`}</span>
        </div>
        <PriceChart rows={rows} metal={metal} />
      </Card>
    </>
  );
}
