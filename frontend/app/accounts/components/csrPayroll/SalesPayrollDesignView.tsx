"use client";

import { useState } from "react";
import { Users, UserCog, Calendar, Save, Upload, Info, Ban } from "lucide-react";
import SalesPayrollEmployeePanel from "./SalesPayrollEmployeePanel";
import { MOCK_SALES_TEAM, MOCK_SALES_TEAM_LEADS } from "./mockData";
import { fmt } from "./uiHelpers";
import { STAFF_PAGE_PAD } from "@/lib/staffPageLayout";

type Tab = "sales" | "team_lead";

function previewNet(employees: typeof MOCK_SALES_TEAM) {
  return employees.reduce((s, e) => {
    const comm =
      e.oldClientProjects * 1000 +
      e.newClientProjects * 3000 +
      e.fixClientProjects.reduce((x, p) => x + p.projectPay * 0.025, 0);
    const earning = e.basicSalary + e.allowance + comm;
    const ded = e.lateDeduction + e.unpaidLeaveDeduction + e.loanThisMonth + e.basicSalary * 0.08 + e.incomeTax;
    const tl = e.assignedReps?.filter(a => a.assigned).reduce((x, a) => x + a.tlCommission, 0) ?? 0;
    return s + earning - ded + tl;
  }, 0);
}

export default function SalesPayrollDesignView() {
  const [tab, setTab] = useState<Tab>("sales");
  const employees = tab === "sales" ? MOCK_SALES_TEAM : MOCK_SALES_TEAM_LEADS;
  const totalNet = previewNet(employees);

  return (
    <div className={STAFF_PAGE_PAD}>
      <header className="relative overflow-hidden rounded-[1.5rem] sm:rounded-[1.75rem] border border-gray-100/90 dark:border-crm-border bg-crm-surface shadow-[0_10px_40px_-24px_rgba(15,23,42,0.35)]">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-[#12B76A] via-[#0B84F3] to-[#7C3AED]" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 px-5 sm:px-6 py-5">
          <div className="min-w-0 pl-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#12B76A]/90 mb-1">Accounts · Payroll Design</p>
            <h1 className="text-xl sm:text-2xl md:text-[28px] font-extrabold text-crm-text tracking-tight">Sales Team Payroll</h1>
            <p className="text-xs sm:text-sm text-crm-text-muted mt-1.5 max-w-2xl leading-relaxed">
              Sales team = project commission only (no overtime). Basic + allowance + commission = total earning.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-2 lg:pl-0">
            <button type="button" className="h-10 px-4 rounded-xl bg-[#F3EEFF] text-[#7C3AED] text-sm font-semibold inline-flex items-center gap-2 opacity-60 cursor-not-allowed">
              <Upload size={16} /> Upload File
            </button>
            <button type="button" className="h-10 px-4 rounded-xl bg-[#1B6FE8] text-white text-sm font-semibold inline-flex items-center gap-2 opacity-60 cursor-not-allowed shadow-md shadow-[#1B6FE8]/20">
              <Save size={16} /> Save
            </button>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-crm-border-subtle bg-crm-surface shadow-sm p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <label className="text-xs font-semibold text-crm-text-secondary">
            <span className="inline-flex items-center gap-1 mb-1"><Calendar size={12} /> Payroll Month</span>
            <input type="month" defaultValue="2026-07" className="mt-1 h-10 w-full sm:w-48 rounded-xl border border-crm-border px-3 text-sm outline-none focus:ring-2 focus:ring-[#1B6FE8]/20" />
          </label>

          <div className="inline-flex p-1 rounded-2xl bg-[#F4F5F8] border border-crm-border-subtle">
            <button
              type="button"
              onClick={() => setTab("sales")}
              className={`h-10 px-4 sm:px-5 rounded-xl text-sm font-bold inline-flex items-center gap-2 transition-all ${
                tab === "sales" ? "bg-[#12B76A] text-white shadow-md shadow-[#12B76A]/25" : "text-crm-text-secondary hover:bg-crm-surface-raised"
              }`}
            >
              <Users size={16} /> Sales Team
            </button>
            <button
              type="button"
              onClick={() => setTab("team_lead")}
              className={`h-10 px-4 sm:px-5 rounded-xl text-sm font-bold inline-flex items-center gap-2 transition-all ${
                tab === "team_lead" ? "bg-[#7C3AED] text-white shadow-md shadow-[#7C3AED]/25" : "text-crm-text-secondary hover:bg-crm-surface-raised"
              }`}
            >
              <UserCog size={16} /> Sales Team Lead
            </button>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-emerald-50/70 border border-emerald-100 px-3 py-2.5 text-[11px] text-emerald-900 leading-relaxed">
          <Info size={14} className="shrink-0 mt-0.5" />
          <p>
            {tab === "sales" ? (
              <>
                <strong>Sales Team:</strong> No overtime. Old client $1,000/project (partial pay = 50%) · New client $3,000/project ·
                Fix client 2.5% of project pay · Assign to Lead → TL gets $1,000/project (fix client: 0.5% for TL).
              </>
            ) : (
              <>
                <strong>Sales Team Lead:</strong> Own project commission (New × $3,000 + Old + Fix 2.5%) plus assigned sales reps
                ($1,000 × their monthly projects; fix client 0.5% for TL). No overtime.
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-crm-surface-muted border border-crm-border px-3 py-2 text-[11px] text-crm-text-secondary">
          <Ban size={14} className="text-crm-text-faint shrink-0" />
          <span><strong>Overtime not applicable</strong> for Sales Team — variable pay is project commission only.</span>
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Employees", value: String(employees.length), cls: "from-[#ECFDF3] to-white border-emerald-200 text-emerald-700" },
          { label: "Total Net (preview)", value: fmt(totalNet), cls: "from-[#EAF5FF] to-white border-[#0B84F3]/20 text-[#0B84F3]" },
          { label: "New Client Commission", value: "$3,000 / project", cls: "from-[#F3EEFF] to-white border-violet-200 text-violet-700" },
          { label: tab === "sales" ? "Old Client Commission" : "TL Assign Rate", value: tab === "sales" ? "$1,000 / project" : "$1,000 / rep project", cls: "from-[#EAF2FE] to-white border-[#1B6FE8]/20 text-[#1B6FE8]" },
        ].map(c => (
          <div key={c.label} className={`rounded-2xl border bg-gradient-to-br p-4 ${c.cls}`}>
            <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{c.label}</p>
            <p className="text-lg sm:text-xl font-extrabold mt-1 tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-extrabold text-crm-text">
            {tab === "sales" ? "Sales Team Members" : "Sales Team Leads"}
          </h2>
          <button type="button" className="h-9 px-3 rounded-xl bg-[#ECFDF3] text-[#12B76A] text-xs font-bold opacity-60 cursor-not-allowed">
            + Add Employee
          </button>
        </div>

        {employees.map((emp, i) => (
          <SalesPayrollEmployeePanel
            key={emp.id}
            employee={emp}
            variant={tab}
            defaultOpen={i === 0}
          />
        ))}
      </div>
    </div>
  );
}
