"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createBookingAction, type ActionState } from "@/app/actions";
import { Card } from "@/components/ui";
import { fmtRate, unitLabel, type RateUnit } from "@/lib/format";

const PURITIES: Record<"gold" | "silver", string[]> = {
  gold: ["995", "999", "916 (22K)", "750 (18K)"],
  silver: ["999", "990", "925"],
};

const fieldCls =
  "w-full rounded-xl border border-line bg-cream px-4 py-3 text-[15px] outline-none focus:border-gold focus:ring-2 focus:ring-[rgba(201,162,39,.25)]";

export default function NewBookingForm({
  currentGold,
  currentSilver,
  priceUpdatedAt,
}: {
  currentGold: number | null;
  currentSilver: number | null;
  priceUpdatedAt: string | null;
}) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    createBookingAction,
    {},
  );

  const [metal, setMetal] = useState<"gold" | "silver">("gold");
  const [purity, setPurity] = useState("995");
  const [customPurity, setCustomPurity] = useState("");
  const [rateMode, setRateMode] = useState<"locked" | "float">("locked");
  const [rateUnit, setRateUnit] = useState<RateUnit>("per_10g");
  const [rate, setRate] = useState("");
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [liveNote, setLiveNote] = useState<string | null>(null);

  const currentPrice = metal === "gold" ? currentGold : currentSilver;
  const effectivePurity = customPurity.trim() || purity;

  function switchMetal(m: "gold" | "silver") {
    setMetal(m);
    setPurity(m === "gold" ? "995" : "999");
    setCustomPurity("");
    setRateUnit(m === "gold" ? "per_10g" : "per_kg");
    setLiveNote(null);
  }

  async function useCurrentPrice() {
    setFetchingPrice(true);
    setLiveNote(null);
    try {
      const r = await fetch("/api/price/current");
      const d = await r.json();
      const val = metal === "gold" ? d.gold : d.silver;
      if (d.ok && val != null) {
        setRate(String(val));
        setRateUnit(metal === "gold" ? "per_10g" : "per_kg");
        setLiveNote(
          `Live · ${fmtRate(val)} ${metal === "gold" ? "/10g" : "/kg"}${
            d.sourceTime ? ` · ${d.sourceTime}` : ""
          }`,
        );
      } else {
        setLiveNote("Live price unavailable — enter manually.");
      }
    } catch {
      setLiveNote("Live price unavailable — enter manually.");
    } finally {
      setFetchingPrice(false);
    }
  }

  if (state?.ok) {
    return (
      <Card className="mx-auto max-w-lg p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#eaf6ef] text-pos">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="font-serif text-2xl font-semibold text-ink">Booking saved</h2>
        <p className="mt-1 text-sm text-mute">Send the confirmation and you&apos;re done.</p>
        <div className="mt-5 flex flex-col gap-2">
          {state.whatsappUrl ? (
            <a
              href={state.whatsappUrl as string}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 font-bold text-white"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.5A10 10 0 1 0 12 2zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2s-1.2.2-3.9-.9-4.3-3.9-4.4-4.1-1.1-1.5-1.1-2.8.7-2 .9-2.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.5c-.2.2-.3.3-.1.6s.7 1.2 1.5 1.9c1 .9 1.8 1.2 2 1.3s.4.1.5-.1l.7-.9c.2-.2.3-.2.6-.1l1.9.9c.3.1.5.2.5.4s.1.7 0 .9z" />
              </svg>
              Send WhatsApp confirmation
            </a>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <a
              href={`/bookings/${state.bookingId}/print`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-line bg-pearl px-4 py-3 font-semibold text-ink hover:bg-cream"
            >
              Print
            </a>
            <Link
              href={`/bookings/${state.bookingId}`}
              className="flex items-center justify-center rounded-xl border border-line bg-pearl px-4 py-3 font-semibold text-ink hover:bg-cream"
            >
              View
            </Link>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="gold-grad rounded-xl px-4 py-3 font-bold text-onyx"
          >
            + Another booking
          </button>
        </div>
      </Card>
    );
  }

  return (
    <form action={dispatch} className="mx-auto max-w-lg">
      <input type="hidden" name="metal" value={metal} />
      <input type="hidden" name="purity" value={effectivePurity} />
      <input type="hidden" name="rateMode" value={rateMode} />
      <input type="hidden" name="rateUnit" value={rateUnit} />

      <Card className="flex flex-col gap-5 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mute">
              Customer name
            </span>
            <input name="customerName" className={fieldCls} placeholder="e.g. Ramesh Bullion" autoFocus />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mute">
              Phone (for WhatsApp)
            </span>
            <input name="customerPhone" inputMode="tel" className={fieldCls} placeholder="10-digit mobile" />
          </label>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mute">
            Metal
          </span>
          <div className="grid grid-cols-2 gap-2">
            {(["gold", "silver"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMetal(m)}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold capitalize transition ${
                  metal === m
                    ? "border-gold bg-[rgba(201,162,39,.1)] text-gold-deep"
                    : "border-line bg-cream text-mid"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mute">
            Purity
          </span>
          <div className="flex flex-wrap gap-2">
            {PURITIES[metal].map((p) => {
              const val = p.split(" ")[0];
              const active = !customPurity.trim() && purity === val;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setPurity(val);
                    setCustomPurity("");
                  }}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "border-gold bg-[rgba(201,162,39,.1)] text-gold-deep"
                      : "border-line bg-cream text-mid"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
          <input
            value={customPurity}
            onChange={(e) => setCustomPurity(e.target.value)}
            className={`${fieldCls} mt-2`}
            placeholder="…or type custom — e.g. 91.6% or 916"
          />
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mute">
            Weight booked (grams)
          </span>
          <input name="weight" inputMode="decimal" className={`${fieldCls} num text-lg`} placeholder="0.000" />
        </label>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mute">
            Rate
          </span>
          <div className="mb-2 grid grid-cols-2 gap-2">
            {(
              [
                ["locked", "Rate locked now"],
                ["float", "Market on collection"],
              ] as const
            ).map(([val, lab]) => (
              <button
                key={val}
                type="button"
                onClick={() => setRateMode(val)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  rateMode === val
                    ? "border-gold bg-[rgba(201,162,39,.1)] text-gold-deep"
                    : "border-line bg-cream text-mid"
                }`}
              >
                {lab}
              </button>
            ))}
          </div>
          {rateMode === "locked" && (
            <>
              <div className="flex gap-2">
                <input
                  name="lockedRate"
                  inputMode="decimal"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className={`${fieldCls} num flex-1`}
                  placeholder={`Rate ${unitLabel(rateUnit)}`}
                />
                <select
                  value={rateUnit}
                  onChange={(e) => setRateUnit(e.target.value as RateUnit)}
                  className="rounded-xl border border-line bg-cream px-3 text-sm"
                >
                  <option value="per_10g">/10g</option>
                  <option value="per_kg">/kg</option>
                  <option value="per_g">/g</option>
                </select>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={useCurrentPrice}
                  disabled={fetchingPrice}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-[rgba(201,162,39,.08)] px-3 py-1.5 text-xs font-semibold text-gold-deep disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {fetchingPrice ? "Fetching…" : "Use current price"}
                </button>
                {liveNote ? (
                  <span className="text-xs text-mute">{liveNote}</span>
                ) : currentPrice != null ? (
                  <span className="text-xs text-mute">
                    last {fmtRate(currentPrice)} {metal === "gold" ? "/10g" : "/kg"}
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mute">
              Advance received (₹, optional)
            </span>
            <input name="advance" inputMode="decimal" className={`${fieldCls} num`} placeholder="0" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mute">
              Note (optional)
            </span>
            <input name="notes" className={fieldCls} placeholder="e.g. deliver Fri" />
          </label>
        </div>

        {state?.error && (
          <p className="rounded-lg bg-[#fdecea] px-3 py-2 text-sm text-neg">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="gold-grad h-14 rounded-xl text-base font-bold text-onyx shadow-[0_10px_24px_-10px_rgba(201,162,39,.6)] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save booking"}
        </button>
      </Card>
    </form>
  );
}
