"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasMeaningfulAccountsData = hasMeaningfulAccountsData;
exports.pickLatestMeaningful = pickLatestMeaningful;
exports.pickLatestMeaningfulByMonth = pickLatestMeaningfulByMonth;
exports.resolveAccountsSnapshot = resolveAccountsSnapshot;
const db_1 = __importDefault(require("../config/db"));
const accountsDefaults_1 = require("./accountsDefaults");
const CARRY_FORWARD_PAGES = new Set([
    "income_statement",
    "dashboard",
    "balance_sheet",
    "cash_flow",
    "total_assets",
    "sales_payroll",
    "technical_payroll",
]);
/** True when the JSON has a real money figure (not FX rates / empty defaults). */
function hasMeaningfulAccountsData(data) {
    return hasNonZeroAmount(data);
}
function hasNonZeroAmount(node) {
    if (node == null)
        return false;
    if (typeof node === "number")
        return Number.isFinite(node) && Math.abs(node) > 0.0001;
    if (Array.isArray(node))
        return node.some(hasNonZeroAmount);
    if (typeof node === "object") {
        for (const [k, v] of Object.entries(node)) {
            if (/rate|factor|taxDeduction|commissionPct/i.test(k))
                continue;
            if (typeof v === "number" &&
                /amount|total|salary|revenue|balance|debit|credit|basic|allowance|loan|pkr|usd|cad/i.test(k) &&
                Math.abs(v) > 0.0001) {
                return true;
            }
            if (typeof v === "object" && hasNonZeroAmount(v))
                return true;
        }
    }
    return false;
}
function pickLatestMeaningful(recs) {
    let latestEmpty;
    let latestMeaningful;
    for (const rec of recs) {
        if (hasMeaningfulAccountsData(rec.data)) {
            if (!latestMeaningful || rec.recordDate >= latestMeaningful.recordDate) {
                latestMeaningful = rec;
            }
        }
        else if (!latestEmpty || rec.recordDate >= latestEmpty.recordDate) {
            latestEmpty = rec;
        }
    }
    return latestMeaningful ?? latestEmpty;
}
/** One snapshot per calendar month — empty later days must not clobber real figures. */
function pickLatestMeaningfulByMonth(recs) {
    const byMonth = new Map();
    for (const rec of recs) {
        const ym = rec.recordDate.slice(0, 7);
        const list = byMonth.get(ym);
        if (list)
            list.push(rec);
        else
            byMonth.set(ym, [rec]);
    }
    const out = new Map();
    for (const [ym, list] of byMonth) {
        const picked = pickLatestMeaningful(list);
        if (picked)
            out.set(ym, picked);
    }
    return out;
}
/**
 * Load the row for `recordDate`, or the latest same-month row that actually has values.
 * Used so a new/empty day still shows September (etc.) expenses instead of zeros.
 */
async function resolveAccountsSnapshot(page, recordDate) {
    const prismaPage = (0, accountsDefaults_1.toPrismaAccountsPage)(page);
    const exact = await db_1.default.accountsRecord.findUnique({
        where: { page_recordDate: { page: prismaPage, recordDate } },
    });
    if (exact && hasMeaningfulAccountsData(exact.data)) {
        return { record: exact, copiedFrom: null };
    }
    if (!CARRY_FORWARD_PAGES.has(page) || !/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) {
        return { record: exact, copiedFrom: null };
    }
    const monthStart = `${recordDate.slice(0, 7)}-01`;
    const prev = await db_1.default.accountsRecord.findMany({
        where: {
            page: prismaPage,
            recordDate: { gte: monthStart, lt: recordDate },
        },
        orderBy: { recordDate: "desc" },
    });
    const found = prev.find(r => hasMeaningfulAccountsData(r.data));
    if (found) {
        return { record: found, copiedFrom: found.recordDate };
    }
    return { record: exact, copiedFrom: null };
}
