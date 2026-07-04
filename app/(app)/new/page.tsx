import { getSettings } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import NewBookingForm from "./NewBookingForm";

export const dynamic = "force-dynamic";

export default async function NewBookingPage() {
  const s = await getSettings();
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
      />
    </>
  );
}
