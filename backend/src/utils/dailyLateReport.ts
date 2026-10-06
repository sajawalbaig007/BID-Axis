import prisma from "../config/db";
import { applyStaffPayrollToIncomeData } from "./loadStaffPayroll";
import {
  elapsedMonthDays,
  pktToday,
  policyDeductionForDays,
  refreshLatePolicies,
  type AttendanceDay,
  type PayAmounts,
} from "./lateDeduction";
import type { SalesPayrollEmployee } from "./salesPayrollDefaults";
import { computeSalesEmployeePayroll } from "./salesPayrollFormula";

type SalarySub = {
  label?: string;
  amount?: number;
  salary?: Record<string, unknown>;
  salesPayroll?: SalesPayrollEmployee;
};

type PersonCut = { name: string; department: string; day: number; month: number };

function policyDepartment(teamName: string, sales: boolean): string {
  if (sales) return "csr";
  const title = teamName.toLowerCase();
  if (title.includes("bim")) return "bim_modeler";
  if (title.includes("dev")) return "dev";
  if (title.includes("technical manager") || title.includes("chief")) return "chief_estimator";
  if (title.includes("technical")) return "estimator";
  if (title.includes("sales")) return "csr";
  if (title.includes("admin")) return "admin";
  if (title.includes("account")) return "accounts";
  if (title.includes("office")) return "office_boy";
  if (title === "hr" || title.includes("human resource")) return "hr";
  return "";
}

function payAmounts(sub: SalarySub, recordDate: string): PayAmounts {
  const sal = sub.salary ?? {};
  const sp = sub.salesPayroll;
  const allowanceOf = (row: Record<string, unknown> | SalesPayrollEmployee) =>
    (Number(row.allowance) || 0)
    + (Number(row.homeAllowance) || 0)
    + (Number(row.fuelAllowance) || 0)
    + (Number(row.medicalAllowance) || 0)
    + (Number((row as Record<string, unknown>).travelAllowance) || 0);

  if (sp) {
    const payroll = computeSalesEmployeePayroll(
      { ...sp, name: sub.label || sp.name, lateDeductionOverride: null },
      0,
      { recordDate },
    );
    return {
      basic: Number(sp.basic) || 0,
      commission: Number(payroll.totalCommission) || 0,
      overtime: 0,
      allowance: allowanceOf(sp),
    };
  }

  const basic = Number(sal.basic) || 0;
  const allowance = allowanceOf(sal);
  const travel = Number(sal.travelAllowance) || 0;
  const monthly = basic + allowance + travel;
  const hour = monthly / 30 / 8;
  const overtime =
    (Number(sal.weekdayOtHours) || 0) * hour * 1.5
    + (Number(sal.weekendOtHours) || 0) * hour * 2;
  return { basic, commission: 0, overtime, allowance };
}

export async function dailyLateReport(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const month = date.slice(0, 7);
  const today = pktToday();
  await refreshLatePolicies();

  const saved = await prisma.accountsRecord.findMany({
    where: { page: "income_statement" },
    orderBy: { recordDate: "desc" },
    take: 36,
  });
  const record = saved.find((row) => row.recordDate.slice(0, 7) <= month) ?? saved[0];
  const raw = (record?.data as Record<string, unknown> | undefined) ?? {};
  const recordDate = `${month}-01`;
  const data = await applyStaffPayrollToIncomeData(raw, recordDate);
  const teams = (data.teamSalaries as { team?: string; subHeads?: SalarySub[] }[] | undefined) ?? [];
  const monthDays = elapsedMonthDays(month, today);
  const dayList = date <= today ? [date] : [];
  const byName = new Map<string, PersonCut>();

  for (const team of teams) {
    const teamName = String(team.team ?? "").replace(/\s*salaries\s*/i, "").trim();
    for (const sub of team.subHeads ?? []) {
      const name = String(sub.label ?? sub.salesPayroll?.name ?? "").trim();
      if (!name) continue;
      const sal = sub.salary ?? {};
      const punches = (
        Array.isArray(sal.attendanceDays) ? sal.attendanceDays : sub.salesPayroll?.attendanceDays
      ) as AttendanceDay[] | undefined;
      if (!punches) continue;
      const amounts = payAmounts(sub, record?.recordDate || recordDate);
      const department = policyDepartment(teamName, !!sub.salesPayroll);
      if (!department) {
        const prevEmpty = byName.get(name.toLowerCase());
        if (!prevEmpty) byName.set(name.toLowerCase(), { name, department: teamName || "—", day: 0, month: 0 });
        continue;
      }
      const person = {
        personKey: typeof sal.latePersonKey === "string" ? sal.latePersonKey : "",
        personName: name,
      };
      const dayCut = policyDeductionForDays(department, month, amounts, punches, dayList, person) ?? 0;
      const monthCut = policyDeductionForDays(department, month, amounts, punches, monthDays, person) ?? 0;
      const prev = byName.get(name.toLowerCase());
      if (prev && prev.month >= monthCut && prev.day >= dayCut) continue;
      byName.set(name.toLowerCase(), { name, department: teamName || department, day: dayCut, month: monthCut });
    }
  }

  const people = [...byName.values()].sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name));
  return {
    date,
    month,
    through: monthDays[monthDays.length - 1] ?? `${month}-01`,
    people,
  };
}
