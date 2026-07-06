import Link from "next/link";
import { listBookings } from "@/lib/queries";
import { EmptyState, PageHeader } from "@/components/ui";
import BookingsList from "@/components/BookingsList";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "", label: "All" },
  { key: "open", label: "Open" },
  { key: "partial", label: "Partial" },
  { key: "completed", label: "Completed" },
];

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; customer?: string }>;
}) {
  const { status, customer } = await searchParams;
  const filter =
    status === "open" || status === "partial" || status === "completed"
      ? status
      : undefined;
  const rows = await listBookings({
    ...(filter ? { status: filter } : {}),
    ...(customer ? { customerId: customer } : {}),
  });

  return (
    <>
      <PageHeader
        title="Bookings"
        action={
          <Link
            href="/new"
            className="gold-grad rounded-xl px-4 py-2.5 text-sm font-bold text-onyx"
          >
            + New booking
          </Link>
        }
      />

      <div className="mb-4 flex gap-1.5">
        {TABS.map((t) => {
          const active = (t.key || undefined) === filter;
          return (
            <Link
              key={t.key}
              href={t.key ? `/bookings?status=${t.key}` : "/bookings"}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active ? "bg-onyx text-gold-hi" : "bg-cream text-mid hover:bg-line2"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No bookings here"
          hint="Create a booking to start tracking collections and balances."
          cta={{ href: "/new", label: "Create a booking" }}
        />
      ) : (
        <BookingsList bookings={rows} />
      )}
    </>
  );
}
