"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordAccessHistory = recordAccessHistory;
exports.recordHeartbeatAccess = recordHeartbeatAccess;
const db_1 = __importDefault(require("../config/db"));
const sessions_1 = require("./sessions");
const lastHeartbeat = new Map();
const HEARTBEAT_LOG_MS = 15 * 60 * 1000;
async function recordAccessHistory(opts) {
    try {
        const ua = opts.userAgent ?? "";
        await db_1.default.accessHistory.create({
            data: {
                userId: opts.userId,
                email: opts.email ?? null,
                ip: opts.ip ?? null,
                userAgent: ua ? ua.slice(0, 512) : null,
                deviceId: opts.deviceId ?? null,
                browser: opts.browser ?? (ua ? (0, sessions_1.detectBrowser)(ua) : null),
                event: opts.event,
            },
        });
    }
    catch {
        /* non-blocking */
    }
}
/** Throttle heartbeat rows so admin history stays readable. */
async function recordHeartbeatAccess(opts) {
    const key = `${opts.userId}:${opts.deviceId ?? "unknown"}`;
    const now = Date.now();
    const prev = lastHeartbeat.get(key) ?? 0;
    if (now - prev < HEARTBEAT_LOG_MS)
        return;
    lastHeartbeat.set(key, now);
    await recordAccessHistory({ ...opts, event: "heartbeat" });
}
