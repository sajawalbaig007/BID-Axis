"use client";

import { ArrowRightLeft, X, UserPlus, ClipboardList, CheckCircle2, Calculator, Send, Layers, GitBranch } from "lucide-react";
import type { TechnicalWorkflowTab } from "@/lib/technicalAssignments";

export type TechnicalMoveTarget = Exclude<TechnicalWorkflowTab, "all"> | "revisions";

const MOVE_OPTIONS: {
  tab: TechnicalMoveTarget;
  title: string;
  sub: string;
  Icon: typeof Layers;
  iconBg: string;
}[] = [
  {
    tab: "not_assigned",
    title: "Not Assigned",
    sub: "Clear estimators — back to unassigned queue",
    Icon: UserPlus,
    iconBg: "bg-slate-100 text-slate-600",
  },
  {
    tab: "assigned",
    title: "Assigned",
    sub: "Working estimators (takeoff not done)",
    Icon: ClipboardList,
    iconBg: "bg-sky-50 text-sky-700",
  },
  {
    tab: "takeoff_done",
    title: "Take Off Done",
    sub: "Mark estimators takeoff complete",
    Icon: CheckCircle2,
    iconBg: "bg-violet-50 text-violet-700",
  },
  {
    tab: "pricing",
    title: "Pricing",
    sub: "Send estimators into Pricing",
    Icon: Calculator,
    iconBg: "bg-amber-50 text-amber-700",
  },
  {
    tab: "final_submission",
    title: "Final Submission",
    sub: "Move project into Final / QA phase",
    Icon: Send,
    iconBg: "bg-emerald-50 text-emerald-700",
  },
  {
    tab: "completed",
    title: "Completed",
    sub: "Mark project completed — no assign required",
    Icon: CheckCircle2,
    iconBg: "bg-green-50 text-green-700",
  },
  {
    tab: "revisions",
    title: "Revisions",
    sub: "Move this project to the Revisions page",
    Icon: GitBranch,
    iconBg: "bg-violet-50 text-violet-700",
  },
];

type Props = {
  open: boolean;
  projectTitle: string;
  currentTab?: TechnicalWorkflowTab | "revisions";
  saving?: boolean;
  onClose: () => void;
  onMove: (tab: TechnicalMoveTarget) => void;
};

export default function MoveTechnicalStageModal({
  open,
  projectTitle,
  currentTab,
  saving,
  onClose,
  onMove,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-[480px] bg-white rounded-t-[24px] sm:rounded-[28px] shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        <div className="relative bg-gradient-to-br from-[#1B6FE8] to-[#0E4FBE] px-5 pt-5 pb-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white"
          >
            <X size={14} />
          </button>
          <div className="flex items-center gap-2 text-white pr-10">
            <ArrowRightLeft size={18} />
            <div>
              <h2 className="text-lg font-bold">Move project</h2>
              <p className="text-xs text-white/80 mt-0.5 truncate max-w-[320px]">{projectTitle}</p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-2 overflow-y-auto">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
            Move to subpage
          </p>
          {MOVE_OPTIONS.map((opt) => {
            const active = currentTab === opt.tab;
            const Icon = opt.Icon;
            return (
              <button
                key={opt.tab}
                type="button"
                disabled={saving || active}
                onClick={() => onMove(opt.tab)}
                className={`w-full flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all ${
                  active
                    ? "border-[#1B6FE8]/40 bg-[#EAF2FE] opacity-70 cursor-default"
                    : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50"
                } disabled:opacity-60`}
              >
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${opt.iconBg}`}>
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-[#0F172A]">
                    {opt.title}
                    {active ? " · current" : ""}
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5">{opt.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
