import prisma from "../config/db";
import { parseEstDateTimeLocal } from "./estTime";
import { adminAdjustCsrWorkSession } from "./csrSessionTracking";
import {
  AttendanceDept,
  addCalendarDays,
  attendanceShift,
  isValidDay,
  isValidTime,
  pktShiftDay,
  saveAttendance,
} from "./staffAttendance";

export const REQUEST_KINDS = [
  "attendance_correction",
  "leave",
  "reimbursement",
  "wfh",
  "asset",
  "custom",
] as const;

export type RequestKind = (typeof REQUEST_KINDS)[number];

const LABELS: Record<RequestKind, string> = {
  attendance_correction: "Attendance Correction",
  leave: "Leave Request",
  reimbursement: "Reimbursement",
  wfh: "Work From Home",
  asset: "Asset Issue",
  custom: "Custom Request",
};

export function isRequestKind(value: string): value is RequestKind {
  return (REQUEST_KINDS as readonly string[]).includes(value);
}

function clock12(time: string | null | undefined): string {
  if (!time) return "";
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${match[2]} ${suffix}`;
}

function clip(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max);
}

export type RequestDraft = {
  kind: RequestKind;
  day: string;
  summary: string;
  detail: string;
  checkIn: string | null;
  checkOut: string | null;
};

export function parseRequestDraft(body: Record<string, unknown>): { ok: true; draft: RequestDraft } | { ok: false; message: string } {
  const kind = String(body.kind ?? "");
  if (!isRequestKind(kind)) return { ok: false, message: "Choose a request type." };
  const day = String(body.day ?? "").trim();
  if (!isValidDay(day)) return { ok: false, message: "Choose a date." };
  const detail = clip(body.detail);
  const title = clip(body.title, 120);
  const amount = clip(body.amount, 40);
  const endDay = String(body.endDay ?? "").trim();
  const checkIn = clip(body.checkIn, 5) || null;
  const checkOut = clip(body.checkOut, 5) || null;

  if (kind === "attendance_correction") {
    if (!checkIn || !isValidTime(checkIn)) return { ok: false, message: "Enter a check-in time." };
    if (checkOut && !isValidTime(checkOut)) return { ok: false, message: "Enter a valid check-out time." };
    const out = checkOut ? clock12(checkOut) : "still in";
    return {
      ok: true,
      draft: {
        kind,
        day,
        summary: `${day} · In ${clock12(checkIn)} · Out ${out}`,
        detail,
        checkIn,
        checkOut,
      },
    };
  }

  if (kind === "leave" || kind === "wfh") {
    if (!detail) return { ok: false, message: "Add a short reason." };
    const end = isValidDay(endDay) && endDay !== day ? ` – ${endDay}` : "";
    return { ok: true, draft: { kind, day, summary: `${day}${end}`, detail, checkIn: null, checkOut: null } };
  }

  if (kind === "reimbursement") {
    if (!amount) return { ok: false, message: "Enter an amount." };
    return {
      ok: true,
      draft: { kind, day, summary: `${amount} · ${day}`, detail, checkIn: null, checkOut: null },
    };
  }

  const summary = title || detail;
  if (!summary) return { ok: false, message: "Describe the request." };
  return {
    ok: true,
    draft: { kind, day, summary: summary.slice(0, 120), detail: title && detail ? detail : detail, checkIn: null, checkOut: null },
  };
}

export function toPublicRequest(row: {
  id: string;
  personKey: string;
  personName: string;
  department: string;
  kind: string;
  day: string;
  summary: string;
  detail: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  reviewedBy: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    personKey: row.personKey,
    personName: row.personName,
    department: row.department,
    kind: row.kind,
    kindLabel: LABELS[row.kind as RequestKind] ?? row.kind,
    day: row.day,
    summary: row.summary,
    detail: row.detail,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    status: row.status,
    reviewedBy: row.reviewedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

function wallOnShift(day: string, time: string, overnight: boolean, shiftStart: string): string {
  const calendar = overnight && time < shiftStart ? addCalendarDays(day, 1) : day;
  return `${calendar}T${time}`;
}

/** Attendance correction approval writes the requested times onto that day. */
export async function applyApprovedRequest(row: {
  kind: string;
  department: string;
  personKey: string;
  personName: string;
  day: string;
  checkIn: string | null;
  checkOut: string | null;
}) {
  if (row.kind !== "attendance_correction") return { ok: true as const };
  if (!row.checkIn || !isValidTime(row.checkIn)) {
    return { ok: false as const, message: "Check-in time is missing." };
  }
  if (row.checkOut && !isValidTime(row.checkOut)) {
    return { ok: false as const, message: "Check-out time is invalid." };
  }

  if (row.department === "csr" || row.department === "estimator") {
    const window = attendanceShift(row.department, row.personKey, new Date(`${row.day}T12:00:00+05:00`));
    const from = new Date(`${addCalendarDays(row.day, -2)}T00:00:00.000Z`);
    const to = new Date(`${addCalendarDays(row.day, 3)}T00:00:00.000Z`);
    const sessions = await prisma.csrWorkSession.findMany({
      where: { userId: row.personKey, loginAt: { gte: from, lt: to } },
      select: { id: true, loginAt: true },
    });
    const ids = sessions
      .filter((session) => pktShiftDay(session.loginAt, row.department, row.personKey) === row.day)
      .map((session) => session.id);
    if (!ids.length) return { ok: false as const, message: "No check-in that day to update." };
    const checkInAt = parseEstDateTimeLocal(wallOnShift(row.day, row.checkIn, window.overnight, window.start), "Asia/Karachi");
    if (!checkInAt) return { ok: false as const, message: "Invalid check-in time." };
    const checkOutAt = row.checkOut
      ? parseEstDateTimeLocal(wallOnShift(row.day, row.checkOut, window.overnight, window.start), "Asia/Karachi")
      : null;
    if (row.checkOut && !checkOutAt) return { ok: false as const, message: "Invalid check-out time." };
    const adjusted = await adminAdjustCsrWorkSession({
      sessionId: ids[0]!,
      memberIds: ids,
      checkInAt,
      checkOutAt,
      clearCheckOut: !row.checkOut,
      note: "request_approved",
    });
    if (!adjusted.ok) return { ok: false as const, message: adjusted.message };
    return { ok: true as const };
  }

  const saved = await saveAttendance({
    personKey: row.personKey,
    personName: row.personName,
    department: row.department as AttendanceDept,
    day: row.day,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
  });
  if (!saved.ok) return { ok: false as const, message: saved.message };
  return { ok: true as const };
}
