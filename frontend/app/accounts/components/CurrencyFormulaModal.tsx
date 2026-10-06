"use client";

import { X } from "lucide-react";
import type { CurrencyTabKey, DashboardCurrencyTab } from "../types";
import { CURRENCY_TAB_LABELS, currency, isLocalPaymentTab } from "../types";
import AmountInput from "./AmountInput";

type CurrencyFormulaModalProps = {
  open: boolean;
  tab: CurrencyTabKey;
  value: DashboardCurrencyTab;
  onClose: () => void;
  onChange: (key: keyof DashboardCurrencyTab, val: number) => void;
};

function calcFx(t: DashboardCurrencyTab) {
  const usdAfterTax = t.usdAmount * t.usdTaxFactor;
  const cadAfterTax = t.cadAmount * t.cadTaxFactor;
  const usdInPkr = usdAfterTax * t.usdToPkrRate;
  const cadInPkr = cadAfterTax * t.cadToPkrRate;
  return { usdAfterTax, cadAfterTax, usdInPkr, cadInPkr, total: usdInPkr + cadInPkr + t.pkrAmount };
}

function calcLocal(t: DashboardCurrencyTab) {
  const rate = Number(t.taxDeductionRate) || 0;
  const gross = Number(t.pkrAmount) || 0;
  const tax = gross * rate;
  const net = gross - tax;
  return { gross, tax, net, rate };
}

const FX_FIELDS: {
  label: string;
  key: keyof DashboardCurrencyTab;
  readOnly?: boolean;
  fromProjects?: boolean;
}[] = [
  { label: "USD Payment (from projects)", key: "usdAmount", fromProjects: true },
  { label: "USD Tax Factor", key: "usdTaxFactor", readOnly: true },
  { label: "USD to PKR Rate", key: "usdToPkrRate" },
  { label: "CAD Payment (from projects)", key: "cadAmount", fromProjects: true },
  { label: "CAD Tax Factor", key: "cadTaxFactor", readOnly: true },
  { label: "CAD to PKR Rate", key: "cadToPkrRate" },
  { label: "Direct PKR (from projects)", key: "pkrAmount", fromProjects: true },
];

export default function CurrencyFormulaModal({
  open,
  tab,
  value,
  onClose,
  onChange,
}: CurrencyFormulaModalProps) {
  if (!open) return null;

  const local = isLocalPaymentTab(tab);
  const fx = calcFx(value);
  const loc = calcLocal(value);
  const taxPct = ((value.taxDeductionRate ?? 0) * 100).toFixed(0);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-crm-surface rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b bg-[#F8FAFC] flex items-center justify-between">
          <div>
            <h3 className="font-bold text-crm-text text-sm">Payment formula — {CURRENCY_TAB_LABELS[tab]}</h3>
            <p className="text-[10px] text-crm-text-faint mt-0.5">
              Collected amounts come from Admin/Manager project payments (USD / CAD / PKR) · rates editable
            </p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-crm-muted flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {local ? (
            <>
              <label className="text-xs font-semibold text-crm-text-secondary block">
                Gross collected (PKR) — from projects
                <input
                  type="text"
                  readOnly
                  value={currency(Number(value.pkrAmount) || 0)}
                  className="mt-1 h-10 w-full rounded-xl border border-crm-border px-3 text-sm bg-[#F8FAFC] text-crm-text-muted cursor-default tabular-nums"
                />
              </label>
              <label className="text-xs font-semibold text-crm-text-secondary block">
                Tax deduction (fixed)
                <input
                  type="text"
                  readOnly
                  value={`${taxPct}%`}
                  className="mt-1 h-10 w-full rounded-xl border border-crm-border px-3 text-sm bg-[#F8FAFC] text-crm-text-muted cursor-default"
                />
              </label>
              <div className="rounded-2xl border border-dashed border-crm-border bg-[#F8FAFC] p-3.5 text-[11px] text-crm-text-secondary space-y-1.5 font-mono">
                <p>Gross = <span className="font-bold text-crm-text">{currency(loc.gross)}</span></p>
                <p>Tax ({taxPct}%) = <span className="font-bold text-red-600">{currency(loc.tax)}</span></p>
                <p className="pt-1 font-bold text-[#1B6FE8]">Net received = {currency(loc.net)}</p>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FX_FIELDS.map(({ label, key, readOnly, fromProjects }) => (
                  <label key={key} className={`text-xs font-semibold text-crm-text-secondary ${key === "pkrAmount" ? "sm:col-span-2" : ""}`}>
                    {label}{readOnly ? " (fixed)" : ""}
                    {readOnly || fromProjects ? (
                      <input
                        type="text"
                        readOnly
                        value={fromProjects ? currency(Number(value[key] as number) || 0) : String(value[key] as number)}
                        className="mt-1 h-10 w-full rounded-xl border border-crm-border px-3 text-sm bg-[#F8FAFC] text-crm-text-muted cursor-default tabular-nums"
                      />
                    ) : (
                      <AmountInput
                        value={Number(value[key]) || 0}
                        onChange={n => onChange(key, n)}
                        className="mt-1 h-10 w-full rounded-xl border border-crm-border px-3 text-sm outline-none focus:ring-2 focus:ring-[#1B6FE8]/30"
                      />
                    )}
                  </label>
                ))}
              </div>
              <div className="rounded-2xl border border-dashed border-crm-border bg-[#F8FAFC] p-3.5 text-[11px] text-crm-text-secondary space-y-1.5 font-mono">
                <p>USD After Tax = {currency(value.usdAmount)} × {value.usdTaxFactor} = <span className="font-bold text-crm-text">{currency(fx.usdAfterTax)}</span></p>
                <p>USD → PKR = {currency(fx.usdAfterTax)} × {value.usdToPkrRate} = <span className="font-bold text-crm-text">{currency(fx.usdInPkr)}</span></p>
                <p className="pt-1">CAD After Tax = {currency(value.cadAmount)} × {value.cadTaxFactor} = <span className="font-bold text-crm-text">{currency(fx.cadAfterTax)}</span></p>
                <p>CAD → PKR = {currency(fx.cadAfterTax)} × {value.cadToPkrRate} = <span className="font-bold text-crm-text">{currency(fx.cadInPkr)}</span></p>
                <p className="pt-1 font-bold text-[#1B6FE8]">Total = {currency(fx.total)}</p>
              </div>
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t flex justify-end bg-[#FAFAFA]">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-xl text-xs font-bold bg-[#1B6FE8] text-white hover:bg-[#9a0e26]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
