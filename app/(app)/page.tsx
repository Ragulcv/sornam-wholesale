import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function TodayPage() {
  return (
    <>
      <PageHeader
        title="Today"
        subtitle={new Date().toLocaleDateString("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      />
      <Card className="p-6">
        <p className="text-sm text-mute">
          Dashboard is being rebuilt. Jump into a screen:
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ["/entry", "Sales / Purchase"],
            ["/bookings", "Bookings"],
            ["/history", "History"],
            ["/stock", "Stock"],
            ["/parties", "Parties"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-xl border border-line bg-pearl px-4 py-2.5 text-sm font-semibold text-ink hover:bg-cream"
            >
              {label}
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
