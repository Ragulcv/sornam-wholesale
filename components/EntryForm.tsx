"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createTransactionAction, type TxnActionInput } from "@/app/actions";
import { Card, PageHeader } from "@/components/ui";
import Toolbar from "@/components/Toolbar";
import { pure, lineAmount, round2, round3 } from "@/lib/bullion";
import { fmtMoney, fmtWeight } from "@/lib/format";

type PartyOpt = { id: string; name: string; phone: string | null };
type Line = { particulars: string; weight: string; rate: string };
type Move = { direction: "received" | "paid"; particulars: string; weight: string; touch: string; aTouch: string };

const inp = "w-full rounded-md border border-line bg-cream px-2 py-1.5 text-sm outline-none focus:border-gold";
const cell = "px-2 py-1 text-sm";
const nn = (s: string) => parseFloat(s) || 0;
const blankLine = (): Line => ({ particulars: "", weight: "", rate: "" });
const PARTICULARS = ["Gold pure", "Silver pure", "Gold bar", "Silver bar", "Coin", "Old gold"];
const blankMove = (): Move => ({ direction: "received", particulars: "", weight: "", touch: "", aTouch: "" });

export default function EntryForm({
  parties,
  tdsPercent,
  goldRate,
  silverRate,
}: {
  parties: PartyOpt[];
  tdsPercent: number;
  goldRate: number | null;
  silverRate: number | null;
}) {
  const router = useRouter();
  const [trnType, setTrnType] = useState<"sales" | "purchase">("sales");
  const [metal, setMetal] = useState<"gold" | "silver">("gold");
  const [partyId, setPartyId] = useState<string | null>(null);
  const [partyQuery, setPartyQuery] = useState("");
  const [showParties, setShowParties] = useState(false);
  const [txnDate, setTxnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [barRate, setBarRate] = useState("");
  const [refNo, setRefNo] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [fetchingRate, setFetchingRate] = useState(false);
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [cashRecd, setCashRecd] = useState("");
  const [cashPaid, setCashPaid] = useState("");
  const [bankRecd, setBankRecd] = useState("");
  const [bankPaid, setBankPaid] = useState("");
  const [bankName, setBankName] = useState("");
  const [tdsManual, setTdsManual] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ serialNo: number; whatsappUrl: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const party = parties.find((p) => p.id === partyId) ?? null;
  const matches = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    return parties.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.phone || "").includes(q)).slice(0, 8);
  }, [parties, partyQuery]);

  const computed = useMemo(() => {
    // Pure gold/silver → pure content equals weight (touch 100).
    const rows = lines.map((l) => {
      const w = nn(l.weight), r = nn(l.rate);
      return { pure: w, amount: lineAmount(w, r) };
    });
    const gross = round2(rows.reduce((a, r) => a + r.amount, 0));
    const totalWeight = round3(lines.reduce((a, l) => a + nn(l.weight), 0));
    const totalPure = round3(rows.reduce((a, r) => a + r.pure, 0));
    const tds = tdsManual != null ? nn(tdsManual) : round2((gross * tdsPercent) / 100);
    return { rows, gross, totalWeight, totalPure, tds, net: round2(gross - tds) };
  }, [lines, tdsPercent, tdsManual]);

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, { ...blankLine(), rate: barRate }]);
  }
  function setMove(i: number, patch: Partial<Move>) {
    setMoves((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  }
  function addMove() {
    setMoves((ms) => [...ms, blankMove()]);
  }
  async function useLiveRate() {
    setFetchingRate(true);
    try {
      const r = await fetch("/api/price/current");
      const d = await r.json();
      const val = metal === "gold" ? d.gold : d.silver;
      if (d.ok && val != null) setBarRate(String(val));
    } catch { /* ignore */ } finally {
      setFetchingRate(false);
    }
  }

  function clearAll() {
    setPartyId(null); setPartyQuery(""); setBarRate(""); setRefNo(""); setNewPhone("");
    setLines([blankLine()]); setMoves([]);
    setCashRecd(""); setCashPaid(""); setBankRecd(""); setBankPaid(""); setBankName("");
    setTdsManual(null); setResult(null); setError(null);
  }

  async function save() {
    setError(null);
    const validLines = lines.filter((l) => nn(l.weight) > 0);
    if (validLines.length === 0) { setError("Add at least one line item."); return; }
    setSaving(true);
    const kind = trnType === "sales" ? "sale" : "purchase";
    const input: TxnActionInput = {
      trnType, partyId,
      partyName: party ? party.name : partyQuery.trim() || undefined,
      partyPhone: party ? party.phone ?? undefined : newPhone.trim() || undefined,
      metal, txnDate, barRate: nn(barRate) || undefined, refNo: refNo || undefined,
      tdsAmount: computed.tds,
      lines: validLines.map((l) => ({ kind, particulars: l.particulars, weight: nn(l.weight), touch: 100, rate: nn(l.rate) })),
      movements: moves.filter((m) => nn(m.weight) > 0).map((m) => ({ direction: m.direction, particulars: m.particulars, weight: nn(m.weight), touch: nn(m.touch) || undefined, aTouch: nn(m.aTouch) || undefined })),
      settlements: [
        { mode: "cash" as const, direction: "received" as const, amount: nn(cashRecd) },
        { mode: "cash" as const, direction: "paid" as const, amount: nn(cashPaid) },
        { mode: "bank" as const, direction: "received" as const, amount: nn(bankRecd), bankName },
        { mode: "bank" as const, direction: "paid" as const, amount: nn(bankPaid), bankName },
      ].filter((s) => s.amount > 0),
    };
    const r = await createTransactionAction(input);
    setSaving(false);
    if (r.ok) { setResult({ serialNo: r.serialNo as number, whatsappUrl: (r.whatsappUrl as string) ?? null }); router.refresh(); }
    else setError(r.error ?? "Could not save.");
  }

  if (result) {
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#eaf6ef] text-pos">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <h2 className="font-serif text-2xl font-semibold text-ink">Entry #{String(result.serialNo).padStart(4, "0")} saved</h2>
        <div className="mt-5 flex flex-col gap-2">
          {result.whatsappUrl && (
            <a href={result.whatsappUrl} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#25D366] px-4 py-3 font-bold text-white">Send WhatsApp confirmation</a>
          )}
          <button onClick={clearAll} className="gold-grad rounded-xl px-4 py-3 font-bold text-onyx">+ New entry</button>
        </div>
      </Card>
    );
  }

  return (
    <>
      <PageHeader title="Sales / Purchase" subtitle="Metal + cash entry." />
      <Toolbar items={[
        { label: "Add", onClick: clearAll, primary: true },
        { label: "Save", onClick: save, disabled: saving },
        { label: "Cancel", onClick: clearAll },
      ]} />

      {/* Header */}
      <Card className="mb-4 p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {(["sales", "purchase"] as const).map((t) => (
            <button key={t} onClick={() => setTrnType(t)} className={`rounded-lg border px-4 py-2 text-sm font-semibold capitalize ${trnType === t ? "border-gold bg-[rgba(201,162,39,.1)] text-gold-deep" : "border-line bg-cream text-mid"}`}>{t}</button>
          ))}
          <div className="ml-auto flex gap-2">
            {(["gold", "silver"] as const).map((m) => (
              <button key={m} onClick={() => setMetal(m)} className={`rounded-lg border px-4 py-2 text-sm font-semibold capitalize ${metal === m ? "border-gold bg-[rgba(201,162,39,.1)] text-gold-deep" : "border-line bg-cream text-mid"}`}>{m}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <div className="relative col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-mute">Party — pick or type new</span>
            <input value={party ? party.name : partyQuery} onChange={(e) => { setPartyQuery(e.target.value); setPartyId(null); setShowParties(true); }} onFocus={() => setShowParties(true)} onBlur={() => setTimeout(() => setShowParties(false), 150)} className={inp} placeholder="Search or add customer" autoComplete="off" />
            {showParties && matches.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-line bg-pearl py-1 shadow-lg">
                {matches.map((p) => (
                  <li key={p.id}><button type="button" onMouseDown={(e) => { e.preventDefault(); setPartyId(p.id); setPartyQuery(p.name); setShowParties(false); }} className="flex w-full justify-between px-3 py-1.5 text-left text-sm hover:bg-cream"><span>{p.name}</span><span className="text-xs text-mute">{p.phone}</span></button></li>
                ))}
              </ul>
            )}
          </div>
          <div><span className="mb-1 block text-[11px] font-semibold uppercase text-mute">Phone</span><input inputMode="tel" value={party ? party.phone ?? "" : newPhone} onChange={(e) => setNewPhone(e.target.value)} readOnly={!!party} className={inp} placeholder="if new" /></div>
          <div><span className="mb-1 block text-[11px] font-semibold uppercase text-mute">Date</span><input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} className={inp} /></div>
          <div>
            <span className="mb-1 block text-[11px] font-semibold uppercase text-mute">Bar rate /g</span>
            <div className="flex gap-1">
              <input inputMode="decimal" value={barRate} onChange={(e) => setBarRate(e.target.value)} className={`${inp} num flex-1`} placeholder={String((metal === "gold" ? goldRate : silverRate) ?? "")} />
              <button type="button" onClick={useLiveRate} disabled={fetchingRate} title="Use live MCX rate" className="flex-none rounded-md border border-gold/40 bg-[rgba(201,162,39,.08)] px-2 text-xs font-semibold text-gold-deep disabled:opacity-50">{fetchingRate ? "…" : "Live"}</button>
            </div>
          </div>
          <div><span className="mb-1 block text-[11px] font-semibold uppercase text-mute">Ref No</span><input value={refNo} onChange={(e) => setRefNo(e.target.value)} className={inp} /></div>
        </div>
      </Card>

      {/* Line items — pure metal, no touch */}
      <Card className="mb-4 overflow-x-auto">
        <datalist id="particulars-opts">{PARTICULARS.map((p) => <option key={p} value={p} />)}</datalist>
        <table className="w-full min-w-[560px] text-left">
          <thead className="border-b border-line2 bg-[#f3efe6] text-[11px] uppercase tracking-wider text-mute">
            <tr><th className={cell}>#</th><th className={cell}>Particulars</th><th className={cell}>Weight (g)</th><th className={cell}>Pure</th><th className={cell}>Rate /g</th><th className={cell}>Amount</th><th className={cell}></th></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-line2">
                <td className={`${cell} text-mute`}>{i + 1}</td>
                <td className={cell}><input list="particulars-opts" value={l.particulars} onChange={(e) => setLine(i, { particulars: e.target.value })} className={inp} placeholder="Gold pure" /></td>
                <td className={cell}><input inputMode="decimal" value={l.weight} onChange={(e) => setLine(i, { weight: e.target.value })} className={`${inp} num w-28`} /></td>
                <td className={`${cell} num text-mute`}>{fmtWeight(computed.rows[i]?.pure ?? 0)}</td>
                <td className={cell}><input inputMode="decimal" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} className={`${inp} num w-28`} /></td>
                <td className={`${cell} num font-semibold text-ink`}>{fmtMoney(computed.rows[i]?.amount ?? 0)}</td>
                <td className={cell}>{lines.length > 1 && <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-xs text-neg">✕</button>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[#faf7f0] font-semibold text-ink">
              <td className={cell} colSpan={2}><button onClick={addLine} className="rounded-md border border-line bg-pearl px-3 py-1 text-xs font-semibold hover:bg-cream">+ Add row</button></td>
              <td className={`${cell} num`}>{fmtWeight(computed.totalWeight)}</td>
              <td className={`${cell} num`}>{fmtWeight(computed.totalPure)}</td>
              <td className="text-right text-[11px] uppercase text-mute">Total</td>
              <td className={`${cell} num`}>{fmtMoney(computed.gross)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {/* Metal receipts / payments */}
      <Card className="mb-4 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-mute">Metal receipts / payments (optional)</span>
          <button onClick={addMove} className="rounded-md border border-line bg-pearl px-3 py-1 text-xs font-semibold hover:bg-cream">+ Add</button>
        </div>
        {moves.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead className="text-[11px] uppercase tracking-wider text-mute"><tr><th className={cell}>Dir</th><th className={cell}>Particulars</th><th className={cell}>Weight</th><th className={cell}>Touch</th><th className={cell}>A.Touch</th><th className={cell}>Pure</th><th className={cell}></th></tr></thead>
              <tbody>
                {moves.map((m, i) => (
                  <tr key={i} className="border-t border-line2">
                    <td className={cell}>
                      <select value={m.direction} onChange={(e) => setMove(i, { direction: e.target.value as "received" | "paid" })} className={`${inp} w-24`}>
                        <option value="received">Received</option>
                        <option value="paid">Paid</option>
                      </select>
                    </td>
                    <td className={cell}><input value={m.particulars} onChange={(e) => setMove(i, { particulars: e.target.value })} className={inp} /></td>
                    <td className={cell}><input inputMode="decimal" value={m.weight} onChange={(e) => setMove(i, { weight: e.target.value })} className={`${inp} num w-20`} /></td>
                    <td className={cell}><input inputMode="decimal" value={m.touch} onChange={(e) => setMove(i, { touch: e.target.value })} className={`${inp} num w-16`} /></td>
                    <td className={cell}><input inputMode="decimal" value={m.aTouch} onChange={(e) => setMove(i, { aTouch: e.target.value })} className={`${inp} num w-16`} /></td>
                    <td className={`${cell} num text-mute`}>{fmtWeight(pure(nn(m.weight), nn(m.touch)))}</td>
                    <td className={cell}><button onClick={() => setMoves((ms) => ms.filter((_, j) => j !== i))} className="text-xs text-neg">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Settlement + totals */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-mute">Settlement (cash / bank, split allowed)</div>
          <div className="grid grid-cols-2 gap-3">
            <div><span className="mb-1 block text-xs text-mute">Cash received</span><input inputMode="decimal" value={cashRecd} onChange={(e) => setCashRecd(e.target.value)} className={`${inp} num`} /></div>
            <div><span className="mb-1 block text-xs text-mute">Cash paid</span><input inputMode="decimal" value={cashPaid} onChange={(e) => setCashPaid(e.target.value)} className={`${inp} num`} /></div>
            <div><span className="mb-1 block text-xs text-mute">Bank received</span><input inputMode="decimal" value={bankRecd} onChange={(e) => setBankRecd(e.target.value)} className={`${inp} num`} /></div>
            <div><span className="mb-1 block text-xs text-mute">Bank paid</span><input inputMode="decimal" value={bankPaid} onChange={(e) => setBankPaid(e.target.value)} className={`${inp} num`} /></div>
            <div className="col-span-2"><span className="mb-1 block text-xs text-mute">Bank name</span><input value={bankName} onChange={(e) => setBankName(e.target.value)} className={inp} /></div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between py-1 text-sm"><span className="text-mute">Gross amount</span><span className="num font-semibold text-ink">{fmtMoney(computed.gross)}</span></div>
          <div className="flex items-center justify-between py-1 text-sm">
            <span className="text-mute">TDS ({tdsPercent}%)</span>
            <input inputMode="decimal" value={tdsManual ?? String(computed.tds)} onChange={(e) => setTdsManual(e.target.value)} className={`${inp} num w-28 text-right`} />
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-line pt-2"><span className="font-semibold text-ink">Net amount</span><span className="num text-lg font-bold text-ink">{fmtMoney(computed.net)}</span></div>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-onyx px-3 py-2 text-sm"><span className="text-[#b8b2a4]">Total pure ({metal})</span><span className="num text-gold-hi">{fmtWeight(computed.totalPure)}</span></div>
          {error && <p className="mt-3 rounded-lg bg-[#fdecea] px-3 py-2 text-sm text-neg">{error}</p>}
          <button onClick={save} disabled={saving} className="gold-grad mt-4 h-12 w-full rounded-xl font-bold text-onyx disabled:opacity-50">{saving ? "Saving…" : "Save entry"}</button>
        </Card>
      </div>
    </>
  );
}
