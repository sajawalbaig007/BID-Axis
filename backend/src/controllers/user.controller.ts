import { Request, Response } from "express";
import prisma from "../config/db";
import { invalidateCache, invalidatePattern, flushAdminClientsCache } from "../utils/cache";
import { purgeCsrLeads } from "../utils/purgeCsrLeads";
import { notifyAdminSummaryStale, forceLogoutUser } from "../chat/chatSocket";
import { flushReportCache } from "./report.controller";
import { AuthRequest } from "../middleware/auth.middleware";
import { hashPassword } from "../utils/hash";
import { validatePassword } from "../config/security";
import { assertPasswordNotBreached } from "../utils/passwordBreach";
import { writeAuditLog } from "../utils/auditLog";
import { recordAccessHistory } from "../utils/accessHistory";
import { getClientIp, getUserAgent } from "../utils/requestMeta";
import { clearActiveSession, userBrowserMap } from "../utils/sessions";
import { sanitizeIpList } from "../utils/networkAccess";

function parseTemporaryHours(raw: unknown): 9 | 10 | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (n === 9 || n === 10) return n;
  return null;
}

export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const {
      name, email, role, isActive, csrCode, employeeCode, fatherName, currentAddress, contactNo,
      cnic, cnicPdfUrl, profilePic,
      allowedIps, allowedMacAddress, temporaryAccessIp, temporaryAccessMac, temporaryAccessHours,
      chatEnabled, chatAllowedUserIds, chatVisibleToUserIds,
    } = req.body;

    const data: Record<string, unknown> = {};
    if (name       !== undefined) data.name       = name;
    if (email      !== undefined) data.email      = email;
    if (role       !== undefined) data.role       = role;
    if (isActive   !== undefined) data.isActive   = isActive;
    if (csrCode    !== undefined) data.csrCode    = csrCode    || null;
    if (employeeCode !== undefined) {
      const code = typeof employeeCode === "string" ? employeeCode.trim() : "";
      if (code) {
        const empTaken = await prisma.user.findFirst({
          where: { employeeCode: code, NOT: { id } },
          select: { id: true },
        });
        if (empTaken) {
          return res.status(400).json({ message: `Employee Code "${code}" is already in use.` });
        }
      }
      data.employeeCode = code || null;
    }
    if (fatherName !== undefined) data.fatherName = typeof fatherName === "string" && fatherName.trim() ? fatherName.trim() : null;
    if (currentAddress !== undefined) {
      data.currentAddress =
        typeof currentAddress === "string" && currentAddress.trim() ? currentAddress.trim() : null;
    }
    if (contactNo !== undefined) {
      data.contactNo = typeof contactNo === "string" && contactNo.trim() ? contactNo.trim() : null;
    }
    if (cnic       !== undefined) data.cnic       = cnic       || null;
    if (cnicPdfUrl !== undefined) data.cnicPdfUrl = cnicPdfUrl || null;
    if (profilePic !== undefined) data.profilePic = profilePic || null;
    if (allowedIps !== undefined) data.allowedIps = sanitizeIpList(allowedIps);
    if (allowedMacAddress !== undefined) data.allowedMacAddress = allowedMacAddress?.trim() || null;
    if (temporaryAccessIp !== undefined) data.temporaryAccessIp = temporaryAccessIp?.trim() || null;
    if (temporaryAccessMac !== undefined) data.temporaryAccessMac = temporaryAccessMac?.trim() || null;
    if (temporaryAccessHours !== undefined || temporaryAccessIp !== undefined || temporaryAccessMac !== undefined) {
      const h = parseTemporaryHours(temporaryAccessHours);
      data.temporaryAccessUntil =
        h && (temporaryAccessIp?.trim() || temporaryAccessMac?.trim())
          ? new Date(Date.now() + h * 60 * 60 * 1000)
          : null;
    }
    if (chatEnabled !== undefined) data.chatEnabled = Boolean(chatEnabled);
    if (chatAllowedUserIds !== undefined) {
      const ids = Array.isArray(chatAllowedUserIds)
        ? chatAllowedUserIds.filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0)
        : [];
      data.chatAllowedUserIds = Array.from(new Set(ids.filter((uid: string) => uid !== id)));
    }
    if (chatVisibleToUserIds !== undefined) {
      const ids = Array.isArray(chatVisibleToUserIds)
        ? chatVisibleToUserIds.filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0)
        : [];
      data.chatVisibleToUserIds = Array.from(new Set(ids.filter((uid: string) => uid !== id)));
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    const user = await prisma.user.update({
      where:  { id },
      data,
      select: {
        id: true, name: true, email: true, role: true, csrCode: true,
        employeeCode: true, fatherName: true, currentAddress: true, contactNo: true,
        cnic: true, cnicPdfUrl: true, profilePic: true, isActive: true,
        allowedIps: true, allowedMacAddress: true, temporaryAccessIp: true, temporaryAccessMac: true, temporaryAccessUntil: true,
        chatEnabled: true, chatAllowedUserIds: true, chatVisibleToUserIds: true,
      },
    });
    invalidateCache("users:list", "users:list:admin", "users:list:csr", "users:list:manager", "admin:csrs", `auth:me:${id}`);
    if (chatEnabled !== undefined || chatAllowedUserIds !== undefined || chatVisibleToUserIds !== undefined) {
      invalidatePattern("chat:convs:");
    }
    return res.json(user);
  } catch (err) {
    console.error("[users] updateUser", err);
    return res.status(500).json({ message: "Update failed" });
  }
};

export const adminSetUserPassword = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { newPassword } = req.body as { newPassword?: string };

    if (!newPassword) {
      return res.status(400).json({ success: false, message: "New password is required." });
    }

    const pwdError = validatePassword(newPassword);
    if (pwdError) {
      return res.status(400).json({ success: false, message: pwdError });
    }

    const breachError = await assertPasswordNotBreached(newPassword);
    if (breachError) {
      return res.status(400).json({ success: false, message: breachError });
    }

    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!target) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const hashed = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id },
      data:  { password: hashed, tokenVersion: { increment: 1 } },
    });

    await clearActiveSession(id);
    await writeAuditLog({
      action:    "admin_password_reset",
      userId:    id,
      email:     target.email,
      ip:        getClientIp(req),
      userAgent: getUserAgent(req),
      meta:      { resetBy: req.user?.id },
    });

    invalidateCache("users:list", "users:list:admin", "users:list:csr", "admin:csrs");
    return res.json({ success: true, message: "Password updated. User must sign in again." });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to update password." });
  }
};

export const adminLogoutAllDevices = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true },
    });
    if (!target) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    await prisma.user.update({
      where: { id },
      data: {
        tokenVersion: { increment: 1 },
        isOnline: false,
        activeSessionId: null,
      },
    });
    await clearActiveSession(id);
    userBrowserMap.delete(id);
    forceLogoutUser(id);

    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    await writeAuditLog({
      action:    "admin_logout_all",
      userId:    id,
      email:     target.email,
      ip,
      userAgent: ua,
      meta:      { resetBy: req.user?.id },
    });
    await recordAccessHistory({
      userId:    id,
      email:     target.email,
      ip,
      userAgent: ua,
      event:     "logout_all",
    });

    invalidateCache(
      `auth:me:${id}`,
      "users:list",
      "users:list:admin",
      "users:list:csr",
      "users:list:manager",
      "admin:csrs",
    );
    return res.json({
      success: true,
      message: `${target.name} was logged out from all devices.`,
      self: req.user?.id === id,
    });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to log user out." });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    /* 1. Permanently remove all lead data assigned to this user */
    await purgeCsrLeads(id);

    /* 2. CSR-level call logs (safety net — purgeCsrLeads already clears these) */
    await prisma.callLog.deleteMany({ where: { csrId: id } });

    /* 3. Chat messages — nullify replyToId before deleting to avoid dangling refs */
    const userMsgs = await prisma.message.findMany({ where: { senderId: id }, select: { id: true } });
    if (userMsgs.length > 0) {
      const msgIds = userMsgs.map(m => m.id);
      await prisma.message.updateMany({ where: { replyToId: { in: msgIds } }, data: { replyToId: null } });
      await prisma.message.deleteMany({ where: { senderId: id } });
    }

    /* 4. Conversation memberships */
    await prisma.conversationMember.deleteMany({ where: { userId: id } });

    /* 5. Reports — just nullify the FK, keep the report */
    await prisma.report.updateMany({ where: { generatedBy: id }, data: { generatedBy: null } });

    /* 6. Session / audit / access rows that block User delete (required FKs) */
    await prisma.accessHistory.deleteMany({ where: { userId: id } });
    await prisma.csrWorkSession.deleteMany({ where: { userId: id } });
    await prisma.securityAuditLog.updateMany({ where: { userId: id }, data: { userId: null } });
    await prisma.loginAttemptAlert.deleteMany({ where: { userId: id } });
    await prisma.staffEmployee.updateMany({ where: { userId: id }, data: { userId: null } });

    /* 7. Delete the user */
    await prisma.user.delete({ where: { id } });

    flushAdminClientsCache();
    flushReportCache();
    notifyAdminSummaryStale();
    invalidateCache("users:list", "users:list:admin", "users:list:csr", "admin:csrs", `csr:dashboard:${id}`, `csr:leads:${id}`);
    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    console.log("[deleteUser]", err);
    const detail =
      err && typeof err === "object" && "message" in err
        ? String((err as { message?: unknown }).message ?? "")
        : "";
    res.status(500).json({
      message: detail.includes("Foreign key") || detail.includes("constraint")
        ? "Delete failed — linked records could not be cleared. Try again or contact support."
        : "Delete failed",
    });
  }
};
