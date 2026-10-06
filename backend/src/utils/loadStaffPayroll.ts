import prisma from "../config/db";
import {
  isAccountsPayrollHead,
  mergeStaffPayrollIntoIncomeStatement,
  type StaffPayrollPerson,
} from "./staffPayrollSync";
import { applyAttendanceCheckIns } from "./salaryAttendanceSync";

const BIM_HEAD = "BIM Modeler Salaries";
const DEV_HEAD = "Dev Salaries";

function forcedPayrollHead(name: string): string | null {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const ahmad = tokens.includes("ahmad") || tokens.includes("ahmed");
  if (ahmad && (tokens.includes("nadeem") || tokens.includes("naseem"))) return BIM_HEAD;
  const first = tokens[0] ?? "";
  if (first === "ahmer" || first === "sajawal") return DEV_HEAD;
  return null;
}

/** Load assigned staff employees (profile from User when linked). */
export async function loadStaffPayrollPeople(): Promise<StaffPayrollPerson[]> {
  const rows = await prisma.staffEmployee.findMany();
  const assigned = rows.filter(r => !!r.payrollHead && !!r.payrollStartMonth);
  const userIds = assigned.map(r => r.userId).filter((id): id is string => !!id);
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            name: true,
            employeeCode: true,
            currentAddress: true,
            contactNo: true,
            cnic: true,
          },
        })
      : [];
  const byId = new Map(users.map(u => [u.id, u]));

  const out: StaffPayrollPerson[] = [];
  for (const r of assigned) {
    if (!isAccountsPayrollHead(r.payrollHead) || !r.payrollStartMonth) continue;
    const u = r.userId ? byId.get(r.userId) : null;
    const name = (u?.name || r.name || "").trim();
    if (!name) continue;
    const forced = forcedPayrollHead(name);
    const payrollHead = forced ?? r.payrollHead;
    if (forced && forced !== r.payrollHead) {
      await prisma.staffEmployee.update({ where: { id: r.id }, data: { payrollHead: forced } });
    }
    out.push({
      id: r.id,
      name,
      employeeCode: u?.employeeCode ?? r.employeeCode ?? null,
      currentAddress: u?.currentAddress ?? r.currentAddress ?? null,
      contactNo: u?.contactNo ?? r.contactNo ?? null,
      cnic: u?.cnic ?? r.cnic ?? null,
      payrollHead,
      payrollStartMonth: r.payrollStartMonth,
    });
  }
  return out;
}

export async function applyStaffPayrollToIncomeData(
  data: Record<string, unknown>,
  recordDate: string,
): Promise<Record<string, unknown>> {
  try {
    const people = await loadStaffPayrollPeople();
    if (!people.length) {
      const pruned = mergeStaffPayrollIntoIncomeStatement(data, recordDate, []);
      return applyAttendanceCheckIns(pruned, recordDate);
    }
    const merged = mergeStaffPayrollIntoIncomeStatement(data, recordDate, people);
    return applyAttendanceCheckIns(merged, recordDate);
  } catch (err) {
    console.error("[staffPayroll] merge failed", err);
    return data;
  }
}
