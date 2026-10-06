import prisma from "../config/db";
import { estDateYmd } from "./estTime";

/** Estimator roster for Technical Active Projects. */
export type TechnicalEstimator = {
  id: string;
  name: string;
  code: string;
};

export type TechnicalAssignment = {
  estimatorId: string;
  estimatorName: string;
  manHours: string;
  deadline: string;
  scopes: string[];
  divisions: string[];
  /** Scope work instructions for the estimator (what to do in this scope). */
  workDetail: string;
  /** Task complete (estimator finished; Miss can reopen to pending). */
  takeoffDone: boolean;
  /** Individually sent to Pricing. */
  pricingSent: boolean;
  /** Accumulated work time in seconds (persists across pauses). */
  timerSeconds: number;
  /** ISO timestamp while running; null when paused/idle. */
  timerStartedAt: string | null;
  /**
   * TM confirmed this estimator assignment (green tick).
   * Cleared when the same estimator’s assignment details are changed.
   */
  assignmentConfirmed: boolean;
  evaluationMarks?: number | null;
  evaluationRemarks?: string;
  evaluatedAt?: string | null;
};

/** Sync projectPhase from assignment complete / pricing flags. */
export function syncPhaseFromAssignments(
  list: TechnicalAssignment[],
  currentPhase: string | null | undefined,
): string {
  const phase = (currentPhase ?? "not_started").toLowerCase();
  if (phase === "qa_phase" || phase === "delivery_phase") {
    return currentPhase ?? phase;
  }
  if (list.length === 0) return "not_started";

  const anyPricing = list.some((a) => a.pricingSent);
  if (anyPricing) {
    if (phase.startsWith("pricing_")) return currentPhase ?? "pricing_phase";
    return "pricing_phase";
  }

  const anyDone = list.some((a) => a.takeoffDone);
  if (anyDone) return "takeoff_completed";
  return "not_started";
}

function asStringList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x ?? "").trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(/[,|;/]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

const SEED_ESTIMATORS: TechnicalEstimator[] = [
  { id: "tech-1", name: "Noman Khan", code: "TECH-01" },
  { id: "tech-2", name: "Muhammad Abdullah", code: "TECH-02" },
  { id: "tech-3", name: "Rizwan Sabir", code: "TECH-03" },
  { id: "tech-4", name: "Usama Jameel", code: "TECH-04" },
  { id: "tech-5", name: "Khaldoon Abrar", code: "TECH-05" },
  { id: "tech-6", name: "Muhammad Zaid", code: "TECH-06" },
  { id: "tech-7", name: "Muhammad Bariq", code: "TECH-07" },
  { id: "tech-8", name: "Afaq", code: "TECH-08" },
];

/** Live estimator or BIM users from Admin Users. */
export async function listTechnicalEstimators(staffRole: "estimator" | "bim" = "estimator"): Promise<TechnicalEstimator[]> {
  try {
    const users = await prisma.user.findMany({
      where: { role: staffRole },
      select: { id: true, name: true, csrCode: true, isActive: true },
      orderBy: { name: "asc" },
    });
    const active = users.filter((u) => u.isActive !== false);
    const pool = active.length > 0 ? active : users;
    if (pool.length > 0) {
      return pool.map((u, i) => ({
        id: u.id,
        name: u.name,
        code: (u.csrCode ?? "").trim() || `${staffRole === "bim" ? "BIM" : "EST"}-${String(i + 1).padStart(2, "0")}`,
      }));
    }
  } catch (err) {
    console.error("listTechnicalEstimators failed:", err);
  }
  return [];
}

export function getSeedTechnicalEstimators(): TechnicalEstimator[] {
  return SEED_ESTIMATORS.map((e) => ({ ...e }));
}

export function parseTechnicalAssignments(raw: unknown): TechnicalAssignment[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  const out: TechnicalAssignment[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const estimatorId = String(o.estimatorId ?? "").trim();
    const estimatorName = String(o.estimatorName ?? "").trim();
    if (!estimatorId && !estimatorName) continue;
    const timerSeconds = Math.max(0, Math.floor(Number(o.timerSeconds ?? 0) || 0));
    const startedRaw = o.timerStartedAt != null ? String(o.timerStartedAt).trim() : "";
    out.push({
      estimatorId: estimatorId || estimatorName,
      estimatorName: estimatorName || estimatorId,
      manHours: String(o.manHours ?? "").trim(),
      deadline: String(o.deadline ?? "").trim().split("T")[0],
      scopes: asStringList(o.scopes ?? o.scope),
      divisions: asStringList(o.divisions ?? o.division),
      workDetail: String(o.workDetail ?? o.scopeDetail ?? "").trim(),
      takeoffDone: o.takeoffDone === true,
      pricingSent: o.pricingSent === true,
      timerSeconds,
      timerStartedAt: startedRaw || null,
      assignmentConfirmed: o.assignmentConfirmed === true,
      evaluationMarks: parseEvalMarks(o.evaluationMarks),
      evaluationRemarks: String(o.evaluationRemarks ?? "").trim(),
      evaluatedAt: o.evaluatedAt ? String(o.evaluatedAt).trim() || null : null,
    });
  }
  return out;
}

export function normalizeTechnicalAssignmentsInput(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  const list = parseTechnicalAssignments(raw);
  return JSON.stringify(list);
}

export function serializeTechnicalAssignments(list: TechnicalAssignment[]): string {
  return JSON.stringify(list);
}

/** Match assignment to logged-in estimator by user id or name. */
export function assignmentBelongsToEstimator(
  a: TechnicalAssignment,
  user: { id: string; name: string },
): boolean {
  if (a.estimatorId === user.id) return true;
  const an = a.estimatorName.trim().toLowerCase();
  const un = user.name.trim().toLowerCase();
  return !!an && !!un && an === un;
}

export function pauseAssignmentTimer(a: TechnicalAssignment, now = Date.now()): TechnicalAssignment {
  if (!a.timerStartedAt) return { ...a, timerStartedAt: null };
  const started = new Date(a.timerStartedAt).getTime();
  const add = Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : 0;
  return {
    ...a,
    timerSeconds: a.timerSeconds + add,
    timerStartedAt: null,
  };
}

export function startAssignmentTimer(a: TechnicalAssignment, now = Date.now()): TechnicalAssignment {
  if (a.takeoffDone) return a;
  if (a.timerStartedAt) return a;
  return { ...a, timerStartedAt: new Date(now).toISOString() };
}

export function assignmentElapsedSeconds(a: TechnicalAssignment, now = Date.now()): number {
  let total = a.timerSeconds;
  if (a.timerStartedAt) {
    const started = new Date(a.timerStartedAt).getTime();
    if (Number.isFinite(started)) total += Math.max(0, Math.floor((now - started) / 1000));
  }
  return total;
}

/** Estimator Complete unlocks only after timer has run this long (seconds). */
export const MIN_COMPLETE_TIMER_SECONDS = 30;

export function canCompleteAfterTimer(elapsedSeconds: number): boolean {
  return Math.max(0, Math.floor(elapsedSeconds)) >= MIN_COMPLETE_TIMER_SECONDS;
}

/**
 * Running timer left overnight (or >12h continuous) must pause —
 * never auto-complete; estimator resumes next day from timerSeconds.
 */
export function isAssignmentTimerStale(
  timerStartedAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!timerStartedAt) return false;
  const started = new Date(timerStartedAt);
  if (Number.isNaN(started.getTime())) return false;
  if (estDateYmd(started) !== estDateYmd(now)) return true;
  return now.getTime() - started.getTime() > 12 * 60 * 60 * 1000;
}

/** Pause stale running timers for this estimator (overnight leave → resume later). */
export async function pauseStaleTimersForEstimator(
  user: { id: string; name: string },
): Promise<number> {
  const raw = await prisma.lead.findMany({
    where: { technicalAssignments: { not: null } },
    select: { id: true, technicalAssignments: true },
    take: 500,
  });
  const now = Date.now();
  let paused = 0;
  for (const lead of raw) {
    const list = parseTechnicalAssignments(lead.technicalAssignments);
    let changed = false;
    const next = list.map((a) => {
      if (!assignmentBelongsToEstimator(a, user)) return a;
      if (a.takeoffDone || !a.timerStartedAt) return a;
      if (!isAssignmentTimerStale(a.timerStartedAt, new Date(now))) return a;
      changed = true;
      paused += 1;
      return pauseAssignmentTimer(a, now);
    });
    if (!changed) continue;
    await prisma.lead.update({
      where: { id: lead.id },
      data: { technicalAssignments: serializeTechnicalAssignments(next) },
    });
  }
  return paused;
}

/** Pause running timers for this estimator on specific leads (fast path). */
export async function pauseTimersOnLeadIds(
  user: { id: string; name: string },
  leadIds: string[],
): Promise<void> {
  const ids = [...new Set(leadIds.map(String).filter(Boolean))];
  if (ids.length === 0) return;
  const now = Date.now();
  const leads = await prisma.lead.findMany({
    where: { id: { in: ids } },
    select: { id: true, technicalAssignments: true },
  });
  for (const lead of leads) {
    const list = parseTechnicalAssignments(lead.technicalAssignments);
    let changed = false;
    const next = list.map((a) => {
      if (!assignmentBelongsToEstimator(a, user)) return a;
      if (!a.timerStartedAt) return a;
      changed = true;
      return pauseAssignmentTimer(a, now);
    });
    if (!changed) continue;
    await prisma.lead.update({
      where: { id: lead.id },
      data: { technicalAssignments: serializeTechnicalAssignments(next) },
    });
  }
}

/** Pause any running timers for this estimator on other projects (one active timer). */
export async function pauseOtherRunningTimersForEstimator(
  user: { id: string; name: string },
  exceptLeadId?: string,
): Promise<void> {
  const raw = await prisma.lead.findMany({
    where: {
      technicalAssignments: { not: null },
      ...(exceptLeadId ? { id: { not: exceptLeadId } } : {}),
    },
    select: { id: true, technicalAssignments: true },
    take: 200,
  });

  const now = Date.now();
  for (const lead of raw) {
    const list = parseTechnicalAssignments(lead.technicalAssignments);
    let changed = false;
    const next = list.map((a) => {
      if (!assignmentBelongsToEstimator(a, user)) return a;
      if (!a.timerStartedAt) return a;
      changed = true;
      return pauseAssignmentTimer(a, now);
    });
    if (!changed) continue;
    await prisma.lead.update({
      where: { id: lead.id },
      data: { technicalAssignments: serializeTechnicalAssignments(next) },
    });
  }
}

/** Keep timer / complete flags when Miss re-assigns same estimator. */
export function mergeAssignmentProgress(
  incoming: TechnicalAssignment[],
  previous: TechnicalAssignment[],
): TechnicalAssignment[] {
  const sameList = (a: string[], b: string[]) =>
    JSON.stringify([...(a ?? [])].map((x) => x.trim()).filter(Boolean).sort()) ===
    JSON.stringify([...(b ?? [])].map((x) => x.trim()).filter(Boolean).sort());

  return incoming.map((a) => {
    const old = previous.find(
      (p) =>
        p.estimatorId === a.estimatorId ||
        (!!p.estimatorName &&
          !!a.estimatorName &&
          p.estimatorName.toLowerCase() === a.estimatorName.toLowerCase()),
    );
    if (!old) {
      return {
        ...a,
        takeoffDone: false,
        pricingSent: false,
        timerSeconds: 0,
        timerStartedAt: null,
        assignmentConfirmed: true,
      };
    }
    const detailsChanged =
      (old.manHours ?? "") !== (a.manHours ?? "") ||
      (old.deadline ?? "") !== (a.deadline ?? "") ||
      (old.workDetail ?? "") !== (a.workDetail ?? "") ||
      !sameList(old.scopes ?? [], a.scopes ?? []) ||
      !sameList(old.divisions ?? [], a.divisions ?? []) ||
      old.estimatorId !== a.estimatorId;

    return {
      ...a,
      takeoffDone: old.takeoffDone,
      pricingSent: old.pricingSent,
      timerSeconds: old.timerSeconds,
      timerStartedAt: old.takeoffDone ? null : old.timerStartedAt,
      assignmentConfirmed: detailsChanged ? false : old.assignmentConfirmed === true,
      evaluationMarks: old.evaluationMarks ?? a.evaluationMarks ?? null,
      evaluationRemarks: old.evaluationRemarks ?? a.evaluationRemarks ?? "",
      evaluatedAt: old.evaluatedAt ?? a.evaluatedAt ?? null,
    };
  });
}

function parseEvalMarks(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, Math.round(n * 10) / 10));
}

export type TechnicalWorkflowTab =
  | "all"
  | "not_assigned"
  | "assigned"
  | "takeoff_done"
  | "pricing"
  | "final_submission"
  | "completed";

/** Force assignment flags / phase so the project lands in a workflow tab. */
export function applyTechnicalTabMove(
  previous: TechnicalAssignment[],
  tab: Exclude<TechnicalWorkflowTab, "all">,
  currentPhase: string | null | undefined,
): {
  assignments: TechnicalAssignment[];
  projectPhase: string;
  projectWorkStatus?: string;
  error?: string;
} {
  if (tab === "completed") {
    return {
      assignments: previous,
      projectPhase: "delivery_phase",
      projectWorkStatus: "completed",
    };
  }

  if (tab === "not_assigned") {
    return { assignments: [], projectPhase: "not_started" };
  }

  if (previous.length === 0) {
    return {
      assignments: previous,
      projectPhase: currentPhase ?? "not_started",
      error: "Assign at least one estimator before moving to this stage.",
    };
  }

  if (tab === "assigned") {
    const assignments = previous.map((a) => ({
      ...a,
      takeoffDone: false,
      pricingSent: false,
      timerStartedAt: a.takeoffDone ? null : a.timerStartedAt,
    }));
    return { assignments, projectPhase: syncPhaseFromAssignments(assignments, "not_started") };
  }

  if (tab === "takeoff_done") {
    const assignments = previous.map((a) => ({
      ...a,
      takeoffDone: true,
      pricingSent: false,
      timerStartedAt: null,
    }));
    return { assignments, projectPhase: "takeoff_completed" };
  }

  if (tab === "pricing") {
    const assignments = previous.map((a) => ({
      ...a,
      takeoffDone: true,
      pricingSent: true,
      timerStartedAt: null,
    }));
    return { assignments, projectPhase: "pricing_phase" };
  }

  /* final_submission */
  const assignments = previous.map((a) => ({
    ...a,
    takeoffDone: true,
    pricingSent: true,
    timerStartedAt: null,
  }));
  return { assignments, projectPhase: "qa_phase" };
}

export type TechnicalNoteEntry = {
  id: string;
  text: string;
  createdAt: string;
  authorId?: string;
  authorRole?: string;
  authorName?: string;
};

export type TechnicalNotesThread = "sir" | "estimator";

export type TechnicalNotesBundle = {
  sir: TechnicalNoteEntry[];
  estimator: TechnicalNoteEntry[];
};

function normalizeNoteEntry(item: unknown, index: number): TechnicalNoteEntry | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const text = String(o.text ?? "").trim();
  if (!text) return null;
  const entry: TechnicalNoteEntry = {
    id: String(o.id ?? `n-${Date.now()}-${index}`),
    text,
    createdAt: String(o.createdAt ?? new Date().toISOString()),
  };
  if (o.authorId) entry.authorId = String(o.authorId);
  if (o.authorRole) entry.authorRole = String(o.authorRole);
  if (o.authorName) entry.authorName = String(o.authorName);
  return entry;
}

function parseNoteList(raw: unknown): TechnicalNoteEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: TechnicalNoteEntry[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const entry = normalizeNoteEntry(raw[i], i);
    if (entry) out.push(entry);
  }
  return out;
}

/** Supports legacy array (sir-only) and `{ sir, estimator }` bundle. */
export function parseTechnicalNotesBundle(raw: unknown): TechnicalNotesBundle {
  if (!raw) return { sir: [], estimator: [] };
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return { sir: [], estimator: [] };
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return {
        sir: [{ id: `legacy-${Date.now()}`, text: trimmed, createdAt: new Date().toISOString() }],
        estimator: [],
      };
    }
  }
  if (Array.isArray(parsed)) {
    return { sir: parseNoteList(parsed), estimator: [] };
  }
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    return {
      sir: parseNoteList(o.sir ?? o.admin ?? o.adminThread),
      estimator: parseNoteList(o.estimator ?? o.estimatorThread),
    };
  }
  return { sir: [], estimator: [] };
}

/** Legacy helper — returns Admin↔TM (sir) thread only. */
export function parseTechnicalNotes(raw: unknown): TechnicalNoteEntry[] {
  return parseTechnicalNotesBundle(raw).sir;
}

export function serializeTechnicalNotesBundle(bundle: TechnicalNotesBundle): string {
  return JSON.stringify({
    sir: bundle.sir,
    estimator: bundle.estimator,
  });
}

/** @deprecated Prefer serializeTechnicalNotesBundle — this only serializes a flat sir list. */
export function serializeTechnicalNotes(list: TechnicalNoteEntry[]): string {
  return serializeTechnicalNotesBundle({ sir: list, estimator: [] });
}

export function appendTechnicalNote(
  raw: unknown,
  text: string,
  thread: TechnicalNotesThread = "sir",
  meta?: { authorId?: string; authorRole?: string; authorName?: string },
): { bundle: TechnicalNotesBundle; note: TechnicalNoteEntry; list: TechnicalNoteEntry[] } {
  const bundle = parseTechnicalNotesBundle(raw);
  const note: TechnicalNoteEntry = {
    id: `tn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: text.trim(),
    createdAt: new Date().toISOString(),
    ...(meta?.authorId ? { authorId: meta.authorId } : {}),
    ...(meta?.authorRole ? { authorRole: meta.authorRole } : {}),
    ...(meta?.authorName ? { authorName: meta.authorName } : {}),
  };
  bundle[thread] = [...bundle[thread], note];
  return { bundle, note, list: bundle[thread] };
}

function findNoteThread(
  bundle: TechnicalNotesBundle,
  noteId: string,
): TechnicalNotesThread | null {
  if (bundle.sir.some((n) => n.id === noteId)) return "sir";
  if (bundle.estimator.some((n) => n.id === noteId)) return "estimator";
  return null;
}

function rolesCompatible(noteRole?: string, actorRole?: string): boolean {
  if (!noteRole || !actorRole) return false;
  const adminish = (r: string) => r === "admin" || r === "manager";
  if (adminish(noteRole) && adminish(actorRole)) return true;
  return noteRole === actorRole;
}

function canMutateTechnicalNote(
  existing: TechnicalNoteEntry,
  actorId: string,
  actorRole?: string,
  opts?: { adminForce?: boolean },
): boolean {
  if (opts?.adminForce) return true;
  if (existing.authorId) return existing.authorId === actorId;
  if (existing.authorRole) return rolesCompatible(existing.authorRole, actorRole);
  // Legacy notes with no author meta — allow signed-in actor
  return !!actorId;
}

/** Update own note only (authorId / authorRole must match unless adminForce). */
export function updateTechnicalNote(
  raw: unknown,
  noteId: string,
  text: string,
  actorId: string,
  opts?: { adminForce?: boolean; actorRole?: string },
): { bundle: TechnicalNotesBundle; note: TechnicalNoteEntry; thread: TechnicalNotesThread } | { error: string } {
  const bundle = parseTechnicalNotesBundle(raw);
  const thread = findNoteThread(bundle, noteId);
  if (!thread) return { error: "Note not found" };
  const idx = bundle[thread].findIndex((n) => n.id === noteId);
  if (idx < 0) return { error: "Note not found" };
  const existing = bundle[thread][idx];
  if (!canMutateTechnicalNote(existing, actorId, opts?.actorRole, opts)) {
    return { error: "Only the author can edit this note" };
  }
  const note: TechnicalNoteEntry = {
    ...existing,
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };
  bundle[thread] = [...bundle[thread]];
  bundle[thread][idx] = note;
  return { bundle, note, thread };
}

/** Delete own note only (authorId / authorRole must match unless adminForce). */
export function deleteTechnicalNote(
  raw: unknown,
  noteId: string,
  actorId: string,
  opts?: { adminForce?: boolean; actorRole?: string },
): { bundle: TechnicalNotesBundle; thread: TechnicalNotesThread } | { error: string } {
  const bundle = parseTechnicalNotesBundle(raw);
  const thread = findNoteThread(bundle, noteId);
  if (!thread) return { error: "Note not found" };
  const existing = bundle[thread].find((n) => n.id === noteId);
  if (!existing) return { error: "Note not found" };
  if (!canMutateTechnicalNote(existing, actorId, opts?.actorRole, opts)) {
    return { error: "Only the author can delete this note" };
  }
  bundle[thread] = bundle[thread].filter((n) => n.id !== noteId);
  return { bundle, thread };
}
