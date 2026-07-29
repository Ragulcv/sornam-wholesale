"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createBookingAction,
  deliverBookingAction,
  deleteBookingAction,
  type BookingActionInput,
} from "@/app/actions";
import { getPartyBalanceAction } from "@/app/(app)/bookings/actions";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import Toolbar from "@/components/Toolbar";
import { fmtMoney, fmtWeight, fmtRate, metalLabel } from "@/lib/format";
import { round3 } from "@/lib/bullion";
import { buildBookingWhatsapp } from "@/lib/whatsapp";
import type { BookingRow } from "@/lib/queries/bookings";

type PartyOpt = { id: string; name: string; phone: string | null };
const inp = "w-full rounded-md border border-line bg-cream px-2 py-1.5 text-sm outline-none focus:border-gold";
const nn = (s: string) => parseFloat(s) || 0;

export default function BookingsClient({
  bookings,
  parties,
  shortage,
  goldRate,
  silverRate,
  chart,
}: {
  bookings: BookingRow[];
  parties: PartyOpt[];
  shortage: { gold: number; silver: number };
  goldRate: number | null;
  silverRate: number | null;
  chart?: React.ReactNode;
}) {
  const router = useRouter();
  const [metal, setMetal] = useState<"gold" | "silver">("gold");
  const [bookMode, setBookMode] = useState<"metal" | "amount">("metal");
  const [partyId, setPartyId] = useState<string | null>(null);
  const [partyQuery, setPartyQuery] = useState("");
  const [showParties, setShowParties] = useState(false);
  const [weight, setWeight] = useState("");
  const [rate, setRate] = useState("");
  const [amount, setAmount] = useState("");
  const [advance, setAdvance] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [fetchingRate, setFetchingRate] = useState(false);

  async function useLiveRate() {
    setFetchingRate(true);
    try {
      const r = await fetch("/api/price/current");
      const d = await r.json();
      const val = metal === "gold" ? d.gold : d.silver;
      if (d.ok && val != null) setRate(String(val));
    } catch { /* ignore */ } finally {
      setFetchingRate(false);
    }
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ serialNo: number; whatsappUrl: string | null } | null>(null);
  const [deliver, setDeliver] = useState<BookingRow | null>(null);

  const party = parties.find((p) => p.id === partyId) ?? null;
  const matches = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    return parties.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.phone || "").includes(q)).slice(0, 8);
  }, [parties, partyQuery]);

  // By-amount bookings imply a weight: amount ÷ rate/g.
  const impliedGrams = useMemo(() => {
    const a = nn(amount), r = nn(rate);
    return r > 0 ? round3(a / r) : 0;
  }, [amount, rate]);

  function clearForm() {
    setPartyId(null); setPartyQuery(""); setWeight(""); setRate(""); setAmount(""); setAdvance(""); setNewPhone("");
    setError(null);
  }
  function resetAll() {
    clearForm();
    setResult(null);
  }

  async function save() {
    setError(null);
    if (!partyId && !partyQuery.trim()) { setError("Pick or type a customer."); return; }
    setSaving(true);
    const input: BookingActionInput = {
      partyId,
      partyName: party ? party.name : partyQuery.trim() || undefined,
      partyPhone: party ? party.phone ?? undefined : newPhone.trim() || undefined,
      metal, bookMode,
      weightBooked: bookMode === "metal" ? nn(weight) : null,
      lockedRate: nn(rate) || null,
      amount: bookMode === "amount" ? nn(amount) : null,
      advancePaid: nn(advance),
    };
    const r = await createBookingAction(input);
    setSaving(false);
    if (r.ok) { setResult({ serialNo: r.serialNo as number, whatsappUrl: (r.whatsappUrl as string) ?? null }); clearForm(); router.refresh(); }
    else setError(r.error ?? "Could not save.");
  }

  // Enter in any text/number input submits the booking.
  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); if (!saving) save(); }
  };

  const anyShort = shortage.gold > 0 || shortage.silver > 0;

  return (
    <>
      <PageHeader title="Bookings" subtitle="Reserve metal or amount; deliver later." />
      {chart}
      <Toolbar items={[{ label: "Add", onClick: resetAll, primary: true }, { label: "Save", onClick: save, disabled: saving }, { label: "Cancel", onClick: resetAll }]} />

      {anyShort && (
        <Card className="mb-4 border-[#f1c9c4] bg-[#fdf0ee] p-3">
          <span className="text-sm font-semibold text-neg">
            Booked more than stock —{shortage.gold > 0 ? ` short by ${fmtWeight(shortage.gold)} gold` : ""}{shortage.gold > 0 && shortage.silver > 0 ? "," : ""}{shortage.silver > 0 ? ` short by ${fmtWeight(shortage.silver)} silver` : ""} in stock. Bookings are still saved.
          </span>
        </Card>
      )}

      {result && (
        <Card className="mb-4 flex items-center justify-between gap-3 border-[#cde9d8] bg-[#eaf6ef] p-4">
          <span className="text-sm font-semibold text-pos">Booking #{String(result.serialNo).padStart(4, "0")} saved.</span>
          <div className="flex gap-2">
            {result.whatsappUrl && <a href={result.whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={() => setResult(null)} className="rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-bold text-white">Send WhatsApp</a>}
            <button onClick={() => setResult(null)} className="rounded-lg border border-line bg-pearl px-3 py-1.5 text-xs font-semibold text-mid">Dismiss</button>
          </div>
        </Card>
      )}

      {/* Booking form */}
      <Card className="mb-5 p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {(["metal", "amount"] as const).map((m) => (
            <button key={m} onClick={() => setBookMode(m)} className={`rounded-lg border px-4 py-2 text-sm font-semibold ${bookMode === m ? "border-gold bg-[rgba(201,162,39,.1)] text-gold-deep" : "border-line bg-cream text-mid"}`}>{m === "metal" ? "By grams" : "By amount"}</button>
          ))}
          <div className="ml-auto flex gap-2">
            {(["gold", "silver"] as const).map((m) => (
              <button key={m} onClick={() => setMetal(m)} className={`rounded-lg border px-4 py-2 text-sm font-semibold capitalize ${metal === m ? "border-gold bg-[rgba(201,162,39,.1)] text-gold-deep" : "border-line bg-cream text-mid"}`}>{m}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="relative col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-mute">Party — pick or type new</span>
            <input value={party ? party.name : partyQuery} onChange={(e) => { setPartyQuery(e.target.value); setPartyId(null); setShowParties(true); }} onFocus={() => setShowParties(true)} onBlur={() => setTimeout(() => setShowParties(false), 150)} onKeyDown={onEnter} className={inp} placeholder="Search or add customer" autoComplete="off" />
            {showParties && matches.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-line bg-pearl py-1 shadow-lg">
                {matches.map((p) => (<li key={p.id}><button type="button" onMouseDown={(e) => { e.preventDefault(); setPartyId(p.id); setPartyQuery(p.name); setShowParties(false); }} className="flex w-full justify-between px-3 py-1.5 text-left text-sm hover:bg-cream"><span>{p.name}</span><span className="text-xs text-mute">{p.phone}</span></button></li>))}
              </ul>
            )}
          </div>
          <div className="col-span-2"><span className="mb-1 block text-[11px] font-semibold uppercase text-mute">Phone</span><input inputMode="tel" value={party ? party.phone ?? "" : newPhone} onChange={(e) => setNewPhone(e.target.value)} onKeyDown={onEnter} readOnly={!!party} className={inp} placeholder="if new customer" /></div>
          {bookMode === "metal" ? (
            <>
              <div><span className="mb-1 block text-[11px] font-semibold uppercase text-mute">Weight (g)</span><input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} onKeyDown={onEnter} className={`${inp} num`} /></div>
              <div><span className="mb-1 block text-[11px] font-semibold uppercase text-mute">Locked rate /g</span>
                <div className="flex gap-1">
                  <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} onKeyDown={onEnter} className={`${inp} num flex-1`} placeholder={String((metal === "gold" ? goldRate : silverRate) ?? "")} />
                  <button type="button" onClick={useLiveRate} disabled={fetchingRate} className="flex-none rounded-md border border-gold/40 bg-[rgba(201,162,39,.08)] px-2 text-xs font-semibold text-gold-deep disabled:opacity-50">{fetchingRate ? "…" : "Live"}</button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="col-span-2"><span className="mb-1 block text-[11px] font-semibold uppercase text-mute">Amount (₹)</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={onEnter} className={`${inp} num`} /></div>
              <div><span className="mb-1 block text-[11px] font-semibold uppercase text-mute">Rate /g</span>
                <div className="flex gap-1">
                  <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} onKeyDown={onEnter} className={`${inp} num flex-1`} placeholder={String((metal === "gold" ? goldRate : silverRate) ?? "")} />
                  <button type="button" onClick={useLiveRate} disabled={fetchingRate} className="flex-none rounded-md border border-gold/40 bg-[rgba(201,162,39,.08)] px-2 text-xs font-semibold text-gold-deep disabled:opacity-50">{fetchingRate ? "…" : "Live"}</button>
                </div>
              </div>
              <div><span className="mb-1 block text-[11px] font-semibold uppercase text-mute">Implied grams</span>
                <div className={`${inp} num flex items-center text-mid`}>{impliedGrams > 0 ? fmtWeight(impliedGrams) : "—"}</div>
              </div>
            </>
          )}
          <div><span className="mb-1 block text-[11px] font-semibold uppercase text-mute">Advance (₹)</span><input inputMode="decimal" value={advance} onChange={(e) => setAdvance(e.target.value)} onKeyDown={onEnter} className={`${inp} num`} /></div>
          {/* In-form prominent submit — sits to the right of Advance. */}
          <div className="col-span-2 flex items-end sm:col-span-1">
            <button type="button" onClick={save} disabled={saving} className="gold-grad w-full rounded-md px-4 py-2 text-sm font-bold text-onyx disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving…" : "Save booking"}</button>
          </div>
        </div>
        {error && <p className="mt-3 rounded-lg bg-[#fdecea] px-3 py-2 text-sm text-neg">{error}</p>}
      </Card>

      {/* List */}
      <Card className="divide-y divide-line2">
        {bookings.length === 0 && <div className="px-4 py-8 text-center text-sm text-mute">No bookings yet.</div>}
        {bookings.map((b) => (
          <div key={b.id} className="flex items-center gap-3 px-4 py-3">
            <div className="num w-12 text-xs font-semibold text-gold-deep">#{String(b.serialNo).padStart(4, "0")}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="truncate font-medium text-ink">{b.partyName}</span><StatusBadge status={b.status === "open" ? "open" : b.status === "delivered" ? "completed" : "partial"} /></div>
              <div className="text-xs text-mute">
                {metalLabel(b.metal)} · {b.bookMode === "metal" ? `${fmtWeight(b.weightBooked ?? 0)}${b.lockedRate ? ` @ ${fmtRate(b.lockedRate)}/g` : ""}` : `Amount ${fmtMoney(b.amount ?? 0)}${b.lockedRate ? ` @ ${fmtRate(b.lockedRate)}/g ≈ ${fmtWeight(round3((b.amount ?? 0) / b.lockedRate))}` : ""}`}
                {b.advancePaid > 0 && ` · advance ${fmtMoney(b.advancePaid)}`}
              </div>
              {b.status !== "delivered" && b.status !== "cancelled" && b.bookMode === "metal" && shortage[b.metal] > 0 && (
                <div className="mt-0.5 text-[11px] font-semibold text-neg">Booked — short by {fmtWeight(shortage[b.metal])} in stock</div>
              )}
            </div>
            {b.partyPhone && (
              <a
                href={buildBookingWhatsapp(b.partyPhone, { partyName: b.partyName ?? "Customer", metal: b.metal, bookMode: b.bookMode, weight: b.weightBooked ?? undefined, rate: b.lockedRate ?? undefined, amount: b.amount ?? undefined, advance: b.advancePaid })}
                target="_blank" rel="noopener noreferrer" title="Send WhatsApp confirmation"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#25D366] text-white hover:bg-[#1fb855]"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15l-1.4 5 5.1-1.3A10 10 0 1 0 12 2Zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20Z" /></svg>
              </a>
            )}
            {b.status !== "delivered" && b.status !== "cancelled" && (
              <button onClick={() => setDeliver(b)} className="rounded-lg border border-[#cde9d8] bg-[#eaf6ef] px-3 py-1.5 text-xs font-semibold text-pos hover:bg-[#dcefe4]">Deliver</button>
            )}
            <button onClick={async () => { await deleteBookingAction(b.id); router.refresh(); }} className="rounded-lg border border-line bg-pearl px-2.5 py-1.5 text-xs font-semibold text-mute hover:border-[#f1c9c4] hover:text-neg">Del</button>
          </div>
        ))}
      </Card>

      {deliver && <DeliverModal booking={deliver} onClose={() => setDeliver(null)} onDone={() => { setDeliver(null); router.refresh(); }} />}
    </>
  );
}

function DeliverModal({ booking, onClose, onDone }: { booking: BookingRow; onClose: () => void; onDone: () => void }) {
  const [weight, setWeight] = useState(booking.weightBooked != null ? String(booking.weightBooked) : "");
  const [touch, setTouch] = useState("");
  const [rate, setRate] = useState(booking.lockedRate != null ? String(booking.lockedRate) : "");
  const [cash, setCash] = useState("");
  const [bank, setBank] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wa, setWa] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  async function go() {
    setError(null);
    if (nn(weight) <= 0) { setError("Enter delivered weight."); return; }
    setBusy(true);
    const r = await deliverBookingAction({
      bookingId: booking.id, partyName: booking.partyName ?? undefined, partyPhone: booking.partyPhone ?? undefined,
      metal: booking.metal, barRate: nn(rate) || undefined,
      lines: [{ kind: "sale", particulars: `${metalLabel(booking.metal)} delivery`, weight: nn(weight), touch: nn(touch) || undefined, rate: nn(rate) }],
      settlements: [
        { mode: "cash" as const, direction: "received" as const, amount: nn(cash) },
        { mode: "bank" as const, direction: "received" as const, amount: nn(bank) },
      ].filter((s) => s.amount > 0),
    });
    setBusy(false);
    if (r.ok) {
      setWa((r.whatsappUrl as string) ?? null);
      try { setBalance(await getPartyBalanceAction(booking.partyId)); } catch { /* balance is best-effort */ }
    }
    else setError(r.error ?? "Could not deliver.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-pearl p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 font-serif text-xl font-semibold text-ink">Deliver booking #{String(booking.serialNo).padStart(4, "0")}</h3>
        <p className="mb-4 text-sm text-mute">{booking.partyName} · enter purity now (not captured at booking).</p>
        {wa === null ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              <div><span className="mb-1 block text-xs text-mute">Weight (g)</span><input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} className={`${inp} num`} /></div>
              <div><span className="mb-1 block text-xs text-mute">Touch</span><input inputMode="decimal" value={touch} onChange={(e) => setTouch(e.target.value)} className={`${inp} num`} /></div>
              <div><span className="mb-1 block text-xs text-mute">Rate /g</span><input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className={`${inp} num`} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="mb-1 block text-xs text-mute">Cash received</span><input inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} className={`${inp} num`} /></div>
              <div><span className="mb-1 block text-xs text-mute">Bank received</span><input inputMode="decimal" value={bank} onChange={(e) => setBank(e.target.value)} className={`${inp} num`} /></div>
            </div>
            {error && <p className="rounded-lg bg-[#fdecea] px-3 py-2 text-sm text-neg">{error}</p>}
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-mid hover:bg-cream">Cancel</button>
              <button onClick={go} disabled={busy} className="gold-grad flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-onyx disabled:opacity-50">{busy ? "…" : "Deliver & create sale"}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="rounded-lg bg-[#eaf6ef] px-3 py-2 text-sm text-pos">Delivered — sale entry created.</p>
            {balance !== null && (
              <div className="flex items-center justify-between rounded-lg border border-line bg-cream px-3 py-2 text-sm">
                <span className="text-mute">{booking.partyName} balance</span>
                {Math.abs(balance) < 0.01 ? (
                  <span className="font-semibold text-mid">Settled</span>
                ) : balance < 0 ? (
                  <span className="font-semibold text-neg">Owes {fmtMoney(-balance)}</span>
                ) : (
                  <span className="font-semibold text-pos">To receive {fmtMoney(balance)}</span>
                )}
              </div>
            )}
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" onClick={onDone} className="rounded-xl bg-[#25D366] px-4 py-3 text-center font-bold text-white">Send delivered WhatsApp</a>}
            <button onClick={onDone} className="gold-grad rounded-xl px-4 py-2.5 text-sm font-bold text-onyx">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
