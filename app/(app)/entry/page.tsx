import { listPartyOptions } from "@/lib/queries/parties";
import { listBookings } from "@/lib/queries/bookings";
import { getSettings } from "@/lib/auth";
import { getSession } from "@/lib/session";
import LogimaxEntryForm from "@/components/LogimaxEntryForm";

export const dynamic = "force-dynamic";

export default async function EntryPage() {
  const [parties, bookings, s, session] = await Promise.all([
    listPartyOptions(),
    listBookings({ status: "open" }),
    getSettings(),
    getSession(),
  ]);
  return (
    <LogimaxEntryForm
      parties={parties}
      bookings={bookings.map((b) => ({
        id: b.id,
        label: `${b.partyName} · ${b.metal} · ${b.weightBooked ?? b.amount ?? ""}`,
      }))}
      goldRate={s.defaultGoldRate ? parseFloat(s.defaultGoldRate) : null}
      silverRate={s.defaultSilverRate ? parseFloat(s.defaultSilverRate) : null}
      operatorName={session.operatorName}
    />
  );
}
