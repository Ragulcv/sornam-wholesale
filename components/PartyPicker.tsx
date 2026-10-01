"use client";

// The one customer lookup used everywhere a customer is typed.
//
// The suggestion list is drawn in a portal with fixed positioning, so no
// scrolling grid or card around the field can clip it (the Bookings row bar
// did exactly that). Typing a saved name in full, or picking from the list,
// links the existing customer; anything else is a new customer created on save.
//
// Keys: Down/Up move, Enter picks, Esc closes.
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type PartyOpt = { id: string; name: string; phone: string | null };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");

export default function PartyPicker({
  parties,
  text,
  selectedId,
  onType,
  onPick,
  className,
  placeholder = "type customer",
  inputRef,
  autoFocus,
  allowNew = true,
}: {
  parties: PartyOpt[];
  /** what the field shows */
  text: string;
  selectedId: string | null;
  /** typing; the parent should clear its selection */
  onType: (text: string) => void;
  onPick: (p: PartyOpt) => void;
  className: string;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  /** show the "new customer" hint when nothing matches */
  allowNew?: boolean;
}) {
  const listId = useId();
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const q = norm(text);
  const qDigits = digits(text);
  const matches = useMemo(() => {
    if (selectedId) return [];
    const list = parties.filter(
      (p) => !q || norm(p.name).includes(q) || (qDigits.length >= 3 && digits(p.phone).includes(qDigits)),
    );
    // exact name first, then names that start with what was typed
    return list
      .sort((a, b) => {
        const rank = (p: PartyOpt) => (norm(p.name) === q ? 0 : norm(p.name).startsWith(q) ? 1 : 2);
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [parties, q, qDigits, selectedId]);
  const exact = useMemo(() => parties.find((p) => norm(p.name) === q) ?? null, [parties, q]);

  // keep the list glued under the field while the page or a grid scrolls
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setRect({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 260) });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, ref]);

  const pick = (p: PartyOpt) => {
    onPick(p);
    setOpen(false);
  };

  const showNewHint = allowNew && !!q && !exact && !selectedId;
  const visible = open && (matches.length > 0 || showNewHint) && rect;

  return (
    <>
      <input
        ref={ref}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => { onType(e.target.value); setHi(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // a saved name typed out in full links that customer, no click needed
          if (!selectedId && exact) onPick(exact);
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, Math.max(matches.length - 1, 0))); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Escape") setOpen(false);
          else if (e.key === "Enter") {
            if (selectedId) return; // already picked: let the form handle Enter
            e.preventDefault();
            const chosen = exact ?? matches[hi] ?? null;
            if (chosen) pick(chosen);
            else setOpen(false); // a new name stays as typed
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={!!visible}
        aria-controls={listId}
      />
      {visible &&
        createPortal(
          <ul
            id={listId}
            role="listbox"
            style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width, zIndex: 1000 }}
            className="max-h-64 overflow-auto rounded-md border border-[#7f9db9] bg-white py-1 text-[13px] text-black shadow-xl"
          >
            {matches.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === hi}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                  onMouseEnter={() => setHi(i)}
                  className={`flex w-full justify-between gap-3 px-3 py-1.5 text-left ${i === hi ? "bg-[#e3ecf4]" : "hover:bg-[#eef1f4]"}`}
                >
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="shrink-0 text-[#666]">{p.phone}</span>
                </button>
              </li>
            ))}
            {showNewHint && (
              <li className="border-t border-[#eee] px-3 py-1.5 text-[12px] text-[#666]">
                <b className="text-black">{text.trim()}</b> is a new customer. It will be added when you save.
              </li>
            )}
          </ul>,
          document.body,
        )}
    </>
  );
}
