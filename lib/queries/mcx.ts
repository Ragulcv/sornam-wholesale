import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { mcxTrades, mcxCloses } from "../db/schema";
import { computeMcxBook, type McxBook, type McxSide, type McxTrade } from "../mcx";
import { dayKey, dayStart } from "../dates";

const num = (v: string | null): number | null => (v == null ? null : parseFloat(v));

export interface McxTradeView {
  id: string;
  serialNo: number;
  day: string;
  account: string;
  side: McxSide;
  lots: number;
  price: number | null;
  remarks: string | null;
  createdBy: string | null;
}

export async function listMcxTrades(): Promise<McxTradeView[]> {
  const rows = await db.select().from(mcxTrades).orderBy(desc(mcxTrades.tradeDate), desc(mcxTrades.serialNo));
  return rows.map((r) => ({
    id: r.id,
    serialNo: r.serialNo,
    day: dayKey(r.tradeDate),
    account: r.account,
    side: r.side,
    lots: num(r.lots) ?? 0,
    price: num(r.price),
    remarks: r.remarks,
    createdBy: r.createdBy,
  }));
}

export async function listMcxCloses(): Promise<Record<string, number>> {
  const rows = await db.select().from(mcxCloses).orderBy(asc(mcxCloses.day));
  return Object.fromEntries(rows.map((r) => [r.day, parseFloat(r.price)]));
}

export interface McxTradeInput {
  day: string;
  account: string;
  side: McxSide;
  lots: number;
  price: number | null;
  remarks?: string | null;
  operatorName: string;
}

export async function saveMcxTrade(input: McxTradeInput & { id?: string | null }): Promise<void> {
  const values = {
    tradeDate: dayStart(input.day),
    account: input.account.trim(),
    side: input.side,
    lots: String(input.lots),
    price: input.price != null ? String(input.price) : null,
    remarks: input.remarks?.trim() || null,
  };
  if (input.id) await db.update(mcxTrades).set(values).where(eq(mcxTrades.id, input.id));
  else await db.insert(mcxTrades).values({ ...values, createdBy: input.operatorName });
}

export async function deleteMcxTrade(id: string): Promise<void> {
  await db.delete(mcxTrades).where(eq(mcxTrades.id, id));
}

export async function saveMcxClose(day: string, price: number, operatorName: string): Promise<void> {
  await db
    .insert(mcxCloses)
    .values({ day, price: String(price), updatedBy: operatorName })
    .onConflictDoUpdate({ target: mcxCloses.day, set: { price: String(price), updatedBy: operatorName, updatedAt: new Date() } });
}

/** The whole MCX book: positions, booked and open profit, day by day. */
export async function getMcxBook(upTo?: string): Promise<McxBook & { trades: McxTradeView[]; closes: Record<string, number> }> {
  const [trades, closes] = await Promise.all([listMcxTrades(), listMcxCloses()]);
  // the register lists newest first; the engine wants entry order, oldest first
  const engineTrades: McxTrade[] = [...trades].reverse().map((t) => ({
    id: t.id, day: t.day, seq: t.serialNo, account: t.account, side: t.side, lots: t.lots, price: t.price,
  }));
  return { ...computeMcxBook(engineTrades, closes, upTo), trades, closes };
}
