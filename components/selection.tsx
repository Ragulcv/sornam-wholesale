"use client";

import { useState } from "react";

export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  return {
    selected,
    count: selected.size,
    isSelected: (id: string) => selected.has(id),
    toggle: (id: string) =>
      setSelected((prev) => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    toggleAll: (ids: string[]) =>
      setSelected((prev) => (prev.size === ids.length ? new Set() : new Set(ids))),
    clear: () => setSelected(new Set()),
  };
}

export function Check({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className={`flex h-5 w-5 flex-none items-center justify-center rounded-md border transition ${
        checked
          ? "border-gold bg-gold text-onyx"
          : "border-line bg-pearl hover:border-mute"
      }`}
    >
      {checked && (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3.5">
          <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

/** Select-all control + bulk delete (with inline confirm) + result note. */
export function BulkToolbar({
  ids,
  selection,
  onDelete,
}: {
  ids: string[];
  selection: ReturnType<typeof useSelection>;
  onDelete: (ids: string[]) => Promise<string | void>;
}) {
  const { count, selected, toggleAll, clear } = selection;
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const allChecked = ids.length > 0 && count === ids.length;

  async function run() {
    setDeleting(true);
    const m = await onDelete([...selected]);
    clear();
    setConfirming(false);
    setDeleting(false);
    setMsg(m || null);
  }

  return (
    <div className="mb-2 flex min-h-[34px] items-center gap-3 px-1">
      <Check checked={allChecked} onChange={() => toggleAll(ids)} />
      <span className="text-xs font-medium text-mute">
        {count > 0 ? `${count} selected` : "Select all"}
      </span>
      {msg && <span className="text-xs font-medium text-pos">{msg}</span>}
      {count > 0 && (
        <div className="ml-auto flex items-center gap-2">
          {confirming ? (
            <>
              <button
                onClick={run}
                disabled={deleting}
                className="rounded-lg border border-[#f1c9c4] bg-[#fdecea] px-3 py-1.5 text-xs font-bold text-neg disabled:opacity-50"
              >
                {deleting ? "…" : `Delete ${count}`}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-line bg-pearl px-3 py-1.5 text-xs font-semibold text-mid hover:bg-cream"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setMsg(null);
                  setConfirming(true);
                }}
                className="rounded-lg border border-[#f1c9c4] bg-pearl px-3 py-1.5 text-xs font-bold text-neg hover:bg-[#fdecea]"
              >
                Delete selected
              </button>
              <button
                onClick={clear}
                className="rounded-lg border border-line bg-pearl px-3 py-1.5 text-xs font-semibold text-mid hover:bg-cream"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
