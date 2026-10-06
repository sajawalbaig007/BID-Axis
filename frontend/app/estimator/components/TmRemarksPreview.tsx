"use client";

import { MessageSquare } from "lucide-react";
import { chiefEstimatorRemarks } from "@/lib/technicalAssignments";

export default function TmRemarksPreview({
  technicalNotes,
  evaluationRemarks,
  currentUserId,
  compact = false,
}: {
  technicalNotes?: unknown;
  evaluationRemarks?: string | null;
  currentUserId?: string | null;
  compact?: boolean;
}) {
  const { evaluation, notes } = chiefEstimatorRemarks({
    technicalNotes,
    evaluationRemarks,
    currentUserId,
  });
  if (!evaluation && notes.length === 0) {
    return <p className={compact ? "text-[11px] text-crm-text-faint" : "text-xs text-crm-text-faint"}>No remarks yet</p>;
  }
  const shown = notes.slice(0, compact ? 1 : 3);
  return (
    <div className="space-y-1.5 min-w-0">
      {evaluation ? (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 px-2 py-1.5">
          <p className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">
            Evaluation
          </p>
          <p
            className={`text-crm-text whitespace-pre-wrap leading-snug mt-0.5 ${
              compact ? "text-[11px] line-clamp-2" : "text-xs line-clamp-4"
            }`}
          >
            {evaluation}
          </p>
        </div>
      ) : null}
      {shown.map((n) => (
        <div
          key={n.id}
          className="rounded-lg bg-violet-50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/20 px-2 py-1.5"
        >
          <p className="text-[10px] font-bold text-violet-700 dark:text-violet-300 inline-flex items-center gap-1">
            <MessageSquare size={10} />
            {n.authorName?.trim() || "Chief Estimator"}
          </p>
          <p className={`text-crm-text-secondary whitespace-pre-wrap leading-snug mt-0.5 ${compact ? "text-[11px] line-clamp-2" : "text-xs line-clamp-3"}`}>
            {n.text}
          </p>
        </div>
      ))}
    </div>
  );
}
