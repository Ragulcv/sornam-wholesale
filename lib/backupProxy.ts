import "server-only";
import { getSession } from "./session";

// Server-to-server bridge to the backup service on Contabo, same pattern as the
// MCX price proxy. The API key never reaches the browser.
const ORIGIN = process.env.BACKUP_API_ORIGIN;
const KEY = process.env.BACKUP_API_KEY;

export async function backupFetch(path: "/status" | "/run", method: "GET" | "POST"): Promise<Response> {
  // proxy.ts already gates /api, this is a second lock on the door
  const session = await getSession();
  if (!session.authed) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!ORIGIN || !KEY) return Response.json({ connected: false }, { status: 200 });
  try {
    const r = await fetch(`${ORIGIN}${path}`, {
      method,
      headers: { authorization: `Bearer ${KEY}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const body = await r.json().catch(() => ({}));
    return Response.json({ connected: true, ...body }, { status: r.status });
  } catch {
    return Response.json({ connected: true, unreachable: true, error: "Backup service is not responding." }, { status: 502 });
  }
}
