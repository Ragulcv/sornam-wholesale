import { fetchLivePrices } from "@/lib/prices";
import { updatePrices } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Scheduled refresh of the live gold/silver rates into settings.
 * Protected by CRON_SECRET (Vercel Cron sends it as a Bearer token). The auth
 * proxy excludes /api/cron so the scheduler can reach this without a session.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // allow in dev only
  const auth = req.headers.get("authorization");
  const url = new URL(req.url);
  return auth === `Bearer ${secret}` || url.searchParams.get("secret") === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const p = await fetchLivePrices();
    if (p.gold == null && p.silver == null) {
      return Response.json(
        { ok: false, message: "No rates parsed from source." },
        { status: 502 },
      );
    }
    await updatePrices({ goldRate: p.gold, silverRate: p.silver });
    return Response.json({ ok: true, gold: p.gold, silver: p.silver });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
