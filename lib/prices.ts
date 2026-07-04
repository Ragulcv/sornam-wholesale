// Live gold/silver rates from the client's price feed (Kuberan Bullion).
// The feed is a POST endpoint returning tab-separated rows, e.g.:
//   2  GOLDAUG   GOLD    147350  147425  148069  146736  147378  ...
//   2  SILVERSEP SILVER  237460  237500  238876  236495  237410  ...
// Columns: [type, symbol, name, bid, ask, high, low, ltp, ...]
// The INR contracts (type "2") named GOLD (/10g) and SILVER (/kg) are what the
// shop quotes; we use the ask (offer) value.

export interface LivePrices {
  gold: number | null; // INR per 10g
  silver: number | null; // INR per kg
  sourceTime: string | null;
}

const DEFAULT_URL =
  "http://13.235.208.189/lmxtrade/winbullliteapi/api/v1/broadcastrates";

export function parseKuberan(text: string): LivePrices {
  let gold: number | null = null;
  let silver: number | null = null;
  let sourceTime: string | null = null;

  for (const line of text.split("\n")) {
    const c = line.split("\t");
    if (c.length >= 5 && c[0].trim() === "2") {
      const name = (c[2] || "").trim();
      const ask = parseFloat(c[4]);
      if (name === "GOLD" && Number.isFinite(ask)) gold = ask;
      if (name === "SILVER" && Number.isFinite(ask)) silver = ask;
    }
  }
  const ts = text.match(/"([^"]+)"/);
  if (ts) sourceTime = ts[1];

  return { gold, silver, sourceTime };
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
