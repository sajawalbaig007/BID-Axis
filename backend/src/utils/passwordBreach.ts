import crypto from "crypto";

/** Have I Been Pwned k-anonymity range API — returns true if password found in breaches */
export async function isPasswordBreached(password: string): Promise<boolean> {
  if (!password || password.length < 8) return false;
  try {
    const sha1 = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "User-Agent": "CRM-Dashboard-Security" },
      signal:  AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;

    const text = await res.text();
    return text.split("\n").some((line) => line.startsWith(suffix));
  } catch {
    return false;
  }
}

export async function assertPasswordNotBreached(password: string): Promise<string | null> {
  const breached = await isPasswordBreached(password);
  if (breached) {
    return "This password has appeared in a data breach. Please choose a different password.";
  }
  return null;
}
