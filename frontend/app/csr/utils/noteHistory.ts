import type { NoteEntry } from "../hooks/useLeadsData";

type RawNote = { id?: string; text?: string; createdAt?: string; parentId?: string | null };

function noteTextKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function sortNewestFirst(notes: NoteEntry[]): NoteEntry[] {
  return [...notes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function sortOldestFirst(notes: NoteEntry[]): NoteEntry[] {
  return [...notes].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

/** Nest reply rows under their parent sticky. Flat list → threaded roots. */
export function nestNoteReplies(flat: NoteEntry[]): NoteEntry[] {
  const roots: NoteEntry[] = [];
  const repliesByParent = new Map<string, NoteEntry[]>();

  for (const n of flat) {
    const parentId = n.parentId?.trim() || null;
    if (parentId) {
      const list = repliesByParent.get(parentId) ?? [];
      list.push({ ...n, parentId, replies: undefined });
      repliesByParent.set(parentId, list);
      continue;
    }
    roots.push({ ...n, parentId: null, replies: [] });
  }

  for (const root of roots) {
    root.replies = sortOldestFirst(repliesByParent.get(root.id) ?? []);
    repliesByParent.delete(root.id);
  }

  for (const orphans of repliesByParent.values()) {
    for (const o of orphans) {
      roots.push({ ...o, parentId: null, replies: [] });
    }
  }

  return sortOldestFirst(roots);
}

/** Flat count including nested replies (for +N badge). */
export function countNotesDeep(notes: NoteEntry[]): number {
  let n = 0;
  for (const note of notes) {
    n += 1;
    n += note.replies?.length ?? 0;
  }
  return n;
}

/** Merge LeadNote rows + legacy comments/followUpNotes + latestNote preview. */
export function buildNoteHistory(lead: {
  notes?: RawNote[];
  latestNote?: { id: string; text: string; createdAt: string; parentId?: string | null } | null;
  comments?: string | null;
  followUpNotes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  noteCount?: number;
}): { noteHistory: NoteEntry[]; noteCount: number } {
  const fromTable: NoteEntry[] = (lead.notes ?? [])
    .filter((n) => n.text?.trim())
    .map((n) => ({
      id: n.id ?? `note-${n.text!.slice(0, 12)}`,
      text: n.text!.trim(),
      createdAt: n.createdAt ?? new Date().toISOString(),
      parentId: n.parentId?.trim() || null,
    }));

  if (lead.latestNote?.text?.trim()) {
    const ln = lead.latestNote;
    if (!fromTable.some((n) => n.id === ln.id)) {
      fromTable.push({
        id: ln.id,
        text: ln.text.trim(),
        createdAt: ln.createdAt,
        parentId: ln.parentId?.trim() || null,
      });
    }
  }

  const byId = new Map<string, NoteEntry>();
  for (const n of fromTable) byId.set(n.id, n);

  const rootTextKeys = new Set(
    [...byId.values()]
      .filter((n) => !n.parentId)
      .map((n) => noteTextKey(n.text)),
  );

  const pushLegacy = (entry: NoteEntry) => {
    const key = noteTextKey(entry.text);
    if (!key || rootTextKeys.has(key) || byId.has(entry.id)) return;
    rootTextKeys.add(key);
    byId.set(entry.id, entry);
  };

  if (lead.comments?.trim()) {
    pushLegacy({
      id: "legacy-comments",
      text: lead.comments.trim(),
      createdAt: lead.createdAt ?? new Date().toISOString(),
      parentId: null,
    });
  }
  if (lead.followUpNotes?.trim()) {
    const followUp = lead.followUpNotes.trim();
    const lines = followUp.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      lines.forEach((line, i) => {
        pushLegacy({
          id: `legacy-followup-${i}`,
          text: line,
          createdAt: lead.updatedAt ?? lead.createdAt ?? new Date().toISOString(),
          parentId: null,
        });
      });
    } else {
      pushLegacy({
        id: "legacy-followup",
        text: followUp,
        createdAt: lead.updatedAt ?? lead.createdAt ?? new Date().toISOString(),
        parentId: null,
      });
    }
  }

  const noteHistory = nestNoteReplies([...byId.values()]);
  const deep = countNotesDeep(noteHistory);
  const noteCount = Math.max(deep, lead.noteCount ?? 0);
  return { noteHistory, noteCount };
}
