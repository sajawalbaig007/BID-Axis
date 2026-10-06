import prisma from "../config/db";
import { detectBrowser } from "./sessions";

const lastHeartbeat = new Map<string, number>();
const HEARTBEAT_LOG_MS = 15 * 60 * 1000;

export async function recordAccessHistory(opts: {
  userId: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  deviceId?: string;
  browser?: string;
  event: string;
}): Promise<void> {
  try {
    const ua = opts.userAgent ?? "";
    await prisma.accessHistory.create({
      data: {
        userId:    opts.userId,
        email:     opts.email ?? null,
        ip:        opts.ip ?? null,
        userAgent: ua ? ua.slice(0, 512) : null,
        deviceId:  opts.deviceId ?? null,
        browser:   opts.browser ?? (ua ? detectBrowser(ua) : null),
        event:     opts.event,
      },
    });
  } catch {
    /* non-blocking */
  }
}

/** Throttle heartbeat rows so admin history stays readable. */
export async function recordHeartbeatAccess(opts: {
  userId: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  deviceId?: string;
}): Promise<void> {
  const key = `${opts.userId}:${opts.deviceId ?? "unknown"}`;
  const now = Date.now();
  const prev = lastHeartbeat.get(key) ?? 0;
  if (now - prev < HEARTBEAT_LOG_MS) return;
  lastHeartbeat.set(key, now);
  await recordAccessHistory({ ...opts, event: "heartbeat" });
}
