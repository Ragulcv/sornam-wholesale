import { listPartyOptions } from "@/lib/queries/parties";
import { getSettings } from "@/lib/auth";
import EntryForm from "@/components/EntryForm";

export const dynamic = "force-dynamic";

export default async function EntryPage() {
  const [parties, s] = await Promise.all([listPartyOptions(), getSettings()]);
  return (
    <EntryForm
      parties={parties}
      tdsPercent={parseFloat(s.tdsPercent ?? "0")}
      goldRate={s.defaultGoldRate ? parseFloat(s.defaultGoldRate) : null}
      silverRate={s.defaultSilverRate ? parseFloat(s.defaultSilverRate) : null}
    />
  );
}
