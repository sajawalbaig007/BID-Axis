import { NextRequest, NextResponse } from "next/server";

/** Allow long-running upload/proxy through Vercel (Pro: up to 300s). */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function backendRoot(): string {
  const raw =
    process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") ??
    "http://127.0.0.1:5000";
  return raw.replace(/\/$/, "").replace(/:\/\/localhost\b/i, "://127.0.0.1");
}

/** Must match the backend attendance IP check. Override with CRM_PROXY_SECRET on both hosts. */
const PROXY_MARK = process.env.CRM_PROXY_SECRET?.trim() || "crm-office-proxy-v1";

/** Headers Node fetch cannot forward (breaks POST login with UND_ERR_NOT_SUPPORTED). */
const SKIP_REQ_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "expect",
  "transfer-encoding",
  "keep-alive",
  "upgrade",
  "proxy-connection",
  "x-crm-client-ip",
  "x-crm-proxy",
]);

function visitorIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip")?.trim() ?? "";
  if (real) return real;
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() ?? "";
}
const SKIP_RES_HEADERS = new Set(["transfer-encoding", "connection", "content-encoding"]);

async function proxyRequest(req: NextRequest, pathSegments: string[]) {
  const BACKEND_ROOT = backendRoot();
  const path = pathSegments.join("/");
  const target = `${BACKEND_ROOT}/api/${path}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!SKIP_REQ_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  const cookie = req.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  const clientIp = visitorIp(req);
  if (clientIp) {
    headers.set("x-crm-client-ip", clientIp);
    headers.set("x-forwarded-for", clientIp);
  }
  headers.set("x-crm-proxy", PROXY_MARK);

  const init: RequestInit = {
    method:  req.method,
    headers,
    cache:   "no-store",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    console.error("[api/backend proxy] fetch failed:", target, err);
    return NextResponse.json(
      {
        success: false,
        message: "Cannot reach API server. Set BACKEND_URL on Vercel to your Render URL.",
      },
      { status: 502 }
    );
  }

  const resHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (SKIP_RES_HEADERS.has(lower)) return;
    if (lower === "set-cookie") {
      resHeaders.append(key, value);
    } else {
      resHeaders.set(key, value);
    }
  });

  return new NextResponse(upstream.body, {
    status:     upstream.status,
    statusText: upstream.statusText,
    headers:    resHeaders,
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxyRequest(req, path);
}

export const GET     = handle;
export const POST    = handle;
export const PUT     = handle;
export const PATCH   = handle;
export const DELETE  = handle;
export const OPTIONS = handle;
