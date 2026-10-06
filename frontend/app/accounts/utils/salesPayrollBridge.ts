import type { SubHeadEntry } from "../types";
import {
  type SalesPayrollEmployee,
  computeSalesEmployeePayroll,
  calcTlAssignedCommission,
  calcSalesCommission,
  type SalesPayrollCalcOpts,
} from "./salesPayrollFormula";
import { HAMMAD_TEAM_LEAD_ID } from "./salesPayrollDefaults";

export type PayrollKind =
  | "technical"
  | "technical_manager"
  | "sales"
  | "sales_lead"
  | "admin"
  | "executive";

const SALES_REP_NAMES = new Set(["huraira", "faris", "ali", "faizan", "asim", "anam"]);
const SALES_LEAD_NAMES = new Set(["hammad"]);

export function isTechnicalManagerLabel(label: string): boolean {
  const l = label.trim().toLowerCase();
  return (
    l.includes("technical manager") ||
    l.includes("tech manager") ||
    l.includes("tech mgr") ||
    l.includes("(technical mgr)")
  );
}

export function isTechnicalManagerTeam(title: string): boolean {
  return title.trim().toLowerCase().includes("technical manager");
}

/** Per-employee kind — manager row inside a technical team still gets manager slip. */
export function resolveSubPayrollKind(
  sub: SubHeadEntry,
  teamTitle: string,
  teamKind: PayrollKind,
): PayrollKind {
  if (teamKind === "technical_manager" || isTechnicalManagerTeam(teamTitle)) {
    return "technical_manager";
  }
  if (teamKind === "technical" && isTechnicalManagerLabel(sub.label)) {
    return "technical_manager";
  }
  return teamKind;
}

export function isHammadSub(sub: { id?: string; label?: string }): boolean {
  const id = String(sub.id ?? "");
  const label = String(sub.label ?? "").trim().toLowerCase();
  return id === HAMMAD_TEAM_LEAD_ID || label === "hammad";
}

/** Template “Hammad” row — never a roster staff-emp-* person. */
export function isSeededTeamLeadPlaceholder(sub: { id?: string; label?: string }): boolean {
  const id = String(sub.id ?? "");
  if (id.startsWith("staff-emp-")) return false;
  return isHammadSub(sub);
}

export function isSalesLeadSub(sub: SubHeadEntry): boolean {
  return sub.salesPayroll?.role === "team_lead" || isHammadSub(sub);
}

export function isSalesRepSub(sub: SubHeadEntry): boolean {
  if (isSalesLeadSub(sub)) return false;
  const label = sub.label.trim().toLowerCase();
  return SALES_REP_NAMES.has(label) || sub.salesPayroll?.role === "sales";
}

export function payrollKindForTeamTitle(title: string): PayrollKind {
  const t = title.trim().toLowerCase();
  if (t.includes("technical manager")) return "technical_manager";
  if (t.includes("sales team lead") || t.includes("team lead sal") || t.includes("csr team lead")) {
    return "sales_lead";
  }
  if (
    t.includes("sales team") ||
    t.includes("csr team") ||
    t.includes("csr sal") ||
    (t.includes("csr") && t.includes("sal"))
  ) {
    return "sales";
  }
  if (t.includes("sales") && t.includes("sal") && !t.includes("technical")) return "sales";
  if (t.includes("bim model")) return "technical";
  if (/\bdev\b/.test(t)) return "admin";
  if (t.includes("admin")) return "admin";
  if (t.includes("executive")) return "executive";
  return "technical";
}

/** Infer sales payroll from saved sub-heads when title was renamed or legacy CSR label used. */
export function inferPayrollKindFromSubs(subs: SubHeadEntry[] | undefined): PayrollKind | null {
  if (!subs?.length) return null;
  if (subs.some(s => s.salesPayroll?.role === "team_lead")) return "sales_lead";
  if (subs.some(s => s.salesPayroll)) return "sales";
  const labels = subs.map(s => s.label.trim().toLowerCase());
  const repHits = labels.filter(l => SALES_REP_NAMES.has(l)).length;
  const leadHits = labels.filter(l => SALES_LEAD_NAMES.has(l)).length;
  if (repHits >= 2) return "sales";
  if (leadHits >= 1 && repHits === 0) return "sales_lead";
  return null;
}

export function resolvePayrollKind(title: string, subs?: SubHeadEntry[]): PayrollKind {
  const fromTitle = payrollKindForTeamTitle(title);
  if (title.trim().toLowerCase().includes("bim model")) return "technical";
  if (fromTitle !== "technical") return fromTitle;
  return inferPayrollKindFromSubs(subs) ?? "technical";
}

/** Force-convert subs for sales teams (strip legacy technical salary + remove team lead from reps). */
export function normalizeSalesTeamSubs(
  subs: SubHeadEntry[] | undefined,
  teamName: string,
  /** Sales Team reps — required so Sales Team Lead net includes assigned TL commission */
  salesPeers: SubHeadEntry[] = [],
  opts?: SalesPayrollCalcOpts,
): SubHeadEntry[] {
  const kind = resolvePayrollKind(teamName, subs);
  if (kind === "sales") {
    return (subs ?? [])
      .filter(s => !isSalesLeadSub(s))
      .map(s => {
        const sp = ensureSalesPayrollFromSub(s, "sales");
        const amount = netFromSalesSub({ ...s, salesPayroll: sp, salary: undefined }, "sales", 0, opts);
        return { ...s, salesPayroll: sp, amount, salary: undefined };
      });
  }
  if (kind === "sales_lead") {
    const leads = (subs ?? []).filter(s => isSalesLeadSub(s));
    return leads.map(s => {
      const sp = ensureSalesPayrollFromSub(s, "team_lead");
      sp.role = "team_lead";
      const leadId = sp.id || s.id;
      const extra = tlExtraFromPeers(leadId, salesPeers, opts);
      const amount = netFromSalesSub({ ...s, salesPayroll: sp, salary: undefined }, "team_lead", extra, opts);
      return { ...s, id: leadId, salesPayroll: sp, amount, salary: undefined };
    });
  }
  return subs ?? [];
}

export function isSalesTeamTitle(title: string, subs?: SubHeadEntry[]): boolean {
  const k = resolvePayrollKind(title, subs);
  return k === "sales" || k === "sales_lead";
}

export function emptySalesPayrollEmployee(
  name: string,
  role: "sales" | "team_lead",
  basic = 0,
  allowance = 0,
  id?: string,
): SalesPayrollEmployee {
  return {
    id: id ?? `sp-${Date.now()}`,
    name,
    code: "",
    role,
    basic,
    allowance,
    homeAllowance: 0,
    fuelAllowance: 0,
    medicalAllowance: 0,
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
    occasionalAmount: 0,
    occasionalRemark: "",
    pfAuto: true,
    pfOverride: null,
  };
}

/** Build sales payroll from sub-head (migrate legacy `salary` if needed). */
export function ensureSalesPayrollFromSub(
  sub: SubHeadEntry,
  role: "sales" | "team_lead",
): SalesPayrollEmployee {
  if (sub.salesPayroll) {
    const sp = sub.salesPayroll;
    const sal = sub.salary;
    return {
      ...sp,
      name: sub.label,
      role,
      occasionalAmount: Math.max(0, Number(sp.occasionalAmount) || 0),
      occasionalRemark: sp.occasionalRemark ?? "",
      pfAuto: sp.pfAuto !== false,
      pfOverride: sp.pfOverride ?? null,
      homeAllowance: Number(sp.homeAllowance ?? sal?.homeAllowance) || 0,
      fuelAllowance: Number(sp.fuelAllowance ?? sal?.fuelAllowance) || 0,
      medicalAllowance: Number(sp.medicalAllowance ?? sal?.medicalAllowance) || 0,
    };
  }
  const sal = sub.salary;
  const basic = sal?.basic ?? (Number(sub.amount) || 0);
  const allowance = sal?.allowance ?? 0;
  return {
    ...emptySalesPayrollEmployee(sub.label, role, basic, allowance, sub.id),
    checkIn: sal?.checkIn && sal.checkIn.startsWith("18") ? sal.checkIn : "18:00",
    lateDeductionOverride: sal?.lateDeductionOverride ?? null,
    paidLeaveDays: sal?.paidLeaveDays ?? 0,
    unpaidLeaveDays: sal?.unpaidLeaveDays ?? 0,
    loanTotal: sal?.loanTotal ?? 0,
    loanPaid: sal?.loanPaid ?? 0,
    loanThisMonth: sal?.loanThisMonth ?? 0,
    loanPaymentMode: sal?.loanPaymentMode ?? "salary",
    incomeTax: sal?.incomeTax ?? 0,
    remarks: sal?.remarks ?? "",
    occasionalAmount: Number(sal?.occasionalAmount) || 0,
    occasionalRemark: sal?.occasionalRemark ?? "",
    pfAuto: sal?.pfAuto !== false,
    pfOverride: sal?.pfOverride ?? null,
    homeAllowance: Number(sal?.homeAllowance) || 0,
    fuelAllowance: Number(sal?.fuelAllowance) || 0,
    medicalAllowance: Number(sal?.medicalAllowance) || 0,
  };
}

export function netFromSalesSub(
  sub: SubHeadEntry,
  role: "sales" | "team_lead",
  extraEarning = 0,
  opts?: SalesPayrollCalcOpts,
): number {
  const emp = ensureSalesPayrollFromSub(sub, role);
  return computeSalesEmployeePayroll(emp, extraEarning, opts).netSalary;
}

/** Whether a sales rep’s assign-to-lead points at this team lead. */
export function isRepAssignedToLead(rep: SalesPayrollEmployee, leadId: string): boolean {
  if (!rep.assignedToLead || !rep.assignedTeamLeadId) return false;
  // Match exact lead id, or default Hammad assign id (assign button always writes this)
  return (
    rep.assignedTeamLeadId === leadId ||
    rep.assignedTeamLeadId === HAMMAD_TEAM_LEAD_ID
  );
}

export function tlExtraFromPeers(
  leadSubId: string,
  salesTeamSubs: SubHeadEntry[],
  opts?: SalesPayrollCalcOpts,
): number {
  return salesTeamSubs
    .filter(s => isRepAssignedToLead(ensureSalesPayrollFromSub(s, "sales"), leadSubId))
    .reduce((sum, s) => sum + calcTlAssignedCommission(ensureSalesPayrollFromSub(s, "sales"), opts), 0);
}

export function salesSubsFromPeerRows(
  peerRows: { title: string; subHeads?: SubHeadEntry[] }[],
  opts?: SalesPayrollCalcOpts,
): SubHeadEntry[] {
  const salesRow = peerRows.find(r => payrollKindForTeamTitle(r.title) === "sales");
  if (!salesRow) return [];
  return normalizeSalesTeamSubs(salesRow.subHeads, salesRow.title, [], opts);
}

export function assignSalesSubToLead(sub: SubHeadEntry, leadId: string = HAMMAD_TEAM_LEAD_ID): SubHeadEntry {
  const sp = ensureSalesPayrollFromSub(sub, "sales");
  return {
    ...sub,
    salesPayroll: {
      ...sp,
      assignedToLead: true,
      assignedTeamLeadId: leadId,
    },
  };
}

export function subAmountForPayrollKind(
  sub: SubHeadEntry,
  kind: PayrollKind,
  salesPeers: SubHeadEntry[],
  opts?: SalesPayrollCalcOpts,
): number {
  if (kind === "sales") {
    return netFromSalesSub(sub, "sales", 0, opts);
  }
  if (kind === "sales_lead") {
    return netFromSalesSub(sub, "team_lead", tlExtraFromPeers(sub.id, salesPeers, opts), opts);
  }
  return sub.amount;
}

export function commissionSummary(sub: SubHeadEntry, role: "sales" | "team_lead", opts?: SalesPayrollCalcOpts) {
  const emp = ensureSalesPayrollFromSub(sub, role);
  return calcSalesCommission(emp.commission, role, opts);
}
