import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";
import BookingImportClient from "@/components/BookingImportClient";

export const dynamic = "force-dynamic";

export default function BookingImportPage() {
  return (
    <>
      <PageHeader
        title="Import booking workbook"
        subtitle="Reads your own BOOKING.xlsx — R SELL, R BUY, F SELL, F BUY, UF CUS and the - OR + position sheet."
        action={<Link href="/bookings" className="rounded-xl border border-line bg-pearl px-4 py-2.5 text-sm font-semibold text-ink hover:bg-cream">Back to bookings</Link>}
      />
      <Card className="p-5">
        <BookingImportClient />
      </Card>
    </>
  );
}
