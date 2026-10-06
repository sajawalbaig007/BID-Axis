import type { IncomeStatementData, OpexRow, SubHeadEntry, TeamSalaryRow } from "../types";
import { lineAmount, newRowId, todayIso } from "../types";
import { computeExecutiveSalary, emptySalaryDetail, ensureExecutiveSalaryDetail } from "./payrollFormula";
import {
  emptySalesPayrollEmployee,
  resolvePayrollKind,
  isHammadSub,
  isSalesLeadSub,
  isSeededTeamLeadPlaceholder,
  normalizeSalesTeamSubs,
} from "./salesPayrollBridge";

const COLUMN_HEADERS = new Set([
  "basic salary",
  "week days overtime",
  "weekend overtime",
  "total overtime",
  "allowances",
  "late deduction",
  "unpaid leaves deduction",
  "loan deduction",
  "pf deduction",
  "income tax deduction",
  "total deduction",
  "total salary",
  "total earnings",
  "total earning",
  "remarks",
  "remark",
  "comment",
  "project closed",
  "tl allowance",
  "commission per project",
  "commission for fixed client",
  "total commission",
  "net salary",
  "unpaid leaves",
  "late arrival deduction",
  "commission",
  "loan (+ve)",
  "loan (-ve)",
  "transfer date",
  "sr#",
  "name",
]);

function salesSub(label: string, amount: number, role: "sales" | "team_lead", id?: string): SubHeadEntry {
  const sp = emptySalesPayrollEmployee(label, role, amount, 0, id ?? newRowId("sub"));
  return {
    id: sp.id,
    label,
    amount,
    filledAt: todayIso(),
    salesPayroll: sp,
  };
}

/** Default executive commission % of net profit, matched by name. */
const EXEC_COMMISSION_DEFAULTS: [RegExp, number][] = [
  [/mohsin/i, 15],
  [/sharjeel|sherjeel/i, 7.5],
  [/talha/i, 7.5],
  [/irtaza/i, 7.5],
];

export function execPctForLabel(label: string): number {
  for (const [re, pct] of EXEC_COMMISSION_DEFAULTS) {
    if (re.test(label)) return pct;
  }
  return 0;
}

function sub(label: string, amount: number, withSalary = false, teamName?: string): SubHeadEntry {
  const kind = teamName ? resolvePayrollKind(teamName) : "technical";
  return {
    id: newRowId("sub"),
    label,
    amount,
    filledAt: todayIso(),
    ...(withSalary
      ? {
          salary: emptySalaryDetail({
            basic: amount,
            ...(kind === "admin" ? { checkIn: "18:00" } : {}),
            ...(kind === "technical_manager" ? { checkIn: "09:00", checkOut: "18:00" } : {}),
            ...(kind === "executive"
              ? { commissionPct: execPctForLabel(label), loanPositive: 0, loanNegative: 0 }
              : {}),
          }),
        }
      : {}),
  };
}

function ensureTeamSalarySubs(
  subs: SubHeadEntry[] | undefined,
  teamName: string,
  salesPeers: SubHeadEntry[] = [],
): SubHeadEntry[] {
  const kind = resolvePayrollKind(teamName, subs);
  if (kind === "sales" || kind === "sales_lead") {
    return normalizeSalesTeamSubs(subs, teamName, salesPeers);
  }
  if (kind === "executive") {
    return (subs ?? []).map(s => {
      const pct = execPctForLabel(s.label);
      if (s.salary) {
        if (s.salary.commissionPct == null && pct) {
          return { ...s, salary: { ...s.salary, commissionPct: pct } };
        }
        return s;
      }
      return {
        ...s,
        salary: emptySalaryDetail({
          basic: Number(s.amount) || 0,
          commissionPct: pct,
          loanPositive: 0,
          loanNegative: 0,
        }),
      };
    });
  }
  if (kind === "technical_manager") {
    return (subs ?? []).map(s => {
      if (s.salary) {
        // Migrate default 07:00 legacy rows to manager shift 09:00
        if (!s.salary.checkIn || s.salary.checkIn === "07:00") {
          return {
            ...s,
            salary: {
              ...s.salary,
              checkIn: "09:00",
              checkOut: s.salary.checkOut === "16:00" || !s.salary.checkOut ? "18:00" : s.salary.checkOut,
            },
          };
        }
        return s;
      }
      return {
        ...s,
        salary: emptySalaryDetail({
          basic: Number(s.amount) || 0,
          checkIn: "09:00",
          checkOut: "18:00",
        }),
      };
    });
  }
  return (subs ?? []).map(s => {
    if (s.salary) return s;
    const salary = emptySalaryDetail({
      basic: Number(s.amount) || 0,
      ...(kind === "admin" ? { checkIn: "18:00" } : {}),
    });
    return { ...s, salary };
  });
}

function seedTeam(team: string): TeamSalaryRow {
  const seed = TEAM_SEED[team];
  const people = seed?.people ?? [];
  const subHeads = seed?.salesTeam
    ? people.map(p => salesSub(p.label, p.amount, "sales"))
    : seed?.salesTeamLead
      ? people.map(p => salesSub(p.label, p.amount, "team_lead", p.id))
      : people.map(p => sub(p.label, p.amount, true, team));
  return {
    id: newRowId("team"),
    team,
    totalSalary: seed?.total ?? lineAmount({ subHeads }),
    filledAt: todayIso(),
    subHeads,
  };
}

function looksLikeColumnHeaders(subs: SubHeadEntry[] | undefined, headLabels?: string[]): boolean {
  const labels = (subs?.length ? subs.map(s => s.label) : headLabels ?? [])
    .map(l => l.trim().toLowerCase())
    .filter(Boolean);
  if (!labels.length) return true;
  const hits = labels.filter(l => COLUMN_HEADERS.has(l)).length;
  return hits >= Math.ceil(labels.length * 0.6);
}

const TEAM_SEED: Record<
  string,
  {
    total: number;
    people: { label: string; amount: number; id?: string }[];
    salesTeam?: boolean;
    salesTeamLead?: boolean;
  }
> = {
  "Technical Team Salaries": {
    total: 0,
    people: [
      { label: "Noman Khan", amount: 0 },
      { label: "Muhammad Abdullah", amount: 0 },
      { label: "Rizwan Sabir", amount: 0 },
      { label: "Usama Jameel", amount: 0 },
      { label: "Khaldoon Abrar", amount: 0 },
      { label: "Muhammad Zaid", amount: 0 },
      { label: "Muhammad Bariq", amount: 0 },
      { label: "Afaq", amount: 0 },
    ],
  },
  "BIM Modeler Salaries": {
    total: 0,
    people: [{ label: "Ahmad Nadeem", amount: 0 }],
  },
  "Sales Team Salaries": {
    total: 0,
    people: [
      { label: "Huraira", amount: 0 },
      { label: "Faris", amount: 0 },
      { label: "Ali", amount: 0 },
      { label: "Faizan", amount: 0 },
      { label: "Asim", amount: 0 },
      { label: "Anam", amount: 0 },
    ],
    salesTeam: true,
  },
  "Sales Team Lead Salaries": {
    total: 0,
    people: [],
    salesTeamLead: true,
  },
  "Technical Manager Salaries": {
    total: 0,
    people: [{ label: "Ayesha", amount: 0 }],
  },
  "Email Marketing Team Salaries": {
    total: 0,
    people: [{ label: "Aftab", amount: 0 }],
  },
  "Administration Salaries": {
    total: 0,
    people: [
      { label: "Qasim (Admin)", amount: 0 },
      { label: "Shakeela (HR)", amount: 0 },
      { label: "Attiq Rehman (Account Officer)", amount: 0 },
      { label: "Muhammad Bilal (Accounts Officer)", amount: 0 },
      { label: "Mr. Noreed (Chartered)", amount: 0 },
      { label: "Hamza (Floor Manager)", amount: 0 },
      { label: "Mahnoor", amount: 0 },
      { label: "Office Boy", amount: 0 },
      { label: "Guard", amount: 0 },
    ],
  },
  "Dev Salaries": {
    total: 0,
    people: [
      { label: "Ahmer Shah", amount: 0 },
      { label: "Sajawal", amount: 0 },
    ],
  },
  "Executive Salaries": {
    total: 0,
    people: [
      { label: "Mr. Mohsin Qayyum", amount: 0 },
      { label: "Mr. Sharjeel Nasir", amount: 0 },
      { label: "Mr. Talha Ahmed", amount: 0 },
      { label: "Irtaza Hassan", amount: 0 },
    ],
  },
};

const OPEX_SEED: Record<string, { amount: number; lines: { label: string; amount: number }[] }> = {
  "Office Management Expenses": {
    amount: 0,
    lines: [{ label: "BEM Rent & Electricity Bill", amount: 0 }],
  },
  "IT Equipments Expenses": { amount: 0, lines: [] },
  "Regular IT Expenses": {
    amount: 0,
    lines: [
      { label: "Ptcl Bill payment", amount: 0 },
      { label: "Claude payment hamza bhai", amount: 0 },
      { label: "Devcon server", amount: 0 },
      { label: "Zoom payment devcon", amount: 0 },
      { label: "Zoom payment of two dialer", amount: 0 },
      { label: "Storm fibre bill payment", amount: 0 },
      { label: "LLC Tax Payment", amount: 0 },
      { label: "100 CAD shopdrawing structure review", amount: 0 },
      { label: "Gmails monthly payments", amount: 0 },
    ],
  },
  "Outsourcing Expenses": { amount: 0, lines: [] },
  "Asset Purchasing Expenses": { amount: 0, lines: [] },
  "Miscellaneous Expenses": {
    amount: 0,
    lines: [
      { label: "Kitchen Grocery", amount: 0 },
      { label: "Notepad, Ballpen", amount: 0 },
      { label: "Hand wash", amount: 0 },
      { label: "Tissue boxes and rolls", amount: 0 },
    ],
  },
};

function seedOpex(label: string): OpexRow {
  const seed = OPEX_SEED[label];
  const lines = seed?.lines ?? [];
  const subHeads = lines.map(l => sub(l.label, l.amount));
  return {
    id: newRowId("opex"),
    label,
    amount: seed?.amount ?? lineAmount({ subHeads }),
    filledAt: todayIso(),
    subHeads,
  };
}

const PF_SEED: Record<string, { amount: number; people: { label: string; amount: number }[] }> = {
  "Sales Team PF": {
    amount: 0,
    people: [
      { label: "Hammad", amount: 0 },
      { label: "Huraira", amount: 0 },
      { label: "Faris", amount: 0 },
      { label: "Ali", amount: 0 },
      { label: "Faizan", amount: 0 },
      { label: "Asim", amount: 0 },
      { label: "Anam", amount: 0 },
    ],
  },
  "Administration PF": {
    amount: 0,
    people: [
      { label: "Qasim (Admin)", amount: 0 },
      { label: "Shakeela (HR)", amount: 0 },
      { label: "Attiq Rehman (Account Officer)", amount: 0 },
      { label: "Muhammad Bilal (Accounts Officer)", amount: 0 },
      { label: "Hamza (Floor Manager)", amount: 0 },
      { label: "Sajawal", amount: 0 },
      { label: "Ahmer", amount: 0 },
      { label: "Mahnoor", amount: 0 },
      { label: "Office Boy", amount: 0 },
      { label: "Guard", amount: 0 },
    ],
  },
  "Technical Team PF": {
    amount: 0,
    people: [
      { label: "Muhammad Abdullah", amount: 0 },
      { label: "Rizwan Sabir", amount: 0 },
      { label: "Usama Jameel", amount: 0 },
      { label: "Muhammad Afaq Amin", amount: 0 },
      { label: "Khaldoon Abrar", amount: 0 },
      { label: "Muhammad Bariq", amount: 0 },
      { label: "Ayesha Ashraf", amount: 0 },
      { label: "Manal Younas", amount: 0 },
      { label: "Zainab Khalil", amount: 0 },
    ],
  },
};

function seedPf(label: string): OpexRow {
  const seed = PF_SEED[label];
  const people = seed?.people ?? [];
  const subHeads = people.map(p => sub(p.label, p.amount));
  return {
    id: newRowId("pf"),
    label,
    amount: seed?.amount ?? lineAmount({ subHeads }),
    filledAt: todayIso(),
    subHeads,
  };
}

/** Full default Income Statement from payroll spreadsheet. */
export function seededIncomeStatementData(): IncomeStatementData {
  return {
    totalRevenue: 0,
    teamSalaries: Object.keys(TEAM_SEED).map(seedTeam),
    opexHeads: Object.keys(OPEX_SEED).map(seedOpex),
    loanHeads: [
      {
        id: newRowId("loan"),
        label: "Loan Issued",
        amount: 0,
        filledAt: todayIso(),
        subHeads: [],
      },
    ],
    providentFundHeads: Object.keys(PF_SEED).map(seedPf),
  };
}

/**
 * If saved record still has only column headers (or empty people),
 * inject spreadsheet people / expense lines so the UI is editable per person.
 */
export function ensureIncomeStatementPeople(data: IncomeStatementData): IncomeStatementData {
  // Migrate legacy: Hammad / team-lead subs under Sales Team → Sales Team Lead
  const teamSalariesIn = [...(data.teamSalaries ?? [])];
  const salesIdx = teamSalariesIn.findIndex(t => t.team === "Sales Team Salaries");
  let leadIdx = teamSalariesIn.findIndex(t => t.team === "Sales Team Lead Salaries");

  if (salesIdx >= 0) {
    const salesTeam = teamSalariesIn[salesIdx];
    const leadSubs = (salesTeam.subHeads ?? []).filter(isSalesLeadSub);
    const reps = (salesTeam.subHeads ?? []).filter(s => !isSalesLeadSub(s));
    teamSalariesIn[salesIdx] = {
      ...salesTeam,
      subHeads: reps,
      totalSalary: lineAmount({ ...salesTeam, subHeads: reps }),
    };
    if (leadSubs.length) {
      const leadTeam =
        leadIdx >= 0 ? teamSalariesIn[leadIdx] : seedTeam("Sales Team Lead Salaries");
      const byId = new Set((leadTeam.subHeads ?? []).map(s => s.id));
      const merged = [...(leadTeam.subHeads ?? [])];
      for (const s of leadSubs) {
        if (s.id && byId.has(s.id)) continue;
        merged.push(s);
        if (s.id) byId.add(s.id);
      }
      const realLeads = merged.filter(s => !isSeededTeamLeadPlaceholder(s));
      const nextLead = {
        ...leadTeam,
        subHeads: realLeads.length ? realLeads : merged.filter(s => !isHammadSub(s)),
      };
      nextLead.totalSalary = lineAmount(nextLead);
      if (leadIdx >= 0) teamSalariesIn[leadIdx] = nextLead;
      else {
        teamSalariesIn.push(nextLead);
        leadIdx = teamSalariesIn.length - 1;
      }
    }
  }

  if (leadIdx < 0) {
    teamSalariesIn.push(seedTeam("Sales Team Lead Salaries"));
  }

  const existingTeams = new Map(teamSalariesIn.map(t => [t.team, t]));
  const teamSalaries = Object.keys(TEAM_SEED).map(teamName => {
    const current = existingTeams.get(teamName);
    if (!current) return seedTeam(teamName);
    if (!looksLikeColumnHeaders(current.subHeads, current.headLabels)) {
      const salesPeers =
        teamName === "Sales Team Lead Salaries"
          ? ensureTeamSalarySubs(existingTeams.get("Sales Team Salaries")?.subHeads, "Sales Team Salaries")
          : [];
      const subHeads = ensureTeamSalarySubs(current.subHeads, teamName, salesPeers).filter(s =>
        teamName === "Sales Team Lead Salaries" ? !isSeededTeamLeadPlaceholder(s) : true,
      );
      return {
        ...current,
        subHeads,
        totalSalary: lineAmount({ ...current, subHeads }),
      };
    }
    const seeded = seedTeam(teamName);
    return {
      ...current,
      subHeads: seeded.subHeads,
      totalSalary: lineAmount(seeded),
      headLabels: undefined,
    };
  });

  // Keep any custom teams the user already added
  for (const t of teamSalariesIn) {
    if (!TEAM_SEED[t.team] && !teamSalaries.some(x => x.id === t.id)) {
      const subHeads = ensureTeamSalarySubs(t.subHeads, t.team);
      teamSalaries.push({ ...t, subHeads, totalSalary: lineAmount({ ...t, subHeads }) });
    }
  }

  const existingOpex = new Map((data.opexHeads ?? []).map(o => [o.label, o]));
  const opexHeads = Object.keys(OPEX_SEED).map(label => {
    const current = existingOpex.get(label);
    if (!current) return seedOpex(label);
    if (current.subHeads && current.subHeads.length > 0) {
      return { ...current, amount: lineAmount(current) };
    }
    const seeded = seedOpex(label);
    return {
      ...current,
      subHeads: seeded.subHeads,
      amount: lineAmount(seeded),
    };
  });

  for (const o of data.opexHeads ?? []) {
    if (!OPEX_SEED[o.label] && !opexHeads.some(x => x.id === o.id)) {
      opexHeads.push(o);
    }
  }

  let loanHeads = data.loanHeads ?? [];
  if (!loanHeads.length) {
    loanHeads = seededIncomeStatementData().loanHeads ?? [];
  } else {
    loanHeads = loanHeads.map(l => {
      if (l.subHeads && l.subHeads.length > 0) return { ...l, amount: lineAmount(l) };
      if (l.label.toLowerCase().includes("loan")) {
        const seeded = (seededIncomeStatementData().loanHeads ?? [])[0];
        return seeded ? { ...l, subHeads: seeded.subHeads, amount: lineAmount(seeded) } : l;
      }
      return l;
    });
  }

  const existingPf = new Map((data.providentFundHeads ?? []).map(o => [o.label, o]));
  const providentFundHeads = Object.keys(PF_SEED).map(label => {
    const current = existingPf.get(label);
    if (!current) return seedPf(label);
    // Never re-seed leftover people onto a saved head — PF roster follows Team Salaries.
    return { ...current, amount: lineAmount(current) };
  });

  for (const pf of data.providentFundHeads ?? []) {
    if (!PF_SEED[pf.label] && !providentFundHeads.some(x => x.id === pf.id)) {
      providentFundHeads.push(pf);
    }
  }

  return {
    ...data,
    teamSalaries,
    opexHeads,
    loanHeads,
    providentFundHeads,
  };
}

/**
 * Commission base for Executive Salaries = net profit BEFORE executive salaries:
 * revenue − (all payroll except executive team + OPEX).
 * Loans/PF are already reflected inside net salaries — don't subtract again.
 */
export function executiveCommissionBase(data: IncomeStatementData): number {
  const teams = data.teamSalaries ?? [];
  const nonExecPayroll = teams
    .filter(t => resolvePayrollKind(t.team, t.subHeads) !== "executive")
    .reduce((a, t) => a + lineAmount(t), 0);
  const opex = (data.opexHeads ?? []).reduce((a, o) => a + lineAmount(o), 0);
  return (Number(data.totalRevenue) || 0) - (nonExecPayroll + opex);
}

/**
 * Keep executive sub-head amounts in sync:
 * amount = Basic + Commission + Loan+ve − Loan−ve + Occasional − PF (total payable).
 * Runs on every load / edit so commissions, loans, occasional & PF follow revenue & expense changes.
 */
export function recomputeExecutiveTeam(data: IncomeStatementData): IncomeStatementData {
  const teams = data.teamSalaries ?? [];
  const idx = teams.findIndex(t => resolvePayrollKind(t.team, t.subHeads) === "executive");
  if (idx < 0) return data;

  const base = executiveCommissionBase(data);
  const team = teams[idx];
  let changed = false;
  const subHeads = (team.subHeads ?? []).map(s => {
    const sal = ensureExecutiveSalaryDetail(s.salary, s.amount, {
      commissionPct: s.salary?.commissionPct ?? execPctForLabel(s.label),
    });
    const total = computeExecutiveSalary(sal, base).totalPayable;
    const salaryChanged =
      !s.salary ||
      Number(s.salary.basic) !== sal.basic ||
      Number(s.salary.commissionPct) !== sal.commissionPct ||
      Number(s.salary.loanPositive) !== sal.loanPositive ||
      Number(s.salary.loanNegative) !== sal.loanNegative ||
      Number(s.salary.occasionalAmount) !== Number(sal.occasionalAmount) ||
      String(s.salary.occasionalRemark ?? "") !== String(sal.occasionalRemark ?? "") ||
      (s.salary.pfAuto !== false) !== sal.pfAuto ||
      Number(s.salary.pfOverride ?? 0) !== Number(sal.pfOverride ?? 0);
    if (!salaryChanged && Math.abs((Number(s.amount) || 0) - total) < 0.005) return s;
    changed = true;
    return { ...s, salary: sal, amount: total };
  });
  if (!changed) return data;

  const nextTeam = {
    ...team,
    subHeads,
    totalSalary: subHeads.reduce((a, s) => a + (Number(s.amount) || 0), 0),
  };
  return {
    ...data,
    teamSalaries: teams.map((t, i) => (i === idx ? nextTeam : t)),
  };
}
