"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLoginBlocked = isLoginBlocked;
exports.requiresCaptcha = requiresCaptcha;
exports.recordFailedLogin = recordFailedLogin;
exports.clearLoginFailures = clearLoginFailures;
const db_1 = __importDefault(require("../config/db"));
const MAX_FAILS = 8;
const BLOCK_MS = 30 * 60 * 1000;
const CAPTCHA_AFTER = 3;
function keysFor(email, ip) {
    return [`email:${email.toLowerCase()}`, `ip:${ip}`];
}
async function isLoginBlocked(email, ip) {
    try {
        const now = new Date();
        const rows = await db_1.default.loginLockout.findMany({
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
    }
    catch (err) {
        console.error("[loginLockout] isLoginBlocked:", err);
        return { blocked: false };
    }
}
async function requiresCaptcha(email, ip) {
    try {
        const rows = await db_1.default.loginLockout.findMany({
            where: { key: { in: keysFor(email, ip) } },
        });
        return rows.some((r) => r.failCount >= CAPTCHA_AFTER);
    }
    catch (err) {
        console.error("[loginLockout] requiresCaptcha:", err);
        return false;
    }
}
async function recordFailedLogin(email, ip) {
    try {
        const now = new Date();
        for (const key of keysFor(email, ip)) {
            const existing = await db_1.default.loginLockout.findUnique({ where: { key } });
            const failCount = (existing?.failCount ?? 0) + 1;
            const blockedUntil = failCount >= MAX_FAILS ? new Date(now.getTime() + BLOCK_MS) : existing?.blockedUntil ?? null;
            await db_1.default.loginLockout.upsert({
                where: { key },
                create: { key, failCount, blockedUntil },
                update: { failCount, blockedUntil },
            });
        }
    }
    catch (err) {
        console.error("[loginLockout] recordFailedLogin:", err);
    }
}
async function clearLoginFailures(email, ip) {
    try {
        await db_1.default.loginLockout.deleteMany({
            where: { key: { in: keysFor(email, ip) } },
        });
    }
    catch (err) {
        console.error("[loginLockout] clearLoginFailures:", err);
    }
}
