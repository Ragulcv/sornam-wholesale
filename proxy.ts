import { NextResponse, type NextRequest } from "next/server";
import { unsealData } from "iron-session";
import {
  SESSION_COOKIE,
  SESSION_PASSWORD,
  type SessionData,
} from "@/lib/session-config";

// Gate every app route at the edge so unauthenticated requests never reach a
// page — this prevents protected data from being fetched or rendered (even
// into a redirect's response body) before auth is checked.
export async function proxy(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  let authed = false;
  if (cookie) {
    try {
      const data = await unsealData<SessionData>(cookie, {
        password: SESSION_PASSWORD,
      });
      authed = Boolean(data.authed && data.operatorId);
    } catch {
      authed = false;
    }
  }

  if (!authed) {
    const url = req.nextUrl.clone();
    url.pathname = "/lock";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals, static assets, the lock page, and
  // the public keep-warm health check.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|lock|api/health).*)"],
};
