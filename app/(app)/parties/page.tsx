import { listParties } from "@/lib/queries/parties";
import { PageHeader } from "@/components/ui";
import PartiesClient from "@/components/PartiesClient";

export const dynamic = "force-dynamic";

export default async function PartiesPage() {
  const parties = await listParties();
  return (
    <>
      <PageHeader title="Parties" subtitle="Customers & vendors." />
      <PartiesClient parties={parties} />
    </>
  );
}
