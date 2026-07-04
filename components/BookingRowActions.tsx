"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  recordCollectionAction,
  deleteBookingAction,
  type ActionState,
} from "@/app/actions";
import {
  calcAmount,
  fmtMoney,
  fmtRate,
  paymentModeLabel,
  unitLabel,
  PAYMENT_MODES,
  type PaymentMode,
  type RateUnit,
} from "@/lib/format";

export interface QuickBooking {
  id: string;
  metal: "gold" | "silver";
  rateMode: "locked" | "float";
  lockedRate: number | null;
  rateUnit: RateUnit;
  weightPendingG: number;
  status: "open" | "partial" | "completed";
}

const fieldCls =
  "w-full rounded-xl border border-line bg-cream px-4 py-3 text-[15px] outline-none focus:border-gold focus:ring-2 focus:ring-[rgba(201,162,39,.25)]";

export default function BookingRowActions({ booking }: { booking: QuickBooking }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    recordCollectionAction,
    {},
  );

  const [fill, setFill] = useState<"full" | "partial">("full");
  const [weight, setWeight] = useState(String(booking.weightPendingG));
  const [rate, setRate] = useState(
    booking.lockedRate != null ? String(booking.lockedRate) : "",
  );
  const [unit, setUnit] = useState<RateUnit>(booking.rateUnit);
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [slip, setSlip] = useState<"plain" | "gst">("plain");
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [liveNote, setLiveNote] = useState<string | null>(null);

  async function useCurrentPrice() {
    setFetchingPrice(true);
    setLiveNote(null);
    try {
      const r = await fetch("/api/price/current");
      const d = await r.json();
      const val = booking.metal === "gold" ? d.gold : d.silver;
      if (d.ok && val != null) {
        setRate(String(val));
        setUnit(booking.metal === "gold" ? "per_10g" : "per_kg");
        setLiveNote(`Live · ${fmtRate(val)} ${booking.metal === "gold" ? "/10g" : "/kg"}`);
      } else {
        setLiveNote("Live price unavailable.");
      }
    } catch {
      setLiveNote("Live price unavailable.");
    } finally {
      setFetchingPrice(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    await deleteBookingAction(booking.id);
    router.refresh();
  }

  useEffect(() => {
    if (fill === "full") setWeight(String(booking.weightPendingG));
  }, [fill, booking.weightPendingG]);

  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  const w = parseFloat(weight) || 0;
  const r = parseFloat(rate) || 0;
  const amount = calcAmount(w, r, unit);
  const done = booking.status === "completed" || booking.weightPendingG <= 0;

  return (
    <div className="flex items-center gap-1">
      {/* Print slip */}
      <a
        href={`/bookings/${booking.id}/print`}
        target="_blank"
        rel="noopener noreferrer"
        title="Print booking slip"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-pearl text-mid transition hover:bg-cream hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2" />
          <rect x="6" y="14" width="12" height="7" rx="1" />
        </svg>
      </a>

      {/* Complete / collect */}
      {!done && (
        <button
          onClick={() => setOpen(true)}
          title="Mark collected"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#cde9d8] bg-[#eaf6ef] text-pos transition hover:bg-[#dcefe4]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Delete */}
      {confirmDel ? (
        <div className="flex items-center gap-1">
          <button
            onClick={doDelete}
            disabled={deleting}
            title="Confirm delete"
            className="flex h-9 items-center rounded-lg border border-[#f1c9c4] bg-[#fdecea] px-2 text-xs font-bold text-neg disabled:opacity-50"
          >
            {deleting ? "…" : "Delete"}
          </button>
          <button
            onClick={() => setConfirmDel(false)}
            title="Cancel"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-pearl text-mid hover:bg-cream"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmDel(true)}
          title="Delete booking"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-pearl text-mute transition hover:border-[#f1c9c4] hover:bg-[#fdecea] hover:text-neg"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 11v6M14 11v6" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-pearl p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 font-serif text-xl font-semibold text-ink">
              Record collection
            </h3>

            <form action={dispatch} className="flex flex-col gap-4">
              <input type="hidden" name="bookingId" value={booking.id} />
              <input type="hidden" name="weight" value={weight} />
              <input type="hidden" name="rate" value={rate} />
              <input type="hidden" name="rateUnit" value={unit} />
              <input type="hidden" name="paymentMode" value={mode} />
              <input type="hidden" name="slipType" value={slip} />

              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["full", "Full lot"],
                    ["partial", "Partial"],
                  ] as const
                ).map(([val, lab]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setFill(val)}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                      fill === val
                        ? "border-gold bg-[rgba(201,162,39,.1)] text-gold-deep"
                        : "border-line bg-cream text-mid"
                    }`}
                  >
                    {lab}
                  </button>
                ))}
              </div>

              {fill === "partial" && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mute">
                    Weight collected (g) · pending {booking.weightPendingG.toFixed(3)}
                  </span>
                  <input
                    inputMode="decimal"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className={`${fieldCls} num`}
                  />
                </label>
              )}

              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mute">
                  Rate {unitLabel(unit)}
                  {booking.rateMode === "locked" && (
                    <span className="ml-1 font-normal text-gold-deep">(locked)</span>
                  )}
                </span>
                <div className="flex gap-2">
                  <input
                    inputMode="decimal"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className={`${fieldCls} num flex-1`}
                    placeholder={`Rate ${unitLabel(unit)}`}
                  />
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as RateUnit)}
                    className="rounded-xl border border-line bg-cream px-2 text-sm"
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
                  {liveNote && <span className="text-xs text-mute">{liveNote}</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mute">
                    Payment
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENT_MODES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={`rounded-lg border px-2 py-2 text-sm font-semibold transition ${
                          mode === m
                            ? "border-gold bg-[rgba(201,162,39,.1)] text-gold-deep"
                            : "border-line bg-cream text-mid"
                        }`}
                      >
                        {paymentModeLabel[m]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mute">
                    Slip
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["plain", "Plain"],
                        ["gst", "GST"],
                      ] as const
                    ).map(([val, lab]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setSlip(val)}
                        className={`rounded-lg border px-2 py-2 text-sm font-semibold transition ${
                          slip === val
                            ? "border-gold bg-[rgba(201,162,39,.1)] text-gold-deep"
                            : "border-line bg-cream text-mid"
                        }`}
                      >
                        {lab}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-onyx px-4 py-2.5">
                <span className="text-sm text-[#b8b2a4]">Amount</span>
                <span className="num text-lg text-gold-hi">{fmtMoney(amount)}</span>
              </div>

              {state?.error && (
                <p className="rounded-lg bg-[#fdecea] px-3 py-2 text-sm text-neg">
                  {state.error}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl border border-line px-4 py-3 text-sm font-semibold text-mid hover:bg-cream"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="gold-grad flex-1 rounded-xl px-4 py-3 text-sm font-bold text-onyx disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Confirm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
