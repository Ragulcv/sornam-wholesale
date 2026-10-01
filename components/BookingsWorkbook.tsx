"use client";

// The client's own booking workbook, rebuilt as a screen.
//
// Sheets, column order, headers and formulas are taken from
// "L K B BOOKING.xlsx" so the staff read exactly what they read today:
//   R SELL · R BUY · F SELL · F BUY · UF SELL · UF BUY · - OR +
//
//   PENDING = WT - DELIVERY
//   PREMIUM = RATE - MCX x 0.1        (MCX is per 10 g, RATE per gram)
//   lots    = grams x 0.1%            (1 lot = 1 kg)
//   hedge   : book lots + MCX lots = 0

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  saveBookingAction,
  deleteBookingAction,
  saveLotPositionAction,
  deleteLotPositionAction,
  type BookingActionInput,
} from "@/app/actions";
import { computePosition, computeBooking, gramsToLots, type BookType, type BookSide } from "@/lib/lkb";
import { buildBookingWhatsapp } from "@/lib/whatsapp";
import PartyPicker from "@/components/PartyPicker";
import McxTradesSheet, { type McxSummary } from "@/components/McxTradesSheet";
import { PER_LOT_PER_RUPEE } from "@/lib/mcx";
import type { BookingRow, LotRow } from "@/lib/queries/bookings";
import { todayKey, dayKey, SHOP_TZ } from "@/lib/dates";

type PartyOpt = { id: string; name: string; phone: string | null };

// ---- legacy spreadsheet tokens ------------------------------------------
const th =
  "border border-[#1f5c5c] bg-[#31797a] px-2 py-[4px] text-[11px] font-bold uppercase tracking-wide text-white text-left whitespace-nowrap";
const td = "border border-[#c3d4d4] px-2 py-[3px] text-[13px] text-black whitespace-nowrap";
const tdNum = `${td} text-right tabular-nums`;
const cellInp =
  "h-[22px] w-full border border-[#7f9db9] bg-white px-1 text-[13px] text-black outline-none focus:border-[#3b6ea5]";
const btn =
  "rounded-[3px] border border-[#adadad] bg-gradient-to-b from-[#f6f6f6] to-[#e2e2e2] px-3 py-[3px] text-[13px] text-black hover:from-white hover:to-[#eaeaea] active:translate-y-px disabled:opacity-40";
const btnGo =
  "rounded-[3px] border border-[#1f5c5c] bg-[#31797a] px-3 py-[3px] text-[13px] font-semibold text-white hover:bg-[#296767] disabled:opacity-40";

const nn = (s: string) => parseFloat(s) || 0;
const f3 = (n: number | null | undefined) => (n == null ? "" : n.toFixed(3));
const f2 = (n: number | null | undefined) => (n == null ? "" : n.toFixed(2));

const dmy = (d: Date | string) => new Date(d).toLocaleDateString("en-IN", { timeZone: SHOP_TZ, day: "2-digit", month: "short", year: "2-digit" });

type SheetKey = "R SELL" | "R BUY" | "F SELL" | "F BUY" | "UF SELL" | "UF BUY" | "CUSTOMERS" | "- OR +" | "MCX TRADES";
const SHEETS: { key: SheetKey; bookType?: BookType; side?: BookSide; hint: string }[] = [
  { key: "R SELL", bookType: "ready", side: "sell", hint: "Ready sales booked at a fixed rate" },
  { key: "R BUY", bookType: "ready", side: "buy", hint: "Ready purchases booked at a fixed rate" },
  { key: "F SELL", bookType: "forward", side: "sell", hint: "Forward sales" },
  { key: "F BUY", bookType: "forward", side: "buy", hint: "Forward purchases" },
  { key: "UF SELL", bookType: "unfixed", side: "sell", hint: "Unfixed sales — rate not fixed yet" },
  { key: "UF BUY", bookType: "unfixed", side: "buy", hint: "Unfixed purchases — rate not fixed yet" },
  { key: "CUSTOMERS", hint: "Every customer's book at a glance, one click to bill" },
  { key: "- OR +", hint: "Net position and the MCX hedge check" },
  { key: "MCX TRADES", hint: "Every MCX buy and sell, open lots, and the profit on them" },
];

interface Draft {
  date: string;
  partyId: string | null;
  partyName: string;
  phone: string;
  wt: string;
  rate: string;
  delivery: string;
  mcx: string;
  remarks: string;
}
const blankDraft = (): Draft => ({
  date: todayKey(), partyId: null, partyName: "", phone: "", wt: "", rate: "", delivery: "", mcx: "", remarks: "",
});

export default function BookingsWorkbook({
  bookings,
  parties,
  lots,
  summary,
  shortage,
  bookingTemplate,
  mcx,
}: {
  bookings: BookingRow[];
  parties: PartyOpt[];
  lots: LotRow[];
  summary: { customers: number; pendingCount: number; pendingCustomers: number; deliveredCount: number; totalCount: number; pendingGrams: number };
  /** pending sell bookings that current stock cannot cover, per metal */
  shortage: { gold: number; silver: number };
  /** the wording set in Settings; null means the standard message */
  bookingTemplate: string | null;
  /** the MCX trade register, worked out */
  mcx: McxSummary;
}) {
  const [sheet, setSheet] = useState<SheetKey>("R SELL");
  const active = SHEETS.find((s) => s.key === sheet)!;

  return (
    <div className="min-h-screen bg-white px-2 py-3 text-black sm:px-4">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-[17px] font-bold tracking-wide">BOOKING</h1>
        <span className="text-[12px] text-[#555]">{active.hint}</span>
        <Link href="/api/bookings/export" className={`${btn} ml-auto`}>Export Excel</Link>
        <Link href="/bookings/import" className={btn}>Import Excel</Link>
      </div>

      <SummaryStrip summary={summary} />
      <ShortageStrip shortage={shortage} />

      {/* Excel-style sheet tabs */}
      <div className="mb-[-1px] flex flex-wrap gap-[2px] overflow-x-auto">
        {SHEETS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSheet(s.key)}
            className={`whitespace-nowrap rounded-t-[4px] border border-b-0 px-3 py-[4px] text-[12px] font-bold ${
              sheet === s.key
                ? "border-[#1f5c5c] bg-white text-[#1f5c5c]"
                : "border-[#c3d4d4] bg-[#eef2f2] text-[#4a5a5a] hover:bg-[#e3eaea]"
            }`}
          >
            {s.key}
          </button>
        ))}
      </div>

      <div className="border border-[#1f5c5c] bg-white p-3">
        {sheet === "MCX TRADES" ? (
          <McxTradesSheet mcx={mcx} />
        ) : sheet === "- OR +" ? (
          <PositionSheet bookings={bookings} lots={lots} mcx={mcx} onOpenTrades={() => setSheet("MCX TRADES")} />
        ) : sheet === "CUSTOMERS" ? (
          <CustomerSheet bookings={bookings} />
        ) : (
          <BookingSheet
            sheetKey={sheet}
            bookType={active.bookType!}
            side={active.side!}
            bookings={bookings}
            parties={parties}
            bookingTemplate={bookingTemplate}
          />
        )}
      </div>
    </div>
  );
}

// ---- summary strip (how many customers, how many pending) ----------------

function SummaryStrip({ summary }: { summary: BookingsWorkbookSummary }) {
  const items = [
    { label: "Customers", value: summary.customers },
    { label: "Bookings", value: summary.totalCount },
    { label: "Pending", value: summary.pendingCount, warn: summary.pendingCount > 0 },
    { label: "Customers pending", value: summary.pendingCustomers, warn: summary.pendingCustomers > 0 },
    { label: "Delivered", value: summary.deliveredCount },
    { label: "Pending grams", value: summary.pendingGrams.toFixed(3) },
  ];
  return (
    <div className="mb-2 flex flex-wrap gap-[2px]">
      {items.map((i) => (
        <div key={i.label} className="min-w-[110px] flex-1 border border-[#c3d4d4] bg-[#f7faf9] px-3 py-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-[#5b6b6b]">{i.label}</div>
          <div className={`text-[16px] font-bold tabular-nums ${i.warn ? "text-[#8b0000]" : "text-[#1f5c5c]"}`}>{i.value}</div>
        </div>
      ))}
    </div>
  );
}
type BookingsWorkbookSummary = { customers: number; pendingCount: number; pendingCustomers: number; deliveredCount: number; totalCount: number; pendingGrams: number };

/** Booked more metal than is in stock. Never blocks a booking, just says so. */
function ShortageStrip({ shortage }: { shortage: { gold: number; silver: number } }) {
  const short = [
    shortage.gold > 0.0005 ? `${shortage.gold.toFixed(3)} g gold` : null,
    shortage.silver > 0.0005 ? `${shortage.silver.toFixed(3)} g silver` : null,
  ].filter(Boolean);
  if (short.length === 0) return null;
  return (
    <div className="mb-2 border border-[#e0a9a2] bg-[#fdf0ee] px-3 py-1.5 text-[12px] font-semibold text-[#8b0000]">
      Booked more than stock — short by {short.join(" and ")}. Bookings are still saved.
    </div>
  );
}

// ---- one booking sheet ---------------------------------------------------

function BookingSheet({
  sheetKey, bookType, side, bookings, parties, bookingTemplate,
}: {
  sheetKey: SheetKey; bookType: BookType; side: BookSide; bookings: BookingRow[]; parties: PartyOpt[];
  bookingTemplate: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(blankDraft());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ msg: string; whatsappUrl: string | null } | null>(null);
  const [busy, startTransition] = useTransition();
  const [showDelivered, setShowDelivered] = useState(true);

  const isUnfixed = bookType === "unfixed";

  const rows = useMemo(() => {
    const all = bookings.filter((b) => b.bookType === bookType && b.side === side && b.status !== "cancelled");
    return showDelivered ? all : all.filter((b) => b.status !== "delivered");
  }, [bookings, bookType, side, showDelivered]);

  const totals = useMemo(() => {
    const wt = rows.reduce((a, b) => a + b.weight, 0);
    const del = rows.reduce((a, b) => a + b.delivered, 0);
    const pend = rows.reduce((a, b) => a + Math.max(0, b.pending), 0);
    const val = rows.reduce((a, b) => a + b.value, 0);
    return { wt, del, pend, val };
  }, [rows]);

  // Live preview of the two computed columns while typing the new row.
  const preview = computeBooking({
    bookType, side,
    weight: nn(draft.wt),
    delivered: nn(draft.delivery),
    rate: draft.rate ? nn(draft.rate) : null,
    mcxRate: draft.mcx ? nn(draft.mcx) : null,
  });

  function toInput(d: Draft, id?: string | null): BookingActionInput {
    const p = parties.find((x) => x.id === d.partyId);
    return {
      id: id ?? null,
      partyId: d.partyId,
      partyName: p ? p.name : d.partyName.trim() || undefined,
      partyPhone: p ? p.phone ?? undefined : d.phone.trim() || undefined,
      bookType, side, metal: "gold",
      bookDate: d.date,
      weight: nn(d.wt),
      rate: d.rate ? nn(d.rate) : null,
      delivered: nn(d.delivery),
      mcxRate: d.mcx ? nn(d.mcx) : null,
      remarks: d.remarks.trim() || null,
    };
  }

  function add() {
    setError(null); setSaved(null);
    if (!draft.partyId && !draft.partyName.trim()) { setError("Enter the NAME."); return; }
    if (nn(draft.wt) <= 0) { setError("Enter WT."); return; }
    startTransition(async () => {
      const r = await saveBookingAction(toInput(draft));
      if (r.ok) {
        setSaved({ msg: `Added to ${sheetKey}.`, whatsappUrl: (r.whatsappUrl as string) ?? null });
        setDraft(blankDraft());
        router.refresh();
      } else setError(r.error ?? "Could not save.");
    });
  }

  function saveEdit(id: string) {
    startTransition(async () => {
      const r = await saveBookingAction(toInput(editDraft, id));
      if (r.ok) { setEditing(null); router.refresh(); }
      else setError(r.error ?? "Could not save.");
    });
  }

  function startEdit(b: BookingRow) {
    setEditing(b.id);
    setEditDraft({
      date: dayKey(b.bookDate),
      partyId: b.partyId,
      partyName: b.partyName ?? "",
      phone: b.partyPhone ?? "",
      wt: String(b.weight),
      rate: b.rate != null ? String(b.rate) : "",
      delivery: String(b.delivered),
      mcx: b.mcxRate != null ? String(b.mcxRate) : "",
      remarks: b.remarks ?? "",
    });
  }

  const onEnter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); add(); } };

  return (
    <>
      {/* new-row bar, laid out in the sheet's own column order */}
      <div className="mb-2 overflow-x-auto">
        <div className={`grid min-w-[900px] gap-1 ${isUnfixed ? "grid-cols-[110px_1fr_90px_90px_100px_1fr_auto]" : "grid-cols-[110px_1fr_90px_90px_90px_100px_1fr_auto]"}`}>
          <Lbl>DATE</Lbl>
          <Lbl>NAME</Lbl>
          <Lbl>WT</Lbl>
          <Lbl>RATE</Lbl>
          {!isUnfixed && <Lbl>DELIVERY</Lbl>}
          <Lbl>{isUnfixed ? "MCX" : "MCX BUY"}</Lbl>
          <Lbl>REMARKS</Lbl>
          <span />

          <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={cellInp} />
          <PartyPicker
            parties={parties}
            text={draft.partyName}
            selectedId={draft.partyId}
            onType={(t) => setDraft((d) => ({ ...d, partyName: t, partyId: null }))}
            onPick={(p) => setDraft((d) => ({ ...d, partyId: p.id, partyName: p.name, phone: p.phone ?? "" }))}
            className={cellInp}
          />
          <input inputMode="decimal" value={draft.wt} onChange={(e) => setDraft({ ...draft, wt: e.target.value })} onKeyDown={onEnter} className={`${cellInp} text-right`} />
          <input inputMode="decimal" value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} onKeyDown={onEnter} className={`${cellInp} text-right`} />
          {!isUnfixed && (
            <input inputMode="decimal" value={draft.delivery} onChange={(e) => setDraft({ ...draft, delivery: e.target.value })} onKeyDown={onEnter} className={`${cellInp} text-right`} />
          )}
          <input inputMode="decimal" value={draft.mcx} onChange={(e) => setDraft({ ...draft, mcx: e.target.value })} onKeyDown={onEnter} className={`${cellInp} text-right`} placeholder="per 10 g" />
          <input value={draft.remarks} onChange={(e) => setDraft({ ...draft, remarks: e.target.value })} onKeyDown={onEnter} className={cellInp} />
          <button className={btnGo} onClick={add} disabled={busy}>{busy ? "…" : "Add"}</button>
        </div>
      </div>

      {/* what the two formula columns will read for the row being typed */}
      {(nn(draft.wt) > 0 || draft.mcx) && (
        <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 border border-[#c3d4d4] bg-[#f7faf9] px-3 py-1 text-[12px]">
          <span>PENDING <b className="tabular-nums">{f3(preview.pending)}</b> <span className="text-[#666]">= WT − DELIVERY</span></span>
          <span>PREMIUM <b className="tabular-nums">{preview.premium == null ? "—" : f2(preview.premium)}</b> <span className="text-[#666]">= RATE − MCX × 0.1</span></span>
          <span>Value <b className="tabular-nums">{f2(preview.value)}</b></span>
          <span>Lots <b className="tabular-nums">{f3(gramsToLots(preview.pending))}</b></span>
        </div>
      )}

      {error && <div className="mb-2 text-[13px] font-semibold text-[#8b0000]">{error}</div>}
      {saved && (
        <div className="mb-2 flex flex-wrap items-center gap-3 border border-[#cde9d8] bg-[#eaf6ef] px-3 py-1.5">
          <span className="text-[13px] font-semibold text-[#0a7a3f]">{saved.msg}</span>
          {saved.whatsappUrl && (
            <a href={saved.whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={() => setSaved(null)}
              className="rounded-[3px] bg-[#25D366] px-3 py-[3px] text-[12px] font-bold text-white hover:bg-[#1fb855]">
              Send WhatsApp
            </a>
          )}
          <button className={`${btn} ml-auto`} onClick={() => setSaved(null)}>Dismiss</button>
        </div>
      )}

      <label className="mb-1 flex items-center gap-1 text-[12px] text-[#444]">
        <input type="checkbox" checked={showDelivered} onChange={(e) => setShowDelivered(e.target.checked)} />
        show delivered rows
      </label>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse">
          <thead>
            <tr>
              <th className={th}>DATE</th>
              <th className={th}>NAME</th>
              <th className={th}>WT</th>
              <th className={th}>RATE</th>
              {!isUnfixed && <th className={th}>DELIVERY</th>}
              {!isUnfixed && <th className={th}>PENDING</th>}
              <th className={th}>{isUnfixed ? "MCX" : "MCX BUY"}</th>
              <th className={th}>PREMIUM</th>
              <th className={th}>VALUE</th>
              <th className={th}>REMARKS</th>
              <th className={th}>STATUS</th>
              <th className={th}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td className={`${td} text-center text-[#777]`} colSpan={12}>No rows on this sheet yet.</td></tr>
            )}
            {rows.map((b) =>
              editing === b.id ? (
                <tr key={b.id} className="bg-[#fffbe6]">
                  <td className={td}><input type="date" value={editDraft.date} onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })} className={cellInp} /></td>
                  <td className={td}>{b.partyName}</td>
                  <td className={td}><input inputMode="decimal" value={editDraft.wt} onChange={(e) => setEditDraft({ ...editDraft, wt: e.target.value })} className={`${cellInp} w-20 text-right`} /></td>
                  <td className={td}><input inputMode="decimal" value={editDraft.rate} onChange={(e) => setEditDraft({ ...editDraft, rate: e.target.value })} className={`${cellInp} w-24 text-right`} /></td>
                  {!isUnfixed && <td className={td}><input inputMode="decimal" value={editDraft.delivery} onChange={(e) => setEditDraft({ ...editDraft, delivery: e.target.value })} className={`${cellInp} w-20 text-right`} /></td>}
                  {!isUnfixed && <td className={tdNum}>{f3(nn(editDraft.wt) - nn(editDraft.delivery))}</td>}
                  <td className={td}><input inputMode="decimal" value={editDraft.mcx} onChange={(e) => setEditDraft({ ...editDraft, mcx: e.target.value })} className={`${cellInp} w-24 text-right`} /></td>
                  <td className={tdNum}>{editDraft.rate && editDraft.mcx ? f2(nn(editDraft.rate) - nn(editDraft.mcx) * 0.1) : "—"}</td>
                  <td className={tdNum}>{f2(nn(editDraft.wt) * nn(editDraft.rate))}</td>
                  <td className={td}><input value={editDraft.remarks} onChange={(e) => setEditDraft({ ...editDraft, remarks: e.target.value })} className={cellInp} /></td>
                  <td className={td}></td>
                  <td className={td}>
                    <div className="flex gap-1">
                      <button className={btnGo} onClick={() => saveEdit(b.id)} disabled={busy}>Save</button>
                      <button className={btn} onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={b.id} className={b.status === "delivered" ? "bg-[#f2f7f2] text-[#5c6b5c]" : undefined}>
                  <td className={td}>{dmy(b.bookDate)}</td>
                  <td className={td}>{b.partyName}</td>
                  <td className={tdNum}>{f3(b.weight)}</td>
                  <td className={tdNum}>{b.rate ? f2(b.rate) : ""}</td>
                  {!isUnfixed && <td className={tdNum}>{b.delivered ? f3(b.delivered) : ""}</td>}
                  {!isUnfixed && <td className={`${tdNum} font-semibold`}>{f3(b.pending)}</td>}
                  <td className={tdNum}>{b.mcxRate ? f2(b.mcxRate) : ""}</td>
                  <td className={tdNum}>{b.premium == null ? "" : f2(b.premium)}</td>
                  <td className={tdNum}>{b.value ? f2(b.value) : ""}</td>
                  <td className={td}>{b.remarks ?? ""}</td>
                  <td className={td}><StatusChip status={b.status} /></td>
                  <td className={td}>
                    <div className="flex gap-1">
                      {b.status !== "delivered" && (
                        <Link
                          href={`/entry?booking=${b.id}`}
                          className={btnGo}
                          title={side === "buy" ? "Create the purchase entry from this booking" : "Create the sales entry from this booking"}
                        >
                          {side === "buy" ? "Purchase" : "Bill"}
                        </Link>
                      )}
                      {b.partyPhone && (
                        <a
                          href={buildBookingWhatsapp(b.partyPhone, {
                            partyName: b.partyName ?? "Customer",
                            side: b.side,
                            bookType: b.bookType,
                            metal: b.metal,
                            weight: b.weight,
                            rate: b.rate ?? undefined,
                            delivered: b.delivered,
                            template: bookingTemplate,
                          })}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Send this booking on WhatsApp"
                          className="flex h-[22px] w-[26px] items-center justify-center rounded-[3px] bg-[#25D366] text-white hover:bg-[#1fb855]"
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15l-1.4 5 5.1-1.3A10 10 0 1 0 12 2Zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20Z" /></svg>
                        </a>
                      )}
                      <button className={btn} onClick={() => startEdit(b)}>Edit</button>
                      <button
                        className={btn}
                        onClick={() => startTransition(async () => { await deleteBookingAction(b.id); router.refresh(); })}
                      >Del</button>
                    </div>
                  </td>
                </tr>
              ),
            )}
            <tr className="bg-[#eef2f2] font-bold">
              <td className={td} colSpan={2}>TOTAL</td>
              <td className={tdNum}>{f3(totals.wt)}</td>
              <td className={td}></td>
              {!isUnfixed && <td className={tdNum}>{f3(totals.del)}</td>}
              {!isUnfixed && <td className={tdNum}>{f3(totals.pend)}</td>}
              <td className={td}></td>
              <td className={td}></td>
              <td className={tdNum}>{f2(totals.val)}</td>
              <td className={td} colSpan={3}></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-[#666]">
        {isUnfixed
          ? "Unfixed rows carry the whole WT into the position until the rate is fixed."
          : "PENDING is what feeds the position sheet. Billing a row from here fills the entry screen and reduces PENDING."}
      </p>
    </>
  );
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-bold uppercase tracking-wide text-[#5b6b6b]">{children}</span>;
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "bg-[#fff4d6] text-[#8a6d10] border-[#e6cf8a]",
    partial: "bg-[#e8f1fb] text-[#1c4e80] border-[#b9d3ec]",
    delivered: "bg-[#eaf6ef] text-[#0a7a3f] border-[#cde9d8]",
    cancelled: "bg-[#f3f3f3] text-[#777] border-[#ddd]",
  };
  return <span className={`rounded-[3px] border px-1.5 py-[1px] text-[10px] font-bold uppercase ${map[status] ?? ""}`}>{status}</span>;
}

// ---- customer roll-up: who is pending, and bill them in one click --------

function CustomerSheet({ bookings }: { bookings: BookingRow[] }) {
  const [pendingOnly, setPendingOnly] = useState(false);

  const rows = useMemo(() => {
    const by = new Map<string, {
      partyId: string; name: string; phone: string | null;
      bookings: number; pendingBookings: number;
      wt: number; delivered: number; pending: number; value: number;
      nextBookingId: string | null; nextSide: BookSide | null;
    }>();
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      const key = b.partyId;
      const e = by.get(key) ?? {
        partyId: b.partyId, name: b.partyName ?? "—", phone: b.partyPhone,
        bookings: 0, pendingBookings: 0, wt: 0, delivered: 0, pending: 0, value: 0,
        nextBookingId: null, nextSide: null,
      };
      e.bookings += 1;
      e.wt += b.weight;
      e.delivered += b.delivered;
      e.value += b.value;
      if (b.status !== "delivered" && b.pending > 0.0005) {
        e.pendingBookings += 1;
        e.pending += b.pending;
        // bookings arrive newest-first, so the last one seen is the oldest open row
        e.nextBookingId = e.nextBookingId ?? b.id;
        e.nextSide = e.nextSide ?? b.side;
      }
      by.set(key, e);
    }
    const all = [...by.values()].sort((a, b) => b.pending - a.pending || a.name.localeCompare(b.name));
    return pendingOnly ? all.filter((r) => r.pendingBookings > 0) : all;
  }, [bookings, pendingOnly]);

  const t = rows.reduce(
    (a, r) => ({ wt: a.wt + r.wt, delivered: a.delivered + r.delivered, pending: a.pending + r.pending, value: a.value + r.value }),
    { wt: 0, delivered: 0, pending: 0, value: 0 },
  );

  return (
    <>
      <label className="mb-2 flex items-center gap-1 text-[12px] text-[#444]">
        <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />
        only customers with something pending ({rows.filter((r) => r.pendingBookings > 0).length})
      </label>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr>
              {["CUSTOMER", "PHONE", "BOOKINGS", "PENDING BOOKINGS", "WT", "DELIVERED", "PENDING", "VALUE", "ACTION"].map((h) => (
                <th key={h} className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td className={`${td} text-center text-[#777]`} colSpan={9}>No customers yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.partyId} className={r.pendingBookings === 0 ? "bg-[#f2f7f2] text-[#5c6b5c]" : undefined}>
                <td className={td}>{r.name}</td>
                <td className={td}>{r.phone ?? ""}</td>
                <td className={tdNum}>{r.bookings}</td>
                <td className={`${tdNum} ${r.pendingBookings ? "font-bold text-[#8b0000]" : ""}`}>{r.pendingBookings}</td>
                <td className={tdNum}>{f3(r.wt)}</td>
                <td className={tdNum}>{f3(r.delivered)}</td>
                <td className={`${tdNum} font-semibold`}>{f3(r.pending)}</td>
                <td className={tdNum}>{f2(r.value)}</td>
                <td className={td}>
                  {r.nextBookingId ? (
                    <Link href={`/entry?booking=${r.nextBookingId}`} className={btnGo}>
                      {r.nextSide === "buy" ? "Purchase entry" : "Sales entry"}
                    </Link>
                  ) : (
                    <span className="text-[11px] text-[#777]">all delivered</span>
                  )}
                </td>
              </tr>
            ))}
            <tr className="bg-[#eef2f2] font-bold">
              <td className={td} colSpan={4}>TOTAL — {rows.length} customer(s)</td>
              <td className={tdNum}>{f3(t.wt)}</td>
              <td className={tdNum}>{f3(t.delivered)}</td>
              <td className={tdNum}>{f3(t.pending)}</td>
              <td className={tdNum}>{f2(t.value)}</td>
              <td className={td}></td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---- the "- OR +" position sheet ----------------------------------------

function PositionSheet({ bookings, lots, mcx, onOpenTrades }: { bookings: BookingRow[]; lots: LotRow[]; mcx: McxSummary; onOpenTrades: () => void }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();

  const totals = useMemo(() => {
    const live = bookings.filter((b) => b.status !== "cancelled");
    const pend = (t: BookType, s: BookSide) =>
      live.filter((b) => b.bookType === t && b.side === s).reduce((a, b) => a + Math.max(0, b.pending), 0);
    const wt = (s: BookSide) =>
      live.filter((b) => b.bookType === "unfixed" && b.side === s && b.status !== "delivered").reduce((a, b) => a + b.weight, 0);
    return {
      readySellPending: pend("ready", "sell"),
      readyBuyPending: pend("ready", "buy"),
      forwardSellPending: pend("forward", "sell"),
      forwardBuyPending: pend("forward", "buy"),
      unfixedSellWeight: wt("sell"),
      unfixedBuyWeight: wt("buy"),
    };
  }, [bookings]);

  const customerLots = lots.filter((l) => l.block === "customer");
  // MCX lots come from the trade register: net long = BUY, net short = SELL
  const accountLots = mcx.positions
    .filter((p) => Math.abs(p.netLots) > 0.0005)
    .map((p) => ({ name: p.account, sellLots: p.netLots < 0 ? -p.netLots : 0, buyLots: p.netLots > 0 ? p.netLots : 0 }));
  const pos = computePosition({ ...totals, customerLots, accountLots });

  return (
    <div className="flex flex-col gap-5">
      {/* the hedge check, front and centre */}
      <div
        className={`border-2 px-4 py-3 ${pos.hedged ? "border-[#0a7a3f] bg-[#eaf6ef]" : "border-[#8b0000] bg-[#fdecea]"}`}
      >
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="text-[12px] font-bold uppercase tracking-wide text-[#444]">Hedge check</span>
          <span className={`text-[24px] font-bold tabular-nums ${pos.hedged ? "text-[#0a7a3f]" : "text-[#8b0000]"}`}>
            {pos.netLots.toFixed(3)} lots
          </span>
          <span className="text-[13px] font-semibold">
            {pos.hedged
              ? "Book and MCX are square."
              : pos.actionLots > 0
                ? `Not square — BUY ${pos.actionLots.toFixed(3)} lot(s) on MCX to flatten.`
                : `Not square — SELL ${Math.abs(pos.actionLots).toFixed(3)} lot(s) on MCX to flatten.`}
          </span>
          <span className="ml-auto text-[11px] text-[#666]">book {pos.bookLots.toFixed(3)} + MCX {pos.mcxLots.toFixed(3)} = {pos.netLots.toFixed(3)}</span>
        </div>
      </div>

      {/* the bridge: sheet totals -> net grams -> lots */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr>
              {["", "SELL", "BUY", "NET (g)", "LOTS", "FORMULA"].map((h) => <th key={h} className={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            <PosRow label="R (ready)" sell={totals.readySellPending} buy={totals.readyBuyPending} net={pos.readyNetGrams} lots={pos.readyLots} formula="BUY − SELL, on PENDING" />
            <PosRow label="F (forward)" sell={totals.forwardSellPending} buy={totals.forwardBuyPending} net={pos.forwardNetGrams} lots={pos.forwardLots} formula="BUY − SELL, on PENDING" />
            <PosRow label="UF (unfixed)" sell={totals.unfixedSellWeight} buy={totals.unfixedBuyWeight} net={pos.unfixedNetGrams} lots={pos.unfixedLots} formula="SELL − BUY, on WT" />
            <tr>
              <td className={td}>CUS (lots)</td>
              <td className={tdNum}>{pos.customerSellLots.toFixed(3)}</td>
              <td className={tdNum}>{pos.customerBuyLots.toFixed(3)}</td>
              <td className={tdNum}>—</td>
              <td className={`${tdNum} font-semibold`}>{pos.customerNetLots.toFixed(3)}</td>
              <td className={`${td} text-[11px] text-[#666]`}>SELL − BUY, already in lots</td>
            </tr>
            <tr className="bg-[#eef2f2] font-bold">
              <td className={td} colSpan={4}>BOOK EXPOSURE</td>
              <td className={tdNum}>{pos.bookLots.toFixed(3)}</td>
              <td className={`${td} text-[11px]`}>sum of the rows above</td>
            </tr>
            <tr className="bg-[#eef2f2] font-bold">
              <td className={td} colSpan={4}>MCX POSITION</td>
              <td className={tdNum}>{pos.mcxLots.toFixed(3)}</td>
              <td className={`${td} text-[11px]`}>BUY − SELL across MCX ids</td>
            </tr>
            <tr className={`font-bold ${pos.hedged ? "bg-[#eaf6ef]" : "bg-[#fdecea]"}`}>
              <td className={td} colSpan={4}>NET (must be 0)</td>
              <td className={tdNum}>{pos.netLots.toFixed(3)}</td>
              <td className={`${td} text-[11px]`}>book + MCX</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <LotBlock
          title="Customers (lots)"
          hint="Customers who deal in lots rather than grams. SELL +, BUY −."
          block="customer"
          rows={customerLots}
          busy={busy}
          onChange={() => router.refresh()}
          startTransition={startTransition}
        />
        <div>
          <div className="mb-1 flex items-baseline gap-2">
            <h3 className="text-[14px] font-bold">MCX accounts (lots)</h3>
            <span className="text-[11px] text-[#666]">From the MCX trade register. BUY +, SELL −.</span>
            <button className={`${btnGo} ml-auto`} onClick={onOpenTrades}>Record MCX trade</button>
          </div>
          <table className="w-full border-collapse">
            <thead><tr>{["MCX ID", "SELL", "BUY", "AVG /10g"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {accountLots.length === 0 && <tr><td className={`${td} text-center text-[#777]`} colSpan={4}>No open MCX lots.</td></tr>}
              {accountLots.map((r) => {
                const p = mcx.positions.find((x) => x.account === r.name);
                return (
                  <tr key={r.name}>
                    <td className={td}>{r.name}</td>
                    <td className={tdNum}>{r.sellLots ? r.sellLots.toFixed(3) : ""}</td>
                    <td className={tdNum}>{r.buyLots ? r.buyLots.toFixed(3) : ""}</td>
                    <td className={tdNum}>{p?.avgPrice != null ? p.avgPrice.toFixed(2) : <span className="text-[#8a6d10]">no price</span>}</td>
                  </tr>
                );
              })}
              <tr className="bg-[#eef2f2] font-bold">
                <td className={td}>TOTAL</td>
                <td className={tdNum}>{pos.accountSellLots.toFixed(3)}</td>
                <td className={tdNum}>{pos.accountBuyLots.toFixed(3)}</td>
                <td className={`${tdNum} text-[11px] font-semibold`}>net {pos.mcxLots > 0 ? "+" : ""}{pos.mcxLots.toFixed(3)} lots</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-[#666]">
            MCX P&amp;L so far: <b className={mcx.total > 0.005 ? "text-[#0a7a3f]" : mcx.total < -0.005 ? "text-[#8b0000]" : ""}>{mcx.total < 0 ? "−" : ""}₹{new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(mcx.total))}</b>
            {" "}(₹{PER_LOT_PER_RUPEE} per lot per ₹1 move).
          </p>
        </div>
      </div>
    </div>
  );
}

function PosRow({ label, sell, buy, net, lots, formula }: { label: string; sell: number; buy: number; net: number; lots: number; formula: string }) {
  return (
    <tr>
      <td className={td}>{label}</td>
      <td className={tdNum}>{sell.toFixed(3)}</td>
      <td className={tdNum}>{buy.toFixed(3)}</td>
      <td className={tdNum}>{net.toFixed(3)}</td>
      <td className={`${tdNum} font-semibold`}>{lots.toFixed(3)}</td>
      <td className={`${td} text-[11px] text-[#666]`}>{formula}</td>
    </tr>
  );
}

function LotBlock({
  title, hint, block, rows, busy, onChange, startTransition,
}: {
  title: string; hint: string; block: "customer" | "account"; rows: LotRow[];
  busy: boolean; onChange: () => void; startTransition: (cb: () => void) => void;
}) {
  const [name, setName] = useState("");
  const [sell, setSell] = useState("");
  const [buy, setBuy] = useState("");

  function add() {
    if (!name.trim()) return;
    startTransition(async () => {
      await saveLotPositionAction({ block, name, sellLots: nn(sell), buyLots: nn(buy) });
      setName(""); setSell(""); setBuy("");
      onChange();
    });
  }

  const tSell = rows.reduce((a, r) => a + r.sellLots, 0);
  const tBuy = rows.reduce((a, r) => a + r.buyLots, 0);
  const net = block === "account" ? tBuy - tSell : tSell - tBuy;

  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <h3 className="text-[14px] font-bold">{title}</h3>
        <span className="text-[11px] text-[#666]">{hint}</span>
      </div>
      <div className="mb-1 grid grid-cols-[1fr_80px_80px_auto] gap-1">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={block === "account" ? "MCX ID" : "Name"} className={cellInp} onKeyDown={(e) => e.key === "Enter" && add()} />
        <input inputMode="decimal" value={sell} onChange={(e) => setSell(e.target.value)} placeholder="SELL" className={`${cellInp} text-right`} onKeyDown={(e) => e.key === "Enter" && add()} />
        <input inputMode="decimal" value={buy} onChange={(e) => setBuy(e.target.value)} placeholder="BUY" className={`${cellInp} text-right`} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className={btnGo} onClick={add} disabled={busy}>Add</button>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>{["NAME", "SELL", "BUY", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td className={`${td} text-center text-[#777]`} colSpan={4}>None.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={td}>{r.name}</td>
              <td className={tdNum}>{r.sellLots ? r.sellLots.toFixed(3) : ""}</td>
              <td className={tdNum}>{r.buyLots ? r.buyLots.toFixed(3) : ""}</td>
              <td className={`${td} text-center`}>
                <button className="text-[#8b0000] underline" onClick={() => startTransition(async () => { await deleteLotPositionAction(r.id); onChange(); })}>Del</button>
              </td>
            </tr>
          ))}
          <tr className="bg-[#eef2f2] font-bold">
            <td className={td}>TOTAL</td>
            <td className={tdNum}>{tSell.toFixed(3)}</td>
            <td className={tdNum}>{tBuy.toFixed(3)}</td>
            <td className={`${tdNum}`}>{net.toFixed(3)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
