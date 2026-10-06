"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const db_1 = __importDefault(require("../config/db"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const role_middleware_1 = require("../middleware/role.middleware");
const projectLeads_1 = require("../utils/projectLeads");
const technicalEstimators_1 = require("../utils/technicalEstimators");
const cache_1 = require("../utils/cache");
const technicalNotifications_1 = require("../utils/technicalNotifications");
const csrSessionTracking_1 = require("../utils/csrSessionTracking");
const previousMonthRatings_1 = require("../utils/previousMonthRatings");
const requestMeta_1 = require("../utils/requestMeta");
const estTime_1 = require("../utils/estTime");
const router = express_1.default.Router();
router.use(auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("estimator"));
async function currentEstimator(req) {
    const user = await db_1.default.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, name: true },
    });
    return user;
}
function projectInclude() {
    return {
        csr: { select: { id: true, name: true, email: true, csrCode: true } },
        uploadFile: { select: { companyName: true } },
        notes: { orderBy: { createdAt: "asc" }, take: 20 },
    };
}
function withMyAssignment(lead, me) {
    const all = (0, technicalEstimators_1.parseTechnicalAssignments)(lead.technicalAssignments);
    const mineAsg = all.find((a) => (0, technicalEstimators_1.assignmentBelongsToEstimator)(a, me));
    return { ...lead, myAssignment: mineAsg, technicalAssignments: (0, technicalEstimators_1.serializeTechnicalAssignments)(all) };
}
/* ================= GET ONE ASSIGNED PROJECT ================= */
router.get("/lead/:id", async (req, res) => {
    try {
        const me = await currentEstimator(req);
        if (!me)
            return res.status(401).json({ success: false, message: "Unauthorized" });
        const leadId = String(req.params.id);
        const lead = await db_1.default.lead.findUnique({
            where: { id: leadId },
            include: { notes: { orderBy: { createdAt: "asc" }, take: 50 } },
        });
        if (!lead)
            return res.status(404).json({ success: false, message: "Project not found" });
        const mine = (0, technicalEstimators_1.parseTechnicalAssignments)(lead.technicalAssignments).some((a) => (0, technicalEstimators_1.assignmentBelongsToEstimator)(a, me));
        if (!mine) {
            return res.status(403).json({ success: false, message: "This project is not assigned to you" });
        }
        return res.json({ success: true, lead: withMyAssignment(lead, me) });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to fetch project" });
    }
});
router.get("/projects", async (req, res) => {
    try {
        const me = await currentEstimator(req);
        if (!me)
            return res.status(401).json({ success: false, message: "Unauthorized" });
        /* Overnight / forgotten Start → Pause (keep timerSeconds); never auto-Complete */
        await (0, technicalEstimators_1.pauseStaleTimersForEstimator)(me);
        const raw = await db_1.default.lead.findMany({
            where: {
                ...(0, projectLeads_1.buildProjectLeadWhere)(),
                technicalAssignments: { not: null },
            },
            include: projectInclude(),
            orderBy: { updatedAt: "desc" },
            take: 200,
        });
        const leads = raw
            .filter(projectLeads_1.isDisplayableProjectLead)
            .filter((lead) => lead.hiddenOnTechnical !== true)
            .map((lead) => {
            const all = (0, technicalEstimators_1.parseTechnicalAssignments)(lead.technicalAssignments);
            const mine = all.filter((a) => (0, technicalEstimators_1.assignmentBelongsToEstimator)(a, me));
            if (mine.length === 0)
                return null;
            return {
                ...lead,
                myAssignment: mine[0],
                technicalAssignments: (0, technicalEstimators_1.serializeTechnicalAssignments)(all),
            };
        })
            .filter(Boolean);
        const typed = leads;
        const stats = {
            total: typed.length,
            takeoffDone: typed.filter((l) => l.myAssignment?.takeoffDone).length,
            pending: typed.filter((l) => !l.myAssignment?.takeoffDone).length,
        };
        return res.json({ success: true, leads, stats });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to fetch projects" });
    }
});
router.get("/dashboard", async (req, res) => {
    try {
        const me = await currentEstimator(req);
        if (!me)
            return res.status(401).json({ success: false, message: "Unauthorized" });
        await (0, technicalEstimators_1.pauseStaleTimersForEstimator)(me);
        const raw = await db_1.default.lead.findMany({
            where: {
                ...(0, projectLeads_1.buildProjectLeadWhere)(),
                technicalAssignments: { not: null },
            },
            select: {
                id: true,
                projectTitle: true,
                projectCode: true,
                projectDeadline: true,
                projectPhase: true,
                technicalAssignments: true,
                technicalNotes: true,
                updatedAt: true,
                hiddenOnTechnical: true,
            },
            orderBy: { updatedAt: "desc" },
            take: 200,
        });
        const mine = raw
            .filter((lead) => lead.hiddenOnTechnical !== true)
            .map((lead) => {
            const all = (0, technicalEstimators_1.parseTechnicalAssignments)(lead.technicalAssignments);
            const a = all.find((x) => (0, technicalEstimators_1.assignmentBelongsToEstimator)(x, me));
            if (!a)
                return null;
            return { ...lead, myAssignment: a };
        })
            .filter(Boolean);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const overdue = mine.filter((p) => {
            if (p.myAssignment.takeoffDone)
                return false;
            const d = p.myAssignment.deadline || p.projectDeadline;
            if (!d)
                return false;
            const dt = new Date(d);
            if (Number.isNaN(dt.getTime()))
                return false;
            return dt < today;
        });
        return res.json({
            success: true,
            stats: {
                total: mine.length,
                pending: mine.filter((p) => !p.myAssignment.takeoffDone).length,
                takeoffDone: mine.filter((p) => p.myAssignment.takeoffDone).length,
                overdue: overdue.length,
            },
            recent: mine.slice(0, 8),
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to load dashboard" });
    }
});
router.get("/previous-month-rating", async (req, res) => {
    try {
        const me = await currentEstimator(req);
        if (!me)
            return res.status(401).json({ success: false, message: "Unauthorized" });
        const payload = await (0, previousMonthRatings_1.buildPreviousMonthRatings)();
        const rating = payload.ratings.find((r) => r.estimatorId === me.id) ??
            payload.ratings.find((r) => r.name.trim().toLowerCase() === me.name.trim().toLowerCase()) ??
            null;
        return res.json({
            success: true,
            month: payload.month,
            monthLabel: payload.monthLabel,
            rating,
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to load previous month rating" });
    }
});
/* ================= TIMER: start | pause ================= */
router.put("/project/:id/timer", async (req, res) => {
    try {
        const me = await currentEstimator(req);
        if (!me)
            return res.status(401).json({ success: false, message: "Unauthorized" });
        const leadId = String(req.params.id);
        const action = String(req.body?.action ?? "").toLowerCase();
        if (action !== "start" && action !== "pause") {
            return res.status(400).json({ success: false, message: "action must be start or pause" });
        }
        const existing = await db_1.default.lead.findUnique({
            where: { id: leadId },
            select: { technicalAssignments: true, assignedTo: true },
        });
        if (!existing)
            return res.status(404).json({ success: false, message: "Project not found" });
        const list = (0, technicalEstimators_1.parseTechnicalAssignments)(existing.technicalAssignments);
        const idx = list.findIndex((a) => (0, technicalEstimators_1.assignmentBelongsToEstimator)(a, me));
        if (idx < 0) {
            return res.status(403).json({ success: false, message: "This project is not assigned to you" });
        }
        const current = list[idx];
        if (current.takeoffDone) {
            return res.status(400).json({
                success: false,
                message: "Completed tasks are locked. Ask Chief Estimator to set pending if needed.",
            });
        }
        if (action === "start") {
            const pauseIds = Array.isArray(req.body?.pauseProjectIds)
                ? req.body.pauseProjectIds.map((x) => String(x)).filter((id) => id && id !== leadId)
                : [];
            if (pauseIds.length > 0) {
                await (0, technicalEstimators_1.pauseTimersOnLeadIds)(me, pauseIds);
            }
            else {
                await (0, technicalEstimators_1.pauseOtherRunningTimersForEstimator)(me, leadId);
            }
            list[idx] = (0, technicalEstimators_1.startAssignmentTimer)(current);
        }
        else {
            const clientElapsed = Number(req.body?.clientElapsedSeconds);
            if (Number.isFinite(clientElapsed) && clientElapsed >= 0) {
                list[idx] = {
                    ...current,
                    timerSeconds: Math.max(current.timerSeconds, Math.floor(clientElapsed)),
                    timerStartedAt: null,
                };
            }
            else {
                list[idx] = (0, technicalEstimators_1.pauseAssignmentTimer)(current);
            }
        }
        const lead = await db_1.default.lead.update({
            where: { id: leadId },
            data: { technicalAssignments: (0, technicalEstimators_1.serializeTechnicalAssignments)(list) },
            include: projectInclude(),
        });
        (0, cache_1.invalidatePattern)("admin:projects:");
        (0, cache_1.invalidateCache)(`csr:projects:${lead.assignedTo}`);
        return res.json({ success: true, lead: withMyAssignment(lead, me) });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to update timer" });
    }
});
/* ================= COMPLETE TASK (estimator can only complete, not reopen) ================= */
router.put("/project/:id/complete", async (req, res) => {
    try {
        const me = await currentEstimator(req);
        if (!me)
            return res.status(401).json({ success: false, message: "Unauthorized" });
        const leadId = String(req.params.id);
        const existing = await db_1.default.lead.findUnique({
            where: { id: leadId },
            select: {
                technicalAssignments: true,
                assignedTo: true,
                projectPhase: true,
                projectTitle: true,
                projectCode: true,
                clientCode: true,
            },
        });
        if (!existing)
            return res.status(404).json({ success: false, message: "Project not found" });
        const list = (0, technicalEstimators_1.parseTechnicalAssignments)(existing.technicalAssignments);
        const idx = list.findIndex((a) => (0, technicalEstimators_1.assignmentBelongsToEstimator)(a, me));
        if (idx < 0) {
            return res.status(403).json({ success: false, message: "This project is not assigned to you" });
        }
        if (list[idx].takeoffDone) {
            return res.status(400).json({ success: false, message: "Task is already completed" });
        }
        const clientElapsed = Number(req.body?.clientElapsedSeconds);
        const serverElapsed = (0, technicalEstimators_1.assignmentElapsedSeconds)(list[idx]);
        const elapsed = Number.isFinite(clientElapsed) && clientElapsed >= 0
            ? Math.max(serverElapsed, Math.floor(clientElapsed))
            : serverElapsed;
        if (!(0, technicalEstimators_1.canCompleteAfterTimer)(elapsed)) {
            const left = Math.max(0, technicalEstimators_1.MIN_COMPLETE_TIMER_SECONDS - elapsed);
            return res.status(400).json({
                success: false,
                message: `Start the timer and wait ${left || technicalEstimators_1.MIN_COMPLETE_TIMER_SECONDS}s before Complete.`,
            });
        }
        const paused = Number.isFinite(clientElapsed) && clientElapsed >= 0
            ? {
                ...list[idx],
                timerSeconds: Math.max(list[idx].timerSeconds, Math.floor(clientElapsed)),
                timerStartedAt: null,
            }
            : (0, technicalEstimators_1.pauseAssignmentTimer)(list[idx]);
        list[idx] = { ...paused, takeoffDone: true, pricingSent: false };
        const nextPhase = (0, technicalEstimators_1.syncPhaseFromAssignments)(list, existing.projectPhase);
        const lead = await db_1.default.lead.update({
            where: { id: leadId },
            data: {
                technicalAssignments: (0, technicalEstimators_1.serializeTechnicalAssignments)(list),
                projectPhase: nextPhase,
            },
            include: projectInclude(),
        });
        (0, cache_1.invalidatePattern)("admin:projects:");
        (0, cache_1.invalidateCache)(`csr:projects:${lead.assignedTo}`);
        const label = (0, technicalNotifications_1.projectLabel)(lead.projectCode || lead.clientCode, lead.projectTitle);
        void (0, technicalNotifications_1.notifyTmFromActor)({
            actorId: me.id,
            leadId: lead.id,
            projectTitle: lead.projectTitle,
            projectCode: lead.projectCode || lead.clientCode,
            source: "estimator",
            title: "Takeoff completed",
            message: `${me.name} marked takeoff done on ${label}`,
            changes: ["Takeoff completed", nextPhase !== existing.projectPhase ? `Phase → ${nextPhase}` : ""].filter(Boolean),
        });
        return res.json({ success: true, lead: withMyAssignment(lead, me) });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to complete task" });
    }
});
/* Legacy takeoff endpoint — estimator may only mark complete, never reopen */
router.put("/project/:id/takeoff", async (req, res) => {
    try {
        const me = await currentEstimator(req);
        if (!me)
            return res.status(401).json({ success: false, message: "Unauthorized" });
        const takeoffDone = req.body?.takeoffDone === true;
        if (!takeoffDone) {
            return res.status(403).json({
                success: false,
                message: "Only Chief Estimator can set a completed task back to pending.",
            });
        }
        const leadId = String(req.params.id);
        const existing = await db_1.default.lead.findUnique({
            where: { id: leadId },
            select: {
                technicalAssignments: true,
                assignedTo: true,
                projectPhase: true,
                projectTitle: true,
                projectCode: true,
                clientCode: true,
            },
        });
        if (!existing)
            return res.status(404).json({ success: false, message: "Project not found" });
        const list = (0, technicalEstimators_1.parseTechnicalAssignments)(existing.technicalAssignments);
        const idx = list.findIndex((a) => (0, technicalEstimators_1.assignmentBelongsToEstimator)(a, me));
        if (idx < 0) {
            return res.status(403).json({ success: false, message: "This project is not assigned to you" });
        }
        const elapsed = (0, technicalEstimators_1.assignmentElapsedSeconds)(list[idx]);
        if (!(0, technicalEstimators_1.canCompleteAfterTimer)(elapsed)) {
            const left = Math.max(0, technicalEstimators_1.MIN_COMPLETE_TIMER_SECONDS - elapsed);
            return res.status(400).json({
                success: false,
                message: `Start the timer and wait ${left || technicalEstimators_1.MIN_COMPLETE_TIMER_SECONDS}s before Complete.`,
            });
        }
        list[idx] = { ...(0, technicalEstimators_1.pauseAssignmentTimer)(list[idx]), takeoffDone: true, pricingSent: false };
        const nextPhase = (0, technicalEstimators_1.syncPhaseFromAssignments)(list, existing.projectPhase);
        const lead = await db_1.default.lead.update({
            where: { id: leadId },
            data: {
                technicalAssignments: (0, technicalEstimators_1.serializeTechnicalAssignments)(list),
                projectPhase: nextPhase,
            },
            include: projectInclude(),
        });
        (0, cache_1.invalidatePattern)("admin:projects:");
        (0, cache_1.invalidateCache)(`csr:projects:${lead.assignedTo}`);
        const label = (0, technicalNotifications_1.projectLabel)(lead.projectCode || lead.clientCode, lead.projectTitle);
        void (0, technicalNotifications_1.notifyTmFromActor)({
            actorId: me.id,
            leadId: lead.id,
            projectTitle: lead.projectTitle,
            projectCode: lead.projectCode || lead.clientCode,
            source: "estimator",
            title: "Takeoff completed",
            message: `${me.name} marked takeoff done on ${label}`,
            changes: ["Takeoff completed"],
        });
        return res.json({ success: true, lead: withMyAssignment(lead, me) });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to update takeoff" });
    }
});
router.post("/lead/:id/notes", async (req, res) => {
    try {
        const me = await currentEstimator(req);
        if (!me)
            return res.status(401).json({ success: false, message: "Unauthorized" });
        const leadId = String(req.params.id);
        const text = String(req.body?.text ?? "").trim();
        if (!text)
            return res.status(400).json({ success: false, message: "Note text is required" });
        const existing = await db_1.default.lead.findUnique({
            where: { id: leadId },
            select: {
                technicalAssignments: true,
                technicalNotes: true,
                projectTitle: true,
                projectCode: true,
                clientCode: true,
            },
        });
        if (!existing)
            return res.status(404).json({ success: false, message: "Project not found" });
        const allowed = (0, technicalEstimators_1.parseTechnicalAssignments)(existing.technicalAssignments).some((a) => (0, technicalEstimators_1.assignmentBelongsToEstimator)(a, me));
        if (!allowed) {
            return res.status(403).json({ success: false, message: "This project is not assigned to you" });
        }
        const { bundle, note, list } = (0, technicalEstimators_1.appendTechnicalNote)(existing.technicalNotes, text, "estimator", { authorId: me.id, authorRole: "estimator", authorName: me.name });
        await db_1.default.lead.update({
            where: { id: leadId },
            data: { technicalNotes: (0, technicalEstimators_1.serializeTechnicalNotesBundle)(bundle) },
        });
        const label = (0, technicalNotifications_1.projectLabel)(existing.projectCode || existing.clientCode, existing.projectTitle);
        void (0, technicalNotifications_1.notifyTmFromActor)({
            actorId: me.id,
            leadId,
            projectTitle: existing.projectTitle,
            projectCode: existing.projectCode || existing.clientCode,
            source: "estimator",
            title: "Estimator note",
            message: `${me.name} on ${label}: ${text.slice(0, 160)}`,
            changes: ["Notes for Chief Estimator"],
        });
        return res.json({
            success: true,
            note,
            thread: "estimator",
            technicalNotes: list,
            technicalNotesBundle: bundle,
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to add note" });
    }
});
router.put("/lead/:id/notes/:noteId", async (req, res) => {
    try {
        const me = await currentEstimator(req);
        if (!me)
            return res.status(401).json({ success: false, message: "Unauthorized" });
        const leadId = String(req.params.id);
        const noteId = String(req.params.noteId);
        const text = String(req.body?.text ?? "").trim();
        if (!text)
            return res.status(400).json({ success: false, message: "Note text is required" });
        const existing = await db_1.default.lead.findUnique({
            where: { id: leadId },
            select: { technicalAssignments: true, technicalNotes: true },
        });
        if (!existing)
            return res.status(404).json({ success: false, message: "Project not found" });
        const allowed = (0, technicalEstimators_1.parseTechnicalAssignments)(existing.technicalAssignments).some((a) => (0, technicalEstimators_1.assignmentBelongsToEstimator)(a, me));
        if (!allowed) {
            return res.status(403).json({ success: false, message: "This project is not assigned to you" });
        }
        const result = (0, technicalEstimators_1.updateTechnicalNote)(existing.technicalNotes, noteId, text, me.id, {
            actorRole: "estimator",
        });
        if ("error" in result) {
            const status = result.error.includes("author") ? 403 : 404;
            return res.status(status).json({ success: false, message: result.error });
        }
        if (result.thread !== "estimator") {
            return res.status(403).json({ success: false, message: "Cannot edit this note thread" });
        }
        await db_1.default.lead.update({
            where: { id: leadId },
            data: { technicalNotes: (0, technicalEstimators_1.serializeTechnicalNotesBundle)(result.bundle) },
        });
        return res.json({ success: true, note: result.note, technicalNotesBundle: result.bundle });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to update note" });
    }
});
router.delete("/lead/:id/notes/:noteId", async (req, res) => {
    try {
        const me = await currentEstimator(req);
        if (!me)
            return res.status(401).json({ success: false, message: "Unauthorized" });
        const leadId = String(req.params.id);
        const noteId = String(req.params.noteId);
        const existing = await db_1.default.lead.findUnique({
            where: { id: leadId },
            select: { technicalAssignments: true, technicalNotes: true },
        });
        if (!existing)
            return res.status(404).json({ success: false, message: "Project not found" });
        const allowed = (0, technicalEstimators_1.parseTechnicalAssignments)(existing.technicalAssignments).some((a) => (0, technicalEstimators_1.assignmentBelongsToEstimator)(a, me));
        if (!allowed) {
            return res.status(403).json({ success: false, message: "This project is not assigned to you" });
        }
        const result = (0, technicalEstimators_1.deleteTechnicalNote)(existing.technicalNotes, noteId, me.id, {
            actorRole: "estimator",
        });
        if ("error" in result) {
            const status = result.error.includes("author") ? 403 : 404;
            return res.status(status).json({ success: false, message: result.error });
        }
        if (result.thread !== "estimator") {
            return res.status(403).json({ success: false, message: "Cannot delete this note thread" });
        }
        await db_1.default.lead.update({
            where: { id: leadId },
            data: { technicalNotes: (0, technicalEstimators_1.serializeTechnicalNotesBundle)(result.bundle) },
        });
        return res.json({ success: true, technicalNotesBundle: result.bundle });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to delete note" });
    }
});
/** TM → Estimator note alerts (source tm_estimator), scoped to assigned projects. */
router.get("/notifications", async (req, res) => {
    try {
        const me = await currentEstimator(req);
        if (!me)
            return res.status(401).json({ success: false, message: "Unauthorized" });
        const leads = await db_1.default.lead.findMany({
            where: (0, projectLeads_1.buildProjectLeadWhere)(),
            select: { id: true, technicalAssignments: true },
            take: 500,
        });
        const myLeadIds = leads
            .filter((l) => (0, technicalEstimators_1.parseTechnicalAssignments)(l.technicalAssignments).some((a) => (0, technicalEstimators_1.assignmentBelongsToEstimator)(a, me)))
            .map((l) => l.id);
        if (myLeadIds.length === 0) {
            return res.json({ success: true, notifications: [], unreadCount: 0 });
        }
        const rows = await db_1.default.technicalNotification.findMany({
            where: {
                source: "tm_estimator",
                leadId: { in: myLeadIds },
            },
            orderBy: { createdAt: "desc" },
            take: 40,
        });
        const notifications = rows.map((n) => ({
            id: n.id,
            leadId: n.leadId,
            projectTitle: n.projectTitle,
            projectCode: n.projectCode,
            title: n.title,
            message: n.message,
            actorName: n.actorName,
            createdAt: n.createdAt.toISOString(),
            readAt: n.readAt?.toISOString() ?? null,
        }));
        const unreadCount = notifications.filter((n) => !n.readAt).length;
        return res.json({ success: true, notifications, unreadCount });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to load notifications" });
    }
});
router.put("/notifications/:id/read", async (req, res) => {
    try {
        const me = await currentEstimator(req);
        if (!me)
            return res.status(401).json({ success: false, message: "Unauthorized" });
        const id = String(req.params.id);
        await db_1.default.technicalNotification.updateMany({
            where: { id, source: "tm_estimator" },
            data: { readAt: new Date() },
        });
        return res.json({ success: true });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to mark read" });
    }
});
/* ================= CHECK IN / CHECK OUT (same CsrWorkSession ledger) ================= */
router.get("/work-session", async (req, res) => {
    try {
        const status = await (0, csrSessionTracking_1.getCsrWorkSessionStatus)(req.user.id);
        return res.json({ success: true, ...status });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to load work session." });
    }
});
router.post("/check-in", async (req, res) => {
    try {
        const result = await (0, csrSessionTracking_1.checkInCsrWorkSession)({
            userId: req.user.id,
            ip: (0, requestMeta_1.getClientIp)(req),
            userAgent: (0, requestMeta_1.getUserAgent)(req),
            deviceId: req.body?.tabId ?? req.body?.deviceId,
        });
        let status = await (0, csrSessionTracking_1.getCsrWorkSessionStatus)(req.user.id);
        if (!status.checkedIn) {
            status = {
                checkedIn: true,
                paused: false,
                session: {
                    id: result.sessionId,
                    checkInAt: result.loginAt.toISOString(),
                    checkInAtEst: (0, estTime_1.formatEstDateTime)(result.loginAt),
                    paused: false,
                    pausedAt: null,
                    dashboardMs: 0,
                    awayMs: 0,
                    pausedMs: 0,
                    totalMs: 0,
                    dashboardDuration: "0s",
                    awayDuration: "0s",
                    pausedDuration: "0s",
                    totalDuration: "0s",
                },
            };
        }
        return res.json({
            success: true,
            created: result.created,
            message: result.created ? "Checked in successfully." : "Already checked in.",
            ...status,
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Check-in failed." });
    }
});
router.post("/check-out", async (req, res) => {
    try {
        const me = await currentEstimator(req);
        /* Leaving for the day: pause project timers so tomorrow resumes from same time */
        if (me) {
            await (0, technicalEstimators_1.pauseOtherRunningTimersForEstimator)(me);
        }
        const closed = await (0, csrSessionTracking_1.checkOutCsrWorkSession)(req.user.id);
        return res.json({
            success: true,
            closed,
            checkedIn: false,
            session: null,
            message: closed
                ? "Checked out — project timers paused. Resume tomorrow from the same time."
                : "No active check-in.",
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Check-out failed." });
    }
});
router.post("/heartbeat", async (req, res) => {
    try {
        const userId = req.user.id;
        const tabVisible = req.body?.tabVisible !== false;
        const tabId = req.body?.tabId ?? "unknown";
        await db_1.default.user.update({
            where: { id: userId },
            data: tabVisible
                ? { isOnline: true, lastActive: new Date() }
                : { isOnline: false },
        }).catch(() => { });
        void (0, csrSessionTracking_1.tickCsrWorkSession)({ userId, tabVisible, deviceId: String(tabId) });
        return res.json({ success: true });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false });
    }
});
router.post("/offline", async (req, res) => {
    try {
        await db_1.default.user.update({
            where: { id: req.user.id },
            data: { isOnline: false },
        });
        return res.json({ success: true });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false });
    }
});
exports.default = router;
