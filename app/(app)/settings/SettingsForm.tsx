"use client";

import { useActionState } from "react";
import {
  updateSettingsAction,
  logoutAction,
  type ActionState,
} from "@/app/actions";
import { Card } from "@/components/ui";

const fieldCls =
  "w-full rounded-xl border border-line bg-cream px-4 py-3 text-[15px] outline-none focus:border-gold focus:ring-2 focus:ring-[rgba(201,162,39,.25)]";

const labelCls =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mute";

export default function SettingsForm({
  autoLogoffMinutes,
  gstin,
  defaultGoldRate,
  defaultSilverRate,
}: {
  autoLogoffMinutes: number;
  gstin: string;
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
            <input
              name="autoLogoffMinutes"
              inputMode="numeric"
              defaultValue={autoLogoffMinutes}
              className={`${fieldCls} num`}
            />
            <p className="mt-1 text-xs text-mute">
              The screen locks itself after this many minutes of no activity.
            </p>
          </div>

          <div>
            <span className={labelCls}>Shop GSTIN (for GST slips)</span>
            <input name="gstin" defaultValue={gstin} className={fieldCls} placeholder="e.g. 33ABCDE1234F1Z5" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={labelCls}>Default gold rate /10g</span>
              <input
                name="defaultGoldRate"
                inputMode="decimal"
                defaultValue={defaultGoldRate}
                className={`${fieldCls} num`}
                placeholder="optional"
              />
            </div>
            <div>
              <span className={labelCls}>Default silver rate /kg</span>
              <input
                name="defaultSilverRate"
                inputMode="decimal"
                defaultValue={defaultSilverRate}
                className={`${fieldCls} num`}
                placeholder="optional"
              />
            </div>
          </div>

          {state?.ok && (
            <p className="rounded-lg bg-[#eaf6ef] px-3 py-2 text-sm text-pos">
              Saved.
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
            className="gold-grad h-12 rounded-xl font-bold text-onyx disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save settings"}
          </button>
        </Card>
      </form>

      <Card className="mt-4 flex items-center justify-between p-4">
        <div>
          <div className="text-sm font-semibold text-ink">Lock the app</div>
          <div className="text-xs text-mute">
            Ends this session — the PIN is required to return.
          </div>
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
