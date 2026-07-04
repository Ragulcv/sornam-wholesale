import { getSettings } from "@/lib/auth";
import { listCustomers } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import NewBookingForm from "./NewBookingForm";

export const dynamic = "force-dynamic";

export default async function NewBookingPage() {
  const [s, customers] = await Promise.all([getSettings(), listCustomers()]);
  return (
    <>
      <PageHeader
        title="New booking"
        subtitle="Log a bullion booking in seconds."
      />
      <NewBookingForm
        currentGold={s.defaultGoldRate ? parseFloat(s.defaultGoldRate) : null}
        currentSilver={s.defaultSilverRate ? parseFloat(s.defaultSilverRate) : null}
        priceUpdatedAt={s.priceUpdatedAt ? s.priceUpdatedAt.toISOString() : null}
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
        }))}
      />
    </>
  );
}
