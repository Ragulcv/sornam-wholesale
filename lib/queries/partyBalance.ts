import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { parties, transactions, transactionLines, settlements } from "../db/schema";
import { round2 } from "../bullion";

const num = (v: string | null): number => (v == null ? 0 : parseFloat(v));

/**
 * Party running cash balance = opening cash
 *   + all cash/bank RECEIVED from them across their transactions
 *   − the total value of those transactions.
 *
 * Positive  → we owe them / they are in credit (to-receive).
 * Negative  → they owe us (outstanding).
 */
export async function getPartyCashBalance(partyId: string): Promise<number> {
  const [party] = await db
    .select({ openingCash: parties.openingCash })
    .from(parties)
    .where(eq(parties.id, partyId));
  if (!party) return 0;

  const opening = num(party.openingCash);

  const txns = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.partyId, partyId));
  const ids = txns.map((t) => t.id);
  if (ids.length === 0) return round2(opening);

  const [lineAgg, setlAgg] = await Promise.all([
    db
      .select({ total: sql<string>`coalesce(sum(${transactionLines.amount}), 0)` })
      .from(transactionLines)
      .where(inArray(transactionLines.transactionId, ids)),
    db
      .select({ total: sql<string>`coalesce(sum(${settlements.amount}), 0)` })
      .from(settlements)
      .where(
        and(
          inArray(settlements.transactionId, ids),
          eq(settlements.direction, "received"),
        ),
      ),
  ]);

  const value = num(lineAgg[0]?.total ?? "0");
  const received = num(setlAgg[0]?.total ?? "0");
  return round2(opening + received - value);
}
