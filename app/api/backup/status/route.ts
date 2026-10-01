import { backupFetch } from "@/lib/backupProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return backupFetch("/status", "GET");
}
