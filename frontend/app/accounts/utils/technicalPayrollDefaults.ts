import {
  computeSalary,
  emptySalaryDetail,
  type EmployeeSalaryDetail,
} from "./payrollFormula";

export type TechnicalPayrollEmployee = EmployeeSalaryDetail & {
  id: string;
  name: string;
  code: string;
  netSalary?: number;
};

export type TechnicalPayrollData = {
  employees: TechnicalPayrollEmployee[];
};

const TECH_SEED: { name: string; code: string; basic: number }[] = [
  { name: "Noman Khan", code: "TECH-01", basic: 0 },
  { name: "Muhammad Abdullah", code: "TECH-02", basic: 0 },
  { name: "Rizwan Sabir", code: "TECH-03", basic: 0 },
  { name: "Usama Jameel", code: "TECH-04", basic: 0 },
  { name: "Khaldoon Abrar", code: "TECH-05", basic: 0 },
  { name: "Muhammad Zaid", code: "TECH-06", basic: 0 },
  { name: "Muhammad Bariq", code: "TECH-07", basic: 0 },
  { name: "Afaq", code: "TECH-08", basic: 0 },
];

function makeEmp(id: string, name: string, code: string, basic: number): TechnicalPayrollEmployee {
  const detail = emptySalaryDetail({ basic });
  return {
    id,
    name,
    code,
    ...detail,
    netSalary: computeSalary(detail).totalSalary,
  };
}

export function defaultTechnicalPayrollData(): TechnicalPayrollData {
  return {
    employees: TECH_SEED.map((p, i) =>
      makeEmp(`tech-${i + 1}`, p.name, p.code, p.basic),
    ),
  };
}

export function normalizeTechnicalPayrollData(raw: unknown): TechnicalPayrollData {
  const base = defaultTechnicalPayrollData();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Partial<TechnicalPayrollData>;
  if (!Array.isArray(o.employees) || o.employees.length === 0) return base;

  const employees: TechnicalPayrollEmployee[] = [];
  o.employees.forEach((e, i) => {
    if (!e || typeof e !== "object") return;
    const name = String(e.name ?? "").trim();
    if (!name) return;
    const detail = emptySalaryDetail({
      basic: Number(e.basic) || 0,
      allowance: Number(e.allowance) || 0,
      weekdayOtHours: Number(e.weekdayOtHours) || 0,
      weekendOtHours: Number(e.weekendOtHours) || 0,
      checkIn: String(e.checkIn ?? "07:00"),
      checkOut: String(e.checkOut ?? "16:00"),
      lateDeductionOverride: e.lateDeductionOverride ?? null,
      paidLeaveDays: Number(e.paidLeaveDays) || 0,
      unpaidLeaveDays: Number(e.unpaidLeaveDays) || 0,
      loanTotal: Number(e.loanTotal) || 0,
      loanPaid: Number(e.loanPaid) || 0,
      loanThisMonth: Number(e.loanThisMonth) || 0,
      incomeTax: Number(e.incomeTax) || 0,
      pfAuto: e.pfAuto !== false,
      pfOverride: e.pfOverride ?? null,
      remarks: String(e.remarks ?? ""),
      employeeId: String(e.employeeId ?? e.code ?? ""),
      address: String(e.address ?? ""),
      phone: String(e.phone ?? ""),
      cnic: String(e.cnic ?? ""),
    });
    employees.push({
      id: String(e.id ?? `tech-${i + 1}`),
      name,
      code: String(e.code ?? `TECH-${String(i + 1).padStart(2, "0")}`),
      ...detail,
      netSalary: computeSalary(detail).totalSalary,
    });
  });

  return { employees: employees.length ? employees : base.employees };
}

/** Seed / payroll codes for GPS technical slips when HR employeeId is empty. */
export function technicalCodeForName(name: string): string {
  const want = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!want) return "";
  const hit = TECH_SEED.find(p => p.name.trim().toLowerCase() === want);
  return hit?.code ?? "";
}
