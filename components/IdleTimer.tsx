"use client";

import { useEffect, useRef } from "react";
import { logoutAction } from "@/app/actions";

/** Logs the user out after `minutes` of no interaction. */
export default function IdleTimer({ minutes }: { minutes: number }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ms = Math.max(1, minutes) * 60 * 1000;

    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        logoutAction();
      }, ms);
    };

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes]);

  return null;
}
