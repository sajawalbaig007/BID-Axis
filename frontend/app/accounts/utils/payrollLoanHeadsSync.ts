/**
 * Sync Income Statement Loans table from Team Salaries payroll loan fields.
 * Shows pending balance only (Total − Paid − This month). Fully paid → removed.
 */

import type { IncomeStatementData, OpexRow, SubHeadEntry, TeamSalaryRow } from "../types";
import { lineAmount, newRowId, todayIso } from "../types";
import { emptySalaryDetail } from "./payrollFormula";
import {
  resolvePayrollKind,
  resolveSubPayrollKind,
  type PayrollKind,
} from "./salesPayrollBridge";

export type LoanHeadKey =
  | "Sales Team Loans"
  | "Administration Loans"
  | "Technical Team Loans"
  | "Executive Loans";

export function loanHeadForPayrollKind(kind: PayrollKind): LoanHeadKey | null {
  switch (kind) {
    case "sales":
    case "sales_lead":
      return "Sales Team Loans";
    case "admin":
      return "Administration Loans";
    case "technical":
    case "technical_manager":
      return "Technical Team Loans";
    case "executive":
      return "Executive Loans";
    default:
      return null;
  }
}

function normName(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Loan shown on the Loans table / monthly report.
 *  This-month amount is kept as-is even after salary deduction.
 *  If nothing moved this month, remaining outstanding is shown.
 */
export function loanAmountFromSub(sub: SubHeadEntry, kind: PayrollKind): number {
  if (kind === "sales" || kind === "sales_lead") {
    const sp = sub.salesPayroll;
    if (!sp) return 0;
    const thisMonth = Math.max(0, Number(sp.loanThisMonth) || 0);
    if (thisMonth > 0) return thisMonth;
    const total = Math.max(0, Number(sp.loanTotal) || 0);
    const paid = Math.max(0, Number(sp.loanPaid) || 0);
    return Math.max(0, total - paid);
  }

  const sal = emptySalaryDetail(sub.salary ?? { basic: Number(sub.amount) || 0 });
  if (kind === "executive") {
    const given = Math.max(0, Number(sal.loanPositive) || 0);
    const recover = Math.max(0, Number(sal.loanNegative) || 0);
    if (given > 0) return given;
    return recover;
  }

  const thisMonth = Math.max(0, Number(sal.loanThisMonth) || 0);
  if (thisMonth > 0) return thisMonth;
  const total = Math.max(0, Number(sal.loanTotal) || 0);
  const paid = Math.max(0, Number(sal.loanPaid) || 0);
  return Math.max(0, total - paid);
}

function hasLoanActivity(sub: SubHeadEntry, kind: PayrollKind): boolean {
  // Only surface loans that still have a pending balance (or executive −ve)
  return loanAmountFromSub(sub, kind) > 0;
}

export type LoanContribution = {
  name: string;
  head: LoanHeadKey;
  amount: number;
};

/** Collect loan rows from Team Salaries for the Loans table. */
export function collectLoansFromTeamSalaries(teams: TeamSalaryRow[]): LoanContribution[] {
  const byKey = new Map<string, LoanContribution>();

  for (const team of teams) {
    const teamKind = resolvePayrollKind(team.team, team.subHeads);
    if (!loanHeadForPayrollKind(teamKind)) continue;

    for (const sub of team.subHeads ?? []) {
      const kind = resolveSubPayrollKind(sub, team.team, teamKind);
      const head = loanHeadForPayrollKind(kind);
      if (!head) continue;

      const name = (sub.label || sub.salesPayroll?.name || "").trim();
      if (!name) continue;
      if (!hasLoanActivity(sub, kind)) continue;

      const amount = Math.round(loanAmountFromSub(sub, kind) * 100) / 100;
      const key = `${head}::${normName(name)}`;
      const prev = byKey.get(key);
      if (prev) {
        prev.amount = Math.round((prev.amount + amount) * 100) / 100;
      } else {
        byKey.set(key, { name, head, amount });
      }
    }
  }

  return [...byKey.values()];
}

function ensureLoanHead(heads: OpexRow[], label: LoanHeadKey): OpexRow {
  const existing = heads.find(h => h.label === label);
  if (existing) return existing;
  return {
    id: newRowId("loan"),
    label,
    amount: 0,
    filledAt: todayIso(),
    subHeads: [],
  };
}

const HEAD_ORDER: LoanHeadKey[] = [
  "Sales Team Loans",
  "Administration Loans",
  "Technical Team Loans",
  "Executive Loans",
];

/** Legacy single head from older seeds — absorb into auto heads, drop empty shell. */
const LEGACY_LOAN_LABELS = new Set(["loan issued", "loans", "loan"]);

/**
 * Rewrite Loans heads from Team Salaries remaining (Total − Paid − This month).
 * Each department table lists only that team's people; head Total is their sum.
 */
export function syncLoanHeadsFromSalaries(data: IncomeStatementData): IncomeStatementData {
  const contributions = collectLoansFromTeamSalaries(data.teamSalaries ?? []);
  const existing = [...(data.loanHeads ?? [])];

  if (!contributions.length && !existing.length) {
    return data;
  }

  const contribByHead = new Map<LoanHeadKey, LoanContribution[]>();
  for (const c of contributions) {
    const list = contribByHead.get(c.head) ?? [];
    list.push(c);
    contribByHead.set(c.head, list);
  }

  const usedIds = new Set<string>();
  const nextHeads: OpexRow[] = HEAD_ORDER.map(label => {
    const base = ensureLoanHead(existing, label);
    usedIds.add(base.id);
    const contribs = contribByHead.get(label) ?? [];
    const prevSubs = [...(base.subHeads ?? [])];
    const matched = new Set<string>();
    const nextSubs: SubHeadEntry[] = [];

    for (const c of contribs) {
      const idx = prevSubs.findIndex(s => normName(s.label) === normName(c.name));
      if (idx >= 0) {
        const old = prevSubs[idx]!;
        matched.add(old.id);
        nextSubs.push({
          ...old,
          label: c.name,
          amount: c.amount,
          filledAt: old.filledAt || todayIso(),
        });
      } else {
        nextSubs.push({
          id: newRowId("loan-sub"),
          label: c.name,
          amount: c.amount,
          filledAt: todayIso(),
        });
      }
    }

    return {
      ...base,
      label,
      subHeads: nextSubs,
      amount: lineAmount({ subHeads: nextSubs }),
      filledAt: base.filledAt || todayIso(),
    };
  });

  // Preserve custom heads; drop empty legacy "Loan Issued" shell
  for (const h of existing) {
    if (usedIds.has(h.id)) continue;
    if (HEAD_ORDER.includes(h.label as LoanHeadKey)) continue;
    if (LEGACY_LOAN_LABELS.has(h.label.trim().toLowerCase())) {
      const orphans = (h.subHeads ?? []).filter(
        s => !nextHeads.some(nh => (nh.subHeads ?? []).some(x => normName(x.label) === normName(s.label))),
      );
      if (orphans.length) {
        // Park leftover manual lines under Technical Team Loans
        const tech = nextHeads.find(n => n.label === "Technical Team Loans")!;
        const merged = [...(tech.subHeads ?? []), ...orphans];
        tech.subHeads = merged;
        tech.amount = lineAmount({ subHeads: merged });
      }
      continue;
    }
    nextHeads.push({ ...h, amount: lineAmount(h) });
  }

  // Always keep Sales / Admin / Technical / Executive heads so each table shows its total
  const pruned = nextHeads.filter(h => {
    if (HEAD_ORDER.includes(h.label as LoanHeadKey)) return true;
    return (h.subHeads ?? []).length > 0 || (Number(h.amount) || 0) > 0;
  });

  // Always keep at least the seeded structure when there are contributions
  const finalHeads =
    pruned.length > 0
      ? pruned
      : contributions.length
        ? nextHeads
        : existing;

  const before = JSON.stringify(data.loanHeads ?? []);
  const after = JSON.stringify(finalHeads);
  if (before === after) return data;

  return { ...data, loanHeads: finalHeads };
}
