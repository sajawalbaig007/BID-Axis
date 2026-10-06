/**
 * Sync Admin → All Employees payroll assignments into Income Statement team heads.
 * SubHead ids are stable: staff-emp-{staffEmployeeId}
 */

export const ACCOUNTS_PAYROLL_HEADS = [
  "Technical Team Salaries",
  "Sales Team Salaries",
  "Sales Team Lead Salaries",
  "Technical Manager Salaries",
  "Email Marketing Team Salaries",
  "BIM Modeler Salaries",
  "Administration Salaries",
  "Dev Salaries",
  "Executive Salaries",
] as const;

export type AccountsPayrollHead = (typeof ACCOUNTS_PAYROLL_HEADS)[number];

export function isAccountsPayrollHead(v: string | null | undefined): v is AccountsPayrollHead {
  return !!v && (ACCOUNTS_PAYROLL_HEADS as readonly string[]).includes(v);
}

export function staffPayrollSubId(staffId: string): string {
  return `staff-emp-${staffId}`;
}

export function isStaffPayrollSubId(id: string | undefined | null): boolean {
  return !!id && String(id).startsWith("staff-emp-");
}

/** recordDate YYYY-MM-DD, startMonth YYYY-MM */
export function payrollMonthReached(recordDate: string, startMonth: string): boolean {
  const ym = String(recordDate || "").slice(0, 7);
  const sm = String(startMonth || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym) || !/^\d{4}-\d{2}$/.test(sm)) return false;
  return ym >= sm;
}

type SubHead = {
  id?: string;
  label?: string;
  amount?: number;
  filledAt?: string;
  salary?: Record<string, unknown>;
  salesPayroll?: Record<string, unknown>;
  [key: string]: unknown;
};

type TeamRow = {
  id?: string;
  team?: string;
  totalSalary?: number;
  filledAt?: string;
  subHeads?: SubHead[];
  notes?: unknown[];
  [key: string]: unknown;
};

export type StaffPayrollPerson = {
  id: string;
  name: string;
  employeeCode: string | null;
  currentAddress: string | null;
  contactNo: string | null;
  cnic: string | null;
  payrollHead: string;
  payrollStartMonth: string;
};

function newTeamId(): string {
  return `team-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function isSalesLeadHead(team: string): boolean {
  return /sales team lead/i.test(team);
}

function isSalesHead(team: string): boolean {
  return /sales team/i.test(team) && !isSalesLeadHead(team);
}

function isSeededLeadPlaceholder(sub: SubHead): boolean {
  const id = String(sub.id ?? "");
  if (id.startsWith("staff-emp-")) return false;
  const label = String(sub.label ?? "").trim().toLowerCase();
  return id === "stl-hammad" || label === "hammad";
}

function isAdminHead(team: string): boolean {
  return /administration/i.test(team) || /\bdev\b/i.test(team);
}

function isTechMgrHead(team: string): boolean {
  return /technical manager/i.test(team);
}

function isExecHead(team: string): boolean {
  return /executive/i.test(team);
}

function emptySalary(team: string, profile: StaffPayrollPerson): Record<string, unknown> {
  const base: Record<string, unknown> = {
    basic: 0,
    allowance: 0,
    weekdayOtHours: 0,
    weekendOtHours: 0,
    checkIn: isAdminHead(team) ? "18:00" : isTechMgrHead(team) ? "09:00" : "07:00",
    checkOut: isTechMgrHead(team) ? "18:00" : "16:00",
    lateDeductionOverride: null,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    loanTotal: 0,
    loanPaid: 0,
    loanThisMonth: 0,
    loanPaymentMode: "salary",
    incomeTax: 0,
    pfAuto: true,
    remarks: "",
    employeeId: profile.employeeCode || "",
    address: profile.currentAddress || "",
    phone: profile.contactNo || "",
    cnic: profile.cnic || "",
  };
  if (isExecHead(team)) {
    base.commissionPct = 0;
    base.loanPositive = 0;
    base.loanNegative = 0;
  }
  return base;
}

function emptySales(profile: StaffPayrollPerson, role: "sales" | "team_lead", subId: string): Record<string, unknown> {
  return {
    id: subId,
    name: profile.name,
    code: profile.employeeCode || "",
    role,
    basic: 0,
    allowance: 0,
    commission: {
      oldClientProjects: 0,
      oldClientPartialCount: 0,
      newClientProjects: 0,
      fixClientProjects: [],
    },
    assignedToLead: false,
    assignedTeamLeadId: null,
    checkIn: "18:00",
    lateDeductionOverride: null,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    loanTotal: 0,
    loanPaid: 0,
    loanThisMonth: 0,
    loanPaymentMode: "salary",
    incomeTax: 0,
    remarks: "",
    cnic: profile.cnic || "",
    address: profile.currentAddress || "",
    phone: profile.contactNo || "",
  };
}

function applyProfileToExisting(sub: SubHead, person: StaffPayrollPerson, team: string): SubHead {
  const label = person.name;
  if (isSalesHead(team) || isSalesLeadHead(team)) {
    const role = isSalesLeadHead(team) ? "team_lead" : "sales";
    const prev = (sub.salesPayroll ?? {}) as Record<string, unknown>;
    return {
      ...sub,
      label,
      salesPayroll: {
        ...emptySales(person, role, String(sub.id)),
        ...prev,
        name: label,
        code: person.employeeCode || String(prev.code || ""),
        role: prev.role === "team_lead" || role === "team_lead" ? "team_lead" : "sales",
        cnic: person.cnic || "",
        address: person.currentAddress || "",
        phone: person.contactNo || "",
      },
    };
  }
  const prev = (sub.salary ?? {}) as Record<string, unknown>;
  const salary = {
    ...emptySalary(team, person),
    ...prev,
    employeeId: person.employeeCode || String(prev.employeeId || ""),
    address: person.currentAddress || "",
    phone: person.contactNo || "",
    cnic: person.cnic || "",
  };
  return { ...sub, label, salary, salesPayroll: undefined };
}

function createSub(person: StaffPayrollPerson, team: string, filledAt: string): SubHead {
  const id = staffPayrollSubId(person.id);
  if (isSalesHead(team) || isSalesLeadHead(team)) {
    const role = isSalesLeadHead(team) ? "team_lead" : "sales";
    return {
      id,
      label: person.name,
      amount: 0,
      filledAt,
      salesPayroll: emptySales(person, role, id),
    };
  }
  return {
    id,
    label: person.name,
    amount: 0,
    filledAt,
    salary: emptySalary(team, person),
  };
}

function sumSubs(subs: SubHead[]): number {
  return subs.reduce((a, s) => a + (Number(s.amount) || 0), 0);
}

/** September (and earlier) rows stay on the new head even if payroll starts later. */
function historicalHead(label: string): string | null {
  const tokens = label.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const ahmad = tokens.includes("ahmad") || tokens.includes("ahmed");
  if (ahmad && (tokens.includes("nadeem") || tokens.includes("naseem"))) return "BIM Modeler Salaries";
  const first = tokens[0] ?? "";
  if (first === "ahmer" || first === "sajawal") return "Dev Salaries";
  return null;
}

/**
 * Inject / refresh / prune staff-assigned employees on team salary heads
 * for the given Income Statement record date.
 */
export function mergeStaffPayrollIntoIncomeStatement(
  data: Record<string, unknown>,
  recordDate: string,
  people: StaffPayrollPerson[],
): Record<string, unknown> {
  const active = people.filter(
    p =>
      isAccountsPayrollHead(p.payrollHead) &&
      payrollMonthReached(recordDate, p.payrollStartMonth) &&
      !!String(p.name || "").trim(),
  );

  const byHead = new Map<string, StaffPayrollPerson[]>();
  for (const p of active) {
    const list = byHead.get(p.payrollHead) ?? [];
    list.push(p);
    byHead.set(p.payrollHead, list);
  }

  const activeIds = new Set(active.map(p => staffPayrollSubId(p.id)));
  const teams = ([...(data.teamSalaries as TeamRow[] | undefined) ?? []] as TeamRow[]).map(t => ({
    ...t,
    subHeads: [...(t.subHeads ?? [])],
  }));

  const parked = new Map<string, SubHead>();
  for (const team of teams) {
    for (const sub of team.subHeads ?? []) {
      if (isStaffPayrollSubId(sub.id)) parked.set(String(sub.id), sub);
    }
  }

  const teamByName = new Map(teams.map(t => [String(t.team || ""), t]));

  for (const head of ACCOUNTS_PAYROLL_HEADS) {
    const assigned = byHead.get(head) ?? [];
    let team = teamByName.get(head);
    if (!team && assigned.length === 0) continue;
    if (!team) {
      team = {
        id: newTeamId(),
        team: head,
        totalSalary: 0,
        filledAt: recordDate,
        subHeads: [],
        notes: [],
      };
      teams.push(team);
      teamByName.set(head, team);
    }

    // Drop roster-synced rows no longer assigned to this head / active
    let subs = (team.subHeads ?? []).filter(s => {
      if (isSalesLeadHead(head) && isSeededLeadPlaceholder(s)) return false;
      if (!isStaffPayrollSubId(s.id)) return true;
      if (!activeIds.has(String(s.id))) return false;
      // Keep only if still assigned to THIS head
      return assigned.some(p => staffPayrollSubId(p.id) === s.id);
    });

    for (const person of assigned) {
      const sid = staffPayrollSubId(person.id);
      const idx = subs.findIndex(s => s.id === sid);
      if (idx >= 0) {
        subs[idx] = applyProfileToExisting(subs[idx], person, head);
      } else {
        const previous = parked.get(sid);
        subs.push(previous ? applyProfileToExisting(previous, person, head) : createSub(person, head, recordDate));
      }
      parked.delete(sid);
    }

    team.subHeads = subs;
    team.totalSalary = sumSubs(subs);
  }

  for (const [sid, sub] of parked) {
    const head = historicalHead(String(sub.label ?? ""));
    if (!head) continue;
    let team = teamByName.get(head);
    if (!team) {
      team = {
        id: newTeamId(),
        team: head,
        totalSalary: 0,
        filledAt: recordDate,
        subHeads: [],
        notes: [],
      };
      teams.push(team);
      teamByName.set(head, team);
    }
    const subs = [...(team.subHeads ?? [])];
    if (!subs.some((row) => row.id === sid)) subs.push(sub);
    team.subHeads = subs;
    team.totalSalary = sumSubs(subs);
  }

  // Also prune staff-emp rows on any other team titles
  for (const team of teams) {
    const head = String(team.team || "");
    if ((ACCOUNTS_PAYROLL_HEADS as readonly string[]).includes(head)) continue;
    const before = team.subHeads?.length ?? 0;
    team.subHeads = (team.subHeads ?? []).filter(s => !isStaffPayrollSubId(s.id));
    if ((team.subHeads?.length ?? 0) !== before) {
      team.totalSalary = sumSubs(team.subHeads ?? []);
    }
  }

  return { ...data, teamSalaries: teams };
}
