import { AlignLeft, Briefcase, CalendarDays, DollarSign, FileText, Hash } from "lucide-react";
import ServicePicker from "./ServicePicker";
import PaymentStatusCircle from "./PaymentStatusCircle";

interface ProjectDetailsFormProps {
  projectCode: string; onProjectCodeChange: (v: string) => void;
  title: string; onTitleChange: (v: string) => void;
  service: string; onServiceChange: (v: string) => void;
  deadline: string; onDeadlineChange: (v: string) => void;
  budget: string; onBudgetChange: (v: string) => void;
  paidAmount: string; onPaidAmountChange: (v: string) => void;
  notes: string; onNotesChange: (v: string) => void;
}

const toNumber = (raw: string): number => {
  const n = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
};

export default function ProjectDetailsForm({
  projectCode, onProjectCodeChange,
  title, onTitleChange, service, onServiceChange,
  deadline, onDeadlineChange, budget, onBudgetChange,
  paidAmount, onPaidAmountChange, notes, onNotesChange,
}: ProjectDetailsFormProps) {
  const budgetNum = toNumber(budget);
  const paidNum   = toNumber(paidAmount);
  const percent   = budgetNum > 0 ? (paidNum / budgetNum) * 100 : 0;

  return (
    <>
      <div>
        <label className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 sm:mb-2">
          <Hash size={10} className="text-[#1B6FE8] sm:w-2.75 sm:h-2.75" />
          Project Code <span className="text-gray-300 normal-case">(optional)</span>
        </label>
        <input
          type="text" placeholder="e.g. BIM-2024-001" value={projectCode}
          onChange={e => onProjectCodeChange(e.target.value)}
          className="w-full h-10 sm:h-11 rounded-xl sm:rounded-2xl border-2 border-gray-200 bg-[#FAFAFA] px-3 sm:px-4 text-sm outline-none focus:border-[#1B6FE8] focus:bg-white transition-colors placeholder:text-gray-300"
        />
      </div>

      <div>
        <label className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 sm:mb-2">
          <FileText size={10} className="text-[#1B6FE8] sm:w-[11px] sm:h-[11px]" />
          Project Title <span className="text-[#1B6FE8] normal-case ml-1">*required</span>
        </label>
        <input
          type="text" placeholder="e.g. BIM Modeling Phase 1" value={title}
          onChange={e => onTitleChange(e.target.value)}
          className="w-full h-10 sm:h-11 rounded-xl sm:rounded-2xl border-2 border-gray-200 bg-[#FAFAFA] px-3 sm:px-4 text-sm outline-none focus:border-[#1B6FE8] focus:bg-white transition-colors placeholder:text-gray-300"
        />
      </div>

      <div>
        <label className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 sm:mb-2">
          <Briefcase size={10} className="text-[#1B6FE8] sm:w-[11px] sm:h-[11px]" />
          Service to Provide <span className="text-[#1B6FE8] normal-case ml-1">*required</span>
        </label>
        <ServicePicker value={service} onChange={onServiceChange} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <div>
          <label className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 sm:mb-2">
            <CalendarDays size={10} className="text-[#1B6FE8] sm:w-[11px] sm:h-[11px]" />
            Deadline <span className="text-[#1B6FE8] normal-case">*</span>
          </label>
          <input
            type="date" value={deadline} onChange={e => onDeadlineChange(e.target.value)}
            className="w-full h-10 sm:h-11 rounded-xl sm:rounded-2xl border-2 border-gray-200 bg-[#FAFAFA] px-2 sm:px-3 text-xs sm:text-sm outline-none focus:border-[#1B6FE8] focus:bg-white transition-colors"
          />
        </div>
        <div>
          <label className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 sm:mb-2">
            <DollarSign size={10} className="text-[#1B6FE8] sm:w-[11px] sm:h-[11px]" />
            Quotation / Budget <span className="text-gray-300 normal-case">(opt)</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="text" placeholder="0.00" value={budget.replace(/^\$/, "")}
              onChange={e => onBudgetChange(e.target.value)}
              className="w-full h-10 sm:h-11 rounded-xl sm:rounded-2xl border-2 border-gray-200 bg-[#FAFAFA] pl-6 sm:pl-7 pr-2 sm:pr-3 text-xs sm:text-sm outline-none focus:border-[#1B6FE8] focus:bg-white transition-colors placeholder:text-gray-300"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 sm:mb-2">
          <DollarSign size={10} className="text-[#1B6FE8] sm:w-2.75 sm:h-2.75" />
          Paid Amount <span className="text-[#1B6FE8] normal-case ml-1">*required</span>
        </label>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="text" placeholder="0.00" value={paidAmount.replace(/^\$/, "")}
              onChange={e => onPaidAmountChange(e.target.value)}
              className="w-full h-10 sm:h-11 rounded-xl sm:rounded-2xl border-2 border-gray-200 bg-[#FAFAFA] pl-6 sm:pl-7 pr-2 sm:pr-3 text-xs sm:text-sm outline-none focus:border-[#1B6FE8] focus:bg-white transition-colors placeholder:text-gray-300"
            />
          </div>
          <PaymentStatusCircle percent={percent} />
        </div>
        {budgetNum > 0 && (
          <p className="text-[10px] sm:text-[11px] text-gray-400 mt-1.5">
            {paidNum >= budgetNum
              ? "Fully paid."
              : `${Math.round(percent)}% of $${budgetNum.toLocaleString()} quotation paid.`}
          </p>
        )}
      </div>

      <div>
        <label className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 sm:mb-2">
          <AlignLeft size={10} className="text-[#1B6FE8] sm:w-[11px] sm:h-[11px]" />
          Notes <span className="text-gray-300 normal-case">(optional)</span>
        </label>
        <textarea
          placeholder="Any additional notes..." value={notes}
          onChange={e => onNotesChange(e.target.value)} rows={3}
          className="w-full rounded-xl sm:rounded-2xl border-2 border-gray-200 bg-[#FAFAFA] px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm outline-none focus:border-[#1B6FE8] focus:bg-white transition-colors resize-none placeholder:text-gray-300"
        />
      </div>
    </>
  );
}
