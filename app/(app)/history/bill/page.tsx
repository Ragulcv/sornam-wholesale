import Link from "next/link";
import { notFound } from "next/navigation";
import { getCombinedBill } from "@/lib/queries/transactions";
import { Card } from "@/components/ui";
import { fmtMoney, fmtWeight, fmtRate, fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase text-mute";
const td = "px-2 py-1.5 text-[13px]";

export default async function CombinedBillPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids } = await searchParams;
  const idList = (ids ?? "").split(",").filter(Boolean);
  const bill = await getCombinedBill(idList);
  if (!bill) notFound();

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
              <span className="text-xs uppercase tracking-widest text-mute">Combined bill</span>
              <div className="font-serif text-xl font-bold text-ink">{bill.partyName ?? "—"}</div>
            </div>
            <div className="text-right text-sm text-mute">
              <div>{fmtDate(new Date())}</div>
              <div>Entries: {bill.serialNos.map((n) => `#${String(n).padStart(4, "0")}`).join(", ")}</div>
            </div>
          </div>

          <table className="w-full">
            <thead><tr className="border-b border-line2"><th className={th}>Particulars</th><th className={th}>Weight</th><th className={th}>Pure</th><th className={th}>Rate</th><th className={th}>Amount</th></tr></thead>
            <tbody>
              {bill.lines.map((l, i) => (
                <tr key={i} className="border-b border-line2">
                  <td className={td}>{l.particulars ?? "—"}</td>
                  <td className={`${td} num`}>{fmtWeight(l.weight)}</td>
                  <td className={`${td} num`}>{fmtWeight(l.pure)}</td>
                  <td className={`${td} num`}>{fmtRate(l.rate)}/g</td>
                  <td className={`${td} num font-semibold`}>{fmtMoney(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 border-t border-line pt-2">
            <div className="flex justify-between text-sm"><span className="text-mute">Gross ({bill.lines.length} items)</span><span className="num">{fmtMoney(bill.gross)}</span></div>
            {bill.tds > 0 && <div className="flex justify-between text-sm"><span className="text-mute">TDS</span><span className="num">{fmtMoney(bill.tds)}</span></div>}
            <div className="flex justify-between border-t border-line pt-1 font-semibold text-ink"><span>Total</span><span className="num text-lg">{fmtMoney(bill.total)}</span></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
