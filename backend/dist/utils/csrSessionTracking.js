"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openCsrWorkSession = openCsrWorkSession;
exports.checkInCsrWorkSession = checkInCsrWorkSession;
exports.checkOutCsrWorkSession = checkOutCsrWorkSession;
exports.getCsrWorkSessionStatus = getCsrWorkSessionStatus;
exports.pauseCsrWorkSession = pauseCsrWorkSession;
exports.resumeCsrWorkSession = resumeCsrWorkSession;
exports.tickCsrWorkSession = tickCsrWorkSession;
exports.closeCsrWorkSession = closeCsrWorkSession;
exports.buildCsrSessionReport = buildCsrSessionReport;
exports.adminAdjustCsrWorkSession = adminAdjustCsrWorkSession;
const db_1 = __importDefault(require("../config/db"));
const sessions_1 = require("./sessions");
const estTime_1 = require("./estTime");
const MAX_TICK_MS = 5 * 60 * 1000;
/**
 * Reports: gaps longer than this (lock / sleep / no heartbeat) count as away.
 * Matches Users-page presence threshold but does not close the work session.
 */
const SILENCE_MS = 90000;
/** Open sessions older than this are auto-closed (forgotten check-outs / zombies). */
const MAX_OPEN_SESSION_MS = 16 * 60 * 60 * 1000;
function openSessionWhere(userId) {
    /* MongoDB: null filter alone can miss docs where logoutAt was never set. */
    return {
        userId,
        OR: [
            { logoutAt: null },
            { logoutAt: { isSet: false } },
        ],
    };
}
async function findAllOpenSessions(userId) {
    return db_1.default.csrWorkSession.findMany({
        where: openSessionWhere(userId),
        orderBy: { loginAt: "desc" },
    });
}
function sessionAgeMs(loginAt, now = new Date()) {
    return Math.max(0, now.getTime() - new Date(loginAt).getTime());
}
function isStaleOpenSession(loginAt, now = new Date()) {
    return sessionAgeMs(loginAt, now) > MAX_OPEN_SESSION_MS;
}
async function finalizeOpenSession(session, reason, now = new Date()) {
    try {
        await applyHeartbeatTick(session, session.lastVisible, now);
    }
    catch {
        /* still close even if tick fails */
    }
    /* Flush any open pause into pausedMs before closing */
    let pausedMs = session.pausedMs ?? 0;
    if (session.pausedAt) {
        pausedMs += Math.max(0, now.getTime() - new Date(session.pausedAt).getTime());
    }
    await db_1.default.csrWorkSession.update({
        where: { id: session.id },
        data: {
            logoutAt: now,
            closedReason: reason,
            pausedAt: null,
            pausedMs,
        },
    });
}
/**
 * Keep at most one open session: drop stale (>16h) and close older duplicates.
 * Returns the single active session, or null if none / all closed.
 */
async function reconcileOpenSessions(userId) {
    const sessions = await findAllOpenSessions(userId);
    if (sessions.length === 0)
        return null;
    const now = new Date();
    const [newest, ...older] = sessions;
    for (const session of older) {
        await finalizeOpenSession(session, "session_replaced", newest.loginAt);
    }
    if (isStaleOpenSession(newest.loginAt, now)) {
        await finalizeOpenSession(newest, "stale_timeout", now);
        return null;
    }
    return newest;
}
async function applyHeartbeatTick(session, tabVisible, now = new Date()) {
    const prevAt = session.lastHeartbeatAt ?? session.loginAt;
    const rawDelta = Math.max(0, now.getTime() - new Date(prevAt).getTime());
    const wallMs = sessionAgeMs(session.loginAt, now);
    let dashboardMs = session.dashboardMs;
    let awayMs = session.awayMs;
    let pausedMs = session.pausedMs ?? 0;
    const isPaused = !!session.pausedAt;
    if (isPaused) {
        /* Explicit pause — don't count as dashboard work; accumulate pausedMs */
        const deltaMs = Math.min(MAX_TICK_MS, rawDelta > SILENCE_MS ? rawDelta : rawDelta);
        pausedMs += deltaMs;
    }
    else if (rawDelta > SILENCE_MS) {
        // Lock / sleep / no network — count gap as away, but never past wall-clock.
        const room = Math.max(0, wallMs - (dashboardMs + awayMs + pausedMs));
        awayMs += Math.min(rawDelta, room);
    }
    else {
        const deltaMs = Math.min(MAX_TICK_MS, rawDelta);
        dashboardMs += session.lastVisible ? deltaMs : 0;
        awayMs += !session.lastVisible ? deltaMs : 0;
    }
    /* Clamp so stored counters never exceed elapsed wall time */
    const sum = dashboardMs + awayMs + pausedMs;
    if (sum > wallMs && sum > 0) {
        const scale = wallMs / sum;
        dashboardMs = Math.round(dashboardMs * scale);
        awayMs = Math.round(awayMs * scale);
        pausedMs = Math.max(0, wallMs - dashboardMs - awayMs);
    }
    return db_1.default.csrWorkSession.update({
        where: { id: session.id },
        data: {
            dashboardMs,
            awayMs,
            pausedMs,
            lastHeartbeatAt: now,
            lastVisible: tabVisible,
        },
    });
}
async function openCsrWorkSession(opts) {
    try {
        await closeCsrWorkSession(opts.userId, "session_replaced");
        const ua = opts.userAgent ?? "";
        await db_1.default.csrWorkSession.create({
            data: {
                userId: opts.userId,
                loginAt: new Date(),
                logoutAt: null,
                lastHeartbeatAt: new Date(),
                lastVisible: true,
                ip: opts.ip ?? null,
                browser: ua ? (0, sessions_1.detectBrowser)(ua) : null,
                deviceId: opts.deviceId ?? null,
            },
        });
    }
    catch (err) {
        console.log("[csr-session] open failed:", err);
    }
}
/** Explicit CSR Check In — resumes a fresh same-day session; replaces stale/duplicates. */
async function checkInCsrWorkSession(opts) {
    const existing = await reconcileOpenSessions(opts.userId);
    if (existing) {
        return { created: false, sessionId: existing.id, loginAt: existing.loginAt };
    }
    const ua = opts.userAgent ?? "";
    const created = await db_1.default.csrWorkSession.create({
        data: {
            userId: opts.userId,
            loginAt: new Date(),
            logoutAt: null,
            lastHeartbeatAt: new Date(),
            lastVisible: true,
            ip: opts.ip ?? null,
            browser: ua ? (0, sessions_1.detectBrowser)(ua) : null,
            deviceId: opts.deviceId ?? null,
        },
    });
    return { created: true, sessionId: created.id, loginAt: created.loginAt };
}
async function checkOutCsrWorkSession(userId) {
    const closed = await closeCsrWorkSession(userId, "check_out");
    return closed > 0;
}
async function getCsrWorkSessionStatus(userId) {
    const session = await reconcileOpenSessions(userId);
    if (!session) {
        return {
            checkedIn: false,
            paused: false,
            session: null,
        };
    }
    const { dashboardMs, awayMs, pausedMs, totalMs } = liveTotals(session);
    const paused = !!session.pausedAt;
    return {
        checkedIn: true,
        paused,
        session: {
            id: session.id,
            checkInAt: session.loginAt.toISOString(),
            checkInAtEst: (0, estTime_1.formatEstDateTime)(session.loginAt),
            paused,
            pausedAt: session.pausedAt ? session.pausedAt.toISOString() : null,
            dashboardMs,
            awayMs,
            pausedMs,
            totalMs,
            dashboardDuration: (0, estTime_1.formatDurationMs)(dashboardMs),
            awayDuration: (0, estTime_1.formatDurationMs)(awayMs),
            pausedDuration: (0, estTime_1.formatDurationMs)(pausedMs),
            totalDuration: (0, estTime_1.formatDurationMs)(totalMs),
        },
    };
}
/** CSR left dashboard (e.g. WhatsApp) — pause work clock without checking out. */
async function pauseCsrWorkSession(userId) {
    const session = await reconcileOpenSessions(userId);
    if (!session)
        return false;
    if (session.pausedAt)
        return true;
    const now = new Date();
    await applyHeartbeatTick(session, session.lastVisible, now);
    await db_1.default.csrWorkSession.update({
        where: { id: session.id },
        data: { pausedAt: now, lastHeartbeatAt: now },
    });
    return true;
}
/** CSR back on dashboard — resume work clock. */
async function resumeCsrWorkSession(userId) {
    const session = await reconcileOpenSessions(userId);
    if (!session)
        return false;
    if (!session.pausedAt)
        return true;
    const now = new Date();
    const extra = Math.max(0, now.getTime() - new Date(session.pausedAt).getTime());
    await db_1.default.csrWorkSession.update({
        where: { id: session.id },
        data: {
            pausedAt: null,
            pausedMs: (session.pausedMs ?? 0) + extra,
            lastHeartbeatAt: now,
            lastVisible: true,
        },
    });
    return true;
}
async function tickCsrWorkSession(opts) {
    try {
        const session = await reconcileOpenSessions(opts.userId);
        if (!session)
            return;
        await applyHeartbeatTick(session, opts.tabVisible);
        if (opts.deviceId && opts.deviceId !== session.deviceId) {
            await db_1.default.csrWorkSession.update({
                where: { id: session.id },
                data: { deviceId: opts.deviceId },
            });
        }
    }
    catch (err) {
        console.log("[csr-session] tick failed:", err);
    }
}
/** Close every open work session for this CSR (handles zombie duplicates). */
async function closeCsrWorkSession(userId, reason) {
    try {
        const sessions = await findAllOpenSessions(userId);
        if (sessions.length === 0)
            return 0;
        const now = new Date();
        for (const session of sessions) {
            await finalizeOpenSession(session, reason, now);
        }
        return sessions.length;
    }
    catch (err) {
        console.log("[csr-session] close failed:", err);
        return 0;
    }
}
function closedReasonLabel(reason, hasLogout) {
    if (!hasLogout)
        return "Still checked in";
    switch ((reason ?? "").toLowerCase()) {
        case "stale_timeout": return "Auto (stale)";
        case "check_out": return "Check Out";
        case "logout": return "Logout";
        case "session_replaced": return "New check-in";
        case "logout_all": return "Logout all";
        case "admin_adjusted": return "Admin adjusted";
        default: return reason ? reason.replace(/_/g, " ") : "Closed";
    }
}
function liveTotals(session) {
    const now = new Date();
    let dashboardMs = session.dashboardMs;
    let awayMs = session.awayMs;
    let pausedMs = session.pausedMs ?? 0;
    const endAt = session.logoutAt ?? now;
    const totalMs = Math.max(0, endAt.getTime() - new Date(session.loginAt).getTime());
    if (!session.logoutAt) {
        if (session.pausedAt) {
            pausedMs += Math.max(0, now.getTime() - new Date(session.pausedAt).getTime());
        }
        else {
            const prevAt = session.lastHeartbeatAt ?? session.loginAt;
            const rawDelta = Math.max(0, now.getTime() - new Date(prevAt).getTime());
            if (rawDelta > SILENCE_MS) {
                const room = Math.max(0, totalMs - (dashboardMs + awayMs + pausedMs));
                awayMs += Math.min(rawDelta, room);
            }
            else {
                const deltaMs = Math.min(MAX_TICK_MS, rawDelta);
                if (session.lastVisible)
                    dashboardMs += deltaMs;
                else
                    awayMs += deltaMs;
            }
        }
    }
    const sum = dashboardMs + awayMs + pausedMs;
    if (sum > totalMs && sum > 0) {
        const scale = totalMs / sum;
        dashboardMs = Math.round(dashboardMs * scale);
        awayMs = Math.round(awayMs * scale);
        pausedMs = Math.max(0, totalMs - dashboardMs - awayMs);
    }
    return { dashboardMs, awayMs, pausedMs, totalMs };
}
/** One row per person per calendar day: first check-in, last check-out or still in, times summed. */
function mergeSessionsByCalendarDay(sessions, timeZone) {
    const map = new Map();
    const ordered = [...sessions].sort((a, b) => a.loginAt.localeCompare(b.loginAt));
    for (const s of ordered) {
        const day = (0, estTime_1.estDateYmd)(new Date(s.loginAt), timeZone);
        const key = `${s.csrId}:${day}`;
        const hit = map.get(key);
        if (!hit) {
            map.set(key, { ...s, sessionCount: s.sessionCount || 1, memberIds: s.memberIds?.length ? [...s.memberIds] : [s.id] });
            continue;
        }
        hit.sessionCount += s.sessionCount || 1;
        hit.memberIds = [...new Set([...(hit.memberIds ?? [hit.id]), ...(s.memberIds?.length ? s.memberIds : [s.id])])];
        hit.dashboardMs += s.dashboardMs;
        hit.awayMs += s.awayMs;
        hit.totalMs += s.totalMs;
        hit.dashboardDuration = (0, estTime_1.formatDurationMs)(hit.dashboardMs);
        hit.awayDuration = (0, estTime_1.formatDurationMs)(hit.awayMs);
        hit.totalDuration = (0, estTime_1.formatDurationMs)(hit.totalMs);
        if (s.status === "active") {
            hit.status = "active";
            hit.logoutAt = null;
            hit.logoutAtEst = "Still checked in";
            hit.checkOutAtEst = "Still checked in";
            hit.closedReason = null;
            hit.closedReasonLabel = "Still checked in";
            hit.id = s.id;
        }
        else if (hit.status !== "active") {
            if (s.logoutAt && (!hit.logoutAt || s.logoutAt > hit.logoutAt)) {
                hit.logoutAt = s.logoutAt;
                hit.logoutAtEst = s.logoutAtEst;
                hit.checkOutAtEst = s.checkOutAtEst;
                hit.closedReason = s.closedReason;
                hit.closedReasonLabel = s.closedReasonLabel;
                hit.id = s.id;
            }
        }
    }
    return [...map.values()].sort((a, b) => {
        const t = b.loginAt.localeCompare(a.loginAt);
        if (t)
            return t;
        return a.csrName.localeCompare(b.csrName);
    });
}
async function buildCsrSessionReport(opts) {
    const staffRole = opts.role === "estimator" ? "estimator" : "csr";
    const tz = opts.timeZone;
    /* Clean zombies before reporting so Totals / Still checked-in stay accurate */
    try {
        const openWhere = {
            ...(opts.csrId ? { userId: opts.csrId } : {}),
            OR: [{ logoutAt: null }, { logoutAt: { isSet: false } }],
            user: { is: { role: staffRole } },
        };
        const openRows = await db_1.default.csrWorkSession.findMany({
            where: openWhere,
            orderBy: { loginAt: "desc" },
            take: 2000,
        });
        const now = new Date();
        const newestLogin = new Map();
        for (const row of openRows) {
            const kept = newestLogin.get(row.userId);
            if (kept) {
                await finalizeOpenSession(row, "session_replaced", kept);
                continue;
            }
            if (isStaleOpenSession(row.loginAt, now)) {
                await finalizeOpenSession(row, "stale_timeout", now);
                continue;
            }
            newestLogin.set(row.userId, row.loginAt);
        }
    }
    catch (err) {
        console.log("[csr-session] report cleanup failed:", err);
    }
    const range = {};
    if (opts.from)
        range.gte = opts.from;
    if (opts.to)
        range.lte = opts.to;
    const where = {
        ...(opts.csrId ? { userId: opts.csrId } : {}),
        ...(range.gte || range.lte ? { loginAt: range } : {}),
        user: { is: { role: staffRole } },
    };
    const rows = await db_1.default.csrWorkSession.findMany({
        where,
        include: {
            user: { select: { id: true, name: true, csrCode: true } },
        },
        orderBy: { loginAt: "desc" },
        take: 5000,
    });
    const sessions = rows.map(row => {
        const { dashboardMs, awayMs, totalMs } = liveTotals(row);
        const logoutAtEst = row.logoutAt ? (0, estTime_1.formatEstDateTime)(row.logoutAt, tz) : "Still checked in";
        return {
            id: row.id,
            csrId: row.user.id,
            csrName: row.user.name,
            csrCode: row.user.csrCode,
            loginAt: row.loginAt.toISOString(),
            loginAtEst: (0, estTime_1.formatEstDateTime)(row.loginAt, tz),
            logoutAt: row.logoutAt?.toISOString() ?? null,
            logoutAtEst,
            checkInAtEst: (0, estTime_1.formatEstDateTime)(row.loginAt, tz),
            checkOutAtEst: logoutAtEst,
            dashboardDuration: (0, estTime_1.formatDurationMs)(dashboardMs),
            awayDuration: (0, estTime_1.formatDurationMs)(awayMs),
            totalDuration: (0, estTime_1.formatDurationMs)(totalMs),
            dashboardMs,
            awayMs,
            totalMs,
            status: row.logoutAt ? "closed" : "active",
            browser: row.browser,
            ip: row.ip,
            closedReason: row.closedReason,
            closedReasonLabel: closedReasonLabel(row.closedReason, !!row.logoutAt),
            sessionCount: 1,
            memberIds: [row.id],
        };
    });
    const merged = mergeSessionsByCalendarDay(sessions, tz);
    const summary = merged.map(s => ({
        csrId: s.csrId,
        csrName: s.csrName,
        csrCode: s.csrCode,
        sessions: s.sessionCount,
        dashboardMs: s.dashboardMs,
        awayMs: s.awayMs,
        totalMs: s.totalMs,
        dashboardDuration: s.dashboardDuration,
        awayDuration: s.awayDuration,
        totalDuration: s.totalDuration,
        firstLoginAt: s.loginAt,
        lastLogoutAt: s.logoutAt,
        stillOpen: s.status === "active",
        day: (0, estTime_1.estDateYmd)(new Date(s.loginAt), tz),
    })).sort((a, b) => {
        const name = a.csrName.localeCompare(b.csrName);
        if (name)
            return name;
        return b.firstLoginAt.localeCompare(a.firstLoginAt);
    });
    return {
        sessions: merged,
        summary,
    };
}
/** Admin override of check-in / check-out times. */
async function adminAdjustCsrWorkSession(opts) {
    const ids = [...new Set((opts.memberIds?.length ? opts.memberIds : [opts.sessionId]).filter(Boolean))];
    const rows = await db_1.default.csrWorkSession.findMany({
        where: { id: { in: ids } },
        include: { user: { select: { id: true, name: true, role: true } } },
    });
    if (!rows.length) {
        return { ok: false, message: "Session not found." };
    }
    const user = rows[0].user;
    if (user.role !== "csr" && user.role !== "estimator") {
        return { ok: false, message: "Session not found." };
    }
    if (rows.some(r => r.userId !== user.id)) {
        return { ok: false, message: "Session not found." };
    }
    const ordered = [...rows].sort((a, b) => a.loginAt.getTime() - b.loginAt.getTime());
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const checkInAt = opts.checkInAt;
    const checkOutAt = opts.clearCheckOut ? null : (opts.checkOutAt ?? last.logoutAt);
    if (checkOutAt && checkOutAt.getTime() < checkInAt.getTime()) {
        return { ok: false, message: "Check-out must be after check-in." };
    }
    const note = opts.note?.trim() || "admin_adjusted";
    const scaleTimes = (session, loginAt, logoutAt) => {
        const endAt = logoutAt ?? new Date();
        const totalMs = Math.max(0, endAt.getTime() - loginAt.getTime());
        const prevTotal = Math.max(1, session.dashboardMs + session.awayMs);
        if (opts.dashboardMs !== undefined || opts.awayMs !== undefined) {
            return {
                dashboardMs: Math.max(0, opts.dashboardMs ?? session.dashboardMs),
                awayMs: Math.max(0, opts.awayMs ?? session.awayMs),
            };
        }
        if (session.dashboardMs + session.awayMs > 0 && totalMs > 0) {
            const ratio = session.dashboardMs / prevTotal;
            const dashboardMs = Math.round(totalMs * ratio);
            return { dashboardMs, awayMs: Math.max(0, totalMs - dashboardMs) };
        }
        return { dashboardMs: totalMs, awayMs: 0 };
    };
    if (first.id === last.id) {
        const scaled = scaleTimes(first, checkInAt, checkOutAt);
        const updated = await db_1.default.csrWorkSession.update({
            where: { id: first.id },
            data: {
                loginAt: checkInAt,
                logoutAt: checkOutAt,
                dashboardMs: scaled.dashboardMs,
                awayMs: scaled.awayMs,
                lastHeartbeatAt: checkOutAt ?? new Date(),
                lastVisible: true,
                closedReason: checkOutAt ? note : null,
            },
        });
        return { ok: true, session: updated, csrName: user.name };
    }
    const firstScaled = scaleTimes(first, checkInAt, first.logoutAt);
    await db_1.default.csrWorkSession.update({
        where: { id: first.id },
        data: {
            loginAt: checkInAt,
            dashboardMs: firstScaled.dashboardMs,
            awayMs: firstScaled.awayMs,
            closedReason: first.logoutAt ? (first.closedReason || note) : first.closedReason,
        },
    });
    const lastScaled = scaleTimes(last, last.loginAt, checkOutAt);
    const updated = await db_1.default.csrWorkSession.update({
        where: { id: last.id },
        data: {
            logoutAt: checkOutAt,
            dashboardMs: lastScaled.dashboardMs,
            awayMs: lastScaled.awayMs,
            lastHeartbeatAt: checkOutAt ?? new Date(),
            lastVisible: true,
            closedReason: checkOutAt ? note : null,
        },
    });
    return {
        ok: true,
        session: updated,
        csrName: user.name,
    };
}
