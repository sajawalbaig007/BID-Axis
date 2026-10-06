import express from "express";
import prisma from "../config/db";
import { verifyToken, AuthRequest } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { buildProjectLeadWhere, isDisplayableProjectLead } from "../utils/projectLeads";
import { deskWhereForRole, leadVisibleOnDesk } from "../utils/projectDesk";
import {
  assignmentBelongsToEstimator,
  parseTechnicalAssignments,
  serializeTechnicalAssignments,
  appendTechnicalNote,
  updateTechnicalNote,
  deleteTechnicalNote,
  serializeTechnicalNotesBundle,
  pauseAssignmentTimer,
  startAssignmentTimer,
  pauseOtherRunningTimersForEstimator,
  pauseTimersOnLeadIds,
  pauseStaleTimersForEstimator,
  syncPhaseFromAssignments,
  assignmentElapsedSeconds,
  canCompleteAfterTimer,
  MIN_COMPLETE_TIMER_SECONDS,
  type TechnicalAssignment,
} from "../utils/technicalEstimators";
import { invalidatePattern, invalidateCache } from "../utils/cache";
import { notifyTmFromActor, projectLabel } from "../utils/technicalNotifications";
import {
  checkInCsrWorkSession,
  checkOutCsrWorkSession,
  getCsrWorkSessionStatus,
  tickCsrWorkSession,
  listUserShiftHistory,
  stampLastAction,
} from "../utils/csrSessionTracking";
import { buildPreviousMonthRatings } from "../utils/previousMonthRatings";
import { getClientIp, getUserAgent } from "../utils/requestMeta";
import { formatEstDateTime } from "../utils/estTime";
import { pktShiftDay } from "../utils/staffAttendance";
import { saveOvertimeComment } from "../utils/overtimeRequest";

const router = express.Router();

router.use(verifyToken, allowRoles("estimator"));

async function currentEstimator(req: AuthRequest) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true },
  });
  return user;
}

function projectInclude() {
  return {
    csr: { select: { id: true, name: true, email: true, csrCode: true } },
    uploadFile: { select: { companyName: true } },
    notes: { orderBy: { createdAt: "asc" as const }, take: 20 },
  };
}

function withMyAssignment(lead: { technicalAssignments: string | null }, me: { id: string; name: string }) {
  const all = parseTechnicalAssignments(lead.technicalAssignments);
  const mineAsg = all.find((a) => assignmentBelongsToEstimator(a, me));
  return { ...lead, myAssignment: mineAsg, technicalAssignments: serializeTechnicalAssignments(all) };
}

/* ================= GET ONE ASSIGNED PROJECT ================= */
router.get("/lead/:id", async (req: AuthRequest, res) => {
  try {
    const me = await currentEstimator(req);
    if (!me) return res.status(401).json({ success: false, message: "Unauthorized" });

    const leadId = String(req.params.id);
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { notes: { orderBy: { createdAt: "asc" }, take: 50 } },
    });
    if (!lead) return res.status(404).json({ success: false, message: "Project not found" });

    const mine = parseTechnicalAssignments(lead.technicalAssignments).some((a) =>
      assignmentBelongsToEstimator(a, me),
    );
    if (!mine || !leadVisibleOnDesk(lead, req.user?.role)) {
      return res.status(403).json({ success: false, message: "This project is not assigned to you" });
    }
    return res.json({ success: true, lead: withMyAssignment(lead, me) });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to fetch project" });
  }
});

router.get("/projects", async (req: AuthRequest, res) => {
  try {
    const me = await currentEstimator(req);
    if (!me) return res.status(401).json({ success: false, message: "Unauthorized" });

    /* Overnight / forgotten Start → Pause (keep timerSeconds); never auto-Complete */
    await pauseStaleTimersForEstimator(me);

    const raw = await prisma.lead.findMany({
      where: {
        ...buildProjectLeadWhere(),
        ...deskWhereForRole(req.user?.role),
        technicalAssignments: { not: null },
      },
      include: projectInclude(),
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    const leads = raw
      .filter(isDisplayableProjectLead)
      .filter((lead) => leadVisibleOnDesk(lead, req.user?.role))
      .filter((lead) => (lead as { hiddenOnTechnical?: boolean }).hiddenOnTechnical !== true)
      .map((lead) => {
        const all = parseTechnicalAssignments(lead.technicalAssignments);
        const mine = all.filter((a) => assignmentBelongsToEstimator(a, me));
        if (mine.length === 0) return null;
        return {
          ...lead,
          myAssignment: mine[0],
          technicalAssignments: serializeTechnicalAssignments(all),
        };
      })
      .filter(Boolean);

    const typed = leads as Array<{ myAssignment: TechnicalAssignment }>;
    const stats = {
      total: typed.length,
      takeoffDone: typed.filter((l) => l.myAssignment?.takeoffDone).length,
      pending: typed.filter((l) => !l.myAssignment?.takeoffDone).length,
    };

    return res.json({ success: true, leads, stats });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to fetch projects" });
  }
});

router.get("/dashboard", async (req: AuthRequest, res) => {
  try {
    const me = await currentEstimator(req);
    if (!me) return res.status(401).json({ success: false, message: "Unauthorized" });

    await pauseStaleTimersForEstimator(me);

    const raw = await prisma.lead.findMany({
      where: {
        ...buildProjectLeadWhere(),
        ...deskWhereForRole(req.user?.role),
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
        projectDesk: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    const mine = raw
      .filter((lead) => leadVisibleOnDesk(lead, req.user?.role))
      .filter((lead) => lead.hiddenOnTechnical !== true)
      .map((lead) => {
        const all = parseTechnicalAssignments(lead.technicalAssignments);
        const a = all.find((x) => assignmentBelongsToEstimator(x, me));
        if (!a) return null;
        return { ...lead, myAssignment: a };
      })
      .filter(Boolean) as Array<{
        id: string;
        projectTitle: string | null;
        projectCode: string | null;
        projectDeadline: string | null;
        projectPhase: string | null;
        technicalNotes: string | null;
        updatedAt: Date;
        myAssignment: TechnicalAssignment;
      }>;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = mine.filter((p) => {
      if (p.myAssignment.takeoffDone) return false;
      const d = p.myAssignment.deadline || p.projectDeadline;
      if (!d) return false;
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return false;
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
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to load dashboard" });
  }
});

router.get("/previous-month-rating", async (req: AuthRequest, res) => {
  try {
    const me = await currentEstimator(req);
    if (!me) return res.status(401).json({ success: false, message: "Unauthorized" });

    const payload = await buildPreviousMonthRatings();
    const rating =
      payload.ratings.find((r) => r.estimatorId === me.id) ??
      payload.ratings.find(
        (r) => r.name.trim().toLowerCase() === me.name.trim().toLowerCase(),
      ) ??
      null;

    return res.json({
      success: true,
      month: payload.month,
      monthLabel: payload.monthLabel,
      rating,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to load previous month rating" });
  }
});

/* ================= TIMER: start | pause ================= */
router.put("/project/:id/timer", async (req: AuthRequest, res) => {
  try {
    const me = await currentEstimator(req);
    if (!me) return res.status(401).json({ success: false, message: "Unauthorized" });

    const leadId = String(req.params.id);
    const action = String(req.body?.action ?? "").toLowerCase();
    if (action !== "start" && action !== "pause") {
      return res.status(400).json({ success: false, message: "action must be start or pause" });
    }

    const existing = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { technicalAssignments: true, assignedTo: true },
    });
    if (!existing) return res.status(404).json({ success: false, message: "Project not found" });

    const list = parseTechnicalAssignments(existing.technicalAssignments);
    const idx = list.findIndex((a) => assignmentBelongsToEstimator(a, me));
    if (idx < 0) {
      return res.status(403).json({ success: false, message: "This project is not assigned to you" });
    }

    const current = list[idx]!;
    if (current.takeoffDone) {
      return res.status(400).json({
        success: false,
        message: "Completed tasks are locked. Ask Chief Estimator to set pending if needed.",
      });
    }

    if (action === "start") {
      const pauseIds = Array.isArray(req.body?.pauseProjectIds)
        ? (req.body.pauseProjectIds as unknown[]).map((x) => String(x)).filter((id) => id && id !== leadId)
        : [];
      if (pauseIds.length > 0) {
        await pauseTimersOnLeadIds(me, pauseIds);
      } else {
        await pauseOtherRunningTimersForEstimator(me, leadId);
      }
      list[idx] = startAssignmentTimer(current);
    } else {
      const clientElapsed = Number(req.body?.clientElapsedSeconds);
      if (Number.isFinite(clientElapsed) && clientElapsed >= 0) {
        list[idx] = {
          ...current,
          timerSeconds: Math.max(current.timerSeconds, Math.floor(clientElapsed)),
          timerStartedAt: null,
        };
      } else {
        list[idx] = pauseAssignmentTimer(current);
      }
    }

    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: { technicalAssignments: serializeTechnicalAssignments(list) },
      include: projectInclude(),
    });

    invalidatePattern("admin:projects:");
    invalidateCache(`csr:projects:${lead.assignedTo}`);

    return res.json({ success: true, lead: withMyAssignment(lead, me) });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to update timer" });
  }
});

/* ================= COMPLETE TASK (estimator can only complete, not reopen) ================= */
router.put("/project/:id/complete", async (req: AuthRequest, res) => {
  try {
    const me = await currentEstimator(req);
    if (!me) return res.status(401).json({ success: false, message: "Unauthorized" });

    const leadId = String(req.params.id);
    const existing = await prisma.lead.findUnique({
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
    if (!existing) return res.status(404).json({ success: false, message: "Project not found" });

    const list = parseTechnicalAssignments(existing.technicalAssignments);
    const idx = list.findIndex((a) => assignmentBelongsToEstimator(a, me));
    if (idx < 0) {
      return res.status(403).json({ success: false, message: "This project is not assigned to you" });
    }

    if (list[idx]!.takeoffDone) {
      return res.status(400).json({ success: false, message: "Task is already completed" });
    }

    const clientElapsed = Number(req.body?.clientElapsedSeconds);
    const serverElapsed = assignmentElapsedSeconds(list[idx]!);
    const elapsed =
      Number.isFinite(clientElapsed) && clientElapsed >= 0
        ? Math.max(serverElapsed, Math.floor(clientElapsed))
        : serverElapsed;
    if (!canCompleteAfterTimer(elapsed)) {
      const left = Math.max(0, MIN_COMPLETE_TIMER_SECONDS - elapsed);
      return res.status(400).json({
        success: false,
        message: `Start the timer and wait ${left || MIN_COMPLETE_TIMER_SECONDS}s before Complete.`,
      });
    }

    const paused =
      Number.isFinite(clientElapsed) && clientElapsed >= 0
        ? {
            ...list[idx]!,
            timerSeconds: Math.max(list[idx]!.timerSeconds, Math.floor(clientElapsed)),
            timerStartedAt: null,
          }
        : pauseAssignmentTimer(list[idx]!);
    list[idx] = { ...paused, takeoffDone: true, pricingSent: false };
    const nextPhase = syncPhaseFromAssignments(list, existing.projectPhase);

    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        technicalAssignments: serializeTechnicalAssignments(list),
        projectPhase: nextPhase,
      },
      include: projectInclude(),
    });

    invalidatePattern("admin:projects:");
    invalidateCache(`csr:projects:${lead.assignedTo}`);

    const label = projectLabel(lead.projectCode || lead.clientCode, lead.projectTitle);
    void notifyTmFromActor({
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
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to complete task" });
  }
});

/* Legacy takeoff endpoint — estimator may only mark complete, never reopen */
router.put("/project/:id/takeoff", async (req: AuthRequest, res) => {
  try {
    const me = await currentEstimator(req);
    if (!me) return res.status(401).json({ success: false, message: "Unauthorized" });

    const takeoffDone = req.body?.takeoffDone === true;
    if (!takeoffDone) {
      return res.status(403).json({
        success: false,
        message: "Only Chief Estimator can set a completed task back to pending.",
      });
    }

    const leadId = String(req.params.id);
    const existing = await prisma.lead.findUnique({
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
    if (!existing) return res.status(404).json({ success: false, message: "Project not found" });

    const list = parseTechnicalAssignments(existing.technicalAssignments);
    const idx = list.findIndex((a) => assignmentBelongsToEstimator(a, me));
    if (idx < 0) {
      return res.status(403).json({ success: false, message: "This project is not assigned to you" });
    }

    const elapsed = assignmentElapsedSeconds(list[idx]!);
    if (!canCompleteAfterTimer(elapsed)) {
      const left = Math.max(0, MIN_COMPLETE_TIMER_SECONDS - elapsed);
      return res.status(400).json({
        success: false,
        message: `Start the timer and wait ${left || MIN_COMPLETE_TIMER_SECONDS}s before Complete.`,
      });
    }

    list[idx] = { ...pauseAssignmentTimer(list[idx]!), takeoffDone: true, pricingSent: false };
    const nextPhase = syncPhaseFromAssignments(list, existing.projectPhase);

    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        technicalAssignments: serializeTechnicalAssignments(list),
        projectPhase: nextPhase,
      },
      include: projectInclude(),
    });

    invalidatePattern("admin:projects:");
    invalidateCache(`csr:projects:${lead.assignedTo}`);

    const label = projectLabel(lead.projectCode || lead.clientCode, lead.projectTitle);
    void notifyTmFromActor({
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
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to update takeoff" });
  }
});

router.post("/lead/:id/notes", async (req: AuthRequest, res) => {
  try {
    const me = await currentEstimator(req);
    if (!me) return res.status(401).json({ success: false, message: "Unauthorized" });

    const leadId = String(req.params.id);
    const text = String(req.body?.text ?? "").trim();
    if (!text) return res.status(400).json({ success: false, message: "Note text is required" });

    const existing = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        technicalAssignments: true,
        technicalNotes: true,
        projectTitle: true,
        projectCode: true,
        clientCode: true,
      },
    });
    if (!existing) return res.status(404).json({ success: false, message: "Project not found" });

    const allowed = parseTechnicalAssignments(existing.technicalAssignments).some((a) =>
      assignmentBelongsToEstimator(a, me),
    );
    if (!allowed) {
      return res.status(403).json({ success: false, message: "This project is not assigned to you" });
    }

    const { bundle, note, list } = appendTechnicalNote(
      existing.technicalNotes,
      text,
      "estimator",
      { authorId: me.id, authorRole: "estimator", authorName: me.name },
    );
    await prisma.lead.update({
      where: { id: leadId },
      data: { technicalNotes: serializeTechnicalNotesBundle(bundle) },
    });

    const label = projectLabel(existing.projectCode || existing.clientCode, existing.projectTitle);
    void notifyTmFromActor({
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
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to add note" });
  }
});

router.put("/lead/:id/notes/:noteId", async (req: AuthRequest, res) => {
  try {
    const me = await currentEstimator(req);
    if (!me) return res.status(401).json({ success: false, message: "Unauthorized" });

    const leadId = String(req.params.id);
    const noteId = String(req.params.noteId);
    const text = String(req.body?.text ?? "").trim();
    if (!text) return res.status(400).json({ success: false, message: "Note text is required" });

    const existing = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { technicalAssignments: true, technicalNotes: true },
    });
    if (!existing) return res.status(404).json({ success: false, message: "Project not found" });

    const allowed = parseTechnicalAssignments(existing.technicalAssignments).some((a) =>
      assignmentBelongsToEstimator(a, me),
    );
    if (!allowed) {
      return res.status(403).json({ success: false, message: "This project is not assigned to you" });
    }

    const result = updateTechnicalNote(existing.technicalNotes, noteId, text, me.id, {
      actorRole: "estimator",
    });
    if ("error" in result) {
      const status = result.error.includes("author") ? 403 : 404;
      return res.status(status).json({ success: false, message: result.error });
    }
    if (result.thread !== "estimator") {
      return res.status(403).json({ success: false, message: "Cannot edit this note thread" });
    }

    await prisma.lead.update({
      where: { id: leadId },
      data: { technicalNotes: serializeTechnicalNotesBundle(result.bundle) },
    });
    return res.json({ success: true, note: result.note, technicalNotesBundle: result.bundle });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to update note" });
  }
});

router.delete("/lead/:id/notes/:noteId", async (req: AuthRequest, res) => {
  try {
    const me = await currentEstimator(req);
    if (!me) return res.status(401).json({ success: false, message: "Unauthorized" });

    const leadId = String(req.params.id);
    const noteId = String(req.params.noteId);

    const existing = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { technicalAssignments: true, technicalNotes: true },
    });
    if (!existing) return res.status(404).json({ success: false, message: "Project not found" });

    const allowed = parseTechnicalAssignments(existing.technicalAssignments).some((a) =>
      assignmentBelongsToEstimator(a, me),
    );
    if (!allowed) {
      return res.status(403).json({ success: false, message: "This project is not assigned to you" });
    }

    const result = deleteTechnicalNote(existing.technicalNotes, noteId, me.id, {
      actorRole: "estimator",
    });
    if ("error" in result) {
      const status = result.error.includes("author") ? 403 : 404;
      return res.status(status).json({ success: false, message: result.error });
    }
    if (result.thread !== "estimator") {
      return res.status(403).json({ success: false, message: "Cannot delete this note thread" });
    }

    await prisma.lead.update({
      where: { id: leadId },
      data: { technicalNotes: serializeTechnicalNotesBundle(result.bundle) },
    });
    return res.json({ success: true, technicalNotesBundle: result.bundle });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to delete note" });
  }
});

/** TM → Estimator note alerts (source tm_estimator), scoped to assigned projects. */
router.get("/notifications", async (req: AuthRequest, res) => {
  try {
    const me = await currentEstimator(req);
    if (!me) return res.status(401).json({ success: false, message: "Unauthorized" });

    const leads = await prisma.lead.findMany({
      where: { ...buildProjectLeadWhere(), ...deskWhereForRole(req.user?.role) },
      select: { id: true, technicalAssignments: true, projectDesk: true },
      take: 500,
    });
    const myLeadIds = leads
      .filter((l) => leadVisibleOnDesk(l, req.user?.role))
      .filter((l) =>
        parseTechnicalAssignments(l.technicalAssignments).some((a) =>
          assignmentBelongsToEstimator(a, me),
        ),
      )
      .map((l) => l.id);

    if (myLeadIds.length === 0) {
      return res.json({ success: true, notifications: [], unreadCount: 0 });
    }

    const rows = await prisma.technicalNotification.findMany({
      where: {
        source: "tm_estimator",
        leadId: { in: myLeadIds },
        OR: [{ recipientId: null }, { recipientId: me.id }],
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
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to load notifications" });
  }
});

router.put("/notifications/:id/read", async (req: AuthRequest, res) => {
  try {
    const me = await currentEstimator(req);
    if (!me) return res.status(401).json({ success: false, message: "Unauthorized" });
    const id = String(req.params.id);
    await prisma.technicalNotification.updateMany({
      where: {
        id,
        source: "tm_estimator",
        OR: [{ recipientId: null }, { recipientId: me.id }],
      },
      data: { readAt: new Date() },
    });
    return res.json({ success: true });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to mark read" });
  }
});

/* ================= CHECKED IN / CHECKED OUT ( CsrWorkSession ledger) ================= */

router.get("/shift-history", async (req: AuthRequest, res) => {
  try {
    const days = await listUserShiftHistory(req.user!.id);
    return res.json({ success: true, days });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to load check-in history." });
  }
});

router.get("/work-session", async (req: AuthRequest, res) => {
  try {
    const status = await getCsrWorkSessionStatus(req.user!.id);
    return res.json({ success: true, ...status });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to load work session." });
  }
});

router.post("/check-in", async (req: AuthRequest, res) => {
  try {
    const result = await checkInCsrWorkSession({
      userId: req.user!.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      deviceId: req.body?.tabId ?? req.body?.deviceId,
    });
    let status = await getCsrWorkSessionStatus(req.user!.id);
    if (!status.checkedIn) {
      status = {
        checkedIn: true,
        paused: false,
        session: {
          id: result.sessionId,
          checkInAt: result.loginAt.toISOString(),
          checkInAtEst: formatEstDateTime(result.loginAt),
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
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Check-in failed." });
  }
});

router.post("/check-out", async (req: AuthRequest, res) => {
  try {
    const me = await currentEstimator(req);
    const open = await prisma.csrWorkSession.findFirst({
      where: {
        userId: req.user!.id,
        OR: [{ logoutAt: null }, { logoutAt: { isSet: false } }],
      },
      orderBy: { loginAt: "desc" },
      select: { loginAt: true },
    });
    /* Leaving for the day: pause project timers so tomorrow resumes from same time */
    if (me) {
      await pauseOtherRunningTimersForEstimator(me);
    }
    await stampLastAction(req.user!.id, req.body?.lastActionAt);
    const closed = await checkOutCsrWorkSession(req.user!.id);
    const overtime = String(req.body?.overtimeComment ?? "").trim();
    if (closed && overtime && open && me) {
      await saveOvertimeComment({
        personKey: me.id,
        personName: me.name,
        department: "estimator",
        day: pktShiftDay(open.loginAt, "estimator", me.id),
        comment: overtime,
      });
    }
    return res.json({
      success: true,
      closed,
      checkedIn: false,
      session: null,
      message: closed
        ? "Checked out — project timers paused. Resume tomorrow from the same time."
        : "No active check-in.",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Check-out failed." });
  }
});

router.post("/heartbeat", async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const tabVisible = req.body?.tabVisible !== false;
    const tabId = req.body?.tabId ?? "unknown";

    await prisma.user.update({
      where: { id: userId },
      data: tabVisible
        ? { isOnline: true, lastActive: new Date() }
        : { isOnline: false },
    }).catch(() => {});

    void tickCsrWorkSession({
      userId,
      tabVisible,
      deviceId: String(tabId),
      lastActionAt: req.body?.lastActionAt,
    });

    return res.json({ success: true });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false });
  }
});

router.post("/offline", async (req: AuthRequest, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { isOnline: false },
    });
    return res.json({ success: true });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false });
  }
});

export default router;
