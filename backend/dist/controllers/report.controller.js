"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReports = void 0;
exports.flushReportCache = flushReportCache;
const db_1 = __importDefault(require("../config/db"));
const reportLeads_1 = require("../utils/reportLeads");
const estTime_1 = require("../utils/estTime");
const reportCache = new Map();
const CACHE_TTL_MS = 90000;
const ALL_PERIOD_CACHE_TTL_MS = 300000;
function flushReportCache() {
    reportCache.clear();
}
/** Period ranges in US Eastern (same as CSR activity reports). */
function getDateRange(period) {
    const now = new Date();
    const todayYmd = (0, estTime_1.estDateYmd)(now);
    if (period === "today") {
        const bounds = (0, estTime_1.estDayBoundsUtc)(todayYmd);
        return { gte: bounds.start, lte: bounds.end };
    }
    if (period === "week") {
        const startYmd = (0, estTime_1.addEstDays)(todayYmd, -6);
        const start = (0, estTime_1.estDayBoundsUtc)(startYmd).start;
        const end = (0, estTime_1.estDayBoundsUtc)(todayYmd).end;
        return { gte: start, lte: end.getTime() > now.getTime() ? now : end };
    }
    if (period === "month") {
        const startYmd = (0, estTime_1.addEstDays)(todayYmd, -29);
        const start = (0, estTime_1.estDayBoundsUtc)(startYmd).start;
        const end = (0, estTime_1.estDayBoundsUtc)(todayYmd).end;
        return { gte: start, lte: end.getTime() > now.getTime() ? now : end };
    }
    const startYmd = (0, estTime_1.addEstDays)(todayYmd, -365);
    return { gte: (0, estTime_1.estDayBoundsUtc)(startYmd).start, lte: now };
}
function customDateRange(fromDate, toDate) {
    const start = (0, estTime_1.estDayBoundsUtc)(fromDate)?.start;
    const end = (0, estTime_1.estDayBoundsUtc)(toDate)?.end;
    if (!start || !end)
        return null;
    return { gte: start, lte: end };
}
function activityInRange(gte, lte) {
    return {
        OR: [
            { updatedAt: { gte, lte } },
            { createdAt: { gte, lte } },
        ],
    };
}
function buildPeriodWhere(period, fromDate, toDate) {
    if (fromDate && toDate) {
        const range = customDateRange(fromDate, toDate);
        if (range)
            return activityInRange(range.gte, range.lte);
    }
    if (period !== "all") {
        const range = getDateRange(period);
        return activityInRange(range.gte, range.lte);
    }
    return {};
}
/** Date filter for CallLog (CSR status updates). Null = all time. */
function callLogCreatedAtFilter(period, fromDate, toDate) {
    if (fromDate && toDate) {
        const range = customDateRange(fromDate, toDate);
        if (range)
            return { gte: range.gte, lte: range.lte };
    }
    if (period === "all")
        return undefined;
    const range = getDateRange(period);
    return { gte: range.gte, lte: range.lte };
}
function emptyCsrEntry(csrId, csrName, csrCode) {
    return {
        id: csrId,
        csrId,
        name: csrName,
        csrCode,
        totalLeads: 0,
        completed: 0,
        pending: 0,
        important: 0,
        interested: 0,
        notCompleted: 0,
        notInterested: 0,
        projectWon: 0,
        inHouse: 0,
        noOwner: 0,
        notInService: 0,
        scheduleCall: 0,
    };
}
/** Bucket a status string (from CallLog) into report status columns. */
function bumpStatusCount(target, status) {
    const s = (status ?? "").toLowerCase().trim();
    if (s === "pending")
        target.pending++;
    if (s === "important")
        target.important++;
    if (s === "interested")
        target.interested++;
    if (s === "not picked" || s === "not completed")
        target.notCompleted++;
    if (s === "not interested" || s === "completed")
        target.notInterested++;
    if (s === "close client" || s === "closed")
        target.projectWon++;
    if (s === "in house")
        target.inHouse++;
    if (s === "no owner available")
        target.noOwner++;
    if (s === "not in service")
        target.notInService++;
    if (s === "schedule call")
        target.scheduleCall++;
}
function buildTimeChart(leads, period, statusUpdates) {
    if (period === "today") {
        const buckets = {};
        for (let h = 0; h < 24; h++)
            buckets[h] = { leads: 0, completed: 0 };
        leads.forEach(l => {
            const h = new Date(l.activityAt).getHours();
            buckets[h].leads++;
        });
        statusUpdates.forEach(u => {
            const h = new Date(u.createdAt).getHours();
            if (buckets[h])
                buckets[h].completed++;
        });
        return Object.entries(buckets)
            .filter(([, v]) => v.leads > 0 || v.completed > 0)
            .map(([h, v]) => ({
            label: `${Number(h) % 12 || 12} ${Number(h) < 12 ? "AM" : "PM"}`,
            leads: v.leads,
            completed: v.completed,
        }));
    }
    if (period === "week") {
        const buckets = {};
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = `${d.getMonth() + 1}/${d.getDate()}`;
            buckets[key] = { leads: 0, completed: 0 };
        }
        leads.forEach(l => {
            const d = new Date(l.activityAt);
            const key = `${d.getMonth() + 1}/${d.getDate()}`;
            if (buckets[key])
                buckets[key].leads++;
        });
        statusUpdates.forEach(u => {
            const d = new Date(u.createdAt);
            const key = `${d.getMonth() + 1}/${d.getDate()}`;
            if (buckets[key])
                buckets[key].completed++;
        });
        return Object.entries(buckets).map(([date, v]) => {
            const [m, d] = date.split("/");
            const dayName = days[new Date(new Date().getFullYear(), Number(m) - 1, Number(d)).getDay()];
            return { label: `${dayName} ${date}`, leads: v.leads, completed: v.completed };
        });
    }
    if (period === "month") {
        const buckets = {};
        const weekLabels = ["Week 4 ago", "Week 3 ago", "Week 2 ago", "Last Week", "This Week"];
        for (let w = 4; w >= 0; w--)
            buckets[String(w)] = { leads: 0, completed: 0 };
        const weekIdx = (dt) => {
            const diffDays = Math.floor((Date.now() - dt.getTime()) / 86400000);
            return Math.min(Math.floor(diffDays / 7), 4);
        };
        leads.forEach(l => {
            const key = String(weekIdx(new Date(l.activityAt)));
            if (buckets[key])
                buckets[key].leads++;
        });
        statusUpdates.forEach(u => {
            const key = String(weekIdx(new Date(u.createdAt)));
            if (buckets[key])
                buckets[key].completed++;
        });
        return [4, 3, 2, 1, 0].map(w => ({
            label: weekLabels[4 - w],
            leads: buckets[String(w)].leads,
            completed: buckets[String(w)].completed,
        }));
    }
    return [];
}
function cacheKey(period, fromDate, toDate) {
    return `${period}|${fromDate ?? ""}|${toDate ?? ""}|v4-est-calllog`;
}
const getReports = async (req, res) => {
    try {
        const period = req.query.period || "week";
        const fromDate = req.query.fromDate;
        const toDate = req.query.toDate;
        const key = cacheKey(period, fromDate, toDate);
        const hit = reportCache.get(key);
        const ttl = period === "all" && !fromDate ? ALL_PERIOD_CACHE_TTL_MS : CACHE_TTL_MS;
        if (hit && Date.now() - hit.at < ttl) {
            return res.json(hit.data);
        }
        const whereClause = buildPeriodWhere(period, fromDate, toDate);
        const needsTimeChart = !fromDate && (period === "today" || period === "week" || period === "month");
        const createdAt = callLogCreatedAtFilter(period, fromDate, toDate);
        const [leads, reports, statusUpdates, assignedByCsr, allAssignedCount] = await Promise.all([
            needsTimeChart ? (0, reportLeads_1.fetchReportLeads)(whereClause) : Promise.resolve([]),
            db_1.default.report.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
            db_1.default.callLog.findMany({
                where: createdAt ? { createdAt } : {},
                select: { csrId: true, createdAt: true, status: true },
            }),
            // Total = leads currently with each CSR (not period-filtered)
            db_1.default.lead.groupBy({
                by: ["assignedTo"],
                where: { assignedTo: { not: "" } },
                _count: { _all: true },
            }),
            db_1.default.lead.count({ where: { assignedTo: { not: "" } } }),
        ]);
        const totals = emptyCsrEntry("all", "all", null);
        const csrMap = new Map();
        const timeRows = [];
        // Status breakdown + Completed = CallLog rows in the (EST) period
        for (const u of statusUpdates) {
            bumpStatusCount(totals, u.status);
            totals.completed++;
            let row = csrMap.get(u.csrId);
            if (!row) {
                row = emptyCsrEntry(u.csrId, "CSR", null);
                csrMap.set(u.csrId, row);
            }
            bumpStatusCount(row, u.status);
            row.completed++;
        }
        // Total = full assigned inventory per CSR
        const assignedCountMap = new Map();
        for (const row of assignedByCsr) {
            if (!row.assignedTo)
                continue;
            const count = typeof row._count === "object" && row._count && typeof row._count._all === "number"
                ? row._count._all
                : 0;
            assignedCountMap.set(row.assignedTo, count);
        }
        for (const [csrId, count] of assignedCountMap) {
            const existing = csrMap.get(csrId);
            if (existing) {
                existing.totalLeads = count;
            }
            else {
                csrMap.set(csrId, {
                    ...emptyCsrEntry(csrId, "CSR", null),
                    totalLeads: count,
                });
            }
        }
        totals.totalLeads = allAssignedCount;
        if (needsTimeChart) {
            for (const lead of leads) {
                timeRows.push({
                    activityAt: lead.updatedAt > lead.createdAt ? lead.updatedAt : lead.createdAt,
                    status: lead.status,
                    important: lead.important,
                    interested: lead.interested,
                });
            }
        }
        // Fill CSR names for rows that only have assigned count / updates
        const orphanIds = [...csrMap.entries()]
            .filter(([, r]) => r.name === "CSR")
            .map(([id]) => id);
        if (orphanIds.length) {
            const users = await db_1.default.user.findMany({
                where: { id: { in: orphanIds } },
                select: { id: true, name: true, csrCode: true },
            });
            for (const u of users) {
                const row = csrMap.get(u.id);
                if (row) {
                    row.name = u.name;
                    row.csrCode = u.csrCode;
                }
            }
        }
        const csrPerformance = Array.from(csrMap.values()).sort((a, b) => b.completed - a.completed || b.totalLeads - a.totalLeads);
        const completedTotal = totals.completed;
        const payload = {
            success: true,
            period,
            totalLeads: allAssignedCount,
            completed: completedTotal,
            pending: totals.pending,
            important: totals.important,
            interested: totals.interested,
            notCompleted: totals.notCompleted,
            notInterested: totals.notInterested,
            projectWon: totals.projectWon,
            inHouse: totals.inHouse,
            noOwner: totals.noOwner,
            notInService: totals.notInService,
            scheduleCall: totals.scheduleCall,
            csrPerformance,
            timeChart: needsTimeChart
                ? buildTimeChart(timeRows, period, statusUpdates)
                : [],
            reports,
        };
        reportCache.set(key, { at: Date.now(), data: payload });
        return res.json(payload);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to fetch reports" });
    }
};
exports.getReports = getReports;
