"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const db_1 = __importDefault(require("../config/db"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const role_middleware_1 = require("../middleware/role.middleware");
const cache_1 = require("../utils/cache");
const chatSocket_1 = require("../chat/chatSocket");
const csrCache_1 = require("../utils/csrCache");
const purgeCsrLeads_1 = require("../utils/purgeCsrLeads");
const csrResetPages_1 = require("../utils/csrResetPages");
const uploadSourceStats_1 = require("../utils/uploadSourceStats");
const projectLeads_1 = require("../utils/projectLeads");
const csrDashboardQueries_1 = require("../utils/csrDashboardQueries");
const projectPayments_1 = require("../utils/projectPayments");
const projectCurrencyCollections_1 = require("../utils/projectCurrencyCollections");
const binLeads_1 = require("../utils/binLeads");
const leadPhoneLookup_1 = require("../utils/leadPhoneLookup");
const leadDuplicateCheck_1 = require("../utils/leadDuplicateCheck");
const uploadSourceSelect_1 = require("../utils/uploadSourceSelect");
const phone_1 = require("../utils/phone");
const adminClientQueries_1 = require("../utils/adminClientQueries");
const masterFormatTrades_1 = require("../utils/masterFormatTrades");
const adminIp_middleware_1 = require("../middleware/adminIp.middleware");
const csrSessionTracking_1 = require("../utils/csrSessionTracking");
const estTime_1 = require("../utils/estTime");
const deleteLeadsCascade_1 = require("../utils/deleteLeadsCascade");
const adminSummaryStats_1 = require("../utils/adminSummaryStats");
const nextProjectCode_1 = require("../utils/nextProjectCode");
const technicalMonitoring_1 = require("../utils/technicalMonitoring");
const technicalKpiRecords_1 = require("../utils/technicalKpiRecords");
const estimatorKpiAuto_1 = require("../utils/estimatorKpiAuto");
const previousMonthRatings_1 = require("../utils/previousMonthRatings");
const paymentsSummary_1 = require("../utils/paymentsSummary");
const technicalEstimators_1 = require("../utils/technicalEstimators");
const projectDbExcel_1 = require("../utils/projectDbExcel");
const csrDataExcelExport_1 = require("../utils/csrDataExcelExport");
const upload_middleware_1 = require("../middleware/upload.middleware");
const technicalNotifications_1 = require("../utils/technicalNotifications");
const companyCredential_controller_1 = require("../controllers/companyCredential.controller");
const router = express_1.default.Router();
router.use(adminIp_middleware_1.enforceAdminIpAllowlist);
async function resolveCsrAssignedTo(csrIdRaw, csrNameRaw) {
    const csrId = csrIdRaw?.trim();
    const csrName = csrNameRaw?.trim();
    if (csrId && csrId !== "all")
        return { csrId };
    if (csrName && csrName !== "all") {
        const u = await db_1.default.user.findFirst({
            where: { role: "csr", name: csrName },
            select: { id: true },
        });
        if (u)
            return { csrId: u.id, csrName };
    }
    return {};
}
router.get("/company-credentials", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin"), companyCredential_controller_1.listCompanyCredentials);
router.put("/company-credentials/:company", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin"), companyCredential_controller_1.upsertCompanyCredential);
router.delete("/company-credentials/:company", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin"), companyCredential_controller_1.deleteCompanyCredential);
function applyProjectPayload(updateData, body) {
    const scalars = [
        "name", "company", "phone", "email", "state", "ownerName", "timezone",
        "projectCode", "clientCode", "projectTitle", "projectScope", "interestedService",
        "projectBudget", "projectDeadline", "deadlineTiming", "projectNotes", "projectPhase",
        "takeoffDeadline", "pricingDeadline", "qaDeadline", "projectSource",
        "projectWorkStatus",
    ];
    for (const key of scalars) {
        if (body[key] !== undefined)
            updateData[key] = body[key];
    }
    // Empty emergency timing clears the badge on Technical
    if (body.deadlineTiming !== undefined) {
        const t = String(body.deadlineTiming ?? "").trim().toLowerCase();
        updateData.deadlineTiming = t === "morning" || t === "cob" ? t : null;
    }
    if (body.status !== undefined) {
        updateData.status = body.status;
    }
    // Keep Project DB membership in sync with work status
    const work = body.projectWorkStatus != null ? String(body.projectWorkStatus) : "";
    if (work === "completed") {
        updateData.status = "completed";
        updateData.projectWorkStatus = "completed";
    }
    else if (work === "in_progress" || work === "not_completed") {
        updateData.status = "Close Client";
        updateData.projectWorkStatus = work;
    }
    const payments = (0, projectPayments_1.normalizePaymentsInput)(body.projectPayments);
    if (payments !== undefined) {
        updateData.projectPayments = payments;
        updateData.paidAmount = String((0, projectPayments_1.paidTotalFromEntries)((0, projectPayments_1.parseProjectPayments)(payments)));
    }
    else if (body.paidAmount !== undefined) {
        updateData.paidAmount = body.paidAmount;
    }
    if (body.technicalAssignments !== undefined) {
        updateData.technicalAssignments = (0, technicalEstimators_1.normalizeTechnicalAssignmentsInput)(body.technicalAssignments) ?? "[]";
    }
    if (body.technicalReceivedAt !== undefined) {
        updateData.technicalReceivedAt = body.technicalReceivedAt
            ? new Date(String(body.technicalReceivedAt))
            : null;
    }
}
/* ================= ADMIN DASHBOARD ================= */
router.get("/dashboard", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin"), (req, res) => {
    res.json({ success: true, message: "Welcome Admin" });
});
/* ================= ADMIN MEETING + TECHNICAL NOTE NOTIFICATIONS ================= */
router.get("/notifications", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const today = (0, estTime_1.estDateYmd)();
        const csrId = typeof req.query.csrId === "string" ? req.query.csrId : undefined;
        const rawScheduled = await db_1.default.lead.findMany({
            where: {
                ...(csrId ? { assignedTo: csrId } : {}),
                status: "important",
                nextSchedule: { gte: today, not: null },
                nextTime: { not: null },
            },
            select: {
                id: true,
                name: true,
                status: true,
                notPickedCount: true,
                notInterestedCount: true,
                nextSchedule: true,
                nextTime: true,
                timezone: true,
                csr: { select: { id: true, name: true, csrCode: true } },
            },
            orderBy: [{ nextSchedule: "asc" }, { nextTime: "asc" }],
            take: 50,
        });
        const scheduledLeads = (0, binLeads_1.filterActiveLeads)(rawScheduled);
        const scheduledCalls = scheduledLeads
            .slice(0, 30)
            .map((l) => ({
            id: l.id,
            client: l.name ?? "Client",
            date: l.nextSchedule,
            time: l.nextTime,
            timezone: l.timezone ?? "",
            csrName: l.csr?.name ?? "",
            csrCode: l.csr?.csrCode ?? "",
            csrId: l.csr?.id ?? "",
        }));
        // Alerts from Technical "Notes for Sir"
        const techAlertLeads = await db_1.default.lead.findMany({
            where: (0, projectLeads_1.buildProjectLeadWhere)(csrId),
            select: {
                id: true,
                name: true,
                projectTitle: true,
                projectCode: true,
                clientCode: true,
                technicalNotes: true,
                updatedAt: true,
            },
            orderBy: { updatedAt: "desc" },
            take: 120,
        });
        // Only TM replies on Admin↔TM ("sir") thread — not admin's own messages
        const technicalNotes = techAlertLeads
            .map((l) => {
            const notes = (0, technicalEstimators_1.parseTechnicalNotes)(l.technicalNotes).filter((n) => n.authorRole === "technical_manager");
            const latest = notes[notes.length - 1];
            if (!latest)
                return null;
            return {
                id: `tn-${l.id}-${latest.id}`,
                leadId: l.id,
                projectTitle: l.projectTitle || l.name || "Project",
                projectCode: l.projectCode || l.clientCode || "",
                preview: latest.text,
                authorName: latest.authorName || "Technical",
                createdAt: latest.createdAt || l.updatedAt.toISOString(),
            };
        })
            .filter((x) => !!x)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 30);
        return res.json({ success: true, scheduledCalls, technicalNotes });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to fetch notifications" });
    }
});
/* Mark technical-note alert as read for Admin (dismiss is primarily client-side) */
router.put("/lead/:id/technical-notes/read", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (_req, res) => {
    return res.json({ success: true });
});
/* ================= GET ALL CSRS ================= */
router.get("/csrs", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const role = req.query.role === "estimator" ? "estimator" : "csr";
        const CACHE_KEY = role === "estimator" ? "admin:estimators:list" : "admin:csrs";
        const cached = (0, cache_1.getCache)(CACHE_KEY);
        if (cached)
            return res.json(cached);
        const csrs = await db_1.default.user.findMany({
            where: { role },
            select: {
                id: true,
                name: true,
                email: true,
                csrCode: true,
                isActive: true,
                isOnline: true,
                lastActive: true,
                createdAt: true,
                _count: { select: { leads: true } },
            },
            orderBy: { csrCode: "asc" },
        });
        const payload = { success: true, csrs };
        (0, cache_1.setCache)(CACHE_KEY, payload, 15000);
        return res.json(payload);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to fetch CSRs" });
    }
});
/* ================= CSR FULL PAGE DATA EXCEL ================= */
router.get("/csrs/:csrId/data-export", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const csrId = String(req.params.csrId ?? "").trim();
        if (!csrId) {
            return res.status(400).json({ success: false, message: "CSR is required" });
        }
        const { buffer, filename } = await (0, csrDataExcelExport_1.buildCsrPagesExcel)(csrId);
        const asciiName = filename.replace(/[^\x20-\x7E]/g, "_");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
        res.setHeader("Content-Length", String(buffer.length));
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).end(buffer);
    }
    catch (error) {
        const status = Number(error?.status) || 500;
        const message = status === 404 ? "CSR not found" : "Failed to export CSR data";
        console.log(error);
        return res.status(status).json({ success: false, message });
    }
});
/* ================= CLIENT TAB COUNTS (leads page — lightweight) ================= */
router.get("/clients/tab-counts", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const search = req.query.search ? String(req.query.search) : undefined;
        const state = req.query.state ? String(req.query.state) : undefined;
        const phonePrefix = req.query.phone ? String(req.query.phone) : undefined;
        const scheduleDate = req.query.scheduleDate ? String(req.query.scheduleDate) : undefined;
        const csrName = req.query.csr ? String(req.query.csr) : undefined;
        const csrIdRaw = req.query.csrId ? String(req.query.csrId) : undefined;
        const areaCodesRaw = req.query.areaCodes ? String(req.query.areaCodes) : "";
        const areaCodes = areaCodesRaw
            .split(",")
            .map(s => s.trim())
            .filter(Boolean);
        const assignee = await resolveCsrAssignedTo(csrIdRaw, csrName);
        const hasFilters = !!(search || state || phonePrefix || scheduleDate || areaCodes.length || assignee.csrId);
        const CACHE_KEY = hasFilters
            ? `admin:clients:tab-counts:v10:${search ?? ""}:${state ?? ""}:${phonePrefix ?? ""}:${scheduleDate ?? ""}:${areaCodes.join(",")}:${assignee.csrId ?? "all"}`
            : "admin:clients:tab-counts:v10";
        const cached = (0, cache_1.getCache)(CACHE_KEY);
        if (cached)
            return res.json(cached);
        const payload = await (0, adminSummaryStats_1.buildAdminTabCountsPayload)(hasFilters
            ? {
                search,
                state,
                phonePrefix,
                areaCodes,
                scheduleDate,
                csrName: assignee.csrName,
                csrId: assignee.csrId,
            }
            : undefined);
        (0, cache_1.setCache)(CACHE_KEY, payload, hasFilters ? 20000 : 60000);
        return res.json(payload);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to fetch tab counts" });
    }
});
/* ================= CLIENT SUMMARY (fast — dashboard tiles & charts) ================= */
router.get("/clients/summary", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (_req, res) => {
    try {
        const CACHE_KEY = "admin:clients:summary:v6";
        const cached = (0, cache_1.getCache)(CACHE_KEY);
        if (cached)
            return res.json(cached);
        const payload = await (0, adminSummaryStats_1.buildAdminClientSummaryPayload)();
        (0, cache_1.setCache)(CACHE_KEY, payload, 180000);
        return res.json(payload);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to fetch client summary" });
    }
});
/* ================= GET CLIENTS / LEADS (paginated — admin leads page) ================= */
router.get("/clients", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const view = String(req.query.view || "all");
        const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "50"), 10) || 50));
        const csrName = req.query.csr ? String(req.query.csr) : undefined;
        const csrIdRaw = req.query.csrId ? String(req.query.csrId) : undefined;
        const search = req.query.search ? String(req.query.search) : undefined;
        const scheduleDate = req.query.scheduleDate ? String(req.query.scheduleDate) : undefined;
        const state = req.query.state ? String(req.query.state) : undefined;
        const phonePrefix = req.query.phone ? String(req.query.phone) : undefined;
        const areaCodes = req.query.areaCodes
            ? String(req.query.areaCodes).split(",").map(s => s.trim()).filter(Boolean)
            : [];
        const sortRaw = String(req.query.sort || "notes").toLowerCase();
        const sortBy = sortRaw === "clientcode" || sortRaw === "client_code" ? "clientCode" : "notes";
        const sortDir = String(req.query.dir || "desc").toLowerCase() === "asc" ? "asc" : "desc";
        const assignee = await resolveCsrAssignedTo(csrIdRaw, csrName);
        const cacheKey = `admin:clients:list:v14:${view}:${page}:${limit}:${sortBy}:${sortDir}:${assignee.csrId ?? "all"}:${search ?? ""}:${scheduleDate ?? ""}:${state ?? ""}:${phonePrefix ?? ""}:${areaCodes.join(",")}`;
        const cached = (0, cache_1.getCache)(cacheKey);
        if (cached)
            return res.json(cached);
        const fetchView = search
            ? "all"
            : view === "important" || view === "schedule" ? "important_status" : view;
        const where = (0, adminClientQueries_1.buildAdminClientListWhere)(fetchView, assignee.csrName, search, undefined, {
            state,
            phonePrefix,
            areaCodes,
            csrId: assignee.csrId,
        });
        const identitySelect = {
            id: true,
            phone: true,
            email: true,
            company: true,
            clientCode: true,
            projectCode: true,
            interestedService: true,
            nextSchedule: true,
            updatedAt: true,
            createdAt: true,
        };
        const identityRows = await db_1.default.lead.findMany({
            where,
            select: identitySelect,
        });
        const viewRows = view === "important" ? identityRows.filter(l => !(0, adminClientQueries_1.leadHasMeetingDate)(l.nextSchedule))
            : view === "schedule" ? identityRows.filter(l => {
                if (!(0, adminClientQueries_1.leadHasMeetingDate)(l.nextSchedule))
                    return false;
                if (scheduleDate)
                    return l.nextSchedule === scheduleDate;
                return true;
            })
                : identityRows;
        const preferClientCode = view === "closed";
        const { unique, extraProjectCountById, extraProjectsById } = (0, adminClientQueries_1.dedupeAdminLeads)(viewRows, preferClientCode);
        const codeKey = (code) => (code || "").trim();
        const latestNoteMs = new Map();
        if (sortBy === "notes" && viewRows.length) {
            const noteIds = [...new Set(viewRows.map(l => l.id))];
            for (let i = 0; i < noteIds.length; i += 800) {
                const chunk = noteIds.slice(i, i + 800);
                const grouped = await db_1.default.leadNote.groupBy({
                    by: ["leadId"],
                    where: { leadId: { in: chunk } },
                    _max: { createdAt: true },
                }).catch(async () => {
                    const notes = await db_1.default.leadNote.findMany({
                        where: { leadId: { in: chunk } },
                        select: { leadId: true, createdAt: true },
                    });
                    return notes.map(n => ({
                        leadId: n.leadId,
                        _max: { createdAt: n.createdAt },
                    }));
                });
                for (const row of grouped) {
                    const t = row._max.createdAt?.getTime() ?? 0;
                    if (t > (latestNoteMs.get(row.leadId) ?? 0))
                        latestNoteMs.set(row.leadId, t);
                }
            }
        }
        const groupNoteMs = new Map();
        if (sortBy === "notes") {
            for (const row of viewRows) {
                const key = (0, adminClientQueries_1.adminLeadIdentityKey)(row, preferClientCode);
                const t = latestNoteMs.get(row.id) ?? 0;
                groupNoteMs.set(key, Math.max(groupNoteMs.get(key) ?? 0, t));
            }
        }
        const uniqueRows = unique.sort((a, b) => {
            if (sortBy === "clientCode") {
                const sa = codeKey(a.clientCode);
                const sb = codeKey(b.clientCode);
                if (!sa && !sb)
                    return b.updatedAt.getTime() - a.updatedAt.getTime();
                if (!sa)
                    return 1;
                if (!sb)
                    return -1;
                const cmp = sa.localeCompare(sb, undefined, { numeric: true, sensitivity: "base" });
                return sortDir === "asc" ? cmp : -cmp;
            }
            const ka = (0, adminClientQueries_1.adminLeadIdentityKey)(a, preferClientCode);
            const kb = (0, adminClientQueries_1.adminLeadIdentityKey)(b, preferClientCode);
            const na = groupNoteMs.get(ka) || a.updatedAt.getTime();
            const nb = groupNoteMs.get(kb) || b.updatedAt.getTime();
            if (na !== nb) {
                return sortDir === "asc" ? na - nb : nb - na;
            }
            return sortDir === "asc"
                ? a.updatedAt.getTime() - b.updatedAt.getTime()
                : b.updatedAt.getTime() - a.updatedAt.getTime();
        });
        const total = uniqueRows.length;
        const pageIds = uniqueRows
            .slice((page - 1) * limit, page * limit)
            .map(l => l.id);
        const rawLeads = pageIds.length
            ? await db_1.default.lead.findMany({
                where: { id: { in: pageIds } },
                select: adminClientQueries_1.ADMIN_LEAD_LIST_SELECT,
            })
            : [];
        const byId = new Map(rawLeads.map(l => [l.id, l]));
        const leads = pageIds.map(id => {
            const row = byId.get(id);
            if (!row)
                return null;
            return {
                ...row,
                extraProjectCount: extraProjectCountById.get(id) ?? 0,
                extraProjects: extraProjectsById.get(id) ?? [],
            };
        }).filter((l) => !!l);
        const payload = {
            success: true,
            leads,
            total,
            page,
            limit,
            stats: {
                totalClients: total,
            },
        };
        (0, cache_1.setCache)(cacheKey, payload, 60000);
        return res.json(payload);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to fetch clients" });
    }
});
/* ================= CREATE LEAD (ADMIN manual add) ================= */
router.post("/lead", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const adminId = req.user?.id;
        if (!adminId)
            return res.status(401).json({ success: false, message: "Unauthorized" });
        const { name, email, phone, company, status, csrId, interestedService, comments } = req.body;
        if (!name?.trim())
            return res.status(400).json({ success: false, message: "Client name is required." });
        if (!email?.trim())
            return res.status(400).json({ success: false, message: "Email is required." });
        const dup = await (0, leadDuplicateCheck_1.findDuplicateLead)(phone, email);
        if (dup)
            return res.status(409).json({ success: false, message: dup.message, field: dup.field });
        let assignTo = adminId;
        if (csrId) {
            const csr = await db_1.default.user.findFirst({ where: { id: csrId, role: "csr", isActive: true } });
            if (!csr)
                return res.status(400).json({ success: false, message: "Invalid CSR." });
            assignTo = csr.id;
        }
        const trimmedPhone = phone?.trim() || null;
        const existingLeads = trimmedPhone ? await (0, leadPhoneLookup_1.findLeadsByPhone)(trimmedPhone) : [];
        const rawStatus = String(status ?? "Close Client").trim();
        const n = rawStatus.toLowerCase();
        const canonical = n === "interested" ? "interested" :
            n === "important" ? "important" :
                "Close Client";
        const lead = await db_1.default.lead.create({
            data: {
                name: name.trim(),
                email: email.trim().toLowerCase(),
                phone: trimmedPhone,
                company: company?.trim() || null,
                status: canonical,
                assignedTo: assignTo,
                important: canonical === "important",
                interested: canonical === "interested",
                isOldClient: existingLeads.length > 0,
                hiddenOnMain: canonical === "Close Client",
                inBin: false,
                interestedService: interestedService?.trim() || null,
                comments: comments?.trim() || null,
            },
            include: { csr: { select: { id: true, name: true, csrCode: true } } },
        });
        (0, cache_1.flushAdminClientsCache)();
        if (assignTo !== adminId) {
            (0, cache_1.invalidateCache)(`csr:dashboard:${assignTo}`, `csr:leads:${assignTo}`);
        }
        return res.status(201).json({ success: true, lead });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to create lead" });
    }
});
/* ================= GET SINGLE LEAD (ADMIN) ================= */
router.get("/lead/:id", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const lead = await db_1.default.lead.findFirst({
            where: { id: leadId },
            include: {
                uploadFile: { select: { companyName: true } },
                notes: { orderBy: { createdAt: "asc" } },
                subContacts: { orderBy: { createdAt: "asc" } },
                csr: { select: { id: true, name: true, csrCode: true } },
            },
        });
        if (!lead)
            return res.status(404).json({ success: false, message: "Lead not found" });
        return res.json({ success: true, lead });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to fetch lead" });
    }
});
/* ================= DELETE LEAD / PROJECT (ADMIN) — permanent Project DB delete ================= */
router.delete("/lead/:id", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const lead = await db_1.default.lead.findFirst({
            where: { id: leadId },
            select: { id: true, assignedTo: true, name: true, projectTitle: true },
        });
        if (!lead) {
            return res.status(404).json({ success: false, message: "Lead not found" });
        }
        const deleted = await (0, deleteLeadsCascade_1.deleteLeadsCascade)([leadId]);
        await (0, deleteLeadsCascade_1.invalidateAllLeadCaches)(lead.assignedTo ? [lead.assignedTo] : undefined);
        const gone = await (0, deleteLeadsCascade_1.isRemovedFromProjectDb)(leadId);
        if (!gone) {
            return res.status(500).json({
                success: false,
                message: "Failed to remove project from Project DB",
            });
        }
        return res.json({
            success: true,
            message: `"${lead.projectTitle || lead.name || "Record"}" deleted permanently`,
            deleted,
            permanent: true,
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to delete lead" });
    }
});
/* ================= DELETE PROJECT (Project DB only — CSR client kept) ================= */
router.delete("/project/:id", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const lead = await db_1.default.lead.findFirst({
            where: { id: leadId },
            select: { id: true, assignedTo: true, name: true, projectTitle: true },
        });
        if (!lead) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }
        const deleted = await (0, deleteLeadsCascade_1.removeProjectsKeepClients)([leadId]);
        await (0, deleteLeadsCascade_1.invalidateAllLeadCaches)(lead.assignedTo ? [lead.assignedTo] : undefined);
        const gone = await (0, deleteLeadsCascade_1.isRemovedFromProjectDb)(leadId);
        if (!gone) {
            return res.status(500).json({
                success: false,
                message: "Failed to remove project from Project DB",
            });
        }
        return res.json({
            success: true,
            message: `"${lead.projectTitle || lead.name || "Project"}" removed from Project DB (CSR client kept)`,
            deleted,
            permanent: false,
            clientKept: true,
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to delete project" });
    }
});
/* ================= UPDATE LEAD DETAILS (ADMIN) ================= */
router.put("/lead/:id", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const { name, phone, email, state, company, website, interestedService, clientCode, nextSchedule, nextTime, timezone, status, isOldClient } = req.body;
        const existing = await db_1.default.lead.findFirst({ where: { id: leadId } });
        if (!existing)
            return res.status(404).json({ success: false, message: "Lead not found" });
        const updateData = {};
        if (name !== undefined)
            updateData.name = name;
        if (phone !== undefined)
            updateData.phone = phone;
        if (email !== undefined)
            updateData.email = email;
        if (state !== undefined)
            updateData.state = state;
        if (company !== undefined)
            updateData.company = company;
        if (website !== undefined)
            updateData.website = String(website ?? "").trim() || null;
        if (interestedService !== undefined) {
            updateData.interestedService = String(interestedService ?? "").trim() || null;
        }
        if (clientCode !== undefined) {
            const code = String(clientCode ?? "").trim();
            updateData.clientCode = code || null;
        }
        if (nextSchedule !== undefined)
            updateData.nextSchedule = String(nextSchedule ?? "").trim() || null;
        if (nextTime !== undefined)
            updateData.nextTime = String(nextTime ?? "").trim() || null;
        if (timezone !== undefined)
            updateData.timezone = String(timezone ?? "").trim() || null;
        if (typeof isOldClient === "boolean")
            updateData.isOldClient = isOldClient;
        if (status !== undefined) {
            const raw = String(status).trim();
            const n = raw.toLowerCase();
            const canonical = n === "not interested" ? "Not Interested" :
                n === "not picked" || n === "notpicked" ? "not picked" :
                    n === "close client" || n === "closed" ? "Close Client" :
                        n === "no owner available" ? "no owner available" :
                            n === "not in service" ? "not in service" :
                                n === "in house" ? "in house" :
                                    n === "important" ? "important" :
                                        n === "interested" ? "interested" :
                                            n === "pending" ? "pending" :
                                                raw;
            updateData.status = canonical;
            updateData.important = canonical === "important";
            updateData.interested = canonical === "interested";
        }
        const dup = await (0, leadDuplicateCheck_1.findDuplicateLead)(phone !== undefined ? String(phone) : existing.phone, email !== undefined ? String(email) : existing.email, leadId);
        if (dup && (phone !== undefined || email !== undefined)) {
            return res.status(409).json({ success: false, message: dup.message, field: dup.field });
        }
        const lead = await db_1.default.lead.update({ where: { id: leadId }, data: updateData });
        (0, cache_1.flushAdminClientsCache)();
        return res.json({ success: true, lead });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to update lead" });
    }
});
router.post("/lead/:id/subcontacts", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const { name, designation, phone, email } = req.body;
        if (!name?.trim())
            return res.status(400).json({ success: false, message: "Name is required" });
        const lead = await db_1.default.lead.findFirst({ where: { id: leadId } });
        if (!lead)
            return res.status(404).json({ success: false, message: "Lead not found" });
        const subContact = await db_1.default.subContact.create({
            data: { leadId, name: name.trim(), designation: designation?.trim() || null, phone: phone?.trim() || null, email: email?.trim() || null },
        });
        (0, cache_1.flushAdminClientsCache)();
        (0, cache_1.invalidateCache)(`csr:dashboard:${lead.assignedTo}`, `csr:leads:${lead.assignedTo}`);
        return res.status(201).json({ success: true, subContact });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to add sub-contact" });
    }
});
router.put("/lead/:id/subcontacts/:subId", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const subId = String(req.params.subId);
        const { name, designation, phone, email } = req.body;
        const lead = await db_1.default.lead.findFirst({ where: { id: leadId } });
        if (!lead)
            return res.status(404).json({ success: false, message: "Lead not found" });
        const existing = await db_1.default.subContact.findFirst({ where: { id: subId, leadId } });
        if (!existing)
            return res.status(404).json({ success: false, message: "Sub-contact not found" });
        const subContact = await db_1.default.subContact.update({
            where: { id: subId },
            data: {
                ...(name !== undefined ? { name: name.trim() } : {}),
                ...(designation !== undefined ? { designation: designation?.trim() || null } : {}),
                ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
                ...(email !== undefined ? { email: email?.trim() || null } : {}),
            },
        });
        (0, cache_1.flushAdminClientsCache)();
        (0, cache_1.invalidateCache)(`csr:dashboard:${lead.assignedTo}`, `csr:leads:${lead.assignedTo}`);
        return res.json({ success: true, subContact });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to update sub-contact" });
    }
});
router.delete("/lead/:id/subcontacts/:subId", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const subId = String(req.params.subId);
        const lead = await db_1.default.lead.findFirst({ where: { id: leadId } });
        if (!lead)
            return res.status(404).json({ success: false, message: "Lead not found" });
        await db_1.default.subContact.delete({ where: { id: subId } });
        (0, cache_1.flushAdminClientsCache)();
        (0, cache_1.invalidateCache)(`csr:dashboard:${lead.assignedTo}`, `csr:leads:${lead.assignedTo}`);
        return res.json({ success: true });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to delete sub-contact" });
    }
});
/* ================= UPDATE LEAD NOTE ================= */
router.patch("/lead/:id/note", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const { comments } = req.body;
        await db_1.default.lead.update({
            where: { id: String(req.params.id) },
            data: { comments: comments ?? "" },
        });
        (0, cache_1.flushAdminClientsCache)();
        return res.json({ success: true });
    }
    catch {
        return res.status(500).json({ success: false, message: "Failed to save note" });
    }
});
/* ================= ADMIN TIMESTAMPED NOTES (shared with CSR; parentId = reply) ================= */
router.post("/lead/:id/notes", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const { text, parentId } = req.body;
        if (!text?.trim())
            return res.status(400).json({ success: false, message: "Note text required" });
        const lead = await db_1.default.lead.findFirst({ where: { id: leadId } });
        if (!lead)
            return res.status(404).json({ success: false, message: "Lead not found" });
        let parent;
        if (parentId?.trim()) {
            const p = await db_1.default.leadNote.findFirst({
                where: { id: parentId.trim(), leadId, parentId: null },
            });
            if (!p)
                return res.status(400).json({ success: false, message: "Parent note not found" });
            parent = p.id;
        }
        const note = await db_1.default.leadNote.create({
            data: { text: text.trim(), leadId, ...(parent ? { parentId: parent } : {}) },
        });
        await db_1.default.lead.update({ where: { id: leadId }, data: { updatedAt: new Date() } });
        (0, cache_1.flushAdminClientsCache)();
        (0, cache_1.invalidateCache)(`csr:projects:${lead.assignedTo}`, `csr:leads:${lead.assignedTo}`);
        return res.json({ success: true, note });
    }
    catch {
        return res.status(500).json({ success: false, message: "Failed to add note" });
    }
});
router.put("/lead/:id/notes/:noteId", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const { noteId } = req.params;
        const { text } = req.body;
        if (!text?.trim())
            return res.status(400).json({ success: false, message: "Note text required" });
        const note = await db_1.default.leadNote.findFirst({ where: { id: noteId, leadId } });
        if (!note)
            return res.status(404).json({ success: false, message: "Note not found" });
        const updated = await db_1.default.leadNote.update({
            where: { id: noteId },
            data: { text: text.trim(), createdAt: new Date() },
        });
        await db_1.default.lead.update({ where: { id: leadId }, data: { updatedAt: new Date() } });
        (0, cache_1.flushAdminClientsCache)();
        return res.json({ success: true, note: updated });
    }
    catch {
        return res.status(500).json({ success: false, message: "Failed to update note" });
    }
});
router.delete("/lead/:id/notes/:noteId", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const { noteId } = req.params;
        const note = await db_1.default.leadNote.findFirst({ where: { id: noteId, leadId } });
        if (!note)
            return res.status(404).json({ success: false, message: "Note not found" });
        await db_1.default.leadNote.deleteMany({ where: { leadId, OR: [{ id: noteId }, { parentId: noteId }] } });
        (0, cache_1.flushAdminClientsCache)();
        return res.json({ success: true });
    }
    catch {
        return res.status(500).json({ success: false, message: "Failed to delete note" });
    }
});
/* ================= TECHNICAL WORKING NOTES (Admin↔TM / TM↔Estimator threads) ================= */
router.post("/lead/:id/technical-notes", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const body = req.body;
        const text = String(body?.text ?? "").trim();
        if (!text)
            return res.status(400).json({ success: false, message: "Note text required" });
        const threadRaw = String(body?.thread ?? "sir").toLowerCase();
        const thread = threadRaw === "estimator" ? "estimator" : "sir";
        const lead = await db_1.default.lead.findFirst({
            where: { id: leadId },
            select: {
                id: true,
                assignedTo: true,
                technicalNotes: true,
                projectTitle: true,
                projectCode: true,
                clientCode: true,
            },
        });
        if (!lead)
            return res.status(404).json({ success: false, message: "Lead not found" });
        const authUser = req.user;
        const role = authUser?.role ?? "admin";
        let authorName = authUser?.name?.trim() || "";
        if (!authorName && authUser?.id) {
            const u = await db_1.default.user.findUnique({
                where: { id: authUser.id },
                select: { name: true },
            });
            authorName = u?.name?.trim() || "";
        }
        const { bundle, note, list } = (0, technicalEstimators_1.appendTechnicalNote)(lead.technicalNotes, text, thread, {
            authorId: authUser?.id,
            authorRole: role,
            authorName: authorName || undefined,
        });
        await db_1.default.lead.update({
            where: { id: leadId },
            data: {
                technicalNotes: (0, technicalEstimators_1.serializeTechnicalNotesBundle)(bundle),
            },
        });
        (0, cache_1.flushAdminClientsCache)();
        (0, cache_1.invalidatePattern)("admin:projects:");
        (0, cache_1.invalidateCache)(`csr:projects:${lead.assignedTo}`, `csr:leads:${lead.assignedTo}`);
        const label = (0, technicalNotifications_1.projectLabel)(lead.projectCode || lead.clientCode, lead.projectTitle);
        if (thread === "sir" && role !== "technical_manager") {
            void (0, technicalNotifications_1.notifyTmFromActor)({
                actorId: authUser?.id,
                leadId,
                projectTitle: lead.projectTitle,
                projectCode: lead.projectCode || lead.clientCode,
                source: "admin",
                title: "Notes for Sir",
                message: `${authorName || "Admin"} on ${label}: ${text.slice(0, 160)}`,
                changes: ["Notes for Sir"],
            });
        }
        if (thread === "estimator" && (role === "technical_manager" || role === "admin" || role === "manager")) {
            void (0, technicalNotifications_1.pushTechnicalNotification)({
                leadId,
                projectTitle: lead.projectTitle,
                projectCode: lead.projectCode || lead.clientCode,
                source: "tm_estimator",
                actorId: authUser?.id,
                actorName: authorName || authUser?.name,
                actorRole: role,
                title: "Notes for Chief Estimator",
                message: `${authorName || "Technical"} on ${label}: ${text.slice(0, 160)}`,
                changes: ["Notes for Estimator"],
            });
        }
        return res.json({
            success: true,
            note,
            thread,
            technicalNotes: list,
            technicalNotesBundle: bundle,
        });
    }
    catch (err) {
        console.error("technical-notes error:", err);
        return res.status(500).json({ success: false, message: "Failed to add technical note" });
    }
});
router.put("/lead/:id/technical-notes/:noteId", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const noteId = String(req.params.noteId);
        const text = String(req.body?.text ?? "").trim();
        if (!text)
            return res.status(400).json({ success: false, message: "Note text required" });
        const lead = await db_1.default.lead.findFirst({
            where: { id: leadId },
            select: { id: true, assignedTo: true, technicalNotes: true },
        });
        if (!lead)
            return res.status(404).json({ success: false, message: "Lead not found" });
        const authUser = req.user;
        const actorId = authUser?.id ?? "";
        if (!actorId)
            return res.status(401).json({ success: false, message: "Unauthorized" });
        const result = (0, technicalEstimators_1.updateTechnicalNote)(lead.technicalNotes, noteId, text, actorId, {
            actorRole: authUser?.role,
        });
        if ("error" in result) {
            const status = result.error.includes("author") ? 403 : 404;
            return res.status(status).json({ success: false, message: result.error });
        }
        await db_1.default.lead.update({
            where: { id: leadId },
            data: { technicalNotes: (0, technicalEstimators_1.serializeTechnicalNotesBundle)(result.bundle) },
        });
        (0, cache_1.flushAdminClientsCache)();
        (0, cache_1.invalidatePattern)("admin:projects:");
        (0, cache_1.invalidateCache)(`csr:projects:${lead.assignedTo}`, `csr:leads:${lead.assignedTo}`);
        return res.json({
            success: true,
            note: result.note,
            thread: result.thread,
            technicalNotesBundle: result.bundle,
        });
    }
    catch (err) {
        console.error("technical-notes update error:", err);
        return res.status(500).json({ success: false, message: "Failed to update note" });
    }
});
router.delete("/lead/:id/technical-notes/:noteId", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const noteId = String(req.params.noteId);
        const lead = await db_1.default.lead.findFirst({
            where: { id: leadId },
            select: { id: true, assignedTo: true, technicalNotes: true },
        });
        if (!lead)
            return res.status(404).json({ success: false, message: "Lead not found" });
        const authUser = req.user;
        const actorId = authUser?.id ?? "";
        if (!actorId)
            return res.status(401).json({ success: false, message: "Unauthorized" });
        const result = (0, technicalEstimators_1.deleteTechnicalNote)(lead.technicalNotes, noteId, actorId, {
            actorRole: authUser?.role,
        });
        if ("error" in result) {
            const status = result.error.includes("author") ? 403 : 404;
            return res.status(status).json({ success: false, message: result.error });
        }
        await db_1.default.lead.update({
            where: { id: leadId },
            data: { technicalNotes: (0, technicalEstimators_1.serializeTechnicalNotesBundle)(result.bundle) },
        });
        (0, cache_1.flushAdminClientsCache)();
        (0, cache_1.invalidatePattern)("admin:projects:");
        (0, cache_1.invalidateCache)(`csr:projects:${lead.assignedTo}`, `csr:leads:${lead.assignedTo}`);
        return res.json({ success: true, thread: result.thread, technicalNotesBundle: result.bundle });
    }
    catch (err) {
        console.error("technical-notes delete error:", err);
        return res.status(500).json({ success: false, message: "Failed to delete note" });
    }
});
/* ================= UPDATE CSR STATUS ================= */
router.put("/csr-status/:id", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin"), async (req, res) => {
    try {
        const id = String(req.params.id);
        const { isActive } = req.body;
        if (typeof isActive !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "isActive must be true or false",
            });
        }
        const existingCSR = await db_1.default.user.findUnique({
            where: { id },
        });
        if (!existingCSR) {
            return res.status(404).json({
                success: false,
                message: "CSR not found",
            });
        }
        const csr = await db_1.default.user.update({
            where: { id },
            data: { isActive },
            select: { id: true, name: true, email: true, isActive: true },
        });
        (0, cache_1.invalidateCache)("admin:csrs");
        return res.json({
            success: true,
            message: `CSR ${csr.isActive ? "activated" : "deactivated"} successfully`,
            csr,
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: "Failed to update CSR status",
        });
    }
});
/* ================= CSR HISTORY ================= */
router.get("/csr-history/:csrId", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin"), async (req, res) => {
    try {
        const csrId = String(req.params.csrId);
        const csr = await db_1.default.user.findUnique({
            where: { id: csrId },
            select: {
                id: true,
                name: true,
                email: true,
                isActive: true,
                createdAt: true,
            },
        });
        if (!csr) {
            return res.status(404).json({
                success: false,
                message: "CSR not found",
            });
        }
        const leads = await db_1.default.lead.findMany({
            where: { assignedTo: csr.id },
            select: {
                id: true,
                name: true,
                company: true,
                phone: true,
                email: true,
                state: true,
                status: true,
                important: true,
                interested: true,
                comments: true,
                nextSchedule: true,
                nextTime: true,
                timezone: true,
                interestedService: true,
                projectTitle: true,
                projectCode: true,
                projectBudget: true,
                projectDeadline: true,
                clientCode: true,
                isOldClient: true,
                createdAt: true,
                updatedAt: true,
                uploadFile: { select: { companyName: true } },
                callLogs: {
                    orderBy: { createdAt: "desc" },
                    select: {
                        id: true,
                        status: true,
                        notes: true,
                        duration: true,
                        createdAt: true,
                    },
                },
            },
            orderBy: { updatedAt: "desc" },
        });
        const completed = await db_1.default.callLog.count({
            where: { csrId: csr.id },
        });
        const pending = leads.filter((l) => l.status?.toLowerCase() === "pending").length;
        const important = leads.filter((l) => l.important === true || l.status?.toLowerCase() === "important").length;
        const interested = leads.filter((l) => l.interested === true || l.status?.toLowerCase() === "interested").length;
        const projectWon = leads.filter((l) => l.status?.toLowerCase() === "close client").length;
        return res.json({
            success: true,
            csr,
            stats: {
                totalLeads: leads.length,
                /** Status updates performed by this CSR */
                completed,
                pending,
                important,
                interested,
                projectWon,
            },
            leads,
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch CSR history",
        });
    }
});
/* ================= ALL ACTIVE PROJECT LEADS (all CSRs) ================= */
router.get("/projects", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const csrId = typeof req.query.csrId === "string" ? req.query.csrId : undefined;
        const from = typeof req.query.from === "string" ? req.query.from.trim() : undefined;
        const to = typeof req.query.to === "string" ? req.query.to.trim() : undefined;
        const lite = req.query.lite !== "0" && req.query.lite !== "false";
        const technicalView = req.query.technicalView === "1" ||
            req.query.technicalView === "true" ||
            req.query.forTechnical === "1";
        const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
        const maxLimit = technicalView ? 2000 : 500;
        const limit = Math.min(maxLimit, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
        const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
        const revisionsView = req.query.revisions === "1" ||
            req.query.revisions === "true";
        const excludeRevisions = req.query.excludeRevisions === "1" ||
            req.query.excludeRevisions === "true";
        // v5: restore previous Admin Project DB window (page size → ~46 All / ~22 Active)
        // No response cache — stale cache was bringing deleted projects back after toast.
        const where = { ...(0, projectLeads_1.buildProjectLeadWhere)(csrId) };
        if (search) {
            where.AND = [
                ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
                {
                    OR: [
                        { name: { contains: search, mode: "insensitive" } },
                        { projectTitle: { contains: search, mode: "insensitive" } },
                        { company: { contains: search, mode: "insensitive" } },
                        { interestedService: { contains: search, mode: "insensitive" } },
                    ],
                },
            ];
        }
        const include = lite
            ? {
                csr: { select: { id: true, name: true, email: true, csrCode: true } },
                uploadFile: { select: { companyName: true } },
                notes: { orderBy: { createdAt: "desc" }, take: 5 },
            }
            : {
                csr: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        csrCode: true,
                    },
                },
                uploadFile: {
                    select: {
                        companyName: true,
                    },
                },
                notes: { orderBy: { createdAt: "asc" }, take: 20 },
            };
        // Same window Admin used before: take `limit` newest matching rows, then displayable filter.
        // (limit 50 → All≈46 / Active≈22). Admin + Technical must use the same limit.
        const [rawLeads, total] = await Promise.all([
            db_1.default.lead.findMany({
                where,
                include,
                orderBy: { updatedAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
            }),
            db_1.default.lead.count({ where }),
        ]);
        let leads = rawLeads.filter(projectLeads_1.isDisplayableProjectLead);
        // Soft-hide from Technical only (do not use Prisma where — breaks Mongo when field unset).
        // Completed projects always stay on Chief Estimator, even if previously hidden by mark-complete.
        if (technicalView) {
            leads = leads.filter((l) => {
                const row = l;
                const completed = String(row.projectWorkStatus ?? "").toLowerCase() === "completed" ||
                    String(row.status ?? "").toLowerCase() === "completed";
                if (completed)
                    return true;
                return row.hiddenOnTechnical !== true;
            });
        }
        if (revisionsView) {
            leads = leads.filter((l) => l.needsRevision === true);
        }
        else if (technicalView && excludeRevisions) {
            leads = leads.filter((l) => l.needsRevision !== true);
        }
        if (from || to) {
            leads = leads.filter((l) => {
                const dateStr = l.projectDeadline
                    ? (0, estTime_1.estDateYmd)(new Date(l.projectDeadline))
                    : (0, estTime_1.estDateYmd)(new Date(l.updatedAt));
                if (from && dateStr < from)
                    return false;
                if (to && dateStr > to)
                    return false;
                return true;
            });
        }
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const [withBudget, thisMonth] = await Promise.all([
            db_1.default.lead.count({ where: { ...where, projectBudget: { not: null } } }),
            db_1.default.lead.count({ where: { ...where, updatedAt: { gte: monthStart } } }),
        ]);
        const stats = {
            total,
            withBudget,
            thisMonth,
        };
        const payload = {
            success: true,
            leads: technicalView
                ? leads.map((l) => ({
                    ...l,
                    // Technical Manager must not see client name
                    name: null,
                    ownerName: null,
                }))
                : leads,
            stats,
            total,
            page,
            limit,
        };
        return res.json(payload);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch projects",
        });
    }
});
/* ================= LOOKUP CLIENT BY PHONE (ADMIN) ================= */
router.get("/lookup-by-phone", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const phone = req.query.phone?.trim();
        if (!phone || (0, phone_1.normalizePhone)(phone).length < 7) {
            return res.json({ success: true, found: false });
        }
        const matches = await (0, leadPhoneLookup_1.findLeadsByPhone)(phone);
        return res.json((0, leadPhoneLookup_1.buildPhoneLookupResponse)(matches));
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to lookup client" });
    }
});
/* ================= PROJECT DB EXCEL TEMPLATE ================= */
router.get("/projects/excel-template", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager"), async (_req, res) => {
    try {
        const buf = (0, projectDbExcel_1.buildProjectDbTemplateBuffer)();
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", 'attachment; filename="project-db-template.xlsx"');
        res.setHeader("Content-Length", String(buf.length));
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).end(buf);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to build template" });
    }
});
/* ================= PROJECT DB EXCEL UPLOAD (bulk historical OK) ================= */
router.post("/projects/excel-upload", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager"), upload_middleware_1.uploadExcel.single("file"), async (req, res) => {
    try {
        const file = req.file;
        if (!file?.buffer?.length) {
            return res.status(400).json({ success: false, message: "Excel file is required." });
        }
        const adminId = req.user?.id;
        if (!adminId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        const { rows, errors: parseErrors } = (0, projectDbExcel_1.parseProjectDbExcel)(file.buffer);
        if (!rows.length && parseErrors.length) {
            return res.status(400).json({
                success: false,
                message: "Could not parse any valid project rows.",
                errors: parseErrors.slice(0, 50),
                created: 0,
                failed: parseErrors.length,
            });
        }
        if (!rows.length) {
            return res.status(400).json({
                success: false,
                message: "No project rows found. Fill the Projects sheet using the template.",
                errors: [],
                created: 0,
                failed: 0,
            });
        }
        const csrList = await db_1.default.user.findMany({
            where: { role: "csr", isActive: true },
            select: { id: true, csrCode: true },
        });
        const csrByCode = new Map(csrList
            .filter((c) => c.csrCode)
            .map((c) => [String(c.csrCode).trim().toUpperCase(), c.id]));
        const rowErrors = [...parseErrors];
        let created = 0;
        const syncDates = new Set();
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const excelRowApprox = i + 2;
            try {
                const body = (0, projectDbExcel_1.excelRowToProjectBody)(row);
                const createData = {};
                applyProjectPayload(createData, body);
                const code = String(row.csrCode ?? "").trim().toUpperCase();
                const sourceText = String(row.projectSource ?? "").trim();
                let assignTo = adminId;
                let sourceLabel = null;
                if (code) {
                    const csrId = csrByCode.get(code);
                    if (!csrId) {
                        rowErrors.push({
                            row: excelRowApprox,
                            message: `Unknown or inactive csrCode: ${row.csrCode}`,
                        });
                        continue;
                    }
                    assignTo = csrId;
                }
                else if (sourceText) {
                    sourceLabel = sourceText;
                }
                createData.assignedTo = assignTo;
                createData.projectSource = sourceLabel;
                createData.status = body.status ?? "Close Client";
                createData.important = false;
                createData.interested = false;
                createData.hiddenOnMain = true;
                if (!createData.technicalReceivedAt) {
                    createData.technicalReceivedAt = new Date();
                }
                if (row.clientCode?.trim())
                    createData.clientCode = row.clientCode.trim();
                if (row.timezone?.trim())
                    createData.timezone = row.timezone.trim();
                const phone = typeof createData.phone === "string" ? createData.phone.trim() : "";
                if (phone) {
                    const existingLeads = await (0, leadPhoneLookup_1.findLeadsByPhone)(phone);
                    createData.isOldClient = existingLeads.length > 0;
                }
                else {
                    createData.isOldClient = false;
                }
                if (row.createdAt && /^\d{4}-\d{2}-\d{2}/.test(row.createdAt)) {
                    const d = new Date(`${row.createdAt.slice(0, 10)}T12:00:00.000Z`);
                    if (!Number.isNaN(d.getTime())) {
                        createData.createdAt = d;
                        createData.updatedAt = d;
                    }
                }
                await db_1.default.lead.create({
                    data: createData,
                });
                created += 1;
                if (typeof createData.projectPayments === "string") {
                    for (const d of (0, projectCurrencyCollections_1.paidDatesFromPayments)((0, projectPayments_1.parseProjectPayments)(createData.projectPayments))) {
                        syncDates.add(d);
                    }
                }
                if (assignTo !== adminId) {
                    (0, cache_1.invalidateCache)(`csr:dashboard:${assignTo}`, `csr:projects:${assignTo}`, `csr:leads:${assignTo}`);
                }
            }
            catch (err) {
                console.log(err);
                rowErrors.push({
                    row: excelRowApprox,
                    message: "Failed to create project row.",
                });
            }
        }
        if (syncDates.size) {
            await (0, projectCurrencyCollections_1.syncAccountsCurrencyForDates)([...syncDates], adminId);
        }
        (0, cache_1.flushAdminClientsCache)();
        (0, cache_1.invalidatePattern)("admin:projects:");
        return res.json({
            success: true,
            created,
            failed: rowErrors.length,
            totalRows: rows.length,
            errors: rowErrors.slice(0, 80),
            message: created > 0
                ? `Imported ${created} project(s)${rowErrors.length ? `, ${rowErrors.length} row error(s)` : ""}.`
                : "No projects imported.",
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to upload projects Excel" });
    }
});
/* ================= ADD PROJECT (ADMIN) ================= */
router.post("/project", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const body = req.body;
        const { name, projectTitle, interestedService, projectDeadline } = body;
        if (!name || !projectTitle || !interestedService || !projectDeadline) {
            return res.status(400).json({
                success: false,
                message: "name, projectTitle, interestedService and projectDeadline are required.",
            });
        }
        const adminId = req.user?.id;
        if (!adminId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        const sourceClientId = body.sourceClientId ? String(body.sourceClientId).trim() : "";
        let source = null;
        if (sourceClientId) {
            source = await db_1.default.lead.findFirst({
                where: { id: sourceClientId, ...(0, binLeads_1.notInBinFilter)() },
                select: {
                    id: true,
                    clientCode: true,
                    projectCode: true,
                    isOldClient: true,
                    assignedTo: true,
                    email: true,
                    state: true,
                    ownerName: true,
                    company: true,
                    phone: true,
                    name: true,
                },
            });
            if (!source) {
                return res.status(404).json({ success: false, message: "Source client not found" });
            }
            if (!body.name)
                body.name = source.name;
            if (body.company === undefined)
                body.company = source.company;
            if (body.phone === undefined)
                body.phone = source.phone;
            if (body.email === undefined)
                body.email = source.email;
            if (body.state === undefined)
                body.state = source.state;
            if (body.ownerName === undefined)
                body.ownerName = source.ownerName;
        }
        const CSR_OTHER = "__other__";
        const rawCsrId = body.csrId ? String(body.csrId).trim() : "";
        const sourceText = typeof body.projectSource === "string" ? body.projectSource.trim() : "";
        let assignTo = source?.assignedTo || adminId;
        let sourceLabel = null;
        if (rawCsrId && rawCsrId !== CSR_OTHER) {
            const csr = await db_1.default.user.findFirst({
                where: { id: rawCsrId, role: "csr", isActive: true },
                select: { id: true },
            });
            if (!csr) {
                return res.status(400).json({ success: false, message: "Invalid or inactive CSR." });
            }
            assignTo = csr.id;
        }
        else if (rawCsrId === CSR_OTHER) {
            if (!sourceText) {
                return res.status(400).json({
                    success: false,
                    message: "Please enter the external resource name for Other.",
                });
            }
            sourceLabel = sourceText;
        }
        else if (sourceText) {
            sourceLabel = sourceText;
        }
        const createData = {};
        applyProjectPayload(createData, body);
        createData.assignedTo = assignTo;
        createData.projectSource = sourceLabel;
        createData.status = body.status ?? "Close Client";
        createData.important = false;
        createData.interested = false;
        createData.hiddenOnMain = true;
        if (!createData.technicalReceivedAt) {
            createData.technicalReceivedAt = new Date();
        }
        const trimmedPhone = typeof body.phone === "string" ? body.phone.trim() : (source?.phone ?? null);
        if (trimmedPhone)
            createData.phone = trimmedPhone;
        if (source) {
            createData.isOldClient = source.isOldClient;
            const baseCode = (source.clientCode || source.projectCode || "").trim();
            if (baseCode) {
                createData.clientCode = source.clientCode || baseCode;
                if (!createData.projectCode) {
                    createData.projectCode = await (0, nextProjectCode_1.allocateNextProjectCode)(baseCode, {
                        assignedTo: typeof assignTo === "string" ? assignTo : undefined,
                    });
                }
            }
        }
        else {
            const existingLeads = trimmedPhone ? await (0, leadPhoneLookup_1.findLeadsByPhone)(trimmedPhone) : [];
            createData.isOldClient = existingLeads.length > 0;
        }
        const lead = await db_1.default.lead.create({
            data: createData,
            include: {
                csr: { select: { id: true, name: true, email: true, csrCode: true } },
            },
        });
        if (typeof createData.projectPayments === "string") {
            const dates = (0, projectCurrencyCollections_1.paidDatesFromPayments)((0, projectPayments_1.parseProjectPayments)(createData.projectPayments));
            if (dates.length) {
                await (0, projectCurrencyCollections_1.syncAccountsCurrencyForDates)(dates, req.user?.id);
            }
        }
        (0, cache_1.flushAdminClientsCache)();
        if (assignTo !== adminId) {
            (0, cache_1.invalidateCache)(`csr:dashboard:${assignTo}`, `csr:projects:${assignTo}`, `csr:leads:${assignTo}`);
        }
        return res.status(201).json({ success: true, lead });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to create project" });
    }
});
/* ================= UPDATE PROJECT (ADMIN) ================= */
router.put("/project/:id", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const updateData = {};
        applyProjectPayload(updateData, req.body);
        if (req.body.assignedTo !== undefined)
            updateData.assignedTo = req.body.assignedTo;
        const prev = await db_1.default.lead.findUnique({
            where: { id: leadId },
            select: {
                projectPayments: true,
                projectPhase: true,
                projectWorkStatus: true,
                status: true,
                projectDeadline: true,
                deadlineTiming: true,
                projectTitle: true,
                projectCode: true,
                projectScope: true,
                projectNotes: true,
                takeoffDeadline: true,
                pricingDeadline: true,
                qaDeadline: true,
                interestedService: true,
                technicalAssignments: true,
                clientCode: true,
            },
        });
        if (!prev) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }
        const lead = await db_1.default.lead.update({
            where: { id: leadId },
            data: updateData,
            include: {
                csr: { select: { id: true, name: true, email: true, csrCode: true } },
                notes: { orderBy: { createdAt: "asc" } },
            },
        });
        if (typeof updateData.projectPayments === "string") {
            const dates = [
                ...(0, projectCurrencyCollections_1.paidDatesFromPayments)((0, projectPayments_1.parseProjectPayments)(prev.projectPayments)),
                ...(0, projectCurrencyCollections_1.paidDatesFromPayments)((0, projectPayments_1.parseProjectPayments)(updateData.projectPayments)),
            ];
            if (dates.length) {
                await (0, projectCurrencyCollections_1.syncAccountsCurrencyForDates)(dates, req.user?.id);
            }
        }
        const changes = (0, technicalNotifications_1.diffProjectChangesForTm)(prev, { ...prev, ...updateData });
        if (changes.length > 0) {
            const label = (0, technicalNotifications_1.projectLabel)(lead.projectCode || lead.clientCode, lead.projectTitle);
            void (0, technicalNotifications_1.notifyTmFromActor)({
                actorId: req.user?.id,
                leadId: lead.id,
                projectTitle: lead.projectTitle,
                projectCode: lead.projectCode || lead.clientCode,
                source: "admin",
                title: "Project updated",
                message: `${label}: ${changes.join(", ")}`,
                changes,
            });
        }
        (0, cache_1.flushAdminClientsCache)();
        (0, cache_1.invalidatePattern)("admin:projects:");
        (0, cache_1.invalidateCache)(`csr:projects:${lead.assignedTo}`);
        return res.json({ success: true, lead });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to update project" });
    }
});
/* ================= SEND FOR PRICING ================= */
router.put("/project/:id/send-pricing", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const estimatorId = String(req.body?.estimatorId ?? "").trim();
        const existing = await db_1.default.lead.findUnique({
            where: { id: leadId },
            select: {
                id: true,
                assignedTo: true,
                technicalAssignments: true,
                projectPhase: true,
                pricingReceivedAt: true,
            },
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }
        const list = (0, technicalEstimators_1.parseTechnicalAssignments)(existing.technicalAssignments);
        let sent = 0;
        const next = list.map((a) => {
            const match = estimatorId
                ? a.estimatorId === estimatorId
                : a.takeoffDone && !a.pricingSent;
            if (!match)
                return a;
            if (!a.takeoffDone)
                return a;
            if (a.pricingSent)
                return a;
            sent += 1;
            return { ...a, pricingSent: true, timerStartedAt: null };
        });
        if (estimatorId) {
            const target = list.find((a) => a.estimatorId === estimatorId);
            if (!target) {
                return res.status(404).json({ success: false, message: "Estimator assignment not found" });
            }
            if (!target.takeoffDone) {
                return res.status(400).json({
                    success: false,
                    message: "That estimator must be Done before Send for Pricing.",
                });
            }
            if (target.pricingSent) {
                return res.status(400).json({
                    success: false,
                    message: "That estimator was already sent for pricing.",
                });
            }
        }
        if (sent === 0) {
            return res.status(400).json({
                success: false,
                message: estimatorId
                    ? "Could not send that estimator for pricing."
                    : "No completed estimators waiting to send for pricing.",
            });
        }
        const nextPhase = (0, technicalEstimators_1.syncPhaseFromAssignments)(next, existing.projectPhase);
        const lead = await db_1.default.lead.update({
            where: { id: leadId },
            data: {
                technicalAssignments: (0, technicalEstimators_1.serializeTechnicalAssignments)(next),
                projectPhase: nextPhase,
                pricingReceivedAt: existing.pricingReceivedAt ?? new Date(),
            },
            include: {
                csr: { select: { id: true, name: true, email: true, csrCode: true } },
                notes: { orderBy: { createdAt: "asc" }, take: 20 },
                uploadFile: { select: { companyName: true } },
            },
        });
        (0, cache_1.invalidatePattern)("admin:projects:");
        (0, cache_1.invalidateCache)(`csr:projects:${lead.assignedTo}`);
        return res.json({ success: true, lead });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to send for pricing" });
    }
});
/* ================= PRICING QA MODE (With / Without / Quick) ================= */
router.put("/project/:id/pricing-qa", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const mode = String(req.body?.mode ?? "")
            .trim()
            .toLowerCase();
        const map = {
            with_qa: "pricing_with_qa",
            without_qa: "pricing_without_qa",
            quick_qa: "pricing_quick_qa",
        };
        const nextPhase = map[mode];
        if (!nextPhase) {
            return res.status(400).json({
                success: false,
                message: "mode must be with_qa | without_qa | quick_qa",
            });
        }
        const lead = await db_1.default.lead.update({
            where: { id: leadId },
            data: { projectPhase: nextPhase },
            include: {
                csr: { select: { id: true, name: true, email: true, csrCode: true } },
                notes: { orderBy: { createdAt: "asc" }, take: 20 },
                uploadFile: { select: { companyName: true } },
            },
        });
        (0, cache_1.invalidatePattern)("admin:projects:");
        (0, cache_1.invalidateCache)(`csr:projects:${lead.assignedTo}`);
        return res.json({ success: true, lead });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to update pricing QA" });
    }
});
/* ================= SEND FOR FINAL SUBMISSION ================= */
router.put("/project/:id/send-final-submission", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const existing = await db_1.default.lead.findUnique({
            where: { id: leadId },
            select: { id: true, assignedTo: true, projectPhase: true, technicalAssignments: true },
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }
        const phase = String(existing.projectPhase ?? "").toLowerCase();
        // Already in Final — treat as success (idempotent)
        if (phase === "qa_phase" || phase === "delivery_phase") {
            const lead = await db_1.default.lead.findUnique({
                where: { id: leadId },
                include: {
                    csr: { select: { id: true, name: true, email: true, csrCode: true } },
                    notes: { orderBy: { createdAt: "asc" }, take: 20 },
                    uploadFile: { select: { companyName: true } },
                },
            });
            return res.json({ success: true, lead });
        }
        const list = (0, technicalEstimators_1.parseTechnicalAssignments)(existing.technicalAssignments);
        const inPricing = phase === "pricing_phase" ||
            phase.startsWith("pricing_") ||
            list.some((a) => a.pricingSent);
        if (!inPricing) {
            return res.status(400).json({
                success: false,
                message: "Project must be in Pricing before Final Submission.",
            });
        }
        const lead = await db_1.default.lead.update({
            where: { id: leadId },
            data: { projectPhase: "qa_phase" },
            include: {
                csr: { select: { id: true, name: true, email: true, csrCode: true } },
                notes: { orderBy: { createdAt: "asc" }, take: 20 },
                uploadFile: { select: { companyName: true } },
            },
        });
        (0, cache_1.invalidatePattern)("admin:projects:");
        (0, cache_1.invalidateCache)(`csr:projects:${lead.assignedTo}`);
        return res.json({ success: true, lead });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to send for final submission" });
    }
});
/* ================= RETURN FROM FINAL SUBMISSION → PRICING ================= */
router.put("/project/:id/return-pricing", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const existing = await db_1.default.lead.findUnique({
            where: { id: leadId },
            select: { id: true, assignedTo: true, projectPhase: true },
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }
        const phase = String(existing.projectPhase ?? "").toLowerCase();
        // Already in Pricing — treat as success (idempotent)
        if (phase === "pricing_phase" || phase.startsWith("pricing_")) {
            const lead = await db_1.default.lead.findUnique({
                where: { id: leadId },
                include: {
                    csr: { select: { id: true, name: true, email: true, csrCode: true } },
                    notes: { orderBy: { createdAt: "asc" }, take: 20 },
                    uploadFile: { select: { companyName: true } },
                },
            });
            return res.json({ success: true, lead });
        }
        if (phase !== "qa_phase" && phase !== "delivery_phase") {
            return res.status(400).json({
                success: false,
                message: "Project must be in Final Submission to return to Pricing.",
            });
        }
        const lead = await db_1.default.lead.update({
            where: { id: leadId },
            data: { projectPhase: "pricing_phase" },
            include: {
                csr: { select: { id: true, name: true, email: true, csrCode: true } },
                notes: { orderBy: { createdAt: "asc" }, take: 20 },
                uploadFile: { select: { companyName: true } },
            },
        });
        (0, cache_1.invalidatePattern)("admin:projects:");
        (0, cache_1.invalidateCache)(`csr:projects:${lead.assignedTo}`);
        return res.json({ success: true, lead });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to return to pricing" });
    }
});
/* ================= HIDE FROM TECHNICAL ONLY (admin Project DB keeps it) ================= */
router.put("/project/:id/hide-technical", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const lead = await db_1.default.lead.update({
            where: { id: leadId },
            data: { hiddenOnTechnical: true },
            include: {
                csr: { select: { id: true, name: true, email: true, csrCode: true } },
            },
        });
        (0, cache_1.flushAdminClientsCache)();
        (0, cache_1.invalidatePattern)("admin:projects:");
        return res.json({ success: true, lead });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to remove from technical" });
    }
});
/* Admin: show or hide a project on the Chief Estimator portal */
router.put("/project/:id/technical-visibility", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const hidden = req.body?.visible === false || req.body?.hidden === true;
        const lead = await db_1.default.lead.update({
            where: { id: leadId },
            data: { hiddenOnTechnical: hidden },
            include: {
                csr: { select: { id: true, name: true, email: true, csrCode: true } },
            },
        });
        (0, cache_1.flushAdminClientsCache)();
        (0, cache_1.invalidatePattern)("admin:projects:");
        return res.json({
            success: true,
            hiddenOnTechnical: hidden,
            lead,
            message: hidden
                ? "Hidden from Chief Estimator portal."
                : "Now showing on Chief Estimator portal.",
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to update Technical visibility" });
    }
});
/* ================= MARK COMPLETED (Admin: keep visible on Chief Estimator) ================= */
router.put("/project/:id/mark-completed", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const existing = await db_1.default.lead.findUnique({
            where: { id: leadId },
            select: { id: true, assignedTo: true, projectPhase: true, projectWorkStatus: true, status: true },
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }
        const work = String(existing.projectWorkStatus ?? "").toLowerCase();
        const st = String(existing.status ?? "").toLowerCase();
        const currentlyDone = work === "completed" || st === "completed";
        const bodyCompleted = req.body?.completed;
        const wantCompleted = bodyCompleted === undefined
            ? !currentlyDone
            : bodyCompleted === true || bodyCompleted === "true";
        const includeLead = {
            csr: { select: { id: true, name: true, email: true, csrCode: true } },
            notes: { orderBy: { createdAt: "asc" }, take: 20 },
            uploadFile: { select: { companyName: true } },
        };
        if (wantCompleted === currentlyDone) {
            const lead = await db_1.default.lead.findUnique({
                where: { id: leadId },
                include: includeLead,
            });
            return res.json({ success: true, lead, completed: currentlyDone });
        }
        const lead = await db_1.default.lead.update({
            where: { id: leadId },
            data: wantCompleted
                ? {
                    projectWorkStatus: "completed",
                    status: "completed",
                    projectPhase: "delivery_phase",
                    needsRevision: false,
                    hiddenOnTechnical: false,
                }
                : {
                    projectWorkStatus: "in_progress",
                    status: "Close Client",
                },
            include: {
                csr: { select: { id: true, name: true, email: true, csrCode: true } },
                notes: { orderBy: { createdAt: "asc" }, take: 20 },
                uploadFile: { select: { companyName: true } },
            },
        });
        (0, cache_1.flushAdminClientsCache)();
        (0, cache_1.invalidatePattern)("admin:projects:");
        if (lead.assignedTo)
            (0, cache_1.invalidateCache)(`csr:projects:${lead.assignedTo}`);
        return res.json({ success: true, lead, completed: wantCompleted });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to update project completion" });
    }
});
/* ================= ADMIN → TM REVISION QUEUE ================= */
router.put("/project/:id/request-revision", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const body = req.body;
        const revisionNotes = String(body.revisionNotes ?? "").trim().slice(0, 2000);
        const existing = await db_1.default.lead.findUnique({
            where: { id: leadId },
            select: {
                id: true,
                projectTitle: true,
                projectCode: true,
                clientCode: true,
                needsRevision: true,
            },
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }
        const lead = await db_1.default.lead.update({
            where: { id: leadId },
            data: {
                needsRevision: true,
                revisionRequestedAt: new Date(),
                revisionNotes: revisionNotes || null,
                hiddenOnTechnical: false,
                projectWorkStatus: "in_progress",
                status: "Close Client",
            },
            include: {
                csr: { select: { id: true, name: true, email: true, csrCode: true } },
                uploadFile: { select: { companyName: true } },
                notes: { orderBy: { createdAt: "desc" }, take: 5 },
            },
        });
        const label = (0, technicalNotifications_1.projectLabel)(lead.projectCode || lead.clientCode, lead.projectTitle);
        void (0, technicalNotifications_1.notifyTmFromActor)({
            actorId: req.user?.id,
            leadId: lead.id,
            projectTitle: lead.projectTitle,
            projectCode: lead.projectCode || lead.clientCode,
            source: "admin",
            title: "Revision requested",
            message: revisionNotes
                ? `${label}: sent for revision — ${revisionNotes}`
                : `${label}: sent for revision`,
            changes: ["Revision requested"],
        });
        (0, cache_1.flushAdminClientsCache)();
        (0, cache_1.invalidatePattern)("admin:projects:");
        return res.json({ success: true, lead });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to send for revision" });
    }
});
/* ================= TECHNICAL ESTIMATORS ================= */
router.get("/technical-estimators", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (_req, res) => {
    try {
        return res.json({ success: true, estimators: await (0, technicalEstimators_1.listTechnicalEstimators)() });
    }
    catch (err) {
        console.error("technical-estimators error:", err);
        return res.json({ success: true, estimators: [] });
    }
});
/* ================= TECHNICAL KPI + TEAM MONITORING ================= */
router.get("/technical-monitoring", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (_req, res) => {
    try {
        const payload = await (0, technicalMonitoring_1.buildTechnicalMonitoring)();
        return res.json({ success: true, ...payload });
    }
    catch (err) {
        console.error("technical-monitoring error:", err);
        return res.status(500).json({ success: false, message: "Failed to load technical monitoring" });
    }
});
/* ================= TECHNICAL MANAGER INBOX NOTIFICATIONS ================= */
router.get("/technical-notifications", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("technical_manager", "admin"), async (req, res) => {
    try {
        const unreadOnly = req.query.unread === "1" || req.query.unread === "true";
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
        const where = {
            source: { not: "tm_estimator" },
            ...(unreadOnly ? { readAt: null } : {}),
        };
        const [rows, unreadCount] = await Promise.all([
            db_1.default.technicalNotification.findMany({
                where,
                orderBy: { createdAt: "desc" },
                take: limit,
            }),
            db_1.default.technicalNotification.count({ where: { readAt: null } }),
        ]);
        const notifications = rows.map((n) => ({
            id: n.id,
            leadId: n.leadId,
            projectTitle: n.projectTitle,
            projectCode: n.projectCode,
            source: n.source,
            actorId: n.actorId,
            actorName: n.actorName,
            actorRole: n.actorRole,
            title: n.title,
            message: n.message,
            changes: (0, technicalNotifications_1.parseChangeSummary)(n.changeSummary),
            readAt: n.readAt,
            createdAt: n.createdAt,
        }));
        return res.json({ success: true, notifications, unreadCount });
    }
    catch (err) {
        console.error("technical-notifications list error:", err);
        return res.status(500).json({ success: false, message: "Failed to load notifications" });
    }
});
router.put("/technical-notifications/read-all", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("technical_manager", "admin"), async (_req, res) => {
    try {
        const result = await db_1.default.technicalNotification.updateMany({
            where: { readAt: null, source: { not: "tm_estimator" } },
            data: { readAt: new Date() },
        });
        return res.json({ success: true, updated: result.count });
    }
    catch (err) {
        console.error("technical-notifications read-all error:", err);
        return res.status(500).json({ success: false, message: "Failed to mark all read" });
    }
});
router.put("/technical-notifications/:id/read", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("technical_manager", "admin"), async (req, res) => {
    try {
        const id = String(req.params.id);
        const row = await db_1.default.technicalNotification.update({
            where: { id },
            data: { readAt: new Date() },
        });
        return res.json({ success: true, notification: row });
    }
    catch (err) {
        console.error("technical-notifications read error:", err);
        return res.status(500).json({ success: false, message: "Failed to mark notification read" });
    }
});
router.delete("/technical-notifications/:id", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("technical_manager", "admin"), async (req, res) => {
    try {
        const id = String(req.params.id);
        await db_1.default.technicalNotification.delete({ where: { id } });
        return res.json({ success: true });
    }
    catch (err) {
        console.error("technical-notifications delete error:", err);
        return res.status(500).json({ success: false, message: "Failed to dismiss notification" });
    }
});
/* ================= ESTIMATOR KPI RECORDS (editable ledger) ================= */
router.get("/payments-summary", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager"), async (req, res) => {
    try {
        const month = typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month.trim())
            ? req.query.month.trim()
            : null;
        const payload = await (0, paymentsSummary_1.buildPaymentsSummary)(month);
        return res.json({ success: true, ...payload });
    }
    catch (err) {
        console.error("payments-summary error:", err);
        return res.status(500).json({ success: false, message: "Failed to load payments summary" });
    }
});
router.post("/project/:id/discard-payment", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const discarded = req.body?.discarded !== false;
        const lead = await db_1.default.lead.findUnique({
            where: { id: leadId },
            select: { id: true, projectTitle: true },
        });
        if (!lead)
            return res.status(404).json({ success: false, message: "Project not found." });
        await db_1.default.lead.update({
            where: { id: leadId },
            data: { paymentDiscarded: discarded },
        });
        return res.json({ success: true, discarded, message: discarded ? "Marked: payment not expected." : "Discard cleared." });
    }
    catch (err) {
        console.error("discard-payment error:", err);
        return res.status(500).json({ success: false, message: "Failed to update payment status." });
    }
});
router.get("/technical-previous-month-ratings", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (_req, res) => {
    try {
        const payload = await (0, previousMonthRatings_1.buildPreviousMonthRatings)();
        return res.json({ success: true, ...payload });
    }
    catch (err) {
        console.error("technical-previous-month-ratings error:", err);
        return res.status(500).json({ success: false, message: "Failed to load previous month ratings" });
    }
});
router.get("/technical-kpi-auto", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const month = typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month.trim())
            ? req.query.month.trim()
            : new Date().toISOString().slice(0, 7);
        const payload = await (0, estimatorKpiAuto_1.buildEstimatorKpiAuto)(month);
        return res.json({ success: true, ...payload });
    }
    catch (err) {
        console.error("technical-kpi-auto error:", err);
        return res.status(500).json({ success: false, message: "Failed to build auto KPI" });
    }
});
/** Seed auto values as editable records (skips fields that already have entries this month). */
router.post("/technical-kpi-auto-seed", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const body = req.body;
        const month = typeof body.month === "string" && /^\d{4}-\d{2}$/.test(body.month.trim())
            ? body.month.trim()
            : new Date().toISOString().slice(0, 7);
        const estimatorId = String(body.estimatorId ?? "").trim();
        const onlyEmpty = body.onlyEmpty !== false;
        const fieldKeysRaw = Array.isArray(body.fieldKeys) ? body.fieldKeys.map(String) : null;
        const bounds = (0, technicalKpiRecords_1.monthBounds)(month);
        if (!bounds) {
            return res.status(400).json({ success: false, message: "Invalid month" });
        }
        const snapshot = await (0, estimatorKpiAuto_1.buildEstimatorKpiAuto)(month);
        const targets = estimatorId
            ? snapshot.estimators.filter((e) => e.estimatorId === estimatorId)
            : snapshot.estimators;
        let createdByName = null;
        if (req.user?.id) {
            const me = await db_1.default.user.findUnique({
                where: { id: req.user.id },
                select: { name: true },
            });
            createdByName = me?.name ?? null;
        }
        const existing = await db_1.default.estimatorKpiRecord.findMany({
            where: {
                recordedAt: { gte: bounds.from, lt: bounds.to },
                ...(estimatorId ? { estimatorId } : {}),
            },
            select: { estimatorId: true, fieldKey: true },
        });
        const existingSet = new Set(existing.map((r) => `${r.estimatorId}::${r.fieldKey}`));
        let created = 0;
        const now = new Date();
        for (const row of targets) {
            for (const field of row.fields) {
                if (!field.auto || !field.value.trim())
                    continue;
                if (fieldKeysRaw && !fieldKeysRaw.includes(field.fieldKey))
                    continue;
                const key = `${row.estimatorId}::${field.fieldKey}`;
                if (onlyEmpty && existingSet.has(key))
                    continue;
                if (!(0, technicalKpiRecords_1.isEstimatorKpiFieldKey)(field.fieldKey))
                    continue;
                const validated = (0, technicalKpiRecords_1.validateKpiValue)(field.fieldKey, field.value);
                if (!validated.ok)
                    continue;
                await db_1.default.estimatorKpiRecord.create({
                    data: {
                        estimatorId: row.estimatorId,
                        estimatorName: row.name,
                        fieldKey: field.fieldKey,
                        value: validated.value,
                        note: field.note || "Auto-filled",
                        recordedAt: now,
                        createdById: req.user?.id ?? null,
                        createdByName,
                    },
                });
                existingSet.add(key);
                created += 1;
            }
        }
        return res.json({ success: true, created, month });
    }
    catch (err) {
        console.error("technical-kpi-auto-seed error:", err);
        return res.status(500).json({ success: false, message: "Failed to auto-fill KPI records" });
    }
});
router.get("/technical-kpi-records", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const estimatorId = typeof req.query.estimatorId === "string" ? req.query.estimatorId.trim() : "";
        const fieldKey = typeof req.query.fieldKey === "string" ? req.query.fieldKey.trim() : "";
        const month = typeof req.query.month === "string" ? req.query.month.trim() : "";
        const fromStr = typeof req.query.from === "string" ? req.query.from.trim() : "";
        const toStr = typeof req.query.to === "string" ? req.query.to.trim() : "";
        const where = {};
        if (estimatorId)
            where.estimatorId = estimatorId;
        if (fieldKey && (0, technicalKpiRecords_1.isEstimatorKpiFieldKey)(fieldKey))
            where.fieldKey = fieldKey;
        const ymd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
        if (ymd(fromStr) || ymd(toStr)) {
            where.recordedAt = {
                ...(ymd(fromStr) ? { gte: new Date(`${fromStr}T00:00:00.000Z`) } : {}),
                ...(ymd(toStr) ? { lte: new Date(`${toStr}T23:59:59.999Z`) } : {}),
            };
        }
        else {
            const bounds = month ? (0, technicalKpiRecords_1.monthBounds)(month) : null;
            if (bounds)
                where.recordedAt = { gte: bounds.from, lt: bounds.to };
        }
        const [records, estimators] = await Promise.all([
            db_1.default.estimatorKpiRecord.findMany({
                where,
                orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
                take: 2000,
            }),
            (0, technicalEstimators_1.listTechnicalEstimators)(),
        ]);
        return res.json({
            success: true,
            fields: technicalKpiRecords_1.ESTIMATOR_KPI_FIELD_KEYS.map((key) => ({
                key,
                ...technicalKpiRecords_1.ESTIMATOR_KPI_FIELD_META[key],
            })),
            estimators,
            records,
        });
    }
    catch (err) {
        console.error("technical-kpi-records list error:", err);
        return res.status(500).json({ success: false, message: "Failed to load KPI records" });
    }
});
router.post("/technical-kpi-records", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const body = req.body;
        const estimatorId = String(body.estimatorId ?? "").trim();
        const estimatorName = String(body.estimatorName ?? "").trim();
        const fieldKey = body.fieldKey;
        const note = body.note != null ? String(body.note).trim() : "";
        if (!estimatorId) {
            return res.status(400).json({ success: false, message: "estimatorId is required" });
        }
        if (!(0, technicalKpiRecords_1.isEstimatorKpiFieldKey)(fieldKey)) {
            return res.status(400).json({ success: false, message: "Invalid fieldKey" });
        }
        const validated = (0, technicalKpiRecords_1.validateKpiValue)(fieldKey, body.value);
        if (!validated.ok) {
            return res.status(400).json({ success: false, message: validated.message });
        }
        let name = estimatorName;
        if (!name) {
            const u = await db_1.default.user.findUnique({
                where: { id: estimatorId },
                select: { name: true },
            });
            name = u?.name ?? estimatorId;
        }
        let createdByName = null;
        if (req.user?.id) {
            const me = await db_1.default.user.findUnique({
                where: { id: req.user.id },
                select: { name: true },
            });
            createdByName = me?.name ?? null;
        }
        const record = await db_1.default.estimatorKpiRecord.create({
            data: {
                estimatorId,
                estimatorName: name,
                fieldKey,
                value: validated.value,
                note: note || null,
                recordedAt: (0, technicalKpiRecords_1.parseRecordedAt)(body.recordedAt),
                createdById: req.user?.id ?? null,
                createdByName,
            },
        });
        return res.json({ success: true, record });
    }
    catch (err) {
        console.error("technical-kpi-records create error:", err);
        return res.status(500).json({ success: false, message: "Failed to create KPI record" });
    }
});
router.put("/technical-kpi-records/:id", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const id = String(req.params.id);
        const existing = await db_1.default.estimatorKpiRecord.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Record not found" });
        }
        const body = req.body;
        const fieldKey = (0, technicalKpiRecords_1.isEstimatorKpiFieldKey)(body.fieldKey)
            ? body.fieldKey
            : (0, technicalKpiRecords_1.isEstimatorKpiFieldKey)(existing.fieldKey)
                ? existing.fieldKey
                : null;
        if (!fieldKey) {
            return res.status(400).json({ success: false, message: "Invalid fieldKey on record" });
        }
        const data = {};
        if (body.value !== undefined) {
            const validated = (0, technicalKpiRecords_1.validateKpiValue)(fieldKey, body.value);
            if (!validated.ok) {
                return res.status(400).json({ success: false, message: validated.message });
            }
            data.value = validated.value;
        }
        if (body.note !== undefined) {
            const note = String(body.note ?? "").trim();
            data.note = note || null;
        }
        if (body.recordedAt !== undefined) {
            data.recordedAt = (0, technicalKpiRecords_1.parseRecordedAt)(body.recordedAt, existing.recordedAt);
        }
        if ((0, technicalKpiRecords_1.isEstimatorKpiFieldKey)(body.fieldKey) && body.fieldKey !== existing.fieldKey) {
            data.fieldKey = body.fieldKey;
        }
        if (body.estimatorName != null && String(body.estimatorName).trim()) {
            data.estimatorName = String(body.estimatorName).trim();
        }
        const record = await db_1.default.estimatorKpiRecord.update({
            where: { id },
            data,
        });
        return res.json({ success: true, record });
    }
    catch (err) {
        console.error("technical-kpi-records update error:", err);
        return res.status(500).json({ success: false, message: "Failed to update KPI record" });
    }
});
router.delete("/technical-kpi-records/:id", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const id = String(req.params.id);
        await db_1.default.estimatorKpiRecord.delete({ where: { id } });
        return res.json({ success: true });
    }
    catch (err) {
        console.error("technical-kpi-records delete error:", err);
        return res.status(500).json({ success: false, message: "Failed to delete KPI record" });
    }
});
/* ================= ASSIGN ESTIMATORS (TECHNICAL) ================= */
router.put("/project/:id/assign-estimators", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const body = req.body;
        const assignments = (0, technicalEstimators_1.parseTechnicalAssignments)(body.assignments ?? body.technicalAssignments);
        if (assignments.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Select at least one estimator.",
            });
        }
        for (const a of assignments) {
            if (!a.deadline) {
                return res.status(400).json({
                    success: false,
                    message: `Deadline is required for ${a.estimatorName}.`,
                });
            }
        }
        const existing = await db_1.default.lead.findUnique({
            where: { id: leadId },
            select: {
                id: true,
                projectPhase: true,
                technicalReceivedAt: true,
                assignedTo: true,
                technicalAssignments: true,
            },
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }
        const merged = (0, technicalEstimators_1.mergeAssignmentProgress)(assignments, (0, technicalEstimators_1.parseTechnicalAssignments)(existing.technicalAssignments));
        const nextPhase = (0, technicalEstimators_1.syncPhaseFromAssignments)(merged, existing.projectPhase);
        const lead = await db_1.default.lead.update({
            where: { id: leadId },
            data: {
                technicalAssignments: (0, technicalEstimators_1.serializeTechnicalAssignments)(merged),
                technicalReceivedAt: existing.technicalReceivedAt ?? new Date(),
                projectPhase: nextPhase,
            },
            include: {
                csr: { select: { id: true, name: true, email: true, csrCode: true } },
                notes: { orderBy: { createdAt: "asc" }, take: 20 },
                uploadFile: { select: { companyName: true } },
            },
        });
        (0, cache_1.invalidatePattern)("admin:projects:");
        (0, cache_1.invalidateCache)(`csr:projects:${lead.assignedTo}`);
        return res.json({ success: true, lead });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to assign estimators" });
    }
});
/* ================= MOVE PROJECT BETWEEN TECHNICAL WORKFLOW TABS ================= */
router.put("/project/:id/move-technical-tab", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const tabRaw = String(req.body?.tab ?? "").trim();
        const allowed = ["not_assigned", "assigned", "takeoff_done", "pricing", "final_submission", "completed", "revisions"];
        if (!allowed.includes(tabRaw)) {
            return res.status(400).json({ success: false, message: "Invalid workflow tab." });
        }
        const tab = tabRaw;
        const existing = await db_1.default.lead.findUnique({
            where: { id: leadId },
            select: {
                id: true,
                projectPhase: true,
                technicalAssignments: true,
                assignedTo: true,
                needsRevision: true,
            },
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }
        if (tab === "revisions") {
            const lead = await db_1.default.lead.update({
                where: { id: leadId },
                data: {
                    needsRevision: true,
                    revisionRequestedAt: new Date(),
                    hiddenOnTechnical: false,
                },
                include: {
                    csr: { select: { id: true, name: true, email: true, csrCode: true } },
                    notes: { orderBy: { createdAt: "asc" }, take: 20 },
                    uploadFile: { select: { companyName: true } },
                },
            });
            (0, cache_1.flushAdminClientsCache)();
            (0, cache_1.invalidatePattern)("admin:projects:");
            if (lead.assignedTo)
                (0, cache_1.invalidateCache)(`csr:projects:${lead.assignedTo}`);
            return res.json({ success: true, lead, tab });
        }
        const previous = (0, technicalEstimators_1.parseTechnicalAssignments)(existing.technicalAssignments);
        const moved = (0, technicalEstimators_1.applyTechnicalTabMove)(previous, tab, existing.projectPhase);
        if (moved.error) {
            return res.status(400).json({ success: false, message: moved.error });
        }
        const lead = await db_1.default.lead.update({
            where: { id: leadId },
            data: {
                technicalAssignments: (0, technicalEstimators_1.serializeTechnicalAssignments)(moved.assignments),
                projectPhase: moved.projectPhase,
                ...(moved.projectWorkStatus
                    ? {
                        projectWorkStatus: moved.projectWorkStatus,
                        status: "completed",
                        hiddenOnTechnical: false,
                    }
                    : {}),
            },
            include: {
                csr: { select: { id: true, name: true, email: true, csrCode: true } },
                notes: { orderBy: { createdAt: "asc" }, take: 20 },
                uploadFile: { select: { companyName: true } },
            },
        });
        (0, cache_1.invalidatePattern)("admin:projects:");
        (0, cache_1.invalidateCache)(`csr:projects:${lead.assignedTo}`);
        return res.json({ success: true, lead, tab });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to move project" });
    }
});
/* ================= UPDATE ESTIMATOR TAKEOFF FLAGS ================= */
router.put("/project/:id/estimator-takeoff", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const { estimatorId, takeoffDone } = req.body;
        if (!estimatorId) {
            return res.status(400).json({ success: false, message: "estimatorId is required" });
        }
        const existing = await db_1.default.lead.findUnique({
            where: { id: leadId },
            select: { technicalAssignments: true, assignedTo: true, projectPhase: true },
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }
        const list = (0, technicalEstimators_1.parseTechnicalAssignments)(existing.technicalAssignments);
        const idx = list.findIndex((a) => a.estimatorId === estimatorId);
        if (idx < 0) {
            return res.status(404).json({ success: false, message: "Estimator assignment not found" });
        }
        list[idx] = {
            ...(0, technicalEstimators_1.pauseAssignmentTimer)({ ...list[idx] }),
            takeoffDone: takeoffDone === true,
            // Reopen → back to Assigned; complete → Take Off Done (not pricing yet)
            pricingSent: takeoffDone === true ? list[idx].pricingSent : false,
        };
        const nextPhase = (0, technicalEstimators_1.syncPhaseFromAssignments)(list, existing.projectPhase);
        const lead = await db_1.default.lead.update({
            where: { id: leadId },
            data: {
                technicalAssignments: (0, technicalEstimators_1.serializeTechnicalAssignments)(list),
                projectPhase: nextPhase,
            },
            include: {
                csr: { select: { id: true, name: true, email: true, csrCode: true } },
                notes: { orderBy: { createdAt: "asc" }, take: 20 },
                uploadFile: { select: { companyName: true } },
            },
        });
        (0, cache_1.invalidatePattern)("admin:projects:");
        (0, cache_1.invalidateCache)(`csr:projects:${lead.assignedTo}`);
        return res.json({ success: true, lead });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to update takeoff status" });
    }
});
/* ================= TM EVALUATION (marks / remarks per estimator on a project) ================= */
router.put("/project/:id/estimator-evaluation", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const { estimatorId, marks, remarks } = req.body;
        if (!estimatorId) {
            return res.status(400).json({ success: false, message: "estimatorId is required" });
        }
        const n = Number(marks);
        if (!Number.isFinite(n) || n < 0 || n > 10) {
            return res.status(400).json({ success: false, message: "Marks must be between 0 and 10." });
        }
        const existing = await db_1.default.lead.findUnique({
            where: { id: leadId },
            select: { technicalAssignments: true, assignedTo: true },
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }
        const list = (0, technicalEstimators_1.parseTechnicalAssignments)(existing.technicalAssignments);
        const idx = list.findIndex((a) => a.estimatorId === estimatorId);
        if (idx < 0) {
            return res.status(404).json({ success: false, message: "Estimator assignment not found" });
        }
        list[idx] = {
            ...list[idx],
            evaluationMarks: Math.round(n * 10) / 10,
            evaluationRemarks: String(remarks ?? "").trim(),
            evaluatedAt: new Date().toISOString(),
        };
        const lead = await db_1.default.lead.update({
            where: { id: leadId },
            data: { technicalAssignments: (0, technicalEstimators_1.serializeTechnicalAssignments)(list) },
            include: {
                csr: { select: { id: true, name: true, email: true, csrCode: true } },
                notes: { orderBy: { createdAt: "asc" }, take: 20 },
                uploadFile: { select: { companyName: true } },
            },
        });
        (0, cache_1.invalidatePattern)("admin:projects:");
        (0, cache_1.invalidateCache)(`csr:projects:${lead.assignedTo}`);
        return res.json({ success: true, lead });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to save evaluation" });
    }
});
/* ================= SHUFFLE STATUS ================= */
router.get("/shuffle-status", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin"), async (req, res) => {
    try {
        const notCompleted = await db_1.default.lead.findMany({
            where: {
                status: {
                    in: ["not completed", "Not Completed"],
                },
            },
            select: {
                id: true,
                name: true,
                phone: true,
                status: true,
                shuffleAttempts: true,
                csr: {
                    select: {
                        name: true,
                    },
                },
            },
            orderBy: { shuffleAttempts: "asc" },
        });
        const csrs = await db_1.default.user.findMany({
            where: {
                role: "csr",
                isActive: true,
            },
            select: {
                id: true,
                name: true,
            },
            orderBy: { createdAt: "asc" },
        });
        return res.json({
            success: true,
            totalNotCompleted: notCompleted.length,
            shuffleOrder: csrs.map((c) => c.name),
            leads: notCompleted.map((l) => ({
                id: l.id,
                name: l.name,
                phone: l.phone,
                assignedTo: l.csr?.name,
                shuffleAttempts: l.shuffleAttempts,
                attemptsLeft: 2 - l.shuffleAttempts,
                willDeleteNext: l.shuffleAttempts >= 2,
            })),
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch shuffle status",
        });
    }
});
/* ================= RESET A SINGLE CSR'S LEADS ================= */
router.get("/csr-reset-pages", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin"), (_req, res) => {
    return res.json({ success: true, groups: csrResetPages_1.CSR_RESET_GROUPS });
});
async function runCsrLeadReset(csrId, pagesInput) {
    const csr = await db_1.default.user.findUnique({
        where: { id: csrId },
        select: { id: true, name: true, role: true },
    });
    if (!csr) {
        return { status: 404, body: { success: false, message: "CSR not found" } };
    }
    if (csr.role !== "csr") {
        return { status: 400, body: { success: false, message: "User is not a CSR" } };
    }
    const scopes = (0, csrResetPages_1.normalizeCsrResetScopes)(pagesInput);
    const purged = await (0, purgeCsrLeads_1.purgeCsrLeads)(csrId, scopes);
    (0, csrCache_1.invalidateCsrLeadCaches)(csrId);
    (0, chatSocket_1.notifyCsrDataReset)(csrId);
    (0, chatSocket_1.notifyAdminSummaryStale)();
    const remaining = await db_1.default.lead.count({ where: { assignedTo: csrId } });
    const warning = purged.leadsDeleted === 0 && remaining > 0
        ? "No leads matched the selected pages. CSR data was not changed."
        : undefined;
    return {
        status: 200,
        body: {
            success: true,
            message: warning ?? `Reset complete for ${csr.name}`,
            warning,
            deleted: purged.leadsDeleted,
            remaining,
            purged,
            csrName: csr.name,
            pages: purged.pages,
            scopes: purged.pages,
        },
    };
}
router.post("/csr-leads/:csrId/reset", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin"), async (req, res) => {
    try {
        const csrId = String(req.params.csrId);
        const pages = Array.isArray(req.body?.pages) ? req.body.pages.map(String) : undefined;
        const result = await runCsrLeadReset(csrId, pages);
        return res.status(result.status).json(result.body);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to reset CSR data";
        console.log("[csr-reset]", error);
        return res.status(500).json({ success: false, message });
    }
});
router.delete("/csr-leads/:csrId", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin"), async (req, res) => {
    try {
        const csrId = String(req.params.csrId);
        const result = await runCsrLeadReset(csrId);
        return res.status(result.status).json(result.body);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to reset CSR data" });
    }
});
/* ================= RUN SHUFFLE MANUALLY ================= */
router.post("/run-shuffle", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin"), async (req, res) => {
    try {
        console.log("[TEST Shuffle] Manual trigger by admin");
        const csrs = await db_1.default.user.findMany({
            where: {
                role: "csr",
                isActive: true,
            },
            select: {
                id: true,
                name: true,
            },
            orderBy: { createdAt: "asc" },
        });
        if (csrs.length < 2) {
            return res.status(400).json({
                success: false,
                message: "Need at least 2 active CSRs",
            });
        }
        const notCompleted = await db_1.default.lead.findMany({
            where: {
                status: {
                    in: ["not completed", "Not Completed"],
                },
            },
        });
        if (notCompleted.length === 0) {
            return res.json({
                success: true,
                message: "No not-completed leads found",
                shuffled: 0,
                deleted: 0,
            });
        }
        let deleted = 0;
        let shuffled = 0;
        const details = [];
        const byCSR = new Map();
        for (const lead of notCompleted) {
            const key = lead.assignedTo;
            if (!byCSR.has(key)) {
                byCSR.set(key, []);
            }
            byCSR.get(key).push(lead);
        }
        const deleteIds = [];
        const updateOps = [];
        for (const [csrId, leads] of byCSR.entries()) {
            const toDelete = leads.filter((l) => l.shuffleAttempts >= 2);
            const toShuffle = leads.filter((l) => l.shuffleAttempts < 2);
            for (const lead of toDelete) {
                deleteIds.push(lead.id);
                deleted++;
                details.push(`Deleted: "${lead.name}" because 3 attempts completed`);
            }
            if (toShuffle.length === 0)
                continue;
            const otherCSRs = csrs.filter((c) => c.id !== csrId);
            if (otherCSRs.length === 0)
                continue;
            const fromName = csrs.find((c) => c.id === csrId)?.name ?? csrId;
            for (let i = 0; i < toShuffle.length; i++) {
                const lead = toShuffle[i];
                const target = otherCSRs[i % otherCSRs.length];
                const attempt = lead.shuffleAttempts + 1;
                updateOps.push(db_1.default.lead.update({
                    where: { id: lead.id },
                    data: {
                        assignedTo: target.id,
                        shuffleAttempts: attempt,
                        status: "pending",
                        followUpNotes: [
                            lead.followUpNotes,
                            `[Attempt ${attempt}/3] ${fromName} → ${target.name} on ${new Date().toLocaleDateString()}`,
                        ].filter(Boolean).join("\n"),
                    },
                }));
                shuffled++;
                details.push(`"${lead.name}" moved from ${fromName} to ${target.name} attempt ${attempt}/3`);
            }
        }
        /* ── BATCH: 1 deleteMany + parallel updates ── */
        await Promise.all([
            deleteIds.length
                ? db_1.default.lead.deleteMany({ where: { id: { in: deleteIds } } })
                : Promise.resolve(),
            ...updateOps,
        ]);
        (0, cache_1.flushAdminClientsCache)();
        return res.json({
            success: true,
            shuffled,
            deleted,
            details,
            message: `Done — Shuffled: ${shuffled}, Deleted: ${deleted}`,
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: "Shuffle failed",
        });
    }
});
/* ================= ADMIN BIN (all not-picked + not-interested leads) ================= */
router.get("/bin", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const csrId = typeof req.query.csrId === "string" ? req.query.csrId : undefined;
        const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
        const cacheKey = `admin:bin:${csrId ?? "all"}:${page}:${limit}`;
        const cached = (0, cache_1.getCache)(cacheKey);
        if (cached)
            return res.json(cached);
        const where = (0, binLeads_1.buildBinWhere)(csrId);
        const [leads, total] = await Promise.all([
            db_1.default.lead.findMany({
                where,
                include: {
                    csr: { select: { id: true, name: true, csrCode: true } },
                    uploadFile: { select: uploadSourceSelect_1.CSR_UPLOAD_FILE_SELECT },
                },
                orderBy: { updatedAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
            }),
            db_1.default.lead.count({ where }),
        ]);
        const payload = { success: true, leads, total, page, limit };
        (0, cache_1.setCache)(cacheKey, payload, 30000);
        return res.json(payload);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to fetch bin" });
    }
});
/* ================= REASSIGN LEAD TO SPECIFIC CSR (ADMIN) ================= */
router.put("/lead/:id/reassign", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const leadId = String(req.params.id);
        const { csrId } = req.body;
        if (!csrId)
            return res.status(400).json({ success: false, message: "CSR ID is required" });
        const targetCsr = await db_1.default.user.findFirst({ where: { id: csrId, role: "csr" } });
        if (!targetCsr)
            return res.status(404).json({ success: false, message: "CSR not found" });
        const existing = await db_1.default.lead.findFirst({ where: { id: leadId } });
        if (!existing)
            return res.status(404).json({ success: false, message: "Lead not found" });
        const prevCsrId = existing.assignedTo;
        const lead = await db_1.default.lead.update({
            where: { id: leadId },
            data: {
                assignedTo: csrId,
                inBin: false,
                binReason: null,
                binPreviousStatus: null,
            },
        });
        (0, cache_1.flushAdminClientsCache)();
        (0, cache_1.invalidatePattern)("admin:bin");
        (0, cache_1.invalidateCache)(`csr:dashboard:${csrId}`, `csr:leads:${csrId}`, `csr:not-interested:${csrId}`, `csr:bin:${csrId}`, `csr:dashboard:${prevCsrId}`, `csr:leads:${prevCsrId}`, `csr:not-interested:${prevCsrId}`, `csr:bin:${prevCsrId}`);
        return res.json({ success: true, lead, message: `Lead reassigned to ${targetCsr.name}` });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to reassign lead" });
    }
});
const REASSIGN_ID_BATCH = 300;
function reassignStatusPatch(page, keepSchedule) {
    const clearSched = { nextSchedule: null, nextTime: null };
    if (page === "important") {
        return {
            status: "important",
            important: true,
            interested: false,
            hiddenOnMain: false,
            inBin: false,
            binReason: null,
            binPreviousStatus: null,
            ...clearSched,
        };
    }
    if (page === "schedule") {
        return {
            status: "important",
            important: true,
            interested: false,
            hiddenOnMain: false,
            inBin: false,
            binReason: null,
            binPreviousStatus: null,
            ...(keepSchedule ? {} : clearSched),
        };
    }
    if (page === "interested") {
        return {
            status: "interested",
            important: false,
            interested: true,
            hiddenOnMain: false,
            inBin: false,
            binReason: null,
            binPreviousStatus: null,
            ...clearSched,
        };
    }
    if (page === "pending") {
        return {
            status: "pending",
            important: false,
            interested: false,
            hiddenOnMain: false,
            inBin: false,
            binReason: null,
            binPreviousStatus: null,
            ...clearSched,
        };
    }
    if (page === "not_picked") {
        return {
            status: "not picked",
            important: false,
            interested: false,
            inBin: false,
            binReason: null,
            binPreviousStatus: null,
            ...clearSched,
        };
    }
    if (page === "not_interested") {
        return {
            status: "Not Interested",
            important: false,
            interested: false,
            inBin: false,
            binReason: null,
            binPreviousStatus: null,
            ...clearSched,
        };
    }
    if (page === "no_owner") {
        return {
            status: "no owner available",
            important: false,
            interested: false,
            hiddenOnMain: false,
            inBin: false,
            binReason: null,
            binPreviousStatus: null,
            ...clearSched,
        };
    }
    if (page === "not_in_service") {
        return {
            status: "not in service",
            important: false,
            interested: false,
            hiddenOnMain: false,
            inBin: false,
            binReason: null,
            binPreviousStatus: null,
            ...clearSched,
        };
    }
    if (page === "in_house") {
        return {
            status: "in house",
            important: false,
            interested: false,
            hiddenOnMain: false,
            inBin: false,
            binReason: null,
            binPreviousStatus: null,
            ...clearSched,
        };
    }
    return {
        status: "Close Client",
        important: false,
        interested: false,
        hiddenOnMain: true,
        inBin: false,
        binReason: null,
        binPreviousStatus: null,
        ...clearSched,
    };
}
async function collectReassignLeadIds(where, needSchedule) {
    const out = [];
    let cursor;
    for (;;) {
        const batch = await db_1.default.lead.findMany({
            where,
            select: needSchedule ? { id: true, nextSchedule: true } : { id: true },
            take: REASSIGN_ID_BATCH,
            orderBy: { id: "asc" },
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (!batch.length)
            break;
        for (const row of batch) {
            const nextSchedule = "nextSchedule" in row ? row.nextSchedule : null;
            out.push({
                id: row.id,
                keepSchedule: Boolean(nextSchedule && String(nextSchedule).trim()),
            });
        }
        cursor = batch[batch.length - 1].id;
        if (batch.length < REASSIGN_ID_BATCH)
            break;
    }
    return out;
}
async function applyReassignPatch(ids, data) {
    for (let i = 0; i < ids.length; i += REASSIGN_ID_BATCH) {
        const slice = ids.slice(i, i + REASSIGN_ID_BATCH);
        if (!slice.length)
            continue;
        await db_1.default.lead.updateMany({
            where: { id: { in: slice } },
            data,
        });
    }
}
/**
 * Bulk reassign: From CSR + page → To CSR(s) + page (equal round-robin).
 * Destination page sets status/flags so leads land on that CSR page.
 * Batched updateMany so 10k+ queues finish without timing out.
 */
router.post("/leads/reassign-bulk", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager"), async (req, res) => {
    try {
        const body = req.body;
        const fromCsrId = String(body.fromCsrId ?? "").trim();
        const toCsrIds = Array.isArray(body.toCsrIds)
            ? [...new Set(body.toCsrIds.map((id) => String(id).trim()).filter(Boolean))]
            : [];
        const pageKeys = new Set([
            "important",
            "schedule",
            "interested",
            "pending",
            "not_picked",
            "not_interested",
            "no_owner",
            "not_in_service",
            "in_house",
            "close_client",
        ]);
        const fromPage = String(body.fromPage ?? body.pages?.[0] ?? "")
            .trim()
            .toLowerCase();
        const toPage = String(body.toPage ?? body.fromPage ?? body.pages?.[0] ?? "")
            .trim()
            .toLowerCase();
        if (!fromCsrId) {
            return res.status(400).json({ success: false, message: "fromCsrId is required" });
        }
        if (!toCsrIds.length) {
            return res.status(400).json({ success: false, message: "Select at least one destination CSR" });
        }
        if (!pageKeys.has(fromPage)) {
            return res.status(400).json({ success: false, message: "Select a valid source page" });
        }
        if (!pageKeys.has(toPage)) {
            return res.status(400).json({ success: false, message: "Select a valid destination page" });
        }
        if (toCsrIds.includes(fromCsrId) && toCsrIds.length === 1 && fromPage === toPage) {
            return res.status(400).json({
                success: false,
                message: "Destination CSR/page must differ from source",
            });
        }
        const fromCsr = await db_1.default.user.findFirst({
            where: { id: fromCsrId, role: "csr" },
            select: { id: true, name: true },
        });
        if (!fromCsr) {
            return res.status(404).json({ success: false, message: "Source CSR not found" });
        }
        const destCsrs = await db_1.default.user.findMany({
            where: { id: { in: toCsrIds }, role: "csr", isActive: true },
            select: { id: true, name: true, csrCode: true },
        });
        if (destCsrs.length !== toCsrIds.length) {
            return res.status(400).json({ success: false, message: "One or more destination CSRs are invalid/inactive" });
        }
        const pageWhere = (page) => {
            if (page === "important")
                return (0, adminClientQueries_1.importantOnlyWhere)();
            if (page === "schedule")
                return (0, adminClientQueries_1.scheduledCallWhere)();
            if (page === "interested")
                return (0, adminClientQueries_1.isInterestedStatusWhere)();
            if (page === "pending")
                return (0, adminClientQueries_1.isPendingStatusWhere)();
            if (page === "not_picked") {
                return { status: { in: ["not picked", "Not Picked", "not completed", "Not Completed"] } };
            }
            if (page === "not_interested") {
                return { status: { in: ["not interested", "Not Interested"] } };
            }
            if (page === "no_owner") {
                return { status: { equals: "no owner available", mode: "insensitive" } };
            }
            if (page === "not_in_service") {
                return { status: { equals: "not in service", mode: "insensitive" } };
            }
            if (page === "in_house") {
                return { status: { equals: "in house", mode: "insensitive" } };
            }
            if (page === "close_client") {
                return {
                    status: { in: ["Close Client", "close client", "closed", "completed", "Completed"] },
                };
            }
            return null;
        };
        const sourceWhere = pageWhere(fromPage);
        if (!sourceWhere) {
            return res.status(400).json({ success: false, message: "Select a valid source page" });
        }
        const csrTabByPage = {
            pending: "pending",
            no_owner: "noowner",
            not_in_service: "notinservice",
            in_house: "inhouse",
        };
        const sourceTab = csrTabByPage[fromPage];
        const sourceQuery = sourceTab
            ? (0, csrDashboardQueries_1.buildCsrTabWhere)(fromCsrId, sourceTab)
            : {
                AND: [
                    { assignedTo: fromCsrId },
                    (0, binLeads_1.notInBinFilter)(),
                    sourceWhere,
                ],
            };
        const destIds = [...new Set(toCsrIds)];
        const finalTargets = fromPage === toPage
            ? destIds.filter((id) => id !== fromCsrId)
            : destIds;
        if (!finalTargets.length) {
            return res.status(400).json({
                success: false,
                message: fromPage === toPage
                    ? "Select a different destination CSR (same page requires another CSR)"
                    : "No valid destination CSRs",
            });
        }
        const leads = await collectReassignLeadIds(sourceQuery, toPage === "schedule");
        const perCsr = {};
        for (const id of finalTargets)
            perCsr[id] = 0;
        for (let t = 0; t < finalTargets.length; t++) {
            const destId = finalTargets[t];
            const mine = leads.filter((_, i) => i % finalTargets.length === t);
            if (!mine.length)
                continue;
            perCsr[destId] = mine.length;
            if (toPage === "schedule") {
                const keep = mine.filter((l) => l.keepSchedule).map((l) => l.id);
                const clear = mine.filter((l) => !l.keepSchedule).map((l) => l.id);
                await applyReassignPatch(keep, {
                    assignedTo: destId,
                    ...reassignStatusPatch(toPage, true),
                });
                await applyReassignPatch(clear, {
                    assignedTo: destId,
                    ...reassignStatusPatch(toPage, false),
                });
            }
            else {
                await applyReassignPatch(mine.map((l) => l.id), { assignedTo: destId, ...reassignStatusPatch(toPage, false) });
            }
        }
        const moved = leads.length;
        (0, csrCache_1.invalidateCsrLeadCaches)(fromCsrId);
        for (const id of finalTargets)
            (0, csrCache_1.invalidateCsrLeadCaches)(id);
        const destNames = destCsrs
            .filter((c) => finalTargets.includes(c.id))
            .map((c) => ({ csrId: c.id, name: c.name, leads: perCsr[c.id] ?? 0 }));
        return res.json({
            success: true,
            moved,
            fromCsr: fromCsr.name,
            fromPage,
            toPage,
            distribution: destNames,
            message: `Moved ${moved} lead(s) from ${fromCsr.name}/${fromPage} → ${toPage}.`,
        });
    }
    catch (error) {
        console.error("[reassign-bulk]", error);
        return res.status(500).json({
            success: false,
            message: "Failed to bulk reassign leads. Retry — large queues are processed in batches.",
        });
    }
});
/* ================= UPLOAD SOURCES (admin-only — hidden from CSR) ================= */
async function statsForAllSources(sourceIds) {
    const empty = {
        statsMap: new Map(),
        uploadsBySource: new Map(),
    };
    if (sourceIds.length === 0)
        return empty;
    const uploads = await db_1.default.uploadFile.findMany({
        where: { sourceId: { in: sourceIds } },
        select: { id: true, sourceId: true, fileName: true, totalLeads: true, companyName: true, createdAt: true },
        orderBy: { createdAt: "desc" },
    });
    const fileToSource = new Map(uploads.map(u => [u.id, u.sourceId]));
    const fileIds = uploads.map(u => u.id);
    const leads = fileIds.length
        ? await db_1.default.lead.findMany({
            where: { uploadedFileId: { in: fileIds } },
            select: { status: true, uploadedFileId: true },
        })
        : [];
    const leadsBySource = new Map();
    for (const lead of leads) {
        const sid = lead.uploadedFileId ? fileToSource.get(lead.uploadedFileId) : undefined;
        if (!sid)
            continue;
        if (!leadsBySource.has(sid))
            leadsBySource.set(sid, []);
        leadsBySource.get(sid).push({ status: lead.status });
    }
    const statsMap = new Map();
    for (const sid of sourceIds) {
        statsMap.set(sid, (0, uploadSourceStats_1.countLeadStatuses)(leadsBySource.get(sid) ?? []));
    }
    const uploadsBySource = new Map();
    for (const u of uploads) {
        if (!u.sourceId)
            continue;
        if (!uploadsBySource.has(u.sourceId))
            uploadsBySource.set(u.sourceId, []);
        uploadsBySource.get(u.sourceId).push(u);
    }
    return { statsMap, uploadsBySource };
}
async function statsForSource(sourceId) {
    const { statsMap, uploadsBySource } = await statsForAllSources([sourceId]);
    return {
        stats: statsMap.get(sourceId) ?? (0, uploadSourceStats_1.countLeadStatuses)([]),
        uploads: uploadsBySource.get(sourceId) ?? [],
    };
}
router.get("/upload-sources", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (_req, res) => {
    try {
        const CACHE_KEY = "admin:upload-sources";
        const cached = (0, cache_1.getCache)(CACHE_KEY);
        if (cached)
            return res.json(cached);
        const sources = await db_1.default.uploadSource.findMany({ orderBy: { name: "asc" } });
        const sourceIds = sources.map(s => s.id);
        const { statsMap, uploadsBySource } = await statsForAllSources(sourceIds);
        const enriched = sources.map((src) => {
            const uploads = uploadsBySource.get(src.id) ?? [];
            const stats = statsMap.get(src.id) ?? (0, uploadSourceStats_1.countLeadStatuses)([]);
            return {
                id: src.id,
                name: src.name,
                sudoName: src.sudoName,
                createdAt: src.createdAt,
                uploadCount: uploads.length,
                lastUpload: uploads[0]?.createdAt ?? null,
                stats,
            };
        });
        const payload = { success: true, sources: enriched };
        (0, cache_1.setCache)(CACHE_KEY, payload, 120000);
        return res.json(payload);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to fetch upload sources" });
    }
});
router.post("/upload-sources", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const name = String(req.body.name ?? "").trim();
        const sudoNameRaw = String(req.body.sudoName ?? "").trim();
        const sudoName = sudoNameRaw || null;
        if (!name) {
            return res.status(400).json({ success: false, message: "Source name is required" });
        }
        const existing = await db_1.default.uploadSource.findUnique({ where: { name } });
        if (existing) {
            if (sudoName && existing.sudoName !== sudoName) {
                const updated = await db_1.default.uploadSource.update({
                    where: { id: existing.id },
                    data: { sudoName },
                });
                return res.json({ success: true, source: updated, created: false, updated: true });
            }
            return res.json({ success: true, source: existing, created: false });
        }
        const source = await db_1.default.uploadSource.create({ data: { name, sudoName } });
        return res.json({ success: true, source, created: true });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to create upload source" });
    }
});
router.get("/upload-sources/:sourceId", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const sourceId = String(req.params.sourceId);
        const source = await db_1.default.uploadSource.findUnique({ where: { id: sourceId } });
        if (!source) {
            return res.status(404).json({ success: false, message: "Source not found" });
        }
        const { stats, uploads } = await statsForSource(sourceId);
        const leads = uploads.length
            ? await db_1.default.lead.findMany({
                where: { uploadedFileId: { in: uploads.map(u => u.id) } },
                select: {
                    id: true, name: true, phone: true, email: true, status: true,
                    company: true, interestedService: true, updatedAt: true,
                    csr: { select: { name: true } },
                },
                orderBy: { updatedAt: "desc" },
                take: 200,
            })
            : [];
        return res.json({
            success: true,
            source: { id: source.id, name: source.name, sudoName: source.sudoName, createdAt: source.createdAt },
            stats,
            uploads,
            leads,
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to fetch source details" });
    }
});
/* ================= CSR / ESTIMATOR LOGIN / ACTIVITY REPORT (EST) ================= */
router.get("/csr-session-report", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const csrId = typeof req.query.csrId === "string" && req.query.csrId !== "all"
            ? req.query.csrId
            : undefined;
        let from;
        let to;
        const fromStr = typeof req.query.from === "string" ? req.query.from : "";
        const toStr = typeof req.query.to === "string" ? req.query.to : "";
        const tzRaw = String(req.query.tz ?? "").trim().toLowerCase();
        const tz = tzRaw === "pkt" || tzRaw === "asia/karachi" || tzRaw === "pakistan"
            ? "Asia/Karachi"
            : estTime_1.ADMIN_SESSION_TIMEZONE;
        const timezoneLabel = tz === "Asia/Karachi" ? "Pakistan Time (PKT)" : estTime_1.ADMIN_SESSION_TZ_LABEL;
        if (fromStr) {
            const b = (0, estTime_1.estDayBoundsUtc)(fromStr, tz);
            if (b)
                from = b.start;
        }
        if (toStr) {
            const b = (0, estTime_1.estDayBoundsUtc)(toStr, tz);
            if (b)
                to = b.end;
        }
        if (!from && !to) {
            const toYmd = (0, estTime_1.estDateYmd)(new Date(), tz);
            const fromYmd = (0, estTime_1.addEstDays)(toYmd, -6, tz);
            from = (0, estTime_1.estDayBoundsUtc)(fromYmd, tz).start;
            to = (0, estTime_1.estDayBoundsUtc)(toYmd, tz).end;
        }
        const staffRole = req.query.role === "estimator" ? "estimator" : "csr";
        const report = await (0, csrSessionTracking_1.buildCsrSessionReport)({ from, to, csrId, role: staffRole, timeZone: tz });
        return res.json({
            success: true,
            timezone: tz,
            timezoneLabel,
            from: from?.toISOString() ?? null,
            to: to?.toISOString() ?? null,
            ...report,
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to fetch CSR activity report" });
    }
});
/* Admin can correct check-in / check-out times (EST). */
router.put("/csr-work-session/:id", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin"), async (req, res) => {
    try {
        const sessionId = String(req.params.id ?? "");
        if (!sessionId) {
            return res.status(400).json({ success: false, message: "Session id required." });
        }
        const { checkInAt, checkOutAt, clearCheckOut, dashboardMs, awayMs, note, tz: tzRaw, memberIds: memberIdsRaw, } = req.body ?? {};
        if (!checkInAt || typeof checkInAt !== "string") {
            return res.status(400).json({ success: false, message: "checkInAt is required." });
        }
        const tz = String(tzRaw ?? "").toLowerCase() === "pkt" ||
            String(tzRaw ?? "") === "Asia/Karachi" ||
            String(tzRaw ?? "").toLowerCase() === "pakistan"
            ? "Asia/Karachi"
            : estTime_1.ADMIN_SESSION_TIMEZONE;
        const checkInDate = (0, estTime_1.parseEstDateTimeLocal)(checkInAt, tz);
        if (!checkInDate) {
            return res.status(400).json({ success: false, message: "Invalid check-in time." });
        }
        let checkOutDate = null;
        if (!clearCheckOut && checkOutAt) {
            if (typeof checkOutAt !== "string") {
                return res.status(400).json({ success: false, message: "Invalid check-out time." });
            }
            checkOutDate = (0, estTime_1.parseEstDateTimeLocal)(checkOutAt, tz);
            if (!checkOutDate) {
                return res.status(400).json({ success: false, message: "Invalid check-out time." });
            }
        }
        const memberIds = Array.isArray(memberIdsRaw)
            ? memberIdsRaw.map((id) => String(id ?? "").trim()).filter(Boolean)
            : [];
        const result = await (0, csrSessionTracking_1.adminAdjustCsrWorkSession)({
            sessionId,
            memberIds,
            checkInAt: checkInDate,
            checkOutAt: checkOutDate,
            clearCheckOut: !!clearCheckOut,
            dashboardMs: typeof dashboardMs === "number" ? dashboardMs : undefined,
            awayMs: typeof awayMs === "number" ? awayMs : undefined,
            note: typeof note === "string" ? note : undefined,
        });
        if (!result.ok) {
            return res.status(404).json({ success: false, message: result.message });
        }
        return res.json({
            success: true,
            message: "Session times updated.",
            session: {
                id: result.session.id,
                loginAt: result.session.loginAt.toISOString(),
                logoutAt: result.session.logoutAt?.toISOString() ?? null,
                dashboardMs: result.session.dashboardMs,
                awayMs: result.session.awayMs,
                closedReason: result.session.closedReason,
            },
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to update work session." });
    }
});
/* ================= ACCESS HISTORY (IP / device) ================= */
router.get("/access-history/:userId", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin"), async (req, res) => {
    try {
        const userId = typeof req.params.userId === "string"
            ? req.params.userId
            : req.params.userId?.[0];
        if (!userId) {
            return res.status(400).json({ success: false, message: "User id required." });
        }
        const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
        const history = await db_1.default.accessHistory.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: {
                id: true, event: true, ip: true, deviceId: true,
                browser: true, userAgent: true, createdAt: true,
            },
        });
        return res.json({ success: true, history });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to fetch access history" });
    }
});
router.patch("/upload-sources/:sourceId", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const sourceId = String(req.params.sourceId);
        const existing = await db_1.default.uploadSource.findUnique({ where: { id: sourceId } });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Source not found" });
        }
        const nameRaw = req.body.name !== undefined ? String(req.body.name).trim() : undefined;
        const sudoNameRaw = req.body.sudoName !== undefined ? String(req.body.sudoName).trim() : undefined;
        if (nameRaw !== undefined && !nameRaw) {
            return res.status(400).json({ success: false, message: "Source name cannot be empty" });
        }
        if (nameRaw && nameRaw !== existing.name) {
            const conflict = await db_1.default.uploadSource.findUnique({ where: { name: nameRaw } });
            if (conflict) {
                return res.status(409).json({ success: false, message: "A source with this name already exists" });
            }
        }
        const source = await db_1.default.uploadSource.update({
            where: { id: sourceId },
            data: {
                ...(nameRaw !== undefined ? { name: nameRaw } : {}),
                ...(sudoNameRaw !== undefined ? { sudoName: sudoNameRaw || null } : {}),
            },
        });
        return res.json({ success: true, source });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to update upload source" });
    }
});
router.delete("/upload-sources/:sourceId", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const sourceId = String(req.params.sourceId);
        const existing = await db_1.default.uploadSource.findUnique({ where: { id: sourceId } });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Source not found" });
        }
        await db_1.default.uploadFile.updateMany({
            where: { sourceId },
            data: { sourceId: null },
        });
        await db_1.default.uploadSource.delete({ where: { id: sourceId } });
        return res.json({ success: true, message: "Source deleted" });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to delete upload source" });
    }
});
/* ================= TRADES ================= */
router.get("/trades", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (_req, res) => {
    try {
        await (0, masterFormatTrades_1.ensureMasterFormatTrades)();
        const trades = await db_1.default.trade.findMany({ orderBy: { name: "asc" } });
        return res.json({ success: true, trades });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to fetch trades" });
    }
});
router.post("/trades", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const name = (0, masterFormatTrades_1.canonicalTradeName)(req.body.name ?? "");
        if (!name)
            return res.status(400).json({ success: false, message: "Trade name required" });
        await (0, masterFormatTrades_1.ensureMasterFormatTrades)();
        const existing = await db_1.default.trade.findUnique({ where: { name } });
        if (existing)
            return res.status(409).json({ success: false, message: "Trade already exists" });
        const trade = await db_1.default.trade.create({ data: { name } });
        return res.status(201).json({ success: true, trade });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to create trade" });
    }
});
router.delete("/trades/:tradeId", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager", "technical_manager"), async (req, res) => {
    try {
        const tradeId = req.params.tradeId;
        await db_1.default.trade.delete({ where: { id: tradeId } }).catch(() => null);
        return res.json({ success: true });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to delete trade" });
    }
});
/* ================= RESTORE LEGACY COMMENTS → LeadNote ================= */
router.post("/migrate-legacy-notes", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin"), async (_req, res) => {
    try {
        const leads = await db_1.default.lead.findMany({
            where: {
                OR: [
                    { comments: { not: null } },
                    { followUpNotes: { not: null } },
                ],
            },
            select: {
                id: true,
                comments: true,
                followUpNotes: true,
                createdAt: true,
                _count: { select: { notes: true } },
            },
        });
        let migrated = 0;
        for (const lead of leads) {
            if (lead._count.notes > 0)
                continue;
            const text = [lead.comments?.trim(), lead.followUpNotes?.trim()].filter(Boolean).join("\n\n");
            if (!text)
                continue;
            await db_1.default.leadNote.create({
                data: {
                    leadId: lead.id,
                    text,
                    createdAt: lead.createdAt,
                },
            });
            migrated++;
        }
        (0, cache_1.flushAdminClientsCache)();
        return res.json({
            success: true,
            message: `Restored notes on ${migrated} lead(s) from legacy comments fields`,
            migrated,
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Migration failed" });
    }
});
exports.default = router;
