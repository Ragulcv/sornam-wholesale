import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { parties, transactions, bookings } from "../db/schema";

export interface PartyRow {
  id: string;
  name: string;
  phone: string | null;
  gstin: string | null;
  type: string;
  openingPureGold: number;
  openingPureSilver: number;
  openingCash: number;
  notes: string | null;
  txnCount: number;
  bookingCount: number;
}

const num = (v: string | null): number => (v == null ? 0 : parseFloat(v));

export async function listParties(): Promise<PartyRow[]> {
  const [rows, txnCounts, bkCounts] = await Promise.all([
    db.select().from(parties).orderBy(asc(parties.name)),
    db
      .select({ partyId: transactions.partyId, n: sql<number>`count(*)::int` })
      .from(transactions)
      .groupBy(transactions.partyId),
    db
      .select({ partyId: bookings.partyId, n: sql<number>`count(*)::int` })
      .from(bookings)
      .groupBy(bookings.partyId),
  ]);
  const tc = new Map(txnCounts.map((r) => [r.partyId, r.n]));
  const bc = new Map(bkCounts.map((r) => [r.partyId, r.n]));
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    phone: p.phone,
    gstin: p.gstin,
    type: p.type,
    openingPureGold: num(p.openingPureGold),
    openingPureSilver: num(p.openingPureSilver),
    openingCash: num(p.openingCash),
    notes: p.notes,
    txnCount: tc.get(p.id) ?? 0,
    bookingCount: bc.get(p.id) ?? 0,
  }));
}

export async function listPartyOptions(): Promise<
  { id: string; name: string; phone: string | null }[]
> {
  return db
    .select({ id: parties.id, name: parties.name, phone: parties.phone })
    .from(parties)
    .orderBy(asc(parties.name));
}

export async function createParty(data: {
  name: string;
  phone?: string | null;
  gstin?: string | null;
  type?: string;
  openingPureGold?: number;
  openingPureSilver?: number;
  openingCash?: number;
  notes?: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(parties)
    .values({
      name: data.name.trim(),
      phone: data.phone?.trim() || null,
      gstin: data.gstin?.trim() || null,
      type: data.type || "customer",
      openingPureGold: String(data.openingPureGold ?? 0),
      openingPureSilver: String(data.openingPureSilver ?? 0),
      openingCash: String(data.openingCash ?? 0),
      notes: data.notes?.trim() || null,
    })
    .returning({ id: parties.id });
  return row.id;
}

/** Reuse a party by case-insensitive name (+ phone), else create one. */
export async function findOrCreateParty(
  name: string,
  phone?: string | null,
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Party name required");
  const existing = await db
    .select({ id: parties.id })
    .from(parties)
    .where(
      and(
        sql`lower(${parties.name}) = lower(${trimmed})`,
        phone && phone.trim() ? eq(parties.phone, phone.trim()) : sql`true`,
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0].id;
  return createParty({ name: trimmed, phone });
}

export async function updateParty(
  id: string,
  data: {
    name: string;
    phone?: string | null;
    gstin?: string | null;
    type?: string;
    openingPureGold?: number;
    openingPureSilver?: number;
    openingCash?: number;
    notes?: string | null;
  },
): Promise<void> {
  await db
    .update(parties)
    .set({
      name: data.name.trim(),
      phone: data.phone?.trim() || null,
      gstin: data.gstin?.trim() || null,
      type: data.type || "customer",
      openingPureGold: String(data.openingPureGold ?? 0),
      openingPureSilver: String(data.openingPureSilver ?? 0),
      openingCash: String(data.openingCash ?? 0),
      notes: data.notes?.trim() || null,
    })
    .where(eq(parties.id, id));
}

async function hasActivity(ids: string[]): Promise<Set<string>> {
  const [t, b] = await Promise.all([
    db
      .select({ id: transactions.partyId })
      .from(transactions)
      .where(inArray(transactions.partyId, ids)),
    db
      .select({ id: bookings.partyId })
      .from(bookings)
      .where(inArray(bookings.partyId, ids)),
  ]);
  return new Set([
    ...t.map((r) => r.id).filter(Boolean),
    ...b.map((r) => r.id).filter(Boolean),
  ] as string[]);
}

export async function deleteParty(
  id: string,
): Promise<{ ok: boolean; reason?: "has_activity" }> {
  const blocked = await hasActivity([id]);
  if (blocked.has(id)) return { ok: false, reason: "has_activity" };
  await db.delete(parties).where(eq(parties.id, id));
  return { ok: true };
}

export async function bulkDeleteParties(
  ids: string[],
): Promise<{ deleted: number; skipped: number }> {
  if (!ids.length) return { deleted: 0, skipped: 0 };
  const blocked = await hasActivity(ids);
  const deletable = ids.filter((id) => !blocked.has(id));
  if (deletable.length)
    await db.delete(parties).where(inArray(parties.id, deletable));
  return { deleted: deletable.length, skipped: ids.length - deletable.length };
}

export async function bulkAddParties(
  rows: { name?: string; phone?: string | null; gstin?: string | null }[],
): Promise<{ added: number; duplicates: number; invalid: number }> {
  const existing = await db
    .select({ name: parties.name, phone: parties.phone })
    .from(parties);
  const key = (n: string, p?: string | null) =>
    `${n.trim().toLowerCase()}|${(p || "").replace(/\D/g, "")}`;
  const seen = new Set(existing.map((e) => key(e.name, e.phone)));
  const toInsert: { name: string; phone: string | null; gstin: string | null }[] = [];
  let duplicates = 0;
  let invalid = 0;
  for (const r of rows) {
    const name = (r.name ?? "").trim();
    if (!name) { invalid++; continue; }
    const k = key(name, r.phone);
    if (seen.has(k)) { duplicates++; continue; }
    seen.add(k);
    toInsert.push({ name, phone: (r.phone ?? "").trim() || null, gstin: (r.gstin ?? "").trim() || null });
  }
  for (let i = 0; i < toInsert.length; i += 500)
    await db.insert(parties).values(toInsert.slice(i, i + 500));
  return { added: toInsert.length, duplicates, invalid };
}
