import { Response } from "express";
import { Prisma } from "@prisma/client";
import streamifier from "streamifier";
import prisma from "../config/db";
import cloudinary from "../config/cloudinary";
import { AuthRequest } from "../middleware/auth.middleware";
import {
  normalizeIncomeStatementData,
  recomputeExecutiveTeamInIncomeStatement,
} from "../utils/incomeStatementNormalize";
import { recomputeTechnicalTeamInIncomeStatement } from "../utils/technicalPayrollDefaults";
import {
  currencyFormulaBreakdownFromDashboard,
  currencyFormulaTotalFromDashboard,
} from "../utils/currencyFormula";
import { ACCOUNTS_CLOUDINARY_FOLDERS } from "../utils/accountsStorage";
import {
  calcSalesCommission,
  calcTlAssignedCommission,
  computeSalesEmployeePayroll,
  fixRowProjectCount,
  type SalesPayrollCalcOpts,
} from "../utils/salesPayrollFormula";
import type { ProjectSlabKey, SalesCommissionFields, SalesPayrollEmployee } from "../utils/salesPayrollDefaults";
import { computeTechnicalSalary, emptyTechnicalSalary } from "../utils/technicalPayrollFormula";
import {
  aggregateAllCollectionMonths,
  applyCollectionsToDashboardData,
  emptyDayCollections,
  monthStartIso,
  yearMonthFromDate,
} from "../utils/projectCurrencyCollections";
import { defaultAccountsData } from "../utils/accountsDefaults";
import { pickLatestMeaningful, pickLatestMeaningfulByMonth } from "../utils/accountsSnapshot";
import { fetchLiveFxRates } from "../utils/fxRates";
import {
  CORE_BUDGET_LINE_DEFS,
  accumulateCoreBudget,
  accumulateOpexHeads,
  emptyCoreActuals,
  type CoreBudgetKey,
  type OpexHeadBucket,
} from "../utils/incomeBudget";

/**
 * Monthly Executive Summary — Total Cost / salaries / OPEX / loans / PF come from
 * the latest Income Statement day in the selected month (same Total Expense card).
 * Financial history is the selected month plus the previous 5 months.
 */

function prepareIncomeStatementData(data: Record<string, unknown>): Record<string, unknown> {
  return recomputeExecutiveTeamInIncomeStatement(
    recomputeTechnicalTeamInIncomeStatement(normalizeIncomeStatementData(data)),
  );
}

type SubHead = {
  id?: string;
  label?: string;
  amount?: number;
  filledAt?: string;
  proofName?: string;
  salary?: {
    basic?: number;
    allowance?: number;
    homeAllowance?: number;
    fuelAllowance?: number;
    medicalAllowance?: number;
    travelAllowance?: number;
    weekdayOtHours?: number;
    weekendOtHours?: number;
    checkIn?: string;
    checkOut?: string;
    lateDeductionOverride?: number | null;
    paidLeaveDays?: number;
    unpaidLeaveDays?: number;
    loanTotal?: number;
    loanPaid?: number;
    loanThisMonth?: number;
    loanPaymentMode?: string;
    incomeTax?: number;
    occasionalAmount?: number;
    pfAuto?: boolean;
    pfOverride?: number | null;
    remarks?: string;
    commissionPct?: number;
    loanPositive?: number;
    loanNegative?: number;
  };
  salesPayroll?: {
    id?: string;
    name?: string;
    code?: string;
    role?: "sales" | "team_lead";
    basic?: number;
    allowance?: number;
    homeAllowance?: number;
    fuelAllowance?: number;
    medicalAllowance?: number;
    assignedToLead?: boolean;
    assignedTeamLeadId?: string | null;
    checkIn?: string;
    lateDeductionOverride?: number | null;
    paidLeaveDays?: number;
    unpaidLeaveDays?: number;
    loanTotal?: number;
    loanPaid?: number;
    loanThisMonth?: number;
    incomeTax?: number;
    remarks?: string;
    occasionalAmount?: number;
    commission?: {
      oldClientProjects?: number;
      oldClientPartialCount?: number;
      newClientProjects?: number;
      fixClientProjects?: {
        id?: string;
        clientName?: string;
        projectPay?: number;
        currency?: "USD" | "CAD";
        fxRate?: number;
        slabKey?: string;
        projectCount?: number;
      }[];
    };
  };
};

type HeadRow = {
  team?: string;
  label?: string;
  amount?: number;
  totalSalary?: number;
  filledAt?: string;
  note?: string;
  notes?: { text?: string }[];
  subHeads?: SubHead[];
};

type CashFlowRow = {
  date?: string;
  description?: string;
  netAmount?: number;
  bankAmounts?: Record<string, { debit?: number; credit?: number }>;
};

type CashFlowData = {
  bankHeads?: string[];
  months?: { month?: string; rows?: CashFlowRow[] }[];
};

function lineTotal(row: HeadRow): number {
  if (row.subHeads && row.subHeads.length > 0) {
    return row.subHeads.reduce((a, s) => a + (Number(s.amount) || 0), 0);
  }
  return Number(row.amount ?? row.totalSalary) || 0;
}

function isRowExpense(data: Record<string, unknown>): number {
  // Align with Income Statement / dashboard: Total Expense = payroll + OPEX
  // (PF and loans already sit inside net salaries — don't double-count).
  const cats = ["teamSalaries", "opexHeads"] as const;
  return cats.reduce((sum, key) => {
    const rows = (data[key] as HeadRow[]) ?? [];
    return sum + rows.reduce((a, r) => a + lineTotal(r), 0);
  }, 0);
}

type CategoryGroup = {
  name: string;
  total: number;
  lines: { label: string; amount: number }[];
};

/** Sum head rows across multiple daily records into per-head + per-line totals. */
function aggregateCategory(
  records: Record<string, unknown>[],
  key: string,
  nameField: "team" | "label",
): CategoryGroup[] {
  const groups = new Map<string, { total: number; lines: Map<string, number> }>();
  for (const data of records) {
    const rows = (data[key] as HeadRow[]) ?? [];
    for (const row of rows) {
      const name = String(row[nameField] ?? "").trim() || "Untitled";
      const g = groups.get(name) ?? { total: 0, lines: new Map<string, number>() };
      g.total += lineTotal(row);
      for (const s of row.subHeads ?? []) {
        const label = String(s.label ?? "").trim() || "—";
        g.lines.set(label, (g.lines.get(label) ?? 0) + (Number(s.amount) || 0));
      }
      groups.set(name, g);
    }
  }
  return [...groups.entries()].map(([name, g]) => ({
    name,
    total: g.total,
    lines: [...g.lines.entries()].map(([label, amount]) => ({ label, amount })),
  }));
}

type ExecutiveLine = {
  name: string;
  basic: number;
  commissionPct: number;
  commission: number;
  total: number;
  loanPositive: number;
  loanNegative: number;
  remarks: string;
};

function aggregateExecutives(records: Record<string, unknown>[]): ExecutiveLine[] {
  const map = new Map<string, ExecutiveLine>();
  for (const data of records) {
    const teams = (data.teamSalaries as HeadRow[]) ?? [];
    const exec = teams.find(t => String(t.team ?? "").toLowerCase().includes("executive"));
    if (!exec) continue;
    for (const s of exec.subHeads ?? []) {
      const name = String(s.label ?? "").trim() || "—";
      const prev = map.get(name) ?? {
        name,
        basic: 0,
        commissionPct: 0,
        commission: 0,
        total: 0,
        loanPositive: 0,
        loanNegative: 0,
        remarks: "",
      };
      const basic = Number(s.salary?.basic) || 0;
      const total = Number(s.amount) || 0;
      const loanPositive = Number(s.salary?.loanPositive) || 0;
      const loanNegative = Number(s.salary?.loanNegative) || 0;
      // amount = basic + commission + loan+ − loan−
      const commission = Math.max(0, total - basic - loanPositive + loanNegative);
      prev.basic += basic;
      prev.total += total;
      prev.commission += commission;
      if (s.salary?.commissionPct != null) prev.commissionPct = Number(s.salary.commissionPct) || 0;
      prev.loanPositive += loanPositive;
      prev.loanNegative += loanNegative;
      if (s.salary?.remarks?.trim()) prev.remarks = s.salary.remarks.trim();
      map.set(name, prev);
    }
  }
  return [...map.values()];
}

function isSalesCsrTeam(teamTitle: string): boolean {
  const t = teamTitle.trim().toLowerCase();
  // Sales Team Salaries + Sales Team Lead Salaries (CSRs)
  return t.includes("sales team");
}

export type CsrPerformanceRow = {
  name: string;
  code: string;
  role: "sales" | "team_lead";
  roleLabel: string;
  assignedToLead: boolean;
  oldProjects: number;
  partialCount: number;
  newProjects: number;
  fixProjects: number;
  fixPay: number;
  projects: number;
  oldComm: number;
  newComm: number;
  fixComm: number;
  totalCommission: number;
  share: number;
  status: string;
  note: string;
  fixClients: { clientName: string; projectPay: number; currency: string }[];
};

export type CsrPerformanceReport = {
  totalProjects: number;
  totals: {
    oldProjects: number;
    partialCount: number;
    newProjects: number;
    fixProjects: number;
    fixPay: number;
    oldComm: number;
    newComm: number;
    fixComm: number;
    totalCommission: number;
  };
  rows: CsrPerformanceRow[];
};

function emptyCsrRow(name: string, teamTitle: string, sub: SubHead): CsrPerformanceRow {
  const sp = sub.salesPayroll;
  const role: "sales" | "team_lead" =
    sp?.role === "team_lead" || /lead/i.test(teamTitle) ? "team_lead" : "sales";
  return {
    name,
    code: String(sp?.code ?? "").trim(),
    role,
    roleLabel: role === "team_lead" ? "Team Lead" : "Sales",
    assignedToLead: !!sp?.assignedToLead,
    oldProjects: 0,
    partialCount: 0,
    newProjects: 0,
    fixProjects: 0,
    fixPay: 0,
    projects: 0,
    oldComm: 0,
    newComm: 0,
    fixComm: 0,
    totalCommission: 0,
    share: 0,
    status: "Active",
    note: "",
    fixClients: [],
  };
}

function csrRowFromSub(
  teamTitle: string,
  sub: SubHead,
  opts?: SalesPayrollCalcOpts,
): CsrPerformanceRow | null {
  const name = String(sub.salesPayroll?.name || sub.label || "").trim();
  if (!name) return null;
  const row = emptyCsrRow(name, teamTitle, sub);
  const raw = sub.salesPayroll?.commission;
  const commission: SalesCommissionFields = {
    oldClientProjects: Number(raw?.oldClientProjects) || 0,
    oldClientPartialCount: Number(raw?.oldClientPartialCount) || 0,
    newClientProjects: Number(raw?.newClientProjects) || 0,
    fixClientProjects: (raw?.fixClientProjects ?? []).map((p, i) => ({
      id: String(p.id ?? `fix-${i}`),
      clientName: String(p.clientName ?? ""),
      projectPay: Number(p.projectPay) || 0,
      currency: p.currency === "CAD" ? "CAD" : "USD",
      fxRate: Number(p.fxRate) || 0,
      slabKey: p.slabKey as ProjectSlabKey | undefined,
      projectCount: Number(p.projectCount) || undefined,
    })),
  };
  const calc = calcSalesCommission(commission, row.role, opts);
  const fixPay = commission.fixClientProjects.reduce((s, p) => s + (Number(p.projectPay) || 0), 0);
  return {
    ...row,
    oldProjects: Number(commission.oldClientProjects) || 0,
    partialCount: Number(commission.oldClientPartialCount) || 0,
    newProjects: Number(commission.newClientProjects) || 0,
    fixProjects: commission.fixClientProjects.reduce((s, p) => s + fixRowProjectCount(p), 0),
    fixPay,
    projects: calc.totalProjects,
    oldComm: calc.oldComm,
    newComm: calc.newComm,
    fixComm: calc.fixComm,
    totalCommission: calc.totalCommission,
    fixClients: commission.fixClientProjects.map(p => ({
      clientName: String(p.clientName || "—").trim() || "—",
      projectPay: Number(p.projectPay) || 0,
      currency: p.currency === "CAD" ? "CAD" : "USD",
    })),
  };
}

function monthShortName(ym: string): string {
  const [y, mm] = ym.split("-").map(Number);
  if (!y || !mm) return ym;
  return new Date(Date.UTC(y, mm - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lastNMonthsInclusive(endYm: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftMonth(endYm, i - (n - 1)));
}

function notesText(row: { notes?: { text?: string }[]; note?: string }): string {
  const notes = (row.notes ?? []).map(n => String(n.text ?? "").trim()).filter(Boolean);
  if (notes.length) return notes.join(" · ");
  return String(row.note ?? "").trim();
}

function money(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

const INCOME_BUDGET_STORE_DATE = "2000-01-01";

type BudgetCompareRow = {
  key: string;
  name: string;
  kind: "core" | "opex_head";
  budget: number;
  actual: number;
  variance: number;
};

function budgetLineAmount(line: {
  months?: Record<string, number>;
  budget?: number;
}, month: string): number {
  const fromMonth = Number(line.months?.[month]);
  if (Number.isFinite(fromMonth) && fromMonth > 0) return fromMonth;
  if (Number.isFinite(fromMonth) && fromMonth === 0 && line.months && month in line.months) return 0;
  return Math.max(0, Number(line.budget) || 0);
}

function findBudgetPeriod(store: Record<string, unknown>, month: string) {
  const quarters = Array.isArray(store.quarters) ? store.quarters : [];
  return quarters.find(raw => {
    const q = raw as {
      monthKeys?: string[];
      fromDate?: string;
      toDate?: string;
      startMonth?: string;
      endMonth?: string;
    };
    if ((q.monthKeys ?? []).includes(month)) return true;
    const from = String(q.fromDate || q.startMonth || "").slice(0, 7);
    const to = String(q.toDate || q.endMonth || "").slice(0, 7);
    return /^\d{4}-\d{2}$/.test(from) && /^\d{4}-\d{2}$/.test(to) && from <= month && month <= to;
  }) as { lines?: Array<{ key?: string; label?: string; kind?: string; months?: Record<string, number>; budget?: number }> } | undefined;
}

function buildBudgetCompare(
  month: string,
  snapshot: Record<string, unknown>,
  revenue: number,
  budgetStore: Record<string, unknown> | null,
): {
  hasBudget: boolean;
  rows: BudgetCompareRow[];
  totals: {
    budgetRevenue: number;
    actualRevenue: number;
    budgetExpense: number;
    actualExpense: number;
    variance: number;
  };
} {
  const emptyTotals = {
    budgetRevenue: 0,
    actualRevenue: 0,
    budgetExpense: 0,
    actualExpense: 0,
    variance: 0,
  };
  const actuals = emptyCoreActuals();
  accumulateCoreBudget(snapshot, actuals, revenue, `${month}-01`);
  const opexInto: Record<string, OpexHeadBucket> = {};
  accumulateOpexHeads(snapshot, opexInto);

  const period = budgetStore ? findBudgetPeriod(budgetStore, month) : undefined;
  if (!period) {
    return { hasBudget: false, rows: [], totals: emptyTotals };
  }

  const rows: BudgetCompareRow[] = [];
  const seen = new Set<string>();
  for (const line of period.lines ?? []) {
    const key = String(line.key ?? "").trim();
    if (!key) continue;
    const budget = money(budgetLineAmount(line, month));
    let actual = 0;
    let kind: "core" | "opex_head" = "core";
    if (key in actuals) {
      actual = money(actuals[key as CoreBudgetKey]);
    } else if (key.startsWith("opex_head::") || line.kind === "opex_head") {
      kind = "opex_head";
      actual = money(opexInto[key]?.amount ?? 0);
    }
    if (budget === 0 && actual === 0) continue;
    seen.add(key);
    rows.push({
      key,
      name: String(line.label || CORE_BUDGET_LINE_DEFS.find(d => d.key === key)?.label || key),
      kind,
      budget,
      actual,
      variance: money(actual - budget),
    });
  }

  for (const [key, bucket] of Object.entries(opexInto)) {
    if (seen.has(key) || !bucket.amount) continue;
    rows.push({
      key,
      name: bucket.label,
      kind: "opex_head",
      budget: 0,
      actual: money(bucket.amount),
      variance: money(bucket.amount),
    });
  }

  const order = CORE_BUDGET_LINE_DEFS.map(d => d.key);
  rows.sort((a, b) => {
    const ia = order.indexOf(a.key as CoreBudgetKey);
    const ib = order.indexOf(b.key as CoreBudgetKey);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    if (a.kind !== b.kind) return a.kind === "core" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const budgetRevenue = rows.find(r => r.key === "revenue")?.budget ?? 0;
  const actualRevenue = rows.find(r => r.key === "revenue")?.actual ?? 0;
  const budgetExpense = rows.filter(r => r.key !== "revenue").reduce((a, r) => a + r.budget, 0);
  const actualExpense = rows.filter(r => r.key !== "revenue").reduce((a, r) => a + r.actual, 0);
  return {
    hasBudget: true,
    rows,
    totals: {
      budgetRevenue: money(budgetRevenue),
      actualRevenue: money(actualRevenue),
      budgetExpense: money(budgetExpense),
      actualExpense: money(actualExpense),
      variance: money(actualExpense - budgetExpense),
    },
  };
}

const HAMMAD_TEAM_LEAD_ID = "stl-hammad";

function tlExtraForLead(
  lead: SalesPayrollEmployee,
  salesPeers: SalesPayrollEmployee[],
  opts?: SalesPayrollCalcOpts,
): number {
  const leadId = String(lead.id || "").trim();
  const isHammad = leadId === HAMMAD_TEAM_LEAD_ID || /^hammad$/i.test(lead.name.trim());
  return salesPeers
    .filter(p => {
      if (!p.assignedToLead) return false;
      const tid = String(p.assignedTeamLeadId || "").trim();
      if (!tid) return isHammad;
      return tid === leadId || (isHammad && tid === HAMMAD_TEAM_LEAD_ID);
    })
    .reduce((sum, p) => sum + calcTlAssignedCommission(p, opts), 0);
}

function storedAmount(sub: SubHead, fallback: number): number {
  const n = Number(sub.amount);
  return Number.isFinite(n) ? money(n) : money(fallback);
}

function salesEmpFromSub(teamTitle: string, sub: SubHead): SalesPayrollEmployee {
  const sp = sub.salesPayroll;
  const role: "sales" | "team_lead" =
    sp?.role === "team_lead" || /lead/i.test(teamTitle) ? "team_lead" : "sales";
  const raw = sp?.commission;
  return {
    id: String(sp?.id || sub.id || sub.label || "sales"),
    name: String(sp?.name || sub.label || ""),
    code: String(sp?.code ?? ""),
    role,
    basic: Number(sp?.basic) || 0,
    allowance: Number(sp?.allowance) || 0,
    homeAllowance: Number(sp?.homeAllowance) || 0,
    fuelAllowance: Number(sp?.fuelAllowance) || 0,
    medicalAllowance: Number(sp?.medicalAllowance) || 0,
    commission: {
      oldClientProjects: Number(raw?.oldClientProjects) || 0,
      oldClientPartialCount: Number(raw?.oldClientPartialCount) || 0,
      newClientProjects: Number(raw?.newClientProjects) || 0,
      fixClientProjects: (raw?.fixClientProjects ?? []).map((p, i) => ({
        id: String(p.id ?? `fix-${i}`),
        clientName: String(p.clientName ?? ""),
        projectPay: Number(p.projectPay) || 0,
        currency: p.currency === "CAD" ? "CAD" : "USD",
        fxRate: Number(p.fxRate) || 0,
        slabKey: p.slabKey as ProjectSlabKey | undefined,
        projectCount: Number(p.projectCount) || undefined,
      })),
    },
    assignedToLead: !!sp?.assignedToLead,
    assignedTeamLeadId: sp?.assignedTeamLeadId ?? null,
    checkIn: String(sp?.checkIn || "18:00"),
    lateDeductionOverride: sp?.lateDeductionOverride ?? null,
    paidLeaveDays: Number(sp?.paidLeaveDays) || 0,
    unpaidLeaveDays: Number(sp?.unpaidLeaveDays) || 0,
    loanTotal: Number(sp?.loanTotal) || 0,
    loanPaid: Number(sp?.loanPaid) || 0,
    loanThisMonth: Number(sp?.loanThisMonth) || 0,
    incomeTax: Number(sp?.incomeTax) || 0,
    remarks: String(sp?.remarks ?? ""),
  };
}

export type SalaryFieldTable = {
  name: string;
  kind: string;
  total: number;
  filledAt?: string;
  columns: string[];
  rows: { employee: string; cells: (string | number)[] }[];
};

export type OpexFieldTable = {
  name: string;
  amount: number;
  filledAt: string;
  notes: string;
  lines: { label: string; amount: number; filledAt: string; proofName: string }[];
};

function buildSalaryTables(data: Record<string, unknown>, opts?: SalesPayrollCalcOpts): SalaryFieldTable[] {
  const teams = (data.teamSalaries as HeadRow[]) ?? [];
  const salesPeers = teams
    .filter(t => isSalesCsrTeam(String(t.team ?? "")) && !/lead/i.test(String(t.team ?? "")))
    .flatMap(t => (t.subHeads ?? []).map(s => salesEmpFromSub(String(t.team ?? ""), s)));

  return teams.map(team => {
    const title = String(team.team ?? "Untitled");
    const lower = title.toLowerCase();
    const isLead = lower.includes("sales team lead") || lower.includes("team lead sal");
    const isSales = isSalesCsrTeam(title);
    const isExec = lower.includes("executive");
    const subs = team.subHeads ?? [];

    if (isSales) {
      const columns = [
        "Employee", "Commission", "Basic", "Allowance", "Late", "Unpaid",
        "Loan", "Remaining", "PF", "Tax", "Deduct", "Occas.", "Net",
      ];
      const rows = subs.map(s => {
        const sp = salesEmpFromSub(title, s);
        const extra = isLead ? tlExtraForLead(sp, salesPeers, opts) : 0;
        const b = computeSalesEmployeePayroll(sp, extra, opts);
        const cells: (string | number)[] = [
          s.label || sp.name,
          money(b.totalCommission + extra),
          money(sp.basic),
          money(sp.allowance),
          money(b.lateDeduction),
          money(b.unpaidLeaveDeduction),
          money(sp.loanThisMonth),
          money(b.loanRemaining),
          money(b.pf),
          money(sp.incomeTax),
          money(b.totalDeduction),
          money(Number(s.salesPayroll?.occasionalAmount) || 0),
          storedAmount(s, b.netSalary),
        ];
        return { employee: String(s.label || sp.name), cells };
      });
      return {
        name: title,
        kind: isLead ? "sales_lead" : "sales",
        total: lineTotal(team),
        filledAt: team.filledAt,
        columns,
        rows,
      };
    }

    if (isExec) {
      const columns = [
        "Executive", "Basic", "Comm. %", "Commission", "Salary", "Loan +ve", "Loan −ve", "Occas.", "PF", "Total due",
      ];
      const rows = subs.map(s => {
        const sal = s.salary;
        const basic = Number(sal?.basic) || 0;
        const total = Number(s.amount) || 0;
        const loanPositive = Number(sal?.loanPositive) || 0;
        const loanNegative = Number(sal?.loanNegative) || 0;
        const occasional = Number(sal?.occasionalAmount) || 0;
        const commission = Math.max(0, total - basic - loanPositive + loanNegative - occasional);
        const cells: (string | number)[] = [
          String(s.label ?? "—"),
          money(basic),
          Number(sal?.commissionPct) || 0,
          money(commission),
          money(basic + commission),
          money(loanPositive),
          money(loanNegative),
          money(occasional),
          0,
          money(total),
        ];
        return { employee: String(s.label ?? "—"), cells };
      });
      return {
        name: title,
        kind: "executive",
        total: lineTotal(team),
        filledAt: team.filledAt,
        columns,
        rows,
      };
    }

    const columns = [
      "Employee", "Basic", "Allowance", "OT", "Earning", "Late", "Unpaid",
      "Loan", "Remaining", "PF", "Tax", "Deduct", "Occas.", "Net",
    ];
    const rows = subs.map(s => {
      const sal = s.salary;
      const detail = emptyTechnicalSalary({
        basic: Number(sal?.basic) || 0,
        allowance: Number(sal?.allowance) || 0,
        weekdayOtHours: Number(sal?.weekdayOtHours) || 0,
        weekendOtHours: Number(sal?.weekendOtHours) || 0,
        checkIn: String(sal?.checkIn || "07:00"),
        checkOut: String(sal?.checkOut || "16:00"),
        lateDeductionOverride: sal?.lateDeductionOverride ?? null,
        paidLeaveDays: Number(sal?.paidLeaveDays) || 0,
        unpaidLeaveDays: Number(sal?.unpaidLeaveDays) || 0,
        loanTotal: Number(sal?.loanTotal) || 0,
        loanPaid: Number(sal?.loanPaid) || 0,
        loanThisMonth: Number(sal?.loanThisMonth) || 0,
        incomeTax: Number(sal?.incomeTax) || 0,
        occasionalAmount: Number(sal?.occasionalAmount) || 0,
        pfAuto: sal?.pfAuto !== false,
        pfOverride: sal?.pfOverride ?? null,
        remarks: String(sal?.remarks ?? ""),
      });
      const b = computeTechnicalSalary(detail);
      const net = storedAmount(s, b.totalSalary);
      const cells: (string | number)[] = [
        String(s.label ?? "—"),
        money(detail.basic),
        money(detail.allowance),
        money(b.totalOvertime),
        money(b.totalEarning),
        money(b.lateDeduction),
        money(b.unpaidLeaveDeduction),
        money(b.loanThisMonth),
        money(b.loanRemaining),
        money(b.pf),
        money(b.incomeTax),
        money(b.totalDeduction),
        money(b.occasionalAmount),
        money(net),
      ];
      return { employee: String(s.label ?? "—"), cells };
    });
    return {
      name: title,
      kind: "technical",
      total: lineTotal(team),
      filledAt: team.filledAt,
      columns,
      rows,
    };
  });
}

function buildOpexTables(data: Record<string, unknown>, key: "opexHeads" | "loanHeads" | "providentFundHeads"): OpexFieldTable[] {
  return ((data[key] as HeadRow[]) ?? []).map(row => ({
    name: String(row.label ?? "Untitled").trim() || "Untitled",
    amount: lineTotal(row),
    filledAt: String(row.filledAt ?? ""),
    notes: notesText(row),
    lines: (row.subHeads ?? []).map(s => ({
      label: String(s.label ?? "—").trim() || "—",
      amount: Number(s.amount) || 0,
      filledAt: String(s.filledAt ?? ""),
      proofName: String(s.proofName ?? ""),
    })),
  }));
}

function loanIssuedThisMonth(s: SubHead): number {
  const thisMonth = Number(s.salesPayroll?.loanThisMonth ?? s.salary?.loanThisMonth) || 0;
  if (thisMonth > 0) return money(thisMonth);
  const given = Number(s.salary?.loanPositive) || 0;
  if (given > 0) return money(given);
  const recover = Number(s.salary?.loanNegative) || 0;
  if (recover > 0) return money(recover);
  return 0;
}

function loanHeadForTeam(teamTitle: string): string {
  const t = teamTitle.trim().toLowerCase();
  if (t.includes("executive")) return "Executive Loans";
  if (t.includes("admin")) return "Administration Loans";
  if (t.includes("technical")) return "Technical Team Loans";
  if (t.includes("sales")) return "Sales Team Loans";
  return "Other Loans";
}

/** Report loans = this-month issued amount, even after salary deduction. */
function buildLoanTablesFromPayroll(data: Record<string, unknown>): OpexFieldTable[] {
  const groups = new Map<string, OpexFieldTable>();
  for (const team of (data.teamSalaries as HeadRow[]) ?? []) {
    const head = loanHeadForTeam(String(team.team ?? ""));
    for (const s of team.subHeads ?? []) {
      const amount = loanIssuedThisMonth(s);
      if (amount <= 0) continue;
      const name = String(s.label || s.salesPayroll?.name || "—").trim() || "—";
      const g = groups.get(head) ?? {
        name: head,
        amount: 0,
        filledAt: String(team.filledAt ?? ""),
        notes: "This month loan — shown as issued, even if already deducted",
        lines: [],
      };
      g.lines.push({
        label: name,
        amount,
        filledAt: String(s.filledAt ?? team.filledAt ?? ""),
        proofName: "",
      });
      g.amount = money(g.amount + amount);
      groups.set(head, g);
    }
  }
  return [...groups.values()];
}

/**
 * CSR Team Performance — every Sales Team + Sales Team Lead person as their own row,
 * with separate columns for each project / commission field.
 * Last daily entry in the month wins per person.
 */
function aggregateCsrFromSalesPayroll(
  records: Record<string, unknown>[],
  opts?: SalesPayrollCalcOpts,
  monthYm?: string,
): CsrPerformanceReport {
  const byName = new Map<string, CsrPerformanceRow>();
  for (const data of records) {
    const teams = (data.teamSalaries as HeadRow[]) ?? [];
    for (const team of teams) {
      const title = String(team.team ?? "");
      if (!isSalesCsrTeam(title)) continue;
      for (const s of team.subHeads ?? []) {
        const row = csrRowFromSub(title, s, opts);
        if (!row) continue;
        byName.set(row.name, row);
      }
    }
  }

  const rows = [...byName.values()].sort(
    (a, b) =>
      b.projects - a.projects ||
      b.totalCommission - a.totalCommission ||
      a.name.localeCompare(b.name),
  );

  const totalProjects = rows.reduce((a, r) => a + r.projects, 0);
  const monthLabel = monthYm ? monthShortName(monthYm) : "";
  const withShare = rows.map((r, i) => {
    const share = totalProjects > 0 ? (r.projects / totalProjects) * 100 : 0;
    const status =
      r.projects <= 0 ? "Below Expectation" : i === 0 && share > 0 ? "Top Performer" : "Active";
    const note =
      r.projects <= 0
        ? `No projects closed in ${monthLabel || "this month"}`
        : i === 0
          ? "Highest individual contribution"
          : share >= 30
            ? "Consistent top performer"
            : r.projects < 5
              ? "New — building momentum"
              : "Active contributor";
    return { ...r, share, status, note };
  });

  return {
    totalProjects,
    totals: {
      oldProjects: withShare.reduce((a, r) => a + r.oldProjects, 0),
      partialCount: withShare.reduce((a, r) => a + r.partialCount, 0),
      newProjects: withShare.reduce((a, r) => a + r.newProjects, 0),
      fixProjects: withShare.reduce((a, r) => a + r.fixProjects, 0),
      fixPay: withShare.reduce((a, r) => a + r.fixPay, 0),
      oldComm: withShare.reduce((a, r) => a + r.oldComm, 0),
      newComm: withShare.reduce((a, r) => a + r.newComm, 0),
      fixComm: withShare.reduce((a, r) => a + r.fixComm, 0),
      totalCommission: withShare.reduce((a, r) => a + r.totalCommission, 0),
    },
    rows: withShare,
  };
}

function categorySum(data: Record<string, unknown>, key: string): number {
  return ((data[key] as HeadRow[]) ?? []).reduce((a, r) => a + lineTotal(r), 0);
}

function monthEndIso(month: string): string {
  const [y, mm] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

export async function getMonthlyAccountsReport(req: AuthRequest, res: Response) {
  try {
    const month = String(req.query.month ?? "").trim(); // YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: "Invalid month. Use YYYY-MM." });
    }
    const monthEnd = monthEndIso(month);

    const isRecords = await prisma.accountsRecord.findMany({
      where: { page: "income_statement" },
      select: { recordDate: true, data: true },
      orderBy: { recordDate: "asc" },
    });

    const dashRecords = await prisma.accountsRecord.findMany({
      where: { page: "dashboard" },
      select: { recordDate: true, data: true },
    });
    const collectionsByMonth = await aggregateAllCollectionMonths();
    const dashForMonth = (ym: string) => {
      const inMonth = dashRecords.filter(r => yearMonthFromDate(r.recordDate) === ym);
      const picked = pickLatestMeaningful(inMonth);
      const raw =
        (picked?.data as Record<string, unknown> | undefined) ??
        defaultAccountsData("dashboard");
      return applyCollectionsToDashboardData(
        raw,
        collectionsByMonth.get(ym) ?? emptyDayCollections(),
      );
    };
    const revenueForMonth = (ym: string) => currencyFormulaTotalFromDashboard(dashForMonth(ym));

    const lastByMonth = new Map<string, { date: string; data: Record<string, unknown>; days: number }>();
    const pickedByMonth = pickLatestMeaningfulByMonth(isRecords);
    const daysByMonth = new Map<string, number>();
    for (const rec of isRecords) {
      const m = rec.recordDate.slice(0, 7);
      daysByMonth.set(m, (daysByMonth.get(m) ?? 0) + 1);
    }
    for (const [m, rec] of pickedByMonth) {
      lastByMonth.set(m, {
        date: rec.recordDate,
        data: prepareIncomeStatementData(rec.data as Record<string, unknown>),
        days: daysByMonth.get(m) ?? 1,
      });
    }

    const windowMonths = lastNMonthsInclusive(month, 6);
    const history = windowMonths.map(ym => {
      const snap = lastByMonth.get(ym);
      const revenueM = revenueForMonth(ym);
      const cost = snap ? isRowExpense(snap.data) : 0;
      return {
        month: ym,
        revenue: revenueM,
        cost,
        net: revenueM - cost,
        days: snap?.days ?? 0,
        lastDate: snap?.date ?? monthStartIso(ym),
      };
    });

    const monthSnap = lastByMonth.get(month);
    const lastDateInMonth = monthSnap?.date ?? null;
    const snapshot = monthSnap?.data ?? {};
    const monthRecords = monthSnap ? [{ ...snapshot, totalRevenue: revenueForMonth(month) }] : [];
    const revenue = revenueForMonth(month);
    const revenueChannels = currencyFormulaBreakdownFromDashboard(dashForMonth(month));
    const salaryTeams = aggregateCategory(monthRecords, "teamSalaries", "team");
    const opexHeads = aggregateCategory(monthRecords, "opexHeads", "label");
    const loanHeads = aggregateCategory(monthRecords, "loanHeads", "label");
    const pfHeads = aggregateCategory(monthRecords, "providentFundHeads", "label");
    const executives = aggregateExecutives(monthRecords);
    const opexTables = monthSnap ? buildOpexTables(snapshot, "opexHeads") : [];
    const loanTables = monthSnap ? buildLoanTablesFromPayroll(snapshot) : [];
    const pfTables = monthSnap ? buildOpexTables(snapshot, "providentFundHeads") : [];

    const payroll = monthSnap ? categorySum(snapshot, "teamSalaries") : 0;
    const opex = monthSnap ? categorySum(snapshot, "opexHeads") : 0;
    const loans = loanTables.reduce((a, t) => a + t.amount, 0);
    const pf = monthSnap ? categorySum(snapshot, "providentFundHeads") : 0;
    const totalCost = payroll + opex;
    const netProfit = revenue - totalCost;

    const cfRecords = await prisma.accountsRecord.findMany({
      where: { page: "cash_flow" },
      select: { recordDate: true, data: true },
      orderBy: { recordDate: "desc" },
    });
    const cfInMonth = cfRecords.filter(r => r.recordDate.startsWith(month));
    const cfRecord =
      cfInMonth[0] ??
      cfRecords.find(r => r.recordDate <= monthEnd) ??
      cfRecords[0] ??
      null;

    const bankDebit = new Map<string, number>();
    const bankCredit = new Map<string, number>();
    const sectionNets = new Map<string, number>();
    const cashLedger: {
      section: string;
      date: string;
      description: string;
      banks: { bank: string; debit: number; credit: number }[];
      debit: number;
      credit: number;
      net: number;
    }[] = [];
    let closingNet = 0;
    let monthNet = 0;
    let monthEntries = 0;
    let bankHeads: string[] = [];

    const rowNet = (row: CashFlowRow): number => {
      let debit = 0;
      let credit = 0;
      for (const amt of Object.values(row.bankAmounts ?? {})) {
        debit += Number(amt?.debit) || 0;
        credit += Number(amt?.credit) || 0;
      }
      if (debit === 0 && credit === 0) return Number(row.netAmount) || 0;
      return debit - credit;
    };

    if (cfRecord) {
      const cf = cfRecord.data as CashFlowData;
      bankHeads = cf.bankHeads ?? [];
      for (const m of cf.months ?? []) {
        const sectionName = String(m.month || "Section");
        for (const row of m.rows ?? []) {
          const date = String(row.date ?? "");
          if (date && date > monthEnd) continue;
          const net = rowNet(row);
          closingNet += net;
          const inMonth = !date || date.startsWith(month);
          if (inMonth) {
            monthNet += net;
            monthEntries += 1;
            sectionNets.set(sectionName, (sectionNets.get(sectionName) ?? 0) + net);
            let debit = 0;
            let credit = 0;
            const heads = bankHeads.length ? bankHeads : Object.keys(row.bankAmounts ?? {});
            const banks = heads.map(bank => {
              const amt = row.bankAmounts?.[bank];
              const d = Number(amt?.debit) || 0;
              const c = Number(amt?.credit) || 0;
              debit += d;
              credit += c;
              bankDebit.set(bank, (bankDebit.get(bank) ?? 0) + d);
              bankCredit.set(bank, (bankCredit.get(bank) ?? 0) + c);
              return { bank, debit: d, credit: c };
            });
            cashLedger.push({
              section: sectionName,
              date,
              description: String(row.description ?? "").trim() || "—",
              banks,
              debit,
              credit,
              net,
            });
          }
        }
      }
    }

    const cashBanks = (bankHeads.length ? bankHeads : [...new Set([...bankDebit.keys(), ...bankCredit.keys()])]).map(bank => {
      const debit = bankDebit.get(bank) ?? 0;
      const credit = bankCredit.get(bank) ?? 0;
      return { bank, debit, credit, balance: debit - credit };
    });
    const cashSections = [...sectionNets.entries()].map(([name, net]) => ({
      name: name.slice(0, 24),
      net,
    }));

    const csrOpts: SalesPayrollCalcOpts = { recordDate: lastDateInMonth || `${month}-01` };
    if (month >= "2026-08") {
      try {
        const fx = await fetchLiveFxRates();
        csrOpts.usdToPkr = fx.usdToPkr;
        csrOpts.cadToPkr = fx.cadToPkr;
      } catch {
        /* stored project fxRate still applies */
      }
    }
    const salaryTables = monthSnap ? buildSalaryTables(snapshot, csrOpts) : [];
    const csr = aggregateCsrFromSalesPayroll(monthRecords, csrOpts, month);

    let budgetStore: Record<string, unknown> | null = null;
    try {
      const budgetRec = await prisma.accountsRecord.findFirst({
        where: { page: "income_budget", recordDate: INCOME_BUDGET_STORE_DATE },
        select: { data: true },
      });
      if (budgetRec?.data && typeof budgetRec.data === "object") {
        budgetStore = budgetRec.data as Record<string, unknown>;
      }
    } catch {
      budgetStore = null;
    }
    const budgetCompare = buildBudgetCompare(month, snapshot, revenue, budgetStore);

    return res.json({
      success: true,
      month,
      sourceDate: lastDateInMonth,
      monthEnd,
      mode: "income_statement_snapshot",
      totals: { revenue, payroll, opex, loans, pf, totalCost, netProfit },
      revenueChannels,
      history,
      salaryTeams,
      salaryTables,
      opexHeads,
      opexTables,
      loanHeads,
      loanTables,
      pfHeads,
      pfTables,
      executives,
      cash: {
        banks: cashBanks,
        sections: cashSections,
        monthNet,
        closingNet,
        monthEntries,
        asOf: cfRecord?.recordDate ?? null,
        ledger: cashLedger,
      },
      csr,
      budgetCompare,
      daysRecorded: monthSnap?.days ?? 0,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: "Failed to build monthly report." });
  }
}

/** POST — upload generated Word report to Cloudinary + DB archive. */
export async function saveMonthlyAccountsReport(
  req: AuthRequest & { file?: Express.Multer.File },
  res: Response,
) {
  try {
    const month = String(req.body?.month ?? req.query.month ?? "").trim();
    const sourceDate = String(req.body?.sourceDate ?? "").trim() || null;
    const file = req.file;

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: "Invalid month. Use YYYY-MM." });
    }
    if (!file) {
      return res.status(400).json({ success: false, message: "No report file uploaded." });
    }
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }

    let totals: Prisma.InputJsonValue | undefined;
    if (req.body?.totals) {
      try {
        totals =
          typeof req.body.totals === "string"
            ? (JSON.parse(req.body.totals) as Prisma.InputJsonValue)
            : (req.body.totals as Prisma.InputJsonValue);
      } catch {
        totals = undefined;
      }
    }

    const originalName = file.originalname || `BEM-Executive-Summary-${month}.doc`;
    const isPdf =
      file.mimetype === "application/pdf" || originalName.toLowerCase().endsWith(".pdf");
    const publicId = `bem-exec-${month}-${Date.now()}`;
    const uploaded = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: ACCOUNTS_CLOUDINARY_FOLDERS.monthlyReports,
          resource_type: "raw",
          public_id: publicId,
          format: isPdf ? "pdf" : "doc",
        },
        (error, result) => {
          if (error || !result) reject(error ?? new Error("Cloudinary upload failed"));
          else resolve(result as { secure_url: string; public_id: string });
        },
      );
      streamifier.createReadStream(file.buffer).pipe(stream);
    });

    const row = await prisma.accountsMonthlyReport.create({
      data: {
        month,
        fileName: originalName,
        fileUrl: uploaded.secure_url,
        mimeType: file.mimetype || (isPdf ? "application/pdf" : "application/msword"),
        sourceDate,
        cloudinaryPublicId: uploaded.public_id,
        totals: totals ?? undefined,
        uploadedBy: req.user.id,
      },
    });

    return res.json({
      success: true,
      report: {
        id: row.id,
        month: row.month,
        fileName: row.fileName,
        fileUrl: row.fileUrl,
        sourceDate: row.sourceDate,
        createdAt: row.createdAt,
        totals: row.totals,
      },
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: "Failed to save monthly report to Cloudinary." });
  }
}

/** GET — list archived monthly reports (optional ?month=YYYY-MM). */
export async function listMonthlyAccountsReports(req: AuthRequest, res: Response) {
  try {
    const month = String(req.query.month ?? "").trim();
    const where = /^\d{4}-\d{2}$/.test(month) ? { month } : {};
    const rows = await prisma.accountsMonthlyReport.findMany({
      where,
      orderBy: [{ month: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        month: true,
        fileName: true,
        fileUrl: true,
        sourceDate: true,
        createdAt: true,
        totals: true,
      },
    });
    return res.json({ success: true, reports: rows });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: "Failed to list saved reports." });
  }
}
