import { Router } from "express";
import type { Role } from "@prisma/client";
import prisma from "../config/db";
import { verifyToken, AuthRequest } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import {
  ATTENDANCE_REVISE_TOKEN,
  CHIEF_ESTIMATOR_NAME,
  AttendanceDept,
  addCalendarDays,
  attendanceNetworkMessage,
  departmentNeedsOfficeIp,
  isValidDay,
  isValidTime,
  officeNetworkMessage,
  isOvernightShift,
  pktNow,
  pktShiftDay,
  employeeHistoryStart,
  attendanceShift,
  EVENING_SHIFT_START,
  DEPT_ROSTER,
  publicRoster,
  rosterPerson,
  RosterDept,
  saveAttendance,
  timeOrderOk,
  toPublic,
} from "../utils/staffAttendance";
import { listEstimatorShiftRows, overtimeGate, overtimePublic, reviewOvertime, saveOvertimeComment, submitShiftOvertime } from "../utils/overtimeRequest";
import { applyApprovedRequest, parseRequestDraft, toPublicRequest } from "../utils/staffRequest";
import { SHIFT_DEPARTMENTS, clearShiftSchedule, listShiftSchedules, saveShiftSchedule } from "../utils/shiftSchedule";
import { SEED_USER_EMAILS } from "../constants/seedUsers";
import { ceoSetPortalShiftDay } from "../utils/csrSessionTracking";
import { clearLatePolicy, listLatePolicies, saveLatePolicy } from "../utils/lateDeduction";
import { dailyLateReport } from "../utils/dailyLateReport";

const router = Router();

router.get("/late-daily", verifyToken, allowRoles("admin"), async (req: AuthRequest, res) => {
  try {
    const date = String(req.query.date ?? pktNow().day);
    const report = await dailyLateReport(date);
    if (!report) return res.status(400).json({ success: false, message: "Pick a date." });
    return res.json({ success: true, ...report });
  } catch (error) {
    console.error("[attendance/late-daily]", error);
    return res.status(500).json({ success: false, message: "Could not load daily deductions." });
  }
});

router.get("/shift-schedules", verifyToken, allowRoles("admin"), async (req: AuthRequest, res) => {
  try {
    const month = String(req.query.month ?? "").trim();
    const data = await listShiftSchedules(month);
    if (!data) return res.status(400).json({ success: false, message: "Pick a month." });
    return res.json({ success: true, ...data });
  } catch (error) {
    console.error("[attendance/shift-schedules]", error);
    return res.status(500).json({ success: false, message: "Could not load shift hours." });
  }
});

router.put("/shift-schedules", verifyToken, allowRoles("admin"), async (req: AuthRequest, res) => {
  try {
    const result = await saveShiftSchedule({
      month: String(req.body?.month ?? ""),
      department: String(req.body?.department ?? ""),
      personKey: String(req.body?.personKey ?? ""),
      personName: String(req.body?.personName ?? ""),
      checkIn: String(req.body?.checkIn ?? ""),
      checkOut: String(req.body?.checkOut ?? ""),
      updatedBy: req.user!.id,
    });
    if (!result.ok) return res.status(400).json({ success: false, message: result.message });
    return res.json({ success: true, message: "Shift hours saved." });
  } catch (error) {
    console.error("[attendance/shift-schedules save]", error);
    return res.status(500).json({ success: false, message: "Could not save shift hours." });
  }
});

router.get("/late-deductions", verifyToken, allowRoles("admin", "accounts"), async (req: AuthRequest, res) => {
  try {
    const month = String(req.query.month ?? "").trim();
    const data = await listLatePolicies(month);
    if (!data) return res.status(400).json({ success: false, message: "Pick a month." });
    return res.json({ success: true, ...data });
  } catch (error) {
    console.error("[attendance/late-deductions]", error);
    return res.status(500).json({ success: false, message: "Could not load deduction ranges." });
  }
});

router.put("/late-deductions", verifyToken, allowRoles("admin"), async (req: AuthRequest, res) => {
  try {
    const result = await saveLatePolicy({
      month: String(req.body?.month ?? ""),
      department: String(req.body?.department ?? ""),
      personKey: String(req.body?.personKey ?? ""),
      personName: String(req.body?.personName ?? ""),
      components: req.body?.components,
      ranges: req.body?.ranges,
      updatedBy: req.user!.id,
    });
    if (!result.ok) return res.status(400).json({ success: false, message: result.message });
    return res.json({ success: true, message: "Deduction ranges saved." });
  } catch (error) {
    console.error("[attendance/late-deductions save]", error);
    return res.status(500).json({ success: false, message: "Could not save deduction ranges." });
  }
});

router.delete("/late-deductions", verifyToken, allowRoles("admin"), async (req: AuthRequest, res) => {
  try {
    const result = await clearLatePolicy(
      String(req.query.month ?? ""),
      String(req.query.department ?? ""),
      String(req.query.personKey ?? ""),
    );
    if (!result.ok) return res.status(400).json({ success: false, message: result.message });
    return res.json({ success: true, message: "Deduction ranges cleared." });
  } catch (error) {
    console.error("[attendance/late-deductions clear]", error);
    return res.status(500).json({ success: false, message: "Could not clear deduction ranges." });
  }
});

const PORTAL_ROLE: Record<string, Role> = {
  chief_estimator: "technical_manager",
  bim_manager: "bim_manager",
  admin: "manager",
  accounts: "accounts",
};

router.post("/ceo-day", verifyToken, allowRoles("admin"), async (req: AuthRequest, res) => {
  try {
    const department = String(req.body?.department ?? "");
    const personKey = String(req.body?.personKey ?? "").trim();
    const personName = String(req.body?.personName ?? "").trim();
    const day = String(req.body?.day ?? "").trim();
    const checkIn = String(req.body?.checkIn ?? "").trim();
    const checkOutRaw = String(req.body?.checkOut ?? "").trim();
    if (!SHIFT_DEPARTMENTS.some((dept) => dept.id === department) && department !== "bim" && department !== "bim_manager") {
      return res.status(400).json({ success: false, message: "Unknown department." });
    }
    if (!personKey || !personName) return res.status(400).json({ success: false, message: "Choose an employee." });
    if (!isValidDay(day) || day > pktNow().day) {
      return res.status(400).json({ success: false, message: "Pick today or a past date." });
    }
    if (!isValidTime(checkIn)) return res.status(400).json({ success: false, message: "Enter a check-in time." });
    const checkOut = checkOutRaw || null;
    if (checkOut && !isValidTime(checkOut)) {
      return res.status(400).json({ success: false, message: "Enter a valid check-out time." });
    }
    if (department === "csr" || department === "estimator" || department === "bim") {
      const user = await prisma.user.findFirst({
        where: { id: personKey, role: department, isActive: true },
        select: { id: true },
      });
      if (!user) return res.status(400).json({ success: false, message: "Unknown employee." });
      const saved = await ceoSetPortalShiftDay({ userId: personKey, department, day, checkIn, checkOut });
      if (!saved.ok) return res.status(400).json({ success: false, message: saved.message });
      return res.json({ success: true, message: "Time saved." });
    }
    const role = PORTAL_ROLE[department];
    if (role) {
      const user = await prisma.user.findFirst({
        where: { id: personKey, role, isActive: true },
        select: { id: true },
      });
      if (!user) return res.status(400).json({ success: false, message: "Unknown employee." });
    } else if (!isRosterDept(department) || !rosterPerson(department, personKey)) {
      return res.status(400).json({ success: false, message: "Unknown employee." });
    }
    const saved = await saveAttendance({
      personKey,
      personName,
      department: department as AttendanceDept,
      day,
      checkIn,
      checkOut,
      userId: role ? personKey : null,
    });
    if (!saved.ok) return res.status(400).json({ success: false, message: saved.message });
    return res.json({ success: true, message: "Time saved." });
  } catch (error) {
    console.error("[attendance/ceo-day]", error);
    return res.status(500).json({ success: false, message: "Could not save time." });
  }
});

router.delete("/shift-schedules", verifyToken, allowRoles("admin"), async (req: AuthRequest, res) => {
  try {
    const result = await clearShiftSchedule(
      String(req.query.month ?? ""),
      String(req.query.department ?? ""),
      String(req.query.personKey ?? ""),
    );
    if (!result.ok) return res.status(400).json({ success: false, message: result.message });
    return res.json({ success: true, message: "Shift hours cleared." });
  } catch (error) {
    console.error("[attendance/shift-schedules clear]", error);
    return res.status(500).json({ success: false, message: "Could not clear shift hours." });
  }
});

const ROLE_DEPT: Record<string, AttendanceDept> = {
  technical_manager: "chief_estimator",
  bim_manager: "bim_manager",
  manager: "admin",
  accounts: "accounts",
};

const REQUEST_ROLE_DEPT: Record<string, string> = {
  csr: "csr",
  estimator: "estimator",
  bim: "bim",
  technical_manager: "chief_estimator",
  bim_manager: "bim_manager",
  manager: "admin",
  accounts: "accounts",
};

function mineDepartment(role: string, chiefDashboard: boolean): AttendanceDept | null {
  if (role === "admin") return chiefDashboard ? "chief_estimator" : null;
  return ROLE_DEPT[role] ?? null;
}

function wantsChiefDashboard(value: unknown): boolean {
  return value === "chief" || value === true;
}

function isRosterDept(value: string): value is RosterDept {
  return value === "dev" || value === "office_boy" || value === "hr" || value === "bim_modeler";
}

async function gateOffice(req: AuthRequest, department: string) {
  if (!departmentNeedsOfficeIp(department)) return null;
  return attendanceNetworkMessage(req);
}

function cleanComment(raw: unknown): string | null {
  if (raw == null) return null;
  const text = String(raw).trim().slice(0, 500);
  return text || null;
}

function historyDayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, (m || 1) - 1, d || 1)));
}

function historyClock(time: string | null | undefined): string | null {
  if (!time) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${match[2]} ${suffix}`;
}

function toHistoryDays(
  rows: { day: string; checkIn: string | null; checkOut: string | null }[],
  evening = false,
  shiftStart = EVENING_SHIFT_START,
) {
  return rows
    .filter((row): row is { day: string; checkIn: string; checkOut: string | null } => !!row.checkIn)
    .map((row) => {
      if (!evening) {
        const overnight = isOvernightShift(row.checkIn, row.checkOut);
        const checkOutDay = overnight ? addCalendarDays(row.day, 1) : null;
        return {
          day: row.day,
          dayLabel: historyDayLabel(row.day),
          checkIn: historyClock(row.checkIn) ?? "—",
          checkOut: historyClock(row.checkOut),
          overnight,
          checkOutLabel: checkOutDay ? historyDayLabel(checkOutDay) : null,
          checkInLabel: null as string | null,
        };
      }
      const inNext = row.checkIn < shiftStart;
      const outNext = !!row.checkOut && row.checkOut < shiftStart;
      const checkInDay = inNext ? addCalendarDays(row.day, 1) : row.day;
      const checkOutDay = row.checkOut ? (outNext ? addCalendarDays(row.day, 1) : row.day) : null;
      return {
        day: row.day,
        dayLabel: historyDayLabel(row.day),
        checkIn: historyClock(row.checkIn) ?? "—",
        checkOut: historyClock(row.checkOut),
        overnight: !!checkOutDay && checkOutDay !== row.day,
        checkOutLabel: checkOutDay && checkOutDay !== row.day ? historyDayLabel(checkOutDay) : null,
        checkInLabel: inNext ? historyDayLabel(checkInDay) : null,
      };
    });
}

function dayClock(department: string, personKey = "") {
  const now = pktNow();
  return { day: pktShiftDay(new Date(), department, personKey), time: now.time };
}

/** Checkout the open shift: today, or yesterday when the shift runs past midnight. */
async function punchShift(input: {
  personKey: string;
  personName: string;
  department: AttendanceDept;
  action: "in" | "out";
  userId?: string | null;
  comment?: string | null;
}) {
  const now = dayClock(input.department, input.personKey);
  if (input.action === "in") {
    return saveAttendance({
      personKey: input.personKey,
      personName: input.personName,
      department: input.department,
      day: now.day,
      checkIn: now.time,
      userId: input.userId,
      ...(input.comment !== undefined ? { comment: input.comment } : {}),
    });
  }
  const today = await prisma.staffDayAttendance.findUnique({
    where: { personKey_day: { personKey: input.personKey, day: now.day } },
  });
  if (today?.checkIn && !today.checkOut) {
    return saveAttendance({
      personKey: input.personKey,
      personName: input.personName,
      department: input.department,
      day: now.day,
      checkOut: now.time,
      userId: input.userId,
      ...(input.comment !== undefined ? { comment: input.comment } : {}),
    });
  }
  const yesterday = addCalendarDays(now.day, -1);
  const prev = await prisma.staffDayAttendance.findUnique({
    where: { personKey_day: { personKey: input.personKey, day: yesterday } },
  });
  if (prev?.checkIn && !prev.checkOut) {
    return saveAttendance({
      personKey: input.personKey,
      personName: prev.personName || input.personName,
      department: input.department,
      day: yesterday,
      checkOut: now.time,
      userId: input.userId,
      ...(input.comment !== undefined ? { comment: input.comment } : {}),
    });
  }
  if (today?.checkOut) {
    return { ok: false as const, message: "Already checked out." };
  }
  return { ok: false as const, message: "Check in first." };
}

router.get("/roster", async (_req, res) => {
  const now = pktNow();
  return res.json({ success: true, today: now.day, now: now.time, departments: publicRoster() });
});

router.get("/history", async (req, res) => {
  try {
    const department = String(req.query.department ?? "");
    const personKey = String(req.query.personKey ?? "");
    if (!isRosterDept(department)) {
      return res.status(400).json({ success: false, message: "Unknown department." });
    }
    const person = rosterPerson(department, personKey);
    if (!person) return res.status(400).json({ success: false, message: "Unknown person." });
    const blocked = await gateOffice(req, department);
    if (blocked) {
      return res.status(403).json({ success: false, code: "IP_NOT_ALLOWED", message: blocked });
    }
    const rows = await prisma.staffDayAttendance.findMany({
      where: { personKey: person.key, department, day: { gte: employeeHistoryStart() } },
      orderBy: { day: "desc" },
    });
    const window = attendanceShift(department, person.key);
    return res.json({ success: true, days: toHistoryDays(rows, window.overnight, window.start) });
  } catch (error) {
    console.error("[attendance/history]", error);
    return res.status(500).json({ success: false, message: "Could not load history." });
  }
});

router.get("/day", async (req, res) => {
  try {
    const department = String(req.query.department ?? "");
    const day = String(req.query.day ?? dayClock(department).day);
    if (!isRosterDept(department)) {
      return res.status(400).json({ success: false, message: "Unknown department." });
    }
    if (!isValidDay(day)) {
      return res.status(400).json({ success: false, message: "Invalid date." });
    }
    const blocked = await gateOffice(req, department);
    if (blocked) {
      return res.status(403).json({ success: false, code: "IP_NOT_ALLOWED", message: blocked });
    }
    const rows = await prisma.staffDayAttendance.findMany({
      where: { department, day },
      orderBy: { personName: "asc" },
    });
    const seen = new Set(rows.map((row) => row.personKey));
    const previous = await prisma.staffDayAttendance.findMany({
      where: { department, day: addCalendarDays(day, -1) },
    });
    const openOvernight = previous.filter((row) => row.checkIn && !row.checkOut && !seen.has(row.personKey));
    return res.json({
      success: true,
      day,
      people: publicRoster()[department].people,
      rows: [...rows, ...openOvernight].map(toPublic),
    });
  } catch (error) {
    console.error("[attendance/day]", error);
    return res.status(500).json({ success: false, message: "Could not load attendance." });
  }
});

router.post("/punch", async (req, res) => {
  try {
    const department = String(req.body?.department ?? "");
    const personKey = String(req.body?.personKey ?? "");
    const action = String(req.body?.action ?? "");
    if (!isRosterDept(department)) {
      return res.status(400).json({ success: false, message: "Unknown department." });
    }
    const person = rosterPerson(department, personKey);
    if (!person) return res.status(400).json({ success: false, message: "Unknown person." });
    if (action !== "in" && action !== "out") {
      return res.status(400).json({ success: false, message: "Choose check-in or check-out." });
    }
    const blocked = await gateOffice(req, department);
    if (blocked) {
      return res.status(403).json({ success: false, code: "IP_NOT_ALLOWED", message: blocked });
    }
    const comment = req.body?.comment !== undefined ? cleanComment(req.body.comment) : undefined;
    const saved = await punchShift({
      personKey: person.key,
      personName: person.name,
      department,
      action,
      comment,
    });
    if (!saved.ok) return res.status(400).json({ success: false, message: saved.message });
    if (action === "out" && (department === "dev" || department === "bim_modeler")) {
      const overtime = cleanComment(req.body?.overtimeComment);
      if (overtime && saved.row?.day) {
        await saveOvertimeComment({
          personKey: person.key,
          personName: person.name,
          department,
          day: saved.row.day,
          comment: overtime,
        });
      }
    }
    return res.json({
      success: true,
      message: action === "in" ? "Checked in." : "Checked out.",
      row: saved.row,
    });
  } catch (error) {
    console.error("[attendance/punch]", error);
    return res.status(500).json({ success: false, message: "Could not save time." });
  }
});

router.post("/note", async (req, res) => {
  try {
    const department = String(req.body?.department ?? "");
    const personKey = String(req.body?.personKey ?? "");
    if (!isRosterDept(department)) {
      return res.status(400).json({ success: false, message: "Unknown department." });
    }
    const person = rosterPerson(department, personKey);
    if (!person) return res.status(400).json({ success: false, message: "Unknown person." });
    const blocked = await gateOffice(req, department);
    if (blocked) {
      return res.status(403).json({ success: false, code: "IP_NOT_ALLOWED", message: blocked });
    }
    const now = dayClock(department, person.key);
    const today = await prisma.staffDayAttendance.findUnique({
      where: { personKey_day: { personKey: person.key, day: now.day } },
    });
    let day = now.day;
    if (!today?.checkIn) {
      const yesterday = addCalendarDays(now.day, -1);
      const prev = await prisma.staffDayAttendance.findUnique({
        where: { personKey_day: { personKey: person.key, day: yesterday } },
      });
      if (prev?.checkIn && !prev.checkOut) day = yesterday;
    }
    const saved = await saveAttendance({
      personKey: person.key,
      personName: person.name,
      department,
      day,
      comment: cleanComment(req.body?.comment),
    });
    if (!saved.ok) return res.status(400).json({ success: false, message: saved.message });
    return res.json({ success: true, message: "Comment saved.", row: saved.row });
  } catch (error) {
    console.error("[attendance/note]", error);
    return res.status(500).json({ success: false, message: "Could not save comment." });
  }
});

router.post("/times", async (req, res) => {
  try {
    const department = String(req.body?.department ?? "");
    const personKey = String(req.body?.personKey ?? "");
    const day = String(req.body?.day ?? "");
    const checkIn = String(req.body?.checkIn ?? "").trim();
    const checkOutRaw = String(req.body?.checkOut ?? "").trim();
    if (!isRosterDept(department)) {
      return res.status(400).json({ success: false, message: "Unknown department." });
    }
    const person = rosterPerson(department, personKey);
    if (!person) return res.status(400).json({ success: false, message: "Unknown person." });
    if (!isValidDay(day)) return res.status(400).json({ success: false, message: "Invalid date." });
    if (!isValidTime(checkIn)) return res.status(400).json({ success: false, message: "Enter a check-in time." });
    const checkOut = checkOutRaw ? checkOutRaw : null;
    if (checkOut && !isValidTime(checkOut)) {
      return res.status(400).json({ success: false, message: "Enter a valid check-out time." });
    }
    const blocked = await gateOffice(req, department);
    if (blocked) {
      return res.status(403).json({ success: false, code: "IP_NOT_ALLOWED", message: blocked });
    }
    const saved = await saveAttendance({
      personKey: person.key,
      personName: person.name,
      department,
      day,
      checkIn,
      checkOut,
    });
    if (!saved.ok) return res.status(400).json({ success: false, message: saved.message });
    return res.json({ success: true, message: "Time saved.", row: saved.row });
  } catch (error) {
    console.error("[attendance/times]", error);
    return res.status(500).json({ success: false, message: "Could not save time." });
  }
});

router.get("/mine/history", verifyToken, allowRoles("technical_manager", "admin", "manager", "accounts"), async (req: AuthRequest, res) => {
  try {
    const rows = await prisma.staffDayAttendance.findMany({
      where: { personKey: req.user!.id, day: { gte: employeeHistoryStart() } },
      orderBy: { day: "desc" },
    });
    const evening = req.user?.role === "manager" || req.user?.role === "accounts";
    return res.json({ success: true, days: toHistoryDays(rows, evening) });
  } catch (error) {
    console.error("[attendance/mine/history]", error);
    return res.status(500).json({ success: false, message: "Could not load history." });
  }
});

router.get("/mine", verifyToken, allowRoles("technical_manager", "admin", "manager", "accounts"), async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } });
    const department = mineDepartment(req.user!.role, wantsChiefDashboard(req.query.dashboard));
    if (!department) return res.status(403).json({ success: false, message: "Access denied" });
    const day = dayClock(department, req.user!.id).day;
    let row = await prisma.staffDayAttendance.findUnique({
      where: { personKey_day: { personKey: req.user!.id, day } },
    });
    if (!row?.checkIn) {
      const prev = await prisma.staffDayAttendance.findUnique({
        where: { personKey_day: { personKey: req.user!.id, day: addCalendarDays(day, -1) } },
      });
      if (prev?.checkIn && !prev.checkOut) row = prev;
    }
    return res.json({
      success: true,
      day,
      department,
      name: user?.name ?? "",
      row: row ? toPublic(row) : null,
    });
  } catch (error) {
    console.error("[attendance/mine]", error);
    return res.status(500).json({ success: false, message: "Could not load today's time." });
  }
});

router.post("/mine/punch", verifyToken, allowRoles("technical_manager", "admin", "manager", "accounts"), async (req: AuthRequest, res) => {
  try {
    const action = String(req.body?.action ?? "");
    if (action !== "in" && action !== "out") {
      return res.status(400).json({ success: false, message: "Choose check-in or check-out." });
    }
    const department = mineDepartment(req.user!.role, wantsChiefDashboard(req.body?.dashboard));
    if (!department) return res.status(403).json({ success: false, message: "Access denied" });
    if (department === "admin") {
      const blocked = await officeNetworkMessage(req);
      if (blocked) {
        return res.status(403).json({ success: false, code: "IP_NOT_ALLOWED", message: blocked });
      }
    }
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } });
    const comment = req.body?.comment !== undefined ? cleanComment(req.body.comment) : undefined;
    const saved = await punchShift({
      personKey: req.user!.id,
      personName: user?.name || "Staff",
      department,
      action,
      userId: req.user!.id,
      comment,
    });
    if (!saved.ok) return res.status(400).json({ success: false, message: saved.message });
    if (action === "out" && department === "chief_estimator") {
      const overtime = cleanComment(req.body?.overtimeComment);
      if (overtime && saved.row?.day) {
        await saveOvertimeComment({
          personKey: req.user!.id,
          personName: user?.name || "Chief Estimator",
          department: "chief_estimator",
          day: saved.row.day,
          comment: overtime,
        });
      }
    }
    return res.json({
      success: true,
      message: action === "in" ? "Checked in." : "Checked out.",
      row: saved.row,
    });
  } catch (error) {
    console.error("[attendance/mine/punch]", error);
    return res.status(500).json({ success: false, message: "Could not save time." });
  }
});

router.get("/report", verifyToken, allowRoles("admin", "manager", "technical_manager"), async (req: AuthRequest, res) => {
  try {
    const from = String(req.query.from ?? "");
    const to = String(req.query.to ?? "");
    const today = pktNow().day;
    const start = isValidDay(from) ? from : today;
    const end = isValidDay(to) ? to : today;
    const deskRole = req.user?.role === "bim_manager" ? "bim" as const : "estimator" as const;
    const estimators = await listEstimatorShiftRows(deskRole);
    if (req.user?.role === "technical_manager" || req.user?.role === "bim_manager") {
      const ownDepartment = req.user.role === "bim_manager" ? "bim_manager" : "chief_estimator";
      const own = await prisma.staffDayAttendance.findMany({
        where: { department: ownDepartment, day: { gte: start, lte: end } },
        orderBy: [{ day: "desc" }, { personName: "asc" }],
      });
      const notes = await prisma.overtimeRequest.findMany({
        where: { department: ownDepartment, day: { gte: start, lte: end } },
      });
      const byKey = new Map(notes.map((note) => [`${note.department}:${note.personKey}:${note.day}`, note]));
      return res.json({
        success: true,
        from: start,
        to: end,
        rows: own.map((row) => ({
          ...toPublic(row),
          ...overtimePublic(byKey.get(`${row.department}:${row.personKey}:${row.day}`)),
        })),
        estimators,
      });
    }
    const rows = await prisma.staffDayAttendance.findMany({
      where: { day: { gte: start, lte: end } },
      orderBy: [{ day: "desc" }, { department: "asc" }, { personName: "asc" }],
    });
    const notes = await prisma.overtimeRequest.findMany({
      where: { department: { in: ["dev", "chief_estimator", "bim_modeler"] }, day: { gte: start, lte: end } },
    });
    const byKey = new Map(notes.map((note) => [`${note.department}:${note.personKey}:${note.day}`, note]));
    const seedUsers = await prisma.user.findMany({
      where: { email: { in: SEED_USER_EMAILS } },
      select: { id: true },
    });
    const seedIds = new Set(seedUsers.map((user) => user.id));
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ["technical_manager", "bim_manager", "manager", "accounts"] },
        email: { notIn: SEED_USER_EMAILS },
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
    const roleDept: Record<string, string> = {
      technical_manager: "chief_estimator",
      bim_manager: "bim_manager",
      manager: "admin",
      accounts: "accounts",
    };
    const people = [
      ...(["dev", "office_boy", "hr", "bim_modeler"] as const).flatMap((department) =>
        DEPT_ROSTER[department].map((person) => ({
          department,
          personKey: person.key,
          personName: person.name,
        })),
      ),
      ...users.flatMap((user) => {
        const department = roleDept[user.role];
        return department ? [{ department, personKey: user.id, personName: user.name }] : [];
      }),
    ];
    return res.json({
      success: true,
      from: start,
      to: end,
      rows: rows.filter((row) => !seedIds.has(row.personKey)).map((row) => ({
        ...toPublic(row),
        ...overtimePublic(byKey.get(`${row.department}:${row.personKey}:${row.day}`)),
      })),
      estimators,
      people,
    });
  } catch (error) {
    console.error("[attendance/report]", error);
    return res.status(500).json({ success: false, message: "Could not load attendance report." });
  }
});

router.get("/overtime/gate", verifyToken, allowRoles("estimator", "technical_manager", "admin"), async (req: AuthRequest, res) => {
  try {
    const role = req.user!.role === "admin" ? "technical_manager" : req.user!.role;
    const gate = await overtimeGate(req.user!.id, role);
    return res.json({ success: true, ...gate });
  } catch (error) {
    console.error("[attendance/overtime/gate]", error);
    return res.status(500).json({ success: false, message: "Could not check overtime." });
  }
});

router.post("/overtime", verifyToken, allowRoles("estimator", "technical_manager", "admin"), async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } });
    const result = await submitShiftOvertime({
      userId: req.user!.id,
      role: req.user!.role === "admin" ? "technical_manager" : req.user!.role,
      name: user?.name || "Staff",
      minutes: Number(req.body?.minutes),
    });
    if (!result.ok) return res.status(400).json({ success: false, message: result.message });
    return res.json({ success: true, message: "Overtime sent.", ...overtimePublic(result.note) });
  } catch (error) {
    console.error("[attendance/overtime submit]", error);
    return res.status(500).json({ success: false, message: "Could not send overtime." });
  }
});

router.get("/overtime", verifyToken, allowRoles("admin", "manager", "technical_manager"), async (req, res) => {
  try {
    const from = isValidDay(String(req.query.from ?? "")) ? String(req.query.from) : "2000-01-01";
    const to = isValidDay(String(req.query.to ?? "")) ? String(req.query.to) : "2100-01-01";
    const rows = await prisma.overtimeRequest.findMany({
      where: { department: { in: ["estimator", "chief_estimator"] }, day: { gte: from, lte: to } },
      orderBy: { createdAt: "desc" },
    });
    return res.json({
      success: true,
      overtime: rows.map((row) => ({
        id: row.id,
        personKey: row.personKey,
        personName: row.personName,
        department: row.department,
        day: row.day,
        comment: row.comment,
        status: row.status,
        editedBy: row.editedBy,
      })),
    });
  } catch (error) {
    console.error("[attendance/overtime list]", error);
    return res.status(500).json({ success: false, message: "Could not load overtime." });
  }
});

router.put("/overtime/:id", verifyToken, allowRoles("admin", "technical_manager"), async (req: AuthRequest, res) => {
  try {
    const action = String(req.body?.action ?? "");
    if (action !== "approve" && action !== "decline" && action !== "edit") {
      return res.status(400).json({ success: false, message: "Choose approve, decline, or edit." });
    }
    const result = await reviewOvertime({
      id: String(req.params.id ?? ""),
      role: req.user?.role ?? "",
      action,
      comment: req.body?.comment,
      minutes: req.body?.minutes == null ? undefined : Number(req.body.minutes),
    });
    if (!result.ok) return res.status(400).json({ success: false, message: result.message });
    return res.json({ success: true, ...overtimePublic(result.note) });
  } catch (error) {
    console.error("[attendance/overtime]", error);
    return res.status(500).json({ success: false, message: "Could not update overtime." });
  }
});

router.post("/requests", verifyToken, allowRoles("csr", "estimator", "manager", "accounts", "technical_manager", "admin"), async (req: AuthRequest, res) => {
  try {
    const department = req.user!.role === "admin"
      ? (wantsChiefDashboard(req.body?.dashboard) ? "chief_estimator" : "")
      : REQUEST_ROLE_DEPT[req.user!.role];
    if (!department) return res.status(403).json({ success: false, message: "Requests are not available for this account." });
    const parsed = parseRequestDraft((req.body ?? {}) as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ success: false, message: parsed.message });
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } });
    const row = await prisma.staffRequest.create({
      data: {
        personKey: req.user!.id,
        personName: user?.name || "Staff",
        department,
        userId: req.user!.id,
        ...parsed.draft,
      },
    });
    return res.json({ success: true, message: "Request sent.", request: toPublicRequest(row) });
  } catch (error) {
    console.error("[attendance/requests]", error);
    return res.status(500).json({ success: false, message: "Could not send the request." });
  }
});

router.post("/requests/public", async (req, res) => {
  try {
    const department = String(req.body?.department ?? "");
    const personKey = String(req.body?.personKey ?? "");
    if (!isRosterDept(department)) {
      return res.status(400).json({ success: false, message: "Unknown department." });
    }
    const person = rosterPerson(department, personKey);
    if (!person) return res.status(400).json({ success: false, message: "Unknown person." });
    const blocked = await gateOffice(req, department);
    if (blocked) return res.status(403).json({ success: false, code: "IP_NOT_ALLOWED", message: blocked });
    const parsed = parseRequestDraft((req.body ?? {}) as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ success: false, message: parsed.message });
    const row = await prisma.staffRequest.create({
      data: {
        personKey: person.key,
        personName: person.name,
        department,
        ...parsed.draft,
      },
    });
    return res.json({ success: true, message: "Request sent.", request: toPublicRequest(row) });
  } catch (error) {
    console.error("[attendance/requests/public]", error);
    return res.status(500).json({ success: false, message: "Could not send the request." });
  }
});

router.get("/requests", verifyToken, allowRoles("admin", "manager"), async (req, res) => {
  try {
    const from = isValidDay(String(req.query.from ?? "")) ? String(req.query.from) : "2000-01-01";
    const to = isValidDay(String(req.query.to ?? "")) ? String(req.query.to) : "2100-01-01";
    const rows = await prisma.staffRequest.findMany({
      where: { day: { gte: from, lte: to } },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ success: true, requests: rows.map(toPublicRequest) });
  } catch (error) {
    console.error("[attendance/requests list]", error);
    return res.status(500).json({ success: false, message: "Could not load requests." });
  }
});

router.post("/requests/:id/review", verifyToken, allowRoles("admin"), async (req, res) => {
  try {
    const id = String(req.params.id ?? "");
    const action = String(req.body?.action ?? "");
    if (action !== "approve" && action !== "decline") {
      return res.status(400).json({ success: false, message: "Choose approve or decline." });
    }
    const existing = await prisma.staffRequest.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: "Request not found." });
    if (existing.status !== "pending") {
      return res.status(400).json({ success: false, message: "This request is already reviewed." });
    }
    if (action === "approve") {
      const applied = await applyApprovedRequest(existing);
      if (!applied.ok) return res.status(400).json({ success: false, message: applied.message });
    }
    const row = await prisma.staffRequest.update({
      where: { id },
      data: { status: action === "approve" ? "approved" : "declined", reviewedBy: "CEO" },
    });
    return res.json({
      success: true,
      message: action === "approve" ? "Approved." : "Declined.",
      request: toPublicRequest(row),
    });
  } catch (error) {
    console.error("[attendance/requests review]", error);
    return res.status(500).json({ success: false, message: "Could not review the request." });
  }
});

router.post("/report/:id/reset", verifyToken, allowRoles("admin"), async (req, res) => {
  try {
    const id = String(req.params.id ?? "");
    const existing = await prisma.staffDayAttendance.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: "Record not found." });
    const row = await prisma.staffDayAttendance.update({
      where: { id },
      data: { checkIn: null, checkOut: null },
    });
    return res.json({ success: true, message: "Time reset. Check-in and check-out are clear for this day.", row: toPublic(row) });
  } catch (error) {
    console.error("[attendance/report reset]", error);
    return res.status(500).json({ success: false, message: "Could not reset time." });
  }
});

router.put("/report/:id", verifyToken, allowRoles("admin"), async (req, res) => {
  try {
    const id = String(req.params.id ?? "");
    const day = String(req.body?.day ?? "");
    const checkIn = String(req.body?.checkIn ?? "").trim();
    const checkOutRaw = req.body?.checkOut;
    const checkOut = checkOutRaw == null || String(checkOutRaw).trim() === "" ? null : String(checkOutRaw).trim();
    if (!isValidDay(day)) return res.status(400).json({ success: false, message: "Invalid date." });
    if (!isValidTime(checkIn)) return res.status(400).json({ success: false, message: "Enter a check-in time." });
    if (checkOut && !isValidTime(checkOut)) {
      return res.status(400).json({ success: false, message: "Enter a valid check-out time." });
    }
    if (!timeOrderOk(checkIn, checkOut)) {
      return res.status(400).json({ success: false, message: "Check-out must be after check-in." });
    }
    const existing = await prisma.staffDayAttendance.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: "Record not found." });
    if (day !== existing.day) {
      const clash = await prisma.staffDayAttendance.findUnique({
        where: { personKey_day: { personKey: existing.personKey, day } },
      });
      if (clash && clash.id !== existing.id) {
        return res.status(400).json({ success: false, message: "That date already has a check-in for this person." });
      }
    }
    const row = await prisma.staffDayAttendance.update({
      where: { id },
      data: { day, checkIn, checkOut },
    });
    return res.json({ success: true, row: toPublic(row) });
  } catch (error) {
    console.error("[attendance/report update]", error);
    return res.status(500).json({ success: false, message: "Could not save time." });
  }
});

router.get("/revise/:token", async (req, res) => {
  if (String(req.params.token) !== ATTENDANCE_REVISE_TOKEN) {
    return res.status(404).json({ success: false, message: "Not found." });
  }
  try {
    const day = String(req.query.day ?? pktNow().day);
    if (!isValidDay(day)) return res.status(400).json({ success: false, message: "Invalid date." });
    const rows = await prisma.staffDayAttendance.findMany({
      where: { day, department: { in: ["dev", "chief_estimator"] } },
      orderBy: [{ department: "asc" }, { personName: "asc" }],
    });
    const chiefs = await prisma.user.findMany({
      where: { role: "technical_manager", isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const ayesha = chiefs.find((c) => c.name.trim().toLowerCase() === CHIEF_ESTIMATOR_NAME.toLowerCase());
    return res.json({
      success: true,
      day,
      dev: publicRoster().dev.people,
      chiefs: ayesha ? [{ key: ayesha.id, name: CHIEF_ESTIMATOR_NAME }] : [],
      rows: rows.map(toPublic),
    });
  } catch (error) {
    console.error("[attendance/revise]", error);
    return res.status(500).json({ success: false, message: "Could not load times." });
  }
});

router.post("/revise/:token", async (req, res) => {
  if (String(req.params.token) !== ATTENDANCE_REVISE_TOKEN) {
    return res.status(404).json({ success: false, message: "Not found." });
  }
  try {
    const department = String(req.body?.department ?? "");
    const personKey = String(req.body?.personKey ?? "");
    const personName = String(req.body?.personName ?? "").trim();
    const day = String(req.body?.day ?? "");
    const checkIn = String(req.body?.checkIn ?? "").trim();
    const checkOutRaw = String(req.body?.checkOut ?? "").trim();
    if (department !== "dev" && department !== "chief_estimator") {
      return res.status(400).json({ success: false, message: "This time cannot be changed here." });
    }
    if (!personKey || !personName) {
      return res.status(400).json({ success: false, message: "Choose a person." });
    }
    if (department === "dev" && !rosterPerson("dev", personKey)) {
      return res.status(400).json({ success: false, message: "Unknown person." });
    }
    if (department === "chief_estimator" && personName.trim().toLowerCase() !== CHIEF_ESTIMATOR_NAME.toLowerCase()) {
      return res.status(400).json({ success: false, message: "Unknown person." });
    }
    if (!isValidDay(day)) return res.status(400).json({ success: false, message: "Invalid date." });
    if (!isValidTime(checkIn)) return res.status(400).json({ success: false, message: "Enter a check-in time." });
    const checkOut = checkOutRaw ? checkOutRaw : null;
    if (checkOut && !isValidTime(checkOut)) {
      return res.status(400).json({ success: false, message: "Enter a valid check-out time." });
    }
    const saved = await saveAttendance({
      personKey,
      personName,
      department,
      day,
      checkIn,
      checkOut,
      userId: department === "chief_estimator" ? personKey : null,
    });
    if (!saved.ok) return res.status(400).json({ success: false, message: saved.message });
    return res.json({ success: true, message: "Time saved.", row: saved.row });
  } catch (error) {
    console.error("[attendance/revise]", error);
    return res.status(500).json({ success: false, message: "Could not save time." });
  }
});

export default router;
