import {
  computeTechnicalSalary,
  emptyTechnicalSalary,
  type TechnicalPayrollData,
  type TechnicalPayrollEmployee,
  type TechnicalSalaryDetail,
} from "./technicalPayrollFormula";

function rid(prefix: string, n: number) {
  return `${prefix}-${n}`;
}

const TECH_SEED: { name: string; code: string; basic: number }[] = [
  { name: "Noman Khan", code: "TECH-01", basic: 0 },
  { name: "Muhammad Abdullah", code: "TECH-02", basic: 0 },
  { name: "Rizwan Sabir", code: "TECH-03", basic: 0 },
  { name: "Usama Jameel", code: "TECH-04", basic: 0 },
  { name: "Khaldoon Abrar", code: "TECH-05", basic: 0 },
  { name: "Muhammad Zaid", code: "TECH-06", basic: 0 },
  { name: "Muhammad Bariq", code: "TECH-07", basic: 0 },
  { name: "Afaq", code: "TECH-08", basic: 0 },
];

function makeEmployee(
  id: string,
  name: string,
  code: string,
  basic: number,
  extra?: Partial<TechnicalSalaryDetail>,
): TechnicalPayrollEmployee {
  const detail = emptyTechnicalSalary({ basic, ...extra });
  const net = computeTechnicalSalary(detail).totalSalary;
  return { id, name, code, ...detail, netSalary: net };
}

export function defaultTechnicalPayrollData(): TechnicalPayrollData {
  return {
    employees: TECH_SEED.map((p, i) =>
      makeEmployee(rid("tech", i + 1), p.name, p.code, p.basic),
    ),
  };
}

function coerceEmployee(raw: unknown, fallbackIndex: number): TechnicalPayrollEmployee | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = String(o.name ?? "").trim();
  if (!name) return null;

  const detail = emptyTechnicalSalary({
    basic: Number(o.basic) || 0,
    allowance: Number(o.allowance) || 0,
    weekdayOtHours: Number(o.weekdayOtHours) || 0,
    weekendOtHours: Number(o.weekendOtHours) || 0,
    checkIn: String(o.checkIn ?? "07:00"),
    checkOut: String(o.checkOut ?? "16:00"),
    lateDeductionOverride:
      o.lateDeductionOverride == null || o.lateDeductionOverride === ""
        ? null
        : Number(o.lateDeductionOverride),
    paidLeaveDays: Number(o.paidLeaveDays) || 0,
    unpaidLeaveDays: Number(o.unpaidLeaveDays) || 0,
    loanTotal: Number(o.loanTotal) || 0,
    loanPaid: Number(o.loanPaid) || 0,
    loanThisMonth: Number(o.loanThisMonth) || 0,
    incomeTax: Number(o.incomeTax) || 0,
    occasionalAmount: Math.max(0, Number(o.occasionalAmount) || 0),
    occasionalRemark: String(o.occasionalRemark ?? ""),
    pfAuto: o.pfAuto !== false,
    pfOverride: o.pfOverride == null ? null : Number(o.pfOverride),
    remarks: String(o.remarks ?? ""),
    employeeId: String(o.employeeId ?? o.code ?? ""),
    address: String(o.address ?? ""),
    phone: String(o.phone ?? ""),
    cnic: String(o.cnic ?? ""),
  });

  const id = String(o.id ?? "").trim() || rid("tech", fallbackIndex + 1);
  const code = String(o.code ?? "").trim() || `TECH-${String(fallbackIndex + 1).padStart(2, "0")}`;
  const netSalary = computeTechnicalSalary(detail).totalSalary;

  return { id, name, code, ...detail, netSalary };
}

/** Sanitize payload + recompute netSalary with Technical Team formulas. */
export function normalizeTechnicalPayrollData(raw: unknown): TechnicalPayrollData {
  const base = defaultTechnicalPayrollData();
  if (!raw || typeof raw !== "object") return base;

  const o = raw as Partial<TechnicalPayrollData>;
  if (!Array.isArray(o.employees) || o.employees.length === 0) return base;

  const employees = o.employees
    .map((e, i) => coerceEmployee(e, i))
    .filter((e): e is TechnicalPayrollEmployee => !!e);

  return { employees: employees.length > 0 ? employees : base.employees };
}

export const TECHNICAL_TEAM_TITLE = "Technical Team Salaries";

type SubHead = {
  id?: string;
  label?: string;
  amount?: number;
  filledAt?: string;
  salary?: Partial<TechnicalSalaryDetail> & Record<string, unknown>;
  [key: string]: unknown;
};

type TeamRow = {
  id?: string;
  team?: string;
  totalSalary?: number;
  subHeads?: SubHead[];
  [key: string]: unknown;
};

function isTechnicalManagerTeam(name: string): boolean {
  const t = name.trim().toLowerCase();
  return t.includes("technical manager") || t.includes("tech manager") || t.includes("technical team lead");
}

/** Technical Team only — not Technical Manager / Team Lead (those use 09:00 late). */
function isTechnicalTeam(name: string): boolean {
  const t = name.trim().toLowerCase();
  if (isTechnicalManagerTeam(t)) return false;
  if (t.includes("bim model")) return true;
  return t.includes("technical") && t.includes("sal");
}

function strField(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s === "undefined" || s === "null" ? "" : String(v);
}

function salaryFromSub(sub: SubHead): TechnicalSalaryDetail & Record<string, unknown> {
  const s = (sub.salary ?? {}) as Record<string, unknown>;
  const amount = Number(sub.amount) || 0;
  const payroll = emptyTechnicalSalary({
    basic: Number(s.basic) || amount,
    allowance: Number(s.allowance) || 0,
    weekdayOtHours: Number(s.weekdayOtHours) || 0,
    weekendOtHours: Number(s.weekendOtHours) || 0,
    checkIn: String(s.checkIn ?? "07:00"),
    checkOut: String(s.checkOut ?? "16:00"),
    lateDeductionOverride:
      s.lateDeductionOverride == null || String(s.lateDeductionOverride) === ""
        ? null
        : Number(s.lateDeductionOverride),
    paidLeaveDays: Number(s.paidLeaveDays) || 0,
    unpaidLeaveDays: Number(s.unpaidLeaveDays) || 0,
    loanTotal: Number(s.loanTotal) || 0,
    loanPaid: Number(s.loanPaid) || 0,
    loanThisMonth: Number(s.loanThisMonth) || 0,
    incomeTax: Number(s.incomeTax) || 0,
    occasionalAmount: Math.max(0, Number(s.occasionalAmount) || 0),
    occasionalRemark: String(s.occasionalRemark ?? ""),
    pfAuto: s.pfAuto !== false,
    pfOverride: s.pfOverride == null ? null : Number(s.pfOverride),
    remarks: String(s.remarks ?? ""),
    employeeId: strField(s.employeeId) || strField(s.code),
    address: strField(s.address),
    phone: strField(s.phone),
    cnic: strField(s.cnic),
  });
  return {
    ...s,
    ...payroll,
    employeeId: strField(s.employeeId) || strField(s.code),
    address: strField(s.address),
    phone: strField(s.phone),
    cnic: strField(s.cnic),
  };
}

/**
 * On income_statement load/save: recompute Technical Team person amounts
 * from salary fields using the same OT / late / PF formulas.
 */
export function recomputeTechnicalTeamInIncomeStatement(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const teams = [...((data.teamSalaries as TeamRow[] | undefined) ?? [])];
  if (!teams.length) return data;

  let changed = false;
  const next = teams.map(team => {
    if (!isTechnicalTeam(String(team.team ?? ""))) return team;
    const subs = (team.subHeads ?? []).map(sub => {
      const salary = salaryFromSub(sub);
      const amount = computeTechnicalSalary(salary).totalSalary;
      changed = true;
      return { ...sub, salary, amount };
    });
    const totalSalary = subs.reduce((a, s) => a + (Number(s.amount) || 0), 0);
    return { ...team, subHeads: subs, totalSalary };
  });

  if (!changed) return data;
  return { ...data, teamSalaries: next };
}
