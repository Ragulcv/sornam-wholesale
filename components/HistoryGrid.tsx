"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { bulkDeleteTransactionsAction } from "@/app/actions";
import { Card } from "@/components/ui";
import { useSelection, Check } from "@/components/selection";
import { fmtMoney, fmtWeight, fmtDate } from "@/lib/format";
import type { HistoryRow } from "@/lib/queries/history";
import type { OpeningBalance } from "@/lib/queries/historyBalances";

const cell = "border border-line2 px-1.5 py-1 text-[12px] whitespace-nowrap";
const hc = "border border-[#17527a] px-1.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide";

// Numeric columns in legacy Logimax order, then the three running balances that
// make the day tally on screen. The old MC Cash(O) / MC Cash(R) columns were
// hardcoded zeros — they are replaced by real carried balances.
type MoveKey =
  | "outwardWg" | "inwardWg" | "outwardPure" | "inwardPure"
  | "metalWgRecd" | "metalWgPaid" | "metalPureRecd" | "metalPurePaid"
  | "cashRecd" | "cashPaid" | "bankRecd" | "bankPaid";
type BalKey = "pureBal" | "cashBal" | "bankBal";
type NumKey = MoveKey | BalKey;

const MOVE_COLS: { key: MoveKey; label: string; money: boolean }[] = [
  { key: "outwardWg", label: "OutWard Wg", money: false },
  { key: "inwardWg", label: "InWard Wg", money: false },
  { key: "outwardPure", label: "OutWard Pure", money: false },
  { key: "inwardPure", label: "InWard Pure", money: false },
  { key: "metalWgRecd", label: "Metal Wg Recd", money: false },
  { key: "metalWgPaid", label: "Metal Wg Paid", money: false },
  { key: "metalPureRecd", label: "Metal Pure Recd", money: false },
  { key: "metalPurePaid", label: "Metal Pure Paid", money: false },
  { key: "cashRecd", label: "Cash Recd", money: true },
  { key: "cashPaid", label: "Cash Paid", money: true },
  { key: "bankRecd", label: "Bank Recd", money: true },
  { key: "bankPaid", label: "Bank Paid", money: true },
];
const BAL_COLS: { key: BalKey; label: string; money: boolean }[] = [
  { key: "pureBal", label: "Pure Bal", money: false },
  { key: "cashBal", label: "Cash Bal", money: true },
  { key: "bankBal", label: "Bank Bal", money: true },
];
const NUM_COLS: { key: NumKey; label: string; money: boolean }[] = [...MOVE_COLS, ...BAL_COLS];
const isBal = (k: NumKey): k is BalKey => k === "pureBal" || k === "cashBal" || k === "bankBal";

type NumRow = Record<NumKey, number>;
const zeroNum = (): NumRow => Object.fromEntries(NUM_COLS.map((c) => [c.key, 0])) as NumRow;

function rowNums(r: HistoryRow): NumRow {
  return {
    outwardWg: r.outwardWg, inwardWg: r.inwardWg, outwardPure: r.outwardPure, inwardPure: r.inwardPure,
    metalWgRecd: r.metalWgRecd, metalWgPaid: r.metalWgPaid, metalPureRecd: r.metalPureRecd, metalPurePaid: r.metalPurePaid,
    cashRecd: r.cashRecd, cashPaid: r.cashPaid, bankRecd: r.bankRecd, bankPaid: r.bankPaid,
    pureBal: 0, cashBal: 0, bankBal: 0,
  };
}

/** Net effect of one row on the org position. */
function rowDelta(r: HistoryRow) {
  return {
    pure: r.inwardPure + r.metalPureRecd - r.outwardPure - r.metalPurePaid,
    cash: r.cashRecd - r.cashPaid,
    bank: r.bankRecd - r.bankPaid,
  };
}

const fmtNum = (v: number, money: boolean) => (money ? fmtMoney(v) : fmtWeight(v));
// Sparse look for data rows: blank instead of 0. Summary rows always show a value.
const fmtCell = (v: number, money: boolean, force = false) => (v || force ? fmtNum(v, money) : "");

const TOTAL_COLS = 3 /* No + Trn_Type + Date */ + 1 /* Party */ + NUM_COLS.length + 4 /* audit */ + 1 /* View */ + 1 /* checkbox */;

export default function HistoryGrid({ rows, opening }: { rows: HistoryRow[]; opening: OpeningBalance }) {
  const router = useRouter();
  const sel = useSelection();
  const ids = rows.map((r) => r.id);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [multiParty, setMultiParty] = useState<{ ids: string; parties: string[] } | null>(null);
  const allChecked = rows.length > 0 && sel.count === rows.length;

  // Opening row: metal carried in goes to InWard when positive and OutWard when
  // the org is short; money likewise splits between Recd and Paid instead of
  // being dumped into Recd with a minus sign.
  const openingRow = useMemo<NumRow>(() => {
    const o = zeroNum();
    if (opening.metalWg >= 0) o.inwardWg = opening.metalWg; else o.outwardWg = -opening.metalWg;
    if (opening.metalPure >= 0) o.inwardPure = opening.metalPure; else o.outwardPure = -opening.metalPure;
    if (opening.cash >= 0) o.cashRecd = opening.cash; else o.cashPaid = -opening.cash;
    if (opening.bank >= 0) o.bankRecd = opening.bank; else o.bankPaid = -opening.bank;
    o.pureBal = opening.metalPure;
    o.cashBal = opening.cash;
    o.bankBal = opening.bank;
    return o;
  }, [opening]);

  // Running balance after each bill. Rows render newest first, so the running
  // total is built from the bottom of the list upwards.
  const running = useMemo(() => {
    const map = new Map<string, { pureBal: number; cashBal: number; bankBal: number }>();
    let pure = opening.metalPure, cash = opening.cash, bank = opening.bank;
    for (let i = rows.length - 1; i >= 0; i--) {
      const d = rowDelta(rows[i]);
      pure += d.pure; cash += d.cash; bank += d.bank;
      map.set(rows[i].id, { pureBal: pure, cashBal: cash, bankBal: bank });
    }
    return { map, closing: { pureBal: pure, cashBal: cash, bankBal: bank } };
  }, [rows, opening]);

  const totals = useMemo<NumRow>(() => {
    const t = zeroNum();
    for (const r of rows) {
      const n = rowNums(r);
      for (const c of MOVE_COLS) t[c.key] += n[c.key];
    }
    return t;
  }, [rows]);

  // Closing = opening + range totals for the movement columns; the balance
  // columns carry the running position instead of a meaningless sum.
  const closingRow = useMemo<NumRow>(() => {
    const c = zeroNum();
    for (const col of MOVE_COLS) c[col.key] = openingRow[col.key] + totals[col.key];
    c.pureBal = running.closing.pureBal;
    c.cashBal = running.closing.cashBal;
    c.bankBal = running.closing.bankBal;
    return c;
  }, [openingRow, totals, running]);

  async function bulkDelete() {
    setDeleting(true);
    await bulkDeleteTransactionsAction([...sel.selected]);
    sel.clear();
    setConfirming(false);
    setDeleting(false);
    router.refresh();
  }
  function createBill() {
    const ids = [...sel.selected].join(",");
    const partyNames = [...new Set(rows.filter((r) => sel.isSelected(r.id)).map((r) => r.partyName ?? "—"))];
    if (partyNames.length <= 1) {
      router.push(`/history/bill?ids=${ids}`);
    } else {
      setMultiParty({ ids, parties: partyNames });
    }
  }

  const numCells = (n: NumRow, force: boolean, extra = "", hideBalances = false) =>
    NUM_COLS.map((c) => (
      <td key={c.key} className={`${cell} num ${extra} ${isBal(c.key) ? "bg-[#f7f4ea] font-semibold" : ""}`}>
        {hideBalances && isBal(c.key) ? "" : fmtCell(n[c.key], c.money, force)}
      </td>
    ));

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
              <th className={hc}>No</th>
              <th className={hc}>Trn_Type</th>
              <th className={hc}>Date</th>
              <th className={hc}>Party Name</th>
              {NUM_COLS.map((c) => <th key={c.key} className={`${hc} text-right`}>{c.label}</th>)}
              <th className={hc}>Created By</th>
              <th className={hc}>Created Date</th>
              <th className={hc}>Modified By</th>
              <th className={hc}>Modified Dt</th>
              <th className={hc}>View</th>
            </tr>
          </thead>
          <tbody>
            {/* Opening balance — carried-forward org position before the range */}
            <tr className="bg-[#eef4f9] font-semibold text-[#17527a]">
              <td className={cell}></td>
              <td className={cell}></td>
              <td className={cell} colSpan={2}>Opg. Bal</td>
              <td className={cell}></td>
              {numCells(openingRow, false)}
              <td className={cell}></td>
              <td className={cell}></td>
              <td className={cell}></td>
              <td className={cell}></td>
              <td className={cell}></td>
            </tr>

            {rows.length === 0 && <tr><td className={`${cell} py-2 text-center text-mute`} colSpan={TOTAL_COLS}>No transactions in range.</td></tr>}
            {rows.map((r) => {
              const n = rowNums(r);
              return (
                <tr key={r.id} className={sel.isSelected(r.id) ? "bg-[rgba(201,162,39,.08)]" : "odd:bg-[#faf8f3]"}>
                  <td className={cell}><Check checked={sel.isSelected(r.id)} onChange={() => sel.toggle(r.id)} /></td>
                  <td className={`${cell} num text-gold-deep`}>{String(r.serialNo).padStart(4, "0")}</td>
                  <td className={`${cell} capitalize`}>{r.trnType}</td>
                  <td className={cell}>{fmtDate(r.txnDate)}</td>
                  <td className={`${cell} font-medium`}>{r.partyName ?? "—"}</td>
                  {numCells({ ...n, ...(running.map.get(r.id) ?? { pureBal: 0, cashBal: 0, bankBal: 0 }) }, false)}
                  <td className={cell}>{r.createdBy ?? "—"}</td>
                  <td className={cell}>{fmtDate(r.createdAt)}</td>
                  <td className={cell}>{r.modifiedBy ?? "—"}</td>
                  <td className={cell}>{fmtDate(r.modifiedAt)}</td>
                  <td className={cell}><Link href={`/history/${r.id}`} className="text-info hover:underline">View</Link></td>
                </tr>
              );
            })}

            {/* Totals — sums for the visible range (end-of-day sales/purchase totals) */}
            <tr className="border-t-2 border-[#17527a] bg-[#f3f0e6] font-semibold text-ink">
              <td className={cell}></td>
              <td className={cell}></td>
              <td className={cell} colSpan={2}>Total</td>
              <td className={cell}></td>
              {numCells(totals, true, "", true)}
              <td className={cell}></td>
              <td className={cell}></td>
              <td className={cell}></td>
              <td className={cell}></td>
              <td className={cell}></td>
            </tr>

            {/* Closing balance — opening + range totals */}
            <tr className="bg-[#e3ecf4] font-bold text-[#17527a]">
              <td className={cell}></td>
              <td className={cell}></td>
              <td className={cell} colSpan={2}>Clsg. Bal</td>
              <td className={cell}></td>
              {numCells(closingRow, true)}
              <td className={cell}></td>
              <td className={cell}></td>
              <td className={cell}></td>
              <td className={cell}></td>
              <td className={cell}></td>
            </tr>
          </tbody>
        </table>
      </Card>

      {multiParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setMultiParty(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-pearl p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-xl font-semibold text-neg">Combining multiple parties</h3>
            <p className="mt-2 text-sm text-mid">
              You are trying to combine transactions from <b>{multiParty.parties.length} different parties</b> ({multiParty.parties.join(", ")}). Which party should this single bill be billed to?
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {multiParty.parties.map((p) => (
                <button key={p} onClick={() => router.push(`/history/bill?ids=${multiParty.ids}&billTo=${encodeURIComponent(p)}`)} className="rounded-xl border border-line bg-cream px-4 py-2.5 text-sm font-semibold text-ink hover:bg-line2">
                  Bill to {p}
                </button>
              ))}
              <button onClick={() => setMultiParty(null)} className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-mid hover:bg-cream">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
