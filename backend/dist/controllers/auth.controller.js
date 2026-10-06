"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggle2FA = exports.getAuditLogs = exports.getSessionStatus = exports.ackSessionAlert = exports.changePassword = exports.updateProfile = exports.getMe = exports.logoutAllDevices = exports.logout = exports.resendOTP = exports.verifyOTP = exports.login = exports.getCaptchaConfig = exports.register = void 0;
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = __importDefault(require("../config/db"));
const hash_1 = require("../utils/hash");
const jwt_1 = require("../utils/jwt");
const cache_1 = require("../utils/cache");
const security_1 = require("../config/security");
const env_1 = require("../config/env");
const requestMeta_1 = require("../utils/requestMeta");
const networkAccess_1 = require("../utils/networkAccess");
const auditLog_1 = require("../utils/auditLog");
const accessHistory_1 = require("../utils/accessHistory");
const loginLockout_1 = require("../utils/loginLockout");
const captcha_1 = require("../utils/captcha");
const passwordBreach_1 = require("../utils/passwordBreach");
const securityEmail_1 = require("../utils/securityEmail");
const sessions_1 = require("../utils/sessions");
const chatSocket_1 = require("../chat/chatSocket");
const JWT_SECRET = (0, security_1.getJwtSecret)();
function setCookieToken(res, token, rememberMe) {
    const isProd = process.env.NODE_ENV === "production";
    const hours = (0, env_1.getSessionHours)(rememberMe);
    res.cookie("token", token, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
        path: "/",
        maxAge: hours * 60 * 60 * 1000,
    });
}
function userPayload(u) {
    return { id: u.id, name: u.name, email: u.email, role: u.role };
}
async function tokenUserId(req) {
    const token = req.cookies?.token ??
        req.headers.authorization?.replace("Bearer ", "");
    if (!token)
        return null;
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        return decoded.id ?? null;
    }
    catch {
        // Expired / rotated token still identifies this browser's last user
        try {
            const decoded = jsonwebtoken_1.default.decode(token);
            return decoded?.id ?? null;
        }
        catch {
            return null;
        }
    }
}
/**
 * Single-device lock: block a second device.
 * Same browser re-login (cookie / Bearer still present for this user) must not
 * false-lock after SESSION_INVALID cleared the client but left activeSessionId in DB.
 */
async function blockIfAlreadyLoggedIn(userId, req, res) {
    const active = await (0, sessions_1.hasActiveSession)(userId);
    if (!active)
        return false;
    const cookieUserId = await tokenUserId(req);
    if (cookieUserId && cookieUserId === userId) {
        await (0, sessions_1.clearActiveSession)(userId);
        return false;
    }
    const attemptId = await (0, sessions_1.recordLoginAttempt)(userId);
    (0, chatSocket_1.notifyLoginAttempt)(userId, attemptId);
    res.status(403).json({
        success: false,
        code: "ALREADY_LOGGED_IN",
        message: "Already logged in on another device.",
    });
    return true;
}
async function issueSessionToken(res, user, rememberMe) {
    const sid = crypto_1.default.randomBytes(16).toString("hex");
    await (0, sessions_1.registerActiveSession)(user.id, sid);
    await (0, sessions_1.clearLoginAttemptAlert)(user.id);
    const hours = (0, env_1.getSessionHours)(rememberMe);
    const token = (0, jwt_1.generateToken)(user.id, user.role, user.tokenVersion, sid, hours);
    setCookieToken(res, token, rememberMe);
    return token;
}
async function finishLogin(req, res, user, rememberMe) {
    await (0, loginLockout_1.clearLoginFailures)(user.email, (0, requestMeta_1.getClientIp)(req));
    const token = await issueSessionToken(res, user, rememberMe);
    const ip = (0, requestMeta_1.getClientIp)(req);
    const ua = (0, requestMeta_1.getUserAgent)(req);
    await (0, auditLog_1.writeAuditLog)({
        action: "login_success",
        userId: user.id,
        email: user.email,
        ip,
        userAgent: ua,
        meta: { rememberMe },
    });
    await (0, accessHistory_1.recordAccessHistory)({
        userId: user.id,
        email: user.email,
        ip,
        userAgent: ua,
        event: "login",
    });
    /* CSR Check In is explicit on the dashboard — do not auto-open on login. */
    (0, securityEmail_1.sendLoginAlertEmail)({ to: user.email, name: user.name, ip, userAgent: ua });
    return res.json({
        success: true,
        requires2FA: false,
        role: user.role,
        user: userPayload(user),
        token,
    });
}
function makeOTP() {
    return crypto_1.default.randomInt(100000, 1000000).toString();
}
function parsePortalRole(raw) {
    const r = String(raw ?? "").toLowerCase();
    if (r === "admin" ||
        r === "csr" ||
        r === "manager" ||
        r === "technical_manager" ||
        r === "accounts" ||
        r === "estimator") {
        return r;
    }
    return null;
}
function portalRoleLabel(role) {
    if (role === "admin")
        return "CEO";
    if (role === "manager")
        return "Admin";
    if (role === "technical_manager")
        return "Chief Estimator";
    if (role === "accounts")
        return "Accounts";
    if (role === "estimator")
        return "Estimator";
    return "CSR";
}
function assertPortalRoleMatch(userRole, loginRole) {
    if (userRole === loginRole)
        return null;
    return `This account is registered as ${portalRoleLabel(userRole)}. Select "${portalRoleLabel(userRole)}" on the login page.`;
}
function assertAdminIp(req, role) {
    if (role !== "admin" && role !== "manager" && role !== "technical_manager")
        return null;
    const allowed = (0, env_1.getAdminAllowedIps)();
    if (allowed.length === 0)
        return null;
    const ip = (0, requestMeta_1.getClientIp)(req);
    if (!allowed.includes(ip)) {
        return "Admin access is restricted to approved networks.";
    }
    return null;
}
function parseTemporaryHours(raw) {
    if (raw === undefined || raw === null || raw === "")
        return null;
    const n = Number(raw);
    if (n === 9 || n === 10)
        return n;
    return null;
}
/* ================= REGISTER ================= */
const register = async (req, res) => {
    try {
        const { name, email, password, role, csrCode, employeeCode, fatherName, currentAddress, contactNo, cnic, cnicPdfUrl, profilePic, allowedIps, allowedMacAddress, temporaryAccessIp, temporaryAccessMac, temporaryAccessHours, } = req.body;
        if (role === "csr" && !csrCode?.trim()) {
            return res.status(400).json({ success: false, message: "CSR Code is required for CSR accounts." });
        }
        const pwdError = (0, security_1.validatePassword)(password);
        if (pwdError) {
            return res.status(400).json({ success: false, message: pwdError });
        }
        const breachError = await (0, passwordBreach_1.assertPasswordNotBreached)(password);
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
        const validRoles = ["admin", "csr", "manager", "technical_manager", "accounts", "estimator"];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ success: false, message: "Invalid role." });
        }
        const existing = await db_1.default.user.findUnique({ where: { email } });
        if (existing) {
            return res.status(400).json({ success: false, message: "User already exists" });
        }
        if (csrCode?.trim()) {
            const codeTaken = await db_1.default.user.findFirst({ where: { csrCode: csrCode.trim() } });
            if (codeTaken) {
                return res.status(400).json({ success: false, message: `CSR Code "${csrCode}" is already in use.` });
            }
        }
        if (employeeCode?.trim()) {
            const empTaken = await db_1.default.user.findFirst({ where: { employeeCode: employeeCode.trim() } });
            if (empTaken) {
                return res.status(400).json({ success: false, message: `Employee Code "${employeeCode.trim()}" is already in use.` });
            }
        }
        const hashed = await (0, hash_1.hashPassword)(password);
        const cleanedIps = (0, networkAccess_1.sanitizeIpList)(allowedIps);
        const tempHours = parseTemporaryHours(temporaryAccessHours);
        const tempAccessUntil = tempHours && (temporaryAccessIp || temporaryAccessMac)
            ? new Date(Date.now() + tempHours * 60 * 60 * 1000)
            : null;
        const userData = {
            name,
            email,
            password: hashed,
            role,
            csrCode: role === "csr" || role === "estimator" ? (csrCode?.trim() || null) : null,
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
        const user = await db_1.default.user.create({
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
        (0, cache_1.invalidateCache)("users:list", "users:list:admin", "users:list:csr", "admin:csrs");
        return res.status(201).json({ success: true, user });
    }
    catch {
        return res.status(500).json({ success: false, message: "Server error" });
    }
};
exports.register = register;
/* ================= CAPTCHA CONFIG (public) ================= */
const getCaptchaConfig = async (_req, res) => {
    return res.json({
        success: true,
        enabled: (0, env_1.isCaptchaConfigured)(),
        siteKey: process.env.TURNSTILE_SITE_KEY ?? "",
    });
};
exports.getCaptchaConfig = getCaptchaConfig;
/* ================= LOGIN — Step 1 ================= */
const login = async (req, res) => {
    try {
        const { email: rawEmail, password, rememberMe, captchaToken, loginRole: rawLoginRole } = req.body;
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
        const ip = (0, requestMeta_1.getClientIp)(req);
        const ua = (0, requestMeta_1.getUserAgent)(req);
        const block = await (0, loginLockout_1.isLoginBlocked)(email ?? "", ip);
        if (block.blocked) {
            await (0, auditLog_1.writeAuditLog)({ action: "login_blocked", email, ip, userAgent: ua });
            return res.status(429).json({ success: false, blocked: true, message: block.message });
        }
        if ((0, env_1.isCaptchaConfigured)() && await (0, loginLockout_1.requiresCaptcha)(email, ip)) {
            const ok = await (0, captcha_1.verifyCaptchaToken)(captchaToken);
            if (!ok) {
                return res.status(400).json({
                    success: false,
                    code: "CAPTCHA_REQUIRED",
                    message: "Please complete the security verification.",
                });
            }
        }
        let user = await db_1.default.user.findUnique({ where: { email } });
        if (!user) {
            user = await db_1.default.user.findFirst({
                where: { email: { equals: email, mode: "insensitive" } },
            });
        }
        if (!user) {
            await (0, loginLockout_1.recordFailedLogin)(email ?? "", ip);
            await (0, auditLog_1.writeAuditLog)({ action: "login_failed", email, ip, userAgent: ua, meta: { reason: "user_not_found" } });
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }
        if (!user.isActive) {
            return res.status(403).json({ success: false, message: "Account is deactivated" });
        }
        const roleMismatch = assertPortalRoleMatch(user.role, loginRole);
        if (roleMismatch) {
            await (0, auditLog_1.writeAuditLog)({
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
            await (0, auditLog_1.writeAuditLog)({ action: "login_blocked", userId: user.id, email: user.email, ip, userAgent: ua, meta: { reason: "ip" } });
            return res.status(403).json({ success: false, code: "IP_NOT_ALLOWED", message: ipError });
        }
        const networkError = (0, networkAccess_1.evaluateNetworkAccess)(user, req);
        if (networkError) {
            await (0, auditLog_1.writeAuditLog)({ action: "login_blocked", userId: user.id, email: user.email, ip, userAgent: ua, meta: { reason: "network_policy" } });
            return res.status(403).json({ success: false, code: "NETWORK_POLICY_DENIED", message: networkError });
        }
        const isMatch = await (0, hash_1.comparePassword)(password, user.password);
        if (!isMatch) {
            await (0, loginLockout_1.recordFailedLogin)(email, ip);
            await (0, auditLog_1.writeAuditLog)({ action: "login_failed", userId: user.id, email: user.email, ip, userAgent: ua });
            const needCaptcha = await (0, loginLockout_1.requiresCaptcha)(email, ip);
            return res.status(401).json({
                success: false,
                message: "Invalid credentials",
                captchaRequired: needCaptcha && (0, env_1.isCaptchaConfigured)(),
            });
        }
        if (user.twoFAEnabled && (0, env_1.isSmtpConfigured)()) {
            if (await blockIfAlreadyLoggedIn(user.id, req, res))
                return;
            const existing = sessions_1.otpAttempts.get(user.id);
            if (existing?.blockedUntil && Date.now() < existing.blockedUntil) {
                const mins = Math.ceil((existing.blockedUntil - Date.now()) / 60000);
                return res.status(429).json({
                    success: false,
                    blocked: true,
                    message: `Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? "s" : ""}.`,
                });
            }
            sessions_1.otpAttempts.delete(user.id);
            sessions_1.otpResendCount.delete(user.id);
            const otp = makeOTP();
            sessions_1.otpStore.set(user.id, { otp, expiresAt: Date.now() + 5 * 60 * 1000, loginRole });
            (0, securityEmail_1.sendOTPEmail)(user.email, otp);
            return res.json({
                success: true,
                requires2FA: true,
                userId: user.id,
                message: `OTP sent to ${user.email}`,
            });
        }
        if (await blockIfAlreadyLoggedIn(user.id, req, res))
            return;
        const dbUser = await db_1.default.user.findUnique({
            where: { id: user.id },
            select: { id: true, name: true, email: true, role: true, tokenVersion: true },
        });
        if (!dbUser) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        return finishLogin(req, res, dbUser, !!rememberMe);
    }
    catch (err) {
        console.error("[auth/login]", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};
exports.login = login;
/* ================= VERIFY OTP ================= */
const verifyOTP = async (req, res) => {
    try {
        const { userId, otp, rememberMe, loginRole: rawLoginRole } = req.body;
        if (!userId || !otp) {
            return res.status(400).json({ success: false, message: "userId and OTP required." });
        }
        const MAX_ATTEMPTS = 2;
        const BLOCK_DURATION = 1 * 60 * 60 * 1000;
        const attempt = sessions_1.otpAttempts.get(userId);
        if (attempt?.blockedUntil && Date.now() < attempt.blockedUntil) {
            const mins = Math.ceil((attempt.blockedUntil - Date.now()) / 60000);
            return res.status(429).json({
                success: false,
                blocked: true,
                message: `Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? "s" : ""}.`,
            });
        }
        const stored = sessions_1.otpStore.get(userId);
        if (!stored) {
            return res.status(400).json({ success: false, message: "OTP expired. Please login again." });
        }
        if (Date.now() > stored.expiresAt) {
            sessions_1.otpStore.delete(userId);
            return res.status(400).json({ success: false, message: "OTP expired. Please login again." });
        }
        if (stored.otp !== otp.toString().trim()) {
            const currentCount = attempt?.count ?? 0;
            const newCount = currentCount + 1;
            if (newCount >= MAX_ATTEMPTS) {
                sessions_1.otpAttempts.set(userId, { count: newCount, blockedUntil: Date.now() + BLOCK_DURATION });
                sessions_1.otpStore.delete(userId);
                return res.status(429).json({
                    success: false,
                    blocked: true,
                    message: "Too many failed attempts. Try again after 1 hour.",
                });
            }
            sessions_1.otpAttempts.set(userId, { count: newCount });
            const left = MAX_ATTEMPTS - newCount;
            return res.status(401).json({
                success: false,
                blocked: false,
                attempts: newCount,
                message: `Incorrect OTP. ${left} attempt${left !== 1 ? "s" : ""} remaining.`,
            });
        }
        sessions_1.otpStore.delete(userId);
        sessions_1.otpAttempts.delete(userId);
        sessions_1.otpResendCount.delete(userId);
        if (await blockIfAlreadyLoggedIn(userId, req, res))
            return;
        const user = await db_1.default.user.findUnique({
            where: { id: userId },
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
        const networkError = (0, networkAccess_1.evaluateNetworkAccess)(user, req);
        if (networkError) {
            return res.status(403).json({ success: false, code: "NETWORK_POLICY_DENIED", message: networkError });
        }
        return finishLogin(req, res, user, !!rememberMe);
    }
    catch {
        return res.status(500).json({ success: false, message: "OTP verification failed." });
    }
};
exports.verifyOTP = verifyOTP;
/* ================= RESEND OTP ================= */
const resendOTP = async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, message: "userId required." });
        }
        const user = await db_1.default.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }
        const attempt = sessions_1.otpAttempts.get(userId);
        if (attempt?.blockedUntil && Date.now() < attempt.blockedUntil) {
            const mins = Math.ceil((attempt.blockedUntil - Date.now()) / 60000);
            return res.status(429).json({
                success: false,
                blocked: true,
                message: `Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? "s" : ""}.`,
            });
        }
        const currentResends = sessions_1.otpResendCount.get(userId) ?? 0;
        if (currentResends >= 1) {
            return res.status(429).json({
                success: false,
                blocked: true,
                message: "OTP resend limit reached. Please go back and login again.",
            });
        }
        sessions_1.otpResendCount.set(userId, currentResends + 1);
        const otp = makeOTP();
        sessions_1.otpStore.set(userId, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
        (0, securityEmail_1.sendOTPEmail)(user.email, otp);
        return res.json({ success: true, message: `OTP resent to ${user.email}` });
    }
    catch {
        return res.status(500).json({ success: false, message: "Resend failed." });
    }
};
exports.resendOTP = resendOTP;
/* ================= LOGOUT ================= */
const logout = async (req, res) => {
    const ip = (0, requestMeta_1.getClientIp)(req);
    const ua = (0, requestMeta_1.getUserAgent)(req);
    try {
        const token = req.cookies?.token ??
            req.headers.authorization?.replace("Bearer ", "");
        if (token) {
            let userId;
            try {
                const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
                userId = decoded.id;
            }
            catch {
                const decoded = jsonwebtoken_1.default.decode(token);
                userId = decoded?.id;
            }
            if (userId) {
                await (0, sessions_1.clearActiveSession)(userId);
                await (0, auditLog_1.writeAuditLog)({ action: "logout", userId, ip, userAgent: ua });
                await (0, accessHistory_1.recordAccessHistory)({ userId, ip, userAgent: ua, event: "logout" });
                /* Work session stays open — only Check Out / stale timeout ends the shift */
            }
        }
    }
    catch { /* ignore */ }
    res.clearCookie("token");
    return res.json({ success: true, message: "Logged out" });
};
exports.logout = logout;
/* ================= LOGOUT ALL DEVICES ================= */
const logoutAllDevices = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        if (req.user.role === "csr") {
            return res.status(403).json({ success: false, message: "Logout all devices is not available for CSR accounts." });
        }
        await db_1.default.user.update({
            where: { id: req.user.id },
            data: { tokenVersion: { increment: 1 } },
        });
        await (0, sessions_1.clearActiveSession)(req.user.id);
        const ip = (0, requestMeta_1.getClientIp)(req);
        const ua = (0, requestMeta_1.getUserAgent)(req);
        await (0, auditLog_1.writeAuditLog)({
            action: "logout_all",
            userId: req.user.id,
            ip,
            userAgent: ua,
        });
        await (0, accessHistory_1.recordAccessHistory)({
            userId: req.user.id,
            ip,
            userAgent: ua,
            event: "logout_all",
        });
        res.clearCookie("token");
        (0, cache_1.invalidateCache)(`auth:me:${req.user.id}`);
        return res.json({
            success: true,
            message: "Logged out from all devices. Please sign in again.",
            requiresReLogin: true,
        });
    }
    catch {
        return res.status(500).json({ success: false, message: "Failed to logout all devices." });
    }
};
exports.logoutAllDevices = logoutAllDevices;
/* ================= GET ME ================= */
const getMe = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        const cacheKey = `auth:me:${req.user.id}`;
        const cached = (0, cache_1.getCache)(cacheKey);
        if (cached)
            return res.json(cached);
        const user = await db_1.default.user.findUnique({
            where: { id: req.user.id },
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
        (0, cache_1.setCache)(cacheKey, payload, 30000);
        return res.json(payload);
    }
    catch {
        return res.status(500).json({ success: false, message: "Server error" });
    }
};
exports.getMe = getMe;
/* ================= UPDATE PROFILE ================= */
const updateProfile = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        const { name, email, profilePic, cnic } = req.body;
        if (!name || !email) {
            return res.status(400).json({ success: false, message: "Name and email required." });
        }
        const taken = await db_1.default.user.findFirst({ where: { email, NOT: { id: req.user.id } } });
        if (taken) {
            return res.status(400).json({ success: false, message: "Email already in use." });
        }
        const data = {
            name,
            email,
        };
        if (profilePic !== undefined)
            data.profilePic = profilePic || null;
        if (cnic !== undefined && req.user.role === "admin")
            data.cnic = cnic || null;
        const updated = await db_1.default.user.update({
            where: { id: req.user.id },
            data,
            select: {
                id: true, name: true, email: true, role: true,
                csrCode: true, cnic: true, profilePic: true,
                twoFAEnabled: true, createdAt: true,
            },
        });
        (0, cache_1.invalidateCache)(`auth:me:${req.user.id}`, "users:list", "users:list:admin", "users:list:csr", "users:list:manager");
        return res.json({ success: true, user: updated });
    }
    catch {
        return res.status(500).json({ success: false, message: "Failed to update profile." });
    }
};
exports.updateProfile = updateProfile;
/* ================= CHANGE PASSWORD ================= */
const changePassword = async (req, res) => {
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
        const pwdError = (0, security_1.validatePassword)(newPassword);
        if (pwdError) {
            return res.status(400).json({ success: false, message: pwdError });
        }
        const breachError = await (0, passwordBreach_1.assertPasswordNotBreached)(newPassword);
        if (breachError) {
            return res.status(400).json({ success: false, message: breachError });
        }
        const user = await db_1.default.user.findUnique({ where: { id: req.user.id } });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        const isMatch = await (0, hash_1.comparePassword)(currentPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Current password is incorrect." });
        }
        const hashed = await (0, hash_1.hashPassword)(newPassword);
        await db_1.default.user.update({
            where: { id: req.user.id },
            data: { password: hashed, tokenVersion: { increment: 1 } },
        });
        await (0, sessions_1.clearActiveSession)(req.user.id);
        await (0, auditLog_1.writeAuditLog)({
            action: "password_change",
            userId: req.user.id,
            email: user.email,
            ip: (0, requestMeta_1.getClientIp)(req),
            userAgent: (0, requestMeta_1.getUserAgent)(req),
        });
        res.clearCookie("token");
        return res.json({
            success: true,
            message: "Password changed successfully. Please log in again.",
            requiresReLogin: true,
        });
    }
    catch {
        return res.status(500).json({ success: false, message: "Failed to change password." });
    }
};
exports.changePassword = changePassword;
/* ================= ACK LOGIN-ATTEMPT ALERT ================= */
const ackSessionAlert = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        await (0, sessions_1.clearLoginAttemptAlert)(req.user.id);
        return res.json({ success: true });
    }
    catch {
        return res.status(500).json({ success: false, message: "Failed to acknowledge alert" });
    }
};
exports.ackSessionAlert = ackSessionAlert;
/* ================= SESSION STATUS ================= */
const getSessionStatus = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        const alert = await (0, sessions_1.getLoginAttemptAlert)(req.user.id);
        const loginAttemptPending = !!alert;
        return res.json({
            success: true,
            loginAttemptPending,
            attemptId: alert?.attemptId ?? 0,
            message: loginAttemptPending
                ? "Someone is trying to login to your account from another device."
                : undefined,
        });
    }
    catch {
        return res.status(500).json({ success: false, message: "Session check failed." });
    }
};
exports.getSessionStatus = getSessionStatus;
/* ================= SECURITY AUDIT LOGS (admin) ================= */
const getAuditLogs = async (req, res) => {
    try {
        if (!req.user?.id || req.user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Admin only." });
        }
        const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
        const fromDate = typeof req.query.fromDate === "string" ? req.query.fromDate : undefined;
        const toDate = typeof req.query.toDate === "string" ? req.query.toDate : undefined;
        const logs = await (0, auditLog_1.fetchRecentAuditLogs)(limit, fromDate, toDate);
        return res.json({ success: true, logs });
    }
    catch {
        return res.status(500).json({ success: false, message: "Failed to fetch audit logs." });
    }
};
exports.getAuditLogs = getAuditLogs;
/* ================= TOGGLE 2FA (admin + CSR) ================= */
const toggle2FA = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        const { enabled } = req.body;
        await db_1.default.user.update({
            where: { id: req.user.id },
            data: { twoFAEnabled: !!enabled },
        });
        await (0, auditLog_1.writeAuditLog)({
            action: enabled ? "2fa_enabled" : "2fa_disabled",
            userId: req.user.id,
            ip: (0, requestMeta_1.getClientIp)(req),
            userAgent: (0, requestMeta_1.getUserAgent)(req),
        });
        (0, cache_1.invalidateCache)(`auth:me:${req.user.id}`);
        return res.json({ success: true, twoFAEnabled: !!enabled });
    }
    catch {
        return res.status(500).json({ success: false, message: "Failed to toggle 2FA." });
    }
};
exports.toggle2FA = toggle2FA;
