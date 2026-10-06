import express from "express";
import prisma from "../config/db";
import { verifyToken } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { userBrowserMap, detectBrowser } from "../utils/sessions";
import { recordHeartbeatAccess } from "../utils/accessHistory";
import { tickCsrWorkSession, checkInCsrWorkSession, checkOutCsrWorkSession, getCsrWorkSessionStatus, pauseCsrWorkSession, resumeCsrWorkSession, listUserShiftHistory, stampLastAction } from "../utils/csrSessionTracking";
import { csrLoginBlocked } from "../utils/csrShiftWindow";
import { getClientIp, getUserAgent } from "../utils/requestMeta";
import { estDateYmd, formatEstDateTime } from "../utils/estTime";
import { getCache, setCache, invalidateCache, flushAdminClientsCache, shouldSkipThrottledHeal, markThrottledHeal } from "../utils/cache";
import { invalidateCsrLeadCaches } from "../utils/csrCache";
import { normalizePhone } from "../utils/phone";
import { findLeadsByPhone, buildPhoneLookupResponse } from "../utils/leadPhoneLookup";
import {
  clearPendingDuplicatesForPhone,
  clearPendingDuplicatesForCompany,
  hasPriorWonClient,
  healPipelineLeaksForCsr,
  reconcileClientOldFlagsForCsr,
  isPendingPipelineStatus,
} from "../utils/leadClientPromotion";
import { ensureLeadNoteFromText } from "../utils/leadNotes";
import { buildProjectLeadWhere, isDisplayableProjectLead, wonClientStatusWhere } from "../utils/projectLeads";
import { isImportantStatusWhere, isInterestedStatusWhere } from "../utils/adminClientQueries";
import {
  normalizePaymentsInput,
  parseProjectPayments,
  paidTotalFromEntries,
  preservePaymentSlipLinksForCsr,
} from "../utils/projectPayments";
import {
  NOT_INTERESTED_LIMIT,
  NOT_PICKED_LIMIT,
  buildActiveRetryWhere,
  buildBinWhere,
  filterActiveLeads,
  resolveDeleteBinReason,
  activeCsrLeadWhere,
  pendingLeadWhere,
  notInBinFilter,
} from "../utils/binLeads";
import { CSR_UPLOAD_FILE_SELECT } from "../utils/uploadSourceSelect";
import { CSR_CLIENT_LIST_SELECT, CSR_DASHBOARD_LEAD_SELECT, CSR_LIST_NOTES_SELECT } from "../utils/csrLeadSelect";
import {
  fetchCsrTabLeads,
  fetchPotentialLeads,
  fetchLeadIdsByOldestNote,
  getCsrLeadStats,
  mapDashboardLead,
  reorderByIds,
  type CsrTabKey,
} from "../utils/csrDashboardQueries";
import { ensureMasterFormatTrades } from "../utils/masterFormatTrades";
import { allocateNextProjectCode } from "../utils/nextProjectCode";
const router = express.Router();

async function logStatusChange(csrId: string, leadId: string, status: string) {
  try {
    await prisma.callLog.create({ data: { leadId, csrId, status } });
  } catch (error) {
    console.log("Failed to log status change", error);
  }
}

/** Expensive won/pending dedupe — at most once per CSR every 2 minutes */
async function maybeHealPipelineLeaks(csrId: string): Promise<number> {
  if (shouldSkipThrottledHeal(csrId)) return 0;
  const removed = await healPipelineLeaksForCsr(csrId);
  markThrottledHeal(csrId);
  return removed;
}

function getActivityRange(period: string, dateStr: string) {
  const parts = dateStr.split("-").map(Number);
  const y = parts[0] ?? new Date().getFullYear();
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;

  if (period === "week") {
    const dow = new Date(y, m - 1, d).getDay();
    const diffToMon = dow === 0 ? -6 : 1 - dow;
    const from = new Date(y, m - 1, d + diffToMon, 0, 0, 0, 0);
    const to   = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6, 23, 59, 59, 999);
    const fmt  = (dt: Date) => dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    return { from, to, label: `${fmt(from)} – ${fmt(to)} ${from.getFullYear()}` };
  }

  if (period === "month") {
    const from = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const to   = new Date(y, m, 0, 23, 59, 59, 999);
    return { from, to, label: from.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
  }

  const from = new Date(y, m - 1, d, 0, 0, 0, 0);
  const to   = new Date(y, m - 1, d, 23, 59, 59, 999);
  return {
    from, to,
    label: from.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }),
  };
}

function aggregateGrouped(
  grouped: { status: string; _count: { _all: number } }[],
) {
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const g of grouped) {
    byStatus[g.status] = g._count._all;
    total += g._count._all;
  }
  return { total, byStatus };
}

/* ================= CSR ACTIVITY REPORT ================= */

router.get("/activity-report", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId  = req.user.id;
    const period = String(req.query.period ?? "day");
    const date   = String(req.query.date   ?? estDateYmd());

    if (!["day", "week", "month"].includes(period)) {
      return res.status(400).json({ success: false, message: "Invalid period. Use day, week, or month." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: "Invalid date. Use YYYY-MM-DD." });
    }

    const { from, to, label } = getActivityRange(period, date);
    const where = { csrId, createdAt: { gte: from, lte: to } };

    /* Exact counts via groupBy — do NOT cap with take (was wrongly limited to 200).
       Entries list is capped only for the UI scroll panel. */
    const [grouped, logs] = await Promise.all([
      prisma.callLog.groupBy({
        by:     ["status"],
        where,
        _count: { _all: true },
      }),
      prisma.callLog.findMany({
        where,
        select:  {
          id: true, status: true, createdAt: true,
          lead: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    const { total, byStatus } = aggregateGrouped(grouped);
    const entries = logs.map(log => ({
      id:        log.id,
      status:    log.status,
      createdAt: log.createdAt,
      leadName:  log.lead?.name ?? "Unknown",
    }));
    return res.json({ success: true, period, date, rangeLabel: label, total, byStatus, entries });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to fetch activity report" });
  }
});

/* ================= CSR NOTIFICATIONS ================= */

router.get("/notifications", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId = req.user.id;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const today = estDateYmd();

    const [scheduledLeads, grouped] = await Promise.all([
      prisma.lead.findMany({
        where: {
          assignedTo: csrId,
          status: "important",
          nextSchedule: { not: null },
          nextTime: { not: null },
          inBin: false,
        },
        select: { id: true, name: true, status: true, nextSchedule: true, nextTime: true, timezone: true },
        orderBy: [{ nextSchedule: "asc" }, { nextTime: "asc" }],
        take: 30,
      }),
      prisma.callLog.groupBy({
        by:     ["status"],
        where:  { csrId, createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    const scheduledCalls = scheduledLeads
      .filter(l => (l.nextSchedule ?? "") >= today)
      .slice(0, 20)
      .map(l => ({
        id: l.id,
        client: l.name ?? "Client",
        date: l.nextSchedule!,
        time: l.nextTime!,
        timezone: l.timezone ?? "",
        status: l.status,
      }));

    const { total, byStatus } = aggregateGrouped(grouped);
    return res.json({
      success: true,
      scheduledCalls,
      dailyStats: { total, byStatus, periodHours: 24 },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to fetch notifications" });
  }
});

/* ================= CSR DASHBOARD ================= */

/* ================= CSR DASHBOARD (legacy — stats only; use /tab-leads for lists) ================= */

router.get("/stats", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId    = req.user.id;
    const from   = typeof req.query.from === "string" ? req.query.from : undefined;
    const to     = typeof req.query.to === "string" ? req.query.to : undefined;
    const cacheKey = `csr:stats:${csrId}:${from ?? ""}:${to ?? ""}`;

    const cached = getCache<object>(cacheKey);
    if (cached) return res.json(cached);

    const stats = await getCsrLeadStats(csrId, from, to);
    const payload = { success: true, stats };
    setCache(cacheKey, payload, 45_000);
    return res.json(payload);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to fetch stats" });
  }
});

router.get("/tab-leads", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId  = req.user.id;
    const tab    = String(req.query.tab ?? "pending") as CsrTabKey;
    const page   = Math.max(1, Number(req.query.page) || 1);
    /* Cap page size to protect Render/Mongo under load (CSR uses 30; filter batch up to 500) */
    const pageSize = Math.min(500, Math.max(10, Number(req.query.pageSize) || 30));
    const from   = typeof req.query.from === "string" ? req.query.from : undefined;
    const to     = typeof req.query.to === "string" ? req.query.to : undefined;

    const validTabs: CsrTabKey[] = [
      "today", "pending", "important", "schedule", "interested", "projectwon",
      "notinterested", "notpicked", "noowner", "notinservice", "inhouse", "notuseful",
    ];
    if (!validTabs.includes(tab)) {
      return res.status(400).json({ success: false, message: "Invalid tab." });
    }

    if (tab === "pending" || tab === "today") {
      /* Do not block the list response — heal in background */
      void maybeHealPipelineLeaks(csrId)
        .then(n => { if (n > 0) invalidateCsrLeadCaches(csrId); })
        .catch(err => console.log("[csr] background heal failed:", err));
    }

    const cacheKey = `csr:tab:${csrId}:${tab}:${page}:${pageSize}:${from ?? ""}:${to ?? ""}`;
    const cached   = getCache<object>(cacheKey);
    if (cached) return res.json(cached);

    const result = await fetchCsrTabLeads({ csrId, tab, page, pageSize, from, to });
    const payload = { success: true, ...result };
    setCache(cacheKey, payload, 20_000);
    return res.json(payload);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to fetch tab leads" });
  }
});

router.get("/potential-leads", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId    = req.user.id;
    const cacheKey = `csr:potential:${csrId}`;
    const cached   = getCache<object>(cacheKey);
    if (cached) return res.json(cached);

    const leads = await fetchPotentialLeads(csrId);
    const payload = { success: true, leads };
    setCache(cacheKey, payload, 30_000);
    return res.json(payload);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to fetch potential leads" });
  }
});

router.get("/dashboard", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId    = req.user.id;
    const cacheKey = `csr:dashboard:${csrId}`;
    const cached   = getCache<object>(cacheKey);
    if (cached) return res.json(cached);

    const stats = await getCsrLeadStats(csrId);
    const dashWhere = {
      ...activeCsrLeadWhere(csrId),
      status: {
        in: ["no owner available", "not in service", "in house"],
        mode: "insensitive" as const,
      },
    };
    const [ids, rawLeads] = await Promise.all([
      fetchLeadIdsByOldestNote(dashWhere),
      prisma.lead.findMany({
        where: dashWhere,
        select: {
          ...CSR_DASHBOARD_LEAD_SELECT,
          notes: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { id: true, text: true, createdAt: true, parentId: true },
          },
        },
      }),
    ]);

    const leads = filterActiveLeads(reorderByIds(rawLeads, ids)).map(mapDashboardLead);

    const payload = { success: true, totalLeads: stats.totalAssigned, stats, leads };
    setCache(cacheKey, payload, 45_000);
    return res.json(payload);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to fetch dashboard" });
  }
});

/* ================= NOT-INTERESTED / NOT-PICKED LEADS ================= */

router.get("/not-interested", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId    = req.user.id;
    const cacheKey = `csr:not-interested:${csrId}`;
    const cached   = getCache<object>(cacheKey);
    if (cached) return res.json(cached);

    const niWhere = buildActiveRetryWhere(csrId);
    const [ids, rawLeads] = await Promise.all([
      fetchLeadIdsByOldestNote(niWhere),
      prisma.lead.findMany({
        where: niWhere,
        select: {
          ...CSR_DASHBOARD_LEAD_SELECT,
          notes: {
            orderBy: { createdAt: "desc" as const },
            take: 20,
            select: { id: true, text: true, createdAt: true, parentId: true },
          },
        },
      }),
    ]);

    const leads = filterActiveLeads(reorderByIds(rawLeads, ids));

    const payload = { success: true, leads };
    setCache(cacheKey, payload, 30_000);
    return res.json(payload);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to fetch leads" });
  }
});

/* ================= LOOKUP CLIENT BY PHONE ================= */

router.get("/lookup-by-phone", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const phone = (req.query.phone as string)?.trim();
    if (!phone || normalizePhone(phone).length < 7) {
      return res.json({ success: true, found: false });
    }

    const matches = await findLeadsByPhone(phone);
    if (matches.length === 0) {
      return res.json({ success: true, found: false });
    }

    return res.json(buildPhoneLookupResponse(matches));
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to lookup client" });
  }
});

/* ================= ADD PROJECT MANUALLY ================= */

router.post("/project", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId = req.user.id;
    const {
      name,
      company,
      phone,
      email,
      state,
      ownerName,
      projectTitle,
      projectCode,
      projectScope,
      interestedService,
      projectDeadline,
      projectBudget,
      projectNotes,
      status,
      sourceClientId,
    } = req.body;

    /* Validate required fields */
    if (!name || !projectTitle || !interestedService || !projectDeadline) {
      return res.status(400).json({
        success: false,
        message: "name, projectTitle, interestedService and projectDeadline are required.",
      });
    }

    let source: {
      id: string;
      clientCode: string | null;
      projectCode: string | null;
      isOldClient: boolean;
      email: string | null;
      state: string | null;
      ownerName: string | null;
      company: string | null;
      phone: string | null;
    } | null = null;

    if (sourceClientId) {
      source = await prisma.lead.findFirst({
        where: { id: String(sourceClientId), assignedTo: csrId, ...notInBinFilter() },
        select: {
          id: true,
          clientCode: true,
          projectCode: true,
          isOldClient: true,
          email: true,
          state: true,
          ownerName: true,
          company: true,
          phone: true,
        },
      });
      if (!source) {
        return res.status(404).json({ success: false, message: "Source client not found" });
      }
    }

    const trimmedPhone = (phone?.trim() || source?.phone?.trim() || null) as string | null;
    const baseCode = (source?.clientCode || source?.projectCode || "").trim();
    let resolvedProjectCode = typeof projectCode === "string" && projectCode.trim()
      ? projectCode.trim()
      : null;
    let clientCode: string | null = source?.clientCode ?? null;

    if (source && baseCode) {
      if (!clientCode) clientCode = baseCode;
      if (!resolvedProjectCode) {
        resolvedProjectCode = await allocateNextProjectCode(baseCode, { assignedTo: csrId });
      }
    }

    /* Second+ project on an existing client → Old. */
    const isOldClient = source
      ? true
      : (trimmedPhone || company?.trim()
        ? await hasPriorWonClient(trimmedPhone, company?.trim() ?? null)
        : false);

    const lead = await prisma.lead.create({
      data: {
        name,
        company:           company ?? source?.company ?? null,
        phone:             trimmedPhone,
        email:             email ?? source?.email ?? null,
        state:             state ?? source?.state ?? null,
        ownerName:         ownerName ?? source?.ownerName ?? null,
        status:            status ?? "Close Client",
        projectTitle,
        projectCode:       resolvedProjectCode,
        clientCode,
        projectScope:      projectScope ?? null,
        interestedService,
        projectDeadline,
        projectBudget:     projectBudget ?? null,
        projectNotes:      projectNotes ?? null,
        assignedTo:        csrId,
        important:         false,
        interested:        false,
        isOldClient,
        hiddenOnMain:      true,
        technicalReceivedAt: new Date(),
      },
    });

    if (trimmedPhone) {
      await clearPendingDuplicatesForPhone(trimmedPhone, csrId, lead.id);
    }
    if ((company ?? source?.company)?.trim()) {
      await clearPendingDuplicatesForCompany((company ?? source?.company)!.trim(), csrId, lead.id);
    }

    if (source && !source.isOldClient) {
      await prisma.lead.update({
        where: { id: source.id },
        data: { isOldClient: true },
      });
    }
    await reconcileClientOldFlagsForCsr(csrId);

    invalidateCsrLeadCaches(csrId);
    flushAdminClientsCache();
    return res.status(201).json({ success: true, lead });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to create project" });
  }
});

/* ================= GET SINGLE LEAD (full data — lazy load for notes/subContacts) ================= */
router.get("/lead/:id", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId  = req.user.id;
    const leadId = req.params.id as string;

    const lead = await prisma.lead.findFirst({
      where:   { id: leadId, assignedTo: csrId },
      include: {
        uploadFile:  { select: { companyName: true } },
        notes:       { orderBy: { createdAt: "desc" } },
        subContacts: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    return res.json({ success: true, lead });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to fetch lead" });
  }
});

/* ================= UPDATE LEAD NOTE (legacy inline) ================= */
router.patch("/lead/:id/note", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId  = req.user.id;
    const leadId = req.params.id as string;
    const { comments } = req.body;

    const lead = await prisma.lead.findFirst({ where: { id: leadId, assignedTo: csrId } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    await prisma.lead.update({ where: { id: leadId }, data: { comments: comments ?? "" } });
    if (comments?.trim()) {
      await ensureLeadNoteFromText(leadId, comments);
    }
    invalidateCsrLeadCaches(csrId);
    flushAdminClientsCache();
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to save note" });
  }
});

/* ================= ADD TIMESTAMPED NOTE (optional parentId = reply) ================= */
router.post("/lead/:id/notes", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId  = req.user.id;
    const leadId = req.params.id as string;
    const { text, parentId } = req.body as { text: string; parentId?: string };

    if (!text?.trim()) return res.status(400).json({ success: false, message: "Note text required" });

    const lead = await prisma.lead.findFirst({ where: { id: leadId, assignedTo: csrId } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    let parent: string | undefined;
    if (parentId?.trim()) {
      const p = await prisma.leadNote.findFirst({
        where: { id: parentId.trim(), leadId, parentId: null },
      });
      if (!p) return res.status(400).json({ success: false, message: "Parent note not found" });
      parent = p.id;
    }

    const note = await prisma.leadNote.create({
      data: { text: text.trim(), leadId, ...(parent ? { parentId: parent } : {}) },
    });
    await prisma.lead.update({ where: { id: leadId }, data: { updatedAt: new Date() } });
    invalidateCsrLeadCaches(csrId);
    flushAdminClientsCache();
    return res.json({ success: true, note });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to add note" });
  }
});

/* ================= UPDATE NOTE ================= */
router.put("/lead/:id/notes/:noteId", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId  = req.user.id;
    const { noteId } = req.params as { noteId: string };
    const { text } = req.body as { text: string };
    if (!text?.trim()) return res.status(400).json({ success: false, message: "Note text required" });
    const note = await prisma.leadNote.findFirst({ where: { id: noteId, lead: { assignedTo: csrId } } });
    if (!note) return res.status(404).json({ success: false, message: "Note not found" });
    const updated = await prisma.leadNote.update({
      where: { id: noteId },
      data: { text: text.trim(), createdAt: new Date() },
    });
    await prisma.lead.update({ where: { id: note.leadId }, data: { updatedAt: new Date() } });
    invalidateCache(`csr:leads:${csrId}`, `csr:not-interested:${csrId}`);
    flushAdminClientsCache();
    return res.json({ success: true, note: updated });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to update note" });
  }
});

/* ================= DELETE NOTE (+ nested replies) ================= */
router.delete("/lead/:id/notes/:noteId", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId  = req.user.id;
    const { noteId } = req.params as { noteId: string };
    const note = await prisma.leadNote.findFirst({ where: { id: noteId, lead: { assignedTo: csrId } } });
    if (!note) return res.status(404).json({ success: false, message: "Note not found" });
    await prisma.leadNote.deleteMany({ where: { OR: [{ id: noteId }, { parentId: noteId }] } });
    invalidateCache(`csr:leads:${csrId}`, `csr:not-interested:${csrId}`);
    flushAdminClientsCache();
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to delete note" });
  }
});

/* ================= UPDATE LEAD ================= */

router.put("/lead/:id", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId  = req.user.id;
    const leadId = req.params.id as string;

    const {
      nextSchedule, nextTime, timezone, followUpNotes,
      interestedService, projectTitle, projectCode, projectDeadline,
      projectBudget, projectNotes, paidAmount, comments,
      name, phone, email, state,
      moveToBin, inBin,
    } = req.body;
    let status: string | undefined = req.body.status !== undefined ? String(req.body.status) : undefined;

    /* Fetch current lead to get existing counts */
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, assignedTo: csrId },
    });

    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    if (moveToBin === true) {
      const reason = resolveDeleteBinReason(lead.status);
      const updated = await prisma.lead.update({
        where: { id: leadId },
        data: {
          inBin:             true,
          binReason:         reason,
          binPreviousStatus: lead.status,
          important:         false,
          interested:        false,
          status:            "pending",
        },
      });
      invalidateCsrLeadCaches(csrId);
      return res.json({ success: true, lead: updated, movedToBin: true });
    }

    if (inBin === false) {
      const restoreStatus = lead.binPreviousStatus || "pending";
      const updated = await prisma.lead.update({
        where: { id: leadId },
        data: {
          inBin:              false,
          binReason:          null,
          binPreviousStatus:  null,
          status:             restoreStatus,
          important:          restoreStatus === "important",
          interested:         restoreStatus === "interested",
          notPickedCount:     0,
          notInterestedCount: 0,
        },
      });
      invalidateCsrLeadCaches(csrId);
      return res.json({ success: true, lead: updated, restored: true });
    }

    /* Build base update object */
    const updateData: Record<string, unknown> = {};

    if (nextSchedule      !== undefined) updateData.nextSchedule      = nextSchedule;
    if (nextTime          !== undefined) updateData.nextTime          = nextTime;
    if (timezone          !== undefined) updateData.timezone          = timezone;
    if (followUpNotes     !== undefined) updateData.followUpNotes     = followUpNotes;
    if (interestedService !== undefined) updateData.interestedService = interestedService;
    if (projectTitle      !== undefined) updateData.projectTitle      = projectTitle;
    if (projectCode       !== undefined) updateData.projectCode       = projectCode;
    if (projectDeadline   !== undefined) updateData.projectDeadline   = projectDeadline;
    if (projectBudget     !== undefined) updateData.projectBudget     = projectBudget;
    if (projectNotes      !== undefined) updateData.projectNotes      = projectNotes;
    if (paidAmount        !== undefined) updateData.paidAmount        = paidAmount;
    if (comments          !== undefined) updateData.comments          = comments;

    /* Contact fields — never write UI placeholders ("N/A") over real data.
       Status-change requests often accidentally include empty/N/A contact fields. */
    const cleanContact = (v: unknown): string | undefined => {
      if (v === undefined || v === null) return undefined;
      const s = String(v).trim();
      if (!s) return undefined;
      const lower = s.toLowerCase();
      if (
        lower === "n/a" || lower === "na" || lower === "unknown" ||
        lower === "not provided" || lower === "—" || lower === "-"
      ) return undefined;
      return s;
    };

    const cleanedName    = cleanContact(name);
    const cleanedPhone   = cleanContact(phone);
    const cleanedEmail   = cleanContact(email);
    const cleanedState   = cleanContact(state);
    const cleanedCompany = cleanContact(req.body.company);
    const cleanedWebsite = cleanContact(req.body.website);

    if (cleanedName    !== undefined) updateData.name    = cleanedName;
    if (cleanedPhone   !== undefined) updateData.phone   = cleanedPhone;
    if (cleanedEmail   !== undefined) updateData.email   = cleanedEmail.toLowerCase();
    if (cleanedState   !== undefined) updateData.state   = cleanedState;
    if (cleanedCompany !== undefined) updateData.company = cleanedCompany;
    if (cleanedWebsite !== undefined) updateData.website = cleanedWebsite;

    if (req.body.ownerName        !== undefined) updateData.ownerName        = req.body.ownerName;
    if (req.body.projectScope     !== undefined) updateData.projectScope     = req.body.projectScope;
    if (req.body.projectPhase     !== undefined) updateData.projectPhase     = req.body.projectPhase;
    if (req.body.takeoffDeadline  !== undefined) updateData.takeoffDeadline  = req.body.takeoffDeadline;
    if (req.body.pricingDeadline  !== undefined) updateData.pricingDeadline  = req.body.pricingDeadline;
    if (req.body.qaDeadline       !== undefined) updateData.qaDeadline       = req.body.qaDeadline;
    if (req.body.clientCode       !== undefined) updateData.clientCode       = req.body.clientCode;
    if (req.body.trade            !== undefined) updateData.trade            = req.body.trade;
    if (req.body.subTrades        !== undefined) updateData.subTrades        = req.body.subTrades;
    if (req.body.tradeNotes       !== undefined) updateData.tradeNotes       = req.body.tradeNotes;
    const payments = normalizePaymentsInput(req.body.projectPayments);
    if (payments !== undefined) {
      // CSR cannot add/change payment slip links — Admin / Manager only
      const safePayments = preservePaymentSlipLinksForCsr(payments, lead.projectPayments) ?? payments;
      updateData.projectPayments = safePayments;
      updateData.paidAmount = String(paidTotalFromEntries(parseProjectPayments(safePayments)));
    }

    /* ── STATUS HANDLING ── */
    if (status !== undefined) {
      const raw = String(status).trim();
      const n = raw.toLowerCase();
      /* Canonical status strings used across CSR pages */
      const canonical =
        n === "not interested" ? "Not Interested" :
        n === "not useful" ? "Not useful" :
        n === "not picked" || n === "notpicked" ? "not picked" :
        n === "not completed" ? "not completed" :
        n === "close client" ? "Close Client" :
        n === "no owner available" ? "no owner available" :
        n === "not in service" ? "not in service" :
        n === "in house" ? "in house" :
        n === "important" ? "important" :
        n === "interested" ? "interested" :
        n === "pending" ? "pending" :
        n === "completed" ? "completed" :
        n === "closed" ? "closed" :
        raw;

      updateData.status = canonical;
      /* Always sync flags from status so leads land on the correct page */
      updateData.important  = canonical === "important";
      updateData.interested = canonical === "interested";

      /* ── NOT INTERESTED (limit = 3) ── */
      if (canonical === "Not Interested") {
        const newCount = (lead.notInterestedCount ?? 0) + 1;
        updateData.notInterestedCount = newCount;
        updateData.nextSchedule = null;
        updateData.nextTime     = null;

        const ts  = new Date().toLocaleString("en-US", { dateStyle:"medium", timeStyle:"short" });
        const tag = newCount >= NOT_INTERESTED_LIMIT ? " — LIMIT REACHED" : "";
        const entry = `[Try ${newCount}/${NOT_INTERESTED_LIMIT} · ${ts}] Not Interested${tag}`;
        updateData.followUpNotes = [lead.followUpNotes, entry].filter(Boolean).join("\n");

        if (newCount >= NOT_INTERESTED_LIMIT) {
          updateData.inBin     = true;
          updateData.binReason = "limit-not-interested";
        }

        await prisma.lead.update({ where: { id: leadId }, data: updateData });
        await logStatusChange(csrId, leadId, canonical);

        invalidateCsrLeadCaches(csrId);

        if (newCount >= NOT_INTERESTED_LIMIT) {
          const otherCsrs = await prisma.user.findMany({
            where: { id: { not: csrId }, role: "csr", isActive: true },
            select: { id: true, name: true, csrCode: true },
            orderBy: { csrCode: "asc" },
          });
          return res.json({
            success:           true,
            needsManualAssign: true,
            csrs:              otherCsrs,
            message:           "Limit reached. Select a CSR to reassign this lead.",
          });
        }

        return res.json({
          success:   true,
          lead:      await prisma.lead.findUnique({ where: { id: leadId } }),
          triesLeft: NOT_INTERESTED_LIMIT - newCount,
        });
      }

      /* ── NOT PICKED (limit = 7) ── */
      if (canonical === "not picked" || canonical === "not completed") {
        const newCount = (lead.notPickedCount ?? 0) + 1;
        updateData.notPickedCount = newCount;
        updateData.nextSchedule = null;
        updateData.nextTime     = null;

        const ts  = new Date().toLocaleString("en-US", { dateStyle:"medium", timeStyle:"short" });
        const tag = newCount >= NOT_PICKED_LIMIT ? " — LIMIT REACHED" : "";
        const entry = `[Try ${newCount}/${NOT_PICKED_LIMIT} · ${ts}] Not Picked${tag}`;
        updateData.followUpNotes = [lead.followUpNotes, entry].filter(Boolean).join("\n");

        if (newCount >= NOT_PICKED_LIMIT) {
          updateData.inBin     = true;
          updateData.binReason = "limit-not-picked";
        }

        await prisma.lead.update({ where: { id: leadId }, data: updateData });
        await logStatusChange(csrId, leadId, canonical);

        invalidateCsrLeadCaches(csrId);

        if (newCount >= NOT_PICKED_LIMIT) {
          const otherCsrs = await prisma.user.findMany({
            where: { id: { not: csrId }, role: "csr", isActive: true },
            select: { id: true, name: true, csrCode: true },
            orderBy: { csrCode: "asc" },
          });
          return res.json({
            success:           true,
            needsManualAssign: true,
            csrs:              otherCsrs,
            message:           "Limit reached. Select a CSR to reassign this lead.",
          });
        }

        return res.json({
          success:   true,
          lead:      await prisma.lead.findUnique({ where: { id: leadId } }),
          triesLeft: NOT_PICKED_LIMIT - newCount,
        });
      }

      /* ── IMPORTANT ── */
      if (canonical === "important") {
        /* Direct "Important" (not Schedule Call) → important-only bucket for admin */
        if (nextSchedule === undefined && nextTime === undefined) {
          updateData.nextSchedule = null;
          updateData.nextTime     = null;
        }
      }

      /* ── INTERESTED / misc / pending — clear leftover schedule ── */
      if (
        canonical === "interested" ||
        canonical === "pending" ||
        canonical === "no owner available" ||
        canonical === "not in service" ||
        canonical === "in house" ||
        canonical === "Not useful"
      ) {
        if (nextSchedule === undefined) updateData.nextSchedule = null;
        if (nextTime === undefined) updateData.nextTime = null;
      }

      /* ── AUTO isOldClient when Close Client ── */
      if (canonical === "Close Client" || canonical === "completed" || canonical === "closed") {
        updateData.hiddenOnMain = true;
        updateData.nextSchedule = null;
        updateData.nextTime     = null;
        updateData.isOldClient = await hasPriorWonClient(lead.phone, lead.company, leadId);
        if (!lead.technicalReceivedAt) {
          updateData.technicalReceivedAt = new Date();
        }

        /* ── AUTO clientCode: {csrCode}-{padded_seq} ── */
        if (!lead.clientCode) {
          const csr = await prisma.user.findUnique({
            where:  { id: csrId },
            select: { csrCode: true },
          });
          if (csr?.csrCode) {
            const wonCount = await prisma.lead.count({
              where: {
                assignedTo: csrId,
                status:     { in: ["Close Client", "completed", "closed"] },
                clientCode: { not: null },
              },
            });
            const seq = String(wonCount + 1).padStart(2, "0");
            updateData.clientCode = `${csr.csrCode}-${seq}`;
          }
        }
      }

      /* Use canonical for downstream won-client / logging checks */
      status = canonical;
    }

    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data:  updateData,
    });

    if (comments !== undefined && comments?.trim()) {
      await ensureLeadNoteFromText(leadId, comments);
    }

    if (
      status !== undefined &&
      (status === "Close Client" || status === "completed")
    ) {
      if (lead.phone) {
        await clearPendingDuplicatesForPhone(lead.phone, csrId, leadId);
      }
      if (lead.company) {
        await clearPendingDuplicatesForCompany(lead.company, csrId, leadId);
      }
      await reconcileClientOldFlagsForCsr(csrId);
    }

    // Always log when CSR submits a status (including same status again) —
    // Admin reports Completed / status buckets are CallLog-based.
    if (status !== undefined) {
      await logStatusChange(csrId, leadId, status);
    }

    invalidateCsrLeadCaches(csrId);
    return res.json({ success: true, lead: updatedLead });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to update lead" });
  }
});

/* ================= CREATE LEAD (CSR manual add) ================= */

router.post("/lead", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId = req.user.id;
    const { name, phone, company, email, website, state, interestedService, comments, projectBudget, paidAmount } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: "Client name is required." });
    }

    const trimmedPhone = phone?.trim() || null;
    const companyTrim  = company?.trim() || null;
    const asWonClient  = !!req.body.asWonClient || req.body.status === "Close Client";

    if (asWonClient && trimmedPhone) {
      const existingLeads = await findLeadsByPhone(trimmedPhone);
      const pendingDup = existingLeads.find(
        l =>
          l.assignedTo === csrId &&
          isPendingPipelineStatus(l.status) &&
          !l.inBin,
      );

      if (pendingDup) {
        const isOldClient = await hasPriorWonClient(trimmedPhone, companyTrim, pendingDup.id);
        const lead = await prisma.lead.update({
          where: { id: pendingDup.id },
          data: {
            name:              name.trim(),
            phone:             trimmedPhone,
            email:             email?.trim()?.toLowerCase() || null,
            website:           website?.trim() || null,
            state:             state?.trim()             || null,
            company:           companyTrim               || null,
            interestedService: interestedService?.trim() || null,
            comments:          comments?.trim()          || null,
            projectBudget:     projectBudget?.trim()     || null,
            paidAmount:        paidAmount?.trim()        || null,
            status:            "Close Client",
            assignedTo:        csrId,
            important:         false,
            interested:        false,
            isOldClient,
            hiddenOnMain:      true,
          },
        });

        await clearPendingDuplicatesForPhone(trimmedPhone, csrId, lead.id);
        if (companyTrim) {
          await clearPendingDuplicatesForCompany(companyTrim, csrId, lead.id);
        }
        await reconcileClientOldFlagsForCsr(csrId);
        if (comments?.trim()) {
          await ensureLeadNoteFromText(lead.id, comments);
        }
        invalidateCsrLeadCaches(csrId);
        flushAdminClientsCache();
        return res.status(200).json({ success: true, lead, promoted: true });
      }
    }

    const isOldClient = asWonClient
      ? await hasPriorWonClient(trimmedPhone, companyTrim)
      : false;

    const lead = await prisma.lead.create({
      data: {
        name:              name.trim(),
        phone:             trimmedPhone,
        email:             email?.trim()?.toLowerCase() || null,
        website:           website?.trim() || null,
        state:             state?.trim()             || null,
        company:           company?.trim()           || null,
        interestedService: interestedService?.trim() || null,
        comments:          comments?.trim()          || null,
        projectBudget:     projectBudget?.trim()     || null,
        paidAmount:        paidAmount?.trim()        || null,
        status:            asWonClient ? "Close Client" : "pending",
        assignedTo:        csrId,
        important:         false,
        interested:        false,
        isOldClient,
        hiddenOnMain:      asWonClient,
      },
    });

    if (asWonClient && trimmedPhone) {
      await clearPendingDuplicatesForPhone(trimmedPhone, csrId, lead.id);
    }
    if (asWonClient && companyTrim) {
      await clearPendingDuplicatesForCompany(companyTrim, csrId, lead.id);
    }

    await reconcileClientOldFlagsForCsr(csrId);

    if (comments?.trim()) {
      await ensureLeadNoteFromText(lead.id, comments);
    }

    invalidateCsrLeadCaches(csrId);
    flushAdminClientsCache();
    return res.status(201).json({ success: true, lead });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to create lead" });
  }
});

/* ================= CSR CLIENTS (won deals — new vs old) ================= */

router.get("/clients", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId    = req.user.id;
    const cacheKey = `csr:clients:${csrId}`;
    const cached   = getCache<object>(cacheKey);
    if (cached) return res.json(cached);

    await reconcileClientOldFlagsForCsr(csrId);

    const clientWhere = {
      ...activeCsrLeadWhere(csrId),
      ...wonClientStatusWhere(),
    };
    const [ids, rawLeads] = await Promise.all([
      fetchLeadIdsByOldestNote(clientWhere),
      prisma.lead.findMany({
        where: clientWhere,
        select: CSR_CLIENT_LIST_SELECT,
      }),
    ]);

    const leads = reorderByIds(rawLeads, ids).map(lead => ({
      ...lead,
      isOldClient: lead.isOldClient,
    }));

    const activeWhere = activeCsrLeadWhere(csrId);
    const [importantCount, interestedCount, pendingCount, totalAssigned] = await Promise.all([
      prisma.lead.count({ where: { ...activeWhere, ...isImportantStatusWhere() } }),
      prisma.lead.count({ where: { ...activeWhere, ...isInterestedStatusWhere() } }),
      prisma.lead.count({ where: pendingLeadWhere(csrId) }),
      prisma.lead.count({ where: activeWhere }),
    ]);

    const payload = {
      success: true,
      leads,
      stats: { importantCount, interestedCount, pendingCount, totalAssigned },
    };
    setCache(cacheKey, payload, 45_000);
    return res.json(payload);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to fetch clients" });
  }
});

/* ================= CSR LEADS (new vs returning) ================= */

router.get("/leads", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId   = req.user.id;
    const cacheKey = `csr:leads:${csrId}`;
    const cached   = getCache<object>(cacheKey);
    if (cached) return res.json(cached);

    const rawLeads = await prisma.lead.findMany({
      where:   { assignedTo: csrId },
      include: { uploadFile: { select: CSR_UPLOAD_FILE_SELECT }, notes: { orderBy: { createdAt: "asc" } }, subContacts: { orderBy: { createdAt: "asc" } } },
    });
    const csrLeads = filterActiveLeads(rawLeads);
    const ids = await fetchLeadIdsByOldestNote({ assignedTo: csrId });

    const leads = reorderByIds(csrLeads, ids).map(lead => ({
      ...lead,
      isOldClient: lead.isOldClient,
    }));

    const payload = { success: true, leads };
    setCache(cacheKey, payload, 30_000);
    return res.json(payload);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to fetch leads" });
  }
});

/* ================= CSR PROJECTS ================= */

router.get("/projects", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId   = req.user.id;
    const cacheKey = `csr:projects:${csrId}`;
    const cached   = getCache<object>(cacheKey);
    if (cached) return res.json(cached);

    const projectWhere = buildProjectLeadWhere(csrId);
    const [ids, rawLeads] = await Promise.all([
      fetchLeadIdsByOldestNote(projectWhere),
      prisma.lead.findMany({
        where: projectWhere,
        select: {
          ...CSR_DASHBOARD_LEAD_SELECT,
          projectTitle: true,
          projectCode: true,
          projectDeadline: true,
          projectBudget: true,
          projectNotes: true,
          clientCode: true,
          isOldClient: true,
          projectPayments: true,
          notes: CSR_LIST_NOTES_SELECT,
        },
      }),
    ]);

    const leads = reorderByIds(rawLeads, ids).filter(isDisplayableProjectLead);

    const payload = { success: true, leads };
    setCache(cacheKey, payload, 30_000);
    return res.json(payload);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to fetch projects" });
  }
});

/* ================= LIST OTHER ACTIVE CSRs (for manual assign popup) ================= */

router.get("/csrs", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId = req.user.id;
    const csrs  = await prisma.user.findMany({
      where:   { id: { not: csrId }, role: "csr", isActive: true },
      select:  { id: true, name: true, csrCode: true },
      orderBy: { csrCode: "asc" },
    });
    return res.json({ success: true, csrs });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to fetch CSRs" });
  }
});

/* ================= MANUALLY ASSIGN LEAD TO SPECIFIC CSR ================= */

router.put("/lead/:id/assign", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId       = req.user.id;
    const leadId      = req.params.id as string;
    const { csrId: targetCsrId } = req.body;

    if (!targetCsrId) {
      return res.status(400).json({ success: false, message: "Target CSR ID is required" });
    }

    const lead = await prisma.lead.findFirst({ where: { id: leadId, assignedTo: csrId } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    const targetCsr = await prisma.user.findFirst({
      where: { id: targetCsrId, role: "csr", isActive: true },
    });
    if (!targetCsr) return res.status(404).json({ success: false, message: "Target CSR not found" });

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        assignedTo:         targetCsrId,
        status:             "pending",
        notInterestedCount: 0,
        notPickedCount:     0,
        important:          false,
        interested:         false,
        inBin:              false,
        binReason:          null,
        binPreviousStatus:  null,
      },
    });

    invalidateCsrLeadCaches(csrId, `csr:dashboard:${targetCsrId}`, `csr:leads:${targetCsrId}`, `csr:bin:${targetCsrId}`);
    return res.json({ success: true, message: `Lead assigned to ${targetCsr.name}` });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to assign lead" });
  }
});

/* ================= CSR BIN (not-picked leads) ================= */

router.get("/bin", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId    = req.user.id;
    const cacheKey = `csr:bin:${csrId}`;
    const cached   = getCache<object>(cacheKey);
    if (cached) return res.json(cached);

    const binWhere = buildBinWhere(csrId);
    const [ids, rawLeads] = await Promise.all([
      fetchLeadIdsByOldestNote(binWhere),
      prisma.lead.findMany({
        where: binWhere,
        select: {
          ...CSR_DASHBOARD_LEAD_SELECT,
          binReason: true,
          binPreviousStatus: true,
          notes: CSR_LIST_NOTES_SELECT,
        },
      }),
    ]);

    const leads = reorderByIds(rawLeads, ids);

    const payload = { success: true, leads };
    setCache(cacheKey, payload, 30_000);
    return res.json(payload);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to fetch bin" });
  }
});

/* ================= SUB-CONTACTS ================= */

router.post("/lead/:id/subcontacts", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId  = req.user.id;
    const leadId = req.params.id as string;
    const { name, designation, phone, email } = req.body as { name: string; designation?: string; phone?: string; email?: string };

    if (!name?.trim()) return res.status(400).json({ success: false, message: "Name is required" });

    const lead = await prisma.lead.findFirst({ where: { id: leadId, assignedTo: csrId } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    const subContact = await prisma.subContact.create({
      data: { leadId, name: name.trim(), designation: designation?.trim() || null, phone: phone?.trim() || null, email: email?.trim() || null },
    });
    invalidateCache(`csr:dashboard:${csrId}`, `csr:leads:${csrId}`, `csr:projects:${csrId}`, `csr:not-interested:${csrId}`);
    return res.status(201).json({ success: true, subContact });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to add sub-contact" });
  }
});

router.put("/lead/:id/subcontacts/:subId", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId  = req.user.id;
    const leadId = req.params.id as string;
    const subId  = req.params.subId as string;
    const { name, designation, phone, email } = req.body as { name?: string; designation?: string; phone?: string; email?: string };

    const lead = await prisma.lead.findFirst({ where: { id: leadId, assignedTo: csrId } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    const existing = await prisma.subContact.findFirst({ where: { id: subId, leadId } });
    if (!existing) return res.status(404).json({ success: false, message: "Sub-contact not found" });

    const subContact = await prisma.subContact.update({
      where: { id: subId },
      data: {
        ...(name         !== undefined ? { name: name.trim() } : {}),
        ...(designation  !== undefined ? { designation: designation?.trim() || null } : {}),
        ...(phone        !== undefined ? { phone: phone?.trim() || null } : {}),
        ...(email        !== undefined ? { email: email?.trim() || null } : {}),
      },
    });
    invalidateCache(`csr:dashboard:${csrId}`, `csr:leads:${csrId}`, `csr:projects:${csrId}`, `csr:not-interested:${csrId}`);
    return res.json({ success: true, subContact });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to update sub-contact" });
  }
});

router.delete("/lead/:id/subcontacts/:subId", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const csrId  = req.user.id;
    const leadId = req.params.id as string;
    const subId  = req.params.subId as string;

    const lead = await prisma.lead.findFirst({ where: { id: leadId, assignedTo: csrId } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    await prisma.subContact.delete({ where: { id: subId } });
    invalidateCache(`csr:dashboard:${csrId}`, `csr:leads:${csrId}`, `csr:projects:${csrId}`, `csr:not-interested:${csrId}`);
    return res.json({ success: true });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to delete sub-contact" });
  }
});

/* ================= CHECK IN / CHECK OUT ================= */

router.get("/shift-history", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const days = await listUserShiftHistory(req.user.id, "csr");
    return res.json({ success: true, days });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to load check-in history." });
  }
});

router.get("/work-session", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const status = await getCsrWorkSessionStatus(req.user.id);
    return res.json({ success: true, ...status });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to load work session." });
  }
});

router.post("/check-in", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const result = await checkInCsrWorkSession({
      userId: req.user.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      deviceId: req.body?.tabId ?? req.body?.deviceId,
    });
    let status = await getCsrWorkSessionStatus(req.user.id);
    /* Guarantee UI can flip to Check Out even if open-session lookup lags */
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

router.post("/check-out", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    await stampLastAction(req.user.id, req.body?.lastActionAt);
    const closed = await checkOutCsrWorkSession(req.user.id);
    return res.json({
      success: true,
      closed,
      checkedIn: false,
      paused: false,
      session: null,
      message: closed ? "Checked out successfully." : "No active check-in.",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Check-out failed." });
  }
});

router.post("/pause", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const ok = await pauseCsrWorkSession(req.user.id);
    if (!ok) {
      return res.status(400).json({ success: false, message: "Check in first before pausing." });
    }
    const status = await getCsrWorkSessionStatus(req.user.id);
    return res.json({
      success: true,
      message: "Paused — resume when you return to the dashboard.",
      ...status,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Pause failed." });
  }
});

router.post("/resume", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const ok = await resumeCsrWorkSession(req.user.id);
    if (!ok) {
      return res.status(400).json({ success: false, message: "Check in first before resuming." });
    }
    const status = await getCsrWorkSessionStatus(req.user.id);
    return res.json({
      success: true,
      message: "Resumed — work time tracking again.",
      ...status,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Resume failed." });
  }
});

router.get("/shift-window", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const staff = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { email: true, role: true },
    });
    const message = staff ? csrLoginBlocked(staff.role, staff.email) : null;
    return res.json({ success: true, shiftEnded: message != null, message });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Could not read the CSR shift window." });
  }
});

/* ================= HEARTBEAT ================= */

router.post("/heartbeat", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    const userId     = req.user.id;
    const userAgent  = req.body.userAgent ?? req.headers["user-agent"] ?? "";
    const tabId      = req.body.tabId      ?? "unknown";
    const openedAt   = req.body.openedAt   ?? new Date().toISOString();
    const tabVisible = req.body.tabVisible !== false;
    const hiddenAt   = req.body.hiddenAt   ?? null;

    const existing = userBrowserMap.get(userId);

    userBrowserMap.set(userId, {
      browser:    detectBrowser(userAgent),
      tabId,
      openedAt,
      tabVisible,
      hiddenAt: tabVisible
        ? null
        : (existing?.hiddenAt ?? hiddenAt ?? new Date().toISOString()),
    });

    const now = Date.now();
    const lastWrite = (existing as { lastDbWrite?: number } | undefined)?.lastDbWrite ?? 0;
    const wasVisible = existing?.tabVisible ?? true;
    const tabBecameHidden  = wasVisible && !tabVisible;
    const tabBecameVisible = !wasVisible && tabVisible;
    const shouldWriteDb = tabVisible && now - lastWrite >= 30_000;

    if (tabBecameHidden) {
      // Tab just went away — mark offline in DB immediately
      await prisma.user.update({
        where: { id: userId },
        data:  { isOnline: false },
      }).catch(() => {});
    } else if (tabBecameVisible || shouldWriteDb) {
      // Tab came back or regular heartbeat interval
      await prisma.user.update({
        where: { id: userId },
        data:  { isOnline: true, lastActive: new Date() },
      });
      const entry = userBrowserMap.get(userId)!;
      (entry as { lastDbWrite?: number }).lastDbWrite = now;
    }

    void recordHeartbeatAccess({
      userId,
      ip:        getClientIp(req),
      userAgent: userAgent,
      deviceId:  tabId,
    });

    const activeMs = Number(req.body?.activeMs);
    const inactiveMs = Number(req.body?.inactiveMs);
    const engagement = req.body?.trackEngagement === true
      && Number.isFinite(activeMs)
      && Number.isFinite(inactiveMs)
      ? { activeMs, inactiveMs }
      : null;

    void tickCsrWorkSession({
      userId,
      tabVisible,
      deviceId: tabId,
      lastActionAt: req.body?.lastActionAt,
      engagement,
    });

    const staff = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, role: true },
    });
    const shiftEnded = staff ? csrLoginBlocked(staff.role, staff.email) != null : false;

    return res.json({ success: true, shiftEnded });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false });
  }
});

/* ================= OFFLINE (Users page presence only) ================= */
/* Does not close work sessions — reports keep tracking until Check Out or Logout. */

router.post("/offline", verifyToken, allowRoles("csr"), async (req: any, res) => {
  try {
    userBrowserMap.delete(req.user.id);
    await prisma.user.update({
      where: { id: req.user.id },
      data:  { isOnline: false },
    });
    return res.json({ success: true });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false });
  }
});

/* ================= TRADES (read-only for CSR) ================= */
router.get("/trades", verifyToken, allowRoles("csr"), async (_req, res) => {
  try {
    await ensureMasterFormatTrades();
    const trades = await prisma.trade.findMany({ orderBy: { name: "asc" } });
    return res.json({ success: true, trades });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to fetch trades" });
  }
});

export default router;