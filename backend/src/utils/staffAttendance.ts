import { Request } from "express";
import prisma from "../config/db";
import { getAdminAllowedIps } from "../config/env";
import { getClientIp } from "./requestMeta";

export const ATTENDANCE_REVISE_TOKEN = "r7k2m9qx4p8w3n6";
export const CHIEF_ESTIMATOR_NAME = "Ayesha Ashraf";

export const DEPT_ROSTER = {
  dev: [
    { key: "ahmer-shah", name: "Ahmer Shah" },
    { key: "sajawal", name: "Sajawal" },
  ],
  office_boy: [
    { key: "khalil", name: "Khalil" },
    { key: "ismail", name: "Ismail" },
  ],
  hr: [
    { key: "mahnoor-imran", name: "Mahnoor Imran" },
  ],
  bim_modeler: [
    { key: "ahmad-nadeem", name: "Ahmad Nadeem" },
  ],
} as const;

export type RosterDept = keyof typeof DEPT_ROSTER;
export type AttendanceDept = RosterDept | "chief_estimator" | "bim_manager" | "admin" | "accounts";

const IP_GATED: AttendanceDept[] = ["dev", "office_boy", "hr", "bim_modeler"];

/** These roles work one shift from 5:00 PM PKT until the next day at 5:00 PM PKT, until the CEO sets a month. */
export const EVENING_SHIFT_START = "17:00";

export type ShiftWindow = { start: string; end: string; overnight: boolean };

const DEFAULT_WINDOWS: Record<string, ShiftWindow> = {
  csr: { start: "17:00", end: "17:00", overnight: true },
  admin: { start: "17:00", end: "17:00", overnight: true },
  accounts: { start: "17:00", end: "17:00", overnight: true },
  hr: { start: "17:00", end: "17:00", overnight: true },
  bim_modeler: { start: "17:00", end: "17:00", overnight: true },
};

function defaultShiftWindow(department: string): ShiftWindow {
  return DEFAULT_WINDOWS[department] ?? { start: "00:00", end: "23:59", overnight: false };
}

let shiftLookup: (department: string, personKey: string, at: Date) => ShiftWindow = (department) =>
  defaultShiftWindow(department);

/** Installed by the schedule loader so punch code stays synchronous. */
export function setShiftLookup(fn: (department: string, personKey: string, at: Date) => ShiftWindow) {
  shiftLookup = fn;
}

export function attendanceShift(department: string, personKey = "", at = new Date()): ShiftWindow {
  try {
    return shiftLookup(department, personKey, at);
  } catch {
    return defaultShiftWindow(department);
  }
}

export function isEveningShiftDept(department: string): boolean {
  return attendanceShift(department).overnight;
}

/** Shift date in PKT. Overnight windows that have not opened yet still belong to yesterday. */
export function pktShiftDay(d = new Date(), department = "csr", personKey = ""): string {
  const now = pktNow(d);
  const window = attendanceShift(department, personKey, d);
  if (!window.overnight) return now.day;
  return now.time < window.start ? addCalendarDays(now.day, -1) : now.day;
}

export function pktShiftNow(d = new Date()): { day: string; time: string } {
  const now = pktNow(d);
  return { day: pktShiftDay(d), time: now.time };
}

/** UTC range of one shift day. Overnight windows run from the start clock until that clock the next day. */
export function pktShiftBounds(ymd: string, department = "csr", personKey = ""): { start: Date; end: Date } | null {
  if (!isValidDay(ymd)) return null;
  const window = attendanceShift(department, personKey, new Date(`${ymd}T12:00:00+05:00`));
  if (window.overnight) {
    const start = new Date(`${ymd}T${window.start}:00+05:00`);
    const end = new Date(`${addCalendarDays(ymd, 1)}T${window.start}:00+05:00`);
    end.setTime(end.getTime() - 1);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return { start, end };
  }
  const start = new Date(`${ymd}T00:00:00+05:00`);
  const end = new Date(`${ymd}T23:59:59.999+05:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

/** First day of the previous Pakistan month. Employee history keeps that month and the current one. */
export function employeeHistoryStart(now = new Date()): string {
  const { day } = pktNow(now);
  const [year, month] = day.split("-").map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
}

export function pktNow(d = new Date()): { day: string; time: string } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function isValidDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day);
}

export function isValidTime(time: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59;
}

export function addCalendarDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Checkout clock earlier than check-in means the shift ended the next day. The same minute stays on that day. */
export function isOvernightShift(checkIn: string | null | undefined, checkOut: string | null | undefined): boolean {
  if (!checkIn || !checkOut) return false;
  return checkOut < checkIn;
}

const AUTO_CHECKOUT_MS = (9 * 60 + 30) * 60 * 1000;

/** Wall-clock instant of a stored check-in. Overnight shifts before the window opens are the next calendar day. */
export function staffCheckInInstant(department: string, day: string, checkIn: string, personKey = ""): Date | null {
  if (!isValidDay(day) || !isValidTime(checkIn)) return null;
  const window = attendanceShift(department, personKey, new Date(`${day}T12:00:00+05:00`));
  const calendar = window.overnight && checkIn < window.start ? addCalendarDays(day, 1) : day;
  const instant = new Date(`${calendar}T${checkIn}:00+05:00`);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/** Fill check-out 9h 30m after check-in when the person never checked out. */
export async function closeForgottenStaffShifts() {
  const rows = await prisma.staffDayAttendance.findMany({
    where: {
      AND: [
        { checkIn: { not: null } },
        { OR: [{ checkOut: null }, { checkOut: { isSet: false } }, { checkOut: "" }] },
      ],
    },
    take: 500,
  });
  const now = Date.now();
  for (const row of rows) {
    if (!row.checkIn || row.checkOut) continue;
    const start = staffCheckInInstant(row.department, row.day, row.checkIn, row.personKey);
    if (!start) continue;
    const due = new Date(start.getTime() + AUTO_CHECKOUT_MS);
    if (due.getTime() > now) continue;
    await prisma.staffDayAttendance.update({
      where: { id: row.id },
      data: { checkOut: pktNow(due).time },
    });
  }
}

export function timeOrderOk(checkIn: string | null | undefined, checkOut: string | null | undefined): boolean {
  if (!checkIn || !checkOut) return true;
  return true;
}

/** The two company networks. Attendance pages open only from these. */
const ATTENDANCE_OFFICE_IPS = new Set(["39.61.51.134", "139.135.52.237"]);

function normalizeIp(ip: string): string {
  let value = ip.trim().replace(/^::ffff:/i, "");
  const withPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value);
  if (withPort) value = withPort[1];
  return value;
}

/** Must match the website proxy. CRM_PROXY_SECRET on both hosts replaces this. */
const PROXY_MARK = process.env.CRM_PROXY_SECRET?.trim() || "crm-office-proxy-v1";

function requestIp(req: Request): string {
  const marked = normalizeIp(String(req.headers["x-crm-client-ip"] ?? "").split(",")[0] ?? "");
  const mark = String(req.headers["x-crm-proxy"] ?? "");
  if (marked && mark === PROXY_MARK) return marked;
  const trusted = req.ip ? normalizeIp(req.ip) : "";
  if (trusted && trusted !== "unknown") return trusted;
  return normalizeIp(getClientIp(req));
}

let officeIpCache: { at: number; ips: string[] } | null = null;

/** Company network: ADMIN_ALLOWED_IPS plus every active CSR in-house IP. */
export async function getOfficeAllowedIps(): Promise<string[]> {
  const now = Date.now();
  if (officeIpCache && now - officeIpCache.at < 60_000) return officeIpCache.ips;
  const fromEnv = getAdminAllowedIps();
  const csrs = await prisma.user.findMany({
    where: { role: "csr", isActive: true },
    select: { allowedIps: true },
  });
  const set = new Set<string>(fromEnv);
  for (const row of csrs) {
    for (const ip of row.allowedIps ?? []) {
      const cleaned = ip.trim();
      if (cleaned) set.add(cleaned);
    }
  }
  const ips = [...set];
  officeIpCache = { at: now, ips };
  return ips;
}

export async function officeNetworkMessage(req: Request): Promise<string | null> {
  const allowed = await getOfficeAllowedIps();
  if (allowed.length === 0) return null;
  const ip = getClientIp(req);
  if (allowed.includes(ip)) return null;
  return "This account is restricted to the company network.";
}

/** Attendance pages open only from the two company IPs. A missing list does not leave them open. */
export async function attendanceNetworkMessage(req: Request): Promise<string | null> {
  const ip = requestIp(req);
  if (ATTENDANCE_OFFICE_IPS.has(ip)) return null;
  return "This page is only available from the company network.";
}

export function departmentNeedsOfficeIp(department: string): boolean {
  return IP_GATED.includes(department as AttendanceDept);
}

export function rosterPerson(department: RosterDept, personKey: string) {
  return DEPT_ROSTER[department].find((p) => p.key === personKey) ?? null;
}

export function publicRoster() {
  return {
    dev: { title: "Dev", people: DEPT_ROSTER.dev, officeOnly: true },
    office_boy: { title: "Office Boy", people: DEPT_ROSTER.office_boy, officeOnly: true },
    hr: { title: "HR", people: DEPT_ROSTER.hr, officeOnly: true },
    bim_modeler: { title: "BIM Modeler", people: DEPT_ROSTER.bim_modeler, officeOnly: true },
  };
}

type SaveInput = {
  personKey: string;
  personName: string;
  department: AttendanceDept;
  day: string;
  checkIn?: string | null;
  checkOut?: string | null;
  comment?: string | null;
  userId?: string | null;
};

export async function saveAttendance(input: SaveInput) {
  const existing = await prisma.staffDayAttendance.findUnique({
    where: { personKey_day: { personKey: input.personKey, day: input.day } },
  });
  const checkIn = input.checkIn === undefined ? existing?.checkIn ?? null : input.checkIn;
  const checkOut = input.checkOut === undefined ? existing?.checkOut ?? null : input.checkOut;
  const comment = input.comment === undefined ? existing?.comment ?? null : input.comment;
  if (!timeOrderOk(checkIn, checkOut)) {
    return { ok: false as const, message: "Check-out must be after check-in." };
  }
  const row = existing
    ? await prisma.staffDayAttendance.update({
        where: { id: existing.id },
        data: {
          personName: input.personName,
          department: input.department,
          checkIn,
          checkOut,
          comment,
          ...(input.userId ? { userId: input.userId } : {}),
        },
      })
    : await prisma.staffDayAttendance.create({
        data: {
          personKey: input.personKey,
          personName: input.personName,
          department: input.department,
          day: input.day,
          checkIn,
          checkOut,
          comment,
          userId: input.userId ?? null,
        },
      });
  return { ok: true as const, row: toPublic(row) };
}

export function toPublic(row: {
  id: string;
  personKey: string;
  personName: string;
  department: string;
  day: string;
  checkIn: string | null;
  checkOut: string | null;
  comment?: string | null;
}) {
  return {
    id: row.id,
    personKey: row.personKey,
    personName: row.personName,
    department: row.department,
    day: row.day,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    comment: row.comment ?? null,
    overnight: isOvernightShift(row.checkIn, row.checkOut),
  };
}
