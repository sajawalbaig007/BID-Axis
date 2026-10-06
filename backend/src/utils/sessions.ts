import prisma from "../config/db";

const lastSessionTouch = new Map<string, number>();
const SESSION_TOUCH_INTERVAL_MS = 60_000;

/* OTP store: userId → { otp, expiresAt } */
export const otpStore = new Map<string, { otp: string; expiresAt: number; loginRole?: string }>();

/* OTP wrong attempts: userId → { count, blockedUntil? } */
export const otpAttempts = new Map<string, { count: number; blockedUntil?: number }>();

/* OTP resend count: userId → number (max 1 resend) */
export const otpResendCount = new Map<string, number>();

/* Browser/Tab info: userId → { browser, tabId, openedAt, tabVisible, hiddenAt } */
export const userBrowserMap = new Map<string, {
  browser:     string;
  tabId:       string;
  openedAt:    string;
  tabVisible:  boolean;
  hiddenAt:    string | null;
}>();

export type LoginAttemptAlert = {
  attemptId: number;
  at:        number;
};

let loginAttemptSeq = 0;

export async function hasActiveSession(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { activeSessionId: true, lastActive: true },
  });
  if (!user?.activeSessionId) return false;

  // Stale session (closed browser / crash) — free the seat so they can log in again.
  // Active clients touch lastActive ~every 60s, so 15m means the other device is gone.
  const STALE_MS = Number(process.env.SESSION_STALE_MS ?? 15 * 60 * 1000);
  const last = user.lastActive?.getTime() ?? 0;
  if (!last || Date.now() - last > STALE_MS) {
    await clearActiveSession(userId);
    return false;
  }
  return true;
}

export async function registerActiveSession(userId: string, sid: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data:  { activeSessionId: sid, lastActive: new Date(), lastLoginAt: new Date() },
  });
}

export async function touchActiveSession(userId: string): Promise<void> {
  const now = Date.now();
  const last = lastSessionTouch.get(userId) ?? 0;
  if (now - last < SESSION_TOUCH_INTERVAL_MS) return;
  lastSessionTouch.set(userId, now);
  await prisma.user.update({
    where: { id: userId },
    data:  { lastActive: new Date() },
  }).catch(() => { /* non-fatal */ });
}

export async function clearActiveSession(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data:  { activeSessionId: null },
  }).catch(() => { /* user may already be deleted */ });
}

export async function recordLoginAttempt(userId: string): Promise<number> {
  loginAttemptSeq += 1;
  await prisma.loginAttemptAlert.upsert({
    where:  { userId },
    create: { userId, attemptId: loginAttemptSeq },
    update: { attemptId: loginAttemptSeq, createdAt: new Date() },
  });
  return loginAttemptSeq;
}

export async function getLoginAttemptAlert(userId: string): Promise<LoginAttemptAlert | null> {
  const row = await prisma.loginAttemptAlert.findUnique({ where: { userId } });
  if (!row) return null;
  return { attemptId: row.attemptId, at: row.createdAt.getTime() };
}

export async function clearLoginAttemptAlert(userId: string): Promise<void> {
  await prisma.loginAttemptAlert.deleteMany({ where: { userId } });
}

export function detectBrowser(ua: string): string {
  if (!ua)                                              return "Unknown";
  if (ua.includes("Edg/"))                             return "Edge";
  if (ua.includes("OPR/") || ua.includes("Opera/"))   return "Opera";
  if (ua.includes("Chrome/"))                          return "Chrome";
  if (ua.includes("Firefox/"))                         return "Firefox";
  if (ua.includes("Safari/") && !ua.includes("Chrome/")) return "Safari";
  return "Browser";
}
