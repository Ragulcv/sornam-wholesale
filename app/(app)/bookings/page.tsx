import { listBookings, listLotPositions, bookingSummary } from "@/lib/queries/bookings";
import { listPartyOptions } from "@/lib/queries/parties";
import { getStock } from "@/lib/queries/stock";
import { getMessageTemplates } from "@/lib/queries/settings";
import { getMcxBook } from "@/lib/queries/mcx";
import { round3 } from "@/lib/bullion";
import BookingsWorkbook from "@/components/BookingsWorkbook";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const [bookings, parties, lots, summary, stock, templates, mcx] = await Promise.all([
    listBookings(),
    listPartyOptions(),
    listLotPositions(),
    bookingSummary(),
    getStock(),
    getMessageTemplates(),
    getMcxBook(),
  ]);

  // Metal promised out (pending sell bookings) that current stock cannot cover.
  // Non-blocking: bookings still save, the strip just says so.
  const soldPendingGold = round3(
    bookings
      .filter((b) => b.side === "sell" && b.metal === "gold" && b.status !== "cancelled" && b.status !== "delivered")
      .reduce((a, b) => a + Math.max(0, b.bookType === "unfixed" ? b.weight : b.pending), 0),
  );
  const soldPendingSilver = round3(
    bookings
      .filter((b) => b.side === "sell" && b.metal === "silver" && b.status !== "cancelled" && b.status !== "delivered")
      .reduce((a, b) => a + Math.max(0, b.bookType === "unfixed" ? b.weight : b.pending), 0),
  );
  return (
    <BookingsWorkbook
      bookings={bookings}
      parties={parties}
      lots={lots}
      summary={summary}
      shortage={{
        gold: round3(Math.max(0, soldPendingGold - stock.currentPureGold)),
        silver: round3(Math.max(0, soldPendingSilver - stock.currentPureSilver)),
      }}
      bookingTemplate={templates.booking}
      mcx={{
        positions: mcx.positions,
        trades: mcx.trades,
        realised: mcx.realised,
        unrealised: mcx.unrealised,
        total: mcx.total,
        netLots: mcx.netLots,
        latestClose: mcx.latestClose,
        unpricedOpenLots: mcx.unpricedOpenLots,
        unpricedMatchedLots: mcx.unpricedMatchedLots,
      }}
    />
  );
}
