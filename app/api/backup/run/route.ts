import { backupFetch } from "@/lib/backupProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST() {
  return backupFetch("/run", "POST");
}
