type NoteLike = { createdAt?: string; replies?: NoteLike[] };

function minNoteTime(notes: NoteLike[] | undefined): number {
  let min = Number.POSITIVE_INFINITY;
  for (const n of notes ?? []) {
    const t = n.createdAt ? new Date(n.createdAt).getTime() : NaN;
    if (!Number.isNaN(t)) min = Math.min(min, t);
    min = Math.min(min, minNoteTime(n.replies));
  }
  return min;
}

/** Oldest note first; leads with no notes go last. */
export function sortByOldestNote<T extends {
  noteHistory?: NoteLike[];
  createdAt?: string;
  statusUpdatedAt?: string;
}>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ta = minNoteTime(a.noteHistory);
    const tb = minNoteTime(b.noteHistory);
    if (ta !== tb) return ta - tb;
    const ca = new Date(a.createdAt || a.statusUpdatedAt || 0).getTime();
    const cb = new Date(b.createdAt || b.statusUpdatedAt || 0).getTime();
    return ca - cb;
  });
}
