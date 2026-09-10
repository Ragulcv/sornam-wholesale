import { listPartyOptions } from "@/lib/queries/parties";
import { listBookings } from "@/lib/queries/bookings";
import { getSettings } from "@/lib/auth";
import { getSession } from "@/lib/session";
import LogimaxEntryForm from "@/components/LogimaxEntryForm";

export const dynamic = "force-dynamic";

export default async function EntryPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const sp = await searchParams;
  const [parties, bookings, s, session] = await Promise.all([
    listPartyOptions(),
    // Pending bookings only, newest first: the salesperson picks the latest at
    // the top and works down to the oldest.
    listBookings({ pendingOnly: true }),
    getSettings(),
    getSession(),
  ]);

  return (
    <LogimaxEntryForm
      parties={parties}
      bookings={bookings.map((b) => ({
        id: b.id,
        partyId: b.partyId,
        partyName: b.partyName ?? "",
        partyPhone: b.partyPhone,
        side: b.side,
        bookType: b.bookType,
        metal: b.metal,
        pending: b.pending,
        weight: b.weight,
        rate: b.rate,
        mcxRate: b.mcxRate,
        bookDate: b.bookDate.toISOString(),
        serialNo: b.serialNo,
      }))}
      goldRate={s.defaultGoldRate ? parseFloat(s.defaultGoldRate) : null}
      silverRate={s.defaultSilverRate ? parseFloat(s.defaultSilverRate) : null}
      operatorName={session.operatorName}
      initialBookingId={sp.booking ?? null}
    />
  );
}
