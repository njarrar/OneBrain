import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// A quick check for a session cookie. Pages and actions check the session itself.
export function middleware(req: NextRequest) {
  if (getSessionCookie(req)) return NextResponse.next();
  const url = req.nextUrl.clone();
  const back = req.nextUrl.pathname === "/connect-app" ? "/connect-app" : null;
  url.pathname = "/login";
  url.search = back ? `?next=${encodeURIComponent(back)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/auth|api/ingest|api/cron|api/app|files|_next/static|_next/image|favicon.ico).*)"],
};
