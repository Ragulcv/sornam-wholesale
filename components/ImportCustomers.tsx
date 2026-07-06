"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Summary {
  total: number;
  added: number;
  duplicates: number;
  invalid: number;
}

export default function ImportCustomers() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setError(null);
    setSummary(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const r = await fetch("/api/customers/import", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok || d.error) {
        setError(d.error || "Upload failed.");
      } else {
        setSummary(d);
        router.refresh();
      }
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border border-line bg-pearl px-4 py-2.5 text-sm font-semibold text-ink hover:bg-cream"
      >
        Bulk upload
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            setOpen(false);
            reset();
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-pearl p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-serif text-xl font-semibold text-ink">
              Bulk upload contacts
            </h3>
            <p className="mt-1 text-sm text-mute">
              Download the template, fill in the contacts (only{" "}
              <b>Name</b> is required — phone, GSTIN and note are optional), then
              upload it.
            </p>

            <a
              href="/api/customers/template"
              className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-line bg-cream px-4 py-2.5 text-sm font-semibold text-ink hover:bg-line2"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" strokeLinecap="round" />
              </svg>
              Download Excel template
            </a>

            <div className="mt-4">
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setError(null);
                  setSummary(null);
                }}
                className="block w-full text-sm text-mid file:mr-3 file:rounded-lg file:border-0 file:bg-onyx file:px-3 file:py-2 file:text-sm file:font-semibold file:text-gold-hi hover:file:bg-charcoal"
              />
            </div>

            {error && (
              <p className="mt-3 rounded-lg bg-[#fdecea] px-3 py-2 text-sm text-neg">
                {error}
              </p>
            )}
            {summary && (
              <div className="mt-3 rounded-lg bg-[#eaf6ef] px-3 py-2 text-sm text-pos">
                Imported <b>{summary.added}</b> new contact
                {summary.added === 1 ? "" : "s"}
                {summary.duplicates > 0 && ` · ${summary.duplicates} already existed`}
                {summary.invalid > 0 && ` · ${summary.invalid} skipped (no name)`}.
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                className="flex-1 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-mid hover:bg-cream"
              >
                {summary ? "Done" : "Cancel"}
              </button>
              <button
                onClick={upload}
                disabled={!file || busy}
                className="gold-grad flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-onyx disabled:opacity-50"
              >
                {busy ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
