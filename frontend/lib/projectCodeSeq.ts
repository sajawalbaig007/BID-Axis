import { parseTechnicalAssignments } from "@/lib/technicalAssignments";

/** `FOO-01` → { base: "FOO", seq: 1 }. No suffix → first project. */
export function parseProjectCodeSeq(raw: string | null | undefined): { base: string; seq: number } | null {
  const code = String(raw ?? "").trim();
  if (!code) return null;
  const m = code.match(/^(.*)-(\d+)$/);
  if (!m) return { base: code, seq: 1 };
  const base = m[1]!.trim();
  const seq = parseInt(m[2]!, 10);
  if (!base || !Number.isFinite(seq) || seq < 1) return { base: code, seq: 1 };
  return { base, seq };
}

export function projectCodeSeqOf(lead: {
  projectCode?: string | null;
  clientCode?: string | null;
}): { base: string; seq: number } | null {
  return parseProjectCodeSeq(lead.projectCode) ?? parseProjectCodeSeq(lead.clientCode);
}

type ProjectLike = {
  id: string;
  projectCode?: string | null;
  clientCode?: string | null;
  technicalAssignments?: unknown;
};

/** Estimators who worked the immediately previous code (e.g. -01 when assigning -02). */
export function previousProjectEstimatorIds(
  current: ProjectLike | null | undefined,
  allProjects: ProjectLike[],
): string[] {
  if (!current) return [];
  const parsed = projectCodeSeqOf(current);
  if (!parsed || parsed.seq < 2) return [];
  const baseKey = parsed.base.toLowerCase();
  const prevSeq = parsed.seq - 1;
  const sibling = allProjects.find((p) => {
    if (p.id === current.id) return false;
    const s = projectCodeSeqOf(p);
    return !!s && s.base.toLowerCase() === baseKey && s.seq === prevSeq;
  });
  if (!sibling) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const a of parseTechnicalAssignments(sibling.technicalAssignments)) {
    if (!a.estimatorId || seen.has(a.estimatorId)) continue;
    seen.add(a.estimatorId);
    ids.push(a.estimatorId);
  }
  return ids;
}
