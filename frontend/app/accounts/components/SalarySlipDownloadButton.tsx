"use client";

import { useState, type MouseEvent } from "react";
import { Download, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import type { SubHeadEntry } from "../types";
import { buildSalarySlipFromSub, type SlipPayrollKind } from "../utils/buildSalarySlip";
import { downloadSalarySlipPdf } from "../utils/salarySlipPdf";
import {
  DEFAULT_SALARY_SLIP_COMPANY,
  SALARY_SLIP_COMPANIES,
  salarySlipCompanyForKind,
  type SalarySlipCompanyKey,
} from "../utils/salarySlipCompanies";

type Props = {
  sub: SubHeadEntry;
  kind: SlipPayrollKind;
  recordDate: string;
  companyKey?: SalarySlipCompanyKey;
  execProfitBase?: number;
  salesExtra?: number;
  /** Compact icon-only for table rows */
  compact?: boolean;
  className?: string;
};

export default function SalarySlipDownloadButton({
  sub,
  kind,
  recordDate,
  companyKey = DEFAULT_SALARY_SLIP_COMPANY,
  execProfitBase = 0,
  salesExtra = 0,
  compact = false,
  className = "",
}: Props) {
  const [busy, setBusy] = useState(false);
  const resolvedKey = salarySlipCompanyForKind(kind, companyKey);
  const company = SALARY_SLIP_COMPANIES[resolvedKey];

  const onClick = async (e: MouseEvent) => {
    e.stopPropagation();
    if (!company.slipReady) {
      toast.error(`${company.label} salary-slip format is not ready yet — use BEM Solutions for now.`);
      return;
    }
    setBusy(true);
    try {
      const payload = buildSalarySlipFromSub({
        sub,
        kind,
        recordDate,
        companyKey: resolvedKey,
        execProfitBase,
        salesExtra,
      });
      await downloadSalarySlipPdf(payload);
      toast.success(`Salary slip downloaded · ${company.label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Salary slip download failed.");
    } finally {
      setBusy(false);
    }
  };

  const title = `Download salary slip for ${company.label}`;

  if (compact) {
    return (
      <button
        type="button"
        onClick={e => void onClick(e)}
        disabled={busy}
        title={title}
        className={`w-7 h-7 rounded-lg text-[#0F766E] hover:bg-teal-50 inline-flex items-center justify-center disabled:opacity-50 ${className}`}
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={e => void onClick(e)}
      disabled={busy}
      title={title}
      className={`h-8 px-2 rounded-lg border border-teal-200 bg-teal-50 text-teal-800 text-[10px] font-bold inline-flex items-center gap-1 hover:bg-teal-100 disabled:opacity-50 whitespace-nowrap ${className}`}
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
      Slip · {company.label}
    </button>
  );
}
