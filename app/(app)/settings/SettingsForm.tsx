"use client";

import { useActionState } from "react";
import { updateSettingsAction, logoutAction, type ActionState } from "@/app/actions";
import { Card } from "@/components/ui";

const fieldCls =
  "w-full rounded-xl border border-line bg-cream px-4 py-3 text-[15px] outline-none focus:border-gold focus:ring-2 focus:ring-[rgba(201,162,39,.25)]";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mute";

export default function SettingsForm({
  autoLogoffMinutes,
  gstin,
  taxPercent,
  tdsPercent,
  defaultGoldRate,
  defaultSilverRate,
}: {
  autoLogoffMinutes: number;
  gstin: string;
  taxPercent: string;
  tdsPercent: string;
  defaultGoldRate: string;
  defaultSilverRate: string;
}) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    updateSettingsAction,
    {},
  );

  return (
    <div className="max-w-lg">
      <form action={dispatch}>
        <Card className="flex flex-col gap-5 p-5">
          <div>
            <span className={labelCls}>Auto-logoff (minutes idle)</span>
            <input name="autoLogoffMinutes" inputMode="numeric" defaultValue={autoLogoffMinutes} className={`${fieldCls} num`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={labelCls}>Shop GSTIN</span>
              <input name="gstin" defaultValue={gstin} className={fieldCls} placeholder="33ABCDE1234F1Z5" />
            </div>
            <div>
              <span className={labelCls}>GST / tax rate (%)</span>
              <input name="taxPercent" inputMode="decimal" defaultValue={taxPercent} className={`${fieldCls} num`} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <span className={labelCls}>TDS rate (%)</span>
              <input name="tdsPercent" inputMode="decimal" defaultValue={tdsPercent} className={`${fieldCls} num`} placeholder="0.1" />
            </div>
            <div>
              <span className={labelCls}>Gold rate /g</span>
              <input name="defaultGoldRate" inputMode="decimal" defaultValue={defaultGoldRate} className={`${fieldCls} num`} placeholder="optional" />
            </div>
            <div>
              <span className={labelCls}>Silver rate /g</span>
              <input name="defaultSilverRate" inputMode="decimal" defaultValue={defaultSilverRate} className={`${fieldCls} num`} placeholder="optional" />
            </div>
          </div>
          {state?.ok && <p className="rounded-lg bg-[#eaf6ef] px-3 py-2 text-sm text-pos">Saved.</p>}
          {state?.error && <p className="rounded-lg bg-[#fdecea] px-3 py-2 text-sm text-neg">{state.error}</p>}
          <button type="submit" disabled={pending} className="gold-grad h-12 rounded-xl font-bold text-onyx disabled:opacity-50">
            {pending ? "Saving…" : "Save settings"}
          </button>
        </Card>
      </form>

      <Card className="mt-4 flex items-center justify-between p-4">
        <div>
          <div className="text-sm font-semibold text-ink">Lock the app</div>
          <div className="text-xs text-mute">Ends this session — PIN required to return.</div>
        </div>
        <form action={logoutAction}>
          <button className="rounded-xl border border-line bg-pearl px-4 py-2.5 text-sm font-semibold text-ink hover:bg-cream">
            Lock now
          </button>
        </form>
      </Card>
    </div>
  );
}
