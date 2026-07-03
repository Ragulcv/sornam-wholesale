import "server-only";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "./db";
import { settings, type Settings } from "./db/schema";
import { getSession } from "./session";

const MAX_ATTEMPTS = 5;
const LOCK_SECONDS = 60;

/** Fetch the single settings row, creating it on first run. */
export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(settings).where(eq(settings.id, 1));
  if (rows[0]) return rows[0];
  const inserted = await db
    .insert(settings)
    .values({ id: 1 })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];
  // Concurrent insert won the race; re-read.
  const again = await db.select().from(settings).where(eq(settings.id, 1));
  return again[0];
}

export async function isPinSet(): Promise<boolean> {
  const s = await getSettings();
  return Boolean(s.pinHash);
}

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: "locked"; retryInSeconds: number }
  | { ok: false; reason: "wrong"; attemptsLeft: number };

/** First-run: set the shop PIN and start a session. */
export async function setPin(pin: string): Promise<void> {
  const hash = await bcrypt.hash(pin, 10);
  await db
    .update(settings)
    .set({ pinHash: hash, failedAttempts: 0, lockedUntil: null })
    .where(eq(settings.id, 1));
  const session = await getSession();
  session.authed = true;
  session.since = Date.now();
  await session.save();
}

/** Verify the PIN, applying lockout, and start a session on success. */
export async function verifyPinAndLogin(pin: string): Promise<LoginResult> {
  const s = await getSettings();

  if (s.lockedUntil && s.lockedUntil.getTime() > Date.now()) {
    return {
      ok: false,
      reason: "locked",
      retryInSeconds: Math.ceil((s.lockedUntil.getTime() - Date.now()) / 1000),
    };
  }

  const match = s.pinHash ? await bcrypt.compare(pin, s.pinHash) : false;

  if (match) {
    await db
      .update(settings)
      .set({ failedAttempts: 0, lockedUntil: null })
      .where(eq(settings.id, 1));
    const session = await getSession();
    session.authed = true;
    session.since = Date.now();
    await session.save();
    return { ok: true };
  }

  const attempts = s.failedAttempts + 1;
  const shouldLock = attempts >= MAX_ATTEMPTS;
  await db
    .update(settings)
    .set({
      failedAttempts: shouldLock ? 0 : attempts,
      lockedUntil: shouldLock
        ? new Date(Date.now() + LOCK_SECONDS * 1000)
        : null,
    })
    .where(eq(settings.id, 1));

  if (shouldLock) {
    return { ok: false, reason: "locked", retryInSeconds: LOCK_SECONDS };
  }
  return { ok: false, reason: "wrong", attemptsLeft: MAX_ATTEMPTS - attempts };
}

/** Re-verify the PIN without touching the session (used to dismiss the privacy screen). */
export async function verifyPinOnly(pin: string): Promise<boolean> {
  const s = await getSettings();
  return s.pinHash ? bcrypt.compare(pin, s.pinHash) : false;
}

export async function logout(): Promise<void> {
  const session = await getSession();
  session.destroy();
}

/** Guard for protected layouts: redirects to /lock when not authenticated. */
export async function requireAuth(): Promise<void> {
  const session = await getSession();
  if (!session.authed) redirect("/lock");
}

/** Guard for mutating server actions: throws when not authenticated. */
export async function requireSession(): Promise<void> {
  const session = await getSession();
  if (!session.authed) throw new Error("Not authenticated");
}
