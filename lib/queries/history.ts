import "server-only";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { transactions, transactionLines, metalMovements, settlements, parties } from "../db/schema";
import { round2, round3 } from "../bullion";

export interface HistoryRow {
  id: string;
  serialNo: number;
  trnType: string;
  txnDate: Date;
  partyName: string | null;
  metal: string;
  outwardWg: number;
  inwardWg: number;
  outwardPure: number;
  inwardPure: number;
  metalWgRecd: number;
  metalWgPaid: number;
  metalPureRecd: number;
  metalPurePaid: number;
  cashRecd: number;
  cashPaid: number;
  bankRecd: number;
  bankPaid: number;
  value: number;
  tds: number;
  total: number;
  createdBy: string | null;
  createdAt: Date;
  modifiedBy: string | null;
  modifiedAt: Date;
}

const num = (v: string | null): number => (v == null ? 0 : parseFloat(v));

export async function listHistory(filter?: {
  from?: string;
  to?: string;
  trnTypes?: ("sales" | "purchase" | "expense")[];
  search?: string;
}): Promise<HistoryRow[]> {
  const cond = [];
  if (filter?.from) cond.push(gte(transactions.txnDate, new Date(filter.from)));
  if (filter?.to) {
    const end = new Date(filter.to);
    end.setHours(23, 59, 59, 999);
    cond.push(lte(transactions.txnDate, end));
  }
  if (filter?.trnTypes && filter.trnTypes.length)
    cond.push(inArray(transactions.trnType, filter.trnTypes));
  if (filter?.search)
    cond.push(sql`lower(${parties.name}) like ${"%" + filter.search.toLowerCase() + "%"}`);

  const txns = await db
    .select({ t: transactions, pName: parties.name })
    .from(transactions)
    .leftJoin(parties, eq(transactions.partyId, parties.id))
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(desc(transactions.txnDate), desc(transactions.serialNo));

  const ids = txns.map((r) => r.t.id);
  if (ids.length === 0) return [];

  const [lines, moves, setls] = await Promise.all([
    db.select().from(transactionLines).where(inArray(transactionLines.transactionId, ids)),
    db.select().from(metalMovements).where(inArray(metalMovements.transactionId, ids)),
    db.select().from(settlements).where(inArray(settlements.transactionId, ids)),
  ]);

  type Agg = Omit<HistoryRow, "id" | "serialNo" | "trnType" | "txnDate" | "partyName" | "metal" | "createdBy" | "createdAt" | "modifiedBy" | "modifiedAt">;
  const zero = (): Agg => ({ outwardWg: 0, inwardWg: 0, outwardPure: 0, inwardPure: 0, metalWgRecd: 0, metalWgPaid: 0, metalPureRecd: 0, metalPurePaid: 0, cashRecd: 0, cashPaid: 0, bankRecd: 0, bankPaid: 0, value: 0, tds: 0, total: 0 });
  const agg = new Map<string, Agg>(ids.map((id) => [id, zero()]));

  for (const l of lines) {
    const a = agg.get(l.transactionId)!;
    const w = num(l.weight), p = num(l.pure), amt = num(l.amount);
    a.value += amt;
    // sale / purchase_return → metal OUT; purchase / sale_return → metal IN
    if (l.kind === "sale" || l.kind === "purchase_return") { a.outwardWg += w; a.outwardPure += p; }
    else { a.inwardWg += w; a.inwardPure += p; }
  }
  for (const m of moves) {
    const a = agg.get(m.transactionId)!;
    const w = num(m.weight), p = num(m.pure);
    if (m.direction === "received") { a.metalWgRecd += w; a.metalPureRecd += p; }
    else { a.metalWgPaid += w; a.metalPurePaid += p; }
  }
  for (const s of setls) {
    const a = agg.get(s.transactionId)!;
    const amt = num(s.amount);
    if (s.mode === "cash") { if (s.direction === "received") a.cashRecd += amt; else a.cashPaid += amt; }
    else { if (s.direction === "received") a.bankRecd += amt; else a.bankPaid += amt; }
  }

  return txns.map((r) => {
    const a = agg.get(r.t.id)!;
    const tds = num(r.t.tdsAmount);
    return {
      id: r.t.id,
      serialNo: r.t.serialNo,
      trnType: r.t.trnType,
      txnDate: r.t.txnDate,
      partyName: r.pName,
      metal: r.t.metal,
      outwardWg: round3(a.outwardWg),
      inwardWg: round3(a.inwardWg),
      outwardPure: round3(a.outwardPure),
      inwardPure: round3(a.inwardPure),
      metalWgRecd: round3(a.metalWgRecd),
      metalWgPaid: round3(a.metalWgPaid),
      metalPureRecd: round3(a.metalPureRecd),
      metalPurePaid: round3(a.metalPurePaid),
      cashRecd: round2(a.cashRecd),
      cashPaid: round2(a.cashPaid),
      bankRecd: round2(a.bankRecd),
      bankPaid: round2(a.bankPaid),
      value: round2(a.value),
      tds,
      total: round2(a.value - tds),
      createdBy: r.t.createdBy,
      createdAt: r.t.createdAt,
      modifiedBy: r.t.modifiedBy,
      modifiedAt: r.t.modifiedAt,
    };
  });
}
