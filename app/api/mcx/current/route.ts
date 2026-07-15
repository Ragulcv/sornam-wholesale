// Server-side proxy to the always-on Sornam price feed (Contabo). The Wholesale
// app is https (Vercel); calling the http feed directly from the browser would
// be blocked as mixed content, so we fetch it here (server-to-server) and hand
// the JSON back same-origin.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORIGIN = process.env.PRICE_API_ORIGIN || "http://172.245.95.193:4000";

export async function GET() {
  try {
    const r = await fetch(`${ORIGIN}/api/current`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return Response.json({ error: `price feed ${r.status}` }, { status: 502 });
    return Response.json(await r.json());
  } catch {
    return Response.json({ error: "price feed unreachable" }, { status: 502 });
  }
}
