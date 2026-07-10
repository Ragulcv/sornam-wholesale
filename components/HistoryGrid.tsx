"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { bulkDeleteTransactionsAction } from "@/app/actions";
import { Card } from "@/components/ui";
import { useSelection, Check } from "@/components/selection";
import { fmtMoney, fmtWeight, fmtDate } from "@/lib/format";
import type { HistoryRow } from "@/lib/queries/history";

const cell = "border border-line2 px-1.5 py-1 text-[12px] whitespace-nowrap";
const hc = "border border-[#17527a] px-1.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide";

export default function HistoryGrid({ rows }: { rows: HistoryRow[] }) {
  const router = useRouter();
  const sel = useSelection();
  const ids = rows.map((r) => r.id);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const allChecked = rows.length > 0 && sel.count === rows.length;

  async function bulkDelete() {
    setDeleting(true);
    await bulkDeleteTransactionsAction([...sel.selected]);
    sel.clear();
    setConfirming(false);
    setDeleting(false);
    router.refresh();
  }
  function createBill() {
    router.push(`/history/bill?ids=${[...sel.selected].join(",")}`);
  }

  return (
    <>
      {sel.count > 0 && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-gold/40 bg-[rgba(201,162,39,.08)] px-3 py-2">
          <span className="text-sm font-semibold text-gold-deep">{sel.count} selected</span>
          <div className="ml-auto flex gap-2">
            <button onClick={createBill} className="gold-grad rounded-lg px-3 py-1.5 text-xs font-bold text-onyx">Create bill</button>
            {confirming ? (
              <>
                <button onClick={bulkDelete} disabled={deleting} className="rounded-lg border border-[#f1c9c4] bg-[#fdecea] px-3 py-1.5 text-xs font-bold text-neg disabled:opacity-50">{deleting ? "…" : `Delete ${sel.count}`}</button>
                <button onClick={() => setConfirming(false)} className="rounded-lg border border-line bg-pearl px-3 py-1.5 text-xs font-semibold text-mid">Cancel</button>
              </>
            ) : (
              <>
                <button onClick={() => setConfirming(true)} className="rounded-lg border border-[#f1c9c4] bg-pearl px-3 py-1.5 text-xs font-bold text-neg hover:bg-[#fdecea]">Delete selected</button>
                <button onClick={sel.clear} className="rounded-lg border border-line bg-pearl px-3 py-1.5 text-xs font-semibold text-mid">Clear</button>
              </>
            )}
          </div>
        </div>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full border-collapse text-left">
          <thead className="bg-[#1f5f8b] text-white">
            <tr>
              <th className={hc}><Check checked={allChecked} onChange={() => sel.toggleAll(ids)} /></th>
              {["No", "Type", "Date", "Party", "Out g", "In g", "Cash", "Bank", "Value", "Total", "By", "Created", ""].map((h) => (
                <th key={h} className={hc}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td className={`${cell} py-8 text-center text-mute`} colSpan={14}>No transactions in range.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className={sel.isSelected(r.id) ? "bg-[rgba(201,162,39,.08)]" : "odd:bg-[#faf8f3]"}>
                <td className={cell}><Check checked={sel.isSelected(r.id)} onChange={() => sel.toggle(r.id)} /></td>
                <td className={`${cell} num text-gold-deep`}>{String(r.serialNo).padStart(4, "0")}</td>
                <td className={`${cell} capitalize`}>{r.trnType}</td>
                <td className={cell}>{fmtDate(r.txnDate)}</td>
                <td className={`${cell} font-medium`}>{r.partyName ?? "—"}</td>
                <td className={`${cell} num`}>{r.outwardPure ? fmtWeight(r.outwardPure) : ""}</td>
                <td className={`${cell} num`}>{r.inwardPure ? fmtWeight(r.inwardPure) : ""}</td>
                <td className={`${cell} num`}>{r.cashRecd + r.cashPaid ? fmtMoney(r.cashRecd + r.cashPaid) : ""}</td>
                <td className={`${cell} num`}>{r.bankRecd + r.bankPaid ? fmtMoney(r.bankRecd + r.bankPaid) : ""}</td>
                <td className={`${cell} num`}>{fmtMoney(r.value)}</td>
                <td className={`${cell} num font-semibold`}>{fmtMoney(r.total)}</td>
                <td className={cell}>{r.createdBy ?? "—"}</td>
                <td className={cell}>{fmtDate(r.createdAt)}</td>
                <td className={cell}><Link href={`/history/${r.id}`} className="text-info hover:underline">View</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
