"use client";

// Pixel-faithful rebuild of the legacy Logimax "SALES / PURCHASE ENTRIES"
// screen. The staff refuse to switch platforms, so layout, grids, labels and
// the reconciliation block mirror the original exactly. Numbers are driven by
// the validated reconcile() engine (lib/bullion.ts).
//
// Sign convention on the cash side, matching how they run their books today:
// a receipt is money OFF the customer's account, so it reads NEGATIVE, and the
// closing balance is what is still owed (0 when settled, 0 when nothing is
// entered yet). Opg Pure / Opg Cash are the customer's carried-forward closing
// balance from their previous bill, so every bill chains onto the last.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createTransactionAction, type TxnActionInput } from "@/app/actions";
import {
  loadBillAction,
  loadBillByIdAction,
  updateBillAction,
  partyHistoryAction,
  carryForwardAction,
  partyLedgerAction,
  billsByDateAction,
} from "@/app/(app)/entry/actions";
import { pure, lineAmount, round2, round3, reconcile } from "@/lib/bullion";
import { rupeesInWords } from "@/lib/words";
import { todayKey, dayKey } from "@/lib/dates";
import PartyPicker from "@/components/PartyPicker";
import type { BookType, BookSide } from "@/lib/lkb";
// Type-only import: erased at compile time, so the server-only module is never
// pulled into the client bundle.
import type { TransactionDetail } from "@/lib/queries/transactions";

type PartyOpt = { id: string; name: string; phone: string | null; opgPure?: number; opgCash?: number };
type SaleRow = { bookingId: string | null; particulars: string; weight: string; touch: string; rate: string };
type MoveRow = { particulars: string; weight: string; touch: string; aTouch: string };

export interface BookingOpt {
  id: string;
  partyId: string;
  partyName: string;
  partyPhone: string | null;
  side: BookSide;
  bookType: BookType;
  metal: "gold" | "silver";
  pending: number;
  weight: number;
  rate: number | null;
  mcxRate: number | null;
  bookDate: string;
  serialNo: number;
}

const nn = (s: string) => parseFloat(s) || 0;
const f3 = (n: number) => n.toFixed(3);
const f2 = (n: number) => n.toFixed(2);
// Rate starts empty so an untyped rate falls back to Rate/Gm instead of saving a ₹0 line.
const blankSale = (): SaleRow => ({ bookingId: null, particulars: "Gold pure", weight: "", touch: "", rate: "" });
const blankMove = (): MoveRow => ({ particulars: "", weight: "", touch: "", aTouch: "" });
const ITEM_OPTS = ["Gold pure", "Silver pure", "Gold bar", "Silver bar", "Coin", "Old gold", "Ornament"];

const bookLabel = (b: BookingOpt) =>
  `No.${b.serialNo} · ${b.partyName} · ${b.pending.toFixed(3)}g${b.rate ? ` @ ${b.rate}` : ""} · ${
    b.bookType === "ready" ? "R" : b.bookType === "forward" ? "F" : "UF"
  }`;

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
  initialBookingId,
}: {
  parties: PartyOpt[];
  bookings: BookingOpt[];
  goldRate: number | null;
  silverRate: number | null;
  operatorName?: string;
  initialBookingId?: string | null;
}) {
  const router = useRouter();

  // Arriving from the Bookings screen's one-click Bill button: the booking is
  // applied as the form's initial state rather than in an effect, so the screen
  // renders once, already filled in.
  const seed = initialBookingId ? bookings.find((b) => b.id === initialBookingId) ?? null : null;
  const seedRow = (): SaleRow[] =>
    seed
      ? [{
          bookingId: seed.id,
          particulars: seed.metal === "gold" ? "Gold pure" : "Silver pure",
          weight: String(seed.pending),
          touch: "",
          rate: seed.rate != null ? String(seed.rate) : "0",
        }]
      : [];

  const [trnType, setTrnType] = useState<"sales" | "purchase">(seed?.side === "buy" ? "purchase" : "sales");
  const [metal, setMetal] = useState<"gold" | "silver">(seed?.metal ?? "gold");

  // header
  const [partyId, setPartyId] = useState<string | null>(seed?.partyId ?? null);
  const [partyQuery, setPartyQuery] = useState(seed?.partyName ?? "");
  const [newPhone, setNewPhone] = useState("");
  const [txnDate, setTxnDate] = useState(todayKey);
  const [barRate, setBarRate] = useState(seed?.rate != null ? String(seed.rate) : "");
  const [rateGm, setRateGm] = useState(seed?.rate != null ? String(seed.rate) : "");
  const [refNo, setRefNo] = useState("");
  const [thru, setThru] = useState("");

  // grids
  const [sales, setSales] = useState<SaleRow[]>(seedRow);
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

  // edit-existing + find
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSerial, setEditSerial] = useState<number | null>(null);
  const [findNo, setFindNo] = useState("");
  const [findDate, setFindDate] = useState(todayKey);
  const [findRows, setFindRows] = useState<
    { id: string; serialNo: number; trnType: string; partyName: string | null; value: number; txnDate: string }[] | null
  >(null);
  const [historyState, setHistory] = useState<{ forParty: string; rows: { id: string; serialNo: number; trnType: string; date: string; gross: number }[] } | null>(null);

  // carried-forward customer position
  // Each cached result remembers which customer it belongs to, so a stale
  // balance can never be shown against the next customer picked.
  const [carryState, setCarry] = useState<{ forParty: string; pure: number; cash: number; lastBillNo: number | null; lastBillDate: string | null } | null>(null);
  const [ledgerState, setLedger] = useState<{ forParty: string; data: NonNullable<Awaited<ReturnType<typeof partyLedgerAction>>> } | null>(null);
  const [showLedger, setShowLedger] = useState(false);

  const [waUrl, setWaUrl] = useState<string | null>(null);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [lastSavedNo, setLastSavedNo] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  // Set the moment a save succeeds; cleared by any edit. Keeps Save disabled so
  // the same bill cannot be posted twice by a second click.
  const [savedLock, setSavedLock] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // The first edit after a save starts a NEW bill: unlock Save and drop the
  // "Saved. Bill No. X" banner, so a fresh form never looks like bill X is open.
  const touch = useCallback(() => {
    if (savedLock) setStatus(null);
    setSavedLock(false);
  }, [savedLock]);
  const isPurchase = trnType === "purchase";

  const party = parties.find((p) => p.id === partyId) ?? null;
  const carry = carryState && carryState.forParty === partyId ? carryState : null;
  const ledger = ledgerState && ledgerState.forParty === partyId ? ledgerState.data : null;
  const history = historyState && historyState.forParty === partyId ? historyState.rows : [];
  const opgPure = carry?.pure ?? 0;
  const opgCash = carry?.cash ?? 0;

  // Bookings offered on the line: pending only, matching this screen's side,
  // newest first. A booking for the picked customer sorts to the top.
  const bookingOpts = useMemo(() => {
    const side: BookSide = trnType === "purchase" ? "buy" : "sell";
    const list = bookings.filter((b) => b.side === side);
    if (!partyId) return list;
    return [...list].sort((a, b) => (a.partyId === partyId ? -1 : 0) - (b.partyId === partyId ? -1 : 0));
  }, [bookings, trnType, partyId]);

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

  // The customer's account after this bill: what they carried in, plus what
  // this bill leaves owing.
  const side = trnType === "purchase" ? -1 : 1; // negative = the customer owes us
  const acctClosingPure = round3(opgPure + side * recon.closingPure);
  const acctClosingCash = round2(opgCash + side * recon.closingCash);

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
    touch();
  };
  const addReturn = () => {
    if (nn(returnDraft.weight) <= 0) return;
    setReturns((s) => [...s, { ...returnDraft, rate: returnDraft.rate || rateGm }]);
    setReturnDraft(blankSale());
    touch();
  };
  const addMove = () => {
    if (nn(moveDraft.weight) <= 0) return;
    setMoves((s) => [...s, moveDraft]);
    setMoveDraft(blankMove());
    touch();
  };

  const enterAdds = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); fn(); }
  };

  /** Picking a booking fills the customer, weight, rate and item in one go. */
  const applyBooking = useCallback(
    (bookingId: string) => {
      const b = bookings.find((x) => x.id === bookingId);
      if (!b) return;
      setPartyId(b.partyId);
      setPartyQuery(b.partyName);
      setMetal(b.metal);
      setTrnType(b.side === "buy" ? "purchase" : "sales");
      if (b.rate) {
        setRateGm(String(b.rate));
        setBarRate(String(b.rate));
      }
      const row: SaleRow = {
        bookingId: b.id,
        particulars: b.metal === "gold" ? "Gold pure" : "Silver pure",
        weight: String(b.pending),
        touch: "",
        rate: b.rate != null ? String(b.rate) : "0",
      };
      setSaleDraft(row);
      touch();
    },
    [bookings, touch],
  );

  // Carried-forward position + recent bills for the picked customer.
  useEffect(() => {
    if (!partyId) return;
    const id = partyId;
    let alive = true;
    carryForwardAction(id, editingId).then((c) => { if (alive) setCarry({ forParty: id, ...c }); }).catch(() => {});
    partyLedgerAction(id).then((l) => { if (alive && l) setLedger({ forParty: id, data: l }); }).catch(() => {});
    partyHistoryAction(id)
      .then((rows) => {
        if (!alive) return;
        setHistory({ forParty: id, rows: rows.map((r) => ({ id: r.id, serialNo: r.serialNo, trnType: r.trnType, date: new Date(r.txnDate).toLocaleDateString("en-IN"), gross: r.gross })) });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [partyId, editingId]);

  function fillFromDetail(d: TransactionDetail) {
    setEditingId(d.id);
    setEditSerial(d.serialNo);
    setTrnType(d.trnType === "purchase" ? "purchase" : "sales");
    setMetal(d.metal);
    setPartyId(d.partyId);
    setPartyQuery(d.partyName ?? "");
    setTxnDate(dayKey(d.txnDate));
    setBarRate(d.barRate != null ? String(d.barRate) : "");
    // Rate/Gm drives the pure↔cash conversion; it isn't persisted separately,
    // so seed it from the bar rate or a settled bill reloads as falsely unsettled.
    setRateGm(d.barRate != null ? String(d.barRate) : "");
    setRefNo(d.refNo ?? "");
    const toRow = (l: { particulars: string | null; weight: number; touch: number | null; rate: number; bookingId: string | null }) =>
      ({ bookingId: l.bookingId, particulars: l.particulars ?? "", weight: String(l.weight), touch: l.touch != null ? String(l.touch) : "", rate: String(l.rate) });
    setSales(d.lines.filter((l) => l.kind === "sale" || l.kind === "purchase").map(toRow));
    setReturns(d.lines.filter((l) => l.kind === "sale_return" || l.kind === "purchase_return").map(toRow));
    setMoves(d.movements.map((m) => ({ particulars: m.particulars ?? "", weight: String(m.weight), touch: m.touch != null ? String(m.touch) : "", aTouch: m.aTouch != null ? String(m.aTouch) : "" })));
    const dir = d.trnType === "purchase" ? "paid" : "received";
    const cashR = d.settlements.filter((s) => s.mode === "cash" && s.direction === dir).reduce((a, s) => a + s.amount, 0);
    const bankR = d.settlements.filter((s) => s.mode === "bank" && s.direction === dir).reduce((a, s) => a + s.amount, 0);
    setMcCashRecd(cashR ? String(cashR) : "");
    setBankRecd(bankR ? String(bankR) : "");
    setStatus(`Editing bill No. ${d.serialNo}`);
    setLastSavedId(d.id);
    setLastSavedNo(d.serialNo);
    setSavedLock(false);
  }

  async function findBill(serial?: number) {
    const no = serial ?? parseInt(findNo, 10);
    if (!Number.isFinite(no)) { setError("Enter a bill No. to find."); return; }
    setError(null);
    setFindNo(String(no));
    const r = await loadBillAction(no);
    if (!r.ok) { setError(r.error); return; }
    fillFromDetail(r.detail);
  }

  async function findByDate() {
    setError(null);
    const rows = await billsByDateAction(findDate, null);
    setFindRows(rows);
  }

  async function loadById(id: string) {
    const r = await loadBillByIdAction(id);
    if (!r.ok) { setError(r.error); return; }
    setFindRows(null);
    fillFromDetail(r.detail);
  }

  /** Blank the whole form back to a fresh entry. */
  function clearAll(keepBanner = false) {
    setPartyId(null); setPartyQuery(""); setNewPhone(""); setBarRate(""); setRateGm(""); setRefNo(""); setThru("");
    setSales([]); setReturns([]); setMoves([]); setSaleDraft(blankSale()); setReturnDraft(blankSale()); setMoveDraft(blankMove());
    setIntDisPure("0"); setIntDisCash("0"); setMcCashRecd(""); setBankRecd(""); setConversion("cash"); setCashBankRecd("0");
    setDiscPure("0"); setDiscCash("0");
    setError(null);
    setEditingId(null); setEditSerial(null); setFindNo(""); setFindRows(null);
    setCarry(null); setLedger(null); setHistory(null); setShowLedger(false);
    setTxnDate(todayKey());
    if (!keepBanner) { setStatus(null); setLastSavedId(null); setLastSavedNo(null); setSavedLock(false); }
    nameRef.current?.focus();
  }

  async function save() {
    setError(null); setStatus(null);
    if (sales.length === 0 && returns.length === 0) {
      setError(`Add at least one ${trnType === "purchase" ? "Purchase" : "Sales"} or Return row.`);
      return;
    }

    // Only block a truly-empty ₹0 bill. Credit bills (nothing received now,
    // settle later) ARE allowed — the balance carries to the customer.
    const billValue = round2(saleT.amt + retT.amt);
    const cashMoved = nn(mcCashRecd) + nn(cashBankRecd) + nn(bankRecd);
    const metalMoved = moveTotals.wt;
    if (Math.abs(billValue) < 0.005 && cashMoved <= 0 && metalMoved <= 0) {
      setError("This bill has no value. Enter a Rate on the items, or record cash / bank / metal — an empty ₹0 bill can't be saved.");
      return;
    }
    const unsettled = Math.abs(recon.closingCash) > 0.005 || Math.abs(recon.closingPure) > 0.005;
    const hasParty = !!party || !!partyQuery.trim();
    if (unsettled && !hasParty) {
      setError("This bill leaves a balance — pick or type the customer so the credit maps to their account.");
      return;
    }
    setSaving(true);
    const moneyDir = (trnType === "purchase" ? "paid" : "received") as "paid" | "received";
    const saleKind = (trnType === "sales" ? "sale" : "purchase") as "sale" | "purchase";
    const retKind = (trnType === "sales" ? "sale_return" : "purchase_return") as "sale_return" | "purchase_return";
    const input: TxnActionInput = {
      trnType,
      partyId,
      partyName: party ? party.name : partyQuery.trim() || undefined,
      partyPhone: party ? party.phone ?? undefined : newPhone.trim() || undefined,
      metal,
      txnDate,
      // the conversion runs on Rate/Gm, so store it as the bill rate when Bar Rate is blank
      barRate: nn(barRate) || nn(rateGm) || undefined,
      refNo: refNo || undefined,
      thru: thru || undefined,
      tdsAmount: 0,
      lines: [
        ...sales.map((r) => ({ kind: saleKind, particulars: r.particulars, weight: nn(r.weight), touch: nn(r.touch) || 100, rate: nn(r.rate) || nn(rateGm), bookingId: r.bookingId })),
        ...returns.map((r) => ({ kind: retKind, particulars: r.particulars, weight: nn(r.weight), touch: nn(r.touch) || 100, rate: nn(r.rate) || nn(rateGm), bookingId: null })),
      ],
      movements: moves
        .filter((m) => nn(m.weight) > 0)
        .map((m) => ({ direction: "received" as const, particulars: m.particulars, weight: nn(m.weight), touch: nn(m.touch) || undefined, aTouch: nn(m.aTouch) || undefined })),
      settlements: [
        // a sale takes money in; a purchase pays it out
        { mode: "cash" as const, direction: moneyDir, amount: round2(nn(mcCashRecd) + nn(cashBankRecd)) },
        { mode: "bank" as const, direction: moneyDir, amount: nn(bankRecd) },
      ].filter((s) => s.amount > 0),
    };
    const wasEditing = editingId;
    const r = wasEditing ? await updateBillAction(wasEditing, input) : await createTransactionAction(input);
    setSaving(false);
    if (!r.ok) { setError((r as { error?: string }).error ?? "Could not save."); return; }

    const sn = (r as { serialNo?: number }).serialNo ?? null;
    const savedId = wasEditing ?? ((r as { id?: string }).id ?? null);
    const wa = (r as { whatsappUrl?: string | null }).whatsappUrl;

    // Saved: blank the form so the next customer starts clean, keep the banner
    // (and the Print / WhatsApp buttons) pointing at the bill just written, and
    // hold Save disabled until something is typed again.
    clearAll(true);
    setLastSavedId(savedId);
    setLastSavedNo(sn);
    setSavedLock(true);
    setStatus(wasEditing ? `Bill No. ${sn} updated. Form cleared for the next entry.` : `Saved. Bill No. ${sn}. Form cleared for the next entry.`);
    if (wa) setWaUrl(wa);
    router.refresh();
  }

  const title = isPurchase ? "PURCHASE ENTRIES" : "SALES ENTRIES";
  const mainGridLabel = isPurchase ? "PURCHASE" : "SALES";
  const returnGridLabel = isPurchase ? "PURCHASE RETURN" : "SALES RETURN";

  return (
    <div className="min-h-screen bg-white px-2 py-3 text-black sm:px-4">
      <datalist id="item-opts">{ITEM_OPTS.map((o) => <option key={o} value={o} />)}</datalist>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(["sales", "purchase"] as const).map((t) => (
            <button key={t} onClick={() => { setTrnType(t); touch(); }} className={`rounded-[3px] border px-3 py-[3px] text-[13px] font-semibold capitalize ${trnType === t ? "border-[#31797a] bg-[#31797a] text-white" : "border-[#adadad] bg-[#ececec] text-black"}`}>{t}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["gold", "silver"] as const).map((m) => (
            <button key={m} onClick={() => { setMetal(m); touch(); }} className={`rounded-[3px] border px-3 py-[3px] text-[13px] font-semibold capitalize ${metal === m ? "border-[#8a6d10] bg-[#f5edd2] text-[#8a6d10]" : "border-[#adadad] bg-[#ececec] text-black"}`}>{m}</button>
          ))}
        </div>
        <div className="ml-auto text-[15px] font-bold tracking-wide">{title}</div>
      </div>

      {/* toolbar */}
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <button className={btn} onClick={() => clearAll()} title="New / clear the form">Add</button>
        <button className={btn} onClick={save} disabled={saving || savedLock} title={savedLock ? "Already saved — start a new entry" : undefined}>
          {saving ? "Saving…" : savedLock ? "Saved" : editingId ? "Update" : "Save"}
        </button>
        <button className={btn} onClick={() => clearAll()}>Cancel</button>
        {lastSavedId && (
          <a className={btn} href={`/history/${lastSavedId}?auto=1`} target="_blank" rel="noopener noreferrer" title="Print the bill just saved">{lastSavedNo != null ? `Print No. ${lastSavedNo}` : "Print"}</a>
        )}
        <span className="ml-2 flex items-center gap-1">
          <input value={findNo} onChange={(e) => setFindNo(e.target.value)} placeholder="Bill No." className={`${fld} ${num} w-20`} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); findBill(); } }} />
          <input type="date" value={findDate} onChange={(e) => setFindDate(e.target.value)} className={`${fld} w-[140px]`} title="Find every bill on this date" />
          <button className={btn} onClick={() => (findNo.trim() ? findBill() : findByDate())}>Find</button>
        </span>
        <span className="ml-1 text-[12px] text-[#555]">Bill No. <b className="text-black">{editSerial ?? "New (auto)"}</b></span>
        {editingId && <span className="text-[12px] font-semibold text-[#8b0000]">● editing</span>}
      </div>
      {status && <div className="mb-2 text-[13px] font-semibold text-[#0a7a3f]">{status}</div>}
      {error && <div className="mb-2 text-[13px] font-semibold text-[#8b0000]">{error}</div>}

      {/* Find results for a date */}
      {findRows && (
        <div className="mb-3 border border-[#7f9db9] bg-[#f7f7f0] p-2">
          <div className="mb-1 flex items-center gap-2 text-[12px] font-bold">
            Bills on {new Date(findDate).toLocaleDateString("en-IN")} ({findRows.length})
            <button className={`${btn} ml-auto`} onClick={() => setFindRows(null)}>Close</button>
          </div>
          {findRows.length === 0 ? (
            <div className="text-[12px] text-[#666]">No bills on this date.</div>
          ) : (
            <table className="w-full border-collapse">
              <thead><tr>{["No.", "Type", "Party", "Value", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {findRows.map((r) => (
                  <tr key={r.id}>
                    <td className={`${td} ${num}`}>{r.serialNo}</td>
                    <td className={`${td} capitalize`}>{r.trnType}</td>
                    <td className={td}>{r.partyName ?? "—"}</td>
                    <td className={`${td} ${num}`}>{f2(r.value)}</td>
                    <td className={td}><button className={btn} onClick={() => loadById(r.id)}>Load</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* header fields */}
      <div className="mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 md:grid-cols-[auto_1fr_auto_1fr_auto_1fr] md:gap-x-8">
        <span className={lbl}>Name</span>
        <PartyPicker
          parties={parties}
          text={party ? party.name : partyQuery}
          selectedId={partyId}
          onType={(t) => { setPartyQuery(t); setPartyId(null); touch(); }}
          onPick={(p) => { setPartyId(p.id); setPartyQuery(p.name); touch(); }}
          className={`${fld} w-full`}
          placeholder="type customer — Enter to add"
          inputRef={nameRef}
        />
        <span className={lbl}>Date</span>
        <input type="date" value={txnDate} onChange={(e) => { setTxnDate(e.target.value); touch(); }} className={`${fld} w-full`} />
        <span className={lbl}>Bar Rate</span>
        <input inputMode="decimal" value={barRate} onChange={(e) => { setBarRate(e.target.value); touch(); }} className={`${fld} ${num} w-full`} placeholder={String((metal === "gold" ? goldRate : silverRate) ?? "")} />

        <span className={lbl}>OpgPure</span>
        <input readOnly value={f3(opgPure)} className={`${roFld} ${num} w-full`} title="Carried forward from this customer's previous bill" />
        <span className={lbl}>Rate/Gm</span>
        <input inputMode="decimal" value={rateGm} onChange={(e) => { setRateGm(e.target.value); touch(); }} className={`${fld} ${num} w-full`} />
        <span className={lbl}>Ref No.</span>
        <input value={refNo} onChange={(e) => { setRefNo(e.target.value); touch(); }} className={`${fld} w-full`} />

        <span className={lbl}>OpgCash</span>
        <input readOnly value={f2(opgCash)} className={`${roFld} ${num} w-full`} title="Carried forward from this customer's previous bill" />
        <span className={lbl}>Phone</span>
        <input inputMode="tel" value={party ? party.phone ?? "" : newPhone} onChange={(e) => { setNewPhone(e.target.value); touch(); }} readOnly={!!party} className={`${party ? roFld : fld} w-full`} placeholder="if new" />
        <span className={lbl}>Thru</span>
        <input value={thru} onChange={(e) => { setThru(e.target.value); touch(); }} className={`${fld} w-full`} />
      </div>

      {/* carried-forward account strip */}
      {partyId && (
        <div className="mb-3 border border-[#7f9db9] bg-[#f7f7f0] px-3 py-1.5 text-[12px]">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="font-semibold">{party?.name ?? partyQuery}</span>
            <span>
              Brought forward: Pure <b className="tabular-nums">{f3(opgPure)}</b> · Cash{" "}
              <b className={`tabular-nums ${opgCash < -0.005 ? "text-[#8b0000]" : opgCash > 0.005 ? "text-[#0a7a3f]" : ""}`}>{f2(opgCash)}</b>
              {carry?.lastBillNo != null && <span className="ml-1 text-[#666]">(after bill No. {carry.lastBillNo})</span>}
            </span>
            <span>
              After this bill: Pure <b className="tabular-nums">{f3(acctClosingPure)}</b> · Cash{" "}
              <b className={`tabular-nums ${acctClosingCash < -0.005 ? "text-[#8b0000]" : acctClosingCash > 0.005 ? "text-[#0a7a3f]" : ""}`}>{f2(acctClosingCash)}</b>
            </span>
            <span className="text-[11px] text-[#666]">
              {acctClosingCash < -0.005 ? "customer owes" : acctClosingCash > 0.005 ? "we owe the customer" : "settled"}
            </span>
            {ledger && ledger.rows.length > 0 && (
              <button className={`${btn} ml-auto`} onClick={() => setShowLedger((v) => !v)}>
                {showLedger ? "Hide" : "Show"} linked history ({ledger.rows.length})
              </button>
            )}
          </div>

          {showLedger && ledger && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse bg-white">
                <thead>
                  <tr>{["Date", "No.", "Type", "Opg Pure", "Opg Cash", "Pure", "Cash", "Cash paid", "Bank paid", "Clsg Pure", "Clsg Cash", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  <tr className="bg-[#eef1f4]">
                    <td className={td} colSpan={3}>Opening</td>
                    <td className={`${td} ${num}`}>{f3(ledger.basePure)}</td>
                    <td className={`${td} ${num}`}>{f2(ledger.baseCash)}</td>
                    <td className={td} colSpan={7}></td>
                  </tr>
                  {ledger.rows.map((r) => (
                    <tr key={r.txnId}>
                      <td className={td}>{new Date(r.txnDate).toLocaleDateString("en-IN")}</td>
                      <td className={`${td} ${num}`}>{r.serialNo}</td>
                      <td className={`${td} capitalize`}>{r.trnType}</td>
                      <td className={`${td} ${num}`}>{f3(r.openingPure)}</td>
                      <td className={`${td} ${num}`}>{f2(r.openingCash)}</td>
                      <td className={`${td} ${num}`}>{f3(r.pureMoved)}</td>
                      <td className={`${td} ${num}`}>{f2(r.cashMoved)}</td>
                      <td className={`${td} ${num} ${r.cashReceipt < 0 ? "text-[#8b0000]" : ""}`}>{f2(r.cashReceipt)}</td>
                      <td className={`${td} ${num} ${r.bankReceipt < 0 ? "text-[#8b0000]" : ""}`}>{f2(r.bankReceipt)}</td>
                      <td className={`${td} ${num} font-semibold`}>{f3(r.closingPure)}</td>
                      <td className={`${td} ${num} font-semibold`}>{f2(r.closingCash)}</td>
                      <td className={td}><button className={btn} onClick={() => loadById(r.txnId)}>Load</button></td>
                    </tr>
                  ))}
                  <tr className="bg-[#fbf6cf] font-bold">
                    <td className={td} colSpan={9}>Carried forward</td>
                    <td className={`${td} ${num}`}>{f3(ledger.closingPure)}</td>
                    <td className={`${td} ${num}`}>{f2(ledger.closingCash)}</td>
                    <td className={td}></td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-[#666]">Money the customer paid shows negative. A negative closing balance is what they still owe; a positive one is what we owe them.</p>
            </div>
          )}
        </div>
      )}

      {/* recent bills for this customer */}
      {party && history.length > 0 && (
        <div className="mb-3 flex min-w-0 items-center gap-2 text-[12px]">
          <span className="font-semibold text-[#333]">Recent:</span>
          <span className="flex gap-2 overflow-x-auto">
            {history.map((h) => (
              <button key={h.id} onClick={() => findBill(h.serialNo)}
                className="whitespace-nowrap rounded border border-[#ccd] bg-white px-2 py-0.5 hover:bg-[#eef]">
                No.{h.serialNo} · <span className="capitalize">{h.trnType}</span> · ₹{f2(h.gross)} <span className="text-[#3b6ea5] underline">load</span>
              </button>
            ))}
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT: main grid + returns */}
        <div className="min-w-0">
          <div className="mb-1 text-[14px] font-bold">{mainGridLabel}</div>
          <DraftRow
            row={saleDraft} setRow={(r) => { setSaleDraft(r); touch(); }} onAdd={addSale} enterAdds={enterAdds(addSale)}
            bookings={bookingOpts} showBooking onPickBooking={applyBooking}
          />
          <LineGrid rows={sales} totals={saleT} onDel={(i) => { setSales((s) => s.filter((_, j) => j !== i)); touch(); }} showBooking bookings={bookings} />

          <div className="mb-1 mt-4 text-[14px] font-bold">{returnGridLabel}</div>
          <DraftRow
            row={returnDraft} setRow={(r) => { setReturnDraft(r); touch(); }} onAdd={addReturn} enterAdds={enterAdds(addReturn)}
            bookings={bookingOpts}
          />
          <LineGrid rows={returns} totals={retT} onDel={(i) => { setReturns((s) => s.filter((_, j) => j !== i)); touch(); }} bookings={bookings} />
        </div>

        {/* RIGHT: metal receipts + reconciliation */}
        <div className="min-w-0">
          <div className="mb-1 text-[14px] font-bold">METAL RECEIPTS / PAYMENTS</div>
          <div className="mb-1 overflow-x-auto">
            <div className="grid min-w-[420px] grid-cols-[1fr_70px_60px_60px_auto] gap-1">
              <input placeholder="Particulars" value={moveDraft.particulars} onChange={(e) => setMoveDraft({ ...moveDraft, particulars: e.target.value })} className={fld} onKeyDown={enterAdds(addMove)} />
              <input placeholder="Weight" inputMode="decimal" value={moveDraft.weight} onChange={(e) => setMoveDraft({ ...moveDraft, weight: e.target.value })} className={`${fld} ${num}`} onKeyDown={enterAdds(addMove)} />
              <input placeholder="Touch" inputMode="decimal" value={moveDraft.touch} onChange={(e) => setMoveDraft({ ...moveDraft, touch: e.target.value })} className={`${fld} ${num}`} onKeyDown={enterAdds(addMove)} />
              <input placeholder="A.Touch" inputMode="decimal" value={moveDraft.aTouch} onChange={(e) => setMoveDraft({ ...moveDraft, aTouch: e.target.value })} className={`${fld} ${num}`} onKeyDown={enterAdds(addMove)} />
              <button className={btn} onClick={addMove}>Add</button>
            </div>
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
                  <td className={`${td} text-center`}><button className="text-[#8b0000] underline" onClick={() => { setMoves((s) => s.filter((_, j) => j !== i)); touch(); }}>Del</button></td>
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
          <div className="mt-3 overflow-x-auto">
            <div className="grid min-w-[420px] grid-cols-[auto_90px_auto_110px] items-center gap-x-3 gap-y-2">
              <span className={lbl}>Int/Dis-Pure</span>
              <input inputMode="decimal" value={intDisPure} onChange={(e) => { setIntDisPure(e.target.value); touch(); }} className={`${fld} ${num}`} />
              <span className={lbl}>Cash</span>
              <input inputMode="decimal" value={intDisCash} onChange={(e) => { setIntDisCash(e.target.value); touch(); }} className={`${fld} ${num}`} />

              <span className={lbl}>{isPurchase ? "M.C. Cash Paid" : "M.C. Cash Recd."}</span>
              <input inputMode="decimal" value={mcCashRecd} onChange={(e) => { setMcCashRecd(e.target.value); touch(); }} className={`${fld} ${num}`} />
              <span className={lbl}>{isPurchase ? "Bank Paid" : "Bank Recd"}</span>
              <input inputMode="decimal" value={bankRecd} onChange={(e) => { setBankRecd(e.target.value); touch(); }} className={`${fld} ${num}`} />
            </div>
          </div>

          {/* the money spelled out, so a long figure can be checked at a glance */}
          <div className="mt-1 flex flex-col gap-[2px] text-[11px] text-[#444]">
            <span><b>{isPurchase ? "Cash Paid" : "Cash Recd"}:</b> {nn(mcCashRecd) ? rupeesInWords(nn(mcCashRecd)) : "—"}</span>
            <span><b>{isPurchase ? "Bank Paid" : "Bank Recd"}:</b> {nn(bankRecd) ? rupeesInWords(nn(bankRecd)) : "—"}</span>
          </div>

          <button
            type="button"
            onClick={() => { setMcCashRecd(String(round2(nn(mcCashRecd) - recon.closingCash))); touch(); }}
            className={`${btn} mt-2`}
            title="Put the full remaining bill amount into M.C. Cash Recd."
          >
            ⤵ {isPurchase ? "Pay full amount in cash" : "Receive full amount in cash"}{Math.abs(recon.closingCash) > 0.005 ? ` (₹${f2(Math.abs(round2(nn(mcCashRecd) - recon.closingCash)))})` : ""}
          </button>

          {/* Pure / Cash reconciliation grid */}
          <div className="mt-4 overflow-x-auto">
            <div className="grid min-w-[380px] grid-cols-[110px_120px_120px] items-center gap-x-3 gap-y-2 text-[13px]">
              <span></span><span className="text-center font-bold">Pure</span><span className="text-center font-bold">Cash</span>

              <span className="font-bold">Total.</span>
              <input readOnly value={f3(recon.totalPure)} className={`${roFld} ${num} bg-[#e9c9c9]`} />
              <input readOnly value={f2(recon.billValue)} className={`${roFld} ${num} bg-[#e9c9c9]`} />

              <span className="font-bold">Conversion</span>
              <label className="flex items-center gap-1"><input type="checkbox" checked={conversion === "pure"} onChange={(e) => { setConversion(e.target.checked ? "pure" : null); touch(); }} />Pure</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={conversion === "cash"} onChange={(e) => { setConversion(e.target.checked ? "cash" : null); touch(); }} />Cash</label>

              <span className="font-bold">{isPurchase ? "Cash/Bank Paid" : "Cash/Bank Recd"}</span>
              <input inputMode="decimal" value={cashBankRecd} onChange={(e) => { setCashBankRecd(e.target.value); touch(); }} className={`${fld} ${num}`} />
              <input readOnly value={f2(recon.receiptsSigned)} className={`${roFld} ${num} ${recon.receiptsSigned < 0 ? "text-[#8b0000]" : ""}`} title="Money received is shown negative" />

              <span className="font-bold">Discount</span>
              <label className="flex items-center gap-1"><input type="checkbox" checked={nn(discPure) !== 0} readOnly />Pure</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={nn(discCash) !== 0} readOnly />Cash</label>

              <span className="font-bold">Clsg. Bal.</span>
              <input readOnly value={f3(recon.closingPure)} className={`${roFld} ${num} bg-[#fbf6cf]`} />
              <input readOnly value={f2(recon.closingCash)} className={`${roFld} ${num} bg-[#fbf6cf]`} />
            </div>
          </div>
          <p className="mt-1 text-[11px] text-[#666]">
            Clsg. Bal. is received minus the bill: negative while the customer still owes, 0 when settled.
          </p>
        </div>
      </div>
      {operatorName && <div className="mt-4 text-right text-[11px] text-[#888]">Operator: {operatorName}</div>}

      {/* WhatsApp confirmation popup after saving */}
      {waUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setWaUrl(null)}>
          <div className="w-full max-w-xs rounded-xl bg-white p-5 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#e7f8ee]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="#25D366"><path d="M12 2a10 10 0 0 0-8.6 15l-1.4 5 5.1-1.3A10 10 0 1 0 12 2Zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20Z" /></svg>
            </div>
            <div className="text-[15px] font-semibold text-black">Entry saved</div>
            <div className="mt-1 text-[13px] text-[#555]">Send the confirmation to the customer on WhatsApp?</div>
            <div className="mt-4 flex flex-col gap-2">
              <a href={waUrl} target="_blank" rel="noopener noreferrer" onClick={() => setWaUrl(null)} className="rounded-lg bg-[#25D366] px-4 py-2.5 text-[14px] font-bold text-white">Send WhatsApp</a>
              {lastSavedId && (
                <a href={`/history/${lastSavedId}?auto=1`} target="_blank" rel="noopener noreferrer" onClick={() => setWaUrl(null)} className="rounded-lg border border-[#ccc] px-4 py-2 text-[13px] font-semibold text-[#333]">Print bill</a>
              )}
              <button onClick={() => setWaUrl(null)} className="rounded-lg border border-[#ccc] px-4 py-2 text-[13px] font-semibold text-[#555]">Not now</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- draft entry row -----------------------------------------------------

function DraftRow({
  row, setRow, onAdd, enterAdds, bookings, showBooking, onPickBooking,
}: {
  row: SaleRow; setRow: (r: SaleRow) => void; onAdd: () => void; enterAdds: (e: React.KeyboardEvent) => void;
  bookings: BookingOpt[]; showBooking?: boolean; onPickBooking?: (id: string) => void;
}) {
  const fld2 = "h-[22px] border border-[#7f9db9] bg-white px-1 text-[13px] outline-none focus:border-[#3b6ea5]";
  return (
    <div className="mb-1 overflow-x-auto">
      <div className={`grid gap-1 ${showBooking ? "min-w-[600px] grid-cols-[170px_1fr_70px_56px_64px_auto]" : "min-w-[400px] grid-cols-[1fr_70px_56px_64px_auto]"}`}>
        {showBooking && (
          <select
            value={row.bookingId ?? ""}
            onChange={(e) => { const id = e.target.value; if (id && onPickBooking) onPickBooking(id); else setRow({ ...row, bookingId: null }); }}
            className={fld2}
            title="Pick a pending booking — newest first"
          >
            <option value="">Booking…</option>
            {bookings.map((b) => <option key={b.id} value={b.id}>{bookLabel(b)}</option>)}
          </select>
        )}
        <input list="item-opts" placeholder="Items" value={row.particulars} onChange={(e) => setRow({ ...row, particulars: e.target.value })} className={fld2} onKeyDown={enterAdds} />
        <input placeholder="Weight" inputMode="decimal" value={row.weight} onChange={(e) => setRow({ ...row, weight: e.target.value })} className={`${fld2} text-right`} onKeyDown={enterAdds} />
        <input placeholder="Touch" inputMode="decimal" value={row.touch} onChange={(e) => setRow({ ...row, touch: e.target.value })} className={`${fld2} text-right`} onKeyDown={enterAdds} />
        <input placeholder="Rate" inputMode="decimal" value={row.rate} onChange={(e) => setRow({ ...row, rate: e.target.value })} className={`${fld2} text-right`} onKeyDown={enterAdds} />
        <button className={btn} onClick={onAdd}>Add</button>
      </div>
    </div>
  );
}

// ---- read-only grid of committed rows ------------------------------------

function LineGrid({
  rows, totals, onDel, showBooking, bookings,
}: {
  rows: SaleRow[]; totals: { wt: number; pu: number; amt: number }; onDel: (i: number) => void;
  showBooking?: boolean; bookings: BookingOpt[];
}) {
  const cols = showBooking
    ? ["S.No", "Booking", "Particulars", "Weight", "Net.Wg", "Touch", "Pure", "Rate", "Tot.Amt", "Del"]
    : ["S.No", "Particulars", "Weight", "Net.Wg", "Touch", "Pure", "Rate", "Tot.Amt", "Del"];
  return (
    <div className="overflow-x-auto">
    <table className="w-full min-w-[520px] border-collapse">
      <thead>
        <tr>{cols.map((c) => <th key={c} className={th}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const w = nn(r.weight), p = pure(w, nn(r.touch)), amt = lineAmount(w, nn(r.rate));
          const bk = r.bookingId ? bookings.find((b) => b.id === r.bookingId) : null;
          return (
            <tr key={i}>
              <td className={`${td} ${num}`}>{i + 1}</td>
              {showBooking && <td className={`${td} text-[11px]`}>{bk ? `No.${bk.serialNo}` : ""}</td>}
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
    </div>
  );
}
