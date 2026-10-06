import {
  type SalesPayrollData,
  type SalesPayrollEmployee,
  newRowId,
} from "./salesPayrollFormula";

export function defaultSalesPayrollData(): SalesPayrollData {
  const hammadId = "stl-hammad";
  const member = (
    name: string,
    code: string,
    basic: number,
    allowance: number,
  ): SalesPayrollEmployee => ({
    id: newRowId("sal"),
    name,
    code,
    role: "sales",
    basic,
    allowance,
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
    loanPaymentMode: "salary" as const,
    incomeTax: 0,
    remarks: "",
  });

  return {
    salesTeamLeads: [
      {
        ...member("Hammad", "STL-01", 0, 0),
        id: hammadId,
        role: "team_lead" as const,
      },
    ],
    salesTeamMembers: [
      { ...member("Huraira", "SAL-01", 0, 0), id: "sal-huraira" },
      { ...member("Faris", "SAL-02", 0, 0), id: "sal-faris" },
      { ...member("Ali", "SAL-03", 0, 0), id: "sal-ali" },
      { ...member("Faizan", "SAL-04", 0, 0), id: "sal-faizan" },
      { ...member("Asim", "SAL-05", 0, 0), id: "sal-asim" },
      { ...member("Anam", "SAL-06", 0, 0), id: "sal-anam" },
    ],
  };
}

export function normalizeSalesPayrollData(raw: unknown): SalesPayrollData {
  const base = defaultSalesPayrollData();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Partial<SalesPayrollData>;
  return {
    salesTeamMembers:
      Array.isArray(o.salesTeamMembers) && o.salesTeamMembers.length > 0
        ? o.salesTeamMembers
        : base.salesTeamMembers,
    salesTeamLeads:
      Array.isArray(o.salesTeamLeads) && o.salesTeamLeads.length > 0
        ? o.salesTeamLeads
        : base.salesTeamLeads,
  };
}

export const HAMMAD_TEAM_LEAD_ID = "stl-hammad";
