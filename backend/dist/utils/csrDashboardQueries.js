"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCsrTabWhere = buildCsrTabWhere;
exports.getCsrLeadStats = getCsrLeadStats;
exports.mapDashboardLead = mapDashboardLead;
exports.fetchLeadIdsByOldestNote = fetchLeadIdsByOldestNote;
exports.reorderByIds = reorderByIds;
exports.fetchCsrTabLeads = fetchCsrTabLeads;
exports.fetchPotentialLeads = fetchPotentialLeads;
const db_1 = __importDefault(require("../config/db"));
const adminClientQueries_1 = require("./adminClientQueries");
const projectLeads_1 = require("./projectLeads");
const binLeads_1 = require("./binLeads");
const csrLeadSelect_1 = require("./csrLeadSelect");
const potentialClientBuckets_1 = require("./potentialClientBuckets");
const uniqueWonClients_1 = require("./uniqueWonClients");
const STATUS_NI = "Not Interested";
const STATUS_NP = ["not picked", "not completed"];
function buildCsrTabWhere(csrId, tab) {
    const base = (0, binLeads_1.activeCsrLeadWhere)(csrId);
    switch (tab) {
        case "today":
        case "pending":
            return (0, binLeads_1.pendingLeadWhere)(csrId);
        case "important":
            return { ...base, ...(0, adminClientQueries_1.importantOnlyWhere)() };
        case "schedule":
            return { ...base, ...(0, adminClientQueries_1.scheduledCallWhere)() };
        case "interested":
            return { ...base, ...(0, adminClientQueries_1.isInterestedStatusWhere)() };
        case "projectwon":
            return { ...base, ...(0, projectLeads_1.wonClientStatusWhere)() };
        case "notinterested":
            return {
                ...(0, binLeads_1.activeCsrLeadWhere)(csrId),
                status: { equals: STATUS_NI, mode: "insensitive" },
                notInterestedCount: { lt: binLeads_1.NOT_INTERESTED_LIMIT },
            };
        case "notpicked":
            return {
                ...(0, binLeads_1.activeCsrLeadWhere)(csrId),
                status: { in: [...STATUS_NP], mode: "insensitive" },
                notPickedCount: { lt: binLeads_1.NOT_PICKED_LIMIT },
            };
        case "noowner":
            return { ...base, status: { equals: "no owner available", mode: "insensitive" } };
        case "notinservice":
            return { ...base, status: { equals: "not in service", mode: "insensitive" } };
        case "inhouse":
            return { ...base, status: { equals: "in house", mode: "insensitive" } };
        default:
            return base;
    }
}
function withCreatedRange(where, from, to) {
    if (!from && !to)
        return where;
    const createdAt = {};
    if (from)
        createdAt.gte = new Date(`${from}T00:00:00.000Z`);
    if (to)
        createdAt.lte = new Date(`${to}T23:59:59.999Z`);
    return { AND: [where, { createdAt }] };
}
async function getCsrLeadStats(csrId, from, to) {
    const base = (0, binLeads_1.activeCsrLeadWhere)(csrId);
    const range = (where) => withCreatedRange(where, from, to);
    const [pendingCount, importantOnlyCount, scheduledCount, interestedCount, wonRows, notInterestedCount, notPickedCount, noOwnerCount, notInServiceCount, inHouseCount, totalAssigned, mainPipelineCount,] = await Promise.all([
        db_1.default.lead.count({ where: range((0, binLeads_1.pendingLeadWhere)(csrId)) }),
        db_1.default.lead.count({ where: range({ ...base, ...(0, adminClientQueries_1.importantOnlyWhere)() }) }),
        db_1.default.lead.count({ where: range({ ...base, ...(0, adminClientQueries_1.scheduledCallWhere)() }) }),
        db_1.default.lead.count({ where: range({ ...base, ...(0, adminClientQueries_1.isInterestedStatusWhere)() }) }),
        db_1.default.lead.findMany({
            where: range({ ...base, ...(0, projectLeads_1.wonClientStatusWhere)() }),
            select: { id: true, name: true, phone: true, company: true },
        }),
        db_1.default.lead.count({ where: range(buildCsrTabWhere(csrId, "notinterested")) }),
        db_1.default.lead.count({ where: range(buildCsrTabWhere(csrId, "notpicked")) }),
        db_1.default.lead.count({ where: range(buildCsrTabWhere(csrId, "noowner")) }),
        db_1.default.lead.count({ where: range(buildCsrTabWhere(csrId, "notinservice")) }),
        db_1.default.lead.count({ where: range(buildCsrTabWhere(csrId, "inhouse")) }),
        db_1.default.lead.count({ where: range(base) }),
        db_1.default.lead.count({ where: range((0, binLeads_1.mainPipelineWhere)(csrId)) }),
    ]);
    const projectWonCount = (0, uniqueWonClients_1.countUniqueWonClients)(wonRows);
    return {
        pendingCount,
        importantOnlyCount,
        scheduledCount,
        interestedCount,
        projectWonCount,
        notInterestedCount,
        notPickedCount,
        noOwnerCount,
        notInServiceCount,
        inHouseCount,
        totalAssigned,
        mainPipelineCount,
        /** All assigned leads (non-bin) — use for dashboard totals; no row cap. */
        totalLeads: totalAssigned,
    };
}
function mapDashboardLead(lead) {
    const { _count, notes, comments, followUpNotes, createdAt, updatedAt, ...rest } = lead;
    const tableNotes = notes ?? [];
    const latest = tableNotes[0];
    return {
        ...rest,
        comments,
        followUpNotes,
        createdAt,
        updatedAt,
        notes: tableNotes,
        noteCount: _count.notes,
        latestNote: latest
            ? { id: latest.id, text: latest.text, createdAt: latest.createdAt }
            : null,
    };
}
const LEAD_LIST_SELECT = {
    ...csrLeadSelect_1.CSR_DASHBOARD_LEAD_SELECT,
    notes: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, text: true, createdAt: true, parentId: true },
    },
};
function compareOldestNote(a, b) {
    const ta = a.notes[0]?.createdAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const tb = b.notes[0]?.createdAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (ta !== tb)
        return ta - tb;
    return a.createdAt.getTime() - b.createdAt.getTime();
}
async function fetchLeadIdsByOldestNote(where) {
    const rows = await db_1.default.lead.findMany({
        where,
        select: {
            id: true,
            createdAt: true,
            notes: { orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true } },
        },
    });
    rows.sort(compareOldestNote);
    return rows.map(r => r.id);
}
function reorderByIds(rows, ids) {
    const map = new Map(rows.map(r => [r.id, r]));
    const out = [];
    for (const id of ids) {
        const row = map.get(id);
        if (row)
            out.push(row);
    }
    return out;
}
async function fetchCsrTabLeads(opts) {
    const { csrId, tab, page, pageSize, from, to } = opts;
    const where = { ...buildCsrTabWhere(csrId, tab) };
    if (from || to) {
        const createdAt = {};
        if (from)
            createdAt.gte = new Date(`${from}T00:00:00.000Z`);
        if (to)
            createdAt.lte = new Date(`${to}T23:59:59.999Z`);
        where.createdAt = createdAt;
    }
    const ids = await fetchLeadIdsByOldestNote(where);
    const total = ids.length;
    const pageIds = ids.slice((page - 1) * pageSize, page * pageSize);
    const rawLeads = pageIds.length
        ? await db_1.default.lead.findMany({
            where: { id: { in: pageIds } },
            select: LEAD_LIST_SELECT,
        })
        : [];
    return {
        leads: reorderByIds(rawLeads, pageIds).map(mapDashboardLead),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
}
/** Potential clients — important / schedule / interested only */
async function fetchPotentialLeads(csrId) {
    const where = {
        ...(0, binLeads_1.activeCsrLeadWhere)(csrId),
        OR: [(0, adminClientQueries_1.isImportantStatusWhere)(), (0, adminClientQueries_1.isInterestedStatusWhere)()],
    };
    const [ids, rawLeads] = await Promise.all([
        fetchLeadIdsByOldestNote(where),
        db_1.default.lead.findMany({
            where,
            select: LEAD_LIST_SELECT,
        }),
    ]);
    const ordered = reorderByIds(rawLeads, ids).filter(potentialClientBuckets_1.isPotentialClientLead);
    return ordered.map(mapDashboardLead);
}
