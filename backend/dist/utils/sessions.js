"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userBrowserMap = exports.otpResendCount = exports.otpAttempts = exports.otpStore = void 0;
exports.hasActiveSession = hasActiveSession;
exports.registerActiveSession = registerActiveSession;
exports.touchActiveSession = touchActiveSession;
exports.clearActiveSession = clearActiveSession;
exports.recordLoginAttempt = recordLoginAttempt;
exports.getLoginAttemptAlert = getLoginAttemptAlert;
exports.clearLoginAttemptAlert = clearLoginAttemptAlert;
exports.detectBrowser = detectBrowser;
const db_1 = __importDefault(require("../config/db"));
const lastSessionTouch = new Map();
const SESSION_TOUCH_INTERVAL_MS = 60000;
/* OTP store: userId → { otp, expiresAt } */
exports.otpStore = new Map();
/* OTP wrong attempts: userId → { count, blockedUntil? } */
exports.otpAttempts = new Map();
/* OTP resend count: userId → number (max 1 resend) */
exports.otpResendCount = new Map();
/* Browser/Tab info: userId → { browser, tabId, openedAt, tabVisible, hiddenAt } */
exports.userBrowserMap = new Map();
let loginAttemptSeq = 0;
async function hasActiveSession(userId) {
    const user = await db_1.default.user.findUnique({
        where: { id: userId },
        select: { activeSessionId: true, lastActive: true },
    });
    if (!user?.activeSessionId)
        return false;
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
async function registerActiveSession(userId, sid) {
    await db_1.default.user.update({
        where: { id: userId },
        data: { activeSessionId: sid, lastActive: new Date(), lastLoginAt: new Date() },
    });
}
async function touchActiveSession(userId) {
    const now = Date.now();
    const last = lastSessionTouch.get(userId) ?? 0;
    if (now - last < SESSION_TOUCH_INTERVAL_MS)
        return;
    lastSessionTouch.set(userId, now);
    await db_1.default.user.update({
        where: { id: userId },
        data: { lastActive: new Date() },
    }).catch(() => { });
}
async function clearActiveSession(userId) {
    await db_1.default.user.update({
        where: { id: userId },
        data: { activeSessionId: null },
    }).catch(() => { });
}
async function recordLoginAttempt(userId) {
    loginAttemptSeq += 1;
    await db_1.default.loginAttemptAlert.upsert({
        where: { userId },
        create: { userId, attemptId: loginAttemptSeq },
        update: { attemptId: loginAttemptSeq, createdAt: new Date() },
    });
    return loginAttemptSeq;
}
async function getLoginAttemptAlert(userId) {
    const row = await db_1.default.loginAttemptAlert.findUnique({ where: { userId } });
    if (!row)
        return null;
    return { attemptId: row.attemptId, at: row.createdAt.getTime() };
}
async function clearLoginAttemptAlert(userId) {
    await db_1.default.loginAttemptAlert.deleteMany({ where: { userId } });
}
function detectBrowser(ua) {
    if (!ua)
        return "Unknown";
    if (ua.includes("Edg/"))
        return "Edge";
    if (ua.includes("OPR/") || ua.includes("Opera/"))
        return "Opera";
    if (ua.includes("Chrome/"))
        return "Chrome";
    if (ua.includes("Firefox/"))
        return "Firefox";
    if (ua.includes("Safari/") && !ua.includes("Chrome/"))
        return "Safari";
    return "Browser";
}
