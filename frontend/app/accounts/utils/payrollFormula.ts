import { lateFromEmployee, lateFromPolicy, monthLateFromPolicy, type AttendanceDay } from "./latePolicy";

/** Technical-team (and shared) payroll formulas — editable inputs, computed outputs. */

export type EmployeeSalaryDetail = {
  basic: number;
  allowance: number;
  /** Optional home allowance line on salary slip (Misc = allowance). */
  homeAllowance?: number;
  fuelAllowance?: number;
  /** Technical manager / itemized allowance lines */
  medicalAllowance?: number;
  travelAllowance?: number;
  /** Technical manager — utility allowance (10% of gross) */
  utilityAllowance?: number;
  /** Technical manager — package gross (drives % splits) */
  grossSalary?: number;

  /** Weekday overtime hours */
  weekdayOtHours: number;
  /** Weekend overtime hours */
  weekendOtHours: number;

  /** Check-in / check-out HH:mm (24h) — used for late relief & 9h shift waiver */
  checkIn: string;
  checkOut: string;
  /** Late-deduction department from the attendance report (accounts, hr, office_boy, admin). */
  lateDepartment?: string;
  /** Attendance person key, so an employee late-deduction override beats the department. */
  latePersonKey?: string;
  /** Statement month YYYY-MM. Days in this month drive the late total. */
  payMonth?: string;
  /** Days this person actually punched. A missing day deducts that day’s pay. */
  attendanceDays?: AttendanceDay[];
  /** Manual late override — if set, used instead of time-based late calc */
  lateDeductionOverride?: number | null;

  paidLeaveDays: number;
  unpaidLeaveDays: number;

  /** Loan ledger */
  loanTotal: number;
  loanPaid: number;
  /** This month's loan installment (salary cut or separate cash) */
  loanThisMonth: number;
  /**
   * How this month's loan amount was cleared:
   * - salary → deduct from net salary
   * - cash → separate cash payment (salary net unchanged)
   */
  loanPaymentMode?: "salary" | "cash";

  /** Manual income tax deduction */
  incomeTax: number;

/**
   * One-off / occasional pay.
   * Formula: Net Salary = (Total Earning − Total Deduction) + Occasional Amount
   * Never enters totalEarning — so PF, tax, late, unpaid leave, day-salary ignore it.
   */
  occasionalAmount?: number;
  /** Why this occasional amount was paid (occasion note). */
  occasionalRemark?: string;

  /** If true, PF = 8% of basic; if false use pfOverride */
  pfAuto: boolean;
  pfOverride?: number | null;

  remarks: string;

  /** Salary slip / HR profile (optional — fill before month-end download) */
  employeeId?: string;
  address?: string;
  phone?: string;
  cnic?: string;

  /** Executive only — commission % of net profit (before executive salaries) */
  commissionPct?: number;
  /** Executive only — loan the company owes to the executive */
  loanPositive?: number;
  /** Executive only — loan the executive owes to the company */
  loanNegative?: number;
};

export type SalaryBreakdown = {
  monthlySalary: number;
  daySalary: number;
  hourSalary: number;
  weekdayOtPay: number;
  weekendOtPay: number;
  totalOvertime: number;
  totalEarning: number;
  lateDeduction: number;
  unpaidLeaveDeduction: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  loanThisMonth: number;
  /** Amount actually taken from salary (0 when cash clearance) */
  loanFromSalary: number;
  /** Net before loan salary deduction */
  netBeforeLoan: number;
  loanRemaining: number;
  pf: number;
  incomeTax: number;
  totalDeduction: number;
  totalSalary: number;
  lateRuleApplied: string;
  /** Occasional amount added to net (not in totalEarning) */
  occasionalAmount: number;
};

/** Occasional pay — never feeds PF / tax / late / day-salary bases. */
export function occasionalOf(detail: { occasionalAmount?: number | null }): number {
  return Math.max(0, Number(detail.occasionalAmount) || 0);
}

export function allowanceParts(detail: {
  allowance?: number | null;
  homeAllowance?: number | null;
  fuelAllowance?: number | null;
  medicalAllowance?: number | null;
}): { misc: number; home: number; fuel: number; medical: number; total: number } {
  const misc = Number(detail.allowance) || 0;
  const home = Number(detail.homeAllowance) || 0;
  const fuel = Number(detail.fuelAllowance) || 0;
  const medical = Number(detail.medicalAllowance) || 0;
  return { misc, home, fuel, medical, total: misc + home + fuel + medical };
}

/** Late / unpaid: 1 day = Basic ÷ 30 · 1 hour = Day ÷ 8 (allowances never enter this base). */
export function dayHourFromBasic(basic: number): { daySalary: number; hourSalary: number } {
  const daySalary = (Number(basic) || 0) / 30;
  return { daySalary, hourSalary: daySalary / 8 };
}

/** Original technical OT hourly: (Basic + Allowances) ÷ 30 ÷ 8. */
export function otHourFromMonthly(monthly: number): number {
  return (Number(monthly) || 0) / 30 / 8;
}

export function emptySalaryDetail(partial?: Partial<EmployeeSalaryDetail>): EmployeeSalaryDetail {
  const merged: EmployeeSalaryDetail = {
    basic: 0,
    allowance: 0,
    homeAllowance: 0,
    fuelAllowance: 0,
    medicalAllowance: 0,
    weekdayOtHours: 0,
    weekendOtHours: 0,
    checkIn: "07:00",
    checkOut: "16:00",
    lateDeductionOverride: null,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    loanTotal: 0,
    loanPaid: 0,
    loanThisMonth: 0,
    loanPaymentMode: "salary",
    incomeTax: 0,
    occasionalAmount: 0,
    occasionalRemark: "",
    pfAuto: true,
    pfOverride: null,
    remarks: "",
    ...partial,
  };
  // Missing / undefined pfAuto (older months) → always treat as ON so checkbox works every month
  merged.pfAuto = partial?.pfAuto !== false;
  merged.occasionalAmount = occasionalOf(merged);
  return merged;
}

/** Whether this-period PF deduction applies (default ON). */
export function isPfAutoEnabled(detail: { pfAuto?: boolean | null }): boolean {
  return detail.pfAuto !== false;
}

/** PF amount for the period — auto 8% of basic, or manual override when unchecked. */
export function resolvePfAmount(
  detail: { pfAuto?: boolean | null; pfOverride?: number | null; basic?: number | null },
): number {
  const basic = Number(detail.basic) || 0;
  if (isPfAutoEnabled(detail)) return basic * 0.08;
  return Math.max(0, Number(detail.pfOverride) || 0);
}

/** Amount deducted from salary this month (0 if cleared via separate cash). */
export function loanAmountFromSalary(
  detail: Pick<EmployeeSalaryDetail, "loanThisMonth" | "loanPaymentMode">,
): number {
  const amt = Math.max(0, Number(detail.loanThisMonth) || 0);
  if (amt <= 0) return 0;
  return detail.loanPaymentMode === "cash" ? 0 : amt;
}

/** Parse "HH:mm" → minutes from midnight; invalid → null */
export function timeToMinutes(t: string | undefined | null): number | null {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t.trim())) return null;
  const [h, m] = t.trim().split(":").map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Late deduction for Technical Team / Technical Manager day shifts.
 * Tech team: shift 07:00 (relief 07:30). Tech manager: shift 09:00 (relief 09:30).
 * Same slabs after start: +0:30 relief · next 30m = ¼ day · next 60m = ⅓ day · later = ½ day.
 * Waiver: if check-in late but worked ≥ 9 hours, no late cut.
 */
export function calcLateDeduction(
  daySalary: number,
  checkIn: string,
  checkOut: string,
  override?: number | null,
  /** 7 = Technical Team · 9 = Technical Manager */
  shiftStartHour: 7 | 9 = 7,
): { amount: number; rule: string } {
  if (override != null && Number.isFinite(override) && override >= 0) {
    return { amount: Number(override) || 0, rule: "Manual late override" };
  }

  const inMin = timeToMinutes(checkIn);
  const outMin = timeToMinutes(checkOut);
  if (inMin == null) return { amount: 0, rule: "No check-in — no late cut" };

  const start = shiftStartHour * 60;
  const reliefEnd = start + 30;
  const quarterEnd = start + 60; // first hour after start
  const thirdEnd = start + 120; // second hour after start
  const pad = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  if (inMin <= reliefEnd) {
    return { amount: 0, rule: `On time / relief (≤ ${pad(reliefEnd)})` };
  }

  // Full 9h shift waiver
  if (outMin != null) {
    const worked = outMin >= inMin ? outMin - inMin : outMin + 24 * 60 - inMin;
    if (worked >= 9 * 60) {
      return { amount: 0, rule: "Late but completed ≥ 9h shift — waived" };
    }
  }

  if (inMin < quarterEnd) {
    return { amount: daySalary / 4, rule: `${pad(reliefEnd)}–${pad(quarterEnd)} → ¼ day` };
  }
  if (inMin < thirdEnd) {
    return { amount: daySalary / 3, rule: `${pad(quarterEnd)}–${pad(thirdEnd)} → ⅓ day` };
  }
  return { amount: daySalary / 2, rule: `${pad(thirdEnd)}+ → half day` };
}

/**
 * Late deduction for Administration (evening shift 18:00).
 * 18:00–18:15 none | 18:15–18:30 ⅕ day | 18:30–19:00 ¼ day |
 * 19:00–20:00 ⅓ day | 20:00 onwards half day.
 */
export function calcAdminLateDeduction(
  daySalary: number,
  checkIn: string,
  override?: number | null,
): { amount: number; rule: string } {
  if (override != null && Number.isFinite(override) && override >= 0) {
    return { amount: Number(override) || 0, rule: "Manual late override" };
  }

  const inMin = timeToMinutes(checkIn);
  if (inMin == null) return { amount: 0, rule: "No check-in — no late cut" };

  const t = (h: number, m: number) => h * 60 + m;
  if (inMin <= t(18, 15)) return { amount: 0, rule: "On time / relief (≤ 18:15)" };
  if (inMin <= t(18, 30)) return { amount: daySalary / 5, rule: "18:15–18:30 → ⅕ day" };
  if (inMin <= t(19, 0)) return { amount: daySalary / 4, rule: "18:30–19:00 → ¼ day" };
  if (inMin < t(20, 0)) return { amount: daySalary / 3, rule: "19:00–20:00 → ⅓ day" };
  return { amount: daySalary / 2, rule: "20:00 onwards → half day" };
}

/**
 * Administration payroll:
 * Basic + Allowance = Total Earning (no overtime).
 * Late (6 PM slabs) + Unpaid leaves + Loan (this month) + PF (8% of basic) + Tax = Total Deduction.
 * Total Earning − Total Deduction = Total Salary.
 */
export function computeAdminSalary(detail: EmployeeSalaryDetail, personName = ""): SalaryBreakdown {
  const basic = Number(detail.basic) || 0;
  const parts = allowanceParts(detail);
  const travelAllowance = Number(detail.travelAllowance) || 0;
  const monthlySalary = basic + parts.total + travelAllowance;
  const { daySalary, hourSalary } = dayHourFromBasic(basic);

  const totalEarning = monthlySalary;

  const lateDept = detail.lateDepartment || "admin";
  const policyLate = detail.lateDeductionOverride == null
    ? monthLateFromPolicy(lateDept, {
        basic,
        commission: 0,
        overtime: 0,
        allowance: parts.total + travelAllowance,
      }, { personKey: detail.latePersonKey, personName }, detail.attendanceDays, detail.payMonth || "", detail.checkIn)
    : null;
  const late = policyLate ?? calcAdminLateDeduction(daySalary, detail.checkIn, detail.lateDeductionOverride);

  const unpaidLeaveDays = Number(detail.unpaidLeaveDays) || 0;
  const unpaidLeaveDeduction = unpaidLeaveDays * daySalary;
  const paidLeaveDays = Number(detail.paidLeaveDays) || 0;

  const loanTotal = Number(detail.loanTotal) || 0;
  const loanPaid = Number(detail.loanPaid) || 0;
  const loanThisMonth = Number(detail.loanThisMonth) || 0;
  const loanFromSalary = loanAmountFromSalary(detail);
  const loanRemaining = Math.max(0, loanTotal - loanPaid - loanThisMonth);

  const pf = resolvePfAmount(detail);
  const incomeTax = Number(detail.incomeTax) || 0;

  const baseDeduction = late.amount + unpaidLeaveDeduction + pf + incomeTax;
  const totalDeduction = baseDeduction + loanFromSalary;
  const occasionalAmount = occasionalOf(detail);
  const netBeforeLoan = totalEarning - baseDeduction + occasionalAmount;
  const totalSalary = totalEarning - totalDeduction + occasionalAmount;

  return {
    monthlySalary,
    daySalary,
    hourSalary,
    weekdayOtPay: 0,
    weekendOtPay: 0,
    totalOvertime: 0,
    totalEarning,
    lateDeduction: late.amount,
    unpaidLeaveDeduction,
    paidLeaveDays,
    unpaidLeaveDays,
    loanThisMonth,
    loanFromSalary,
    netBeforeLoan,
    loanRemaining,
    pf,
    incomeTax,
    totalDeduction,
    totalSalary,
    lateRuleApplied: late.rule,
    occasionalAmount,
  };
}

export type ExecutiveBreakdown = {
  basic: number;
  commissionPct: number;
  /** Net profit (before executive salaries) used as commission base */
  commissionBase: number;
  commission: number;
  /** Basic + Commission */
  totalSalary: number;
  /** Loan the company owes to the executive */
  loanPositive: number;
  /** Loan the executive owes to the company */
  loanNegative: number;
  /**
   * Amount due to this executive this period:
   * Total Salary + Loan+ve − Loan−ve + Occasional − PF
   */
  totalPayable: number;
  occasionalAmount: number;
  pf: number;
  pfAuto: boolean;
};

/**
 * Executive payroll:
 * Commission = % of net profit (profit before executive salaries; no commission on loss).
 * Basic Salary + Commission = Total Salary.
 * Total Payable (head amount) = Total Salary + Loan+ve − Loan−ve + Occasional − PF
 *   · Loan+ve (company owes them) → add to salary / head total
 *   · Loan−ve (they owe company) → deduct from salary / head total
 *   · Occasional → add to net only
 *   · PF → Apply PF checkbox (default ON = 8% of basic)
 */
export function computeExecutiveSalary(
  detail: Partial<EmployeeSalaryDetail>,
  profitBase: number,
): ExecutiveBreakdown {
  const basic = Number(detail.basic) || 0;
  const commissionPct = Number(detail.commissionPct) || 0;
  const commissionBase = Math.max(0, Number(profitBase) || 0);
  const commission = (commissionBase * commissionPct) / 100;
  const loanPositive = Number(detail.loanPositive) || 0;
  const loanNegative = Number(detail.loanNegative) || 0;
  const occasionalAmount = occasionalOf(detail);
  const pfAuto = detail.pfAuto !== false;
  const pf = resolvePfAmount(detail);
  const totalSalary = basic + commission + allowanceParts(detail).total;
  return {
    basic,
    commissionPct,
    commissionBase,
    commission,
    totalSalary,
    loanPositive,
    loanNegative,
    occasionalAmount,
    pf,
    pfAuto,
    totalPayable: totalSalary + loanPositive - loanNegative + occasionalAmount - pf,
  };
}

/**
 * Hydrate executive salary for editors / tables.
 * Keep explicit basic including 0. Only fall back to sub-head amount when basic was never set.
 */
export function ensureExecutiveSalaryDetail(
  salary: Partial<EmployeeSalaryDetail> | undefined | null,
  amountFallback = 0,
  opts?: { commissionPct?: number },
): EmployeeSalaryDetail {
  const rawBasic = salary?.basic;
  const hasExplicitBasic = rawBasic !== undefined && rawBasic !== null && String(rawBasic) !== "";
  const basicFromSalary = Number(rawBasic);
  const basic =
    hasExplicitBasic && Number.isFinite(basicFromSalary)
      ? Math.max(0, basicFromSalary)
      : Math.max(0, Number(amountFallback) || 0);
  return emptySalaryDetail({
    ...(salary ?? {}),
    basic,
    commissionPct:
      salary?.commissionPct != null && Number.isFinite(Number(salary.commissionPct))
        ? Number(salary.commissionPct)
        : Number(opts?.commissionPct) || 0,
    loanPositive: Number(salary?.loanPositive) || 0,
    loanNegative: Number(salary?.loanNegative) || 0,
  });
}

export function computeSalary(
  detail: EmployeeSalaryDetail,
  opts?: { /** Technical Team = 7 · Technical Manager = 9 */ lateShiftHour?: 7 | 9; personName?: string },
): SalaryBreakdown {
  const basic = Number(detail.basic) || 0;
  const parts = allowanceParts(detail);
  const travelAllowance = Number(detail.travelAllowance) || 0;
  const monthlySalary = basic + parts.total + travelAllowance;
  const { daySalary } = dayHourFromBasic(basic);
  const hourSalary = otHourFromMonthly(monthlySalary);

  const weekdayOtHours = Number(detail.weekdayOtHours) || 0;
  const weekendOtHours = Number(detail.weekendOtHours) || 0;
  const weekdayOtPay = weekdayOtHours * hourSalary * 1.5;
  const weekendOtPay = weekendOtHours * hourSalary * 2;
  const totalOvertime = weekdayOtPay + weekendOtPay;

  const totalEarning = monthlySalary + totalOvertime;

  const chief = opts?.lateShiftHour === 9;
  const person = { personKey: detail.latePersonKey, personName: opts?.personName };
  const pay = {
    basic,
    commission: 0,
    overtime: totalOvertime,
    allowance: parts.total + travelAllowance,
  };
  const policyDept = chief ? "chief_estimator" : (detail.lateDepartment || "estimator");
  const policyLate = detail.lateDeductionOverride != null
    ? null
    : detail.attendanceDays
      ? monthLateFromPolicy(policyDept, pay, person, detail.attendanceDays, detail.payMonth || "", detail.checkIn)
      : chief
        ? lateFromPolicy("chief_estimator", detail.checkIn, pay, person)
        : lateFromEmployee("estimator", detail.checkIn, pay, person);
  const late = policyLate ?? calcLateDeduction(
    daySalary,
    detail.checkIn,
    detail.checkOut,
    detail.lateDeductionOverride,
    opts?.lateShiftHour ?? 7,
  );

  const unpaidLeaveDays = Number(detail.unpaidLeaveDays) || 0;
  const unpaidLeaveDeduction = unpaidLeaveDays * daySalary;
  const paidLeaveDays = Number(detail.paidLeaveDays) || 0;

  const loanTotal = Number(detail.loanTotal) || 0;
  const loanPaid = Number(detail.loanPaid) || 0;
  const loanThisMonth = Number(detail.loanThisMonth) || 0;
  const loanFromSalary = loanAmountFromSalary(detail);
  const loanRemaining = Math.max(0, loanTotal - loanPaid - loanThisMonth);

  const pf = resolvePfAmount(detail);

  const incomeTax = Number(detail.incomeTax) || 0;

  const baseDeduction = late.amount + unpaidLeaveDeduction + pf + incomeTax;
  const totalDeduction = baseDeduction + loanFromSalary;
  const occasionalAmount = occasionalOf(detail);
  const netBeforeLoan = totalEarning - baseDeduction + occasionalAmount;
  const totalSalary = totalEarning - totalDeduction + occasionalAmount;

  return {
    monthlySalary,
    daySalary,
    hourSalary,
    weekdayOtPay,
    weekendOtPay,
    totalOvertime,
    totalEarning,
    lateDeduction: late.amount,
    unpaidLeaveDeduction,
    paidLeaveDays,
    unpaidLeaveDays,
    loanThisMonth,
    loanFromSalary,
    netBeforeLoan,
    loanRemaining,
    pf,
    incomeTax,
    totalDeduction,
    totalSalary,
    lateRuleApplied: late.rule,
    occasionalAmount,
  };
}

/** Technical Manager package splits of Gross Salary */
export const TECH_MGR_GROSS_SPLITS = {
  basic: 0.5,
  medical: 0.1,
  home: 0.2,
  utility: 0.1,
  travel: 0.1,
} as const;

export type TechManagerBreakdown = SalaryBreakdown & {
  grossSalary: number;
  basic: number;
  medicalAllowance: number;
  homeAllowance: number;
  utilityAllowance: number;
  travelAllowance: number;
  /** Gross − Medical (medical treated as non-taxable) */
  taxableIncome: number;
};

/**
 * Technical Manager — same payroll as Technical Team, but late shift starts at 09:00.
 */
export function computeTechnicalManagerSalary(detail: EmployeeSalaryDetail, personName = ""): TechManagerBreakdown {
  const b = computeSalary(detail, { lateShiftHour: 9, personName });
  const basic = Number(detail.basic) || 0;
  const medicalAllowance = Number(detail.medicalAllowance) || 0;
  const homeAllowance = Number(detail.homeAllowance) || 0;
  const utilityAllowance = Number(detail.utilityAllowance) || 0;
  const travelAllowance = Number(detail.travelAllowance) || 0;
  return {
    ...b,
    grossSalary: b.monthlySalary,
    basic,
    medicalAllowance,
    homeAllowance,
    utilityAllowance,
    travelAllowance,
    taxableIncome: Math.max(0, b.totalEarning - medicalAllowance),
  };
}

/** @deprecated Package % split no longer used — Technical Manager uses Technical Team formula. */
export function resolveTechnicalManagerGross(detail: EmployeeSalaryDetail): number {
  return (
    (Number(detail.basic) || 0) +
    (Number(detail.homeAllowance) || 0) +
    (Number(detail.medicalAllowance) || 0) +
    (Number(detail.utilityAllowance) || 0) +
    (Number(detail.travelAllowance) || 0) +
    (Number(detail.allowance) || 0)
  );
}

/** @deprecated Package % split no longer used — Technical Manager uses Technical Team formula. */
export function applyTechnicalManagerGross(
  detail: EmployeeSalaryDetail,
  gross: number,
): EmployeeSalaryDetail {
  // Legacy helper: map gross into basic so older UI paths don't break.
  return {
    ...detail,
    grossSalary: Math.max(0, Number(gross) || 0),
    basic: Math.max(0, Number(gross) || 0),
    medicalAllowance: 0,
    homeAllowance: 0,
    utilityAllowance: 0,
    travelAllowance: 0,
    allowance: 0,
  };
}
