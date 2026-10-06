import { SEED_USER_EMAILS } from "../constants/seedUsers";

const TZ = "Asia/Karachi";

/** Minutes since midnight in Pakistan time. */
export function pktMinutes(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const second = Number(parts.find((p) => p.type === "second")?.value ?? "0");
  return hour * 3600 + minute * 60 + second;
}

/** CSR desk is open from 6:00:00 PM PKT until 2:59:59 AM. 3:00:00 AM closes it. */
export function csrShiftOpen(now = new Date()): boolean {
  const secs = pktMinutes(now);
  return secs >= 18 * 3600 || secs < 3 * 3600;
}

export const CSR_SHIFT_CLOSED_MESSAGE =
  "You cannot log in before 6:00 PM PKT. CSR access is 6:00 PM to 3:00 AM, and the CRM signs out at 3:00 AM.";

/** Seed accounts can sign in at any time. Real CSR accounts follow the night window. */
export function csrLoginBlocked(role: string, email: string, now = new Date()): string | null {
  if (role !== "csr") return null;
  if (SEED_USER_EMAILS.includes(email.trim().toLowerCase())) return null;
  if (csrShiftOpen(now)) return null;
  return CSR_SHIFT_CLOSED_MESSAGE;
}
