"use client";

// Daily backup status, shown in Settings. Read-only by design: no download, so
// a backup can never leave the server through this screen.
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui";

type Run = {
  day: string; trigger: string; ok: boolean; error: string | null;
  startedAt: string; finishedAt: string | null; sizeBytes: number;
  rowCounts?: Record<string, number>;
};
type Status = {
  connected: boolean; unreachable?: boolean; error?: string;
  running?: boolean; schedule?: string;
  retention?: { daily: number; monthly: number };
  destinations?: string[];
  kept?: Record<string, { daily?: number; monthly?: number; error?: string }>;
  lastRun?: Run | null; lastSuccess?: Run | null;
  history?: Run[];
};

const fmtSize = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtWhen = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const DEST_LABEL: Record<string, string> = { local: "Backup server" };

export default function BackupCard() {
  const [st, setSt] = useState<Status | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/backup/status", { cache: "no-store" });
      setSt(await r.json());
    } catch {
      setSt({ connected: true, unreachable: true });
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, st?.running ? 3000 : 30000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load, st?.running]);

  async function backUpNow() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/backup/run", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.status === 202) { setMsg("Backup started."); setSt((s) => (s ? { ...s, running: true } : s)); }
    else setMsg(d.error ?? "Could not start a backup.");
    load();
  }

  const last = st?.lastRun ?? null;
  const good = st?.lastSuccess ?? null;
  const total = (k: "daily" | "monthly") =>
    Object.values(st?.kept ?? {}).reduce((a, x) => a + (x[k] ?? 0), 0);

  let tone = "border-line bg-pearl";
  let headline = "Checking…";
  if (st && !st.connected) { headline = "Not connected yet"; }
  else if (st?.unreachable) { tone = "border-[#f1c9c4] bg-[#fdf0ee]"; headline = "Backup service not responding"; }
  else if (st?.running) { headline = "Backing up now…"; }
  else if (last && !last.ok) { tone = "border-[#f1c9c4] bg-[#fdf0ee]"; headline = "Last backup FAILED"; }
  else if (last?.ok) { tone = "border-[#cde9d8] bg-[#eaf6ef]"; headline = "Backed up"; }
  else if (st) { headline = "No backup yet"; }

  return (
    <Card className="mt-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink">Daily backup</h2>
          <p className="mt-1 text-xs text-mute">
            {st?.schedule ? `Every night at ${st.schedule.replace(" daily", "")}` : "Every night"}, encrypted.
            {st?.retention ? ` Keeps ${st.retention.daily} days and ${st.retention.monthly} months.` : ""}
          </p>
        </div>
        <button
          onClick={backUpNow}
          disabled={busy || !st?.connected || st?.unreachable || st?.running}
          className="rounded-xl border border-line bg-pearl px-4 py-2 text-sm font-semibold text-ink hover:bg-cream disabled:opacity-50"
        >
          {st?.running ? "Running…" : busy ? "Starting…" : "Back up now"}
        </button>
      </div>

      <div className={`mt-4 rounded-xl border px-4 py-3 ${tone}`}>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className={`text-sm font-bold ${last && !last.ok && !st?.running ? "text-neg" : last?.ok ? "text-pos" : "text-ink"}`}>{headline}</span>
          {last && <span className="text-xs text-mid">{fmtWhen(last.finishedAt ?? last.startedAt)}{last.trigger === "manual" ? " · manual" : ""}</span>}
          {last?.ok && <span className="num text-xs text-mid">{fmtSize(last.sizeBytes)}</span>}
        </div>
        {last && !last.ok && last.error && <p className="mt-1 break-words text-xs text-neg">{last.error}</p>}
        {last && !last.ok && good && (
          <p className="mt-1 text-xs text-mid">Last good backup: {fmtWhen(good.finishedAt)} ({fmtSize(good.sizeBytes)})</p>
        )}
        {st && !st.connected && (
          <p className="mt-1 text-xs text-mute">The backup service has not been linked to this app yet.</p>
        )}
        {last?.ok && last.rowCounts && (
          <p className="mt-1 text-xs text-mute">
            Captured {last.rowCounts.transactions ?? 0} bills, {last.rowCounts.bookings ?? 0} bookings, {last.rowCounts.parties ?? 0} customers.
          </p>
        )}
      </div>

      {st?.connected && !st.unreachable && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-mid">
          <span>Kept: <b className="num text-ink">{total("daily")}</b> daily, <b className="num text-ink">{total("monthly")}</b> monthly</span>
          <span>Stored on: {(st.destinations ?? []).map((d) => DEST_LABEL[d] ?? d).join(", ") || "—"}</span>
        </div>
      )}

      {st?.history && st.history.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {st.history.slice(0, 10).reverse().map((h, i) => (
            <span key={i} title={`${h.day} ${h.ok ? "OK" : "FAILED"}${h.error ? `: ${h.error}` : ""}`}
              className={`h-2.5 w-5 rounded-sm ${h.ok ? "bg-[#7cc49a]" : "bg-[#e08a80]"}`} />
          ))}
          <span className="ml-1 text-[10px] text-mute">last {Math.min(10, st.history.length)} runs</span>
        </div>
      )}

      {msg && <p className="mt-2 text-xs text-mid">{msg}</p>}
    </Card>
  );
}
