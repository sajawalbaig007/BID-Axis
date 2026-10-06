import { CircleCheckBig, X } from "lucide-react";
import ProjectDetailsForm from "../shared/ProjectDetailsForm";
import EmailField from "../shared/EmailField";
import { Lead } from "../../types/lead";

interface ProjectWonModalProps {
  lead: Lead;
  email: string; onEmailChange: (v: string) => void;
  projectCode: string; onProjectCodeChange: (v: string) => void;
  title: string; onTitleChange: (v: string) => void;
  service: string; onServiceChange: (v: string) => void;
  deadline: string; onDeadlineChange: (v: string) => void;
  budget: string; onBudgetChange: (v: string) => void;
  paidAmount: string; onPaidAmountChange: (v: string) => void;
  notes: string; onNotesChange: (v: string) => void;
  isValid: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function ProjectWonModal({
  lead, email, onEmailChange, projectCode, onProjectCodeChange,
  title, onTitleChange, service, onServiceChange, deadline, onDeadlineChange,
  budget, onBudgetChange, paidAmount, onPaidAmountChange,
  notes, onNotesChange, isValid, onClose, onSave,
}: ProjectWonModalProps) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="w-full sm:max-w-[520px] lg:max-w-[540px] bg-white rounded-t-[24px] sm:rounded-[28px] shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "92vh" }}
      >
        <div className="relative bg-gradient-to-br from-[#1B6FE8] to-[#0E4FBE] px-4 sm:px-5 lg:px-6 pt-4 sm:pt-5 pb-4 sm:pb-5 shrink-0 overflow-hidden">
          <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
          <div className="absolute -bottom-8 -left-4 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />
          <button onClick={onClose}
            className="absolute top-3 sm:top-4 right-3 sm:right-4 w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors z-10">
            <X size={13} className="sm:w-[15px] sm:h-[15px]" />
          </button>
          <div className="flex items-center gap-2.5 sm:gap-3 pr-10">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white/20 flex items-center justify-center text-white text-base sm:text-xl font-bold shrink-0">
              {lead.client.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base lg:text-lg font-bold text-white leading-tight truncate">Close Client</h2>
              <p className="text-white/65 text-[10px] sm:text-xs mt-0.5 truncate">
                {lead.client}
                {lead.company && lead.company !== lead.client ? ` · ${lead.company}` : ""}
                {lead.phone ? ` · ${lead.phone}` : ""}
              </p>
            </div>
          </div>
          <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 bg-green-500/25 text-green-100 border border-green-400/30 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-semibold">
              <CircleCheckBig size={9} className="sm:w-[10px] sm:h-[10px]" /> Fill in project details to confirm
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-4 sm:px-5 lg:px-6 py-4 sm:py-5 space-y-3 sm:space-y-5">
            {/* EMAIL */}
            <EmailField email={email} onEmailChange={onEmailChange} />

            <ProjectDetailsForm
              projectCode={projectCode} onProjectCodeChange={onProjectCodeChange}
              title={title} onTitleChange={onTitleChange}
              service={service} onServiceChange={onServiceChange}
              deadline={deadline} onDeadlineChange={onDeadlineChange}
              budget={budget} onBudgetChange={onBudgetChange}
              paidAmount={paidAmount} onPaidAmountChange={onPaidAmountChange}
              notes={notes} onNotesChange={onNotesChange}
            />
            <div className="flex gap-2 sm:gap-3 pb-1">
              <button onClick={onClose}
                className="flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl bg-[#F5F6FA] text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-colors">
                Cancel
              </button>
              <button onClick={onSave} disabled={!isValid}
                className={`flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl font-semibold text-xs sm:text-sm text-white flex items-center justify-center gap-2 transition-all ${
                  isValid ? "bg-gradient-to-r from-[#1B6FE8] to-[#d4173a] shadow-md shadow-red-200" : "bg-gray-200 cursor-not-allowed text-gray-400"
                }`}>
                Confirm &amp; Move to Projects
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
