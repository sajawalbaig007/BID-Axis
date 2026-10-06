/**
 * Sync Provident Fund table from Team Salaries payroll.
 * Each employee's this-period PF (8% basic / override) is written under the
 * matching PF head (Sales / Administration / Technical) by name.
 */

import type { IncomeStatementData, OpexRow, SubHeadEntry, TeamSalaryRow } from "../types";
import { lineAmount, newRowId, todayIso } from "../types";
import { computeAdminSalary, computeExecutiveSalary, computeSalary, computeTechnicalManagerSalary, emptySalaryDetail } from "./payrollFormula";
import {
  computeSalesEmployeePayroll,
  type SalesPayrollCalcOpts,
  type SalesPayrollEmployee,
} from "./salesPayrollFormula";
import {
  resolvePayrollKind,
  resolveSubPayrollKind,
  tlExtraFromPeers,
  type PayrollKind,
} from "./salesPayrollBridge";
import { findPfNameMatchIndex, pfNormName, type PfNameMerge } from "./pfNameAlias";

export type PfHeadKey = "Sales Team PF" | "Administration PF" | "Technical Team PF";

/** Map payroll team → Provident Fund head label on the Income Statement. */
export function pfHeadForPayrollKind(kind: PayrollKind): PfHeadKey | null {
  switch (kind) {
    case "sales":
    case "sales_lead":
      return "Sales Team PF";
    case "admin":
    case "executive":
      return "Administration PF";
    case "technical":
    case "technical_manager":
      return "Technical Team PF";
    default:
      return null;
  }
}

function normName(label: string): string {
  return pfNormName(label);
}

/** This-period PF contribution from a team-salary sub-head. */
export function pfFromSalarySub(
  sub: SubHeadEntry,
  kind: PayrollKind,
  salesExtra = 0,
  opts?: SalesPayrollCalcOpts,
): number {
  if (kind === "executive") {
    const sal = emptySalaryDetail(sub.salary ?? { basic: Number(sub.amount) || 0 });
    return computeExecutiveSalary(sal, 0).pf;
  }

  if (kind === "sales" || kind === "sales_lead") {
    const sp = sub.salesPayroll as SalesPayrollEmployee | undefined;
    if (!sp) {
      const basic = Number(sub.amount) || 0;
      return basic * 0.08;
    }
    return computeSalesEmployeePayroll(
      {
        ...sp,
        name: sp.name || sub.label,
        basic: Number(sp.basic) || 0,
        allowance: Number(sp.allowance) || 0,
        homeAllowance: Number(sp.homeAllowance) || 0,
        pfAuto: sp.pfAuto !== false,
        pfOverride: sp.pfOverride ?? null,
      },
      salesExtra,
      opts,
    ).pf;
  }

  const sal = emptySalaryDetail(sub.salary ?? { basic: Number(sub.amount) || 0 });
  if (kind === "admin") return computeAdminSalary(sal).pf;
  if (kind === "technical_manager") return computeTechnicalManagerSalary(sal).pf;
  return computeSalary(sal).pf;
}

export type PfContribution = {
  name: string;
  head: PfHeadKey;
  amount: number;
};

export function pfDropKey(head: string, name: string): string {
  return `${head}::${normName(name)}`;
}

/** Collect this-period PF by employee from Team Salaries. */
export function collectPfFromTeamSalaries(teams: TeamSalaryRow[]): PfContribution[] {
  const byKey = new Map<string, PfContribution>();

  for (const team of teams) {
    const teamKind = resolvePayrollKind(team.team, team.subHeads);
    const head = pfHeadForPayrollKind(teamKind);
    if (!head) continue;

    const salesPeers = teams
      .filter(t => resolvePayrollKind(t.team, t.subHeads) === "sales")
      .flatMap(t => t.subHeads ?? []);

    for (const sub of team.subHeads ?? []) {
      const kind = resolveSubPayrollKind(sub, team.team, teamKind);
      const pfHead = pfHeadForPayrollKind(kind);
      if (!pfHead) continue;

      const name = (sub.label || sub.salesPayroll?.name || "").trim();
      if (!name) continue;

      const salesExtra =
        kind === "sales_lead" ? tlExtraFromPeers(sub.id, salesPeers) : 0;
      const amount = Math.round(pfFromSalarySub(sub, kind, salesExtra) * 100) / 100;
      const key = `${pfHead}::${normName(name)}`;
      const prev = byKey.get(key);
      if (prev) {
        prev.amount = Math.round((prev.amount + amount) * 100) / 100;
      } else {
        byKey.set(key, { name, head: pfHead, amount });
      }
    }
  }

  return [...byKey.values()];
}

function ensurePfHead(heads: OpexRow[], label: PfHeadKey): OpexRow {
  const existing = heads.find(h => h.label === label);
  if (existing) return existing;
  return {
    id: newRowId("pf"),
    label,
    amount: 0,
    filledAt: todayIso(),
    subHeads: [],
  };
}

/**
 * Rewrite Provident Fund heads so each current Team Salaries person appears.
 * Departed employees (previous months, no longer on payroll) are dropped.
 * User-added `manual` lines are kept. Saved amounts stay editable.
 */
export function syncProvidentFundFromSalaries(
  data: IncomeStatementData,
  nameMerges: PfNameMerge[] = [],
): IncomeStatementData {
  const contributions = collectPfFromTeamSalaries(data.teamSalaries ?? []);
  if (!contributions.length && !(data.providentFundHeads ?? []).length) {
    return data;
  }

  const dropped = new Set((data.pfDroppedNames ?? []).map(k => k.trim().toLowerCase()).filter(Boolean));
  const nameDropped = (head: string, name: string) => {
    const key = pfDropKey(head, name).toLowerCase();
    if (dropped.has(key)) return true;
    const n = normName(name);
    for (const d of dropped) {
      if (d === n || d.endsWith(`::${n}`)) return true;
    }
    return false;
  };

  const contribByHead = new Map<PfHeadKey, PfContribution[]>();
  for (const c of contributions) {
    if (nameDropped(c.head, c.name)) continue;
    const list = contribByHead.get(c.head) ?? [];
    list.push(c);
    contribByHead.set(c.head, list);
  }

  const headOrder: PfHeadKey[] = ["Sales Team PF", "Administration PF", "Technical Team PF"];
  const existing = [...(data.providentFundHeads ?? [])];
  const usedIds = new Set<string>();

  const nextHeads: OpexRow[] = headOrder.map(label => {
    const base = ensurePfHead(existing, label);
    usedIds.add(base.id);
    const contribs = contribByHead.get(label) ?? [];
    const prevSubs = [...(base.subHeads ?? [])];
    const matched = new Set<string>();
    const nextSubs: SubHeadEntry[] = [];

    for (const c of contribs) {
      const unmatched = prevSubs.filter(s => !matched.has(s.id));
      const idxInUnmatched = findPfNameMatchIndex(
        c.name,
        unmatched.map(s => s.label),
        nameMerges,
      );
      const old = idxInUnmatched >= 0 ? unmatched[idxInUnmatched] : undefined;
      if (old) {
        matched.add(old.id);
        const keepManual = !!old.userEdited;
        nextSubs.push({
          ...old,
          label: c.name,
          amount: keepManual && Number.isFinite(Number(old.amount)) ? Number(old.amount) : c.amount,
          filledAt: old.filledAt || todayIso(),
        });
      } else {
        nextSubs.push({
          id: newRowId("pf-sub"),
          label: c.name,
          amount: c.amount,
          filledAt: todayIso(),
        });
      }
    }

    // Keep only user-added lines (not leftover short names from a previous month’s payroll).
    for (const s of prevSubs) {
      if (matched.has(s.id)) continue;
      if (contribs.some(c => findPfNameMatchIndex(c.name, [s.label], nameMerges) === 0)) continue;
      if (nameDropped(label, s.label)) continue;
      if (!s.manual) continue;
      nextSubs.push(s);
    }

    const next: OpexRow = {
      ...base,
      label,
      subHeads: nextSubs,
      amount: lineAmount({ subHeads: nextSubs }),
      filledAt: base.filledAt || todayIso(),
    };
    return next;
  });

  // Preserve any custom PF heads the user added
  for (const h of existing) {
    if (usedIds.has(h.id)) continue;
    if (headOrder.includes(h.label as PfHeadKey)) continue;
    nextHeads.push({ ...h, amount: lineAmount(h) });
  }

  const before = JSON.stringify(data.providentFundHeads ?? []);
  const after = JSON.stringify(nextHeads);
  if (before === after) return data;

  return { ...data, providentFundHeads: nextHeads };
}
