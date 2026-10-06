/**
 * Apply shared payroll-loan ledger → employee salary loan fields.
 * Pending = total − paid. Fully paid → clear salary loan fields.
 */

import API from "@/lib/api";
import type { SubHeadEntry } from "../types";
import { withSyncedPayrollAmount } from "./payrollAmountSync";
import { departmentForPayrollKind } from "./payrollLoanSync";
import { resolvePayrollKind } from "./salesPayrollBridge";

export type LedgerLoan = {
  employeeName: string;
  department?: string;
  totalAmount: number;
  paidAmount: number;
};

export type SalaryLoanFields = {
  loanTotal: number;
  loanPaid: number;
  loanThisMonth: number;
};

function normName(n: string) {
  return n.trim().toLowerCase().replace(/\s+/g, " ");
}

export function ledgerPending(loan: { totalAmount?: number; paidAmount?: number } | null | undefined): number {
  if (!loan) return 0;
  return Math.max(0, (Number(loan.totalAmount) || 0) - (Number(loan.paidAmount) || 0));
}

/** Find ledger row for this employee only — exact name, same team when set. */
export function matchLedgerLoan(
  loans: LedgerLoan[],
  name: string,
  department?: string,
): LedgerLoan | null {
  const q = normName(name);
  if (!q) return null;
  const sameName = loans.filter(l => normName(l.employeeName) === q);
  if (!sameName.length) return null;
  if (department) {
    const dept = sameName.find(l => l.department === department);
    if (dept) return dept;
    return sameName.length === 1 ? sameName[0] : null;
  }
  return sameName[0] ?? null;
}

/**
 * Build next loan fields from ledger.
 * - Pending > 0 → auto-fill Total / Paid (keep this-month unless force)
 * - Pending = 0 → clear all loan salary fields
 * Returns null when nothing should change.
 */
export function applyPendingLoanFromLedger(
  current: SalaryLoanFields,
  ledger: { totalAmount?: number; paidAmount?: number } | null | undefined,
  opts?: { force?: boolean },
): SalaryLoanFields | null {
  if (!ledger) return null;

  const total = Math.max(0, Number(ledger.totalAmount) || 0);
  const paid = Math.max(0, Number(ledger.paidAmount) || 0);
  const pending = Math.max(0, total - paid);
  const force = !!opts?.force;

  if (pending <= 0) {
    if (
      (Number(current.loanTotal) || 0) === 0 &&
      (Number(current.loanPaid) || 0) === 0 &&
      (Number(current.loanThisMonth) || 0) === 0
    ) {
      return null;
    }
    return { loanTotal: 0, loanPaid: 0, loanThisMonth: 0 };
  }

  const nextThisMonth = force ? 0 : Number(current.loanThisMonth) || 0;
  if (
    (Number(current.loanTotal) || 0) === total &&
    (Number(current.loanPaid) || 0) === paid &&
    (Number(current.loanThisMonth) || 0) === nextThisMonth
  ) {
    return null;
  }

  return {
    loanTotal: total,
    loanPaid: paid,
    loanThisMonth: nextThisMonth,
  };
}

/** Lookup one employee’s loan from the API and return patch fields (or null). */
export async function fetchAndApplyPendingLoan(
  name: string,
  current: SalaryLoanFields,
  opts?: { force?: boolean; department?: string },
): Promise<SalaryLoanFields | null> {
  if (!name.trim()) return null;
  try {
    const params = new URLSearchParams({ name: name.trim() });
    if (opts?.department) params.set("department", opts.department);
    const res = await API.get(`/accounts/payroll-loans/lookup?${params.toString()}`);
    const loan = res.data.loan as LedgerLoan | null;
    return applyPendingLoanFromLedger(
      current,
      loan ?? { employeeName: name, totalAmount: 0, paidAmount: 0 },
      opts,
    );
  } catch {
    return null;
  }
}

/** Load full ledger once (for batch hydrate). `ok: false` = request failed — do not wipe local fields. */
export async function fetchAllPayrollLoans(): Promise<{ ok: boolean; loans: LedgerLoan[] }> {
  try {
    const res = await API.get("/accounts/payroll-loans");
    return { ok: true, loans: (res.data.loans as LedgerLoan[]) ?? [] };
  } catch {
    return { ok: false, loans: [] };
  }
}

type LoanBearing = {
  label?: string;
  name?: string;
  amount?: number;
  salary?: { loanTotal?: number; loanPaid?: number; loanThisMonth?: number; [k: string]: unknown };
  salesPayroll?: { loanTotal?: number; loanPaid?: number; loanThisMonth?: number; name?: string; [k: string]: unknown };
};

/**
 * Apply ledger pending loans onto IS team-salary sub-heads (salary + salesPayroll).
 * Returns a new array only when something changed; otherwise the same reference.
 */
export function hydrateSubsFromLedgerLoans<T extends LoanBearing>(
  subs: T[] | undefined,
  loans: LedgerLoan[],
  teamTitle = "",
): T[] | undefined {
  if (!subs?.length) return subs;
  const teamKind = teamTitle ? resolvePayrollKind(teamTitle, subs as never) : undefined;
  const department = teamKind ? departmentForPayrollKind(teamKind) : undefined;
  let changed = false;
  const next = subs.map(sub => {
    const name = (sub.salesPayroll?.name || sub.label || sub.name || "").trim();
    if (!name) return sub;
    const ledger = matchLedgerLoan(loans, name, department);
    // No exact person (+ team) match → strip copied totals so they never land on someone else
    const ledgerOrClear = ledger ?? { employeeName: name, totalAmount: 0, paidAmount: 0 };

    let patchSub = sub;

    if (sub.salesPayroll) {
      const cur = {
        loanTotal: Number(sub.salesPayroll.loanTotal) || 0,
        loanPaid: Number(sub.salesPayroll.loanPaid) || 0,
        loanThisMonth: Number(sub.salesPayroll.loanThisMonth) || 0,
      };
      const patch = applyPendingLoanFromLedger(cur, ledgerOrClear);
      if (patch) {
        changed = true;
        patchSub = {
          ...patchSub,
          salesPayroll: { ...sub.salesPayroll, ...patch },
        };
      }
    }

    if (sub.salary) {
      const cur = {
        loanTotal: Number(sub.salary.loanTotal) || 0,
        loanPaid: Number(sub.salary.loanPaid) || 0,
        loanThisMonth: Number(sub.salary.loanThisMonth) || 0,
      };
      const patch = applyPendingLoanFromLedger(cur, ledgerOrClear);
      if (patch) {
        changed = true;
        patchSub = {
          ...patchSub,
          salary: { ...((patchSub as T).salary ?? sub.salary), ...patch },
        };
      }
    }

    if (patchSub !== sub && teamTitle) {
      patchSub = withSyncedPayrollAmount(
        patchSub as unknown as SubHeadEntry,
        teamTitle,
        teamKind,
      ) as unknown as T;
    }

    return patchSub;
  });
  return changed ? next : subs;
}

/** Hydrate all team salary rows from the payroll-loan ledger. */
export async function hydrateIncomeStatementPendingLoans<
  T extends { teamSalaries?: { team?: string; subHeads?: LoanBearing[]; [k: string]: unknown }[] },
>(data: T): Promise<T> {
  const { ok, loans } = await fetchAllPayrollLoans();
  if (!ok || !data.teamSalaries?.length) return data;

  let changed = false;
  const teamSalaries = data.teamSalaries.map(team => {
    const nextSubs = hydrateSubsFromLedgerLoans(team.subHeads, loans, String(team.team ?? ""));
    if (nextSubs !== team.subHeads) {
      changed = true;
      return { ...team, subHeads: nextSubs };
    }
    return team;
  });

  return changed ? { ...data, teamSalaries } : data;
}
