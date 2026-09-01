"use client";

import { useEffect } from "react";

/** Triggers the browser print dialog once the slip has rendered (?auto=1). */
export default function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);
  return null;
}
