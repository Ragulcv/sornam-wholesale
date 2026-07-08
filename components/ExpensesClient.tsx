"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createExpenseAction, deleteTransactionAction } from "@/app/actions";
import { Card, PageHeader } from "@/components/ui";
import Toolbar from "@/components/Toolbar";
import { fmtMoney, fmtDate } from "@/lib/format";

type PartyOpt = { id: string; name: string; phone: string | null };
type Expense = { id: string; serialNo: number; date: string; party: string | null; cash: number; bank: number; total: number; createdBy: string | null };
const inp = "w-full rounded-md border border-line bg-cream px-2 py-1.5 text-sm outline-none focus:border-gold";
const nn = (s: string) => parseFloat(s) || 0;

export default function ExpensesClient({ expenses, parties }: { expenses: Expense[]; parties: PartyOpt[] }) {
  const router = useRouter();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [partyId, setPartyId] = useState<string | null>(null);
  const [partyQuery, setPartyQuery] = useState("");
  const [showParties, setShowParties] = useState(false);
  const [cash, setCash] = useState("");
  const [bank, setBank] = useState("");
  const [bankName, setBankName] = useState("");
  const [narration, setNarration] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const party = parties.find((p) => p.id === partyId) ?? null;
  const matches = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    return parties.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [parties, partyQuery]);

  function clear() {
    setPartyId(null); setPartyQuery(""); setCash(""); setBank(""); setBankName(""); setNarration(""); setError(null);
  }

  async function save() {
    setError(null);
    if (nn(cash) <= 0 && nn(bank) <= 0) { setError("Enter a cash or bank amount."); return; }
    setSaving(true);
    const r = await createExpenseAction({ partyId, txnDate: date, cashPaid: nn(cash), bankPaid: nn(bank), bankName, narration });
    setSaving(false);
    if (r.ok) { clear(); router.refresh(); }
    else setError(r.error ?? "Could not save.");
  }

  return (
    <>
      <PageHeader title="Expenses" subtitle="Shop expenses — cash / bank out." />
      <Toolbar items={[{ label: "Add", onClick: clear, primary: true }, { label: "Save", onClick: save, disabled: saving }, { label: "Cancel", onClick: clear }]} />

      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><span className="mb-1 block text-[11px] font-semibold uppercase text-mute">Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} /></div>
          <div className="relative col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-mute">Party (optional)</span>
            <input value={party ? party.name : partyQuery} onChange={(e) => { setPartyQuery(e.target.value); setPartyId(null); setShowParties(true); }} onFocus={() => setShowParties(true)} onBlur={() => setTimeout(() => setShowParties(false), 150)} className={inp} placeholder="Search party" autoComplete="off" />
            {showParties && matches.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-line bg-pearl py-1 shadow-lg">
                {matches.map((p) => (<li key={p.id}><button type="button" onMouseDown={(e) => { e.preventDefault(); setPartyId(p.id); setPartyQuery(p.name); setShowParties(false); }} className="w-full px-3 py-1.5 text-left text-sm hover:bg-cream">{p.name}</button></li>))}
              </ul>
            )}
          </div>
          <div><span className="mb-1 block text-[11px] font-semibold uppercase text-mute">Cash</span><input inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} className={`${inp} num`} /></div>
          <div><span className="mb-1 block text-[11px] font-semibold uppercase text-mute">Bank</span><input inputMode="decimal" value={bank} onChange={(e) => setBank(e.target.value)} className={`${inp} num`} /></div>
          <div><span className="mb-1 block text-[11px] font-semibold uppercase text-mute">Bank name</span><input value={bankName} onChange={(e) => setBankName(e.target.value)} className={inp} /></div>
          <div className="col-span-2 sm:col-span-4"><span className="mb-1 block text-[11px] font-semibold uppercase text-mute">Narration</span><input value={narration} onChange={(e) => setNarration(e.target.value)} className={inp} /></div>
        </div>
        {error && <p className="mt-3 rounded-lg bg-[#fdecea] px-3 py-2 text-sm text-neg">{error}</p>}
      </Card>

      <Card className="divide-y divide-line2">
        {expenses.length === 0 && <div className="px-4 py-8 text-center text-sm text-mute">No expenses yet.</div>}
        {expenses.map((e) => (
          <div key={e.id} className="flex items-center gap-3 px-4 py-3">
            <span className="num w-12 text-xs font-semibold text-gold-deep">#{String(e.serialNo).padStart(4, "0")}</span>
            <span className="w-24 text-xs text-mute">{fmtDate(e.date)}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{e.party ?? "—"}</span>
            <span className="text-xs text-mute">{e.cash > 0 && `cash ${fmtMoney(e.cash)}`} {e.bank > 0 && `bank ${fmtMoney(e.bank)}`}</span>
            <span className="num w-28 text-right font-semibold text-ink">{fmtMoney(e.cash + e.bank)}</span>
            <button onClick={async () => { await deleteTransactionAction(e.id); router.refresh(); }} className="rounded-lg border border-line bg-pearl px-2 py-1 text-xs text-mute hover:border-[#f1c9c4] hover:text-neg">Del</button>
          </div>
        ))}
      </Card>
    </>
  );
}
