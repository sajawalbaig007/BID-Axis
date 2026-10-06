/** Build a salary-slip payload from Income Statement employee rows. */

import type { SubHeadEntry } from "../types";
import {
  allowanceParts,
  computeAdminSalary,
  computeExecutiveSalary,
  computeSalary,
  computeTechnicalManagerSalary,
  emptySalaryDetail,
  type EmployeeSalaryDetail,
} from "./payrollFormula";
import {
  computeSalesEmployeePayroll,
  fixRowProjectCount,
  type SalesCommissionFields,
  type SalesPayrollEmployee,
} from "./salesPayrollFormula";
import {
  salarySlipMonthLabel,
  salarySlipMonthCompact,
  slipTemplateForKind,
  type SalarySlipLine,
  type SalarySlipPayload,
  type SalarySlipTemplate,
} from "./salarySlipShared";
import {
  DEFAULT_SALARY_SLIP_COMPANY,
  salarySlipCompanyForKind,
  type SalarySlipCompanyKey,
} from "./salarySlipCompanies";
import { technicalCodeForName } from "./technicalPayrollDefaults";

export type SlipPayrollKind =
  | "technical"
  | "technical_manager"
  | "admin"
  | "sales"
  | "sales_lead"
  | "executive";

function profileFromSalary(sal?: Partial<EmployeeSalaryDetail> | null) {
  return {
    employeeId: String(sal?.employeeId || "").trim(),
    address: sal?.address || "",
    phone: sal?.phone || "",
    cnic: sal?.cnic || "",
  };
}

function resolveSlipEmployeeId(
  sub: SubHeadEntry,
  kind: SlipPayrollKind,
  sal?: Partial<EmployeeSalaryDetail> | null,
): string {
  const fromSalary = String(sal?.employeeId || "").trim();
  if (fromSalary) return fromSalary;
  const sales = sub.salesPayroll as SalesPayrollEmployee | undefined;
  const fromSales = String(sales?.code || "").trim();
  if (fromSales) return fromSales;
  if (kind === "technical" || kind === "technical_manager") {
    return technicalCodeForName(sub.label);
  }
  return "";
}

function commentsFrom(
  sal?: { remarks?: string; occasionalAmount?: number; occasionalRemark?: string },
  unpaidDays = 0,
  paidDays = 0,
): string {
  const bits: string[] = [];
  if (sal?.remarks?.trim()) bits.push(sal.remarks.trim());
  const occ = Math.max(0, Number(sal?.occasionalAmount) || 0);
  if (occ > 0) {
    const note = sal?.occasionalRemark?.trim();
    bits.push(
      note
        ? `Occasional (no deduction): ${note}`
        : "Occasional amount added to net with no deduction.",
    );
  }
  if (paidDays > 0) bits.push(`Your ${paidDays} leave(s) considered as paid/casual leave.`);
  if (unpaidDays > 0) bits.push(`Unpaid leave days: ${unpaidDays}.`);
  return bits.join(" ") || "";
}

/** Occasional is payload-level (net add-on), never an earning line. */
function occasionalPayloadFields(sal: {
  occasionalAmount?: number;
  occasionalRemark?: string;
}): Pick<SalarySlipPayload, "occasionalAmount" | "occasionalRemark"> {
  const occasionalAmount = Math.max(0, Number(sal.occasionalAmount) || 0);
  if (occasionalAmount <= 0) return {};
  const remark = sal.occasionalRemark?.trim();
  return {
    occasionalAmount,
    ...(remark ? { occasionalRemark: remark } : {}),
  };
}

function commissionQtyLabels(c: SalesCommissionFields) {
  const oldCount = Number(c.oldClientProjects) || 0;
  const partial = Math.min(Number(c.oldClientPartialCount) || 0, oldCount);
  const oldFull = oldCount - partial;
  const newCount = Number(c.newClientProjects) || 0;
  const fixCount = (c.fixClientProjects ?? []).reduce((s, p) => s + fixRowProjectCount(p), 0);
  return {
    old:
      oldCount > 0
        ? partial > 0
          ? `${oldFull} full + ${partial} half`
          : `${oldCount} proj`
        : undefined,
    new: newCount > 0 ? `${newCount} proj` : undefined,
    fix: fixCount > 0 ? `${fixCount} client` : undefined,
  };
}

function allowanceSlipLines(detail: {
  allowance?: number;
  homeAllowance?: number;
  fuelAllowance?: number;
  medicalAllowance?: number;
}): SalarySlipLine[] {
  const p = allowanceParts(detail);
  return [
    { label: "Allowances", amount: p.total },
    { label: "Misc Allowance", amount: p.misc, indent: true, includeInTotal: false },
    { label: "Home Allowance", amount: p.home, indent: true, includeInTotal: false },
    { label: "Fuel Allowance", amount: p.fuel, indent: true, includeInTotal: false },
    { label: "Medical Allowance", amount: p.medical, indent: true, includeInTotal: false },
  ];
}

function buildSalesSlipEarnings(
  emp: SalesPayrollEmployee,
  b: ReturnType<typeof computeSalesEmployeePayroll>,
  kind: "sales" | "sales_lead",
  salesExtra: number,
  _template: SalarySlipTemplate,
): SalarySlipLine[] {
  const qty = commissionQtyLabels(emp.commission);
  const projectComm = b.oldComm + b.newComm;
  const lines: SalarySlipLine[] = [
    { label: "Basic Salary", amount: emp.basic },
    ...allowanceSlipLines(emp),
    {
      label: "Project Based Comm",
      amount: projectComm,
      qty: qty.old || qty.new ? [qty.old, qty.new].filter(Boolean).join(" · ") : undefined,
    },
    {
      label: "Fixed Client Comm",
      amount: b.fixComm,
      qty: qty.fix,
    },
  ];

  if (kind === "sales_lead" && salesExtra > 0) {
    lines.push({
      label: "Team Lead Commission",
      amount: salesExtra,
      qty: "Assigned reps",
    });
  }

  return lines;
}

function buildTechnicalManagerEarnings(
  sal: EmployeeSalaryDetail,
): SalarySlipLine[] {
  const b = computeTechnicalManagerSalary(sal);
  return [
    { label: "Basic Salary", amount: sal.basic },
    ...allowanceSlipLines(sal),
    {
      label: "Weekday Overtime (1.5x)",
      amount: b.weekdayOtPay,
      qty: sal.weekdayOtHours > 0 ? `${sal.weekdayOtHours} hr` : undefined,
    },
    {
      label: "Weekend Overtime (2x)",
      amount: b.weekendOtPay,
      qty: sal.weekendOtHours > 0 ? `${sal.weekendOtHours} hr` : undefined,
    },
  ];
}

function standardDeductions(
  b: {
    incomeTax: number;
    unpaidLeaveDeduction: number;
    lateDeduction: number;
    pf: number;
    loanThisMonth?: number;
  },
  sal: { unpaidLeaveDays?: number; loanThisMonth?: number },
  loanThisMonth: number,
): SalarySlipLine[] {
  const unpaidDays = Number(sal.unpaidLeaveDays) || 0;
  return [
    { label: "Income Tax", amount: b.incomeTax },
    {
      label: "Unpaid Leaves",
      amount: b.unpaidLeaveDeduction,
      qty: unpaidDays > 0 ? `${unpaidDays} day(s)` : undefined,
    },
    { label: "Late Arrival Deduction", amount: b.lateDeduction },
    { label: "Employee PF Share", amount: b.pf },
    { label: "Loan Deduction", amount: loanThisMonth },
  ];
}

export function buildSalarySlipFromSub(opts: {
  sub: SubHeadEntry;
  kind: SlipPayrollKind;
  recordDate: string;
  companyKey?: SalarySlipCompanyKey;
  execProfitBase?: number;
  salesExtra?: number;
}): SalarySlipPayload {
  const {
    sub,
    kind,
    recordDate,
    companyKey = DEFAULT_SALARY_SLIP_COMPANY,
    execProfitBase = 0,
    salesExtra = 0,
  } = opts;
  const monthLabel = salarySlipMonthLabel(recordDate);
  const monthCompact = salarySlipMonthCompact(recordDate);
  const template = slipTemplateForKind(kind);

  if (kind === "sales" || kind === "sales_lead") {
    const sp = sub.salesPayroll as SalesPayrollEmployee | undefined;
    const role = kind === "sales_lead" || sp?.role === "team_lead" ? "team_lead" : "sales";
    const emp: SalesPayrollEmployee = {
      id: sp?.id || sub.id,
      name: sub.label,
      code: sp?.code || "",
      role,
      basic: Number(sp?.basic) || 0,
      allowance: Number(sp?.allowance) || 0,
      homeAllowance: Number(sp?.homeAllowance) || Number(sub.salary?.homeAllowance) || 0,
      fuelAllowance: Number(sp?.fuelAllowance) || Number(sub.salary?.fuelAllowance) || 0,
      medicalAllowance: Number(sp?.medicalAllowance) || Number(sub.salary?.medicalAllowance) || 0,
      commission: sp?.commission ?? {
        oldClientProjects: 0,
        oldClientPartialCount: 0,
        newClientProjects: 0,
        fixClientProjects: [],
      },
      assignedToLead: !!sp?.assignedToLead,
      assignedTeamLeadId: sp?.assignedTeamLeadId ?? null,
      checkIn: sp?.checkIn || "18:00",
      lateDeductionOverride: sp?.lateDeductionOverride ?? null,
      paidLeaveDays: Number(sp?.paidLeaveDays) || 0,
      unpaidLeaveDays: Number(sp?.unpaidLeaveDays) || 0,
      loanTotal: Number(sp?.loanTotal) || 0,
      loanPaid: Number(sp?.loanPaid) || 0,
      loanThisMonth: Number(sp?.loanThisMonth) || 0,
      loanPaymentMode: sp?.loanPaymentMode === "cash" ? "cash" : "salary",
      incomeTax: Number(sp?.incomeTax) || 0,
      remarks: sp?.remarks || "",
      occasionalAmount: Number(sp?.occasionalAmount) || 0,
      occasionalRemark: sp?.occasionalRemark || "",
      cnic: sp?.cnic || "",
      address: sp?.address || "",
      phone: sp?.phone || "",
    };
    const b = computeSalesEmployeePayroll(emp, salesExtra, { recordDate });
    return {
      companyKey,
      template,
      monthLabel,
      monthCompact,
      employeeName: emp.name,
      employeeId: emp.code.trim() || undefined,
      address: emp.address || undefined,
      phone: emp.phone || undefined,
      cnic: emp.cnic || undefined,
      earnings: buildSalesSlipEarnings(emp, b, kind, salesExtra, template),
      deductions: standardDeductions(
        {
          incomeTax: emp.incomeTax,
          unpaidLeaveDeduction: b.unpaidLeaveDeduction,
          lateDeduction: b.lateDeduction,
          pf: b.pf,
        },
        emp,
        b.loanFromSalary,
      ),
      ...occasionalPayloadFields(emp),
      comments: commentsFrom(emp, emp.unpaidLeaveDays, emp.paidLeaveDays),
      employeePf: b.pf,
      employerPf: b.pf,
      /** No. of projects — only on Sales Team slips (not team lead / technical) */
      projectCount: kind === "sales" ? b.totalProjects : undefined,
    };
  }

  if (kind === "executive") {
    const sal = emptySalaryDetail(sub.salary ?? { basic: sub.amount });
    const ex = computeExecutiveSalary(sal, execProfitBase);
    const profile = profileFromSalary(sal);
    return {
      companyKey,
      template,
      monthLabel,
      monthCompact,
      employeeName: sub.label,
      ...profile,
      employeeId: resolveSlipEmployeeId(sub, kind, sal) || profile.employeeId || undefined,
      earnings: [
        { label: "BasicSalary", amount: ex.basic },
        ...allowanceSlipLines(sal),
        { label: "Commission", amount: ex.commission, qty: `${ex.commissionPct}%` },
        ...(ex.loanPositive > 0
          ? [{ label: "Loan (company owes)", amount: ex.loanPositive }]
          : []),
      ].filter(r => r.amount !== 0 || r.label === "BasicSalary" || r.indent || r.label === "Allowances"),
      deductions: [
        { label: "Income Tax", amount: 0 },
        { label: "Unpaid Leaves", amount: 0 },
        { label: "Late Arrival Deduction", amount: 0 },
        { label: "Employee PF Share", amount: ex.pf },
        { label: "Loan Deduction", amount: ex.loanNegative },
      ],
      ...occasionalPayloadFields(sal),
      comments: commentsFrom(sal),
      employeePf: ex.pf,
      employerPf: ex.pf,
    };
  }

  const sal = emptySalaryDetail(sub.salary ?? { basic: sub.amount });
  const isTechMgr = kind === "technical_manager";
  const isTechnical = kind === "technical" || isTechMgr;
  const b = isTechMgr
    ? computeTechnicalManagerSalary(sal)
    : kind === "admin"
      ? computeAdminSalary(sal)
      : computeSalary(sal);
  const profile = profileFromSalary(sal);

  return {
    companyKey: isTechnical ? salarySlipCompanyForKind(kind, companyKey) : companyKey,
    template: isTechnical ? slipTemplateForKind(kind) : template,
    monthLabel,
    monthCompact,
    employeeName: sub.label,
    ...profile,
    employeeId: resolveSlipEmployeeId(sub, kind, sal) || undefined,
    earnings: isTechnical
      ? isTechMgr
        ? buildTechnicalManagerEarnings(sal)
        : [
            { label: "Basic Salary", amount: sal.basic },
            ...allowanceSlipLines(sal),
            {
              label: "Weekday Overtime (1.5x)",
              amount: b.weekdayOtPay,
              qty: sal.weekdayOtHours > 0 ? `${sal.weekdayOtHours} hr` : undefined,
            },
            {
              label: "Weekend Overtime (2x)",
              amount: b.weekendOtPay,
              qty: sal.weekendOtHours > 0 ? `${sal.weekendOtHours} hr` : undefined,
            },
          ]
      : [
          { label: "Basic Salary", amount: sal.basic },
          ...allowanceSlipLines(sal),
          ...(b.totalOvertime > 0 ? [{ label: "Overtime", amount: b.totalOvertime }] : []),
        ],
    deductions: standardDeductions(
      { ...b, loanThisMonth: b.loanFromSalary },
      sal,
      b.loanFromSalary,
    ),
    ...occasionalPayloadFields(sal),
    comments: commentsFrom(sal, sal.unpaidLeaveDays, sal.paidLeaveDays),
    employeePf: b.pf,
    employerPf: b.pf,
  };
}
