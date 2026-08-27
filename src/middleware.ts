import { NextResponse, type NextRequest } from "next/server";

/**
 * Passes the requested path to the server components as a header, so the portal
 * layout can send an unauthenticated visitor to /login?next=… and return them
 * where they were going. Notification emails link deep into a case, and that
 * link has to survive the sign-in redirect (§23).
 *
 * Authentication and authorization are NOT decided here. Middleware runs before
 * the session is loaded and is the wrong place for access control; every page
 * checks the actor against the record it is about to render.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
