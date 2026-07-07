"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  loginAction,
  setPinAction,
  setOperatorAction,
  type ActionState,
} from "@/app/actions";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

type Operator = { id: string; name: string };

export default function LockClient({
  mode,
  initialStage = "pin",
  initialOperators = [],
}: {
  mode: "login" | "setup";
  initialStage?: "pin" | "operator";
  initialOperators?: Operator[];
}) {
  const router = useRouter();
  const action = mode === "setup" ? setPinAction : loginAction;
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(action, {});

  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [stage, setStage] = useState<"enter" | "confirm">("enter");
  const [view, setView] = useState<"pin" | "operator">(initialStage);
  const [operators, setOperators] = useState<Operator[]>(initialOperators);
  const [choosing, setChoosing] = useState(false);

  const active = mode === "setup" && stage === "confirm" ? confirm : pin;
  const setActive = mode === "setup" && stage === "confirm" ? setConfirm : setPin;

  useEffect(() => {
    if (state?.ok) {
      setOperators((state.operators as Operator[]) ?? []);
      setView("operator");
    } else if (state?.error) {
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
    if (mode === "setup" && stage === "enter") {
      if (pin.length >= 4) setStage("confirm");
      return;
    }
    const fd = new FormData();
    fd.set("pin", pin);
    if (mode === "setup") fd.set("confirm", confirm);
    dispatch(fd);
  }

  async function pickOperator(op: Operator) {
    setChoosing(true);
    const r = await setOperatorAction(op.id);
    if (r.ok) router.replace("/");
    else setChoosing(false);
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
        <div className="mb-2 font-serif text-3xl font-bold tracking-wide text-ivory">
          Tracker
        </div>

        {view === "operator" ? (
          <>
            <p className="mb-6 text-xs uppercase tracking-[0.25em] text-[#6a6458]">
              Who&apos;s working?
            </p>
            <div className="flex flex-col gap-2">
              {operators.length === 0 && (
                <p className="text-sm text-[#8a8478]">No operators set up yet.</p>
              )}
              {operators.map((op) => (
                <button
                  key={op.id}
                  disabled={choosing}
                  onClick={() => pickOperator(op)}
                  className="rounded-2xl bg-[#1b1a16] px-4 py-4 text-base font-semibold text-ivory transition hover:bg-[#242219] disabled:opacity-50"
                >
                  {op.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="mb-7 text-xs uppercase tracking-[0.25em] text-[#6a6458]">
              {mode === "setup" ? label : ""}&nbsp;
            </p>
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
            {state?.error && <p className="mb-4 text-sm text-[#e88]">{state.error}</p>}
            <div className="grid grid-cols-3 gap-3">
              {KEYS.map((k) => (
                <button
                  key={k}
                  onClick={() => press(k)}
                  className="flex h-16 items-center justify-center rounded-2xl bg-[#1b1a16] text-xl font-semibold text-ivory transition hover:bg-[#242219] active:scale-95"
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
                    ? "Set PIN"
                    : "Unlock"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
