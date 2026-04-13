import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const COOKIE_NAME = "kx_session";

const ADMIN_PREFIXES = [
  "/dashboard",
  "/parcels",
  "/trips",
  "/tickets",
  "/stations",
  "/vehicles",
  "/users",
  "/companies",
  "/audit",
  "/webhooks",
  "/settings",
];
const DRIVER_PREFIXES = ["/driver"];

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return new TextEncoder().encode("kwanix-dev-secret-32chars!!");
  }
  return new TextEncoder().encode(secret);
}

interface SessionPayload {
  user?: { role?: string };
}

async function getSessionPayload(
  cookie: string | undefined
): Promise<SessionPayload | null> {
  if (!cookie) return null;
  try {
    const { payload } = await jwtVerify(cookie, getSecretKey(), {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(COOKIE_NAME)?.value;
  const session = await getSessionPayload(sessionCookie);
  const authenticated = !!session;
  const role = session?.user?.role;

  const isAdminRoute = ADMIN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  const isDriverRoute = DRIVER_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  // Unauthenticated access to protected routes → login
  if ((isAdminRoute || isDriverRoute) && !authenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Driver trying to access admin routes → redirect to /driver
  if (isAdminRoute && role === "driver") {
    return NextResponse.redirect(new URL("/driver", request.url));
  }

  // Non-driver trying to access /driver → redirect to /dashboard
  if (isDriverRoute && role !== "driver") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Authenticated user hitting /login → send to correct home
  if (pathname === "/login" && authenticated) {
    const destination = role === "driver" ? "/driver" : "/dashboard";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|track/|ticket/).*)",
  ],
};
