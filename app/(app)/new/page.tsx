import { PageHeader } from "@/components/ui";
import NewBookingForm from "./NewBookingForm";

export const dynamic = "force-dynamic";

export default function NewBookingPage() {
  return (
    <>
      <PageHeader
        title="New booking"
        subtitle="Log a bullion booking in seconds."
      />
      <NewBookingForm />
    </>
  );
}
