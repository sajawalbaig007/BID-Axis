"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTechnicalMonitoring = buildTechnicalMonitoring;
const db_1 = __importDefault(require("../config/db"));
const projectLeads_1 = require("./projectLeads");
const technicalEstimators_1 = require("./technicalEstimators");
function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}
function isProjectActive(p) {
    const work = (p.projectWorkStatus ?? "").toLowerCase();
    if (work === "completed" || work === "not_completed")
        return false;
    if (work === "in_progress")
        return true;
    const st = (p.status ?? "").toLowerCase();
    if (st === "completed")
        return false;
    if (p.projectDeadline) {
        const deadline = p.projectDeadline.split("T")[0] ?? "";
        const today = new Date().toISOString().split("T")[0] ?? "";
        return deadline >= today;
    }
    return st === "close client";
}
function pipelineBucket(p) {
    const phase = (p.projectPhase ?? "not_started").toLowerCase();
    const assignments = (0, technicalEstimators_1.parseTechnicalAssignments)(p.technicalAssignments);
    const hasAssign = assignments.length > 0;
    const anyWorking = assignments.some((a) => !a.takeoffDone && !a.pricingSent);
    const anyTakeoffReady = assignments.some((a) => a.takeoffDone && !a.pricingSent);
    const anyPricingSent = assignments.some((a) => a.pricingSent);
    const inFinal = phase === "qa_phase" || phase === "delivery_phase";
    const inPricing = phase === "pricing_phase" || phase.startsWith("pricing_") || anyPricingSent;
    if (inFinal)
        return "final_submission";
    if (inPricing)
        return "pricing";
    if (!hasAssign && isProjectActive(p))
        return "not_assigned";
    if (anyTakeoffReady)
        return "takeoff_done";
    if (anyWorking || hasAssign)
        return "assigned";
    return "other";
}
function assignmentOverdue(a, today) {
    if (a.takeoffDone || !a.deadline)
        return false;
    const d = new Date(a.deadline);
    if (Number.isNaN(d.getTime()))
        return false;
    d.setHours(0, 0, 0, 0);
    return d < today;
}
function parseManHours(raw) {
    const n = Number(String(raw ?? "").replace(/,/g, "").trim());
    return Number.isFinite(n) && n > 0 ? n : 0;
}
function computeScore(input) {
    if (input.assigned <= 0)
        return 0;
    const completionRate = input.completed / input.assigned;
    const overdueRate = input.overdue / input.assigned;
    const loggedHours = input.loggedSeconds / 3600;
    const activity = input.plannedHours > 0
        ? Math.min(1, loggedHours / input.plannedHours)
        : Math.min(1, loggedHours / 8);
    const score = completionRate * 70 + (1 - overdueRate) * 20 + activity * 10;
    return Math.max(0, Math.min(100, Math.round(score)));
}
function emptyMember(id, name, code) {
    return {
        estimatorId: id,
        name,
        code,
        assigned: 0,
        pending: 0,
        completed: 0,
        overdue: 0,
        timersRunning: 0,
        loggedSeconds: 0,
        plannedHours: 0,
        completionRate: 0,
        score: 0,
        projects: [],
    };
}
async function buildTechnicalMonitoring() {
    const now = Date.now();
    const today = startOfToday();
    const [roster, rawLeads] = await Promise.all([
        (0, technicalEstimators_1.listTechnicalEstimators)(),
        db_1.default.lead.findMany({
            where: (0, projectLeads_1.buildProjectLeadWhere)(),
            select: {
                id: true,
                status: true,
                projectTitle: true,
                projectCode: true,
                projectPhase: true,
                projectDeadline: true,
                deadlineTiming: true,
                projectWorkStatus: true,
                technicalAssignments: true,
                hiddenOnTechnical: true,
                inBin: true,
                updatedAt: true,
            },
            orderBy: { updatedAt: "desc" },
            take: 500,
        }),
    ]);
    const leads = rawLeads
        .filter(projectLeads_1.isDisplayableProjectLead)
        .filter((l) => l.hiddenOnTechnical !== true);
    const pipeline = {
        total: leads.length,
        notAssigned: 0,
        assigned: 0,
        takeoffDone: 0,
        pricing: 0,
        finalSubmission: 0,
    };
    for (const lead of leads) {
        const bucket = pipelineBucket(lead);
        if (bucket === "not_assigned")
            pipeline.notAssigned += 1;
        else if (bucket === "assigned")
            pipeline.assigned += 1;
        else if (bucket === "takeoff_done")
            pipeline.takeoffDone += 1;
        else if (bucket === "pricing")
            pipeline.pricing += 1;
        else if (bucket === "final_submission")
            pipeline.finalSubmission += 1;
    }
    const byId = new Map();
    for (const e of roster) {
        byId.set(e.id, emptyMember(e.id, e.name, e.code));
    }
    const ensureMember = (a) => {
        const existing = byId.get(a.estimatorId);
        if (existing)
            return existing;
        const byName = [...byId.values()].find((m) => m.name.trim().toLowerCase() === a.estimatorName.trim().toLowerCase());
        if (byName)
            return byName;
        const created = emptyMember(a.estimatorId, a.estimatorName, "—");
        byId.set(a.estimatorId, created);
        return created;
    };
    const liveByLead = new Map();
    for (const lead of leads) {
        liveByLead.set(lead.id, {
            leadId: lead.id,
            projectCode: lead.projectCode ?? null,
            projectTitle: lead.projectTitle ?? null,
            projectPhase: lead.projectPhase ?? null,
            workStatus: lead.projectWorkStatus ?? null,
            estimators: [],
        });
    }
    let emergencyMorning = 0;
    let emergencyCob = 0;
    for (const lead of leads) {
        const timing = String(lead.deadlineTiming ?? "").toLowerCase();
        if (timing === "morning")
            emergencyMorning += 1;
        if (timing === "cob")
            emergencyCob += 1;
        const assignments = (0, technicalEstimators_1.parseTechnicalAssignments)(lead.technicalAssignments);
        const live = liveByLead.get(lead.id);
        for (const a of assignments) {
            const member = ensureMember(a);
            const logged = (0, technicalEstimators_1.assignmentElapsedSeconds)(a, now);
            const overdue = assignmentOverdue(a, today);
            const running = Boolean(a.timerStartedAt) && !a.takeoffDone;
            member.assigned += 1;
            if (a.takeoffDone)
                member.completed += 1;
            else
                member.pending += 1;
            if (overdue)
                member.overdue += 1;
            if (running)
                member.timersRunning += 1;
            member.loggedSeconds += logged;
            member.plannedHours += parseManHours(a.manHours);
            member.projects.push({
                leadId: lead.id,
                projectCode: lead.projectCode ?? null,
                projectTitle: lead.projectTitle ?? null,
                projectPhase: lead.projectPhase ?? null,
                deadline: a.deadline,
                takeoffDone: a.takeoffDone,
                timerSeconds: a.timerSeconds,
                timerStartedAt: a.timerStartedAt,
                loggedSeconds: logged,
                manHours: a.manHours,
                scopes: a.scopes,
                divisions: a.divisions,
                workDetail: a.workDetail,
                overdue,
                timerRunning: running,
                deadlineTiming: timing === "morning" || timing === "cob" ? timing : null,
            });
            live?.estimators.push({
                name: member.name,
                code: member.code,
                manHours: a.manHours || "—",
                loggedSeconds: logged,
                takeoffDone: a.takeoffDone,
                overdue,
                timerRunning: running,
                deadline: a.deadline || "",
            });
        }
    }
    const team = [...byId.values()]
        .map((m) => {
        m.projects.sort((a, b) => {
            if (a.overdue !== b.overdue)
                return a.overdue ? -1 : 1;
            if (a.takeoffDone !== b.takeoffDone)
                return a.takeoffDone ? 1 : -1;
            return (a.deadline || "9999").localeCompare(b.deadline || "9999");
        });
        m.completionRate = m.assigned > 0 ? Math.round((m.completed / m.assigned) * 100) : 0;
        m.score = computeScore(m);
        m.plannedHours = Math.round(m.plannedHours * 10) / 10;
        return m;
    })
        .sort((a, b) => {
        if (b.pending !== a.pending)
            return b.pending - a.pending;
        if (b.overdue !== a.overdue)
            return b.overdue - a.overdue;
        return a.name.localeCompare(b.name);
    });
    const summary = {
        totalAssignments: 0,
        pendingAssignments: 0,
        completedAssignments: 0,
        overdueAssignments: 0,
        timersRunning: 0,
        totalLoggedSeconds: 0,
        plannedManHours: 0,
        completionRate: 0,
        emergencyMorning,
        emergencyCob,
    };
    for (const m of team) {
        summary.totalAssignments += m.assigned;
        summary.pendingAssignments += m.pending;
        summary.completedAssignments += m.completed;
        summary.overdueAssignments += m.overdue;
        summary.timersRunning += m.timersRunning;
        summary.totalLoggedSeconds += m.loggedSeconds;
        summary.plannedManHours += m.plannedHours;
    }
    summary.plannedManHours = Math.round(summary.plannedManHours * 10) / 10;
    summary.completionRate =
        summary.totalAssignments > 0
            ? Math.round((summary.completedAssignments / summary.totalAssignments) * 100)
            : 0;
    const scoreboard = [...team]
        .filter((m) => m.assigned > 0)
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .map(({ projects: _p, ...rest }) => rest);
    return {
        generatedAt: new Date().toISOString(),
        kpi: { pipeline, summary, scoreboard },
        team,
        live: [...liveByLead.values()],
    };
}
