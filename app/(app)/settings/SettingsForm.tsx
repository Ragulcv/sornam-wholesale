"use client";

import { useActionState, useState } from "react";
import { updateSettingsAction, logoutAction, type ActionState } from "@/app/actions";
import { Card } from "@/components/ui";
import {
  DEFAULT_BOOKING_TEMPLATE,
  DEFAULT_SALES_TEMPLATE,
  DEFAULT_PURCHASE_TEMPLATE,
  DEFAULT_DELIVERED_TEMPLATE,
  PLACEHOLDERS,
  renderTemplate,
} from "@/lib/whatsapp";

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
  bookingTemplate,
  salesTemplate,
  purchaseTemplate,
  deliveredTemplate,
}: {
  autoLogoffMinutes: number;
  gstin: string;
  taxPercent: string;
  tdsPercent: string;
  defaultGoldRate: string;
  defaultSilverRate: string;
  bookingTemplate: string;
  salesTemplate: string;
  purchaseTemplate: string;
  deliveredTemplate: string;
}) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    updateSettingsAction,
    {},
  );

  return (
    <div className="max-w-3xl">
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
        </Card>

        <Card className="mt-4 flex flex-col gap-5 p-5">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink">WhatsApp message wording</h2>
            <p className="mt-1 text-xs text-mute">
              Edit what the customer receives. Leave a box empty to go back to the standard wording. A line whose only
              placeholder has no value for that bill is dropped, so blanks never leave half-written lines.
            </p>
            <p className="mt-2 flex flex-wrap gap-1">
              {PLACEHOLDERS.map((p) => (
                <code key={p} className="rounded bg-cream px-1.5 py-0.5 text-[11px] text-mid">{p}</code>
              ))}
            </p>
          </div>

          <TemplateField name="bookingTemplate" label="Booking confirmation" initial={bookingTemplate} fallback={DEFAULT_BOOKING_TEMPLATE}
            sample={{ customer: "Ragul", metal: "Gold", weight: "1,000.000 g", rate: "15,768.00", amount: "1,57,68,000", pending: "1,000.000 g", type: "Your booking", bill_no: "12", date: "10/09/2026" }} />
          <TemplateField name="salesTemplate" label="Sales confirmation" initial={salesTemplate} fallback={DEFAULT_SALES_TEMPLATE}
            sample={{ customer: "Ragul", metal: "Gold", weight: "500.000 g", rate: "15,768.00", amount: "78,84,000", bill_no: "48", type: "Sale", date: "10/09/2026" }} />
          <TemplateField name="purchaseTemplate" label="Purchase confirmation" initial={purchaseTemplate} fallback={DEFAULT_PURCHASE_TEMPLATE}
            sample={{ customer: "Vivek", metal: "Gold", weight: "500.000 g", rate: "15,450.00", amount: "77,25,000", bill_no: "49", type: "Purchase", date: "10/09/2026" }} />
          <TemplateField name="deliveredTemplate" label="Delivered confirmation" initial={deliveredTemplate} fallback={DEFAULT_DELIVERED_TEMPLATE}
            sample={{ customer: "Ragul", metal: "Gold", weight: "1,000.000 g", date: "10/09/2026" }} />

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

/** One editable template with a live preview of the real message. */
function TemplateField({
  name, label, initial, fallback, sample,
}: {
  name: string;
  label: string;
  initial: string;
  fallback: string;
  sample: Record<string, string>;
}) {
  const [value, setValue] = useState(initial);
  const effective = value.trim() || fallback;
  const preview = renderTemplate(effective, sample);
  const usingDefault = !value.trim();

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <div className="mb-1.5 flex items-baseline gap-2">
          <span className={labelCls + " mb-0"}>{label}</span>
          {usingDefault ? (
            <span className="text-[10px] text-mute">using standard wording</span>
          ) : (
            <button type="button" onClick={() => setValue("")} className="text-[10px] text-info hover:underline">reset</button>
          )}
          {usingDefault && (
            <button type="button" onClick={() => setValue(fallback)} className="text-[10px] text-info hover:underline">edit a copy</button>
          )}
        </div>
        <textarea
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={8}
          placeholder={fallback}
          className={`${fieldCls} resize-y font-mono text-[12px] leading-relaxed`}
        />
      </div>
      <div>
        <span className={labelCls}>Preview</span>
        <div className="whitespace-pre-wrap rounded-xl border border-line bg-[#e7f8ee] px-4 py-3 text-[13px] leading-relaxed text-ink">
          {preview || <span className="text-mute">Nothing to send.</span>}
        </div>
      </div>
    </div>
  );
}
