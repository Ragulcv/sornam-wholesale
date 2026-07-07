import { requireAuth, getSettings, currentOperatorName } from "@/lib/auth";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();
  const [settings, operatorName] = await Promise.all([
    getSettings(),
    currentOperatorName(),
  ]);
  return (
    <AppShell
      autoLogoffMinutes={settings.autoLogoffMinutes}
      operatorName={operatorName}
    >
      {children}
    </AppShell>
  );
}
