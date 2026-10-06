import { isProjectActive } from "@/lib/projectFields";

export type TechnicalEstimator = {
  id: string;
  name: string;
  code: string;
};

export const DEFAULT_TECHNICAL_ESTIMATORS: TechnicalEstimator[] = [
  { id: "tech-1", name: "Noman Khan", code: "TECH-01" },
  { id: "tech-2", name: "Muhammad Abdullah", code: "TECH-02" },
  { id: "tech-3", name: "Rizwan Sabir", code: "TECH-03" },
  { id: "tech-4", name: "Usama Jameel", code: "TECH-04" },
  { id: "tech-5", name: "Khaldoon Abrar", code: "TECH-05" },
  { id: "tech-6", name: "Muhammad Zaid", code: "TECH-06" },
  { id: "tech-7", name: "Muhammad Bariq", code: "TECH-07" },
  { id: "tech-8", name: "Afaq", code: "TECH-08" },
];

export type TechnicalAssignment = {
  estimatorId: string;
  estimatorName: string;
  manHours: string;
  deadline: string;
  scopes: string[];
  divisions: string[];
  /** Scope work instructions for the estimator. */
  workDetail: string;
  takeoffDone: boolean;
  /** Individually sent to Pricing (others can stay Assigned / Take Off Done). */
  pricingSent: boolean;
  timerSeconds: number;
  timerStartedAt: string | null;
  /** Green tick after assign; cleared when this estimator’s details change. */
  assignmentConfirmed: boolean;
  /** TM evaluation on Take Off Done — marks 0–10. */
  evaluationMarks?: number | null;
  evaluationRemarks?: string;
  evaluatedAt?: string | null;
};

function rangeDiv(from: number, to: number): string[] {
  const out: string[] = [];
  for (let n = from; n <= to; n += 1) {
    out.push(`Div ${String(n).padStart(2, "0")}`);
  }
  return out;
}

export const PROJECT_TYPE_DIVISIONS = [
  "GC Residential",
  "GC Commercial",
  "Renovation",
] as const;

/** CSI-style divisions available when assigning estimators (gaps between 1–48 skipped). */
export const DIVISION_OPTIONS = [
  ...PROJECT_TYPE_DIVISIONS,
  ...rangeDiv(1, 14),
  ...rangeDiv(21, 23),
  ...rangeDiv(25, 28),
  ...rangeDiv(31, 35),
  ...rangeDiv(40, 46),
  "Div 48",
] as const;

function asStringList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x ?? "").trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(/[,|;/]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function formatScopeSummary(scopes: string[] | undefined | null): string {
  const list = (scopes ?? []).map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return "—";
  if (list.length === 1) return list[0]!;
  return `${list[0]} +${list.length - 1}`;
}

export function formatDivisionSummary(divisions: string[] | undefined | null): string {
  const list = (divisions ?? []).map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return "—";
  if (list.length === 1) return list[0]!;
  return `${list[0]} +${list.length - 1}`;
}

export type TechnicalWorkflowTab =
  | "all"
  | "not_assigned"
  | "assigned"
  | "takeoff_done"
  | "pricing"
  | "final_submission"
  | "completed";

function parseEvalMarks(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, Math.round(n * 10) / 10));
}

export function isLeadCompleted(p: {
  status?: string | null;
  projectWorkStatus?: string | null;
}): boolean {
  const work = String(p.projectWorkStatus ?? "").toLowerCase();
  const st = String(p.status ?? "").toLowerCase();
  return work === "completed" || st === "completed";
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
      timerSeconds: Math.max(0, Math.floor(Number(o.timerSeconds ?? 0) || 0)),
      timerStartedAt: o.timerStartedAt ? String(o.timerStartedAt).trim() || null : null,
      assignmentConfirmed: o.assignmentConfirmed === true,
      evaluationMarks: parseEvalMarks(o.evaluationMarks),
      evaluationRemarks: String(o.evaluationRemarks ?? "").trim(),
      evaluatedAt: o.evaluatedAt ? String(o.evaluatedAt).trim() || null : null,
    });
  }
  return out;
}

export function assignmentElapsedSeconds(
  a: Pick<TechnicalAssignment, "timerSeconds" | "timerStartedAt">,
  now = Date.now(),
): number {
  let total = a.timerSeconds ?? 0;
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

/** Fold running segment into timerSeconds (local optimistic pause). */
export function pauseAssignmentTimerLocal(
  a: Pick<TechnicalAssignment, "timerSeconds" | "timerStartedAt" | "takeoffDone"> & Partial<TechnicalAssignment>,
  now = Date.now(),
): TechnicalAssignment {
  const base = a as TechnicalAssignment;
  if (!a.timerStartedAt) return { ...base, timerStartedAt: null };
  const started = new Date(a.timerStartedAt).getTime();
  const add = Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : 0;
  return {
    ...base,
    timerSeconds: (a.timerSeconds ?? 0) + add,
    timerStartedAt: null,
  };
}

export function startAssignmentTimerLocal(
  a: TechnicalAssignment,
  now = Date.now(),
): TechnicalAssignment {
  if (a.takeoffDone) return a;
  if (a.timerStartedAt) return a;
  return { ...a, timerStartedAt: new Date(now).toISOString() };
}

export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function projectReceiveDate(p: {
  technicalReceivedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}): string | null {
  return p.technicalReceivedAt || p.createdAt || p.updatedAt || null;
}

/** Date project was sent into Pricing (Send for Pricing). */
export function pricingReceiveDate(p: {
  pricingReceivedAt?: string | null;
}): string | null {
  return p.pricingReceivedAt || null;
}

const LATE_PHASES = new Set([
  "pricing_phase",
  "pricing_with_qa",
  "pricing_without_qa",
  "pricing_quick_qa",
  "qa_phase",
  "delivery_phase",
]);

export function isPricingPhase(phase?: string | null): boolean {
  const p = (phase ?? "").toLowerCase();
  return p === "pricing_phase" || p.startsWith("pricing_");
}

export type PricingQaMode = "with_qa" | "without_qa" | "quick_qa";

export const PRICING_QA_OPTIONS: { value: PricingQaMode; label: string }[] = [
  { value: "with_qa", label: "With QA" },
  { value: "without_qa", label: "Without QA" },
  { value: "quick_qa", label: "Quick QA" },
];

export function getPricingQaMode(phase?: string | null): PricingQaMode | "" {
  const p = (phase ?? "").toLowerCase();
  if (p === "pricing_with_qa") return "with_qa";
  if (p === "pricing_without_qa") return "without_qa";
  if (p === "pricing_quick_qa") return "quick_qa";
  if (p === "pricing_phase") return "";
  return "";
}

export function pricingQaPhase(mode: PricingQaMode): string {
  if (mode === "with_qa") return "pricing_with_qa";
  if (mode === "without_qa") return "pricing_without_qa";
  return "pricing_quick_qa";
}

export type TechTaskStatus = "pending" | "in_progress" | "completed";

export const TECH_TASK_STATUS_OPTIONS: { value: TechTaskStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

export function getTechTaskStatus(p: {
  projectWorkStatus?: string | null;
  status?: string | null;
}): TechTaskStatus {
  const work = (p.projectWorkStatus ?? "").toLowerCase();
  if (work === "completed") return "completed";
  if (work === "in_progress") return "in_progress";
  if (work === "pending" || work === "not_completed") return "pending";
  if ((p.status ?? "").toLowerCase() === "completed") return "completed";
  return "pending";
}

export function isAssignmentWorking(a: Pick<TechnicalAssignment, "takeoffDone" | "pricingSent">): boolean {
  return !a.takeoffDone && !a.pricingSent;
}

export function isAssignmentTakeoffReady(
  a: Pick<TechnicalAssignment, "takeoffDone" | "pricingSent">,
): boolean {
  return a.takeoffDone === true && !a.pricingSent;
}

export function isAssignmentPricingSent(a: Pick<TechnicalAssignment, "pricingSent">): boolean {
  return a.pricingSent === true;
}

/** All assigned estimators have been sent to Pricing → show main project scope. */
export function allAssignmentsSentForPricing(assignments: TechnicalAssignment[]): boolean {
  return assignments.length > 0 && assignments.every((a) => a.pricingSent === true);
}

export function pricedAssignments(assignments: TechnicalAssignment[]): TechnicalAssignment[] {
  return assignments.filter(isAssignmentPricingSent);
}

export function formatAssignmentScopeLine(a: TechnicalAssignment): string {
  const scopes = (a.scopes ?? []).filter(Boolean).join(", ");
  const divisions = (a.divisions ?? []).filter(Boolean).join(", ");
  const parts = [scopes, divisions].filter(Boolean);
  return parts.join(" · ") || "—";
}

/** Old projects moved to pricing as a whole — treat completed rows as already priced. */
function legacyWholeProjectPricing(
  phase: string,
  assignments: TechnicalAssignment[],
): boolean {
  return isPricingPhase(phase) && !assignments.some((a) => a.pricingSent);
}

export function matchesTechnicalTab(
  tab: TechnicalWorkflowTab,
  p: {
    projectPhase?: string | null;
    technicalAssignments?: unknown;
    status?: string | null;
    projectDeadline?: string | null;
    projectWorkStatus?: string | null;
  },
): boolean {
  const phase = (p.projectPhase ?? "not_started").toLowerCase();
  const assignments = parseTechnicalAssignments(p.technicalAssignments);
  const hasAssign = assignments.length > 0;
  const inFinal = phase === "qa_phase" || phase === "delivery_phase";
  const legacyPricing = legacyWholeProjectPricing(phase, assignments);
  const completed = isLeadCompleted(p);

  switch (tab) {
    case "all":
      return true;
    case "completed":
      return completed;
    case "not_assigned":
      return !completed && !hasAssign && isProjectActive(p);
    case "assigned":
      return !completed && !inFinal && assignments.some(isAssignmentWorking);
    case "takeoff_done":
      return (
        !completed &&
        !inFinal &&
        !legacyPricing &&
        assignments.some(isAssignmentTakeoffReady)
      );
    case "pricing":
      return (
        !completed &&
        !inFinal &&
        (assignments.some(isAssignmentPricingSent) || legacyPricing)
      );
    case "final_submission":
      return !completed && inFinal;
    default:
      return true;
  }
}

export type TechnicalWorkflowStatusKey =
  | TechnicalWorkflowTab
  | "completed"
  | "not_completed"
  | "in_progress";

/** Single status label shared by Admin Status column + Technical tabs. */
export function getTechnicalWorkflowStatus(p: {
  projectPhase?: string | null;
  technicalAssignments?: unknown;
  status?: string | null;
  projectDeadline?: string | null;
  projectWorkStatus?: string | null;
}): { key: TechnicalWorkflowStatusKey; label: string } {
  const phase = (p.projectPhase ?? "").toLowerCase();
  if (phase === "pricing_with_qa") return { key: "pricing", label: "Pricing · With QA" };
  if (phase === "pricing_without_qa") return { key: "pricing", label: "Pricing · Without QA" };
  if (phase === "pricing_quick_qa") return { key: "pricing", label: "Pricing · Quick QA" };

  const assignments = parseTechnicalAssignments(p.technicalAssignments);

  // Completed wins over Final Submission (Admin Mark as Completed)
  const workEarly = (p.projectWorkStatus ?? "").toLowerCase();
  if (workEarly === "completed" || (p.status ?? "").toLowerCase() === "completed") {
    return { key: "completed", label: "Completed" };
  }

  // Live furthest stage (Admin + All Projects)
  if (matchesTechnicalTab("final_submission", p)) {
    return { key: "final_submission", label: "Final Submission" };
  }
  if (matchesTechnicalTab("pricing", p)) {
    const priced = assignments.filter(isAssignmentPricingSent).length;
    const pending = assignments.filter(
      (a) => isAssignmentWorking(a) || isAssignmentTakeoffReady(a),
    ).length;
    if (priced > 0 && pending > 0) {
      return { key: "pricing", label: `Pricing · ${priced} sent` };
    }
    if (priced > 0) {
      return { key: "pricing", label: priced === 1 ? "Pricing · 1 sent" : `Pricing · ${priced} sent` };
    }
    return { key: "pricing", label: "Pricing" };
  }
  if (matchesTechnicalTab("takeoff_done", p)) {
    const ready = assignments.filter(isAssignmentTakeoffReady).length;
    const pending = assignments.filter(isAssignmentWorking).length;
    if (ready > 0 && pending > 0) {
      return { key: "takeoff_done", label: `Take Off Done · ${ready} ready` };
    }
    return { key: "takeoff_done", label: "Take Off Done" };
  }
  if (matchesTechnicalTab("assigned", p)) {
    return { key: "assigned", label: "Assigned" };
  }
  if (matchesTechnicalTab("not_assigned", p)) {
    return { key: "not_assigned", label: "Not Assigned" };
  }

  const work = (p.projectWorkStatus ?? "").toLowerCase();
  if (work === "completed" || (p.status ?? "").toLowerCase() === "completed") {
    return { key: "completed", label: "Completed" };
  }
  if (work === "not_completed" || work === "pending") return { key: "not_completed", label: "Pending" };
  if (work === "in_progress" || isProjectActive(p)) {
    return { key: "in_progress", label: "In Progress" };
  }
  return { key: "not_completed", label: "Pending" };
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
    id: String(o.id ?? `n-${index}`),
    text,
    createdAt: String(o.createdAt ?? ""),
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
  if (Array.isArray(raw)) {
    return { sir: parseNoteList(raw), estimator: [] };
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return { sir: [], estimator: [] };
    try {
      return parseTechnicalNotesBundle(JSON.parse(trimmed));
    } catch {
      return { sir: [], estimator: [] };
    }
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    return {
      sir: parseNoteList(o.sir ?? o.admin ?? o.adminThread),
      estimator: parseNoteList(o.estimator ?? o.estimatorThread),
    };
  }
  return { sir: [], estimator: [] };
}

/** Admin↔TM thread (Notes for Sir / Notes for Technical). */
export function parseTechnicalNotes(raw: unknown): TechnicalNoteEntry[] {
  return parseTechnicalNotesBundle(raw).sir;
}

/** TM↔Estimator thread (Notes for Estimator / Notes for Chief Estimator). */
export function parseEstimatorNotes(raw: unknown): TechnicalNoteEntry[] {
  return parseTechnicalNotesBundle(raw).estimator;
}

const TM_ROLES = new Set(["technical_manager", "admin", "manager"]);

/** Remarks the Chief Estimator left for this estimator on a project. */
export function chiefEstimatorRemarks(opts: {
  technicalNotes?: unknown;
  evaluationRemarks?: string | null;
  currentUserId?: string | null;
}): { evaluation: string; notes: TechnicalNoteEntry[] } {
  const evaluation = String(opts.evaluationRemarks ?? "").trim();
  const me = String(opts.currentUserId ?? "").trim();
  const notes = parseEstimatorNotes(opts.technicalNotes)
    .filter((n) => {
      const role = String(n.authorRole ?? "").toLowerCase();
      if (TM_ROLES.has(role)) return true;
      if (me && n.authorId && n.authorId !== me && !role) return true;
      return false;
    })
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  return { evaluation, notes };
}
