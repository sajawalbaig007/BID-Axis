import { isCaptchaConfigured } from "../config/env";

export async function verifyCaptchaToken(token: string | undefined): Promise<boolean> {
  if (!isCaptchaConfigured()) return true;
  if (!token?.trim()) return false;

  const secret = process.env.TURNSTILE_SECRET_KEY!.trim();
  try {
    const body = new URLSearchParams({
      secret,
      response: token.trim(),
    });
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    body.toString(),
      signal:  AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return !!data.success;
  } catch {
    return false;
  }
}
