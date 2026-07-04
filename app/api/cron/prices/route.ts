import { updatePrices } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Refreshes the live gold/silver rates.
 *
 * Wiring the client's price app (pending their URL):
 *   1. Set env PRICE_SOURCE_URL to the JSON endpoint we find on their site.
 *   2. Map its fields to gold (/10g) and silver (/kg) in parsePrices() below.
 *
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

function parsePrices(data: unknown): { gold: number | null; silver: number | null } {
  // TODO: map to the client's actual response shape once we inspect their app.
  const d = data as Record<string, unknown>;
  const num = (v: unknown) =>
    typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) || null : null;
  return {
    gold: num(d?.gold ?? d?.gold_10g ?? d?.gold_rate),
    silver: num(d?.silver ?? d?.silver_kg ?? d?.silver_rate),
  };
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const source = process.env.PRICE_SOURCE_URL;
  if (!source) {
    return Response.json({
      configured: false,
      message: "Set PRICE_SOURCE_URL to the client's price endpoint to enable.",
    });
  }

  try {
    const res = await fetch(source, { cache: "no-store" });
    const data = await res.json();
    const { gold, silver } = parsePrices(data);
    if (gold == null && silver == null) {
      return Response.json(
        { ok: false, message: "Could not parse gold/silver from source." },
        { status: 502 },
      );
    }
    await updatePrices({ goldRate: gold, silverRate: silver });
    return Response.json({ ok: true, gold, silver });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 502 },
    );
  }
}
