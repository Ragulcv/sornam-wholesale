import { listCustomers } from "@/lib/queries";
import { EmptyState, PageHeader } from "@/components/ui";
import AddCustomer from "./AddCustomer";
import ImportCustomers from "@/components/ImportCustomers";
import CustomersList from "@/components/CustomersList";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const rows = await listCustomers();

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Everyone you deal with, and what they still have pending."
        action={<ImportCustomers />}
      />

      <AddCustomer />

      {rows.length === 0 ? (
        <EmptyState
          title="No customers yet"
          hint="Add a customer here, or they'll be created automatically from a booking."
        />
      ) : (
        <CustomersList customers={rows} />
      )}
    </>
  );
}
