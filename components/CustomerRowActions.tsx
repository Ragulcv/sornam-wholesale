"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteCustomerAction,
  updateCustomerAction,
  type ActionState,
} from "@/app/actions";

export interface EditableCustomer {
  id: string;
  name: string;
  phone: string | null;
  gstin: string | null;
  notes: string | null;
}

const fieldCls =
  "w-full rounded-xl border border-line bg-cream px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-[rgba(201,162,39,.25)]";

export default function CustomerRowActions({
  customer,
}: {
  customer: EditableCustomer;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    updateCustomerAction,
    {},
  );

  useEffect(() => {
    if (state?.ok) {
      setEditing(false);
      router.refresh();
    }
  }, [state, router]);

  async function doDelete() {
    setDeleting(true);
    setError(null);
    const res = await deleteCustomerAction(customer.id);
    if (res.ok) {
      router.refresh();
    } else {
      setError(
        res.reason === "has_bookings"
          ? "Has bookings — delete those first"
          : "Couldn't delete",
      );
      setDeleting(false);
      setConfirm(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-neg">{error}</span>}

      {/* Edit */}
      <button
        onClick={() => setEditing(true)}
        title="Edit customer"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-pearl text-mute transition hover:bg-cream hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 20h4l10-10-4-4L4 16v4z" strokeLinejoin="round" />
          <path d="m13.5 6.5 4 4" />
        </svg>
      </button>

      {/* Delete */}
      {confirm ? (
        <>
          <button
            onClick={doDelete}
            disabled={deleting}
            className="flex h-9 items-center rounded-lg border border-[#f1c9c4] bg-[#fdecea] px-2 text-xs font-bold text-neg disabled:opacity-50"
          >
            {deleting ? "…" : "Delete"}
          </button>
          <button
            onClick={() => setConfirm(false)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-pearl text-mid hover:bg-cream"
          >
            ✕
          </button>
        </>
      ) : (
        <button
          onClick={() => {
            setError(null);
            setConfirm(true);
          }}
          title="Delete customer"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-pearl text-mute transition hover:border-[#f1c9c4] hover:bg-[#fdecea] hover:text-neg"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 11v6M14 11v6" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditing(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-pearl p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 font-serif text-xl font-semibold text-ink">
              Edit customer
            </h3>
            <form action={dispatch} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={customer.id} />
              <input name="name" defaultValue={customer.name} className={fieldCls} placeholder="Name *" autoFocus />
              <input name="phone" inputMode="tel" defaultValue={customer.phone ?? ""} className={fieldCls} placeholder="Phone" />
              <input name="gstin" defaultValue={customer.gstin ?? ""} className={fieldCls} placeholder="GSTIN (optional)" />
              <input name="notes" defaultValue={customer.notes ?? ""} className={fieldCls} placeholder="Note (optional)" />
              {state?.error && <p className="text-sm text-neg">{state.error}</p>}
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex-1 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-mid hover:bg-cream"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="gold-grad flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-onyx disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
