import { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import prisma from "../config/db";
import { comparePassword, hashPassword } from "../utils/hash";
import { generateToken } from "../utils/jwt";
import { AuthRequest } from "../middleware/auth.middleware";
import { getCache, setCache, invalidateCache } from "../utils/cache";
import { getJwtSecret, validatePassword } from "../config/security";
import { getSessionHours, getAdminAllowedIps, isCaptchaConfigured, isSmtpConfigured } from "../config/env";
import { getClientIp, getUserAgent } from "../utils/requestMeta";
import { evaluateNetworkAccess, sanitizeIpList } from "../utils/networkAccess";
import { officeNetworkMessage } from "../utils/staffAttendance";
import { writeAuditLog, fetchRecentAuditLogs } from "../utils/auditLog";
import { recordAccessHistory } from "../utils/accessHistory";
import {
  isLoginBlocked,
  requiresCaptcha,
  recordFailedLogin,
  clearLoginFailures,
} from "../utils/loginLockout";
import { verifyCaptchaToken } from "../utils/captcha";
import { assertPasswordNotBreached } from "../utils/passwordBreach";
import { sendOTPEmail, sendLoginAlertEmail } from "../utils/securityEmail";

import {
  otpStore,
  otpAttempts,
  otpResendCount,
  registerActiveSession,
  clearActiveSession,
  hasActiveSession,
  recordLoginAttempt,
  getLoginAttemptAlert,
  clearLoginAttemptAlert,
} from "../utils/sessions";
import { notifyLoginAttempt } from "../chat/chatSocket";
import { csrLoginBlocked } from "../utils/csrShiftWindow";

const JWT_SECRET = getJwtSecret();

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  tokenVersion: number;
};

function setCookieToken(res: Response, token: string, rememberMe: boolean) {
  const isProd = process.env.NODE_ENV === "production";
  const hours = getSessionHours(rememberMe);
  res.cookie("token", token, {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? "none" : "lax",
    path:     "/",
    maxAge:   hours * 60 * 60 * 1000,
  });
}

function userPayload(u: AuthUser) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

async function tokenUserId(req: Request): Promise<string | null> {
  const token =
    req.cookies?.token ??
    req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id?: string };
    return decoded.id ?? null;
  } catch {
    // Expired / rotated token still identifies this browser's last user
    try {
      const decoded = jwt.decode(token) as { id?: string } | null;
      return decoded?.id ?? null;
    } catch {
      return null;
    }
  }
}

/**
 * Single-device lock: block a second device.
 * Same browser re-login (cookie / Bearer still present for this user) must not
 * false-lock after SESSION_INVALID cleared the client but left activeSessionId in DB.
 */
async function blockIfAlreadyLoggedIn(userId: string, req: Request, res: Response): Promise<boolean> {
  const active = await hasActiveSession(userId);
  if (!active) return false;

  const cookieUserId = await tokenUserId(req);
  if (cookieUserId && cookieUserId === userId) {
    await clearActiveSession(userId);
    return false;
  }

  const attemptId = await recordLoginAttempt(userId);
  notifyLoginAttempt(userId, attemptId);

  res.status(403).json({
    success: false,
    code: "ALREADY_LOGGED_IN",
    message: "Already logged in on another device.",
  });
  return true;
}

async function issueSessionToken(
  res: Response,
  user: AuthUser,
  rememberMe: boolean
) {
  const sid = crypto.randomBytes(16).toString("hex");
  await registerActiveSession(user.id, sid);
  await clearLoginAttemptAlert(user.id);
  const hours = getSessionHours(rememberMe);
  const token = generateToken(user.id, user.role, user.tokenVersion, sid, hours);
  setCookieToken(res, token, rememberMe);
  return token;
}

async function finishLogin(
  req: Request,
  res: Response,
  user: AuthUser,
  rememberMe: boolean
) {
  await clearLoginFailures(user.email, getClientIp(req));
  const token = await issueSessionToken(res, user, rememberMe);

  const ip = getClientIp(req);
  const ua = getUserAgent(req);

  await writeAuditLog({
    action: "login_success",
    userId: user.id,
    email:  user.email,
    ip,
    userAgent: ua,
    meta: { rememberMe },
  });

  await recordAccessHistory({
    userId: user.id,
    email:  user.email,
    ip,
    userAgent: ua,
    event: "login",
  });

  /* CSR Check In is explicit on the dashboard — do not auto-open on login. */

  sendLoginAlertEmail({ to: user.email, name: user.name, ip, userAgent: ua });

  return res.json({
    success:     true,
    requires2FA: false,
    role:        user.role,
    user:        userPayload(user),
    token,
  });
}

function makeOTP(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

type PortalRole = "admin" | "csr" | "manager" | "technical_manager" | "accounts" | "estimator" | "bim_manager" | "bim";

function parsePortalRole(raw: unknown): PortalRole | null {
  const r = String(raw ?? "").toLowerCase();
  if (
    r === "admin" ||
    r === "csr" ||
    r === "manager" ||
    r === "technical_manager" ||
    r === "accounts" ||
    r === "estimator" ||
    r === "bim_manager" ||
    r === "bim"
  ) {
    return r;
  }
  return null;
}

function portalRoleLabel(role: PortalRole): string {
  if (role === "admin") return "CEO";
  if (role === "manager") return "Admin";
  if (role === "technical_manager") return "Chief Estimator";
  if (role === "bim_manager") return "BIM Manager";
  if (role === "accounts") return "Accounts";
  if (role === "estimator") return "Estimator";
  if (role === "bim") return "BIM";
  return "CSR";
}

function assertPortalRoleMatch(userRole: string, loginRole: PortalRole): string | null {
  if (userRole === loginRole) return null;
  return `This account is registered as ${portalRoleLabel(userRole as PortalRole)}. Select "${portalRoleLabel(userRole as PortalRole)}" on the login page.`;
}

function assertAdminIp(req: Request, role: string): string | null {
  if (role !== "admin" && role !== "manager" && role !== "technical_manager") return null;
  const allowed = getAdminAllowedIps();
  if (allowed.length === 0) return null;
  const ip = getClientIp(req);
  if (!allowed.includes(ip)) {
    return "Admin access is restricted to approved networks.";
  }
  return null;
}

function parseTemporaryHours(raw: unknown): 9 | 10 | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (n === 9 || n === 10) return n;
  return null;
}

/* ================= REGISTER ================= */
export const register = async (req: AuthRequest, res: Response) => {
  try {
    const {
      name, email, password, role, csrCode, employeeCode, fatherName, currentAddress, contactNo,
      cnic, cnicPdfUrl, profilePic,
      allowedIps, allowedMacAddress, temporaryAccessIp, temporaryAccessMac, temporaryAccessHours,
    } = req.body;

    if (role === "csr" && !csrCode?.trim()) {
      return res.status(400).json({ success: false, message: "CSR Code is required for CSR accounts." });
    }

    const pwdError = validatePassword(password);
    if (pwdError) {
      return res.status(400).json({ success: false, message: pwdError });
    }

    const breachError = await assertPasswordNotBreached(password);
    if (breachError) {
      return res.status(400).json({ success: false, message: breachError });
    }

    if (role === "admin" && req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can create admin accounts." });
    }

    if (role === "manager" && req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can create manager accounts." });
    }

    if (role === "technical_manager" && req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only CEO can create Chief Estimator accounts." });
    }

    if (role === "accounts" && req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can create Accounts users." });
    }

    if (role === "estimator" && req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can create Estimator accounts." });
    }

    if ((role === "bim_manager" || role === "bim") && req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only CEO can create BIM accounts." });
    }

    const validRoles = ["admin", "csr", "manager", "technical_manager", "accounts", "estimator", "bim_manager", "bim"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role." });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ success: false, message: "User already exists" });
    }

    if (csrCode?.trim()) {
      const codeTaken = await prisma.user.findFirst({ where: { csrCode: csrCode.trim() } });
      if (codeTaken) {
        return res.status(400).json({ success: false, message: `CSR Code "${csrCode}" is already in use.` });
      }
    }

    if (employeeCode?.trim()) {
      const empTaken = await prisma.user.findFirst({ where: { employeeCode: employeeCode.trim() } });
      if (empTaken) {
        return res.status(400).json({ success: false, message: `Employee Code "${employeeCode.trim()}" is already in use.` });
      }
    }

    const hashed = await hashPassword(password);
    const cleanedIps = sanitizeIpList(allowedIps);
    const tempHours = parseTemporaryHours(temporaryAccessHours);
    const tempAccessUntil =
      tempHours && (temporaryAccessIp || temporaryAccessMac)
        ? new Date(Date.now() + tempHours * 60 * 60 * 1000)
        : null;

    const userData: Prisma.UserCreateInput = {
      name,
      email,
      password: hashed,
      role,
      csrCode: role === "csr" || role === "estimator" || role === "bim" ? (csrCode?.trim() || null) : null,
      employeeCode: typeof employeeCode === "string" && employeeCode.trim() ? employeeCode.trim() : null,
      fatherName: typeof fatherName === "string" && fatherName.trim() ? fatherName.trim() : null,
      currentAddress: typeof currentAddress === "string" && currentAddress.trim() ? currentAddress.trim() : null,
      contactNo: typeof contactNo === "string" && contactNo.trim() ? contactNo.trim() : null,
      cnic: cnic?.trim() || null,
      cnicPdfUrl: typeof cnicPdfUrl === "string" && cnicPdfUrl.trim() ? cnicPdfUrl.trim() : null,
      profilePic: profilePic || null,
      allowedIps: cleanedIps,
      allowedMacAddress: typeof allowedMacAddress === "string" && allowedMacAddress.trim() ? allowedMacAddress.trim() : null,
      temporaryAccessIp: typeof temporaryAccessIp === "string" && temporaryAccessIp.trim() ? temporaryAccessIp.trim() : null,
      temporaryAccessMac: typeof temporaryAccessMac === "string" && temporaryAccessMac.trim() ? temporaryAccessMac.trim() : null,
      temporaryAccessUntil: tempAccessUntil,
    };
    const user = await prisma.user.create({
      data: userData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        csrCode: true,
        employeeCode: true,
        fatherName: true,
        currentAddress: true,
        contactNo: true,
        cnic: true,
        cnicPdfUrl: true,
        profilePic: true,
        allowedIps: true,
        allowedMacAddress: true,
        temporaryAccessIp: true,
        temporaryAccessMac: true,
        temporaryAccessUntil: true,
        createdAt: true,
      },
    });
    invalidateCache("users:list", "users:list:admin", "users:list:csr", "admin:csrs");
    return res.status(201).json({ success: true, user });
  } catch {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ================= CAPTCHA CONFIG (public) ================= */
export const getCaptchaConfig = async (_req: Request, res: Response) => {
  return res.json({
    success:   true,
    enabled:   isCaptchaConfigured(),
    siteKey:   process.env.TURNSTILE_SITE_KEY ?? "",
  });
};

/* ================= LOGIN — Step 1 ================= */
export const login = async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, password, rememberMe, captchaToken, loginRole: rawLoginRole } = req.body as {
      email: string;
      password: string;
      rememberMe?: boolean;
      captchaToken?: string;
      loginRole?: string;
    };

    const loginRole = parsePortalRole(rawLoginRole);
    if (!loginRole) {
      return res.status(400).json({
        success: false,
        code: "INVALID_LOGIN_ROLE",
        message: "Select the correct role portal before signing in.",
      });
    }

    const email = (rawEmail ?? "").trim().toLowerCase();
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const ip = getClientIp(req);
    const ua = getUserAgent(req);

    const block = await isLoginBlocked(email ?? "", ip);
    if (block.blocked) {
      await writeAuditLog({ action: "login_blocked", email, ip, userAgent: ua });
      return res.status(429).json({ success: false, blocked: true, message: block.message });
    }

    if (isCaptchaConfigured() && await requiresCaptcha(email, ip)) {
      const ok = await verifyCaptchaToken(captchaToken);
      if (!ok) {
        return res.status(400).json({
          success: false,
          code:    "CAPTCHA_REQUIRED",
          message: "Please complete the security verification.",
        });
      }
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      });
    }
    if (!user) {
      await recordFailedLogin(email ?? "", ip);
      await writeAuditLog({ action: "login_failed", email, ip, userAgent: ua, meta: { reason: "user_not_found" } });
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: "Account is deactivated" });
    }

    const roleMismatch = assertPortalRoleMatch(user.role, loginRole);
    if (roleMismatch) {
      await writeAuditLog({
        action: "login_failed",
        userId: user.id,
        email: user.email,
        ip,
        userAgent: ua,
        meta: { reason: "portal_role_mismatch", loginRole, userRole: user.role },
      });
      return res.status(403).json({
        success: false,
        code: "PORTAL_ROLE_MISMATCH",
        message: roleMismatch,
      });
    }

    const ipError = assertAdminIp(req, user.role);
    if (ipError) {
      await writeAuditLog({ action: "login_blocked", userId: user.id, email: user.email, ip, userAgent: ua, meta: { reason: "ip" } });
      return res.status(403).json({ success: false, code: "IP_NOT_ALLOWED", message: ipError });
    }

    const networkError = evaluateNetworkAccess(user, req);
    if (networkError) {
      await writeAuditLog({ action: "login_blocked", userId: user.id, email: user.email, ip, userAgent: ua, meta: { reason: "network_policy" } });
      return res.status(403).json({ success: false, code: "NETWORK_POLICY_DENIED", message: networkError });
    }

    if (user.role === "manager") {
      const officeError = await officeNetworkMessage(req);
      if (officeError) {
        await writeAuditLog({ action: "login_blocked", userId: user.id, email: user.email, ip, userAgent: ua, meta: { reason: "office_ip" } });
        return res.status(403).json({ success: false, code: "IP_NOT_ALLOWED", message: officeError });
      }
    }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      await recordFailedLogin(email, ip);
      await writeAuditLog({ action: "login_failed", userId: user.id, email: user.email, ip, userAgent: ua });
      const needCaptcha = await requiresCaptcha(email, ip);
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        captchaRequired: needCaptcha && isCaptchaConfigured(),
      });
    }

    const shiftBlock = csrLoginBlocked(user.role, user.email);
    if (shiftBlock) {
      await writeAuditLog({
        action: "login_blocked",
        userId: user.id,
        email: user.email,
        ip,
        userAgent: ua,
        meta: { reason: "csr_shift_window" },
      });
      return res.status(403).json({ success: false, code: "CSR_SHIFT_CLOSED", message: shiftBlock });
    }

    if (user.twoFAEnabled && isSmtpConfigured()) {
      if (await blockIfAlreadyLoggedIn(user.id, req, res)) return;

      const existing = otpAttempts.get(user.id);
      if (existing?.blockedUntil && Date.now() < existing.blockedUntil) {
        const mins = Math.ceil((existing.blockedUntil - Date.now()) / 60000);
        return res.status(429).json({
          success: false,
          blocked: true,
          message: `Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? "s" : ""}.`,
        });
      }

      otpAttempts.delete(user.id);
      otpResendCount.delete(user.id);
      const otp = makeOTP();
      otpStore.set(user.id, { otp, expiresAt: Date.now() + 5 * 60 * 1000, loginRole });

      sendOTPEmail(user.email, otp);

      return res.json({
        success:     true,
        requires2FA: true,
        userId:      user.id,
        message:     `OTP sent to ${user.email}`,
      });
    }

    if (await blockIfAlreadyLoggedIn(user.id, req, res)) return;

    const dbUser = await prisma.user.findUnique({
      where:  { id: user.id },
      select: { id: true, name: true, email: true, role: true, tokenVersion: true },
    });
    if (!dbUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return finishLogin(req, res, dbUser, !!rememberMe);
  } catch (err) {
    console.error("[auth/login]", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ================= VERIFY OTP ================= */
export const verifyOTP = async (req: Request, res: Response) => {
  try {
    const { userId, otp, rememberMe, loginRole: rawLoginRole } = req.body;
    if (!userId || !otp) {
      return res.status(400).json({ success: false, message: "userId and OTP required." });
    }

    const MAX_ATTEMPTS   = 2;
    const BLOCK_DURATION = 1 * 60 * 60 * 1000;

    const attempt = otpAttempts.get(userId);
    if (attempt?.blockedUntil && Date.now() < attempt.blockedUntil) {
      const mins = Math.ceil((attempt.blockedUntil - Date.now()) / 60000);
      return res.status(429).json({
        success: false,
        blocked: true,
        message: `Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? "s" : ""}.`,
      });
    }

    const stored = otpStore.get(userId);
    if (!stored) {
      return res.status(400).json({ success: false, message: "OTP expired. Please login again." });
    }
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(userId);
      return res.status(400).json({ success: false, message: "OTP expired. Please login again." });
    }

    if (stored.otp !== otp.toString().trim()) {
      const currentCount = attempt?.count ?? 0;
      const newCount     = currentCount + 1;

      if (newCount >= MAX_ATTEMPTS) {
        otpAttempts.set(userId, { count: newCount, blockedUntil: Date.now() + BLOCK_DURATION });
        otpStore.delete(userId);
        return res.status(429).json({
          success: false,
          blocked: true,
          message: "Too many failed attempts. Try again after 1 hour.",
        });
      }

      otpAttempts.set(userId, { count: newCount });
      const left = MAX_ATTEMPTS - newCount;
      return res.status(401).json({
        success:  false,
        blocked:  false,
        attempts: newCount,
        message:  `Incorrect OTP. ${left} attempt${left !== 1 ? "s" : ""} remaining.`,
      });
    }

    otpStore.delete(userId);
    otpAttempts.delete(userId);
    otpResendCount.delete(userId);

    if (await blockIfAlreadyLoggedIn(userId, req, res)) return;

    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: {
        id: true, name: true, email: true, role: true, tokenVersion: true,
        allowedIps: true, allowedMacAddress: true, temporaryAccessIp: true, temporaryAccessMac: true, temporaryAccessUntil: true,
      },
    });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const loginRole = parsePortalRole(rawLoginRole) ?? parsePortalRole(stored.loginRole);
    if (!loginRole) {
      return res.status(400).json({
        success: false,
        code: "INVALID_LOGIN_ROLE",
        message: "Select the correct role portal before signing in.",
      });
    }
    const roleMismatch = assertPortalRoleMatch(user.role, loginRole);
    if (roleMismatch) {
      return res.status(403).json({
        success: false,
        code: "PORTAL_ROLE_MISMATCH",
        message: roleMismatch,
      });
    }

    const networkError = evaluateNetworkAccess(user, req);
    if (networkError) {
      return res.status(403).json({ success: false, code: "NETWORK_POLICY_DENIED", message: networkError });
    }

    if (user.role === "manager") {
      const officeError = await officeNetworkMessage(req);
      if (officeError) {
        return res.status(403).json({ success: false, code: "IP_NOT_ALLOWED", message: officeError });
      }
    }

    const shiftBlock = csrLoginBlocked(user.role, user.email);
    if (shiftBlock) {
      return res.status(403).json({ success: false, code: "CSR_SHIFT_CLOSED", message: shiftBlock });
    }

    return finishLogin(req, res, user, !!rememberMe);
  } catch {
    return res.status(500).json({ success: false, message: "OTP verification failed." });
  }
};

/* ================= RESEND OTP ================= */
export const resendOTP = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: "userId required." });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const attempt = otpAttempts.get(userId);
    if (attempt?.blockedUntil && Date.now() < attempt.blockedUntil) {
      const mins = Math.ceil((attempt.blockedUntil - Date.now()) / 60000);
      return res.status(429).json({
        success: false,
        blocked: true,
        message: `Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? "s" : ""}.`,
      });
    }

    const currentResends = otpResendCount.get(userId) ?? 0;
    if (currentResends >= 1) {
      return res.status(429).json({
        success: false,
        blocked: true,
        message: "OTP resend limit reached. Please go back and login again.",
      });
    }

    otpResendCount.set(userId, currentResends + 1);
    const otp = makeOTP();
    otpStore.set(userId, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

    sendOTPEmail(user.email, otp);
    return res.json({ success: true, message: `OTP resent to ${user.email}` });
  } catch {
    return res.status(500).json({ success: false, message: "Resend failed." });
  }
};

/* ================= LOGOUT ================= */
export const logout = async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  try {
    const token =
      req.cookies?.token ??
      req.headers.authorization?.replace("Bearer ", "");
    if (token) {
      let userId: string | undefined;
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id?: string };
        userId = decoded.id;
      } catch {
        const decoded = jwt.decode(token) as { id?: string } | null;
        userId = decoded?.id;
      }
      if (userId) {
        await clearActiveSession(userId);
        await writeAuditLog({ action: "logout", userId, ip, userAgent: ua });
        await recordAccessHistory({ userId, ip, userAgent: ua, event: "logout" });
        /* Work session stays open — only Check Out / stale timeout ends the shift */
      }
    }
  } catch { /* ignore */ }
  res.clearCookie("token");
  return res.json({ success: true, message: "Logged out" });
};

/* ================= LOGOUT ALL DEVICES ================= */
export const logoutAllDevices = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (req.user.role === "csr") {
      return res.status(403).json({ success: false, message: "Logout all devices is not available for CSR accounts." });
    }
    await prisma.user.update({
      where: { id: req.user.id },
      data:  { tokenVersion: { increment: 1 } },
    });
    await clearActiveSession(req.user.id);
    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    await writeAuditLog({
      action:    "logout_all",
      userId:    req.user.id,
      ip,
      userAgent: ua,
    });
    await recordAccessHistory({
      userId:    req.user.id,
      ip,
      userAgent: ua,
      event:     "logout_all",
    });
    res.clearCookie("token");
    invalidateCache(`auth:me:${req.user.id}`);
    return res.json({
      success: true,
      message: "Logged out from all devices. Please sign in again.",
      requiresReLogin: true,
    });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to logout all devices." });
  }
};

/* ================= GET ME ================= */
export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const cacheKey = `auth:me:${req.user.id}`;
    const cached = getCache<object>(cacheKey);
    if (cached) return res.json(cached);

    const user = await prisma.user.findUnique({
      where:  { id: req.user.id },
      select: {
        id: true, name: true, email: true, role: true,
        csrCode: true, cnic: true, profilePic: true,
        twoFAEnabled: true, createdAt: true,
        chatEnabled: true, chatAllowedUserIds: true, chatVisibleToUserIds: true,
      },
    });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const payload = { success: true, user };
    setCache(cacheKey, payload, 30_000);
    return res.json(payload);
  } catch {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ================= UPDATE PROFILE ================= */
export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const { name, email, profilePic, cnic } = req.body;
    if (!name || !email) {
      return res.status(400).json({ success: false, message: "Name and email required." });
    }
    const taken = await prisma.user.findFirst({ where: { email, NOT: { id: req.user.id } } });
    if (taken) {
      return res.status(400).json({ success: false, message: "Email already in use." });
    }
    const data: { name: string; email: string; profilePic?: string | null; cnic?: string | null } = {
      name,
      email,
    };
    if (profilePic !== undefined) data.profilePic = profilePic || null;
    if (cnic !== undefined && req.user.role === "admin") data.cnic = cnic || null;

    const updated = await prisma.user.update({
      where:  { id: req.user.id },
      data,
      select: {
        id: true, name: true, email: true, role: true,
        csrCode: true, cnic: true, profilePic: true,
        twoFAEnabled: true, createdAt: true,
      },
    });
    invalidateCache(`auth:me:${req.user.id}`, "users:list", "users:list:admin", "users:list:csr", "users:list:manager");
    return res.json({ success: true, user: updated });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to update profile." });
  }
};

/* ================= CHANGE PASSWORD ================= */
export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (req.user.role === "csr") {
      return res.status(403).json({
        success: false,
        message: "Password changes are managed by admin. Please contact your administrator.",
      });
    }
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Both passwords required." });
    }
    const pwdError = validatePassword(newPassword);
    if (pwdError) {
      return res.status(400).json({ success: false, message: pwdError });
    }
    const breachError = await assertPasswordNotBreached(newPassword);
    if (breachError) {
      return res.status(400).json({ success: false, message: breachError });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const isMatch = await comparePassword(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Current password is incorrect." });
    }
    const hashed = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: req.user.id },
      data:  { password: hashed, tokenVersion: { increment: 1 } },
    });
    await clearActiveSession(req.user.id);
    await writeAuditLog({
      action:    "password_change",
      userId:    req.user.id,
      email:     user.email,
      ip:        getClientIp(req),
      userAgent: getUserAgent(req),
    });
    res.clearCookie("token");
    return res.json({
      success: true,
      message: "Password changed successfully. Please log in again.",
      requiresReLogin: true,
    });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to change password." });
  }
};

/* ================= ACK LOGIN-ATTEMPT ALERT ================= */
export const ackSessionAlert = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    await clearLoginAttemptAlert(req.user.id);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to acknowledge alert" });
  }
};

/* ================= SESSION STATUS ================= */
export const getSessionStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const alert = await getLoginAttemptAlert(req.user.id);
    const loginAttemptPending = !!alert;

    return res.json({
      success: true,
      loginAttemptPending,
      attemptId: alert?.attemptId ?? 0,
      message:   loginAttemptPending
        ? "Someone is trying to login to your account from another device."
        : undefined,
    });
  } catch {
    return res.status(500).json({ success: false, message: "Session check failed." });
  }
};

/* ================= SECURITY AUDIT LOGS (admin) ================= */
export const getAuditLogs = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id || req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin only." });
    }
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
    const fromDate = typeof req.query.fromDate === "string" ? req.query.fromDate : undefined;
    const toDate   = typeof req.query.toDate   === "string" ? req.query.toDate   : undefined;
    const logs = await fetchRecentAuditLogs(limit, fromDate, toDate);
    return res.json({ success: true, logs });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to fetch audit logs." });
  }
};

/* ================= TOGGLE 2FA (admin + CSR) ================= */
export const toggle2FA = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const { enabled } = req.body;
    await prisma.user.update({
      where: { id: req.user.id },
      data:  { twoFAEnabled: !!enabled },
    });
    await writeAuditLog({
      action:    enabled ? "2fa_enabled" : "2fa_disabled",
      userId:    req.user.id,
      ip:        getClientIp(req),
      userAgent: getUserAgent(req),
    });
    invalidateCache(`auth:me:${req.user.id}`);
    return res.json({ success: true, twoFAEnabled: !!enabled });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to toggle 2FA." });
  }
};
