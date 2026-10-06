import prisma from "../config/db";
import { addCalendarDays, pktShiftDay, staffCheckInInstant } from "./staffAttendance";

const NINE_HOURS_MS = 9 * 60 * 60 * 1000;

export function formatOvertimeMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function isWeekend(date: Date, timeZone: string): boolean {
  const day = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  return day === "Sat" || day === "Sun";
}

export type OvertimeDepartment = "dev" | "estimator" | "chief_estimator" | "bim_modeler";

const REVIEW_LABEL: Record<string, string> = {
  admin: "CEO",
  technical_manager: "Chief Estimator",
};

export function overtimeReviewerLabel(role: string): string | null {
  return REVIEW_LABEL[role] ?? null;
}

export async function saveOvertimeComment(input: {
  personKey: string;
  personName: string;
  department: OvertimeDepartment;
  day: string;
  comment: string;
}) {
  const comment = input.comment.trim().slice(0, 500);
  if (!comment) return null;
  const where = {
    personKey_day_department: {
      personKey: input.personKey,
      day: input.day,
      department: input.department,
    },
  };
  const existing = await prisma.overtimeRequest.findUnique({ where });
  if (!existing) {
    return prisma.overtimeRequest.create({
      data: {
        personKey: input.personKey,
        personName: input.personName,
        department: input.department,
        day: input.day,
        comment,
        status: "pending",
      },
    });
  }
  if (existing.comment === comment) return existing;
  return prisma.overtimeRequest.update({
    where: { id: existing.id },
    data: { comment, personName: input.personName, status: "pending", editedBy: null },
  });
}

export async function reviewOvertime(input: {
  id: string;
  role: string;
  action: "approve" | "decline" | "edit";
  comment?: string;
  minutes?: number;
}) {
  const note = await prisma.overtimeRequest.findUnique({ where: { id: input.id } });
  if (!note) return { ok: false as const, message: "Overtime comment not found." };
  const reviewer = overtimeReviewerLabel(input.role);
  if (!reviewer) return { ok: false as const, message: "You cannot review overtime." };
  if (input.role === "technical_manager" && note.department !== "estimator" && note.department !== "chief_estimator") {
    return { ok: false as const, message: "Chief Estimator reviews estimator and chief estimator overtime." };
  }
  if (input.role === "admin" && (note.department === "estimator" || note.department === "chief_estimator")) {
    return { ok: false as const, message: "Chief Estimator reviews this overtime." };
  }
  if (input.action === "edit") {
    const minutes = Number(input.minutes);
    const comment = Number.isInteger(minutes) && minutes >= 1 && minutes <= 12 * 60
      ? formatOvertimeMinutes(minutes)
      : (input.comment ?? "").trim().slice(0, 500);
    if (!comment) return { ok: false as const, message: "Enter the overtime time." };
    const updated = await prisma.overtimeRequest.update({
      where: { id: note.id },
      data: { comment, editedBy: reviewer },
    });
    return { ok: true as const, note: updated };
  }
  const updated = await prisma.overtimeRequest.update({
    where: { id: note.id },
    data: { status: input.action === "approve" ? "approved" : "declined" },
  });
  return { ok: true as const, note: updated };
}

/** Re-check-in within this gap still belongs to the same shift. */
const SHIFT_GAP_MS = 3 * 60 * 60 * 1000;

function hasClock(value: string | null | undefined): value is string {
  return !!value && value !== "";
}

/**
 * Wall-clock of the current shift. A check-in that started before midnight
 * Eastern still counts — Pakistani daytime shifts often cross that date line,
 * so filtering to "today ET" left the button off after a full 9 hour shift.
 */
async function estimatorShiftMs(userId: string): Promise<{ ms: number; open: boolean }> {
  const now = Date.now();
  const sessions = await prisma.csrWorkSession.findMany({
    where: { userId, loginAt: { gte: new Date(now - 36 * 60 * 60 * 1000) } },
    select: { loginAt: true, logoutAt: true },
    orderBy: { loginAt: "asc" },
  });
  if (sessions.length === 0) return { ms: 0, open: false };
  let ms = 0;
  let laterStart = Number.POSITIVE_INFINITY;
  let open = false;
  for (let i = sessions.length - 1; i >= 0; i--) {
    const session = sessions[i];
    const start = session.loginAt.getTime();
    const ended = !!session.logoutAt;
    const end = ended ? session.logoutAt!.getTime() : now;
    if (laterStart !== Number.POSITIVE_INFINITY && laterStart - end > SHIFT_GAP_MS) break;
    if (!ended) open = true;
    const clippedEnd = Math.min(end, laterStart);
    ms += Math.max(0, clippedEnd - start);
    laterStart = Math.min(laterStart, start);
  }
  return { ms, open };
}

async function chiefShiftMs(userId: string): Promise<{ ms: number; open: boolean }> {
  const day = pktShiftDay(new Date(), "chief_estimator", userId);
  const today = await prisma.staffDayAttendance.findUnique({
    where: { personKey_day: { personKey: userId, day } },
  });
  let row = today?.checkIn ? today : null;
  if (!row) {
    const prev = await prisma.staffDayAttendance.findUnique({
      where: { personKey_day: { personKey: userId, day: addCalendarDays(day, -1) } },
    });
    if (prev?.checkIn && !hasClock(prev.checkOut)) row = prev;
  }
  if (!row?.checkIn) return { ms: 0, open: false };
  const start = staffCheckInInstant(row.department || "chief_estimator", row.day, row.checkIn, row.personKey);
  const open = !hasClock(row.checkOut);
  if (!start) return { ms: 0, open };
  let end = new Date();
  if (!open && row.checkOut) {
    const outDay = row.checkOut < row.checkIn ? addCalendarDays(row.day, 1) : row.day;
    const out = new Date(`${outDay}T${row.checkOut}:00+05:00`);
    if (!Number.isNaN(out.getTime())) end = out;
  }
  return { ms: Math.max(0, end.getTime() - start.getTime()), open };
}

export async function overtimeGate(userId: string, role: string) {
  const estimator = role === "estimator";
  const timeZone = "Asia/Karachi";
  const weekend = isWeekend(new Date(), timeZone);
  const shift = estimator ? await estimatorShiftMs(userId) : await chiefShiftMs(userId);
  return {
    allowed: weekend || shift.ms >= NINE_HOURS_MS,
    weekend,
    shiftMs: shift.ms,
    open: shift.open,
  };
}

export async function submitShiftOvertime(input: { userId: string; role: string; name: string; minutes: number }) {
  if (input.role !== "estimator" && input.role !== "technical_manager") {
    return { ok: false as const, message: "Overtime is only for estimators and the Chief Estimator." };
  }
  const minutes = Math.round(input.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 12 * 60) {
    return { ok: false as const, message: "Enter overtime from 1 minute up to 12 hours." };
  }
  const gate = await overtimeGate(input.userId, input.role);
  if (!gate.allowed) {
    return { ok: false as const, message: "Overtime opens on Saturday and Sunday, or after a 9 hour weekday shift." };
  }
  const department = input.role === "estimator" ? "estimator" : "chief_estimator";
  const day = pktShiftDay(new Date(), input.role === "estimator" ? "estimator" : "chief_estimator", input.userId);
  const comment = formatOvertimeMinutes(minutes);
  const where = { personKey_day_department: { personKey: input.userId, day, department } };
  const existing = await prisma.overtimeRequest.findUnique({ where });
  const note = existing
    ? await prisma.overtimeRequest.update({
        where: { id: existing.id },
        data: { comment, personName: input.name, status: "pending", editedBy: null },
      })
    : await prisma.overtimeRequest.create({
        data: {
          personKey: input.userId,
          personName: input.name,
          department,
          day,
          comment,
          status: "pending",
        },
      });
  return { ok: true as const, note };
}

export function overtimePublic(note: {
  id: string;
  comment: string;
  status: string;
  editedBy: string | null;
} | null | undefined) {
  return {
    overtimeId: note?.id ?? null,
    overtimeComment: note?.comment ?? null,
    overtimeStatus: note?.status ?? null,
    overtimeEditedBy: note?.editedBy ?? null,
  };
}

type SessionHit = {
  loginAt: Date;
  logoutAt: Date | null;
  user: { id: string; name: string };
};

/** Estimator shifts grouped by the check-in day. A next-morning checkout stays on that day. */
export async function listEstimatorShiftRows(staffRole: "estimator" | "bim" = "estimator") {
  const sessions = await prisma.csrWorkSession.findMany({
    where: { user: { is: { role: staffRole } } },
    orderBy: { loginAt: "asc" },
    take: 8000,
    select: {
      loginAt: true,
      logoutAt: true,
      user: { select: { id: true, name: true } },
    },
  });
  type Bucket = {
    personKey: string;
    personName: string;
    day: string;
    checkInAt: Date;
    checkOutAt: Date | null;
    open: boolean;
  };
  const map = new Map<string, Bucket>();
  for (const row of sessions as SessionHit[]) {
    const day = pktShiftDay(row.loginAt, staffRole, row.user.id);
    const key = `${row.user.id}:${day}`;
    const hit = map.get(key);
    if (!hit) {
      map.set(key, {
        personKey: row.user.id,
        personName: row.user.name,
        day,
        checkInAt: row.loginAt,
        checkOutAt: row.logoutAt,
        open: !row.logoutAt,
      });
      continue;
    }
    if (row.loginAt < hit.checkInAt) hit.checkInAt = row.loginAt;
    if (!row.logoutAt) {
      hit.open = true;
      hit.checkOutAt = null;
    } else if (!hit.open && (!hit.checkOutAt || row.logoutAt > hit.checkOutAt)) {
      hit.checkOutAt = row.logoutAt;
    }
  }
  const notes = await prisma.overtimeRequest.findMany({
    where: { department: staffRole },
  });
  const byKey = new Map(notes.map((note) => [`${note.personKey}:${note.day}`, note]));
  return [...map.values()]
    .sort((a, b) => b.day.localeCompare(a.day) || a.personName.localeCompare(b.personName))
    .map((bucket) => {
      const note = byKey.get(`${bucket.personKey}:${bucket.day}`);
      return {
        id: note?.id ?? `estimator:${bucket.personKey}:${bucket.day}`,
        personKey: bucket.personKey,
        personName: bucket.personName,
        department: staffRole,
        day: bucket.day,
        checkIn: null,
        checkOut: null,
        checkInAt: bucket.checkInAt.toISOString(),
        checkOutAt: bucket.open || !bucket.checkOutAt ? null : bucket.checkOutAt.toISOString(),
        comment: null,
        ...overtimePublic(note),
      };
    });
}
