import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight ping that touches the DB so the serverless Postgres stays warm
// (avoids the cold-start delay on the next real request). No auth needed — it
// returns nothing sensitive; the auth proxy excludes this path.
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
