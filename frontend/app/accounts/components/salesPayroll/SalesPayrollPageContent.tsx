"use client";

import { useCallback } from "react";
import AccountsPageShell from "../AccountsPageShell";
import SalesPayrollEmployeeEditor from "./SalesPayrollEmployeeEditor";
import { accountsShellProps } from "../../utils/accountsShellProps";
import { useAccountsPage } from "../../hooks/useAccountsPage";
import {
  defaultSalesPayrollData,
  normalizeSalesPayrollData,
} from "../../utils/salesPayrollDefaults";
import type { SalesPayrollData, SalesPayrollEmployee } from "../../utils/salesPayrollFormula";
import { computeSalesEmployeePayroll, calcTlAssignedCommission } from "../../utils/salesPayrollFormula";
import { isRepAssignedToLead } from "../../utils/salesPayrollBridge";
import { currency } from "../../types";
import { useSalesPayrollCalcOpts } from "../../hooks/useSalesPayrollCalcOpts";

type Props = {
  variant: "sales" | "team_lead";
};

export default function SalesPayrollPageContent({ variant }: Props) {
  const acc = useAccountsPage<SalesPayrollData>({
    page: "sales_payroll",
    defaultData: defaultSalesPayrollData,
  });

  const data = normalizeSalesPayrollData(acc.data);
  const calcOpts = useSalesPayrollCalcOpts(acc.recordDate);
  const employees = variant === "sales" ? data.salesTeamMembers : data.salesTeamLeads;

  const updateMember = useCallback(
    (id: string, next: SalesPayrollEmployee) => {
      acc.setData(prev => {
        const d = normalizeSalesPayrollData(prev);
        return {
          ...d,
          salesTeamMembers: d.salesTeamMembers.map(m => (m.id === id ? next : m)),
        };
      });
    },
    [acc],
  );

  const updateLead = useCallback(
    (id: string, next: SalesPayrollEmployee) => {
      acc.setData(prev => {
        const d = normalizeSalesPayrollData(prev);
        return {
          ...d,
          salesTeamLeads: d.salesTeamLeads.map(m => (m.id === id ? next : m)),
        };
      });
    },
    [acc],
  );

  const totalNet = employees.reduce((s, e) => {
    const extra =
      variant === "team_lead"
        ? data.salesTeamMembers
            .filter(m => isRepAssignedToLead(m, e.id))
            .reduce((x, m) => x + calcTlAssignedCommission(m, calcOpts), 0)
        : 0;
    return s + computeSalesEmployeePayroll(e, extra, calcOpts).netSalary;
  }, 0);

  const title = variant === "sales" ? "Sales Team Payroll" : "Sales Team Lead Payroll";
  const subtitle =
    variant === "sales"
      ? "Project commission — pick range, then projects + total amount (selected % × 0.89 × FX from Aug 2026) · Assign to Hammad"
      : "Hammad & team leads — own commission + 0.5% × 0.89 × FX on team projects (from Aug 2026)";

  return (
    <AccountsPageShell
      title={title}
      subtitle={subtitle}
      {...accountsShellProps(acc)}
    >
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-[#ECFDF3] to-white p-4">
          <p className="text-[10px] font-bold uppercase text-emerald-700 opacity-80">Headcount</p>
          <p className="text-xl font-extrabold text-emerald-800 mt-1">{employees.length}</p>
        </div>
        <div className="rounded-2xl border border-[#1B6FE8]/20 bg-gradient-to-br from-[#EAF2FE] to-white p-4">
          <p className="text-[10px] font-bold uppercase text-[#1B6FE8] opacity-80">Total Net (computed)</p>
          <p className="text-xl font-extrabold text-[#1B6FE8] mt-1 tabular-nums">{currency(totalNet)}</p>
        </div>
        {variant === "team_lead" && (
          <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-[#F3EEFF] to-white p-4 col-span-2 lg:col-span-1">
            <p className="text-[10px] font-bold uppercase text-indigo-700 opacity-80">Primary Team Lead</p>
            <p className="text-lg font-extrabold text-indigo-900 mt-1">Hammad</p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {employees.map((emp, i) => (
          <SalesPayrollEmployeeEditor
            key={emp.id}
            employee={emp}
            variant={variant}
            allData={data}
            defaultOpen={i === 0}
            calcOpts={calcOpts}
            onChange={next =>
              variant === "sales" ? updateMember(emp.id, next) : updateLead(emp.id, next)
            }
          />
        ))}
      </div>
    </AccountsPageShell>
  );
}
