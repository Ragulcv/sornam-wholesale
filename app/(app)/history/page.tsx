import Link from "next/link";
import { listHistory } from "@/lib/queries/history";
import { PageHeader, Card } from "@/components/ui";
import { fmtMoney, fmtWeight, fmtDate, metalLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

const TYPES = ["sales", "purchase", "expense"] as const;
const th = "whitespace-nowrap px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide";
const td = "whitespace-nowrap px-2 py-1.5 text-[13px]";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; type?: string | string[]; q?: string }>;
}) {
  const sp = await searchParams;
  const typeParam = sp.type ? (Array.isArray(sp.type) ? sp.type : [sp.type]) : [];
  const trnTypes = TYPES.filter((t) => typeParam.includes(t)) as ("sales" | "purchase" | "expense")[];
  const rows = await listHistory({ from: sp.from, to: sp.to, trnTypes, search: sp.q });

  const totals = rows.reduce(
    (a, r) => ({ value: a.value + r.value, cash: a.cash + r.cashRecd + r.cashPaid, bank: a.bank + r.bankRecd + r.bankPaid }),
    { value: 0, cash: 0, bank: 0 },
  );

  const exportUrl =
    "/api/export/transactions?" +
    new URLSearchParams({ ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}), ...(sp.q ? { q: sp.q } : {}) }).toString() +
    trnTypes.map((t) => `&type=${t}`).join("");

  return (
    <>
      <PageHeader
        title="Transaction History"
        subtitle={`${rows.length} entries · value ${fmtMoney(totals.value)}`}
        action={
          <a href={exportUrl} className="rounded-xl border border-line bg-pearl px-4 py-2.5 text-sm font-semibold text-ink hover:bg-cream">
            Export CSV
          </a>
        }
      />

      {/* Filters (GET form) */}
      <Card className="mb-4 p-4">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-mute">From<input type="date" name="from" defaultValue={sp.from} className="mt-1 block rounded-md border border-line bg-cream px-2 py-1.5 text-sm" /></label>
          <label className="text-xs text-mute">To<input type="date" name="to" defaultValue={sp.to} className="mt-1 block rounded-md border border-line bg-cream px-2 py-1.5 text-sm" /></label>
          <div className="text-xs text-mute">Type
            <div className="mt-1 flex gap-3">
              {TYPES.map((t) => (
                <label key={t} className="flex items-center gap-1 text-sm capitalize text-ink">
                  <input type="checkbox" name="type" value={t} defaultChecked={typeParam.includes(t)} /> {t}
                </label>
              ))}
            </div>
          </div>
          <label className="text-xs text-mute">Party<input name="q" defaultValue={sp.q} placeholder="search" className="mt-1 block rounded-md border border-line bg-cream px-2 py-1.5 text-sm" /></label>
          <button className="gold-grad rounded-md px-4 py-1.5 text-sm font-bold text-onyx">Go</button>
          <Link href="/history" className="rounded-md border border-line px-3 py-1.5 text-sm text-mid hover:bg-cream">Reset</Link>
        </form>
      </Card>

      {/* Grid */}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1500px]">
          <thead className="bg-[#1f5f8b] text-white">
            <tr>
              {["No", "Type", "Date", "Party", "Metal", "Out Wg", "In Wg", "Out Pure", "In Pure", "MetalWg Recd", "MetalWg Paid", "MetalPure Recd", "MetalPure Paid", "Cash Recd", "Cash Paid", "Bank Recd", "Bank Paid", "Value", "TDS", "Total", "Created By", "Created", "Modified By", ""].map((h) => (
                <th key={h} className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td className="px-3 py-8 text-center text-sm text-mute" colSpan={24}>No transactions in range.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line2 odd:bg-[#faf8f3]">
                <td className={`${td} num text-gold-deep`}>{String(r.serialNo).padStart(4, "0")}</td>
                <td className={`${td} capitalize`}>{r.trnType}</td>
                <td className={td}>{fmtDate(r.txnDate)}</td>
                <td className={`${td} font-medium`}>{r.partyName ?? "—"}</td>
                <td className={td}>{metalLabel(r.metal)}</td>
                <td className={`${td} num`}>{r.outwardWg || ""}</td>
                <td className={`${td} num`}>{r.inwardWg || ""}</td>
                <td className={`${td} num`}>{r.outwardPure || ""}</td>
                <td className={`${td} num`}>{r.inwardPure || ""}</td>
                <td className={`${td} num`}>{r.metalWgRecd || ""}</td>
                <td className={`${td} num`}>{r.metalWgPaid || ""}</td>
                <td className={`${td} num`}>{r.metalPureRecd || ""}</td>
                <td className={`${td} num`}>{r.metalPurePaid || ""}</td>
                <td className={`${td} num`}>{r.cashRecd ? fmtMoney(r.cashRecd) : ""}</td>
                <td className={`${td} num`}>{r.cashPaid ? fmtMoney(r.cashPaid) : ""}</td>
                <td className={`${td} num`}>{r.bankRecd ? fmtMoney(r.bankRecd) : ""}</td>
                <td className={`${td} num`}>{r.bankPaid ? fmtMoney(r.bankPaid) : ""}</td>
                <td className={`${td} num`}>{fmtMoney(r.value)}</td>
                <td className={`${td} num`}>{r.tds ? fmtMoney(r.tds) : ""}</td>
                <td className={`${td} num font-semibold`}>{fmtMoney(r.total)}</td>
                <td className={td}>{r.createdBy ?? "—"}</td>
                <td className={td}>{fmtDate(r.createdAt)}</td>
                <td className={td}>{r.modifiedBy ?? "—"}</td>
                <td className={td}><Link href={`/history/${r.id}`} className="text-info hover:underline">View</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
