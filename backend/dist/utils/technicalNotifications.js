"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.diffProjectChangesForTm = diffProjectChangesForTm;
exports.pushTechnicalNotification = pushTechnicalNotification;
exports.notifyTmFromActor = notifyTmFromActor;
exports.parseChangeSummary = parseChangeSummary;
exports.projectLabel = projectLabel;
const db_1 = __importDefault(require("../config/db"));
const WATCH_FIELDS = [
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
function normalizeComparable(value) {
    if (value == null)
        return "";
    if (typeof value === "string")
        return value.trim();
    if (typeof value === "number" || typeof value === "boolean")
        return String(value);
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
/** Diff watched project fields for TM alert copy. */
function diffProjectChangesForTm(before, after) {
    if (!before || !after)
        return [];
    const changes = [];
    for (const { key, label } of WATCH_FIELDS) {
        if (!(key in after))
            continue;
        const a = normalizeComparable(before[key]);
        const b = normalizeComparable(after[key]);
        if (a !== b)
            changes.push(label);
    }
    return changes;
}
async function pushTechnicalNotification(input) {
    try {
        const changes = (input.changes ?? []).map((c) => c.trim()).filter(Boolean);
        await db_1.default.technicalNotification.create({
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
            },
        });
    }
    catch (err) {
        console.error("pushTechnicalNotification failed:", err);
    }
}
async function notifyTmFromActor(opts) {
    let actorName = null;
    let actorRole = null;
    if (opts.actorId) {
        try {
            const u = await db_1.default.user.findUnique({
                where: { id: opts.actorId },
                select: { name: true, role: true },
            });
            actorName = u?.name ?? null;
            actorRole = u?.role ?? null;
        }
        catch {
            /* ignore */
        }
    }
    // TM should not get alerts for their own edits
    if (actorRole === "technical_manager")
        return;
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
    });
}
function parseChangeSummary(raw) {
    if (!raw)
        return [];
    if (Array.isArray(raw))
        return raw.map(String).filter(Boolean);
    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed))
                return parsed.map(String).filter(Boolean);
        }
        catch {
            return raw.trim() ? [raw.trim()] : [];
        }
    }
    return [];
}
function projectLabel(code, title) {
    const c = (code ?? "").trim();
    const t = (title ?? "").trim();
    if (c && t)
        return `${c} — ${t}`;
    return t || c || "Project";
}
