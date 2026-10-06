"use client";

import type { NoteEntry } from "../../hooks/useLeadsData";
import CommentCell from "./CommentCell";

interface NoteHistoryPanelProps {
  leadId: string;
  noteHistory?: NoteEntry[];
  noteCount?: number;
  onAddNote?: (id: string, text: string, parentId?: string) => Promise<unknown>;
}

/** Sticky notes (+N, edit/delete, right-click reply) for modals. */
export default function NoteHistoryPanel({
  leadId,
  noteHistory = [],
  noteCount,
  onAddNote,
}: NoteHistoryPanelProps) {
  return (
    <div className="rounded-xl sm:rounded-2xl border border-amber-100 bg-amber-50/40 p-3 sm:p-4">
      <CommentCell
        id={leadId}
        noteHistory={noteHistory}
        noteCount={noteCount ?? noteHistory.length}
        onAddNote={onAddNote}
      />
    </div>
  );
}
