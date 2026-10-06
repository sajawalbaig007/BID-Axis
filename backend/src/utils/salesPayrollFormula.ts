import type { FixClientProject, ProjectSlabKey, SalesCommissionFields, SalesPayrollEmployee } from "./salesPayrollDefaults";
import { PROJECT_SLABS } from "./salesPayrollDefaults";
import { monthLateAmountFor, policyMonth } from "./lateDeduction";

const OLD_RATE = 1000;
const NEW_RATE = 3000;
const TL_PER_PROJECT = 1000;
const TL_FIX_PCT = 0.005;
export const PROJECT_SLAB_FROM_MONTH = "2026-08";
export const PROJECT_TAX_FACTOR = 0.89;

export type SalesPayrollCalcOpts = {
  recordDate?: string;
  usdToPkr?: number;
  cadToPkr?: number;
};

export function yearMonthKey(recordDate?: string | null): string | null {
  const d = String(recordDate ?? "").trim();
  const iso = d.match(/^(\d{4})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}`;
  const us = d.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}`;
  return null;
}

export function usesProjectSlabRules(recordDate?: string | null): boolean {
  const ym = yearMonthKey(recordDate);
  if (!ym) return false;
  return ym >= PROJECT_SLAB_FROM_MONTH;
}

export function projectSlabRate(amount: number): number {
  const a = Math.max(0, Number(amount) || 0);
  if (a <= 1000) return 0.03;
  if (a <= 3000) return 0.035;
  if (a <= 5000) return 0.04;
  if (a <= 10000) return 0.045;
  return 0.05;
}

export function inferSlabKey(amount: number): ProjectSlabKey {
  const a = Math.max(0, Number(amount) || 0);
  if (a <= 1000) return "0-1000";
  if (a <= 3000) return "1001-3000";
  if (a <= 5000) return "3001-5000";
  if (a <= 10000) return "5001-10000";
  return "10001+";
}

export function projectSlabRateFromKey(key?: string | null, fallbackAmount = 0): number {
  const found = PROJECT_SLABS.find(s => s.key === key);
  if (found) return found.rate;
  return projectSlabRate(fallbackAmount);
}

export function fixRowProjectCount(p: Pick<FixClientProject, "projectCount">): number {
  if (p.projectCount != null && Number.isFinite(Number(p.projectCount))) {
    return Math.max(0, Number(p.projectCount));
  }
  return 0;
}

function projectFxRate(p: FixClientProject, opts?: SalesPayrollCalcOpts): number {
  const stored = Number(p.fxRate);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const currency = p.currency === "CAD" ? "CAD" : "USD";
  const live = currency === "CAD" ? Number(opts?.cadToPkr) : Number(opts?.usdToPkr);
  return Number.isFinite(live) && live > 0 ? live : 0;
}

export function projectCommissionPkr(p: FixClientProject, opts?: SalesPayrollCalcOpts): number {
  const amount = Number(p.projectPay) || 0;
  const rate = projectSlabRateFromKey(p.slabKey, amount);
  return amount * rate * PROJECT_TAX_FACTOR * projectFxRate(p, opts);
}

export function projectAmountPkr(p: FixClientProject, opts?: SalesPayrollCalcOpts): number {
  return (Number(p.projectPay) || 0) * projectFxRate(p, opts);
}

export function rangeFinalTotalPkr(rows: FixClientProject[] | undefined, opts?: SalesPayrollCalcOpts): number {
  return (rows ?? []).reduce((s, p) => s + projectAmountPkr(p, opts), 0);
}

export function tlProjectCommissionPkr(p: FixClientProject, opts?: SalesPayrollCalcOpts): number {
  return projectAmountPkr(p, opts) * 0.005 * PROJECT_TAX_FACTOR;
}

export function tlShareFromFinalTotal(rows: FixClientProject[] | undefined, opts?: SalesPayrollCalcOpts): number {
  return rangeFinalTotalPkr(rows, opts) * 0.005 * PROJECT_TAX_FACTOR;
}

export function timeToMinutes(t: string | undefined | null): number | null {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t.trim())) return null;
  const [h, m] = t.trim().split(":").map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** Sales shift 18:00 EST — late arrival tiers */
export function calcSalesLateDeduction(
  daySalary: number,
  checkIn: string,
  override?: number | null,
): { amount: number; rule: string } {
  if (override != null && Number.isFinite(override) && override >= 0) {
    return { amount: Number(override) || 0, rule: "Manual late override" };
  }
  const inMin = timeToMinutes(checkIn);
  if (inMin == null) return { amount: 0, rule: "No check-in — no late cut" };

  const t1815 = 18 * 60 + 15;
  const t1830 = 18 * 60 + 30;
  const t1900 = 19 * 60;
  const t2000 = 20 * 60;

  if (inMin <= t1815) return { amount: 0, rule: "On time (≤ 18:15 EST)" };
  if (inMin < t1830) return { amount: daySalary / 5, rule: "18:15–18:30 → ⅕ day" };
  if (inMin < t1900) return { amount: daySalary / 4, rule: "18:30–19:00 → ¼ day" };
  if (inMin < t2000) return { amount: daySalary / 3, rule: "19:00–20:00 → ⅓ day" };
  return { amount: daySalary / 2, rule: "20:00+ → half day" };
}

export function calcSalesCommission(
  commission: SalesCommissionFields,
  _role: "sales" | "team_lead",
  opts?: SalesPayrollCalcOpts,
) {
  const slab = usesProjectSlabRules(opts?.recordDate);
  const rows = commission.fixClientProjects ?? [];
  if (slab) {
    const fixComm = rows.reduce((s, p) => s + projectCommissionPkr(p, opts), 0);
    const totalProjects = rows.reduce((s, p) => s + fixRowProjectCount(p), 0);
    return {
      oldComm: 0,
      newComm: 0,
      fixComm,
      totalProjects,
      totalCommission: fixComm,
      slab: true,
      finalTotalPkr: rangeFinalTotalPkr(rows, opts),
      leadShare: tlShareFromFinalTotal(rows, opts),
    };
  }
  const oldCount = Number(commission.oldClientProjects) || 0;
  const partial = Math.min(Number(commission.oldClientPartialCount) || 0, oldCount);
  const oldFull = oldCount - partial;
  const oldComm = oldFull * OLD_RATE + partial * (OLD_RATE * 0.5);
  const newComm = (Number(commission.newClientProjects) || 0) * NEW_RATE;
  const fixComm = rows.reduce((s, p) => s + (Number(p.projectPay) || 0) * 0.025, 0);
  const totalProjects = oldCount + (Number(commission.newClientProjects) || 0) + rows.length;
  const totalCommission = oldComm + newComm + fixComm;
  return {
    oldComm,
    newComm,
    fixComm,
    totalProjects,
    totalCommission,
    slab: false,
    finalTotalPkr: 0,
    leadShare: 0,
  };
}

export function calcTlAssignedCommission(rep: SalesPayrollEmployee, opts?: SalesPayrollCalcOpts) {
  if (!rep.assignedToLead) return 0;
  if (usesProjectSlabRules(opts?.recordDate)) {
    return tlShareFromFinalTotal(rep.commission.fixClientProjects, opts);
  }
  const { totalProjects } = calcSalesCommission(rep.commission, "sales", opts);
  const fixPay = (rep.commission.fixClientProjects ?? []).reduce((s, p) => s + (Number(p.projectPay) || 0), 0);
  return totalProjects * TL_PER_PROJECT + fixPay * TL_FIX_PCT;
}

export function computeSalesEmployeePayroll(
  emp: SalesPayrollEmployee,
  extraEarning = 0,
  opts?: SalesPayrollCalcOpts,
) {
  const basic = Number(emp.basic) || 0;
  const allowance = Number(emp.allowance) || 0;
  const homeAllowance = Number(emp.homeAllowance) || 0;
  const fuelAllowance = Number(emp.fuelAllowance) || 0;
  const medicalAllowance = Number(emp.medicalAllowance) || 0;
  const daySalary = basic / 30;
  const comm = calcSalesCommission(emp.commission, emp.role, opts);
  const policyLate = emp.lateDeductionOverride == null
    ? monthLateAmountFor("csr", emp.payMonth || policyMonth(opts?.recordDate), {
        basic,
        commission: comm.totalCommission,
        overtime: 0,
        allowance: allowance + homeAllowance + fuelAllowance + medicalAllowance,
      }, emp.attendanceDays, { personName: emp.name }, emp.checkIn)
    : null;
  const late = policyLate ?? calcSalesLateDeduction(daySalary, emp.checkIn, emp.lateDeductionOverride);
  const unpaidDays = Number(emp.unpaidLeaveDays) || 0;
  const unpaidLeaveDeduction = unpaidDays * daySalary;
  const loanThisMonth = Number(emp.loanThisMonth) || 0;
  const pf = basic * 0.08;
  const incomeTax = Number(emp.incomeTax) || 0;
  const totalEarning =
    basic + allowance + homeAllowance + fuelAllowance + medicalAllowance + comm.totalCommission + extraEarning;
  const totalDeduction = late.amount + unpaidLeaveDeduction + loanThisMonth + pf + incomeTax;
  const netSalary = totalEarning - totalDeduction;
  const loanRemaining = Math.max(
    0,
    (Number(emp.loanTotal) || 0) - (Number(emp.loanPaid) || 0) - (Number(emp.loanThisMonth) || 0),
  );

  return {
    ...comm,
    daySalary,
    lateDeduction: late.amount,
    lateRuleApplied: late.rule,
    unpaidLeaveDeduction,
    pf,
    totalEarning,
    totalDeduction,
    netSalary,
    loanRemaining,
  };
}

/** Recompute team lead assigned totals from sales team members */
export function syncTeamLeadAssignments(data: {
  salesTeamMembers: SalesPayrollEmployee[];
  salesTeamLeads: SalesPayrollEmployee[];
}) {
  const leads = data.salesTeamLeads.map(tl => {
    const assignedTotal = data.salesTeamMembers
      .filter(m => m.assignedToLead && m.assignedTeamLeadId === tl.id)
      .reduce((s, m) => s + calcTlAssignedCommission(m, undefined), 0);
    return { tl, assignedTotal };
  });
  return leads;
}

export function mergeSalesPayrollOnSave(data: {
  salesTeamMembers: SalesPayrollEmployee[];
  salesTeamLeads: SalesPayrollEmployee[];
}) {
  return {
    salesTeamMembers: data.salesTeamMembers,
    salesTeamLeads: data.salesTeamLeads,
  };
}
