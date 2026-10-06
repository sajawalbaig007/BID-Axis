"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.previousMonthValue = previousMonthValue;
exports.monthDisplayLabel = monthDisplayLabel;
exports.buildPreviousMonthRatings = buildPreviousMonthRatings;
exports.topPerformers = topPerformers;
const db_1 = __importDefault(require("../config/db"));
const estimatorKpiAuto_1 = require("./estimatorKpiAuto");
const technicalEstimators_1 = require("./technicalEstimators");
const technicalKpiRecords_1 = require("./technicalKpiRecords");
function previousMonthValue(from = new Date()) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    d.setUTCMonth(d.getUTCMonth() - 1);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}
function monthDisplayLabel(month) {
    const [y, mo] = month.split("-").map(Number);
    if (!y || !mo)
        return month;
    return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    });
}
function latestRecordValue(records, estimatorId, fieldKey) {
    const hit = records
        .filter((r) => r.estimatorId === estimatorId && r.fieldKey === fieldKey)
        .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
    return hit?.value?.trim() ?? "";
}
function autoFieldValue(autoRows, estimatorId, fieldKey) {
    const row = autoRows.find((e) => e.estimatorId === estimatorId);
    return row?.fields.find((f) => f.fieldKey === fieldKey)?.value?.trim() ?? "";
}
function pickValue(saved, auto) {
    return saved || auto;
}
/** Previous calendar month KPI marks/stars (saved records override auto). */
async function buildPreviousMonthRatings() {
    const month = previousMonthValue();
    const bounds = (0, technicalKpiRecords_1.monthBounds)(month);
    const [autoSnap, roster, records] = await Promise.all([
        (0, estimatorKpiAuto_1.buildEstimatorKpiAuto)(month),
        (0, technicalEstimators_1.listTechnicalEstimators)(),
        bounds
            ? db_1.default.estimatorKpiRecord.findMany({
                where: {
                    recordedAt: { gte: bounds.from, lt: bounds.to },
                    fieldKey: { in: ["marks_out_of_10", "rating_stars", "final_remarks", "projects_delivered"] },
                },
                select: { estimatorId: true, fieldKey: true, value: true, recordedAt: true },
                orderBy: { recordedAt: "desc" },
                take: 2000,
            })
            : Promise.resolve([]),
    ]);
    const ids = new Set();
    for (const e of roster)
        ids.add(e.id);
    for (const e of autoSnap.estimators)
        ids.add(e.estimatorId);
    for (const r of records)
        ids.add(r.estimatorId);
    const nameById = new Map(roster.map((e) => [e.id, { name: e.name, code: e.code }]));
    for (const e of autoSnap.estimators) {
        if (!nameById.has(e.estimatorId)) {
            nameById.set(e.estimatorId, { name: e.name, code: e.code });
        }
    }
    const ratings = [];
    for (const estimatorId of ids) {
        const meta = nameById.get(estimatorId) ?? { name: "Estimator", code: "—" };
        const marks = pickValue(latestRecordValue(records, estimatorId, "marks_out_of_10"), autoFieldValue(autoSnap.estimators, estimatorId, "marks_out_of_10"));
        const stars = pickValue(latestRecordValue(records, estimatorId, "rating_stars"), autoFieldValue(autoSnap.estimators, estimatorId, "rating_stars"));
        const remarks = pickValue(latestRecordValue(records, estimatorId, "final_remarks"), autoFieldValue(autoSnap.estimators, estimatorId, "final_remarks"));
        const delivered = pickValue(latestRecordValue(records, estimatorId, "projects_delivered"), autoFieldValue(autoSnap.estimators, estimatorId, "projects_delivered"));
        if (!marks && !stars && !remarks && !delivered)
            continue;
        ratings.push({
            estimatorId,
            name: meta.name,
            code: meta.code,
            marks,
            stars,
            remarks,
            delivered,
        });
    }
    ratings.sort((a, b) => {
        const ma = Number(a.marks) || 0;
        const mb = Number(b.marks) || 0;
        if (mb !== ma)
            return mb - ma;
        return (Number(b.stars) || 0) - (Number(a.stars) || 0);
    });
    return {
        month,
        monthLabel: monthDisplayLabel(month),
        ratings,
    };
}
function topPerformers(ratings, limit = 5) {
    return ratings.filter((r) => r.marks || r.stars).slice(0, limit);
}
