import prisma from "../config/db";

export type AuditAction =
  | "login_success"
  | "login_failed"
  | "login_blocked"
  | "logout"
  | "logout_all"
  | "password_change"
  | "admin_password_reset"
  | "admin_logout_all"
  | "session_invalid"
  | "account_deactivated"
  | "2fa_enabled"
  | "2fa_disabled";

export async function fetchRecentAuditLogs(
  limit: number,
  fromDate?: string,
  toDate?: string,
) {
  const where: { createdAt?: { gte?: Date; lte?: Date } } = {};
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) {
      const start = new Date(fromDate);
      start.setHours(0, 0, 0, 0);
      where.createdAt.gte = start;
    }
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  return prisma.securityAuditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take:    limit,
  });
}

export async function writeAuditLog(opts: {
  action: AuditAction;
  userId?: string | null;
  email?: string | null;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.securityAuditLog.create({
      data: {
        action:    opts.action,
        userId:    opts.userId ?? null,
        email:     opts.email ?? null,
        ip:        opts.ip ?? null,
        userAgent: opts.userAgent ?? null,
        meta:      opts.meta ? JSON.stringify(opts.meta) : null,
      },
    });
  } catch (err) {
    console.log("[AuditLog]", err);
  }
}
