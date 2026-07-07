// Shared session constants — safe to import from middleware (proxy) and server.
// No "server-only" and no next/headers here so the Edge/Node proxy can use it.
import type { SessionOptions } from "iron-session";

export interface SessionData {
  authed: boolean;
  since?: number;
  operatorId?: string;
  operatorName?: string;
}

export const SESSION_PASSWORD =
  process.env.SESSION_SECRET ??
  "dev-only-insecure-session-secret-change-me-32+chars";

export const SESSION_COOKIE = "sw_session";

export const sessionOptions: SessionOptions = {
  password: SESSION_PASSWORD,
  cookieName: SESSION_COOKIE,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Hard cap; idle logout is enforced client-side per the configured minutes.
    maxAge: 60 * 60 * 8,
  },
};
