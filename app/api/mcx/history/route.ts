// Server-side proxy for the price-feed history endpoint. Forwards symbol/from/to
// to the Contabo backend and returns the enriched INR rows (per-gram intl + india).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORIGIN = process.env.PRICE_API_ORIGIN || "http://172.245.95.193:4000";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "XAU").toUpperCase();
  if (symbol !== "XAU" && symbol !== "XAG") {
    return Response.json({ error: "symbol must be XAU or XAG" }, { status: 400 });
  }
  const qs = new URLSearchParams({ symbol });
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);

  try {
    const r = await fetch(`${ORIGIN}/api/history?${qs.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return Response.json({ error: `price feed ${r.status}` }, { status: 502 });
    return Response.json(await r.json());
  } catch {
    return Response.json({ error: "price feed unreachable" }, { status: 502 });
  }
}
