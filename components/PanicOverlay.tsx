"use client";

import { useActionState, useEffect, useState } from "react";
import { verifyPanicAction, type ActionState } from "@/app/actions";

/**
 * Privacy screen. One tap (or Ctrl/Cmd + Space) blanks the screen so a
 * bystander sees nothing. Nothing is deleted — re-enter the PIN to return
 * to exactly where you were.
 */
export default function PanicOverlay() {
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    verifyPanicAction,
    {},
  );

  // Global shortcut to trigger privacy screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "Space") {
        e.preventDefault();
        setLocked(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (state?.ok) {
      setLocked(false);
      setPin("");
    }
  }, [state]);

  function submit() {
    const fd = new FormData();
    fd.set("pin", pin);
    dispatch(fd);
  }

  return (
    <>
      <button
        onClick={() => setLocked(true)}
        title="Privacy screen (Ctrl/Cmd + Space)"
        className="flex items-center gap-1.5 rounded-lg border border-line bg-pearl px-3 py-1.5 text-xs font-semibold text-mid transition hover:bg-cream"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
        </svg>
        Privacy
      </button>

      {locked && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-onyx px-6">
          <div className="w-full max-w-[240px] text-center">
            <div className="mb-2 font-serif text-2xl font-bold text-ivory">
              Tracker
            </div>
            <p className="mb-6 text-xs uppercase tracking-[0.25em] text-[#6a6458]">
              Screen locked
            </p>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="mb-3 w-full rounded-xl bg-[#1b1a16] px-4 py-3 text-center text-lg tracking-[0.4em] text-ivory outline-none focus:ring-2 focus:ring-gold"
              placeholder="••••"
            />
            {state?.error && (
              <p className="mb-3 text-sm text-[#e88]">{state.error}</p>
            )}
            <button
              onClick={submit}
              disabled={pin.length < 4 || pending}
              className="gold-grad h-12 w-full rounded-xl font-bold text-onyx disabled:opacity-40"
            >
              {pending ? "…" : "Unlock"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
