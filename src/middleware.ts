import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/auth";

/**
 * Gate everything behind a valid session. `/login` and `/setup` stay open; those two pages
 * decide between themselves which one a visitor actually needs (the middleware runs on the
 * edge runtime and cannot reach the database to find out).
 *
 * This only checks that the token is well-formed and unexpired. Whether the user still
 * exists, and whether the token predates a password change, needs the database — so
 * `getCurrentUser` is the real gate and every page goes through it.
 */
const PUBLIC_PATHS = ["/login", "/setup"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    // Keep the query string in `next`, so a filtered list or report comes back as it was.
    const back = pathname + request.nextUrl.search;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = back === "/" ? "" : `?next=${encodeURIComponent(back)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // `api/cron` is excluded because it arrives with no session cookie — it would be bounced
  // to /login and the schedule would silently do nothing. It authenticates with CRON_SECRET
  // instead; see the route.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|api/cron).*)"],
};
