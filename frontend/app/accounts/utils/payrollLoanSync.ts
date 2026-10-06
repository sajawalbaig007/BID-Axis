import API from "@/lib/api";
import type { IncomeStatementData, SubHeadEntry } from "../types";
import { resolvePayrollKind, type PayrollKind } from "./salesPayrollBridge";

export type PayrollLoanUpsert = {
  employeeName: string;
  department: string;
  totalAmount: number;
  paidAmount: number;
};

/** Map payroll team kind → loan registry department key */
export function departmentForPayrollKind(kind: PayrollKind): string {
  switch (kind) {
    case "sales":
      return "sales_team";
    case "sales_lead":
      return "sales_team_lead";
    case "admin":
      return "administration";
    case "executive":
      return "executive";
    case "technical_manager":
      return "technical_manager";
    case "technical":
    default:
      return "technical_team";
  }
}

/** Ledger paid = already paid + this month's installment (capped at total). */
export function ledgerPaidAmount(loanPaid: number, loanThisMonth: number, loanTotal: number): number {
  const total = Math.max(0, Number(loanTotal) || 0);
  const paid = Math.max(0, (Number(loanPaid) || 0) + (Number(loanThisMonth) || 0));
  return total > 0 ? Math.min(paid, total) : paid;
}

export async function upsertPayrollLoan(entry: PayrollLoanUpsert): Promise<void> {
  const name = entry.employeeName.trim();
  if (!name) return;
  const total = Number(entry.totalAmount) || 0;
  const paid = Number(entry.paidAmount) || 0;
  // Skip empty loans so we don't spam the registry
  if (total <= 0 && paid <= 0) return;
  await API.post("/accounts/payroll-loans", {
    employeeName: name,
    department: entry.department,
    totalAmount: total,
    paidAmount: paid,
  });
}

function loanFromSub(sub: SubHeadEntry, department: string): PayrollLoanUpsert | null {
  const name = (sub.label || sub.salesPayroll?.name || "").trim();
  if (!name) return null;

  if (sub.salesPayroll) {
    const sp = sub.salesPayroll;
    return {
      employeeName: name,
      department,
      totalAmount: Number(sp.loanTotal) || 0,
      paidAmount: ledgerPaidAmount(sp.loanPaid, sp.loanThisMonth, sp.loanTotal),
    };
  }

  if (sub.salary) {
    const sal = sub.salary;
    return {
      employeeName: name,
      department,
      totalAmount: Number(sal.loanTotal) || 0,
      paidAmount: ledgerPaidAmount(sal.loanPaid, sal.loanThisMonth, sal.loanTotal),
    };
  }

  return null;
}

/** Collect loan rows from income-statement team salaries. */
export function collectLoansFromIncomeStatement(data: IncomeStatementData): PayrollLoanUpsert[] {
  const out: PayrollLoanUpsert[] = [];
  for (const team of data.teamSalaries ?? []) {
    const kind = resolvePayrollKind(team.team, team.subHeads);
    const department = departmentForPayrollKind(kind);
    for (const sub of team.subHeads ?? []) {
      const entry = loanFromSub(sub, department);
      if (entry && (entry.totalAmount > 0 || entry.paidAmount > 0)) {
        out.push(entry);
      }
    }
  }
  return out;
}

/** After payroll save — write each employee loan into the shared ledger. */
export async function syncLoansFromIncomeStatement(data: IncomeStatementData): Promise<number> {
  const loans = collectLoansFromIncomeStatement(data);
  if (!loans.length) return 0;
  await Promise.all(loans.map(l => upsertPayrollLoan(l)));
  return loans.length;
}

function normLoanName(n: string) {
  return n.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Clear salary / salesPayroll loan fields for a person (so Loans table sync drops them). */
export function clearPersonLoanFromTeamSalaries(
  teams: IncomeStatementData["teamSalaries"],
  employeeName: string,
): IncomeStatementData["teamSalaries"] {
  const q = normLoanName(employeeName);
  if (!q) return teams;
  return (teams ?? []).map(team => ({
    ...team,
    subHeads: (team.subHeads ?? []).map(sub => {
      const name = normLoanName(sub.label || sub.salesPayroll?.name || "");
      if (!name || name !== q) return sub;
      let next = sub;
      if (sub.salesPayroll) {
        next = {
          ...next,
          salesPayroll: {
            ...sub.salesPayroll,
            loanTotal: 0,
            loanPaid: 0,
            loanThisMonth: 0,
          },
        };
      }
      if (sub.salary) {
        next = {
          ...next,
          salary: {
            ...((next.salary ?? sub.salary)!),
            loanTotal: 0,
            loanPaid: 0,
            loanThisMonth: 0,
            loanPositive: 0,
            loanNegative: 0,
          },
        };
      }
      return next;
    }),
  }));
}

/** Delete ledger row(s) matching employee name. */
export async function deletePayrollLoanByName(employeeName: string): Promise<void> {
  const q = employeeName.trim();
  if (!q) return;
  try {
    const res = await API.get(`/accounts/payroll-loans/lookup?name=${encodeURIComponent(q)}`);
    const loan = res.data.loan as { id?: string } | null;
    if (loan?.id) await API.delete(`/accounts/payroll-loans/${loan.id}`);
  } catch {
    /* ignore */
  }
}
