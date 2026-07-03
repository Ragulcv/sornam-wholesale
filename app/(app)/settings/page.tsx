import { getSettings } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await getSettings();
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Security, tax details, and default rates."
      />
      <SettingsForm
        autoLogoffMinutes={s.autoLogoffMinutes}
        gstin={s.gstin ?? ""}
        defaultGoldRate={s.defaultGoldRate ?? ""}
        defaultSilverRate={s.defaultSilverRate ?? ""}
      />
    </>
  );
}
