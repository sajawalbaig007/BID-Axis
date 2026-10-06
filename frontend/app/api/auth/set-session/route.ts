import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json() as { token?: string };
    if (!token || typeof token !== "string") {
      return NextResponse.json({ success: false, message: "Token required" }, { status: 400 });
    }

    const isProd = process.env.NODE_ENV === "production";
    const res = NextResponse.json({ success: true });
    res.cookies.set("token", token, {
      httpOnly: true,
      secure:   isProd,
      sameSite: "lax",
      path:     "/",
      maxAge:   7 * 24 * 60 * 60,
    });
    return res;
  } catch {
    return NextResponse.json({ success: false, message: "Failed to set session" }, { status: 500 });
  }
}
