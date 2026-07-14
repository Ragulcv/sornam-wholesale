import Link from "next/link";
import { listHistory } from "@/lib/queries/history";
import { listPartyOptions } from "@/lib/queries/parties";
import { PageHeader, Card } from "@/components/ui";
import { fmtMoney } from "@/lib/format";
import HistoryGrid from "@/components/HistoryGrid";

export const dynamic = "force-dynamic";

const TYPES = ["sales", "purchase", "expense"] as const;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; type?: string | string[]; q?: string }>;
}) {
  const sp = await searchParams;
  const typeParam = sp.type ? (Array.isArray(sp.type) ? sp.type : [sp.type]) : [];
  const trnTypes = TYPES.filter((t) => typeParam.includes(t)) as ("sales" | "purchase" | "expense")[];
  const [rows, parties] = await Promise.all([
    listHistory({ from: sp.from, to: sp.to, trnTypes, search: sp.q }),
    listPartyOptions(),
  ]);
  const totalValue = rows.reduce((a, r) => a + r.value, 0);

  const exportUrl =
    "/api/export/transactions?" +
    new URLSearchParams({ ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}), ...(sp.q ? { q: sp.q } : {}) }).toString() +
    trnTypes.map((t) => `&type=${t}`).join("");

  return (
    <>
      <PageHeader
        title="Transaction History"
        subtitle={`${rows.length} entries · value ${fmtMoney(totalValue)} · tick rows to bill or delete`}
        action={<a href={exportUrl} className="rounded-xl border border-line bg-pearl px-4 py-2.5 text-sm font-semibold text-ink hover:bg-cream">Export CSV</a>}
      />

      <Card className="mb-4 p-4">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-mute">From<input type="date" name="from" defaultValue={sp.from} className="mt-1 block rounded-md border border-line bg-cream px-2 py-1.5 text-sm" /></label>
          <label className="text-xs text-mute">To<input type="date" name="to" defaultValue={sp.to} className="mt-1 block rounded-md border border-line bg-cream px-2 py-1.5 text-sm" /></label>
          <div className="text-xs text-mute">Type
            <div className="mt-1 flex gap-3">
              {TYPES.map((t) => (
                <label key={t} className="flex items-center gap-1 text-sm capitalize text-ink"><input type="checkbox" name="type" value={t} defaultChecked={typeParam.includes(t)} /> {t}</label>
              ))}
            </div>
          </div>
          <label className="text-xs text-mute">Party
            <input name="q" defaultValue={sp.q} list="party-suggest" autoComplete="off" placeholder="type to suggest" className="mt-1 block rounded-md border border-line bg-cream px-2 py-1.5 text-sm" />
            <datalist id="party-suggest">{parties.map((p) => <option key={p.id} value={p.name} />)}</datalist>
          </label>
          <button className="gold-grad rounded-md px-4 py-1.5 text-sm font-bold text-onyx">Go</button>
          <Link href="/history" className="rounded-md border border-line px-3 py-1.5 text-sm text-mid hover:bg-cream">Reset</Link>
        </form>
        <p className="mt-2 text-xs text-mute">Tip: search a party, tick their deliveries, then <b>Create bill</b> to club them into one slip.</p>
      </Card>

      <HistoryGrid rows={rows} />
    </>
  );
}
