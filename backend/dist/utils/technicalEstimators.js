"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_COMPLETE_TIMER_SECONDS = void 0;
exports.syncPhaseFromAssignments = syncPhaseFromAssignments;
exports.listTechnicalEstimators = listTechnicalEstimators;
exports.getSeedTechnicalEstimators = getSeedTechnicalEstimators;
exports.parseTechnicalAssignments = parseTechnicalAssignments;
exports.normalizeTechnicalAssignmentsInput = normalizeTechnicalAssignmentsInput;
exports.serializeTechnicalAssignments = serializeTechnicalAssignments;
exports.assignmentBelongsToEstimator = assignmentBelongsToEstimator;
exports.pauseAssignmentTimer = pauseAssignmentTimer;
exports.startAssignmentTimer = startAssignmentTimer;
exports.assignmentElapsedSeconds = assignmentElapsedSeconds;
exports.canCompleteAfterTimer = canCompleteAfterTimer;
exports.isAssignmentTimerStale = isAssignmentTimerStale;
exports.pauseStaleTimersForEstimator = pauseStaleTimersForEstimator;
exports.pauseTimersOnLeadIds = pauseTimersOnLeadIds;
exports.pauseOtherRunningTimersForEstimator = pauseOtherRunningTimersForEstimator;
exports.mergeAssignmentProgress = mergeAssignmentProgress;
exports.applyTechnicalTabMove = applyTechnicalTabMove;
exports.parseTechnicalNotesBundle = parseTechnicalNotesBundle;
exports.parseTechnicalNotes = parseTechnicalNotes;
exports.serializeTechnicalNotesBundle = serializeTechnicalNotesBundle;
exports.serializeTechnicalNotes = serializeTechnicalNotes;
exports.appendTechnicalNote = appendTechnicalNote;
exports.updateTechnicalNote = updateTechnicalNote;
exports.deleteTechnicalNote = deleteTechnicalNote;
const db_1 = __importDefault(require("../config/db"));
const estTime_1 = require("./estTime");
/** Sync projectPhase from assignment complete / pricing flags. */
function syncPhaseFromAssignments(list, currentPhase) {
    const phase = (currentPhase ?? "not_started").toLowerCase();
    if (phase === "qa_phase" || phase === "delivery_phase") {
        return currentPhase ?? phase;
    }
    if (list.length === 0)
        return "not_started";
    const anyPricing = list.some((a) => a.pricingSent);
    if (anyPricing) {
        if (phase.startsWith("pricing_"))
            return currentPhase ?? "pricing_phase";
        return "pricing_phase";
    }
    const anyDone = list.some((a) => a.takeoffDone);
    if (anyDone)
        return "takeoff_completed";
    return "not_started";
}
function asStringList(raw) {
    if (Array.isArray(raw)) {
        return raw.map((x) => String(x ?? "").trim()).filter(Boolean);
    }
    if (typeof raw === "string" && raw.trim()) {
        return raw.split(/[,|;/]+/).map((s) => s.trim()).filter(Boolean);
    }
    return [];
}
const SEED_ESTIMATORS = [
    { id: "tech-1", name: "Noman Khan", code: "TECH-01" },
    { id: "tech-2", name: "Muhammad Abdullah", code: "TECH-02" },
    { id: "tech-3", name: "Rizwan Sabir", code: "TECH-03" },
    { id: "tech-4", name: "Usama Jameel", code: "TECH-04" },
    { id: "tech-5", name: "Khaldoon Abrar", code: "TECH-05" },
    { id: "tech-6", name: "Muhammad Zaid", code: "TECH-06" },
    { id: "tech-7", name: "Muhammad Bariq", code: "TECH-07" },
    { id: "tech-8", name: "Afaq", code: "TECH-08" },
];
/** Live estimator users from Admin Users (role=estimator). */
async function listTechnicalEstimators() {
    try {
        // Prefer active estimators; if none active, still return inactive so Miss can see roster.
        const users = await db_1.default.user.findMany({
            where: { role: "estimator" },
            select: { id: true, name: true, csrCode: true, isActive: true },
            orderBy: { name: "asc" },
        });
        const active = users.filter((u) => u.isActive !== false);
        const pool = active.length > 0 ? active : users;
        if (pool.length > 0) {
            return pool.map((u, i) => ({
                id: u.id,
                name: u.name,
                code: (u.csrCode ?? "").trim() || `EST-${String(i + 1).padStart(2, "0")}`,
            }));
        }
    }
    catch (err) {
        console.error("listTechnicalEstimators failed:", err);
    }
    return [];
}
function getSeedTechnicalEstimators() {
    return SEED_ESTIMATORS.map((e) => ({ ...e }));
}
function parseTechnicalAssignments(raw) {
    if (!raw)
        return [];
    let parsed = raw;
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (!trimmed)
            return [];
        try {
            parsed = JSON.parse(trimmed);
        }
        catch {
            return [];
        }
    }
    if (!Array.isArray(parsed))
        return [];
    const out = [];
    for (const item of parsed) {
        if (!item || typeof item !== "object")
            continue;
        const o = item;
        const estimatorId = String(o.estimatorId ?? "").trim();
        const estimatorName = String(o.estimatorName ?? "").trim();
        if (!estimatorId && !estimatorName)
            continue;
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
function normalizeTechnicalAssignmentsInput(raw) {
    if (raw === undefined)
        return undefined;
    const list = parseTechnicalAssignments(raw);
    return JSON.stringify(list);
}
function serializeTechnicalAssignments(list) {
    return JSON.stringify(list);
}
/** Match assignment to logged-in estimator by user id or name. */
function assignmentBelongsToEstimator(a, user) {
    if (a.estimatorId === user.id)
        return true;
    const an = a.estimatorName.trim().toLowerCase();
    const un = user.name.trim().toLowerCase();
    return !!an && !!un && an === un;
}
function pauseAssignmentTimer(a, now = Date.now()) {
    if (!a.timerStartedAt)
        return { ...a, timerStartedAt: null };
    const started = new Date(a.timerStartedAt).getTime();
    const add = Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : 0;
    return {
        ...a,
        timerSeconds: a.timerSeconds + add,
        timerStartedAt: null,
    };
}
function startAssignmentTimer(a, now = Date.now()) {
    if (a.takeoffDone)
        return a;
    if (a.timerStartedAt)
        return a;
    return { ...a, timerStartedAt: new Date(now).toISOString() };
}
function assignmentElapsedSeconds(a, now = Date.now()) {
    let total = a.timerSeconds;
    if (a.timerStartedAt) {
        const started = new Date(a.timerStartedAt).getTime();
        if (Number.isFinite(started))
            total += Math.max(0, Math.floor((now - started) / 1000));
    }
    return total;
}
/** Estimator Complete unlocks only after timer has run this long (seconds). */
exports.MIN_COMPLETE_TIMER_SECONDS = 30;
function canCompleteAfterTimer(elapsedSeconds) {
    return Math.max(0, Math.floor(elapsedSeconds)) >= exports.MIN_COMPLETE_TIMER_SECONDS;
}
/**
 * Running timer left overnight (or >12h continuous) must pause —
 * never auto-complete; estimator resumes next day from timerSeconds.
 */
function isAssignmentTimerStale(timerStartedAt, now = new Date()) {
    if (!timerStartedAt)
        return false;
    const started = new Date(timerStartedAt);
    if (Number.isNaN(started.getTime()))
        return false;
    if ((0, estTime_1.estDateYmd)(started) !== (0, estTime_1.estDateYmd)(now))
        return true;
    return now.getTime() - started.getTime() > 12 * 60 * 60 * 1000;
}
/** Pause stale running timers for this estimator (overnight leave → resume later). */
async function pauseStaleTimersForEstimator(user) {
    const raw = await db_1.default.lead.findMany({
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
            if (!assignmentBelongsToEstimator(a, user))
                return a;
            if (a.takeoffDone || !a.timerStartedAt)
                return a;
            if (!isAssignmentTimerStale(a.timerStartedAt, new Date(now)))
                return a;
            changed = true;
            paused += 1;
            return pauseAssignmentTimer(a, now);
        });
        if (!changed)
            continue;
        await db_1.default.lead.update({
            where: { id: lead.id },
            data: { technicalAssignments: serializeTechnicalAssignments(next) },
        });
    }
    return paused;
}
/** Pause running timers for this estimator on specific leads (fast path). */
async function pauseTimersOnLeadIds(user, leadIds) {
    const ids = [...new Set(leadIds.map(String).filter(Boolean))];
    if (ids.length === 0)
        return;
    const now = Date.now();
    const leads = await db_1.default.lead.findMany({
        where: { id: { in: ids } },
        select: { id: true, technicalAssignments: true },
    });
    for (const lead of leads) {
        const list = parseTechnicalAssignments(lead.technicalAssignments);
        let changed = false;
        const next = list.map((a) => {
            if (!assignmentBelongsToEstimator(a, user))
                return a;
            if (!a.timerStartedAt)
                return a;
            changed = true;
            return pauseAssignmentTimer(a, now);
        });
        if (!changed)
            continue;
        await db_1.default.lead.update({
            where: { id: lead.id },
            data: { technicalAssignments: serializeTechnicalAssignments(next) },
        });
    }
}
/** Pause any running timers for this estimator on other projects (one active timer). */
async function pauseOtherRunningTimersForEstimator(user, exceptLeadId) {
    const raw = await db_1.default.lead.findMany({
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
            if (!assignmentBelongsToEstimator(a, user))
                return a;
            if (!a.timerStartedAt)
                return a;
            changed = true;
            return pauseAssignmentTimer(a, now);
        });
        if (!changed)
            continue;
        await db_1.default.lead.update({
            where: { id: lead.id },
            data: { technicalAssignments: serializeTechnicalAssignments(next) },
        });
    }
}
/** Keep timer / complete flags when Miss re-assigns same estimator. */
function mergeAssignmentProgress(incoming, previous) {
    const sameList = (a, b) => JSON.stringify([...(a ?? [])].map((x) => x.trim()).filter(Boolean).sort()) ===
        JSON.stringify([...(b ?? [])].map((x) => x.trim()).filter(Boolean).sort());
    return incoming.map((a) => {
        const old = previous.find((p) => p.estimatorId === a.estimatorId ||
            (!!p.estimatorName &&
                !!a.estimatorName &&
                p.estimatorName.toLowerCase() === a.estimatorName.toLowerCase()));
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
        const detailsChanged = (old.manHours ?? "") !== (a.manHours ?? "") ||
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
function parseEvalMarks(raw) {
    if (raw == null || raw === "")
        return null;
    const n = Number(raw);
    if (!Number.isFinite(n))
        return null;
    return Math.max(0, Math.min(10, Math.round(n * 10) / 10));
}
/** Force assignment flags / phase so the project lands in a workflow tab. */
function applyTechnicalTabMove(previous, tab, currentPhase) {
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
function normalizeNoteEntry(item, index) {
    if (!item || typeof item !== "object")
        return null;
    const o = item;
    const text = String(o.text ?? "").trim();
    if (!text)
        return null;
    const entry = {
        id: String(o.id ?? `n-${Date.now()}-${index}`),
        text,
        createdAt: String(o.createdAt ?? new Date().toISOString()),
    };
    if (o.authorId)
        entry.authorId = String(o.authorId);
    if (o.authorRole)
        entry.authorRole = String(o.authorRole);
    if (o.authorName)
        entry.authorName = String(o.authorName);
    return entry;
}
function parseNoteList(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (let i = 0; i < raw.length; i += 1) {
        const entry = normalizeNoteEntry(raw[i], i);
        if (entry)
            out.push(entry);
    }
    return out;
}
/** Supports legacy array (sir-only) and `{ sir, estimator }` bundle. */
function parseTechnicalNotesBundle(raw) {
    if (!raw)
        return { sir: [], estimator: [] };
    let parsed = raw;
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (!trimmed)
            return { sir: [], estimator: [] };
        try {
            parsed = JSON.parse(trimmed);
        }
        catch {
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
        const o = parsed;
        return {
            sir: parseNoteList(o.sir ?? o.admin ?? o.adminThread),
            estimator: parseNoteList(o.estimator ?? o.estimatorThread),
        };
    }
    return { sir: [], estimator: [] };
}
/** Legacy helper — returns Admin↔TM (sir) thread only. */
function parseTechnicalNotes(raw) {
    return parseTechnicalNotesBundle(raw).sir;
}
function serializeTechnicalNotesBundle(bundle) {
    return JSON.stringify({
        sir: bundle.sir,
        estimator: bundle.estimator,
    });
}
/** @deprecated Prefer serializeTechnicalNotesBundle — this only serializes a flat sir list. */
function serializeTechnicalNotes(list) {
    return serializeTechnicalNotesBundle({ sir: list, estimator: [] });
}
function appendTechnicalNote(raw, text, thread = "sir", meta) {
    const bundle = parseTechnicalNotesBundle(raw);
    const note = {
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
function findNoteThread(bundle, noteId) {
    if (bundle.sir.some((n) => n.id === noteId))
        return "sir";
    if (bundle.estimator.some((n) => n.id === noteId))
        return "estimator";
    return null;
}
function rolesCompatible(noteRole, actorRole) {
    if (!noteRole || !actorRole)
        return false;
    const adminish = (r) => r === "admin" || r === "manager";
    if (adminish(noteRole) && adminish(actorRole))
        return true;
    return noteRole === actorRole;
}
function canMutateTechnicalNote(existing, actorId, actorRole, opts) {
    if (opts?.adminForce)
        return true;
    if (existing.authorId)
        return existing.authorId === actorId;
    if (existing.authorRole)
        return rolesCompatible(existing.authorRole, actorRole);
    // Legacy notes with no author meta — allow signed-in actor
    return !!actorId;
}
/** Update own note only (authorId / authorRole must match unless adminForce). */
function updateTechnicalNote(raw, noteId, text, actorId, opts) {
    const bundle = parseTechnicalNotesBundle(raw);
    const thread = findNoteThread(bundle, noteId);
    if (!thread)
        return { error: "Note not found" };
    const idx = bundle[thread].findIndex((n) => n.id === noteId);
    if (idx < 0)
        return { error: "Note not found" };
    const existing = bundle[thread][idx];
    if (!canMutateTechnicalNote(existing, actorId, opts?.actorRole, opts)) {
        return { error: "Only the author can edit this note" };
    }
    const note = {
        ...existing,
        text: text.trim(),
        createdAt: new Date().toISOString(),
    };
    bundle[thread] = [...bundle[thread]];
    bundle[thread][idx] = note;
    return { bundle, note, thread };
}
/** Delete own note only (authorId / authorRole must match unless adminForce). */
function deleteTechnicalNote(raw, noteId, actorId, opts) {
    const bundle = parseTechnicalNotesBundle(raw);
    const thread = findNoteThread(bundle, noteId);
    if (!thread)
        return { error: "Note not found" };
    const existing = bundle[thread].find((n) => n.id === noteId);
    if (!existing)
        return { error: "Note not found" };
    if (!canMutateTechnicalNote(existing, actorId, opts?.actorRole, opts)) {
        return { error: "Only the author can delete this note" };
    }
    bundle[thread] = bundle[thread].filter((n) => n.id !== noteId);
    return { bundle, thread };
}
