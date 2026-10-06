import prisma from "../config/db";
import { SEED_USER_EMAILS } from "../constants/seedUsers";
import { DEPT_ROSTER } from "./staffAttendance";
import { SHIFT_DEPARTMENTS } from "./shiftSchedule";

export const PAY_PARTS = ["basic", "commission", "overtime", "allowance"] as const;
export type PayPart = (typeof PAY_PARTS)[number];

export type LateRange = { from: string; to: string; percent: number };
export type LatePolicy = { components: PayPart[]; ranges: LateRange[] };
export type PayAmounts = Record<PayPart, number>;

type StoredPolicy = LatePolicy & { month: string; department: string; personKey: string; personName: string };

export type LatePersonRef = { personKey?: string; personName?: string };

let rows: StoredPolicy[] = [];

function asParts(value: unknown): PayPart[] {
  if (!Array.isArray(value)) return [];
  return value.filter((part): part is PayPart => PAY_PARTS.includes(part as PayPart));
}

function asRanges(value: unknown): LateRange[] {
  if (!Array.isArray(value)) return [];
  const ranges: LateRange[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const from = String((row as { from?: unknown }).from ?? "").trim();
    const to = String((row as { to?: unknown }).to ?? "").trim();
    const percent = Number((row as { percent?: unknown }).percent);
    if (!validClock(from) || (to && !validClock(to)) || !Number.isFinite(percent)) continue;
    ranges.push({ from, to, percent: Math.min(100, Math.max(0, percent)) });
  }
  return ranges;
}

function validMonth(month: string) {
  return /^\d{4}-\d{2}$/.test(month);
}

function validClock(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function minutesOf(value: string): number | null {
  if (!validClock(value)) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function rangeHolds(checkIn: string, range: LateRange): boolean {
  const time = minutesOf(checkIn);
  const from = minutesOf(range.from);
  if (time == null || from == null) return false;
  const to = range.to ? minutesOf(range.to) : null;
  if (to == null) return time >= from;
  if (to > from) return time >= from && time < to;
  return time >= from || time < to;
}

/** First matching bounded range wins over an open-ended one. */
export function pickLateRange(checkIn: string, ranges: LateRange[]): LateRange | null {
  const hits = ranges.filter((range) => rangeHolds(checkIn, range));
  if (!hits.length) return null;
  hits.sort((a, b) => {
    if (!a.to !== !b.to) return a.to ? -1 : 1;
    return (minutesOf(b.from) ?? 0) - (minutesOf(a.from) ?? 0);
  });
  return hits[0];
}

export function perDayOf(amounts: PayAmounts, components: PayPart[]): number {
  return components.reduce((sum, part) => sum + (Number(amounts[part]) || 0), 0) / 30;
}

export function deductionFromPolicy(
  checkIn: string,
  policy: LatePolicy,
  amounts: PayAmounts,
): { amount: number; rule: string } {
  const hit = pickLateRange(checkIn, policy.ranges);
  const perDay = perDayOf(amounts, policy.components);
  if (!hit) return { amount: 0, rule: "Check-in is outside the deduction ranges" };
  const amount = perDay * hit.percent / 100;
  const end = hit.to || "onwards";
  return { amount, rule: `${hit.from}–${end} → ${hit.percent}% of per day` };
}

function nameTokens(label: string): string[] {
  return label.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function namesMatch(a: string, b: string): boolean {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (!left.length || !right.length) return false;
  if (left.join(" ") === right.join(" ")) return true;
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  return short.every((token, index) => long[index] === token);
}

function latest(department: string, month: string, personKey = ""): StoredPolicy | null {
  let best: StoredPolicy | null = null;
  for (const row of rows) {
    if (row.department !== department || row.personKey !== personKey || row.month > month) continue;
    if (!best || row.month > best.month) best = row;
  }
  return best;
}

function latestByName(department: string, month: string, personName: string): StoredPolicy | null {
  let best: StoredPolicy | null = null;
  for (const row of rows) {
    if ((department && row.department !== department) || !row.personKey || row.month > month) continue;
    if (!namesMatch(row.personName, personName)) continue;
    if (!best || row.month > best.month) best = row;
  }
  return best;
}

export function policyMonth(recordDate?: string | null): string {
  if (recordDate && /^\d{4}-\d{2}/.test(recordDate)) return recordDate.slice(0, 7);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function latestPerson(month: string, personKey: string): StoredPolicy | null {
  let best: StoredPolicy | null = null;
  for (const row of rows) {
    if (row.personKey !== personKey || row.month > month) continue;
    if (!best || row.month > best.month) best = row;
  }
  return best;
}

export type AttendanceDay = { day: string; checkIn?: string; checkOut?: string };

export function pktToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Calendar days in the pay month that have already started in Pakistan. */
export function elapsedMonthDays(month: string, today = pktToday()): string[] {
  if (!/^\d{4}-\d{2}$/.test(month) || today < `${month}-01`) return [];
  const [year, mon] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const days: string[] = [];
  for (let day = 1; day <= last; day++) {
    const ymd = `${month}-${String(day).padStart(2, "0")}`;
    if (ymd > today) break;
    days.push(ymd);
  }
  return days;
}

function policyFor(
  department: string,
  month: string,
  person?: LatePersonRef,
  employeeOnly = false,
): StoredPolicy | null {
  const own = person?.personKey
    ? latest(department, month, person.personKey) ?? latestPerson(month, person.personKey)
    : null;
  const named = !own && person?.personName
    ? latestByName(department, month, person.personName) ?? latestByName("", month, person.personName)
    : null;
  return own ?? named ?? (employeeOnly ? null : latest(department, month, ""));
}

export function lateAmountFor(
  department: string,
  month: string,
  checkIn: string,
  amounts: PayAmounts,
  person?: LatePersonRef,
  opts?: { employeeOnly?: boolean },
): { amount: number; rule: string } | null {
  const row = policyFor(department, month, person, opts?.employeeOnly);
  if (!row || !row.components.length || !row.ranges.length) return null;
  return deductionFromPolicy(checkIn, row, amounts);
}

/** Deduct the given days from the time ranges. A day with neither time costs that day’s pay. */
export function policyDeductionForDays(
  department: string,
  month: string,
  amounts: PayAmounts,
  punches: AttendanceDay[] | undefined,
  dayList: string[],
  person?: LatePersonRef,
): number | null {
  const row = policyFor(department, month, person);
  if (!row || !row.components.length || !row.ranges.length) return null;
  const perDay = perDayOf(amounts, row.components);
  const byDay = new Map((punches ?? []).filter((day) => day?.day).map((day) => [day.day, day]));
  let amount = 0;
  for (const day of dayList) {
    const punch = byDay.get(day);
    const checkIn = String(punch?.checkIn ?? "").trim();
    const checkOut = String(punch?.checkOut ?? "").trim();
    if (!checkIn && !checkOut) {
      amount += perDay;
      continue;
    }
    const hit = pickLateRange(checkIn, row.ranges);
    if (hit) amount += (perDay * hit.percent) / 100;
  }
  return amount;
}

export function monthLateAmountFor(
  department: string,
  month: string,
  amounts: PayAmounts,
  days: AttendanceDay[] | undefined,
  person?: LatePersonRef,
  fallbackCheckIn = "",
  opts?: { employeeOnly?: boolean },
): { amount: number; rule: string } | null {
  const row = policyFor(department, month, person, opts?.employeeOnly);
  if (!row || !row.components.length || !row.ranges.length) return null;
  if (!days) return deductionFromPolicy(fallbackCheckIn, row, amounts);
  const perDay = perDayOf(amounts, row.components);
  const byDay = new Map(days.filter((day) => day?.day).map((day) => [day.day, day]));
  let amount = 0;
  let missed = 0;
  let lateDays = 0;
  for (const day of elapsedMonthDays(month)) {
    const punch = byDay.get(day);
    const checkIn = String(punch?.checkIn ?? "").trim();
    const checkOut = String(punch?.checkOut ?? "").trim();
    if (!checkIn && !checkOut) {
      amount += perDay;
      missed += 1;
      continue;
    }
    const hit = pickLateRange(checkIn, row.ranges);
    if (!hit) continue;
    amount += (perDay * hit.percent) / 100;
    lateDays += 1;
  }
  const notes: string[] = [];
  if (missed) notes.push(`${missed} day${missed === 1 ? "" : "s"} with no check-in or check-out`);
  if (lateDays) notes.push(`${lateDays} late day${lateDays === 1 ? "" : "s"}`);
  return { amount, rule: notes.join(", ") || "No deduction for this month" };
}

export async function refreshLatePolicies() {
  await prisma.$runCommandRaw({
    update: "late_deduction_policies",
    updates: [
      {
        q: { personKey: { $exists: false } },
        u: { $set: { personKey: "", personName: "" } },
        multi: true,
      },
    ],
  }).catch(() => undefined);
  const found = await prisma.lateDeductionPolicy.findMany({
    select: { month: true, department: true, personKey: true, personName: true, components: true, ranges: true },
  });
  rows = found.map((row) => ({
    month: row.month,
    department: row.department,
    personKey: row.personKey || "",
    personName: row.personName || "",
    components: asParts(row.components),
    ranges: asRanges(row.ranges),
  }));
}

async function departmentPeople() {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ["csr", "estimator", "technical_manager", "manager", "accounts"] },
      email: { notIn: SEED_USER_EMAILS },
    },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  return SHIFT_DEPARTMENTS.map((dept) => {
    const roster = DEPT_ROSTER[dept.id as keyof typeof DEPT_ROSTER];
    const people = roster
      ? roster.map((person) => ({ personKey: person.key, personName: person.name }))
      : users.filter((user) => user.role === dept.role).map((user) => ({ personKey: user.id, personName: user.name }));
    return { department: dept.id, people };
  });
}

export async function listLatePolicies(month: string) {
  if (!validMonth(month)) return null;
  await refreshLatePolicies();
  const peopleByDept = await departmentPeople();
  const departments = SHIFT_DEPARTMENTS.map((dept) => {
    const saved = rows.find((row) => row.month === month && row.department === dept.id && row.personKey === "");
    const carried = latest(dept.id, month, "");
    const effective = saved ?? carried;
    const people = peopleByDept.find((item) => item.department === dept.id)?.people ?? [];
    return {
      department: dept.id,
      label: dept.label,
      components: effective?.components ?? [],
      ranges: effective?.ranges ?? [],
      saved: !!saved,
      carriedFrom: saved ? null : carried && carried.month !== month ? carried.month : null,
      employees: people.map((person) => {
        const own = rows.find((row) => row.month === month && row.department === dept.id && row.personKey === person.personKey);
        const personCarried = latest(dept.id, month, person.personKey);
        const personEffective = own ?? personCarried;
        return {
          personKey: person.personKey,
          personName: person.personName,
          components: personEffective?.components ?? effective?.components ?? [],
          ranges: personEffective?.ranges ?? effective?.ranges ?? [],
          saved: !!own,
          carriedFrom: own ? null : personCarried && personCarried.month !== month ? personCarried.month : null,
        };
      }),
    };
  });
  return { month, departments };
}

export async function saveLatePolicy(input: {
  month: string;
  department: string;
  personKey?: string;
  personName?: string;
  components: unknown;
  ranges: unknown;
  updatedBy: string;
}) {
  if (!validMonth(input.month)) return { ok: false as const, message: "Pick a month." };
  if (!SHIFT_DEPARTMENTS.some((dept) => dept.id === input.department)) {
    return { ok: false as const, message: "Unknown department." };
  }
  const personKey = (input.personKey ?? "").trim();
  const personName = (input.personName ?? "").trim();
  if (personKey && !personName) return { ok: false as const, message: "Choose an employee." };
  const components = asParts(input.components);
  const ranges = asRanges(input.ranges);
  if (!components.length) return { ok: false as const, message: "Select at least one pay part." };
  if (!ranges.length) return { ok: false as const, message: "Add at least one time range." };
  await prisma.lateDeductionPolicy.upsert({
    where: { month_department_personKey: { month: input.month, department: input.department, personKey } },
    create: {
      month: input.month,
      department: input.department,
      personKey,
      personName,
      components,
      ranges,
      updatedBy: input.updatedBy,
    },
    update: {
      personName,
      components,
      ranges,
      updatedBy: input.updatedBy,
    },
  });
  await refreshLatePolicies();
  return { ok: true as const };
}

export async function clearLatePolicy(month: string, department: string, personKey = "") {
  if (!validMonth(month)) return { ok: false as const, message: "Pick a month." };
  await prisma.lateDeductionPolicy.deleteMany({ where: { month, department, personKey } });
  await refreshLatePolicies();
  return { ok: true as const };
}
