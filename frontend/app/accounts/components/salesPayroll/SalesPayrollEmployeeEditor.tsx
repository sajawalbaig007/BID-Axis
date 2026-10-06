"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { currency } from "../../types";
import {
  calcSalesCommission,
  calcTlAssignedCommission,
  computeSalesEmployeePayroll,
  inferSlabKey,
  newFixClientProject,
  PROJECT_SLABS,
  projectAmountPkr,
  projectCommissionPkr,
  projectSlabRateFromKey,
  formatSlabPct,
  usesProjectSlabRules,
  type ProjectSlabKey,
  type SalesPayrollCalcOpts,
  type SalesPayrollEmployee,
  type SalesPayrollData,
  type ProjectCurrency,
} from "../../utils/salesPayrollFormula";
import { HAMMAD_TEAM_LEAD_ID } from "../../utils/salesPayrollDefaults";
import { isRepAssignedToLead } from "../../utils/salesPayrollBridge";
import { fetchAndApplyPendingLoan } from "../../utils/loanLedgerApply";
import AmountInput from "../AmountInput";

type Props = {
  employee: SalesPayrollEmployee;
  variant: "sales" | "team_lead";
  allData: SalesPayrollData;
  onChange: (next: SalesPayrollEmployee) => void;
  onAssignToLead?: () => void;
  defaultOpen?: boolean;
  /** Inside Income Statement modal — skip outer collapse, show fields directly */
  embedded?: boolean;
  calcOpts?: SalesPayrollCalcOpts;
};

function Num({
  label,
  value,
  onChange,
  hint,
  className,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
  step?: string;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 text-[10px] font-bold uppercase tracking-wide text-crm-text-muted ${className ?? ""}`}>
      {label}
      <AmountInput
        value={Number.isFinite(value) ? value : 0}
        onChange={onChange}
        className="mt-1 h-9 w-full min-w-0 rounded-lg border border-crm-border bg-crm-surface px-2 text-sm tabular-nums outline-none focus:border-[#1B6FE8]"
      />
      {hint && <span className="block mt-0.5 text-[9px] font-normal normal-case text-crm-text-faint">{hint}</span>}
    </label>
  );
}

function Read({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-crm-border-subtle bg-[#F8FAFC] px-2.5 py-2 min-w-0">
      <p className="text-[9px] font-bold uppercase tracking-wide text-crm-text-faint leading-snug break-words">{label}</p>
      <p className={`mt-0.5 text-sm font-bold tabular-nums ${accent ?? "text-crm-text"}`}>{value}</p>
    </div>
  );
}

export default function SalesPayrollEmployeeEditor({
  employee,
  variant,
  allData,
  onChange,
  defaultOpen = false,
  embedded = false,
  calcOpts,
}: Props) {
  const [open, setOpen] = useState(defaultOpen || embedded);
  const isSales = variant === "sales";
  const slab = usesProjectSlabRules(calcOpts?.recordDate);
  const employeeRef = useRef(employee);
  employeeRef.current = employee;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const assignedTlTotal =
    variant === "team_lead"
      ? allData.salesTeamMembers
          .filter(m => isRepAssignedToLead(m, employee.id))
          .reduce((s, m) => s + calcTlAssignedCommission(m, calcOpts), 0)
      : 0;

  const breakdown = computeSalesEmployeePayroll(employee, assignedTlTotal, calcOpts);
  const comm = calcSalesCommission(employee.commission, employee.role, calcOpts);

  const set = useCallback(
    <K extends keyof SalesPayrollEmployee>(key: K, val: SalesPayrollEmployee[K]) => {
      onChange({ ...employee, [key]: val });
    },
    [employee, onChange],
  );

  const setComm = useCallback(
    (patch: Partial<SalesPayrollEmployee["commission"]>) => {
      onChange({ ...employee, commission: { ...employee.commission, ...patch } });
    },
    [employee, onChange],
  );

  useEffect(() => {
    if (!slab) return;
    const current = employeeRef.current;
    if ((current.commission.fixClientProjects ?? []).length > 0) return;
    onChangeRef.current({
      ...current,
      commission: {
        ...current.commission,
        fixClientProjects: [
          newFixClientProject({
            currency: "USD",
            fxRate: Number(calcOpts?.usdToPkr) || 0,
            slabKey: "0-1000",
            projectCount: 0,
          }),
        ],
      },
    });
  }, [slab, calcOpts?.usdToPkr, calcOpts?.recordDate]);

  const toggleAssignToLead = useCallback(() => {
    const nextAssigned = !employee.assignedToLead;
    onChange({
      ...employee,
      assignedToLead: nextAssigned,
      assignedTeamLeadId: nextAssigned ? HAMMAD_TEAM_LEAD_ID : null,
    });
  }, [employee, onChange]);

  const lookupLoan = useCallback(async (force = false) => {
    const current = employeeRef.current;
    const patch = await fetchAndApplyPendingLoan(
      current.name,
      {
        loanTotal: Number(current.loanTotal) || 0,
        loanPaid: Number(current.loanPaid) || 0,
        loanThisMonth: Number(current.loanThisMonth) || 0,
      },
      { force, department: variant === "team_lead" ? "sales_team_lead" : "sales_team" },
    );
    if (!patch) return;
    // Merge onto latest employee so occasional / other edits aren't wiped mid-request
    onChangeRef.current({ ...employeeRef.current, ...patch });
  }, [variant]);

  const assignedReps = allData.salesTeamMembers.filter(m =>
    isRepAssignedToLead(m, employee.id),
  );

  return (
    <article className={`rounded-2xl border border-crm-border-subtle bg-crm-surface shadow-sm ${embedded ? "border-0 shadow-none rounded-none overflow-visible" : "overflow-visible"}`}>
      {!embedded && (
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left hover:bg-[#FAFAFA] transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-[#ECFDF3] text-[#12B76A] flex items-center justify-center shrink-0 font-extrabold text-xs">
          {employee.code.split("-").pop()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-crm-text truncate">{employee.name}</p>
          <p className="text-[11px] text-crm-text-muted">
            {employee.code} · {comm.totalProjects} projects · Commission {currency(comm.totalCommission)}
          </p>
        </div>
        <div className="text-right shrink-0 hidden sm:block">
          <p className="text-[10px] font-bold uppercase text-crm-text-faint">Net Salary</p>
          <p className="text-base font-extrabold text-[#1B6FE8] tabular-nums">{currency(breakdown.netSalary)}</p>
        </div>
      </button>
      )}

      {(embedded || open) && (
        <div className="px-3 sm:px-5 pb-5 space-y-4 border-t border-crm-border-subtle pt-4">
          {/* Project Commission */}
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 space-y-3">
            <p className="text-[11px] font-extrabold uppercase text-emerald-800">Project Commission</p>
            <p className="text-[10px] text-emerald-900/80">
              {slab
                ? "Pick a range, enter projects + total amount. Selected range % × 0.89 × FX applies even if amount is outside the band. Each range’s total amount (× FX) rolls into Final total."
                : isSales
                  ? "Old $1,000/project (partial 50%) · New $3,000 · Fix 2.5% · No overtime"
                  : "New $3,000/project · Fix 2.5% · Old projects count in total · No overtime"}
            </p>
            {slab && (
              <p className="text-[10px] text-emerald-800">
                {calcOpts?.usdToPkr ? `Live USD ${calcOpts.usdToPkr}` : "Live USD —"}
                {calcOpts?.cadToPkr ? ` · CAD ${calcOpts.cadToPkr}` : ""}
              </p>
            )}
            {!slab && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {isSales && (
                <>
                  <Num label="Old Client Projects" value={employee.commission.oldClientProjects} onChange={v => setComm({ oldClientProjects: v })} />
                  <Num label="Partial Pay Count" value={employee.commission.oldClientPartialCount} onChange={v => setComm({ oldClientPartialCount: v })} hint="0.5× $1,000" />
                  <Read label="Old Commission" value={currency(comm.oldComm)} accent="text-emerald-800" />
                </>
              )}
              {!isSales && (
                <Num label="Old Client Projects" value={employee.commission.oldClientProjects} onChange={v => setComm({ oldClientProjects: v })} />
              )}
              <Num label="New Client Projects" value={employee.commission.newClientProjects} onChange={v => setComm({ newClientProjects: v })} />
              <Read label="New Commission" value={currency(comm.newComm)} accent="text-emerald-800" />
              <Read
                label="Fix Commission (2.5%)"
                value={currency(comm.fixComm)}
                accent="text-emerald-800"
              />
              <Read label="Total Projects" value={String(comm.totalProjects)} />
              <Read label="Total Commission" value={currency(comm.totalCommission)} accent="text-emerald-900" />
            </div>
            )}
            {employee.commission.fixClientProjects.map(p => {
              const cur: ProjectCurrency = p.currency === "CAD" ? "CAD" : "USD";
              const liveFx = cur === "CAD" ? Number(calcOpts?.cadToPkr) || 0 : Number(calcOpts?.usdToPkr) || 0;
              const fx = Number(p.fxRate) > 0 ? Number(p.fxRate) : liveFx;
              const patch = (next: Partial<typeof p>) =>
                setComm({
                  fixClientProjects: employee.commission.fixClientProjects.map(x =>
                    x.id === p.id ? { ...x, ...next } : x,
                  ),
                });
              if (slab) {
                const slabKey = (p.slabKey && PROJECT_SLABS.some(s => s.key === p.slabKey) ? p.slabKey : inferSlabKey(p.projectPay)) as ProjectSlabKey;
                const pctLabel = formatSlabPct(projectSlabRateFromKey(slabKey, p.projectPay));
                const rowWithKey = { ...p, slabKey };
                const rowComm = projectCommissionPkr(rowWithKey, calcOpts);
                const rowPkr = projectAmountPkr(rowWithKey, calcOpts);
                return (
                  <div key={p.id} className="rounded-lg border border-emerald-100 bg-white/70 p-2 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
                      <label className="block min-w-0 text-[10px] font-bold uppercase text-crm-text-muted sm:col-span-2">
                        Commission range
                        <select
                          value={slabKey}
                          onChange={e => patch({ slabKey: e.target.value as ProjectSlabKey })}
                          title={`${PROJECT_SLABS.find(s => s.key === slabKey)?.label ?? ""} · ${pctLabel}%`}
                          className="mt-1 h-9 w-full min-w-0 max-w-full rounded-lg border border-crm-border pl-2 pr-8 text-xs bg-crm-surface"
                        >
                          {PROJECT_SLABS.map(s => (
                            <option key={s.key} value={s.key}>
                              {s.label} · {formatSlabPct(s.rate)}%
                            </option>
                          ))}
                        </select>
                      </label>
                      <Num
                        label="No. of projects"
                        value={p.projectCount ?? 0}
                        onChange={v => patch({ projectCount: v, slabKey: p.slabKey ?? inferSlabKey(p.projectPay) })}
                      />
                      <Num
                        label={`Total amount (${cur})`}
                        value={p.projectPay}
                        onChange={v => patch({ projectPay: v, slabKey: p.slabKey ?? inferSlabKey(p.projectPay) })}
                      />
                      <label className="block min-w-0 text-[10px] font-bold uppercase text-crm-text-muted">
                        Currency
                        <select
                          value={cur}
                          onChange={e => {
                            const nextCur = e.target.value === "CAD" ? "CAD" : "USD";
                            const nextFx = nextCur === "CAD" ? Number(calcOpts?.cadToPkr) || 0 : Number(calcOpts?.usdToPkr) || 0;
                            patch({ currency: nextCur, fxRate: nextFx });
                          }}
                          className="mt-1 h-9 w-full min-w-0 rounded-lg border border-crm-border px-2 text-sm bg-crm-surface"
                        >
                          <option value="USD">USD</option>
                          <option value="CAD">CAD</option>
                        </select>
                      </label>
                      <label className="block min-w-0 text-[10px] font-bold uppercase tracking-wide text-crm-text-muted">
                        {cur} → PKR
                        <AmountInput
                          value={Number.isFinite(fx) ? fx : 0}
                          onChange={v => patch({ fxRate: v })}
                          className="mt-1 h-9 w-full min-w-0 rounded-lg border border-crm-border bg-crm-surface px-2 text-sm tabular-nums outline-none focus:border-[#1B6FE8]"
                        />
                        {liveFx > 0 && (
                          <span className="block mt-0.5 text-[9px] font-normal normal-case text-crm-text-faint">
                            Live {liveFx.toFixed(4)}
                          </span>
                        )}
                      </label>
                      <div className="sm:col-span-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setComm({
                            fixClientProjects: employee.commission.fixClientProjects.filter(x => x.id !== p.id),
                          })}
                          className="h-9 px-3 rounded-lg border border-red-100 text-red-500 text-xs font-semibold hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Read label="This range PKR (amount × FX)" value={currency(rowPkr)} accent="text-emerald-800" />
                      <Read label={`${pctLabel}% × 0.89 × FX`} value={currency(rowComm)} accent="text-emerald-800" />
                    </div>
                  </div>
                );
              }
              const rowComm = p.projectPay * 0.025;
              return (
              <div key={p.id} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 items-end">
                <label className="block text-[10px] font-bold uppercase text-crm-text-muted">
                  Client
                  <input
                    value={p.clientName}
                    onChange={e => patch({ clientName: e.target.value })}
                    className="mt-1 h-9 w-full rounded-lg border border-crm-border px-2 text-sm"
                  />
                </label>
                <Num
                  label="Project Pay ($)"
                  value={p.projectPay}
                  onChange={v => patch({ projectPay: v })}
                />
                <Read label="Commission 2.5%" value={currency(rowComm)} accent="text-emerald-800" />
                <button
                  type="button"
                  onClick={() => setComm({
                    fixClientProjects: employee.commission.fixClientProjects.filter(x => x.id !== p.id),
                  })}
                  className="h-9 rounded-lg border border-red-100 text-red-500 text-xs font-semibold hover:bg-red-50"
                >
                  Remove
                </button>
              </div>
              );
            })}
            <button
              type="button"
              onClick={() => setComm({
                fixClientProjects: [
                  ...employee.commission.fixClientProjects,
                  newFixClientProject({
                    currency: "USD",
                    fxRate: Number(calcOpts?.usdToPkr) || 0,
                    slabKey: "0-1000",
                    projectCount: 0,
                  }),
                ],
              })}
              className="h-8 px-3 rounded-lg border border-dashed border-emerald-300 text-emerald-700 text-[11px] font-bold"
            >
              {slab ? "+ Add commission range" : "+ Add Fix Client Project"}
            </button>

            {isSales && !slab && (
              <button
                type="button"
                onClick={toggleAssignToLead}
                className={`h-9 px-4 rounded-xl text-xs font-bold inline-flex items-center gap-2 ${
                  employee.assignedToLead
                    ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
              >
                {employee.assignedToLead ? "Assigned to Hammad (Team Lead)" : "Assign to Lead"}
              </button>
            )}
            {isSales && slab && (
              <div className={`rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center gap-3 ${
                employee.assignedToLead ? "border-indigo-200 bg-indigo-50/60" : "border-indigo-100 bg-white"
              }`}>
                <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Read label="Total projects" value={String(comm.totalProjects)} />
                  <Read label="Your commission" value={currency(comm.totalCommission)} accent="text-emerald-900" />
                  <Read label="Final total (PKR)" value={currency(comm.finalTotalPkr ?? 0)} accent="text-emerald-800" />
                  <Read
                    label="Lead share (0.5% × 0.89)"
                    value={currency(comm.leadShare ?? 0)}
                    accent="text-indigo-800"
                  />
                </div>
                <button
                  type="button"
                  onClick={toggleAssignToLead}
                  className={`h-10 px-4 rounded-xl text-xs font-bold shrink-0 ${
                    employee.assignedToLead
                      ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                      : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                >
                  {employee.assignedToLead
                    ? `Assigned to lead · ${currency(comm.leadShare ?? 0)}`
                    : `Assign to Lead · 0.5% = ${currency(comm.leadShare ?? 0)}`}
                </button>
              </div>
            )}
          </div>

          {variant === "team_lead" && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
              <p className="text-[11px] font-extrabold uppercase text-indigo-800">Assigned Sales Reps — TL Commission</p>
              <p className="text-[10px] text-indigo-700">
                {slab
                  ? "Each assigned rep: 0.5% × 0.89 of their final total (all range amounts × FX)"
                  : "$1,000 × projects · Fix client 0.5% for TL"}
              </p>
              {assignedReps.length === 0 ? (
                <p className="text-xs text-crm-text-muted">No sales reps assigned yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase text-indigo-700">
                        <th className="text-left py-1 pr-2">Rep</th>
                        <th className="text-left py-1 pr-2">{slab ? "Final total" : "Projects"}</th>
                        <th className="text-left py-1">TL Commission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignedReps.map(r => {
                        const rc = calcSalesCommission(r.commission, "sales", calcOpts);
                        return (
                        <tr key={r.id} className="border-t border-indigo-100">
                          <td className="py-2 pr-2 font-semibold">{r.name}</td>
                          <td className="py-2 pr-2">{slab ? currency(rc.finalTotalPkr ?? 0) : rc.totalProjects}</td>
                          <td className="py-2 font-bold text-indigo-800">{currency(calcTlAssignedCommission(r, calcOpts))}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-indigo-200">
                        <td colSpan={2} className="py-2 text-right font-bold pr-2">Total</td>
                        <td className="py-2 font-extrabold text-indigo-900">{currency(assignedTlTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Salary */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 space-y-2">
            <p className="text-[11px] font-extrabold uppercase text-blue-800">Total Earning</p>
            <p className="text-[10px] text-blue-700">
              Basic + Misc + Home + Fuel + Med Allowance + Own Commission
              {variant === "team_lead" ? " + Assigned TL Commission" : ""} = Total Earning
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Num label="Basic Salary" value={employee.basic} onChange={v => set("basic", v)} />
              <Num label="Misc Allowance" value={employee.allowance} onChange={v => set("allowance", v)} />
              <Num label="Home Allowance" value={employee.homeAllowance ?? 0} onChange={v => set("homeAllowance", v)} />
              <Num label="Fuel Allowance" value={employee.fuelAllowance ?? 0} onChange={v => set("fuelAllowance", v)} />
              <Num label="Med Allowance" value={employee.medicalAllowance ?? 0} onChange={v => set("medicalAllowance", v)} />
              <Read label="Own Commission" value={currency(comm.totalCommission)} accent="text-emerald-700" />
              {variant === "team_lead" && (
                <Read label="Assigned TL Commission" value={currency(assignedTlTotal)} accent="text-indigo-800" />
              )}
              <Read label="Total Earning" value={currency(breakdown.totalEarning)} accent="text-blue-800" />
              <Read label="1 Day Salary (/30)" value={currency(breakdown.daySalary)} />
            </div>
          </div>

          {/* Late */}
          <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 space-y-2">
            <p className="text-[11px] font-extrabold uppercase text-amber-900">Late Arrival (6 PM EST)</p>
            <div className="text-[10px] text-amber-800 space-y-0.5">
              <p>≤18:15 none · 18:15–18:30 ⅕ day · 18:30–19:00 ¼ · 19:00–20:00 ⅓ · 20:00+ half</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <label className="block text-[10px] font-bold uppercase text-crm-text-muted">
                Check In
                <input
                  type="time"
                  value={employee.checkIn}
                  onChange={e => set("checkIn", e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-crm-border px-2 text-sm"
                />
              </label>
              <Read label="Day Salary (/30)" value={currency(breakdown.daySalary)} />
              <Read label="Late Deduction" value={currency(breakdown.lateDeduction)} accent="text-amber-800" />
              <Num
                label="Late Override"
                value={employee.lateDeductionOverride ?? 0}
                onChange={v => set("lateDeductionOverride", v > 0 ? v : null)}
                hint="0 = auto"
              />
            </div>
            <p className="text-[10px] text-amber-700">{breakdown.lateRuleApplied}</p>
          </div>

          {/* Leaves */}
          <div className="rounded-xl border border-violet-100 bg-violet-50/30 p-3 space-y-2">
            <p className="text-[11px] font-extrabold uppercase text-violet-800">Leaves</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Num label="Paid Leave Days" value={employee.paidLeaveDays} onChange={v => set("paidLeaveDays", v)} hint="No cut" />
              <Num label="Unpaid Leave Days" value={employee.unpaidLeaveDays} onChange={v => set("unpaidLeaveDays", v)} />
              <Read label="Unpaid Deduction" value={currency(breakdown.unpaidLeaveDeduction)} accent="text-violet-800" />
            </div>
          </div>

          {/* Loan */}
          <div className="rounded-xl border border-orange-100 bg-orange-50/30 p-3 space-y-2">
            <p className="text-[11px] font-extrabold uppercase text-orange-800">Loan</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Read label="Employee" value={employee.name} />
              <Num label="Total Loan" value={employee.loanTotal} onChange={v => set("loanTotal", v)} />
              <Num label="Already Paid" value={employee.loanPaid} onChange={v => set("loanPaid", v)} />
              <Read label="Remaining" value={currency(breakdown.loanRemaining)} accent="text-orange-800" />
              <Num label="This Month Amount" value={employee.loanThisMonth} onChange={v => set("loanThisMonth", v)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => set("loanPaymentMode", "salary")}
                className={`h-8 px-3 rounded-lg text-[11px] font-bold border ${
                  (employee.loanPaymentMode ?? "salary") === "salary"
                    ? "bg-[#1B6FE8] text-white border-[#1B6FE8]"
                    : "bg-crm-surface text-crm-text-secondary border-crm-border"
                }`}
              >
                Deduct from salary
              </button>
              <button
                type="button"
                onClick={() => set("loanPaymentMode", "cash")}
                className={`h-8 px-3 rounded-lg text-[11px] font-bold border ${
                  employee.loanPaymentMode === "cash"
                    ? "bg-amber-600 text-white border-amber-600"
                    : "bg-crm-surface text-crm-text-secondary border-crm-border"
                }`}
              >
                Paid separately in cash
              </button>
            </div>
            {(employee.loanPaymentMode ?? "salary") === "salary" && (Number(employee.loanThisMonth) || 0) > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                <Read label="Net before loan" value={currency(breakdown.netBeforeLoan)} />
                <Read label="Net after loan deduction" value={currency(breakdown.netSalary)} accent="text-[#1B6FE8]" />
              </div>
            ) : employee.loanPaymentMode === "cash" && (Number(employee.loanThisMonth) || 0) > 0 ? (
              <p className="text-[10px] font-semibold text-amber-800">
                Cash clearance — loan is not deducted from net salary.
              </p>
            ) : null}
            <button type="button" onClick={() => void lookupLoan(true)} className="text-[10px] font-bold text-[#0B84F3] hover:underline">
              Refresh loan from ledger
            </button>
          </div>

          {/* PF & Tax */}
          <div className="rounded-xl border border-teal-100 bg-teal-50/30 p-3 space-y-2">
            <p className="text-[11px] font-extrabold uppercase text-teal-800">PF & Tax</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
              <label className="flex items-center gap-2 text-xs font-semibold text-crm-text-secondary h-9 rounded-lg border border-teal-200 bg-white px-2 cursor-pointer col-span-2 sm:col-span-1">
                <input
                  type="checkbox"
                  checked={employee.pfAuto !== false}
                  onChange={e => set("pfAuto", e.target.checked)}
                  className="rounded border-crm-border accent-teal-600"
                />
                Apply PF (8%)
              </label>
              {employee.pfAuto === false ? (
                <Num
                  label="PF Manual"
                  value={employee.pfOverride ?? 0}
                  onChange={v => set("pfOverride", v)}
                />
              ) : (
                <Read label="PF (8% basic)" value={currency(breakdown.pf)} accent="text-teal-800" />
              )}
              <Num label="Income Tax (manual)" value={employee.incomeTax} onChange={v => set("incomeTax", v)} />
            </div>
            {employee.pfAuto === false ? (
              <Read label="PF Deduction" value={currency(breakdown.pf)} accent="text-teal-800" />
            ) : null}
          </div>

          {/* Occasional */}
          <div className="rounded-xl border border-sky-100 bg-sky-50/30 p-3 space-y-2">
            <p className="text-[11px] font-extrabold uppercase text-sky-800">Occasional Amount</p>
            <p className="text-[10px] text-sky-700/80">
              Rule: if filled, amount is added to Net Salary only. No PF, tax, late, unpaid, or loan cut on this amount.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Num
                label="Occasional Amount"
                value={employee.occasionalAmount ?? 0}
                onChange={v => set("occasionalAmount", v)}
                hint="Plus into net"
              />
              <label className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-muted">
                Occasion / Remark
                <input
                  type="text"
                  value={employee.occasionalRemark ?? ""}
                  onChange={e => set("occasionalRemark", e.target.value)}
                  placeholder="e.g. Eid bonus, wedding gift…"
                  className="mt-1 h-9 w-full rounded-lg border border-crm-border bg-crm-surface px-2 text-sm outline-none focus:border-[#1B6FE8]"
                />
              </label>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-xl border border-[#F3D7DC] bg-gradient-to-br from-[#FFF6F8] to-white p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Read label="Total Earning" value={currency(breakdown.totalEarning)} accent="text-emerald-700" />
              <Read label="Total Deduction" value={currency(breakdown.totalDeduction)} accent="text-red-600" />
            </div>
            <Read label="Occasional" value={currency(breakdown.occasionalAmount ?? 0)} accent="text-sky-700" />
            <Read label="Net Total Salary" value={currency(breakdown.netSalary)} accent="text-[#1B6FE8]" />
          </div>

          <label className="block text-[10px] font-bold uppercase text-crm-text-muted">
            Remarks
            <textarea
              value={employee.remarks}
              onChange={e => set("remarks", e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-crm-border px-2 py-1.5 text-sm resize-none focus:border-[#1B6FE8]"
            />
          </label>
        </div>
      )}
    </article>
  );
}

export function assignMemberToLead(
  data: SalesPayrollData,
  memberId: string,
  leadId: string = HAMMAD_TEAM_LEAD_ID,
): SalesPayrollData {
  return {
    ...data,
    salesTeamMembers: data.salesTeamMembers.map(m =>
      m.id === memberId
        ? { ...m, assignedToLead: true, assignedTeamLeadId: leadId }
        : m,
    ),
  };
}
