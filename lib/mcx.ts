// ---------------------------------------------------------------------------
// MCX hedge book: trades -> open positions, booked profit, and the daily
// mark-to-market against the closing rate staff type in.
//
// Contract: MCX Gold, 1 lot = 1 kg, price quoted per 10 g. So a Rs 1 move in
// the quote is worth 1000 / 10 = Rs 100 per lot.
//
// Buys and sells are paired oldest-first (FIFO) within each MCX ID. A trade
// that closes an open lot books profit on the day it is made; what is left
// open is valued against the day's closing rate. Daily MCX P&L is
//   booked that day + (open value at today's close - open value at the
//   previous close)
// so the days add up exactly to the total.
// ---------------------------------------------------------------------------

export const MCX_LOT_GRAMS = 1000;
export const PER_LOT_PER_RUPEE = MCX_LOT_GRAMS / 10; // 100

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export type McxSide = "buy" | "sell";

export interface McxTrade {
  id: string;
  /** India-time YYYY-MM-DD */
  day: string;
  /** order of entry within a day */
  seq: number;
  account: string;
  side: McxSide;
  lots: number;
  /** per 10 g; null = opening lots imported without a price */
  price: number | null;
}

interface OpenLot { side: McxSide; lots: number; price: number | null }

export interface AccountPosition {
  account: string;
  /** + long (bought), - short (sold) */
  netLots: number;
  /** weighted average entry of the priced open lots, per 10 g */
  avgPrice: number | null;
  /** open lots with no price, which cannot be valued */
  unpricedLots: number;
  realised: number;
}

export interface McxDay {
  day: string;
  realised: number;
  /** value of open lots at this day's close (0 when no close known) */
  openValue: number;
  /** booked today + change in open value: the day's MCX P&L */
  pnl: number;
  /** closing rate used, per 10 g */
  close: number | null;
  /** true when no close was typed for this day and the last one was reused */
  closeCarried: boolean;
  netLots: number;
  trades: number;
}

export interface McxBook {
  positions: AccountPosition[];
  days: McxDay[];
  realised: number;
  /** open value at the latest close */
  unrealised: number;
  total: number;
  netLots: number;
  latestClose: { day: string; price: number } | null;
  /** lots that closed against an unpriced opening lot: profit unknown */
  unpricedMatchedLots: number;
  unpricedOpenLots: number;
}

function openValue(queue: OpenLot[], close: number | null): number {
  if (close == null) return 0;
  let v = 0;
  for (const l of queue) {
    if (l.price == null) continue;
    v += (l.side === "buy" ? close - l.price : l.price - close) * l.lots * PER_LOT_PER_RUPEE;
  }
  return v;
}

/**
 * The whole book from the trade list and the closing rates.
 * `closes` maps YYYY-MM-DD -> closing price per 10 g.
 */
export function computeMcxBook(trades: McxTrade[], closes: Record<string, number>, upTo?: string): McxBook {
  const sorted = [...trades].sort((a, b) => a.day.localeCompare(b.day) || a.seq - b.seq);
  const queues = new Map<string, OpenLot[]>();
  const realisedBy = new Map<string, number>();
  let unpricedMatchedLots = 0;

  const dayKeys = [...new Set([...sorted.map((t) => t.day), ...Object.keys(closes)])]
    .filter((d) => !upTo || d <= upTo)
    .sort();

  const days: McxDay[] = [];
  let lastClose: number | null = null;
  let prevOpen = 0;
  let ti = 0;

  for (const day of dayKeys) {
    let realisedToday = 0;
    let tradesToday = 0;
    while (ti < sorted.length && sorted[ti].day === day) {
      const t = sorted[ti++];
      tradesToday++;
      const q = queues.get(t.account) ?? [];
      let left = t.lots;
      while (left > 1e-9 && q.length && q[0].side !== t.side) {
        const head = q[0];
        const m = Math.min(left, head.lots);
        if (head.price == null || t.price == null) unpricedMatchedLots += m;
        else {
          // long closed by a sale: sell - buy. short closed by a buy: sell - buy too.
          const pnl = (t.side === "sell" ? t.price - head.price : head.price - t.price) * m * PER_LOT_PER_RUPEE;
          realisedToday += pnl;
          realisedBy.set(t.account, (realisedBy.get(t.account) ?? 0) + pnl);
        }
        head.lots = r3(head.lots - m);
        left = r3(left - m);
        if (head.lots <= 1e-9) q.shift();
      }
      if (left > 1e-9) q.push({ side: t.side, lots: left, price: t.price });
      queues.set(t.account, q);
    }

    const typed = closes[day];
    if (typed != null) lastClose = typed;
    const all = [...queues.values()].flat();
    const ov = openValue(all, lastClose);
    const netLots = r3(all.reduce((a, l) => a + (l.side === "buy" ? l.lots : -l.lots), 0));
    days.push({
      day,
      realised: r2(realisedToday),
      openValue: r2(ov),
      pnl: r2(realisedToday + ov - prevOpen),
      close: lastClose,
      closeCarried: typed == null && lastClose != null,
      netLots,
      trades: tradesToday,
    });
    prevOpen = ov;
  }

  const positions: AccountPosition[] = [...queues.entries()]
    .map(([account, q]) => {
      const priced = q.filter((l) => l.price != null);
      const pricedLots = priced.reduce((a, l) => a + l.lots, 0);
      return {
        account,
        netLots: r3(q.reduce((a, l) => a + (l.side === "buy" ? l.lots : -l.lots), 0)),
        avgPrice: pricedLots > 0 ? r2(priced.reduce((a, l) => a + l.lots * (l.price as number), 0) / pricedLots) : null,
        unpricedLots: r3(q.filter((l) => l.price == null).reduce((a, l) => a + l.lots, 0)),
        realised: r2(realisedBy.get(account) ?? 0),
      };
    })
    .sort((a, b) => a.account.localeCompare(b.account));
  // accounts that are fully squared off still show their booked profit
  for (const [account, realised] of realisedBy) {
    if (!positions.some((p) => p.account === account)) positions.push({ account, netLots: 0, avgPrice: null, unpricedLots: 0, realised: r2(realised) });
  }

  const realised = r2([...realisedBy.values()].reduce((a, b) => a + b, 0));
  const unrealised = days.length ? days[days.length - 1].openValue : 0;
  const closeDays = Object.keys(closes).filter((d) => !upTo || d <= upTo).sort();
  const lcDay = closeDays[closeDays.length - 1];
  return {
    positions,
    days,
    realised,
    unrealised: r2(unrealised),
    total: r2(realised + unrealised),
    netLots: r3(positions.reduce((a, p) => a + p.netLots, 0)),
    latestClose: lcDay ? { day: lcDay, price: closes[lcDay] } : null,
    unpricedMatchedLots: r3(unpricedMatchedLots),
    unpricedOpenLots: r3(positions.reduce((a, p) => a + p.unpricedLots, 0)),
  };
}
