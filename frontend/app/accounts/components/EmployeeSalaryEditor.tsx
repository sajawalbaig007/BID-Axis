"use client";

import { useCallback, useRef } from "react";
import {
  computeAdminSalary,
  computeSalary,
  computeTechnicalManagerSalary,
  emptySalaryDetail,
  type EmployeeSalaryDetail,
} from "../utils/payrollFormula";
import { fetchAndApplyPendingLoan } from "../utils/loanLedgerApply";
import { departmentForPayrollKind } from "../utils/payrollLoanSync";
import { resolvePayrollKind } from "../utils/salesPayrollBridge";
import { currency } from "../types";
import AmountInput from "./AmountInput";

type Props = {
  name: string;
  value: EmployeeSalaryDetail;
  onChange: (next: EmployeeSalaryDetail) => void;
  teamHint?: string;
  /** Auto-lookup loan ledger by employee name */
  enableLoanLookup?: boolean;
  /**
   * technical → Technical Team (OT + 7 AM late).
   * technical_manager → same formula, late shift 9 AM.
   * admin → Administration (no OT, 6 PM late).
   */
  variant?: "technical" | "technical_manager" | "admin";
};

function Num({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: string;
  hint?: string;
}) {
  return (
    <label className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-muted">
      {label}
      <AmountInput
        value={Number.isFinite(value) ? value : 0}
        onChange={onChange}
        className="mt-1 h-9 w-full rounded-lg border border-crm-border bg-crm-surface px-2 text-sm tabular-nums outline-none focus:border-[#1B6FE8]"
      />
      {hint && <span className="block mt-0.5 text-[9px] font-normal normal-case tracking-normal text-crm-text-faint">{hint}</span>}
    </label>
  );
}

function Read({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-crm-border-subtle bg-[#F8FAFC] px-2.5 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wide text-crm-text-faint">{label}</p>
      <p className={`mt-0.5 text-sm font-bold tabular-nums ${accent ?? "text-crm-text"}`}>{value}</p>
    </div>
  );
}

export default function EmployeeSalaryEditor({
  name,
  value,
  onChange,
  teamHint,
  enableLoanLookup = true,
  variant = "technical",
}: Props) {
  const d = emptySalaryDetail(value);
  const dRef = useRef(d);
  dRef.current = d;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const isAdmin = variant === "admin";
  const isTechMgr = variant === "technical_manager";
  /** Technical Manager uses Technical Team formula with 9 AM late shift. */
  const isGpsTechnical = variant === "technical" || variant === "technical_manager";
  const b = isAdmin
    ? computeAdminSalary(d, name)
    : isTechMgr
      ? computeTechnicalManagerSalary(d, name)
      : computeSalary(d, { personName: name });

  const defaultCheckIn = isAdmin ? "18:00" : isTechMgr ? "09:00" : "07:00";
  const defaultCheckOut = isTechMgr ? "18:00" : "16:00";

  const set = <K extends keyof EmployeeSalaryDetail>(key: K, val: EmployeeSalaryDetail[K]) => {
    onChange(emptySalaryDetail({ ...d, [key]: val }));
  };

  const lookupLoan = useCallback(async (force = false) => {
    if (!enableLoanLookup || !name.trim()) return;
    const current = dRef.current;
    const patch = await fetchAndApplyPendingLoan(
      name,
      {
        loanTotal: Number(current.loanTotal) || 0,
        loanPaid: Number(current.loanPaid) || 0,
        loanThisMonth: Number(current.loanThisMonth) || 0,
      },
      {
        force,
        department: teamHint
          ? departmentForPayrollKind(resolvePayrollKind(teamHint))
          : variant === "admin"
            ? "administration"
            : variant === "technical_manager"
              ? "technical_manager"
              : "technical_team",
      },
    );
    if (!patch) return;
    // Merge onto latest salary so in-flight edits (e.g. occasional) are not wiped
    onChangeRef.current(emptySalaryDetail({ ...dRef.current, ...patch }));
  }, [enableLoanLookup, name, teamHint, variant]);

  return (
    <div className="space-y-3 rounded-xl border border-crm-border bg-crm-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-extrabold text-crm-text">{name || "Employee"}</p>
          {teamHint && <p className="text-[10px] text-crm-text-faint">{teamHint}</p>}
        </div>
        <p className="text-xs font-extrabold text-[#1B6FE8] tabular-nums">Net: {currency(b.totalSalary)}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Num label="Basic Salary" value={d.basic} onChange={v => set("basic", v)} />
        <Num label="Misc Allowance" value={d.allowance} onChange={v => set("allowance", v)} />
        <Num label="Home Allowance" value={d.homeAllowance ?? 0} onChange={v => set("homeAllowance", v)} />
        <Num label="Fuel Allowance" value={d.fuelAllowance ?? 0} onChange={v => set("fuelAllowance", v)} />
        <Num label="Med Allowance" value={d.medicalAllowance ?? 0} onChange={v => set("medicalAllowance", v)} />
        <Read label="Monthly (Basic+Allow)" value={currency(b.monthlySalary)} />
        <Read label="1 Day Salary (/30)" value={currency(b.daySalary)} />
        <Read label="1 Hour Salary (/8)" value={currency(b.hourSalary)} />
      </div>

      <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-2.5 space-y-2">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-sky-800">Occasional Amount</p>
        <p className="text-[10px] text-sky-700/80">
          Rule: if filled, amount is added to Net Salary only. No PF, tax, late, unpaid, or loan cut on this amount.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Num
            label="Occasional Amount"
            value={d.occasionalAmount ?? 0}
            onChange={v => set("occasionalAmount", v)}
            hint="Plus into net only"
          />
          <label className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-muted">
            Occasion / Remark
            <input
              type="text"
              value={d.occasionalRemark ?? ""}
              onChange={e => set("occasionalRemark", e.target.value)}
              placeholder="e.g. Eid bonus, wedding gift…"
              className="mt-1 h-9 w-full rounded-lg border border-crm-border bg-crm-surface px-2 text-sm outline-none focus:border-[#1B6FE8]"
            />
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-crm-border bg-crm-surface-muted p-2.5 space-y-2">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-crm-text-secondary">
          Salary slip profile ({isGpsTechnical ? "GPS · Global Pre Construction" : "BEM Solutions"})
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-muted">
            Employee ID
            <input
              value={d.employeeId || ""}
              onChange={e => set("employeeId", e.target.value)}
              placeholder="BEM-DEV-002"
              className="mt-1 h-9 w-full rounded-lg border border-crm-border bg-crm-surface px-2 text-sm outline-none focus:border-[#1B6FE8]"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-muted">
            Phone
            <input
              value={d.phone || ""}
              onChange={e => set("phone", e.target.value)}
              placeholder="03xx-xxxxxxx"
              className="mt-1 h-9 w-full rounded-lg border border-crm-border bg-crm-surface px-2 text-sm outline-none focus:border-[#1B6FE8]"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-muted">
            CNIC
            <input
              value={d.cnic || ""}
              onChange={e => set("cnic", e.target.value)}
              placeholder="xxxxx-xxxxxxx-x"
              className="mt-1 h-9 w-full rounded-lg border border-crm-border bg-crm-surface px-2 text-sm outline-none focus:border-[#1B6FE8]"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-muted col-span-2 sm:col-span-1">
            Address
            <input
              value={d.address || ""}
              onChange={e => set("address", e.target.value)}
              placeholder="City / area"
              className="mt-1 h-9 w-full rounded-lg border border-crm-border bg-crm-surface px-2 text-sm outline-none focus:border-[#1B6FE8]"
            />
          </label>
        </div>
      </div>

      {!isAdmin && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-2.5 space-y-2">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-blue-700">Overtime</p>
          <p className="text-[10px] text-blue-600/80">
            Hourly = (Basic + Allowances) ÷ 30 ÷ 8 · Weekday OT = hours × hourly × 1.5 · Weekend OT = hours × hourly × 2
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Num label="Weekday OT Hours" value={d.weekdayOtHours} onChange={v => set("weekdayOtHours", v)} step="0.25" />
            <Num label="Weekend OT Hours" value={d.weekendOtHours} onChange={v => set("weekendOtHours", v)} step="0.25" />
            <Read label="Weekday OT Pay" value={currency(b.weekdayOtPay)} accent="text-blue-700" />
            <Read label="Weekend OT Pay" value={currency(b.weekendOtPay)} accent="text-blue-700" />
            <Read label="Total Overtime" value={currency(b.totalOvertime)} accent="text-blue-800" />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-2.5 space-y-2">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-amber-800">
          {isAdmin
            ? "Late Arrival (Admin shift 6:00 PM)"
            : isTechMgr
              ? "Late Arrival (Tech Manager shift 9:00–18:00)"
              : "Late Arrival (Tech shift 7:00–16:00)"}
        </p>
        <p className="text-[10px] text-amber-700/80">
          {isAdmin
            ? "1-day salary = (Basic + Allowance) ÷ 30. Relief ≤18:15 · 18:15–18:30 = ⅕ day · 18:30–19:00 = ¼ day · 19:00–20:00 = ⅓ day · 20:00+ = half day."
            : isTechMgr
              ? "Relief ≤09:30 · 09:30–10:00 = ¼ day · 10:00–11:00 = ⅓ day · 11:00+ = half day. If worked ≥9h after late check-in → waived."
              : "Relief ≤07:30 · 07:30–08:00 = ¼ day · 08:00–09:00 = ⅓ day · 09:00+ = half day. If worked ≥9h after late check-in → waived."}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-muted">
            Check In
            <input
              type="time"
              value={d.checkIn || defaultCheckIn}
              onChange={e => set("checkIn", e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-crm-border bg-crm-surface px-2 text-sm outline-none"
            />
          </label>
          {!isAdmin && (
            <label className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-muted">
              Check Out
              <input
                type="time"
                value={d.checkOut || defaultCheckOut}
                onChange={e => set("checkOut", e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-crm-border bg-crm-surface px-2 text-sm outline-none"
              />
            </label>
          )}
          <Num
            label="Late Override (optional)"
            value={d.lateDeductionOverride ?? 0}
            onChange={v => set("lateDeductionOverride", v)}
            hint="0 = use time rules"
          />
          <Read label="Late Deduction" value={currency(b.lateDeduction)} accent="text-amber-800" />
          <Read label="Rule" value={b.lateRuleApplied} />
        </div>
      </div>

      <div className="rounded-xl border border-rose-100 bg-rose-50/30 p-2.5 space-y-2">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-rose-800">Leaves</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Num label="Paid Leave Days" value={d.paidLeaveDays} onChange={v => set("paidLeaveDays", v)} />
          <Num label="Unpaid Leave Days" value={d.unpaidLeaveDays} onChange={v => set("unpaidLeaveDays", v)} />
          <Read label="Unpaid Leave Deduction" value={currency(b.unpaidLeaveDeduction)} accent="text-rose-700" />
        </div>
      </div>

      <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-orange-800">Loan</p>
          {enableLoanLookup && (
            <button
              type="button"
              onClick={() => void lookupLoan(true)}
              className="text-[10px] font-bold text-[#0B84F3] hover:underline"
            >
              Refresh from ledger
            </button>
          )}
        </div>
        <p className="text-[10px] text-orange-700/80">
          Remaining = Total − Paid − This month. Only this employee’s figures — it does not copy onto other people.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Num label="Total Loan Amount" value={d.loanTotal} onChange={v => set("loanTotal", v)} />
          <Num label="Already Paid" value={d.loanPaid} onChange={v => set("loanPaid", v)} />
          <Read label="Remaining" value={currency(b.loanRemaining)} accent="text-orange-800" />
          <Num
            label="This Month Amount"
            value={d.loanThisMonth}
            onChange={v => set("loanThisMonth", v)}
            hint={d.loanPaymentMode === "cash" ? "Cash payment (not from salary)" : "Salary deduction"}
          />
        </div>
        <div className="flex flex-wrap gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => set("loanPaymentMode", "salary")}
            className={`h-8 px-3 rounded-lg text-[11px] font-bold border transition-colors ${
              (d.loanPaymentMode ?? "salary") === "salary"
                ? "bg-[#1B6FE8] text-white border-[#1B6FE8]"
                : "bg-crm-surface text-crm-text-secondary border-crm-border hover:bg-crm-surface-muted"
            }`}
          >
            Deduct from salary
          </button>
          <button
            type="button"
            onClick={() => set("loanPaymentMode", "cash")}
            className={`h-8 px-3 rounded-lg text-[11px] font-bold border transition-colors ${
              d.loanPaymentMode === "cash"
                ? "bg-amber-600 text-white border-amber-600"
                : "bg-crm-surface text-crm-text-secondary border-crm-border hover:bg-crm-surface-muted"
            }`}
          >
            Paid separately in cash
          </button>
        </div>
        {(d.loanPaymentMode ?? "salary") === "salary" && (Number(d.loanThisMonth) || 0) > 0 ? (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Read label="Net before loan" value={currency(b.netBeforeLoan)} accent="text-crm-text-secondary" />
            <Read label="Net after loan deduction" value={currency(b.totalSalary)} accent="text-[#1B6FE8]" />
          </div>
        ) : d.loanPaymentMode === "cash" && (Number(d.loanThisMonth) || 0) > 0 ? (
          <p className="text-[10px] font-semibold text-amber-800 bg-amber-50 rounded-lg px-2 py-1.5">
            Cash clearance — loan is not deducted from net salary. Ledger paid amount will update.
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-teal-100 bg-teal-50/30 p-2.5 space-y-2">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-teal-800">PF & Tax</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <label className="flex items-center gap-2 text-xs font-semibold text-crm-text-secondary h-9 col-span-2 sm:col-span-1 rounded-lg border border-teal-200 bg-white px-2 cursor-pointer">
            <input
              type="checkbox"
              checked={d.pfAuto !== false}
              onChange={e => set("pfAuto", e.target.checked)}
              className="rounded border-crm-border accent-teal-600"
            />
            Apply PF (8%)
          </label>
          {d.pfAuto === false ? (
            <Num label="PF Manual" value={d.pfOverride ?? 0} onChange={v => set("pfOverride", v)} />
          ) : (
            <Read label="PF auto" value="8% of basic" accent="text-teal-800" />
          )}
          <Read label="PF Deduction" value={currency(b.pf)} accent="text-teal-800" />
          <Num label="Tax Amount" value={d.incomeTax} onChange={v => set("incomeTax", v)} />
        </div>
      </div>

      <div className="rounded-xl border border-[#F3D7DC] bg-gradient-to-br from-[#FFF6F8] to-white p-2.5 space-y-2">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-[#1B6FE8]">Totals</p>
        <p className="text-[10px] text-crm-text-muted">
          Net Salary = (Total Earning − Total Deduction) + Occasional
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Read label="Total Earning" value={currency(b.totalEarning)} accent="text-emerald-700" />
          <Read label="Total Deduction" value={currency(b.totalDeduction)} accent="text-red-600" />
          <Read label="Occasional" value={currency(b.occasionalAmount ?? 0)} accent="text-sky-700" />
          <Read
            label={(d.loanPaymentMode ?? "salary") === "salary" && b.loanFromSalary > 0 ? "Net after loan" : "Net Salary"}
            value={currency(b.totalSalary)}
            accent="text-[#1B6FE8]"
          />
        </div>
      </div>

      <label className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-muted">
        Remarks
        <textarea
          value={d.remarks}
          onChange={e => set("remarks", e.target.value)}
          rows={2}
          placeholder="Manual remarks…"
          className="mt-1 w-full rounded-lg border border-crm-border bg-crm-surface px-2 py-1.5 text-sm outline-none resize-none focus:border-[#1B6FE8]"
        />
      </label>
    </div>
  );
}

export function ensureSalaryDetail(
  existing: EmployeeSalaryDetail | undefined,
  fallbackAmount = 0,
): EmployeeSalaryDetail {
  if (existing) return emptySalaryDetail(existing);
  return emptySalaryDetail({ basic: fallbackAmount });
}
