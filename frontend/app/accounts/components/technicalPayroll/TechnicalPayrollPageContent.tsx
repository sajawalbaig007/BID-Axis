"use client";

import { useCallback, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import AccountsPageShell from "../AccountsPageShell";
import EmployeeSalaryEditor from "../EmployeeSalaryEditor";
import { accountsShellProps } from "../../utils/accountsShellProps";
import { useAccountsPage } from "../../hooks/useAccountsPage";
import {
  defaultTechnicalPayrollData,
  normalizeTechnicalPayrollData,
  type TechnicalPayrollEmployee,
} from "../../utils/technicalPayrollDefaults";
import { computeSalary, emptySalaryDetail } from "../../utils/payrollFormula";
import { currency, newRowId } from "../../types";

export default function TechnicalPayrollPageContent() {
  const acc = useAccountsPage({
    page: "technical_payroll",
    defaultData: defaultTechnicalPayrollData,
  });

  const data = normalizeTechnicalPayrollData(acc.data);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(data.employees[0] ? [data.employees[0].id] : []));

  const updateEmployee = useCallback(
    (id: string, next: TechnicalPayrollEmployee) => {
      acc.setData(prev => {
        const d = normalizeTechnicalPayrollData(prev);
        return {
          employees: d.employees.map(e =>
            e.id === id
              ? { ...next, netSalary: computeSalary(next).totalSalary }
              : e,
          ),
        };
      });
    },
    [acc],
  );

  const addEmployee = () => {
    const id = newRowId("tech");
    const detail = emptySalaryDetail({ basic: 0 });
    const emp: TechnicalPayrollEmployee = {
      id,
      name: "New employee",
      code: `TECH-${String(data.employees.length + 1).padStart(2, "0")}`,
      ...detail,
      netSalary: 0,
    };
    acc.setData(prev => {
      const d = normalizeTechnicalPayrollData(prev);
      return { employees: [...d.employees, emp] };
    });
    setOpenIds(prev => new Set(prev).add(id));
  };

  const removeEmployee = (id: string) => {
    acc.setData(prev => {
      const d = normalizeTechnicalPayrollData(prev);
      return { employees: d.employees.filter(e => e.id !== id) };
    });
  };

  const toggle = (id: string) => {
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalNet = data.employees.reduce(
    (s, e) => s + computeSalary(e).totalSalary,
    0,
  );

  return (
    <AccountsPageShell
      title="Technical Team Payroll"
      subtitle="OT (weekday 1.5× / weekend 2×) · Late 7:00–16:00 · Leaves · Loan · PF 8% · Tax — formulas computed on backend save"
      {...accountsShellProps(acc)}
    >
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-[#EFF8FF] to-white p-4">
          <p className="text-[10px] font-bold uppercase text-blue-700 opacity-80">Headcount</p>
          <p className="text-xl font-extrabold text-blue-800 mt-1">{data.employees.length}</p>
        </div>
        <div className="rounded-2xl border border-[#1B6FE8]/20 bg-gradient-to-br from-[#EAF2FE] to-white p-4">
          <p className="text-[10px] font-bold uppercase text-[#1B6FE8] opacity-80">Total Net (computed)</p>
          <p className="text-xl font-extrabold text-[#1B6FE8] mt-1 tabular-nums">{currency(totalNet)}</p>
        </div>
        <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-[#F0FDFA] to-white p-4 col-span-2 lg:col-span-1 flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase text-teal-700 opacity-80">Shift</p>
            <p className="text-sm font-extrabold text-teal-900 mt-1">07:00 – 16:00</p>
          </div>
          <button
            type="button"
            onClick={addEmployee}
            className="h-9 px-3 rounded-xl bg-[#0B84F3] text-white text-xs font-bold inline-flex items-center gap-1"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {data.employees.map((emp, i) => {
          const open = openIds.has(emp.id);
          const net = computeSalary(emp).totalSalary;
          return (
            <article key={emp.id} className="rounded-2xl border border-crm-border-subtle bg-crm-surface shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-3 sm:px-4 py-3 hover:bg-[#FAFAFA]">
                <button type="button" onClick={() => toggle(emp.id)} className="text-crm-text-muted p-1">
                  {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <div className="w-9 h-9 rounded-xl bg-[#EFF8FF] text-[#0B84F3] flex items-center justify-center shrink-0 font-extrabold text-[10px]">
                  {emp.code.replace(/^TECH-?/i, "") || i + 1}
                </div>
                <input
                  value={emp.name}
                  onChange={e => updateEmployee(emp.id, { ...emp, name: e.target.value })}
                  className="flex-1 min-w-0 h-9 rounded-lg border border-transparent hover:border-crm-border focus:border-[#1B6FE8] px-2 text-sm font-extrabold text-crm-text outline-none"
                />
                <span className="text-sm font-extrabold tabular-nums text-[#1B6FE8] whitespace-nowrap">{currency(net)}</span>
                <button
                  type="button"
                  onClick={() => removeEmployee(emp.id)}
                  className="w-8 h-8 rounded-lg text-red-500 hover:bg-red-50 inline-flex items-center justify-center"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {open && (
                <div className="px-3 sm:px-4 pb-4 border-t border-crm-border-subtle">
                  <EmployeeSalaryEditor
                    name={emp.name}
                    teamHint="Technical Team · formulas saved via /accounts/technical_payroll"
                    value={emp}
                    onChange={next => updateEmployee(emp.id, { ...emp, ...next })}
                  />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </AccountsPageShell>
  );
}
