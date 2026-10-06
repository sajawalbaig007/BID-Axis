import prisma from "../config/db";

export type TechnicalNotificationSource = "admin" | "estimator" | "system" | "tm_estimator";

export type PushTechnicalNotificationInput = {
  leadId: string;
  projectTitle?: string | null;
  projectCode?: string | null;
  source: TechnicalNotificationSource;
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  title: string;
  message: string;
  changes?: string[];
  recipientId?: string | null;
  desk?: string | null;
};

const WATCH_FIELDS: Array<{ key: string; label: string }> = [
  { key: "projectPhase", label: "Phase / status" },
  { key: "projectWorkStatus", label: "Work status" },
  { key: "status", label: "Lead status" },
  { key: "projectDeadline", label: "Project deadline" },
  { key: "deadlineTiming", label: "Morning / COB timing" },
  { key: "projectTitle", label: "Project title" },
  { key: "projectCode", label: "Project code" },
  { key: "projectScope", label: "Scope" },
  { key: "projectNotes", label: "Bid instruction" },
  { key: "takeoffDeadline", label: "Takeoff deadline" },
  { key: "pricingDeadline", label: "Pricing deadline" },
  { key: "qaDeadline", label: "QA deadline" },
  { key: "interestedService", label: "Service / trade" },
  { key: "technicalAssignments", label: "Estimator assignments" },
];

function normalizeComparable(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Diff watched project fields for TM alert copy. */
export function diffProjectChangesForTm(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): string[] {
  if (!before || !after) return [];
  const changes: string[] = [];
  for (const { key, label } of WATCH_FIELDS) {
    if (!(key in after)) continue;
    const a = normalizeComparable(before[key]);
    const b = normalizeComparable(after[key]);
    if (a !== b) changes.push(label);
  }
  return changes;
}

export async function pushTechnicalNotification(
  input: PushTechnicalNotificationInput,
): Promise<void> {
  try {
    const changes = (input.changes ?? []).map((c) => c.trim()).filter(Boolean);
    await prisma.technicalNotification.create({
      data: {
        leadId: input.leadId,
        projectTitle: (input.projectTitle ?? "").trim() || null,
        projectCode: (input.projectCode ?? "").trim() || null,
        source: input.source,
        actorId: input.actorId ?? null,
        actorName: (input.actorName ?? "").trim() || null,
        actorRole: (input.actorRole ?? "").trim() || null,
        title: input.title.trim().slice(0, 160),
        message: input.message.trim().slice(0, 800),
        changeSummary: changes.length ? JSON.stringify(changes) : null,
        recipientId: (input.recipientId ?? "").trim() || null,
        desk: input.desk === "bim" ? "bim" : null,
      },
    });
  } catch (err) {
    console.error("pushTechnicalNotification failed:", err);
  }
}

export async function notifyTmFromActor(opts: {
  actorId?: string | null;
  leadId: string;
  projectTitle?: string | null;
  projectCode?: string | null;
  source: TechnicalNotificationSource;
  title: string;
  message: string;
  changes?: string[];
}): Promise<void> {
  let actorName: string | null = null;
  let actorRole: string | null = null;
  if (opts.actorId) {
    try {
      const u = await prisma.user.findUnique({
        where: { id: opts.actorId },
        select: { name: true, role: true },
      });
      actorName = u?.name ?? null;
      actorRole = u?.role ?? null;
    } catch {
      /* ignore */
    }
  }

  if (actorRole === "technical_manager" || actorRole === "bim_manager") return;

  let desk: string | null = null;
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: opts.leadId },
      select: { projectDesk: true },
    });
    desk = lead?.projectDesk === "bim" ? "bim" : null;
  } catch {
    desk = null;
  }

  await pushTechnicalNotification({
    leadId: opts.leadId,
    projectTitle: opts.projectTitle,
    projectCode: opts.projectCode,
    source: opts.source,
    actorId: opts.actorId ?? null,
    actorName,
    actorRole,
    title: opts.title,
    message: opts.message,
    changes: opts.changes,
    desk,
  });
}

export function parseChangeSummary(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return raw.trim() ? [raw.trim()] : [];
    }
  }
  return [];
}

export function projectLabel(code?: string | null, title?: string | null): string {
  const c = (code ?? "").trim();
  const t = (title ?? "").trim();
  if (c && t) return `${c} — ${t}`;
  return t || c || "Project";
}
