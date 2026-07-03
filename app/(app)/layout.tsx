import { requireAuth, getSettings } from "@/lib/auth";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();
  const settings = await getSettings();
  return (
    <AppShell autoLogoffMinutes={settings.autoLogoffMinutes}>{children}</AppShell>
  );
}
