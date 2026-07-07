import { PageHeader, Card } from "@/components/ui";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <>
      <PageHeader title="Ustock" subtitle="Being built in this rebuild." />
      <Card className="p-8 text-center text-sm text-mute">This screen is coming up next in the rebuild.</Card>
    </>
  );
}
