import { listBookings } from "@/lib/queries/bookings";
import { listPartyOptions } from "@/lib/queries/parties";
import { getSettings } from "@/lib/auth";
import BookingsClient from "@/components/BookingsClient";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const [bookings, parties, s] = await Promise.all([
    listBookings(),
    listPartyOptions(),
    getSettings(),
  ]);
  return (
    <BookingsClient
      bookings={bookings}
      parties={parties}
      goldRate={s.defaultGoldRate ? parseFloat(s.defaultGoldRate) : null}
      silverRate={s.defaultSilverRate ? parseFloat(s.defaultSilverRate) : null}
    />
  );
}
