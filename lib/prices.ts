// Live gold/silver rates from the client's price feed (Kuberan Bullion), which
// carries MCX-derived data. Returns per-GRAM rates (the app quotes per gram).
//
// Feed rows (tab-separated):
//   3  26  "GOLD BAR RTGS"  -  14740.00  ...   <- physical gold bar, per gram
//   3  32  SILVER           -  227750    ...   <- physical silver, per kg
//   2  GOLDAUG  GOLD    143521 143550 ...       <- MCX gold future, per 10g
//   2  SILVERSEP SILVER 222642 222741 ...       <- MCX silver future, per kg
// We prefer the physical bar rates (what the shop actually quotes) and fall
// back to the MCX futures.

export interface LivePrices {
  gold: number | null; // INR per gram
  silver: number | null; // INR per gram
  sourceTime: string | null;
}

const DEFAULT_URL =
  "http://13.235.208.189/lmxtrade/winbullliteapi/api/v1/broadcastrates";

export function parseKuberan(text: string): LivePrices {
  let goldPhysical: number | null = null;
  let silverPhysicalPerKg: number | null = null;
  let goldMcxPer10g: number | null = null;
  let silverMcxPerKg: number | null = null;
  let sourceTime: string | null = null;

  for (const line of text.split("\n")) {
    const c = line.split("\t");
    if (c.length < 5) continue;
    const type = c[0].trim();
    const name = (c[2] || "").replace(/"/g, "").trim().toUpperCase();
    const val = parseFloat(c[4]);
    if (!Number.isFinite(val)) continue;

    if (type === "3" && name === "GOLD BAR RTGS") goldPhysical = val; // per gram
    else if (type === "3" && name === "SILVER") silverPhysicalPerKg = val; // per kg
    else if (type === "2" && name === "GOLD") goldMcxPer10g = val; // per 10g
    else if (type === "2" && name === "SILVER") silverMcxPerKg = val; // per kg
  }
  const ts = text.match(/"([^"]+\d{2}:\d{2}:\d{2}[^"]*)"/);
  if (ts) sourceTime = ts[1];

  const gold =
    goldPhysical ?? (goldMcxPer10g != null ? goldMcxPer10g / 10 : null);
  const silver =
    silverPhysicalPerKg != null
      ? silverPhysicalPerKg / 1000
      : silverMcxPerKg != null
        ? silverMcxPerKg / 1000
        : null;

  return {
    gold: gold != null ? Math.round(gold * 100) / 100 : null,
    silver: silver != null ? Math.round(silver * 100) / 100 : null,
    sourceTime,
  };
}

export async function fetchLivePrices(): Promise<LivePrices> {
  const url = process.env.PRICE_SOURCE_URL ?? DEFAULT_URL;
  const client = process.env.PRICE_CLIENT_CODE ?? "kb";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`price feed HTTP ${res.status}`);
  return parseKuberan(await res.text());
}
