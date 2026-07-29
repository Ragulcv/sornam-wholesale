import { listBookings } from "@/lib/queries/bookings";
import { listPartyOptions } from "@/lib/queries/parties";
import { getStock } from "@/lib/queries/stock";
import { getSettings } from "@/lib/auth";
import { round3 } from "@/lib/bullion";
import BookingsClient from "@/components/BookingsClient";
import BookingStockChart from "@/components/BookingStockChart";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const [bookings, parties, s, stock] = await Promise.all([
    listBookings(),
    listPartyOptions(),
    getSettings(),
    getStock(),
  ]);

  // Open metal-mode bookings reserve weight; sum by metal.
  const openMetal = bookings.filter((b) => b.status !== "delivered" && b.status !== "cancelled" && b.bookMode === "metal");
  const bookedGold = round3(openMetal.filter((b) => b.metal === "gold").reduce((a, b) => a + (b.weightBooked ?? 0), 0));
  const bookedSilver = round3(openMetal.filter((b) => b.metal === "silver").reduce((a, b) => a + (b.weightBooked ?? 0), 0));

  // Non-blocking shortage: booked weight for the metal exceeds current pure stock.
  const shortGold = round3(Math.max(0, bookedGold - stock.currentPureGold));
  const shortSilver = round3(Math.max(0, bookedSilver - stock.currentPureSilver));

  return (
    <BookingsClient
      bookings={bookings}
      parties={parties}
      shortage={{ gold: shortGold, silver: shortSilver }}
      goldRate={s.defaultGoldRate ? parseFloat(s.defaultGoldRate) : null}
      silverRate={s.defaultSilverRate ? parseFloat(s.defaultSilverRate) : null}
      chart={
        <BookingStockChart
          gold={{ available: stock.currentPureGold, booked: bookedGold }}
          silver={{ available: stock.currentPureSilver, booked: bookedSilver }}
        />
      }
    />
  );
}
