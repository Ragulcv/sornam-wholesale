"use client";

import { useActionState } from "react";
import { updateStockAction, type ActionState } from "@/app/actions";

const inp = "w-full rounded-md border border-line bg-cream px-3 py-2 text-sm outline-none focus:border-gold num";
const lbl = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-mute";

export default function StockForm({
  openingPureGold,
  openingPureSilver,
  openingCash,
  openingBank,
}: {
  openingPureGold: number;
  openingPureSilver: number;
  openingCash: number;
  openingBank: number;
}) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(updateStockAction, {});
  return (
    <form action={dispatch}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div><span className={lbl}>Gold pure (g)</span><input name="openingPureGold" inputMode="decimal" defaultValue={openingPureGold} className={inp} /></div>
        <div><span className={lbl}>Silver pure (g)</span><input name="openingPureSilver" inputMode="decimal" defaultValue={openingPureSilver} className={inp} /></div>
        <div><span className={lbl}>Cash (₹)</span><input name="openingCash" inputMode="decimal" defaultValue={openingCash} className={inp} /></div>
        <div><span className={lbl}>Bank (₹)</span><input name="openingBank" inputMode="decimal" defaultValue={openingBank} className={inp} /></div>
      </div>
      {state?.ok && <p className="mt-3 rounded-lg bg-[#eaf6ef] px-3 py-2 text-sm text-pos">Saved.</p>}
      <button type="submit" disabled={pending} className="gold-grad mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-onyx disabled:opacity-50">
        {pending ? "Saving…" : "Save opening balances"}
      </button>
    </form>
  );
}
