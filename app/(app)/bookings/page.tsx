import { listBookings, listLotPositions, bookingSummary } from "@/lib/queries/bookings";
import { listPartyOptions } from "@/lib/queries/parties";
import BookingsWorkbook from "@/components/BookingsWorkbook";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const [bookings, parties, lots, summary] = await Promise.all([
    listBookings(),
    listPartyOptions(),
    listLotPositions(),
    bookingSummary(),
  ]);

  return <BookingsWorkbook bookings={bookings} parties={parties} lots={lots} summary={summary} />;
}
