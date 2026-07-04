"use client";

import { useActionState, useEffect, useState } from "react";
import { loginAction, setPinAction, type ActionState } from "@/app/actions";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

export default function LockClient({ mode }: { mode: "login" | "setup" }) {
  const action = mode === "setup" ? setPinAction : loginAction;
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    action,
    {},
  );

  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  // setup has two stages: enter, then confirm
  const [stage, setStage] = useState<"enter" | "confirm">("enter");

  const active = mode === "setup" && stage === "confirm" ? confirm : pin;
  const setActive = mode === "setup" && stage === "confirm" ? setConfirm : setPin;

  useEffect(() => {
    if (state?.ok) {
      // Hard navigation so the freshly-set session cookie is sent to the proxy.
      window.location.href = "/";
      return;
    }
    if (state?.error) {
      // reset entry on error
      setPin("");
      setConfirm("");
      setStage("enter");
    }
  }, [state]);

  function press(k: string) {
    if (pending) return;
    if (k === "clear") return setActive("");
    if (k === "back") return setActive(active.slice(0, -1));
    if (active.length >= 8) return;
    setActive(active + k);
  }

  function submit() {
    if (mode === "setup") {
      if (stage === "enter") {
        if (pin.length >= 4) setStage("confirm");
        return;
      }
      const fd = new FormData();
      fd.set("pin", pin);
      fd.set("confirm", confirm);
      dispatch(fd);
    } else {
      const fd = new FormData();
      fd.set("pin", pin);
      dispatch(fd);
    }
  }

  const label =
    mode === "setup"
      ? stage === "enter"
        ? "Create a shop PIN"
        : "Re-enter to confirm"
      : "Enter shop PIN";

  const canSubmit =
    mode === "setup" && stage === "enter" ? pin.length >= 4 : active.length >= 4;

  return (
    <main className="flex min-h-screen items-center justify-center bg-onyx px-6">
      <div className="w-full max-w-xs text-center">
        <div className="mb-1 font-serif text-3xl font-bold tracking-wide text-ivory">
          Sornam <span className="gold-text">Wholesale</span>
        </div>
        <p className="mb-8 text-xs uppercase tracking-[0.25em] text-[#6a6458]">
          {label}
        </p>

        {/* dots */}
        <div className="mb-6 flex justify-center gap-3">
          {Array.from({ length: Math.max(4, active.length) }).map((_, i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full transition ${
                i < active.length ? "bg-gold-bright" : "bg-[#2a2822]"
              }`}
            />
          ))}
        </div>

        {state?.error && (
          <p className="mb-4 text-sm text-[#e88]">{state.error}</p>
        )}

        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              className="flex h-16 items-center justify-center rounded-2xl bg-[#1b1a16] text-xl font-semibold text-ivory transition active:scale-95 hover:bg-[#242219]"
            >
              {k === "clear" ? "C" : k === "back" ? "⌫" : k}
            </button>
          ))}
        </div>

        <button
          onClick={submit}
          disabled={!canSubmit || pending}
          className="gold-grad mt-5 h-14 w-full rounded-2xl text-base font-bold text-onyx transition disabled:opacity-40"
        >
          {pending
            ? "Please wait…"
            : mode === "setup" && stage === "enter"
              ? "Next"
              : mode === "setup"
                ? "Set PIN & Enter"
                : "Unlock"}
        </button>

        <p className="mt-6 text-[11px] leading-relaxed text-[#5a554b]">
          Auto-locks when idle. Data encrypted at rest.
        </p>
      </div>
    </main>
  );
}
