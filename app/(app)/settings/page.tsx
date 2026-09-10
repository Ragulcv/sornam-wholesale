import { getSettings } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Settings" subtitle="Security, tax, default rates, and the wording of every WhatsApp message." />
      <SettingsForm
        autoLogoffMinutes={s.autoLogoffMinutes}
        gstin={s.gstin ?? ""}
        taxPercent={s.taxPercent ?? "3"}
        tdsPercent={s.tdsPercent ?? "0"}
        defaultGoldRate={s.defaultGoldRate ?? ""}
        defaultSilverRate={s.defaultSilverRate ?? ""}
        bookingTemplate={s.bookingTemplate ?? ""}
        salesTemplate={s.salesTemplate ?? ""}
        purchaseTemplate={s.purchaseTemplate ?? ""}
        deliveredTemplate={s.deliveredTemplate ?? ""}
      />
    </>
  );
}
