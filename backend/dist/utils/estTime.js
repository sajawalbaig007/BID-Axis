"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN_SESSION_TZ_LABEL = exports.ADMIN_SESSION_TIMEZONE = exports.CSR_REPORT_TIMEZONE = void 0;
exports.formatEstDateTime = formatEstDateTime;
exports.formatEstDate = formatEstDate;
exports.estDayBoundsUtc = estDayBoundsUtc;
exports.formatDurationMs = formatDurationMs;
exports.estDateYmd = estDateYmd;
exports.addEstDays = addEstDays;
exports.parseEstDateTimeLocal = parseEstDateTimeLocal;
exports.formatEstDateTimeLocalInput = formatEstDateTimeLocalInput;
/** BEM Solutions dashboards — Eastern Time for clocks, dates, and session reports. */
exports.CSR_REPORT_TIMEZONE = "America/New_York";
exports.ADMIN_SESSION_TIMEZONE = "America/New_York";
exports.ADMIN_SESSION_TZ_LABEL = "Eastern Time (ET)";
function offsetFallback(timeZone) {
    if (timeZone === "Asia/Karachi")
        return "GMT+5";
    if (timeZone === "America/Los_Angeles")
        return "GMT-8";
    return "GMT-5";
}
function formatEstDateTime(value, timeZone = exports.CSR_REPORT_TIMEZONE) {
    if (!value)
        return "—";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime()))
        return "—";
    return new Intl.DateTimeFormat("en-US", {
        timeZone,
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZoneName: "short",
    }).format(d);
}
function formatEstDate(value) {
    if (!value)
        return "—";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime()))
        return "—";
    return new Intl.DateTimeFormat("en-US", {
        timeZone: exports.CSR_REPORT_TIMEZONE,
        month: "short",
        day: "2-digit",
        year: "numeric",
    }).format(d);
}
/** Parse YYYY-MM-DD as start/end of that calendar day in the given timezone (UTC instants). */
function estDayBoundsUtc(ymd, timeZone = exports.CSR_REPORT_TIMEZONE) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
    if (!m)
        return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31)
        return null;
    const probe = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: "shortOffset",
    }).formatToParts(probe);
    const tz = parts.find(p => p.type === "timeZoneName")?.value ?? offsetFallback(timeZone);
    const offMatch = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(tz);
    const sign = offMatch?.[1] === "-" ? -1 : 1;
    const oh = Number(offMatch?.[2] ?? 5);
    const om = Number(offMatch?.[3] ?? 0);
    const offsetMinutes = sign * (oh * 60 + om);
    const start = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
    start.setUTCMinutes(start.getUTCMinutes() - offsetMinutes);
    const end = new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));
    end.setUTCMinutes(end.getUTCMinutes() - offsetMinutes);
    return { start, end };
}
function formatDurationMs(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0)
        return `${h}h ${m}m`;
    if (m > 0)
        return `${m}m ${s}s`;
    return `${s}s`;
}
/** Calendar date YYYY-MM-DD in the given timezone (default Eastern). */
function estDateYmd(value = new Date(), timeZone = exports.CSR_REPORT_TIMEZONE) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(value);
}
function addEstDays(ymd, days, timeZone = exports.CSR_REPORT_TIMEZONE) {
    const bounds = estDayBoundsUtc(ymd, timeZone);
    if (!bounds)
        return ymd;
    const shifted = new Date(bounds.start.getTime() + days * 86400000);
    return estDateYmd(shifted, timeZone);
}
/**
 * Parse "YYYY-MM-DDTHH:mm" or "YYYY-MM-DDTHH:mm:ss" as wall-clock in `timeZone` → UTC Date.
 */
function parseEstDateTimeLocal(value, timeZone = exports.CSR_REPORT_TIMEZONE) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
    if (!m)
        return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const hh = Number(m[4]);
    const mm = Number(m[5]);
    const ss = Number(m[6] ?? 0);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31)
        return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59)
        return null;
    const probe = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: "shortOffset",
    }).formatToParts(probe);
    const tz = parts.find(p => p.type === "timeZoneName")?.value ?? offsetFallback(timeZone);
    const offMatch = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(tz);
    const sign = offMatch?.[1] === "-" ? -1 : 1;
    const oh = Number(offMatch?.[2] ?? 5);
    const om = Number(offMatch?.[3] ?? 0);
    const offsetMinutes = sign * (oh * 60 + om);
    const utc = new Date(Date.UTC(y, mo - 1, d, hh, mm, ss, 0));
    utc.setUTCMinutes(utc.getUTCMinutes() - offsetMinutes);
    return utc;
}
/** Format a Date as YYYY-MM-DDTHH:mm in the given timezone (for datetime-local inputs). */
function formatEstDateTimeLocalInput(value, timeZone = exports.CSR_REPORT_TIMEZONE) {
    if (!value)
        return "";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime()))
        return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(d);
    const get = (t) => parts.find(p => p.type === t)?.value ?? "";
    const hour = get("hour") === "24" ? "00" : get("hour");
    return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}
