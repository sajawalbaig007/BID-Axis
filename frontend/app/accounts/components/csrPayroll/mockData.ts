/** Static mock data — Sales Team payroll design (no overtime, commission only) */

export type FixClientProject = {
  id: string;
  clientName: string;
  projectPay: number;
  commissionPct: number;
};

export type AssignedSalesRepRow = {
  id: string;
  repName: string;
  repCode: string;
  totalProjects: number;
  fixClientAmount: number;
  tlCommission: number;
  assigned: boolean;
};

export type SalesPayrollMock = {
  id: string;
  name: string;
  code: string;
  role: "sales" | "team_lead";
  basicSalary: number;
  allowance: number;
  oldClientProjects: number;
  oldClientPartialCount: number;
  newClientProjects: number;
  fixClientProjects: FixClientProject[];
  checkIn: string;
  lateDeduction: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  unpaidLeaveDeduction: number;
  loanTotal: number;
  loanPaid: number;
  loanThisMonth: number;
  incomeTax: number;
  remarks: string;
  assignedReps?: AssignedSalesRepRow[];
};

const fix = (clientName: string, projectPay: number): FixClientProject => ({
  id: `fix-${clientName}`,
  clientName,
  projectPay,
  commissionPct: 2.5,
});

export const MOCK_SALES_TEAM: SalesPayrollMock[] = [
  {
    id: "sal-1",
    name: "Ayesha Khan",
    code: "SAL-101",
    role: "sales",
    basicSalary: 45000,
    allowance: 8000,
    oldClientProjects: 4,
    oldClientPartialCount: 1,
    newClientProjects: 3,
    fixClientProjects: [fix("Acme Corp", 6000), fix("Nova Ltd", 4200)],
    checkIn: "18:22",
    lateDeduction: 1867,
    paidLeaveDays: 1,
    unpaidLeaveDays: 0,
    unpaidLeaveDeduction: 0,
    loanTotal: 50000,
    loanPaid: 20000,
    loanThisMonth: 5000,
    incomeTax: 1200,
    remarks: "",
  },
  {
    id: "sal-2",
    name: "Hassan Ali",
    code: "SAL-102",
    role: "sales",
    basicSalary: 42000,
    allowance: 6000,
    oldClientProjects: 2,
    oldClientPartialCount: 0,
    newClientProjects: 5,
    fixClientProjects: [fix("Bright Co", 8000)],
    checkIn: "18:08",
    lateDeduction: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 1,
    unpaidLeaveDeduction: 1600,
    loanTotal: 0,
    loanPaid: 0,
    loanThisMonth: 0,
    incomeTax: 800,
    remarks: "Unpaid leave — family emergency",
  },
  {
    id: "sal-3",
    name: "Sana Malik",
    code: "SAL-103",
    role: "sales",
    basicSalary: 48000,
    allowance: 10000,
    oldClientProjects: 6,
    oldClientPartialCount: 2,
    newClientProjects: 2,
    fixClientProjects: [],
    checkIn: "18:45",
    lateDeduction: 2933,
    paidLeaveDays: 2,
    unpaidLeaveDays: 0,
    unpaidLeaveDeduction: 0,
    loanTotal: 30000,
    loanPaid: 12000,
    loanThisMonth: 0,
    incomeTax: 1500,
    remarks: "",
  },
];

export const MOCK_SALES_TEAM_LEADS: SalesPayrollMock[] = [
  {
    id: "stl-1",
    name: "Usman Raza",
    code: "STL-01",
    role: "team_lead",
    basicSalary: 65000,
    allowance: 15000,
    oldClientProjects: 2,
    oldClientPartialCount: 0,
    newClientProjects: 4,
    fixClientProjects: [fix("Global Tech", 12000)],
    checkIn: "18:05",
    lateDeduction: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    unpaidLeaveDeduction: 0,
    loanTotal: 80000,
    loanPaid: 35000,
    loanThisMonth: 8000,
    incomeTax: 3500,
    remarks: "",
    assignedReps: [
      { id: "a1", repName: "Ayesha Khan", repCode: "SAL-101", totalProjects: 10, fixClientAmount: 6000, tlCommission: 10030, assigned: true },
      { id: "a2", repName: "Hassan Ali", repCode: "SAL-102", totalProjects: 8, fixClientAmount: 8000, tlCommission: 8040, assigned: true },
      { id: "a3", repName: "Sana Malik", repCode: "SAL-103", totalProjects: 0, fixClientAmount: 0, tlCommission: 0, assigned: false },
    ],
  },
  {
    id: "stl-2",
    name: "Fatima Noor",
    code: "STL-02",
    role: "team_lead",
    basicSalary: 62000,
    allowance: 12000,
    oldClientProjects: 1,
    oldClientPartialCount: 0,
    newClientProjects: 3,
    fixClientProjects: [],
    checkIn: "18:12",
    lateDeduction: 933,
    paidLeaveDays: 1,
    unpaidLeaveDays: 0,
    unpaidLeaveDeduction: 0,
    loanTotal: 0,
    loanPaid: 0,
    loanThisMonth: 0,
    incomeTax: 2000,
    remarks: "",
    assignedReps: [
      { id: "b1", repName: "Hassan Ali", repCode: "SAL-102", totalProjects: 5, fixClientAmount: 0, tlCommission: 5000, assigned: true },
    ],
  },
];

/** @deprecated use MOCK_SALES_TEAM */
export const MOCK_CSR_TEAM = MOCK_SALES_TEAM;
/** @deprecated use MOCK_SALES_TEAM_LEADS */
export const MOCK_TEAM_LEADS = MOCK_SALES_TEAM_LEADS;
export type CsrPayrollMock = SalesPayrollMock;
