import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/parcels",
  "/trips",
  "/tickets",
  "/stations",
  "/vehicles",
  "/users",
  "/companies",
];

function getSecretKey() {
  const secret = process.env.SESSION_SECRET ?? "routepass-dev-secret-32chars!!";
  return new TextEncoder().encode(secret);
}

async function isValidSession(cookie: string | undefined): Promise<boolean> {
  if (!cookie) return false;
  try {
    await jwtVerify(cookie, getSecretKey(), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
  const sessionCookie = request.cookies.get("rp_session")?.value;
  const authenticated = await isValidSession(sessionCookie);

  if (isProtected && !authenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && authenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|track/|ticket/).*)",
  ],
};
