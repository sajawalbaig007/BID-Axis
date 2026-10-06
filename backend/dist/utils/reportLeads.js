"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchReportLeads = fetchReportLeads;
const db_1 = __importDefault(require("../config/db"));
const REPORT_LEAD_SELECT = {
    id: true,
    status: true,
    important: true,
    interested: true,
    assignedTo: true,
    createdAt: true,
    updatedAt: true,
    csr: { select: { name: true, csrCode: true } },
};
const BATCH_SIZE = 2500;
/** Same rows as a single findMany — loads in batches to reduce memory spikes on large datasets. */
async function fetchReportLeads(where) {
    const rows = [];
    let cursor;
    for (;;) {
        const batch = await db_1.default.lead.findMany({
            where,
            select: REPORT_LEAD_SELECT,
            orderBy: { id: "asc" },
            take: BATCH_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
        rows.push(...batch);
        if (batch.length < BATCH_SIZE)
            break;
        cursor = batch[batch.length - 1].id;
    }
    return rows;
}
