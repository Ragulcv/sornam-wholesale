import { fetchLivePrices } from "@/lib/prices";
import { updatePrices } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Live gold/silver rates, fetched on demand (e.g. the "Use current price"
// button). Behind the auth proxy — only a logged-in session can call it.
// Also caches the values into settings so the dashboard strip stays fresh.
export async function GET() {
  try {
    const p = await fetchLivePrices();
    if (p.gold == null && p.silver == null) {
      return Response.json({ ok: false, message: "No rates available." }, { status: 502 });
    }
    await updatePrices({ goldRate: p.gold, silverRate: p.silver });
    return Response.json({
      ok: true,
      gold: p.gold,
      silver: p.silver,
      sourceTime: p.sourceTime,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 502 },
    );
  }
}
