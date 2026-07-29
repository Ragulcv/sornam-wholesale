"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buyGoldAction } from "@/lib/queries/buyGold";
import { pure, lineAmount } from "@/lib/bullion";
import { fmtMoney, fmtWeight } from "@/lib/format";

const inp = "w-full rounded-md border border-line bg-cream px-3 py-2 text-sm outline-none focus:border-gold num";
const lbl = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-mute";

export default function BuyGoldForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [weight, setWeight] = useState("");
  const [touch, setTouch] = useState("");
  const [rate, setRate] = useState("");
  const [cashPaid, setCashPaid] = useState("");
  const [bankPaid, setBankPaid] = useState("");
  const [bankName, setBankName] = useState("");

  const w = parseFloat(weight) || 0;
  const t = parseFloat(touch) || 0;
  const r = parseFloat(rate) || 0;
  const pureAdded = pure(w, t);
  const amount = lineAmount(w, r);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    startTransition(async () => {
      const res = await buyGoldAction({
        weight: w,
        touch: t,
        rate: r,
        cashPaid: parseFloat(cashPaid) || 0,
        bankPaid: parseFloat(bankPaid) || 0,
        bankName: bankName.trim() || undefined,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOk(`Added ${fmtWeight(pureAdded)} pure gold to stock (bill #${String(res.serialNo).padStart(4, "0")}).`);
      setWeight("");
      setTouch("");
      setRate("");
      setCashPaid("");
      setBankPaid("");
      setBankName("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div>
          <span className={lbl}>Weight (g)</span>
          <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" placeholder="0.000" className={inp} />
        </div>
        <div>
          <span className={lbl}>Purity / touch</span>
          <input value={touch} onChange={(e) => setTouch(e.target.value)} inputMode="decimal" placeholder="91.60" className={inp} />
        </div>
        <div>
          <span className={lbl}>Price / gram (₹)</span>
          <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="0.00" className={inp} />
        </div>
        <div>
          <span className={lbl}>Cash paid (₹)</span>
          <input value={cashPaid} onChange={(e) => setCashPaid(e.target.value)} inputMode="decimal" placeholder="0.00" className={inp} />
        </div>
        <div>
          <span className={lbl}>Bank paid (₹)</span>
          <input value={bankPaid} onChange={(e) => setBankPaid(e.target.value)} inputMode="decimal" placeholder="0.00" className={inp} />
        </div>
        <div>
          <span className={lbl}>Bank name</span>
          <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="optional" className="w-full rounded-md border border-line bg-cream px-3 py-2 text-sm outline-none focus:border-gold" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-mid">
        <span>Pure gold added: <span className="num font-semibold text-ink">{fmtWeight(pureAdded)}</span></span>
        <span>Purchase amount: <span className="num font-semibold text-ink">{fmtMoney(amount)}</span></span>
      </div>

      {error && <p className="mt-3 rounded-lg bg-[#fdecea] px-3 py-2 text-sm text-neg">{error}</p>}
      {ok && <p className="mt-3 rounded-lg bg-[#eaf6ef] px-3 py-2 text-sm text-pos">{ok}</p>}

      <button type="submit" disabled={pending} className="gold-grad mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-onyx disabled:opacity-50">
        {pending ? "Recording…" : "Buy gold & add to stock"}
      </button>
    </form>
  );
}
