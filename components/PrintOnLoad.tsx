"use client";

import { useEffect } from "react";

/** Fires the browser print dialog once the slip has rendered. */
export default function PrintOnLoad() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, []);
  return null;
}
