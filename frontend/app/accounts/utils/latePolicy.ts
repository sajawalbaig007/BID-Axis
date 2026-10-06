export const PAY_PARTS = ["basic", "commission", "overtime", "allowance"] as const;
export type PayPart = (typeof PAY_PARTS)[number];
export type LateRange = { from: string; to: string; percent: number };
export type LatePolicy = { components: PayPart[]; ranges: LateRange[] };
export type PayAmounts = Record<PayPart, number>;

export type PersonPayload = {
  personKey: string;
  personName?: string;
  components?: string[];
  ranges?: LateRange[];
  saved?: boolean;
  carriedFrom?: string | null;
};

export type DeptPayload = {
  department: string;
  components?: string[];
  ranges?: LateRange[];
  employees?: PersonPayload[];
};

export type LatePersonRef = { personKey?: string; personName?: string };

type Published = {
  month: string;
  byDept: Record<string, LatePolicy>;
  people: { department: string; personKey: string; personName: string; policy: LatePolicy }[];
};

let published: Published = { month: "", byDept: {}, people: [] };

function tokens(label: string): string[] {
  return label.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function namesMatch(a: string, b: string): boolean {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.length || !right.length) return false;
  if (left.join(" ") === right.join(" ")) return true;
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  return short.every((token, index) => long[index] === token);
}

function isPart(value: string): value is PayPart {
  return (PAY_PARTS as readonly string[]).includes(value);
}

function asPolicy(components: string[] | undefined, ranges: LateRange[] | undefined): LatePolicy | null {
  const parts = (components ?? []).filter(isPart);
  const kept = (ranges ?? []).filter((range) => range.from);
  if (!parts.length || !kept.length) return null;
  return { components: parts, ranges: kept };
}

export function publishLatePolicies(month: string, departments: DeptPayload[]) {
  const byDept: Record<string, LatePolicy> = {};
  const people: Published["people"] = [];
  for (const dept of departments) {
    const policy = asPolicy(dept.components, dept.ranges);
    if (policy) byDept[dept.department] = policy;
    for (const person of dept.employees ?? []) {
      if (!person.personKey || (!person.saved && !person.carriedFrom)) continue;
      const own = asPolicy(person.components, person.ranges);
      if (!own) continue;
      people.push({
        department: dept.department,
        personKey: person.personKey,
        personName: person.personName || "",
        policy: own,
      });
    }
  }
  published = { month, byDept, people };
}

function personPolicy(person?: LatePersonRef, department?: string): LatePolicy | null {
  if (!person) return null;
  const prefer = (row: Published["people"][number]) => !department || row.department === department;
  if (person.personKey) {
    const own = published.people.find((row) => row.personKey === person.personKey && prefer(row))
      ?? published.people.find((row) => row.personKey === person.personKey);
    if (own) return own.policy;
  }
  if (person.personName) {
    const named = published.people.find((row) => namesMatch(row.personName, person.personName || "") && prefer(row))
      ?? published.people.find((row) => namesMatch(row.personName, person.personName || ""));
    if (named) return named.policy;
  }
  return null;
}

export function readLatePolicy(department: string, person?: LatePersonRef): LatePolicy | null {
  return personPolicy(person, department) ?? published.byDept[department] ?? null;
}

function minutesOf(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
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

export function deductionFromPolicy(
  checkIn: string,
  policy: LatePolicy,
  amounts: PayAmounts,
): { amount: number; rule: string } {
  const hits = policy.ranges.filter((range) => rangeHolds(checkIn, range));
  const perDay = policy.components.reduce((sum, part) => sum + (Number(amounts[part]) || 0), 0) / 30;
  if (!hits.length) return { amount: 0, rule: "Check-in is outside the deduction ranges" };
  hits.sort((a, b) => {
    if (!a.to !== !b.to) return a.to ? -1 : 1;
    return (minutesOf(b.from) ?? 0) - (minutesOf(a.from) ?? 0);
  });
  const hit = hits[0];
  const amount = perDay * (Number(hit.percent) || 0) / 100;
  return { amount, rule: `${hit.from}–${hit.to || "onwards"} → ${hit.percent}% of per day` };
}

/** CEO ranges replace the old late slabs when this department has a saved policy. */
/** Employee ranges only. No department fallback. */
export function lateFromEmployee(
  department: string,
  checkIn: string,
  amounts: PayAmounts,
  person?: LatePersonRef,
): { amount: number; rule: string } | null {
  const policy = personPolicy(person, department);
  if (!policy) return null;
  return deductionFromPolicy(checkIn, policy, amounts);
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

/**
 * Sum the month. A day with neither check-in nor check-out costs that day’s pay.
 * A day with a check-in uses the range that time falls in.
 */
export function monthLateFromPolicy(
  department: string,
  amounts: PayAmounts,
  person: LatePersonRef | undefined,
  days: AttendanceDay[] | undefined,
  month: string,
  fallbackCheckIn = "",
): { amount: number; rule: string } | null {
  const policy = readLatePolicy(department, person);
  if (!policy) return null;
  if (!days || !month) return deductionFromPolicy(fallbackCheckIn, policy, amounts);
  const perDay = policy.components.reduce((sum, part) => sum + (Number(amounts[part]) || 0), 0) / 30;
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
    const hit = policy.ranges.filter((range) => rangeHolds(checkIn, range));
    if (!hit.length) continue;
    hit.sort((a, b) => {
      if (!a.to !== !b.to) return a.to ? -1 : 1;
      return (minutesOf(b.from) ?? 0) - (minutesOf(a.from) ?? 0);
    });
    amount += (perDay * (Number(hit[0].percent) || 0)) / 100;
    lateDays += 1;
  }
  const notes: string[] = [];
  if (missed) notes.push(`${missed} day${missed === 1 ? "" : "s"} with no check-in or check-out`);
  if (lateDays) notes.push(`${lateDays} late day${lateDays === 1 ? "" : "s"}`);
  return { amount, rule: notes.join(", ") || "No deduction for this month" };
}

export function lateFromPolicy(
  department: string,
  checkIn: string,
  amounts: PayAmounts,
  person?: LatePersonRef,
): { amount: number; rule: string } | null {
  const policy = readLatePolicy(department, person);
  if (!policy) return null;
  return deductionFromPolicy(checkIn, policy, amounts);
}
