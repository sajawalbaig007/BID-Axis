/** Normalize saved Income Statement — split Sales Team vs Sales Team Lead (Hammad)
 *  + ensure executive commission defaults + recompute executive totals from net profit base.
 */

import { pfNamesAreSamePerson } from "./pfNameAlias";

const HAMMAD_TEAM_LEAD_ID = "stl-hammad";
const SALES_TEAM = "Sales Team Salaries";
const SALES_TEAM_LEAD = "Sales Team Lead Salaries";
const BIM_MODELER_TEAM = "BIM Modeler Salaries";
const DEV_TEAM = "Dev Salaries";
const ADMIN_TEAM = "Administration Salaries";

const EXEC_COMMISSION_DEFAULTS: [RegExp, number][] = [
  [/mohsin/i, 15],
  [/sharjeel|sherjeel/i, 7.5],
  [/talha/i, 7.5],
  [/irtaza/i, 7.5],
];

type SubHead = {
  id?: string;
  label?: string;
  amount?: number;
  filledAt?: string;
  salary?: {
    basic?: number;
    commissionPct?: number;
    loanPositive?: number;
    loanNegative?: number;
    remarks?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};
type TeamRow = { id?: string; team?: string; totalSalary?: number; subHeads?: SubHead[]; [key: string]: unknown };
type HeadRow = { amount?: number; totalSalary?: number; subHeads?: SubHead[] };

function lineTotal(row: { subHeads?: SubHead[]; amount?: number; totalSalary?: number }): number {
  const subs = row.subHeads ?? [];
  if (subs.length) return subs.reduce((a, s) => a + (Number(s.amount) || 0), 0);
  return Number(row.amount ?? row.totalSalary) || 0;
}

function isExecutiveTeam(team?: string): boolean {
  return String(team ?? "").toLowerCase().includes("executive");
}

function executiveStoredBasic(s: SubHead): number {
  const raw = s.salary?.basic;
  if (raw !== undefined && raw !== null && String(raw) !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return Math.max(0, Number(s.amount) || 0);
}

function execPctForLabel(label: string): number {
  for (const [re, pct] of EXEC_COMMISSION_DEFAULTS) {
    if (re.test(label)) return pct;
  }
  return 0;
}

/** Ensure executive subs have salary.commissionPct (defaults by name if missing). */
function ensureExecutiveSalaryDefaults(data: Record<string, unknown>): Record<string, unknown> {
  const teams = (data.teamSalaries as TeamRow[] | undefined) ?? [];
  let changed = false;
  const nextTeams = teams.map(t => {
    if (!isExecutiveTeam(t.team)) return t;
    const subHeads = (t.subHeads ?? []).map(s => {
      const label = String(s.label ?? "");
      const existing = s.salary;
      const pct =
        existing?.commissionPct != null && Number.isFinite(Number(existing.commissionPct))
          ? Number(existing.commissionPct)
          : execPctForLabel(label);
      const basic = executiveStoredBasic(s);
      const loanPositive = Number(existing?.loanPositive) || 0;
      const loanNegative = Number(existing?.loanNegative) || 0;
      const remarks = String(existing?.remarks ?? "");
      if (
        existing &&
        Number(existing.commissionPct) === pct &&
        Number(existing.basic) === basic &&
        Number(existing.loanPositive) === loanPositive &&
        Number(existing.loanNegative) === loanNegative
      ) {
        return s;
      }
      changed = true;
      return {
        ...s,
        salary: {
          ...(existing ?? {}),
          basic,
          commissionPct: pct,
          loanPositive,
          loanNegative,
          remarks,
        },
      };
    });
    return { ...t, subHeads };
  });
  return changed ? { ...data, teamSalaries: nextTeams } : data;
}

/**
 * Commission base = revenue − (non-executive payroll + OPEX).
 * Loans/PF already sit inside net salaries — don't subtract again.
 */
export function executiveCommissionBase(data: Record<string, unknown>): number {
  const teams = (data.teamSalaries as TeamRow[] | undefined) ?? [];
  const nonExecPayroll = teams
    .filter(t => !isExecutiveTeam(t.team))
    .reduce((a, t) => a + lineTotal(t), 0);
  const sumCat = (key: string) =>
    ((data[key] as HeadRow[] | undefined) ?? []).reduce((a, r) => a + lineTotal(r), 0);
  return (Number(data.totalRevenue) || 0) - (nonExecPayroll + sumCat("opexHeads"));
}

/**
 * amount = Basic + Commission + Loan+ve − Loan−ve + Occasional − PF
 * for each executive sub-head.
 */
export function recomputeExecutiveTeamInIncomeStatement(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const withDefaults = ensureExecutiveSalaryDefaults(data);
  const teams = [...((withDefaults.teamSalaries as TeamRow[] | undefined) ?? [])];
  const idx = teams.findIndex(t => isExecutiveTeam(t.team));
  if (idx < 0) return withDefaults;

  const base = Math.max(0, executiveCommissionBase(withDefaults));
  const team = teams[idx];
  let changed = withDefaults !== data;
  const subHeads = (team.subHeads ?? []).map(s => {
    const basic = executiveStoredBasic(s);
    const pct = Number(s.salary?.commissionPct) || 0;
    const loanPositive = Number(s.salary?.loanPositive) || 0;
    const loanNegative = Number(s.salary?.loanNegative) || 0;
    const occasionalAmount = Math.max(0, Number(s.salary?.occasionalAmount) || 0);
    const occasionalRemark = String(s.salary?.occasionalRemark ?? "");
    const pfAuto = s.salary?.pfAuto !== false;
    const pf = pfAuto
      ? basic * 0.08
      : Math.max(0, Number(s.salary?.pfOverride) || 0);
    const total =
      basic + (base * pct) / 100 + loanPositive - loanNegative + occasionalAmount - pf;
    const nextSalary = {
      ...(s.salary ?? {}),
      basic,
      commissionPct: pct,
      loanPositive,
      loanNegative,
      occasionalAmount,
      occasionalRemark,
      pfAuto,
      pfOverride: s.salary?.pfOverride == null ? null : Number(s.salary.pfOverride),
      remarks: String(s.salary?.remarks ?? ""),
    };
    if (
      Math.abs((Number(s.amount) || 0) - total) < 0.005 &&
      Number(s.salary?.basic) === basic &&
      Number(s.salary?.loanPositive) === loanPositive &&
      Number(s.salary?.loanNegative) === loanNegative &&
      Number(s.salary?.occasionalAmount || 0) === occasionalAmount &&
      String(s.salary?.occasionalRemark ?? "") === occasionalRemark &&
      s.salary
    ) {
      return s;
    }
    changed = true;
    return { ...s, salary: nextSalary, amount: total };
  });
  if (!changed) return withDefaults;

  const nextTeam = {
    ...team,
    subHeads,
    totalSalary: subHeads.reduce((a, s) => a + (Number(s.amount) || 0), 0),
  };
  return {
    ...withDefaults,
    teamSalaries: teams.map((t, i) => (i === idx ? nextTeam : t)),
  };
}

function isHammadSub(sub: SubHead): boolean {
  const id = String(sub.id ?? "");
  const label = String(sub.label ?? "").trim().toLowerCase();
  return id === HAMMAD_TEAM_LEAD_ID || label === "hammad";
}

function isSeededLeadPlaceholder(sub: SubHead): boolean {
  const id = String(sub.id ?? "");
  if (id.startsWith("staff-emp-")) return false;
  return isHammadSub(sub);
}

function rid(prefix: string, n: number) {
  return `${prefix}-${n}`;
}

function nameTokens(label: string): string[] {
  return String(label ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function isAhmadModeler(label: string): boolean {
  const tokens = nameTokens(label);
  const ahmad = tokens.includes("ahmad") || tokens.includes("ahmed");
  return ahmad && (tokens.includes("nadeem") || tokens.includes("naseem"));
}

function isDevPerson(label: string): boolean {
  const first = nameTokens(label)[0] ?? "";
  return first === "ahmer" || first === "sajawal";
}

function sumTeam(subs: SubHead[]): number {
  return subs.reduce((total, sub) => total + (Number(sub.amount) || 0), 0);
}

function ensureTeam(teams: TeamRow[], name: string): TeamRow {
  const found = teams.find((team) => String(team.team ?? "").trim() === name);
  if (found) return found;
  const created: TeamRow = { id: `team-${name.toLowerCase().replace(/\s+/g, "-")}`, team: name, totalSalary: 0, subHeads: [] };
  teams.push(created);
  return created;
}

/** Move Ahmad onto BIM Modeler, and Ahmer / Sajawal onto Dev, keeping their salary fields. */
function placeSalaryHeads(teams: TeamRow[]): TeamRow[] {
  const pulledBim: SubHead[] = [];
  const pulledDev: SubHead[] = [];
  for (const team of teams) {
    const title = String(team.team ?? "").trim();
    const keep: SubHead[] = [];
    for (const sub of team.subHeads ?? []) {
      const label = String(sub.label ?? "");
      if (title !== BIM_MODELER_TEAM && isAhmadModeler(label)) {
        pulledBim.push(sub);
        continue;
      }
      if (title !== DEV_TEAM && /admin/i.test(title) && isDevPerson(label)) {
        pulledDev.push(sub);
        continue;
      }
      keep.push(sub);
    }
    team.subHeads = keep;
    team.totalSalary = sumTeam(keep);
  }

  const place = (head: string, incoming: SubHead[]) => {
    const team = ensureTeam(teams, head);
    const subs = [...(team.subHeads ?? [])];
    for (const sub of incoming) {
      const dup = subs.find((row) => row.id === sub.id || pfNamesAreSamePerson(String(row.label ?? ""), String(sub.label ?? "")));
      if (!dup) {
        subs.push(sub);
        continue;
      }
      const worth = (row: SubHead) => Math.max(Number(row.salary?.basic) || 0, Number(row.amount) || 0);
      if (worth(sub) > worth(dup)) {
        const index = subs.indexOf(dup);
        subs[index] = { ...dup, ...sub, id: dup.id || sub.id };
      }
    }
    team.subHeads = subs;
    team.totalSalary = sumTeam(subs);
  };

  place(BIM_MODELER_TEAM, pulledBim);
  place(DEV_TEAM, pulledDev);
  return teams;
}

function emptyLeadTeam(): TeamRow {
  return {
    id: rid("t", 6),
    team: SALES_TEAM_LEAD,
    totalSalary: 0,
    subHeads: [],
  };
}

/** Split leftover seed Hammad out of Sales Team; never re-inject a placeholder lead. */
export function normalizeIncomeStatementData(data: Record<string, unknown>): Record<string, unknown> {
  const raw = [...((data.teamSalaries as TeamRow[] | undefined) ?? [])];
  if (!raw.length) return data;

  let teams: TeamRow[] = placeSalaryHeads(raw.map(t => ({ ...t, subHeads: [...(t.subHeads ?? [])] })));
  const salesIdx = teams.findIndex(t => String(t.team ?? "").trim() === SALES_TEAM);
  let leadIdx = teams.findIndex(t => String(t.team ?? "").trim() === SALES_TEAM_LEAD);

  if (salesIdx >= 0) {
    const sales = teams[salesIdx];
    const hammad = (sales.subHeads ?? []).find(isSeededLeadPlaceholder);
    const reps = (sales.subHeads ?? []).filter(s => !isSeededLeadPlaceholder(s));
    teams[salesIdx] = { ...sales, subHeads: reps, totalSalary: lineTotal({ subHeads: reps }) };

    if (hammad && leadIdx >= 0) {
      const lead = teams[leadIdx];
      const others = (lead.subHeads ?? []).filter(s => !isSeededLeadPlaceholder(s));
      // Real assigned leads win — drop the seed instead of keeping both
      const subHeads = others.length ? others : [];
      teams[leadIdx] = { ...lead, subHeads, totalSalary: lineTotal({ subHeads }) };
    }
  }

  if (leadIdx < 0) {
    teams.push(emptyLeadTeam());
    leadIdx = teams.length - 1;
  } else {
    const lead = teams[leadIdx];
    const others = (lead.subHeads ?? []).filter(s => !isSeededLeadPlaceholder(s));
    if (others.length !== (lead.subHeads ?? []).length) {
      teams[leadIdx] = { ...lead, subHeads: others, totalSalary: lineTotal({ subHeads: others }) };
    }
  }

  // Stable order: insert Sales Team Lead right after Sales Team
  const order = [
    "Technical Team Salaries",
    SALES_TEAM,
    SALES_TEAM_LEAD,
    "Email Marketing Team Salaries",
    BIM_MODELER_TEAM,
    ADMIN_TEAM,
    DEV_TEAM,
    "Executive Salaries",
  ];
  const byName = new Map(teams.map(t => [String(t.team ?? "").trim(), t]));
  const ordered: TeamRow[] = [];
  for (const name of order) {
    const row = byName.get(name);
    if (row) {
      ordered.push(row);
      byName.delete(name);
    }
  }
  for (const row of byName.values()) ordered.push(row);

  return { ...data, teamSalaries: ordered };
}
