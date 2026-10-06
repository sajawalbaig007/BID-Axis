import prisma from "../config/db";

const MAX_FAILS     = 8;
const BLOCK_MS      = 30 * 60 * 1000;
const CAPTCHA_AFTER = 3;

function keysFor(email: string, ip: string): string[] {
  return [`email:${email.toLowerCase()}`, `ip:${ip}`];
}

export async function isLoginBlocked(email: string, ip: string): Promise<{ blocked: boolean; message?: string }> {
  try {
    const now = new Date();
    const rows = await prisma.loginLockout.findMany({
      where: { key: { in: keysFor(email, ip) } },
    });
    for (const row of rows) {
      if (row.blockedUntil && row.blockedUntil > now) {
        const mins = Math.ceil((row.blockedUntil.getTime() - now.getTime()) / 60000);
        return {
          blocked: true,
          message: `Too many failed login attempts. Try again in ${mins} minute${mins !== 1 ? "s" : ""}.`,
        };
      }
    }
    return { blocked: false };
  } catch (err) {
    console.error("[loginLockout] isLoginBlocked:", err);
    return { blocked: false };
  }
}

export async function requiresCaptcha(email: string, ip: string): Promise<boolean> {
  try {
    const rows = await prisma.loginLockout.findMany({
      where: { key: { in: keysFor(email, ip) } },
    });
    return rows.some((r: { failCount: number }) => r.failCount >= CAPTCHA_AFTER);
  } catch (err) {
    console.error("[loginLockout] requiresCaptcha:", err);
    return false;
  }
}

export async function recordFailedLogin(email: string, ip: string): Promise<void> {
  try {
    const now = new Date();
    for (const key of keysFor(email, ip)) {
      const existing = await prisma.loginLockout.findUnique({ where: { key } });
      const failCount = (existing?.failCount ?? 0) + 1;
      const blockedUntil =
        failCount >= MAX_FAILS ? new Date(now.getTime() + BLOCK_MS) : existing?.blockedUntil ?? null;

      await prisma.loginLockout.upsert({
        where:  { key },
        create: { key, failCount, blockedUntil },
        update: { failCount, blockedUntil },
      });
    }
  } catch (err) {
    console.error("[loginLockout] recordFailedLogin:", err);
  }
}

export async function clearLoginFailures(email: string, ip: string): Promise<void> {
  try {
    await prisma.loginLockout.deleteMany({
      where: { key: { in: keysFor(email, ip) } },
    });
  } catch (err) {
    console.error("[loginLockout] clearLoginFailures:", err);
  }
}
