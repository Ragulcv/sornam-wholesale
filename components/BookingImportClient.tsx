"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Preview = {
  ok: boolean;
  error?: string;
  notes?: string[];
  counts?: { bookings: number; lots: number };
  bookings?: { sheet: string; name: string; weight: number; rate: number | null; delivered: number; mcxRate: number | null; date: string | null }[];
  lots?: { block: string; name: string; sellLots: number; buyLots: number }[];
  sheets?: string[];
};

const cell = "border border-line2 px-2 py-1 text-[12px] whitespace-nowrap";
const hc = "border border-[#17527a] bg-[#1c5f8b] px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-white";

export default function BookingImportClient() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<{ imported: number; lots: number; failed: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(dryRun: boolean) {
    if (!file) { setError("Choose the workbook first."); return; }
    setError(null); setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    if (dryRun) fd.append("dryRun", "1");
    try {
      const r = await fetch("/api/bookings/import", { method: "POST", body: fd });
      const d = await r.json();
      if (!d.ok) { setError(d.error ?? "Import failed."); setPreview(d); setBusy(false); return; }
      if (dryRun) setPreview(d);
      else { setResult(d); setPreview(null); router.refresh(); }
    } catch {
      setError("Could not read that file.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mute">Workbook (.xlsx)</span>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setResult(null); setError(null); }}
          className="block w-full text-sm text-mid file:mr-3 file:rounded-lg file:border-0 file:bg-onyx file:px-3 file:py-2 file:text-sm file:font-semibold file:text-gold-hi"
        />
        <p className="mt-2 text-xs text-mute">
          Rows are read by position, the way the sheet is actually laid out: DATE · NAME · WT · RATE · DELIVERY · PENDING · MCX · PREMIUM · REMARKS.
          PENDING and PREMIUM are recalculated here, so a stale formula in the file cannot carry a wrong number in.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => send(true)} disabled={busy || !file} className="rounded-xl border border-line bg-pearl px-4 py-2.5 text-sm font-semibold text-ink hover:bg-cream disabled:opacity-50">
          {busy ? "Reading…" : "Preview"}
        </button>
        <button onClick={() => send(false)} disabled={busy || !preview} className="gold-grad rounded-xl px-4 py-2.5 text-sm font-bold text-onyx disabled:opacity-50">
          Import {preview?.counts ? `${preview.counts.bookings} booking(s)` : ""}
        </button>
      </div>

      {error && <p className="rounded-lg bg-[#fdecea] px-3 py-2 text-sm text-neg">{error}</p>}
      {preview?.sheets && <p className="text-xs text-mute">Sheets found: {preview.sheets.join(", ")}</p>}

      {result && (
        <div className="rounded-lg border border-[#cde9d8] bg-[#eaf6ef] px-4 py-3 text-sm">
          <b className="text-pos">Imported {result.imported} booking(s)</b>
          {result.lots > 0 && <> and {result.lots} lot position(s)</>}.
          {result.failed.length > 0 && <div className="mt-1 text-neg">Skipped: {result.failed.join(", ")}</div>}
          <div className="mt-2"><a href="/bookings" className="text-info hover:underline">Open the booking workbook</a></div>
        </div>
      )}

      {preview?.ok && preview.bookings && (
        <div>
          <div className="mb-2 flex flex-wrap gap-2 text-xs text-mid">
            {preview.notes?.map((n) => <span key={n} className="rounded-lg border border-line bg-pearl px-3 py-1.5">{n}</span>)}
          </div>
          <div className="max-h-[420px] overflow-auto rounded-lg border border-line">
            <table className="w-full border-collapse">
              <thead className="sticky top-0">
                <tr>{["Sheet", "Date", "Name", "WT", "Rate", "Delivery", "Pending", "MCX", "Premium"].map((h) => <th key={h} className={hc}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {preview.bookings.map((b, i) => {
                  const pending = b.weight - b.delivered;
                  const premium = b.rate != null && b.mcxRate != null && b.rate !== 0 && b.mcxRate !== 0 ? b.rate - b.mcxRate * 0.1 : null;
                  return (
                    <tr key={i} className="odd:bg-[#faf8f3]">
                      <td className={cell}>{b.sheet}</td>
                      <td className={cell}>{b.date ?? "—"}</td>
                      <td className={cell}>{b.name}</td>
                      <td className={`${cell} num text-right`}>{b.weight.toFixed(3)}</td>
                      <td className={`${cell} num text-right`}>{b.rate?.toFixed(2) ?? ""}</td>
                      <td className={`${cell} num text-right`}>{b.delivered ? b.delivered.toFixed(3) : ""}</td>
                      <td className={`${cell} num text-right font-semibold`}>{pending.toFixed(3)}</td>
                      <td className={`${cell} num text-right`}>{b.mcxRate?.toFixed(2) ?? ""}</td>
                      <td className={`${cell} num text-right`}>{premium == null ? "—" : premium.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {preview.lots && preview.lots.length > 0 && (
            <div className="mt-3">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-mute">Lot positions</h3>
              <table className="w-full border-collapse">
                <thead><tr>{["Block", "Name", "Sell", "Buy"].map((h) => <th key={h} className={hc}>{h}</th>)}</tr></thead>
                <tbody>
                  {preview.lots.map((l, i) => (
                    <tr key={i} className="odd:bg-[#faf8f3]">
                      <td className={cell}>{l.block}</td>
                      <td className={cell}>{l.name}</td>
                      <td className={`${cell} num text-right`}>{l.sellLots || ""}</td>
                      <td className={`${cell} num text-right`}>{l.buyLots || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-mute">Importing adds these rows. Customers that do not exist yet are created automatically.</p>
        </div>
      )}
    </div>
  );
}
