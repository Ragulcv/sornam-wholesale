import { getSettings } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import SettingsForm from "./SettingsForm";
import BackupCard from "@/components/BackupCard";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Settings" subtitle="Security, tax, default rates, WhatsApp wording, and the nightly backup." />
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
      <div className="max-w-3xl">
        <BackupCard />
      </div>
    </>
  );
}
