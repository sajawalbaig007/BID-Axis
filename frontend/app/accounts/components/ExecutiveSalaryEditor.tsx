"use client";

import { computeExecutiveSalary, emptySalaryDetail, type EmployeeSalaryDetail } from "../utils/payrollFormula";
import { currency } from "../types";
import AmountInput from "./AmountInput";

type Props = {
  name: string;
  value: EmployeeSalaryDetail;
  onChange: (next: EmployeeSalaryDetail) => void;
  /** Net profit (before executive salaries) — commission base */
  profitBase: number;
  teamHint?: string;
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

function Read({ label, value, accent, hint }: { label: string; value: string; accent?: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-crm-border-subtle bg-[#F8FAFC] px-2.5 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wide text-crm-text-faint">{label}</p>
      <p className={`mt-0.5 text-sm font-bold tabular-nums ${accent ?? "text-crm-text"}`}>{value}</p>
      {hint && <p className="text-[9px] text-crm-text-faint mt-0.5 leading-snug">{hint}</p>}
    </div>
  );
}

export default function ExecutiveSalaryEditor({ name, value, onChange, profitBase, teamHint }: Props) {
  const d = emptySalaryDetail(value);
  const b = computeExecutiveSalary(d, profitBase);
  const set = <K extends keyof EmployeeSalaryDetail>(key: K, val: EmployeeSalaryDetail[K]) => {
    onChange(emptySalaryDetail({ ...d, [key]: val }));
  };

  return (
    <div className="space-y-3 rounded-xl border border-crm-border bg-crm-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-extrabold text-crm-text">{name || "Executive"}</p>
          {teamHint && <p className="text-[10px] text-crm-text-faint">{teamHint}</p>}
        </div>
        <div className="text-right">
          <p className="text-[9px] font-bold uppercase tracking-wide text-crm-text-faint">Total due to {name || "executive"}</p>
          <p className="text-base font-black tabular-nums text-[#1B6FE8]">{currency(b.totalPayable)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-[#F3D7DC] bg-gradient-to-br from-[#FFF6F8] to-white p-2.5 space-y-2">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-[#1B6FE8]">
          Total payable this period
        </p>
        <p className="text-[10px] text-crm-text-muted">
          Basic + Allowances + Commission + Loan+ve − Loan−ve + Occasional − PF = amount due to this executive
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Num label="Basic Salary" value={d.basic} onChange={v => set("basic", v)} />
          <Num label="Home Allowance" value={d.homeAllowance ?? 0} onChange={v => set("homeAllowance", v)} />
          <Num label="Fuel Allowance" value={d.fuelAllowance ?? 0} onChange={v => set("fuelAllowance", v)} />
          <Num label="Med Allowance" value={d.medicalAllowance ?? 0} onChange={v => set("medicalAllowance", v)} />
          <Read label="+ Commission" value={currency(b.commission)} accent="text-emerald-700" />
          <Read label="+ Loan owed to them" value={currency(b.loanPositive)} accent="text-orange-700" />
          <Read label="− Loan they owe" value={currency(b.loanNegative)} accent="text-red-600" />
        </div>
        <div className="rounded-xl border border-[#1B6FE8]/25 bg-crm-surface px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#1B6FE8]/80">
              Total due to {name || "this executive"}
            </p>
            <p className="text-[10px] text-crm-text-faint mt-0.5">
              Salary {currency(b.totalSalary)}
              {b.loanPositive > 0 ? ` · + loan ${currency(b.loanPositive)}` : ""}
              {b.loanNegative > 0 ? ` · − recover ${currency(b.loanNegative)}` : ""}
              {b.occasionalAmount > 0 ? ` · + occasional ${currency(b.occasionalAmount)}` : ""}
              {b.pf > 0 ? ` · − PF ${currency(b.pf)}` : ""}
            </p>
          </div>
          <p className="text-xl font-black tabular-nums text-[#1B6FE8]">{currency(b.totalPayable)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-2.5 space-y-2">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-800">Commission (from Net Profit)</p>
        <p className="text-[10px] text-emerald-700/80">
          Commission = % of net profit (revenue − all other expenses). No commission on loss. Remaining profit stays with the company.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Read label="Net Profit (base)" value={currency(b.commissionBase)} />
          <Num label="Commission %" value={d.commissionPct ?? 0} onChange={v => set("commissionPct", v)} step="0.5" />
          <Read label="Commission Amount" value={currency(b.commission)} accent="text-emerald-700" />
        </div>
        {b.commissionBase <= 0 && (
          <p className="text-[10px] font-semibold text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
            Net profit base is 0 for this day — commission stays 0. Fill Currency Formula revenue (and keep expenses below revenue) to unlock commission. Total salary still = Basic.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Read label="Commission" value={currency(b.commission)} accent="text-emerald-700" />
        <Read
          label="Total Salary"
          value={currency(b.totalSalary)}
          accent="text-[#1B6FE8]"
          hint="Basic + Commission"
        />
      </div>

      <div className="rounded-xl border border-orange-100 bg-orange-50/30 p-2.5 space-y-2">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-orange-800">Loan Ledger</p>
        <div className="grid grid-cols-2 gap-2">
          <Num
            label="Loan +ve (company owes them)"
            value={d.loanPositive ?? 0}
            onChange={v => set("loanPositive", v)}
            hint="Added to total payable"
          />
          <Num
            label="Loan −ve (they owe company)"
            value={d.loanNegative ?? 0}
            onChange={v => set("loanNegative", v)}
            hint="Subtracted from total payable"
          />
        </div>
      </div>

      <div className="rounded-xl border border-teal-100 bg-teal-50/30 p-2.5 space-y-2">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-teal-800">PF & Tax</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
          <label className="flex items-center gap-2 text-xs font-semibold text-crm-text-secondary h-9 rounded-lg border border-teal-200 bg-white px-2 cursor-pointer">
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
        </div>
      </div>

      <div className="rounded-xl border border-sky-100 bg-sky-50/30 p-2.5 space-y-2">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-sky-800">Occasional Amount</p>
        <p className="text-[10px] text-sky-700/80">
          Rule: if filled, amount is added to Total Due only. PF is deducted separately when Apply PF is on.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Num
            label="Occasional Amount"
            value={d.occasionalAmount ?? 0}
            onChange={v => set("occasionalAmount", v)}
            hint="Plus into total due"
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
