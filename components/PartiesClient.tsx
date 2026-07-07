"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  savePartyAction,
  deletePartyAction,
  bulkDeletePartiesAction,
  type ActionState,
} from "@/app/actions";
import { Card } from "@/components/ui";
import Toolbar from "@/components/Toolbar";
import { useSelection, Check, BulkToolbar } from "@/components/selection";
import { fmtMoney, fmtWeight } from "@/lib/format";
import type { PartyRow } from "@/lib/queries/parties";

const fieldCls =
  "w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-[rgba(201,162,39,.25)]";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-mute";

export default function PartiesClient({ parties }: { parties: PartyRow[] }) {
  const router = useRouter();
  const sel = useSelection();
  const ids = parties.map((p) => p.id);
  const formRef = useRef<HTMLFormElement>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(savePartyAction, {});

  const editing = editId ? parties.find((p) => p.id === editId) : null;

  useEffect(() => {
    if (state?.ok) {
      setEditId(null);
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  async function onBulkDelete(selectedIds: string[]) {
    const r = await bulkDeletePartiesAction(selectedIds);
    router.refresh();
    return r.skipped > 0 ? `Deleted ${r.deleted} · ${r.skipped} kept (in use)` : `Deleted ${r.deleted}`;
  }

  return (
    <>
      <Toolbar
        items={[
          { label: "Add", onClick: () => { setEditId(null); formRef.current?.reset(); }, primary: true },
          { label: "Save", onClick: () => formRef.current?.requestSubmit() },
          { label: "Cancel", onClick: () => { setEditId(null); formRef.current?.reset(); }, disabled: !editId },
          { label: "Import", onClick: () => setImportOpen(true) },
        ]}
      />

      <Card className="mb-5 p-4">
        <form ref={formRef} action={dispatch} key={editId ?? "new"} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input type="hidden" name="id" defaultValue={editId ?? ""} />
          <div className="col-span-2">
            <span className={labelCls}>Name *</span>
            <input name="name" defaultValue={editing?.name ?? ""} className={fieldCls} autoFocus />
          </div>
          <div>
            <span className={labelCls}>Phone</span>
            <input name="phone" defaultValue={editing?.phone ?? ""} className={fieldCls} />
          </div>
          <div>
            <span className={labelCls}>Type</span>
            <select name="type" defaultValue={editing?.type ?? "customer"} className={fieldCls}>
              <option value="customer">Customer</option>
              <option value="vendor">Vendor</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div className="col-span-2">
            <span className={labelCls}>GSTIN</span>
            <input name="gstin" defaultValue={editing?.gstin ?? ""} className={fieldCls} />
          </div>
          <div>
            <span className={labelCls}>Opening pure gold (g)</span>
            <input name="openingPureGold" inputMode="decimal" defaultValue={editing?.openingPureGold ?? 0} className={`${fieldCls} num`} />
          </div>
          <div>
            <span className={labelCls}>Opening cash (₹)</span>
            <input name="openingCash" inputMode="decimal" defaultValue={editing?.openingCash ?? 0} className={`${fieldCls} num`} />
          </div>
          {state?.error && <p className="col-span-full text-sm text-neg">{state.error}</p>}
          <button type="submit" disabled={pending} className="hidden" />
        </form>
        {editId && <p className="mt-2 text-xs text-gold-deep">Editing — press Save to update, Cancel to discard.</p>}
      </Card>

      <BulkToolbar ids={ids} selection={sel} onDelete={onBulkDelete} />
      <Card className="divide-y divide-line2">
        {parties.length === 0 && <div className="px-4 py-8 text-center text-sm text-mute">No parties yet.</div>}
        {parties.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3 transition hover:bg-cream">
            <Check checked={sel.isSelected(p.id)} onChange={() => sel.toggle(p.id)} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-ink">{p.name}</span>
                <span className="rounded bg-cream px-1.5 py-0.5 text-[10px] font-semibold uppercase text-mute">{p.type}</span>
              </div>
              <div className="text-xs text-mute">
                {p.phone ?? "no phone"}
                {p.openingPureGold > 0 && ` · opening ${fmtWeight(p.openingPureGold)} gold`}
                {p.openingCash > 0 && ` · ${fmtMoney(p.openingCash)}`}
              </div>
            </div>
            <span className="text-[11px] text-mute">{p.txnCount} txn · {p.bookingCount} bkg</span>
            <button onClick={() => { setEditId(p.id); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded-lg border border-line bg-pearl px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-cream">Edit</button>
            <PartyDelete id={p.id} onDone={() => router.refresh()} />
          </div>
        ))}
      </Card>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onDone={() => router.refresh()} />}
    </>
  );
}

function PartyDelete({ id, onDone }: { id: string; onDone: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    const r = await deletePartyAction(id);
    if (r.ok) onDone();
    else { setErr("in use"); setBusy(false); setConfirm(false); }
  }
  if (err) return <span className="text-xs text-neg">{err}</span>;
  return confirm ? (
    <span className="flex gap-1">
      <button onClick={go} disabled={busy} className="rounded-lg border border-[#f1c9c4] bg-[#fdecea] px-2 py-1.5 text-xs font-bold text-neg">{busy ? "…" : "Delete"}</button>
      <button onClick={() => setConfirm(false)} className="rounded-lg border border-line bg-pearl px-2 py-1.5 text-xs text-mid">✕</button>
    </span>
  ) : (
    <button onClick={() => setConfirm(true)} title="Delete" className="rounded-lg border border-line bg-pearl px-2.5 py-1.5 text-xs font-semibold text-mute hover:border-[#f1c9c4] hover:bg-[#fdecea] hover:text-neg">Del</button>
  );
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function upload() {
    if (!file) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const fd = new FormData(); fd.set("file", file);
      const r = await fetch("/api/parties/import", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok || d.error) setErr(d.error || "Upload failed.");
      else { setMsg(`Imported ${d.added}${d.duplicates ? ` · ${d.duplicates} existed` : ""}${d.invalid ? ` · ${d.invalid} skipped` : ""}.`); onDone(); }
    } catch { setErr("Upload failed."); } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-pearl p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-xl font-semibold text-ink">Bulk upload parties</h3>
        <p className="mt-1 text-sm text-mute">Download the template (only Name required), fill it, upload.</p>
        <a href="/api/parties/template" className="mt-4 block rounded-xl border border-line bg-cream px-4 py-2.5 text-center text-sm font-semibold text-ink hover:bg-line2">Download Excel template</a>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-4 block w-full text-sm text-mid file:mr-3 file:rounded-lg file:border-0 file:bg-onyx file:px-3 file:py-2 file:text-sm file:font-semibold file:text-gold-hi" />
        {err && <p className="mt-3 rounded-lg bg-[#fdecea] px-3 py-2 text-sm text-neg">{err}</p>}
        {msg && <p className="mt-3 rounded-lg bg-[#eaf6ef] px-3 py-2 text-sm text-pos">{msg}</p>}
        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-mid hover:bg-cream">{msg ? "Done" : "Cancel"}</button>
          <button onClick={upload} disabled={!file || busy} className="gold-grad flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-onyx disabled:opacity-50">{busy ? "Uploading…" : "Upload"}</button>
        </div>
      </div>
    </div>
  );
}
