"use client";

// MCX TRADES tab: the hedge's own trade register. Every trade (gold, 1 kg
// lots, price per 10 g) goes in here; open positions, booked profit and open
// profit are worked out from it, and the "- OR +" hedge check reads its MCX
// lots from here too, so nothing is typed twice.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMcxTradeAction, deleteMcxTradeAction, saveMcxCloseAction } from "@/app/actions";
import { PER_LOT_PER_RUPEE, type AccountPosition } from "@/lib/mcx";
import { todayKey, SHOP_TZ } from "@/lib/dates";
import type { McxTradeView } from "@/lib/queries/mcx";

export interface McxSummary {
  positions: AccountPosition[];
  trades: McxTradeView[];
  realised: number;
  unrealised: number;
  total: number;
  netLots: number;
  latestClose: { day: string; price: number } | null;
  unpricedOpenLots: number;
  unpricedMatchedLots: number;
}

const th = "border border-[#1f5c5c] bg-[#31797a] px-2 py-[4px] text-[11px] font-bold uppercase tracking-wide text-white text-left whitespace-nowrap";
const td = "border border-[#c3d4d4] px-2 py-[3px] text-[13px] text-black whitespace-nowrap";
const tdNum = `${td} text-right tabular-nums`;
const cellInp = "h-[22px] w-full border border-[#7f9db9] bg-white px-1 text-[13px] text-black outline-none focus:border-[#3b6ea5]";
const btn = "rounded-[3px] border border-[#adadad] bg-gradient-to-b from-[#f6f6f6] to-[#e2e2e2] px-3 py-[3px] text-[13px] text-black hover:from-white hover:to-[#eaeaea] disabled:opacity-40";
const btnGo = "rounded-[3px] border border-[#1f5c5c] bg-[#31797a] px-3 py-[3px] text-[13px] font-semibold text-white hover:bg-[#296767] disabled:opacity-40";
const nn = (s: string) => parseFloat(s) || 0;
const money = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n);
const dmy = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: SHOP_TZ, day: "2-digit", month: "short", year: "2-digit" });
const pl = (n: number) => (n > 0.005 ? "text-[#0a7a3f]" : n < -0.005 ? "text-[#8b0000]" : "");

type Draft = { day: string; account: string; side: "buy" | "sell"; lots: string; price: string; remarks: string };
const blank = (): Draft => ({ day: todayKey(), account: "", side: "buy", lots: "", price: "", remarks: "" });

export default function McxTradesSheet({ mcx }: { mcx: McxSummary }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(blank());
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft>(blank());
  const [closeDay, setCloseDay] = useState(todayKey);
  const [closePrice, setClosePrice] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const accounts = useMemo(() => [...new Set(mcx.trades.map((t) => t.account))].sort(), [mcx.trades]);
  const close = mcx.latestClose;

  const run = (fn: () => Promise<{ ok?: boolean; error?: string } | void>, okText: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r && "error" in r && r.error) setMsg({ ok: false, text: r.error });
      else { setMsg({ ok: true, text: okText }); after?.(); router.refresh(); }
    });

  const add = () =>
    run(() => saveMcxTradeAction({ day: draft.day, account: draft.account, side: draft.side, lots: nn(draft.lots), price: draft.price ? nn(draft.price) : null, remarks: draft.remarks }),
      `${draft.side === "buy" ? "Bought" : "Sold"} ${draft.lots} lot(s) on ${draft.account || "—"}.`,
      () => setDraft((d) => ({ ...blank(), day: d.day, account: d.account })));

  const saveEdit = (id: string) =>
    run(() => saveMcxTradeAction({ id, day: edit.day, account: edit.account, side: edit.side, lots: nn(edit.lots), price: edit.price ? nn(edit.price) : null, remarks: edit.remarks }),
      "Trade updated.", () => setEditing(null));

  const onEnter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); add(); } };

  return (
    <div className="flex flex-col gap-4">
      {/* headline */}
      <div className="flex flex-wrap gap-[2px]">
        {[
          { l: "Open lots (net)", v: `${mcx.netLots > 0 ? "+" : ""}${mcx.netLots.toFixed(3)}`, c: "" },
          { l: "Booked profit", v: `₹${money(mcx.realised)}`, c: pl(mcx.realised) },
          { l: close ? `Open profit @ ${money(close.price)} (${dmy(close.day)})` : "Open profit", v: close ? `₹${money(mcx.unrealised)}` : "enter a close", c: pl(mcx.unrealised) },
          { l: "Total MCX P&L", v: `₹${money(mcx.total)}`, c: pl(mcx.total) },
        ].map((x) => (
          <div key={x.l} className="min-w-[160px] flex-1 border border-[#c3d4d4] bg-[#f7faf9] px-3 py-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[#5b6b6b]">{x.l}</div>
            <div className={`text-[16px] font-bold tabular-nums ${x.c || "text-[#1f5c5c]"}`}>{x.v}</div>
          </div>
        ))}
      </div>

      {(mcx.unpricedOpenLots > 0 || mcx.unpricedMatchedLots > 0) && (
        <div className="border border-[#e6cf8a] bg-[#fff8e1] px-3 py-1.5 text-[12px] font-semibold text-[#8a6d10]">
          {mcx.unpricedOpenLots > 0 && `${mcx.unpricedOpenLots.toFixed(3)} open lot(s) have no price, so their profit can't be counted. `}
          {mcx.unpricedMatchedLots > 0 && `${mcx.unpricedMatchedLots.toFixed(3)} lot(s) were closed against a trade with no price. `}
          Click Edit on those trades and add the price.
        </div>
      )}

      {/* new trade */}
      <div>
        <h3 className="mb-1 text-[14px] font-bold">Record an MCX trade <span className="text-[11px] font-normal text-[#666]">Gold, 1 lot = 1 kg, price per 10 g as MCX quotes it</span></h3>
        <div className="overflow-x-auto">
          <div className="grid min-w-[820px] grid-cols-[120px_1fr_110px_80px_120px_1fr_auto] gap-1">
            {["DATE", "MCX ID", "BUY / SELL", "LOTS", "PRICE /10g", "REMARKS", ""].map((h) => <span key={h} className="text-[10px] font-bold uppercase tracking-wide text-[#5b6b6b]">{h}</span>)}
            <input aria-label="Trade date" type="date" value={draft.day} onChange={(e) => setDraft({ ...draft, day: e.target.value })} className={cellInp} />
            <input aria-label="MCX ID" list="mcx-ids" value={draft.account} onChange={(e) => setDraft({ ...draft, account: e.target.value })} onKeyDown={onEnter} placeholder="e.g. MCX ID 1" className={cellInp} />
            <select aria-label="Buy or sell" value={draft.side} onChange={(e) => setDraft({ ...draft, side: e.target.value as "buy" | "sell" })} className={`${cellInp} font-semibold ${draft.side === "buy" ? "text-[#0a7a3f]" : "text-[#8b0000]"}`}>
              <option value="buy">BUY</option>
              <option value="sell">SELL</option>
            </select>
            <input aria-label="Lots" inputMode="decimal" value={draft.lots} onChange={(e) => setDraft({ ...draft, lots: e.target.value })} onKeyDown={onEnter} className={`${cellInp} text-right`} />
            <input aria-label="Price per 10 g" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} onKeyDown={onEnter} placeholder="148000" className={`${cellInp} text-right`} />
            <input aria-label="Remarks" value={draft.remarks} onChange={(e) => setDraft({ ...draft, remarks: e.target.value })} onKeyDown={onEnter} className={cellInp} />
            <button className={btnGo} onClick={add} disabled={busy}>{busy ? "…" : "Add"}</button>
          </div>
          <datalist id="mcx-ids">{accounts.map((a) => <option key={a} value={a} />)}</datalist>
        </div>
        {nn(draft.lots) > 0 && nn(draft.price) > 0 && (
          <p className="mt-1 text-[11px] text-[#555]">
            {nn(draft.lots)} lot(s) = {(nn(draft.lots) * 1000).toLocaleString("en-IN")} g · every ₹1 move in the price = ₹{money(nn(draft.lots) * PER_LOT_PER_RUPEE)}
          </p>
        )}
        {msg && <p className={`mt-1 text-[13px] font-semibold ${msg.ok ? "text-[#0a7a3f]" : "text-[#8b0000]"}`}>{msg.text}</p>}
      </div>

      {/* closing rate */}
      <div className="flex flex-wrap items-end gap-2 border border-[#c3d4d4] bg-[#f7faf9] px-3 py-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-[#5b6b6b]">MCX closing rate for</div>
          <input aria-label="Close date" type="date" value={closeDay} onChange={(e) => setCloseDay(e.target.value)} className={`${cellInp} w-[140px]`} />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-[#5b6b6b]">Close /10g</div>
          <input aria-label="MCX close per 10 g" inputMode="decimal" value={closePrice} onChange={(e) => setClosePrice(e.target.value)} placeholder={close ? String(close.price) : "148500"} className={`${cellInp} w-[120px] text-right`}
            onKeyDown={(e) => { if (e.key === "Enter") run(() => saveMcxCloseAction(closeDay, nn(closePrice)), `Close saved for ${dmy(closeDay)}.`, () => setClosePrice("")); }} />
        </div>
        <button className={btnGo} disabled={busy} onClick={() => run(() => saveMcxCloseAction(closeDay, nn(closePrice)), `Close saved for ${dmy(closeDay)}.`, () => setClosePrice(""))}>Save close</button>
        <span className="text-[12px] text-[#555]">
          {close ? <>Latest close <b>{money(close.price)}</b> on {dmy(close.day)}. Open lots are valued at it.</> : "No close entered yet, so open lots show no profit."}
          {close && close.day !== todayKey() && mcx.netLots !== 0 && <b className="ml-1 text-[#8a6d10]">Today&apos;s close not entered yet.</b>}
        </span>
      </div>

      {/* positions */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead><tr>{["MCX ID", "OPEN", "AVG PRICE /10g", "BOOKED PROFIT", "OPEN PROFIT", "TOTAL"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>
            {mcx.positions.length === 0 && <tr><td className={`${td} text-center text-[#777]`} colSpan={6}>No MCX trades yet.</td></tr>}
            {mcx.positions.map((p) => {
              const open = close && p.avgPrice != null ? (close.price - p.avgPrice) * (p.netLots - Math.sign(p.netLots) * p.unpricedLots) * PER_LOT_PER_RUPEE : 0;
              return (
                <tr key={p.account}>
                  <td className={td}>{p.account}</td>
                  <td className={`${tdNum} font-semibold ${p.netLots > 0 ? "text-[#0a7a3f]" : p.netLots < 0 ? "text-[#8b0000]" : ""}`}>
                    {p.netLots > 0 ? `BUY ${p.netLots.toFixed(3)}` : p.netLots < 0 ? `SELL ${(-p.netLots).toFixed(3)}` : "square"}
                  </td>
                  <td className={tdNum}>{p.avgPrice != null ? money(p.avgPrice) : ""}</td>
                  <td className={`${tdNum} ${pl(p.realised)}`}>{money(p.realised)}</td>
                  <td className={`${tdNum} ${pl(open)}`}>{close ? money(open) : "—"}</td>
                  <td className={`${tdNum} font-semibold ${pl(p.realised + open)}`}>{money(p.realised + open)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* register */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse">
          <thead><tr>{["No.", "DATE", "MCX ID", "SIDE", "LOTS", "PRICE /10g", "REMARKS", "ACTION"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>
            {mcx.trades.length === 0 && <tr><td className={`${td} text-center text-[#777]`} colSpan={8}>Every MCX buy and sell goes here.</td></tr>}
            {mcx.trades.map((t) =>
              editing === t.id ? (
                <tr key={t.id} className="bg-[#fffbe6]">
                  <td className={tdNum}>{t.serialNo}</td>
                  <td className={td}><input type="date" value={edit.day} onChange={(e) => setEdit({ ...edit, day: e.target.value })} className={cellInp} /></td>
                  <td className={td}><input list="mcx-ids" value={edit.account} onChange={(e) => setEdit({ ...edit, account: e.target.value })} className={cellInp} /></td>
                  <td className={td}>
                    <select value={edit.side} onChange={(e) => setEdit({ ...edit, side: e.target.value as "buy" | "sell" })} className={cellInp}><option value="buy">BUY</option><option value="sell">SELL</option></select>
                  </td>
                  <td className={td}><input inputMode="decimal" value={edit.lots} onChange={(e) => setEdit({ ...edit, lots: e.target.value })} className={`${cellInp} w-20 text-right`} /></td>
                  <td className={td}><input inputMode="decimal" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} className={`${cellInp} w-28 text-right`} /></td>
                  <td className={td}><input value={edit.remarks} onChange={(e) => setEdit({ ...edit, remarks: e.target.value })} className={cellInp} /></td>
                  <td className={td}><div className="flex gap-1"><button className={btnGo} disabled={busy} onClick={() => saveEdit(t.id)}>Save</button><button className={btn} onClick={() => setEditing(null)}>Cancel</button></div></td>
                </tr>
              ) : (
                <tr key={t.id} className={t.price == null ? "bg-[#fff8e1]" : undefined}>
                  <td className={tdNum}>{t.serialNo}</td>
                  <td className={td}>{dmy(t.day)}</td>
                  <td className={td}>{t.account}</td>
                  <td className={`${td} font-bold ${t.side === "buy" ? "text-[#0a7a3f]" : "text-[#8b0000]"}`}>{t.side.toUpperCase()}</td>
                  <td className={tdNum}>{t.lots.toFixed(3)}</td>
                  <td className={tdNum}>{t.price != null ? money(t.price) : <span className="text-[#8a6d10]">no price</span>}</td>
                  <td className={td}>{t.remarks ?? ""}</td>
                  <td className={td}>
                    <div className="flex gap-1">
                      <button className={btn} onClick={() => { setEditing(t.id); setEdit({ day: t.day, account: t.account, side: t.side, lots: String(t.lots), price: t.price != null ? String(t.price) : "", remarks: t.remarks ?? "" }); }}>Edit</button>
                      <button className={btn} disabled={busy} onClick={() => run(() => deleteMcxTradeAction(t.id), "Trade deleted.")}>Del</button>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#666]">
        Buys and sells are paired oldest first within each MCX ID. Profit on a pair is booked the day it closes; what is still open is valued at the latest close.
      </p>
    </div>
  );
}
