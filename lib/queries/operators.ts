import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { operators } from "../db/schema";

export async function listOperators(): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: operators.id, name: operators.name })
    .from(operators)
    .where(eq(operators.active, true))
    .orderBy(asc(operators.name));
}

export async function getOperator(
  id: string,
): Promise<{ id: string; name: string } | null> {
  const rows = await db
    .select({ id: operators.id, name: operators.name })
    .from(operators)
    .where(eq(operators.id, id));
  return rows[0] ?? null;
}

export async function addOperator(name: string): Promise<void> {
  await db.insert(operators).values({ name: name.trim() });
}
