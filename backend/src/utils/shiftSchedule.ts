import prisma from "../config/db";
import { DEPT_ROSTER, setShiftLookup, type ShiftWindow } from "./staffAttendance";

export const SHIFT_DEPARTMENTS: { id: string; label: string; role?: string }[] = [
  { id: "csr", label: "CSR", role: "csr" },
  { id: "estimator", label: "Estimator", role: "estimator" },
  { id: "chief_estimator", label: "Chief Estimator", role: "technical_manager" },
  { id: "admin", label: "Admin", role: "manager" },
  { id: "accounts", label: "Accounts", role: "accounts" },
  { id: "dev", label: "Dev" },
  { id: "office_boy", label: "Office Boy" },
  { id: "hr", label: "HR" },
  { id: "bim_modeler", label: "BIM Modeler" },
];

type StoredShift = {
  month: string;
  department: string;
  personKey: string;
  checkIn: string;
  checkOut: string;
};

let rows: StoredShift[] = [];

function asWindow(checkIn: string, checkOut: string): ShiftWindow {
  return {
    start: checkIn,
    end: checkOut,
    overnight: checkOut <= checkIn,
  };
}

function latest(department: string, personKey: string, month: string): StoredShift | null {
  let best: StoredShift | null = null;
  for (const row of rows) {
    if (row.department !== department || row.personKey !== personKey || row.month > month) continue;
    if (!best || row.month > best.month) best = row;
  }
  return best;
}

function lookup(department: string, personKey: string, at: Date): ShiftWindow {
  const month = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
  }).format(at);
  const person = personKey ? latest(department, personKey, month) : null;
  const dept = latest(department, "", month);
  const chosen = person ?? dept;
  if (!chosen) {
    const fallback = setShiftLookupFallback(department);
    return fallback;
  }
  return asWindow(chosen.checkIn, chosen.checkOut);
}

function setShiftLookupFallback(department: string): ShiftWindow {
  if (
    department === "csr" ||
    department === "admin" ||
    department === "accounts" ||
    department === "hr" ||
    department === "bim_modeler"
  ) {
    return { start: "17:00", end: "17:00", overnight: true };
  }
  return { start: "00:00", end: "23:59", overnight: false };
}

setShiftLookup(lookup);

export async function refreshShiftSchedules() {
  const found = await prisma.shiftSchedule.findMany({
    select: { month: true, department: true, personKey: true, checkIn: true, checkOut: true },
  });
  rows = found.map((row) => ({
    month: row.month,
    department: row.department,
    personKey: row.personKey || "",
    checkIn: row.checkIn,
    checkOut: row.checkOut,
  }));
}

function validMonth(month: string) {
  return /^\d{4}-\d{2}$/.test(month);
}

function validClock(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export async function listShiftSchedules(month: string) {
  if (!validMonth(month)) return null;
  await refreshShiftSchedules();
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ["csr", "estimator", "technical_manager", "manager", "accounts"] },
    },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  const departments = SHIFT_DEPARTMENTS.map((dept) => {
    const saved = rows.find((row) => row.month === month && row.department === dept.id && row.personKey === "");
    const carried = latest(dept.id, "", month);
    const window = lookup(dept.id, "", new Date(`${month}-15T12:00:00+05:00`));
    const roster = DEPT_ROSTER[dept.id as keyof typeof DEPT_ROSTER];
    const people = roster
      ? roster.map((person) => ({ personKey: person.key, personName: person.name }))
      : users.filter((user) => user.role === dept.role).map((user) => ({ personKey: user.id, personName: user.name }));
    return {
      department: dept.id,
      label: dept.label,
      checkIn: window.start,
      checkOut: window.end,
      saved: !!saved,
      carriedFrom: saved ? null : carried && carried.month !== month ? carried.month : null,
      employees: people.map((person) => {
        const own = rows.find((row) => row.month === month && row.department === dept.id && row.personKey === person.personKey);
        const personWindow = lookup(dept.id, person.personKey, new Date(`${month}-15T12:00:00+05:00`));
        const personCarried = latest(dept.id, person.personKey, month);
        return {
          personKey: person.personKey,
          personName: person.personName,
          checkIn: personWindow.start,
          checkOut: personWindow.end,
          saved: !!own,
          carriedFrom: own ? null : personCarried && personCarried.month !== month ? personCarried.month : null,
        };
      }),
    };
  });
  return { month, departments };
}

export async function saveShiftSchedule(input: {
  month: string;
  department: string;
  personKey?: string;
  personName?: string;
  checkIn: string;
  checkOut: string;
  updatedBy: string;
}) {
  if (!validMonth(input.month)) return { ok: false as const, message: "Pick a month." };
  if (!SHIFT_DEPARTMENTS.some((dept) => dept.id === input.department)) {
    return { ok: false as const, message: "Unknown department." };
  }
  if (!validClock(input.checkIn) || !validClock(input.checkOut)) {
    return { ok: false as const, message: "Use 24-hour times like 09:00 and 18:00." };
  }
  const personKey = (input.personKey ?? "").trim();
  await prisma.shiftSchedule.upsert({
    where: {
      month_department_personKey: {
        month: input.month,
        department: input.department,
        personKey,
      },
    },
    create: {
      month: input.month,
      department: input.department,
      personKey,
      personName: personKey ? (input.personName ?? "").trim() : "",
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      updatedBy: input.updatedBy,
    },
    update: {
      personName: personKey ? (input.personName ?? "").trim() : "",
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      updatedBy: input.updatedBy,
    },
  });
  await refreshShiftSchedules();
  return { ok: true as const };
}

export async function clearShiftSchedule(month: string, department: string, personKey = "") {
  if (!validMonth(month)) return { ok: false as const, message: "Pick a month." };
  await prisma.shiftSchedule.deleteMany({
    where: { month, department, personKey },
  });
  await refreshShiftSchedules();
  return { ok: true as const };
}
