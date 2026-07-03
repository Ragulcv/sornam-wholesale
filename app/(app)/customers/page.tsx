import Link from "next/link";
import { listCustomers } from "@/lib/queries";
import { fmtWeight } from "@/lib/format";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import AddCustomer from "./AddCustomer";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const rows = await listCustomers();

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Everyone you deal with, and what they still have pending."
      />

      <AddCustomer />

      {rows.length === 0 ? (
        <EmptyState
          title="No customers yet"
          hint="Add a customer here, or they'll be created automatically from a booking."
        />
      ) : (
        <Card className="mt-4 divide-y divide-line2">
          {rows.map((c) => (
            <Link
              key={c.id}
              href={`/bookings?customer=${c.id}`}
              className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-cream"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cream font-serif text-sm font-bold text-gold-deep">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-ink">{c.name}</div>
                <div className="text-xs text-mute">
                  {c.phone ?? "no phone"}
                  {c.gstin ? ` · GSTIN ${c.gstin}` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="num text-sm text-ink">
                  {fmtWeight(c.pendingWeightG)}
                </div>
                <div className="text-[11px] text-mute">
                  pending · {c.bookingCount} booking
                  {c.bookingCount === 1 ? "" : "s"}
                </div>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
