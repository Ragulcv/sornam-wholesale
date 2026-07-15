import McxPriceTracker from "@/components/McxPriceTracker";

export const dynamic = "force-dynamic";

const ORIGIN = process.env.PRICE_API_ORIGIN || "http://172.245.95.193:4000";

export default async function PricesPage() {
  // Seed the live board server-side so the first paint isn't empty.
  let initial = null;
  try {
    const r = await fetch(`${ORIGIN}/api/current`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (r.ok) initial = await r.json();
  } catch {
    /* client polling will fill it in */
  }
  return <McxPriceTracker initialCurrent={initial} />;
}
