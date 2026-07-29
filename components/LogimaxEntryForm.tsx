"use client";

// Pixel-faithful rebuild of the legacy Logimax "SALES / PURCHASE ENTRIES"
// screen. The staff refuse to switch platforms, so layout, grids, labels and
// the reconciliation block mirror the original exactly. Numbers are driven by
// the validated reconcile() engine (lib/bullion.ts) which reproduces the
// legacy math to the decimal.

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createTransactionAction, type TxnActionInput } from "@/app/actions";
import { pure, lineAmount, round2, round3, reconcile } from "@/lib/bullion";

type PartyOpt = { id: string; name: string; phone: string | null; opgPure?: number; opgCash?: number };
type SaleRow = { bookingId: string | null; particulars: string; weight: string; touch: string; rate: string };
type MoveRow = { particulars: string; weight: string; touch: string; aTouch: string };
type BookingOpt = { id: string; label: string };

const nn = (s: string) => parseFloat(s) || 0;
const f3 = (n: number) => n.toFixed(3);
const f2 = (n: number) => n.toFixed(2);
const blankSale = (): SaleRow => ({ bookingId: null, particulars: "", weight: "", touch: "", rate: "0" });
const blankMove = (): MoveRow => ({ particulars: "", weight: "", touch: "", aTouch: "" });

// ---- legacy visual tokens (match the original webforms look) ----
const btn =
  "rounded-[3px] border border-[#adadad] bg-gradient-to-b from-[#f6f6f6] to-[#e2e2e2] px-3 py-[2px] text-[13px] text-black hover:from-white hover:to-[#eaeaea] active:translate-y-px disabled:opacity-40";
const fld =
  "h-[22px] border border-[#7f9db9] bg-white px-1 text-[13px] text-black outline-none focus:border-[#3b6ea5]";
const roFld = "h-[22px] border border-[#7f9db9] bg-[#eef1f4] px-1 text-[13px] text-[#333]";
const th = "border border-[#2c7a7a] bg-[#31797a] px-2 py-[3px] text-[12px] font-semibold text-white text-left";
const td = "border border-[#2c7a7a] px-2 py-[2px] text-[13px] text-black";
const lbl = "text-[13px] font-bold text-black";
const num = "text-right tabular-nums";

export default function LogimaxEntryForm({
  parties,
  bookings,
  goldRate,
  silverRate,
  operatorName,
}: {
  parties: PartyOpt[];
  bookings: BookingOpt[];
  goldRate: number | null;
  silverRate: number | null;
  operatorName?: string;
}) {
  const router = useRouter();
  const [trnType, setTrnType] = useState<"sales" | "purchase">("sales");
  const [metal, setMetal] = useState<"gold" | "silver">("gold");

  // header
  const [partyId, setPartyId] = useState<string | null>(null);
  const [partyQuery, setPartyQuery] = useState("");
  const [showParties, setShowParties] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [txnDate, setTxnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [barRate, setBarRate] = useState("");
  const [rateGm, setRateGm] = useState("");
  const [refNo, setRefNo] = useState("");
  const [thru, setThru] = useState("");

  // grids
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [saleDraft, setSaleDraft] = useState<SaleRow>(blankSale());
  const [returns, setReturns] = useState<SaleRow[]>([]);
  const [returnDraft, setReturnDraft] = useState<SaleRow>(blankSale());
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [moveDraft, setMoveDraft] = useState<MoveRow>(blankMove());

  // reconciliation block
  const [intDisPure, setIntDisPure] = useState("0");
  const [intDisCash, setIntDisCash] = useState("0");
  const [mcCashRecd, setMcCashRecd] = useState("");
  const [bankRecd, setBankRecd] = useState("");
  const [conversion, setConversion] = useState<"pure" | "cash" | null>("cash");
  const [cashBankRecd, setCashBankRecd] = useState("0");
  const [discPure, setDiscPure] = useState("0");
  const [discCash, setDiscCash] = useState("0");

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const party = parties.find((p) => p.id === partyId) ?? null;
  const opgPure = party?.opgPure ?? 0;
  const opgCash = party?.opgCash ?? 0;

  const matches = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    return parties
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.phone || "").includes(q))
      .slice(0, 8);
  }, [parties, partyQuery]);

  const recon = useMemo(
    () =>
      reconcile({
        saleLines: sales.map((r) => ({ weight: nn(r.weight), touch: nn(r.touch) })),
        returnLines: returns.map((r) => ({ weight: nn(r.weight), touch: nn(r.touch) })),
        metalMoves: moves.map((m) => ({ weight: nn(m.weight), aTouch: nn(m.aTouch), dir: "received" as const })),
        ratePerGram: nn(rateGm),
        intDisPure: nn(intDisPure),
        intDisCash: nn(intDisCash),
        mcCashRecd: nn(mcCashRecd),
        bankRecd: nn(bankRecd),
        cashBankRecd: nn(cashBankRecd),
        conversion,
        discountPure: nn(discPure),
        discountCash: nn(discCash),
      }),
    [sales, returns, moves, rateGm, intDisPure, intDisCash, mcCashRecd, bankRecd, cashBankRecd, conversion, discPure, discCash],
  );

  const lineTotals = (rows: SaleRow[]) => {
    const wt = round3(rows.reduce((a, r) => a + nn(r.weight), 0));
    const pu = round3(rows.reduce((a, r) => a + pure(nn(r.weight), nn(r.touch)), 0));
    const amt = round2(rows.reduce((a, r) => a + lineAmount(nn(r.weight), nn(r.rate)), 0));
    return { wt, pu, amt };
  };
  const saleT = lineTotals(sales);
  const retT = lineTotals(returns);
  const moveTotals = useMemo(() => {
    const wt = round3(moves.reduce((a, m) => a + nn(m.weight), 0));
    const pu = round3(moves.reduce((a, m) => a + pure(nn(m.weight), nn(m.aTouch)), 0));
    return { wt, pu };
  }, [moves]);

  const addSale = () => {
    if (nn(saleDraft.weight) <= 0) return;
    setSales((s) => [...s, { ...saleDraft, rate: saleDraft.rate || rateGm }]);
    setSaleDraft(blankSale());
  };
  const addReturn = () => {
    if (nn(returnDraft.weight) <= 0) return;
    setReturns((s) => [...s, { ...returnDraft, rate: returnDraft.rate || rateGm }]);
    setReturnDraft(blankSale());
  };
  const addMove = () => {
    if (nn(moveDraft.weight) <= 0) return;
    setMoves((s) => [...s, moveDraft]);
    setMoveDraft(blankMove());
  };

  // Enter inside a draft row = Add (keyboard-friendly, item #5)
  const enterAdds = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); fn(); }
  };

  const useLiveRate = useCallback(async () => {
    try {
      const r = await fetch("/api/price/current");
      const d = await r.json();
      const val = metal === "gold" ? d.gold : d.silver;
      if (d.ok && val != null) { setRateGm(String(val)); setBarRate(String(val)); }
    } catch { /* ignore */ }
  }, [metal]);

  function clearAll() {
    setPartyId(null); setPartyQuery(""); setNewPhone(""); setBarRate(""); setRateGm(""); setRefNo(""); setThru("");
    setSales([]); setReturns([]); setMoves([]); setSaleDraft(blankSale()); setReturnDraft(blankSale()); setMoveDraft(blankMove());
    setIntDisPure("0"); setIntDisCash("0"); setMcCashRecd(""); setBankRecd(""); setConversion("cash"); setCashBankRecd("0");
    setDiscPure("0"); setDiscCash("0"); setStatus(null); setError(null);
    nameRef.current?.focus();
  }

  async function save() {
    setError(null); setStatus(null);
    if (sales.length === 0 && returns.length === 0) { setError("Add at least one Sales or Sales Return row."); return; }
    setSaving(true);
    const saleKind = (trnType === "sales" ? "sale" : "purchase") as "sale" | "purchase";
    const retKind = (trnType === "sales" ? "sale_return" : "purchase_return") as "sale_return" | "purchase_return";
    const input: TxnActionInput = {
      trnType,
      partyId,
      partyName: party ? party.name : partyQuery.trim() || undefined,
      partyPhone: party ? party.phone ?? undefined : newPhone.trim() || undefined,
      metal,
      txnDate,
      barRate: nn(barRate) || undefined,
      refNo: refNo || undefined,
      tdsAmount: 0,
      lines: [
        ...sales.map((r) => ({ kind: saleKind, particulars: r.particulars, weight: nn(r.weight), touch: nn(r.touch) || 100, rate: nn(r.rate) })),
        ...returns.map((r) => ({ kind: retKind, particulars: r.particulars, weight: nn(r.weight), touch: nn(r.touch) || 100, rate: nn(r.rate) })),
      ],
      movements: moves
        .filter((m) => nn(m.weight) > 0)
        .map((m) => ({ direction: "received" as const, particulars: m.particulars, weight: nn(m.weight), touch: nn(m.touch) || undefined, aTouch: nn(m.aTouch) || undefined })),
      settlements: [
        { mode: "cash" as const, direction: "received" as const, amount: round2(nn(mcCashRecd) + nn(cashBankRecd)) },
        { mode: "bank" as const, direction: "received" as const, amount: nn(bankRecd) },
      ].filter((s) => s.amount > 0),
    };
    const r = await createTransactionAction(input);
    setSaving(false);
    if (r.ok) { setStatus(`Sucessfully Added.  (No. ${r.serialNo})`); router.refresh(); }
    else setError(r.error ?? "Could not save.");
  }

  const title = trnType === "sales" ? "SALES ENTRIES" : "PURCHASE ENTRIES";

  return (
    <div className="min-h-screen bg-white px-4 py-3 text-black">
      {/* Sales/Purchase + metal toggles + title (real menu bar removed — those were non-functional) */}
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(["sales", "purchase"] as const).map((t) => (
            <button key={t} onClick={() => setTrnType(t)} className={`rounded-[3px] border px-3 py-[3px] text-[13px] font-semibold capitalize ${trnType === t ? "border-[#31797a] bg-[#31797a] text-white" : "border-[#adadad] bg-[#ececec] text-black"}`}>{t}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["gold", "silver"] as const).map((m) => (
            <button key={m} onClick={() => setMetal(m)} className={`rounded-[3px] border px-3 py-[3px] text-[13px] font-semibold capitalize ${metal === m ? "border-[#8a6d10] bg-[#f5edd2] text-[#8a6d10]" : "border-[#adadad] bg-[#ececec] text-black"}`}>{m}</button>
          ))}
        </div>
        <div className="ml-auto text-[15px] font-bold tracking-wide">{title}</div>
      </div>

      {/* toolbar — functional actions only (Find/Edit/Print arrive with items 3/16) */}
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <button className={btn} onClick={clearAll} title="New / clear the form">Add</button>
        <button className={btn} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        <button className={btn} onClick={clearAll}>Cancel</button>
      </div>
      {status && <div className="mb-2 text-[13px] font-semibold text-[#8b0000]">{status}</div>}
      {error && <div className="mb-2 text-[13px] font-semibold text-[#8b0000]">{error}</div>}

      {/* header fields */}
      <div className="mb-3 grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 md:grid-cols-[auto_1fr_auto_1fr_auto_1fr]">
        <span className={lbl}>Name</span>
        <div className="relative">
          <input
            ref={nameRef}
            value={party ? party.name : partyQuery}
            onChange={(e) => { setPartyQuery(e.target.value); setPartyId(null); setShowParties(true); }}
            onFocus={() => setShowParties(true)}
            onBlur={() => setTimeout(() => setShowParties(false), 150)}
            className={`${fld} w-full`}
            placeholder="party"
            autoComplete="off"
          />
          {showParties && matches.length > 0 && (
            <ul className="absolute z-30 mt-0.5 max-h-56 w-full overflow-auto border border-[#7f9db9] bg-white text-[13px] shadow-lg">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); setPartyId(p.id); setPartyQuery(p.name); setShowParties(false); }}
                    className="flex w-full justify-between px-2 py-1 text-left hover:bg-[#eef1f4]"
                  >
                    <span>{p.name}</span>
                    <span className="text-[#666]">{p.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className={lbl}>Date</span>
        <input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} className={`${fld} w-full`} />
        <span className={lbl}>Bar Rate</span>
        <input inputMode="decimal" value={barRate} onChange={(e) => setBarRate(e.target.value)} className={`${fld} ${num} w-full`} placeholder={String((metal === "gold" ? goldRate : silverRate) ?? "")} />

        <span className={lbl}>OpgPure</span>
        <input readOnly value={f3(opgPure)} className={`${roFld} ${num} w-full`} />
        <span className={lbl}>Rate/Gm</span>
        <div className="flex gap-1">
          <input inputMode="decimal" value={rateGm} onChange={(e) => setRateGm(e.target.value)} className={`${fld} ${num} w-full`} />
          <button type="button" className={btn} onClick={useLiveRate} title="live MCX">Live</button>
        </div>
        <span className={lbl}>Ref No.</span>
        <input value={refNo} onChange={(e) => setRefNo(e.target.value)} className={`${fld} w-full`} />

        <span className={lbl}>OpgCash</span>
        <input readOnly value={f2(opgCash)} className={`${roFld} ${num} w-full`} />
        <span className={lbl}>Phone</span>
        <input inputMode="tel" value={party ? party.phone ?? "" : newPhone} onChange={(e) => setNewPhone(e.target.value)} readOnly={!!party} className={`${party ? roFld : fld} w-full`} placeholder="if new" />
        <span className={lbl}>Thru</span>
        <input value={thru} onChange={(e) => setThru(e.target.value)} className={`${fld} w-full`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT: sales + sales return */}
        <div>
          <div className="mb-1 text-[14px] font-bold">SALES</div>
          <DraftRow
            row={saleDraft} setRow={setSaleDraft} onAdd={addSale} enterAdds={enterAdds(addSale)}
            bookings={bookings} showBooking
          />
          <LineGrid rows={sales} totals={saleT} onDel={(i) => setSales((s) => s.filter((_, j) => j !== i))} showBooking />

          <div className="mb-1 mt-4 text-[14px] font-bold">SALES RETURN</div>
          <DraftRow
            row={returnDraft} setRow={setReturnDraft} onAdd={addReturn} enterAdds={enterAdds(addReturn)}
            bookings={bookings}
          />
          <LineGrid rows={returns} totals={retT} onDel={(i) => setReturns((s) => s.filter((_, j) => j !== i))} />
        </div>

        {/* RIGHT: metal receipts/payments + reconciliation */}
        <div>
          <div className="mb-1 text-[14px] font-bold">METAL RECEIPTS / PAYMENTS</div>
          <div className="mb-1 grid grid-cols-[1fr_70px_60px_60px_auto] gap-1">
            <input placeholder="Particulars" value={moveDraft.particulars} onChange={(e) => setMoveDraft({ ...moveDraft, particulars: e.target.value })} className={fld} onKeyDown={enterAdds(addMove)} />
            <input placeholder="Weight" inputMode="decimal" value={moveDraft.weight} onChange={(e) => setMoveDraft({ ...moveDraft, weight: e.target.value })} className={`${fld} ${num}`} onKeyDown={enterAdds(addMove)} />
            <input placeholder="Touch" inputMode="decimal" value={moveDraft.touch} onChange={(e) => setMoveDraft({ ...moveDraft, touch: e.target.value })} className={`${fld} ${num}`} onKeyDown={enterAdds(addMove)} />
            <input placeholder="A.Touch" inputMode="decimal" value={moveDraft.aTouch} onChange={(e) => setMoveDraft({ ...moveDraft, aTouch: e.target.value })} className={`${fld} ${num}`} onKeyDown={enterAdds(addMove)} />
            <button className={btn} onClick={addMove}>Add</button>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["S.No", "Particular", "Weight", "A.Touch", "Touch", "Pure", "Del"].map((h) => <th key={h} className={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {moves.map((m, i) => (
                <tr key={i}>
                  <td className={`${td} ${num}`}>{i + 1}</td>
                  <td className={td}>{m.particulars}</td>
                  <td className={`${td} ${num}`}>{f3(nn(m.weight))}</td>
                  <td className={`${td} ${num}`}>{f3(nn(m.aTouch))}</td>
                  <td className={`${td} ${num}`}>{f3(nn(m.touch))}</td>
                  <td className={`${td} ${num}`}>{f3(pure(nn(m.weight), nn(m.aTouch)))}</td>
                  <td className={`${td} text-center`}><button className="text-[#8b0000] underline" onClick={() => setMoves((s) => s.filter((_, j) => j !== i))}>Del</button></td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className={td} colSpan={2}>Total</td>
                <td className={`${td} ${num}`}>{f3(moveTotals.wt)}</td>
                <td className={td} colSpan={2}></td>
                <td className={`${td} ${num}`}>{f3(moveTotals.pu)}</td>
                <td className={td}></td>
              </tr>
            </tbody>
          </table>

          {/* adjustments */}
          <div className="mt-3 grid grid-cols-[auto_90px_auto_110px] items-center gap-x-3 gap-y-2">
            <span className={lbl}>Int/Dis-Pure</span>
            <input inputMode="decimal" value={intDisPure} onChange={(e) => setIntDisPure(e.target.value)} className={`${fld} ${num}`} />
            <span className={lbl}>Cash</span>
            <input inputMode="decimal" value={intDisCash} onChange={(e) => setIntDisCash(e.target.value)} className={`${fld} ${num}`} />

            <span className={lbl}>M.C. Cash Recd.</span>
            <input inputMode="decimal" value={mcCashRecd} onChange={(e) => setMcCashRecd(e.target.value)} className={`${fld} ${num}`} />
            <span className={lbl}>Bank Recd</span>
            <input inputMode="decimal" value={bankRecd} onChange={(e) => setBankRecd(e.target.value)} className={`${fld} ${num}`} />
          </div>

          {/* Pure / Cash reconciliation grid */}
          <div className="mt-4 grid grid-cols-[110px_120px_120px] items-center gap-x-3 gap-y-2 text-[13px]">
            <span></span><span className="text-center font-bold">Pure</span><span className="text-center font-bold">Cash</span>

            <span className="font-bold">Total.</span>
            <input readOnly value={f3(recon.totalPure)} className={`${roFld} ${num} bg-[#e9c9c9]`} />
            <input readOnly value={f2(round2(Math.abs(recon.totalPure) * nn(rateGm)))} className={`${roFld} ${num} bg-[#e9c9c9]`} />

            <span className="font-bold">Conversion</span>
            <label className="flex items-center gap-1"><input type="checkbox" checked={conversion === "pure"} onChange={(e) => setConversion(e.target.checked ? "pure" : null)} />Pure</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={conversion === "cash"} onChange={(e) => setConversion(e.target.checked ? "cash" : null)} />Cash</label>

            <span className="font-bold">Cash/Bank Recd</span>
            <input inputMode="decimal" value={cashBankRecd} onChange={(e) => setCashBankRecd(e.target.value)} className={`${fld} ${num}`} />
            <input inputMode="decimal" value={cashBankRecd} readOnly className={`${roFld} ${num}`} />

            <span className="font-bold">Discount</span>
            <label className="flex items-center gap-1"><input type="checkbox" checked={nn(discPure) !== 0} readOnly />Pure</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={nn(discCash) !== 0} readOnly />Cash</label>

            <span className="font-bold">Clsg. Bal.</span>
            <input readOnly value={f3(recon.closingPure)} className={`${roFld} ${num} bg-[#fbf6cf]`} />
            <input readOnly value={f2(recon.closingCash)} className={`${roFld} ${num} bg-[#fbf6cf]`} />
          </div>
          {party && (
            <div className="mt-3 border border-[#7f9db9] bg-[#f7f7f0] px-2 py-1 text-[12px]">
              {party.name} balance — Pure {f3(opgPure)} · Cash ₹{f2(opgCash)}
              <span className="ml-1 text-[#666]">(before this bill)</span>
            </div>
          )}
        </div>
      </div>
      {operatorName && <div className="mt-4 text-right text-[11px] text-[#888]">Operator: {operatorName}</div>}
    </div>
  );
}

// ---- draft entry row for a sales / return grid ----
function DraftRow({
  row, setRow, onAdd, enterAdds, bookings, showBooking,
}: {
  row: SaleRow; setRow: (r: SaleRow) => void; onAdd: () => void; enterAdds: (e: React.KeyboardEvent) => void;
  bookings: BookingOpt[]; showBooking?: boolean;
}) {
  const fld2 = "h-[22px] border border-[#7f9db9] bg-white px-1 text-[13px] outline-none focus:border-[#3b6ea5]";
  return (
    <div className={`mb-1 grid gap-1 ${showBooking ? "grid-cols-[90px_1fr_70px_56px_64px_auto_auto]" : "grid-cols-[1fr_70px_56px_64px_auto]"}`}>
      {showBooking && (
        <select value={row.bookingId ?? ""} onChange={(e) => setRow({ ...row, bookingId: e.target.value || null })} className={fld2}>
          <option value="">Select</option>
          {bookings.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
      )}
      <input placeholder="Items" value={row.particulars} onChange={(e) => setRow({ ...row, particulars: e.target.value })} className={fld2} onKeyDown={enterAdds} />
      <input placeholder="Weight" inputMode="decimal" value={row.weight} onChange={(e) => setRow({ ...row, weight: e.target.value })} className={`${fld2} text-right`} onKeyDown={enterAdds} />
      <input placeholder="Touch" inputMode="decimal" value={row.touch} onChange={(e) => setRow({ ...row, touch: e.target.value })} className={`${fld2} text-right`} onKeyDown={enterAdds} />
      <input placeholder="Rate" inputMode="decimal" value={row.rate} onChange={(e) => setRow({ ...row, rate: e.target.value })} className={`${fld2} text-right`} onKeyDown={enterAdds} />
      <button className={btn} onClick={onAdd}>Add</button>
      {showBooking && <button className={btn}>Book</button>}
    </div>
  );
}

// ---- read-only grid of committed rows ----
function LineGrid({
  rows, totals, onDel, showBooking,
}: {
  rows: SaleRow[]; totals: { wt: number; pu: number; amt: number }; onDel: (i: number) => void; showBooking?: boolean;
}) {
  const cols = showBooking
    ? ["S.No", "Bookings", "Particulars", "Weight", "Net.Wg", "Touch", "Pure", "Rate", "Tot.Amt", "Del"]
    : ["S.No", "Particulars", "Weight", "Net.Wg", "Touch", "Pure", "Rate", "Tot.Amt", "Del"];
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>{cols.map((c) => <th key={c} className={th}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const w = nn(r.weight), p = pure(w, nn(r.touch)), amt = lineAmount(w, nn(r.rate));
          return (
            <tr key={i}>
              <td className={`${td} ${num}`}>{i + 1}</td>
              {showBooking && <td className={td}>{r.bookingId ? "✓" : ""}</td>}
              <td className={td}>{r.particulars || "—"}</td>
              <td className={`${td} ${num}`}>{f3(w)}</td>
              <td className={`${td} ${num}`}>{f3(w)}</td>
              <td className={`${td} ${num}`}>{f3(nn(r.touch))}</td>
              <td className={`${td} ${num}`}>{f3(p)}</td>
              <td className={`${td} ${num}`}>{f2(nn(r.rate))}</td>
              <td className={`${td} ${num}`}>{f2(amt)}</td>
              <td className={`${td} text-center`}><button className="text-[#8b0000] underline" onClick={() => onDel(i)}>Del</button></td>
            </tr>
          );
        })}
        <tr className="font-semibold">
          <td className={td} colSpan={showBooking ? 3 : 2}>Total</td>
          <td className={`${td} ${num}`}>{f3(totals.wt)}</td>
          <td className={`${td} ${num}`}>{f3(totals.wt)}</td>
          <td className={td}></td>
          <td className={`${td} ${num}`}>{f3(totals.pu)}</td>
          <td className={td}></td>
          <td className={`${td} ${num}`}>{f2(totals.amt)}</td>
          <td className={td}></td>
        </tr>
      </tbody>
    </table>
  );
}
