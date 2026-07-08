import Link from "next/link";
import { notFound } from "next/navigation";
import { getTransaction } from "@/lib/queries/transactions";
import { Card } from "@/components/ui";
import { fmtMoney, fmtWeight, fmtRate, fmtTouch, fmtDate, metalLabel, payModeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase text-mute";
const td = "px-2 py-1.5 text-[13px]";

export default async function TxnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTransaction(id);
  if (!t) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/history" className="text-sm text-mute hover:text-ink">← History</Link>
        <span className="text-xs text-mute">Print with your browser (Ctrl/Cmd + P)</span>
      </div>

      <div className="print-slip">
        <Card className="p-5">
          <div className="mb-3 flex items-baseline justify-between border-b border-line pb-3">
            <div>
              <span className="text-xs uppercase tracking-widest text-mute">{t.trnType}</span>
              <div className="font-serif text-xl font-bold text-ink">#{String(t.serialNo).padStart(4, "0")}</div>
            </div>
            <div className="text-right text-sm text-mute">
              <div>{t.partyName ?? "—"}</div>
              <div>{fmtDate(t.txnDate)} · {metalLabel(t.metal)}</div>
              <div>By {t.createdBy ?? "—"}</div>
            </div>
          </div>

          <table className="w-full">
            <thead><tr className="border-b border-line2"><th className={th}>Particulars</th><th className={th}>Weight</th><th className={th}>Touch</th><th className={th}>Pure</th><th className={th}>Rate</th><th className={th}>Amount</th></tr></thead>
            <tbody>
              {t.lines.map((l) => (
                <tr key={l.id} className="border-b border-line2">
                  <td className={td}>{l.particulars ?? "—"}</td>
                  <td className={`${td} num`}>{fmtWeight(l.weight)}</td>
                  <td className={`${td} num`}>{fmtTouch(l.touch)}</td>
                  <td className={`${td} num`}>{fmtWeight(l.pure)}</td>
                  <td className={`${td} num`}>{fmtRate(l.rate)}/g</td>
                  <td className={`${td} num font-semibold`}>{fmtMoney(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {t.movements.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[11px] font-semibold uppercase text-mute">Metal receipts / payments</div>
              {t.movements.map((m) => (
                <div key={m.id} className="flex justify-between text-[13px]"><span className="capitalize text-mid">{m.direction} · {m.particulars ?? metalLabel(t.metal)}</span><span className="num">{fmtWeight(m.weight)} @ {fmtTouch(m.touch)} → {fmtWeight(m.pure)} pure</span></div>
              ))}
            </div>
          )}

          {t.settlements.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[11px] font-semibold uppercase text-mute">Settlement</div>
              {t.settlements.map((s) => (
                <div key={s.id} className="flex justify-between text-[13px]"><span className="text-mid">{payModeLabel[s.mode]} {s.direction}{s.bankName ? ` · ${s.bankName}` : ""}</span><span className="num">{fmtMoney(s.amount)}</span></div>
              ))}
            </div>
          )}

          <div className="mt-3 border-t border-line pt-2">
            <div className="flex justify-between text-sm"><span className="text-mute">Value</span><span className="num">{fmtMoney(t.grossAmount)}</span></div>
            {t.tdsAmount > 0 && <div className="flex justify-between text-sm"><span className="text-mute">TDS</span><span className="num">{fmtMoney(t.tdsAmount)}</span></div>}
            <div className="flex justify-between border-t border-line pt-1 font-semibold text-ink"><span>Total</span><span className="num text-lg">{fmtMoney(t.netAmount)}</span></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
