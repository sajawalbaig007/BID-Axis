"use client";

import { useState } from "react";
import { StickyNote } from "lucide-react";
import type { DatedNote } from "../types";
import { normalizeNotes } from "../types";
import { NoteRichText } from "@/lib/noteRichText";

type AccountsNotesCellProps = {
  notes?: DatedNote[];
  legacyNote?: string;
  fallbackDate?: string;
  className?: string;
};

/** Compact +N sticky chip — same pattern as CommentCell across CRM. */
export default function AccountsNotesCell({
  notes,
  legacyNote,
  fallbackDate,
  className = "",
}: AccountsNotesCellProps) {
  const [open, setOpen] = useState(false);
  const sorted = [...normalizeNotes(notes, legacyNote, fallbackDate)].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const count = sorted.length;

  if (!count) {
    return <span className={`text-crm-text-faint text-xs ${className}`}>—</span>;
  }

  return (
    <div className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={`${count} note${count === 1 ? "" : "s"}`}
        className="inline-flex items-center justify-center gap-1.5 min-w-11 h-8 px-2 rounded-xl border border-amber-300 bg-[#FEF3C7] text-amber-900 hover:bg-[#FDE68A] shadow-sm transition-all"
        aria-expanded={open}
      >
        <StickyNote size={13} className="shrink-0 text-amber-700" />
        <span className="inline-flex items-center justify-center min-w-5.5 h-4.5 px-1.5 rounded-full bg-amber-700 text-white text-[10px] font-extrabold tabular-nums">
          +{count}
        </span>
      </button>

      {open && (
        <div
          className="absolute z-40 mt-1 left-0 min-w-[200px] max-w-[260px] rounded-xl border border-amber-200 bg-[#FFFBEB] dark:bg-[#FFFBEB] shadow-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 py-1.5 border-b border-amber-100 bg-amber-50 dark:bg-amber-50">
            <p className="text-[10px] font-bold text-amber-900 dark:text-amber-900 uppercase tracking-wide">
              Notes · {count}
            </p>
          </div>
          <ul className="max-h-40 overflow-y-auto divide-y divide-amber-100/80">
            {sorted.map((n) => (
              <li key={n.id} className="px-2.5 py-1.5">
                <p className="text-[10px] font-bold text-amber-700 dark:text-amber-700 tabular-nums">{n.date}</p>
                <p className="text-[11px] text-amber-950 dark:text-amber-950 leading-snug">
                  <NoteRichText text={n.text || "—"} className="text-amber-950 dark:text-amber-950" />
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
