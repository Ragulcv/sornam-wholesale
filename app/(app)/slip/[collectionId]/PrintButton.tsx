"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="gold-grad rounded-xl px-5 py-2.5 text-sm font-bold text-onyx"
    >
      Print slip
    </button>
  );
}
