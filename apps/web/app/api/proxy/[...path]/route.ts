import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/session";

const API_BASE =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

type Context = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, { params }: Context) {
  const [session, { path }] = await Promise.all([getSession(), params]);
  const apiPath = `/api/v1/${path.join("/")}`;

  const targetUrl = new URL(`${API_BASE}${apiPath}`);
  req.nextUrl.searchParams.forEach((v, k) => targetUrl.searchParams.set(k, v));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (session?.accessToken) {
    headers["Authorization"] = `Bearer ${session.accessToken}`;
  }

  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : await req.text();

  const upstream = await fetch(targetUrl.toString(), {
    method: req.method,
    headers,
    body,
  });

  const contentType = upstream.headers.get("content-type") ?? "";

  // Pass binary responses (PDF, images, etc.) through as-is
  if (contentType.includes("application/pdf") || contentType.includes("image/")) {
    const buffer = await upstream.arrayBuffer();
    const respHeaders: Record<string, string> = { "Content-Type": contentType };
    const disposition = upstream.headers.get("content-disposition");
    if (disposition) respHeaders["Content-Disposition"] = disposition;
    return new NextResponse(buffer, { status: upstream.status, headers: respHeaders });
  }

  const json = await upstream.json().catch(() => null);
  return NextResponse.json(json ?? {}, { status: upstream.status });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};
