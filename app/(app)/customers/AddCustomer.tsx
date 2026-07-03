"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createCustomerAction, type ActionState } from "@/app/actions";
import { Card } from "@/components/ui";

const fieldCls =
  "w-full rounded-xl border border-line bg-cream px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-[rgba(201,162,39,.25)]";

export default function AddCustomer() {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    createCustomerAction,
    {},
  );

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border border-line bg-pearl px-4 py-2.5 text-sm font-semibold text-ink hover:bg-cream"
      >
        + Add customer
      </button>
    );
  }

  return (
    <Card className="p-4">
      <form ref={formRef} action={dispatch} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input name="name" className={fieldCls} placeholder="Name *" autoFocus />
          <input name="phone" inputMode="tel" className={fieldCls} placeholder="Phone" />
          <input name="gstin" className={fieldCls} placeholder="GSTIN (optional)" />
          <input name="notes" className={fieldCls} placeholder="Note (optional)" />
        </div>
        {state?.error && <p className="text-sm text-neg">{state.error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="gold-grad rounded-xl px-4 py-2.5 text-sm font-bold text-onyx disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save customer"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-mid hover:bg-cream"
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
