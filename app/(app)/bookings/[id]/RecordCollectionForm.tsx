"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { recordCollectionAction, type ActionState } from "@/app/actions";
import { Card } from "@/components/ui";
import {
  calcAmount,
  fmtMoney,
  paymentModeLabel,
  unitLabel,
  PAYMENT_MODES,
  type PaymentMode,
  type RateUnit,
} from "@/lib/format";

const fieldCls =
  "w-full rounded-xl border border-line bg-cream px-4 py-3 text-[15px] outline-none focus:border-gold focus:ring-2 focus:ring-[rgba(201,162,39,.25)]";

export default function RecordCollectionForm({
  bookingId,
  pendingWeightG,
  rateMode,
  defaultRate,
  rateUnit,
}: {
  bookingId: string;
  pendingWeightG: number;
  rateMode: "locked" | "float";
  defaultRate: number | null;
  rateUnit: RateUnit;
}) {
  const router = useRouter();
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    recordCollectionAction,
    {},
  );

  const [weight, setWeight] = useState(String(pendingWeightG));
  const [rate, setRate] = useState(defaultRate != null ? String(defaultRate) : "");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [slip, setSlip] = useState<"plain" | "gst">("plain");

  useEffect(() => {
    if (state?.ok && state.collectionId) {
      router.push(`/slip/${state.collectionId}`);
    }
  }, [state, router]);

  const w = parseFloat(weight) || 0;
  const r = parseFloat(rate) || 0;
  const amount = calcAmount(w, r, rateUnit);
  const over = w > pendingWeightG + 1e-6;

  return (
    <form action={dispatch}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="paymentMode" value={mode} />
      <input type="hidden" name="slipType" value={slip} />

      <Card className="flex flex-col gap-5 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mute">
              Weight collected (g)
            </span>
            <input
              name="weight"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className={`${fieldCls} num text-lg`}
            />
            <span className="mt-1 block text-xs text-mute">
              Pending: {pendingWeightG.toFixed(3)} g
            </span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mute">
              Rate {unitLabel(rateUnit)}
              {rateMode === "locked" && (
                <span className="ml-1 font-normal text-gold-deep">(locked)</span>
              )}
            </span>
            <input
              name="rate"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className={`${fieldCls} num text-lg`}
              placeholder="Today's rate"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mute">
              Payment mode
            </span>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-xl border px-2 py-2.5 text-sm font-semibold transition ${
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
              Slip type
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
                  className={`rounded-xl border px-2 py-2.5 text-sm font-semibold transition ${
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

        <div className="flex items-center justify-between rounded-xl bg-onyx px-4 py-3">
          <span className="text-sm text-[#b8b2a4]">Amount</span>
          <span className="num text-xl text-gold-hi">{fmtMoney(amount)}</span>
        </div>

        {over && (
          <p className="rounded-lg bg-[#fff6e6] px-3 py-2 text-sm text-gold-deep">
            Heads up: collecting more than the pending {pendingWeightG.toFixed(3)} g.
          </p>
        )}
        {state?.error && (
          <p className="rounded-lg bg-[#fdecea] px-3 py-2 text-sm text-neg">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="gold-grad h-14 rounded-xl text-base font-bold text-onyx disabled:opacity-50"
        >
          {pending ? "Saving…" : "Record & print slip"}
        </button>
      </Card>
    </form>
  );
}
