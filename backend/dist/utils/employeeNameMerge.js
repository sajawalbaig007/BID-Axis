"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_EMPLOYEE_TO = exports.LEGACY_EMPLOYEE_FROM = void 0;
exports.loadMergedNamePairs = loadMergedNamePairs;
exports.resolveMergedName = resolveMergedName;
exports.scanPreviousEmployees = scanPreviousEmployees;
exports.listPreviousEmployeeRows = listPreviousEmployeeRows;
exports.mergePreviousEmployee = mergePreviousEmployee;
exports.mergePreviousByName = mergePreviousByName;
exports.unmergePreviousEmployee = unmergePreviousEmployee;
const db_1 = __importDefault(require("../config/db"));
const pfNameAlias_1 = require("./pfNameAlias");
/** Accounts names typed before Admin Users full names (through July 2026). */
exports.LEGACY_EMPLOYEE_FROM = "2026-03-01";
exports.LEGACY_EMPLOYEE_TO = "2026-07-31";
const JUNK_NAME = /^(sr#?|name|basic|allowance|overtime|deduction|remark|comment|total|loan|pf|tax|net salary|head)$/i;
const TEAMISH = /(salaries|provident fund|\bpf\b|loans?|opex|section total)$/i;
function isPersonName(label) {
    const n = label.trim();
    if (n.length < 2 || n.length > 80)
        return false;
    if (/^\d+([.,]\d+)?$/.test(n))
        return false;
    if (JUNK_NAME.test(n))
        return false;
    if (TEAMISH.test(n))
        return false;
    return true;
}
function asRecord(v) {
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}
function subLabels(node) {
    const rec = asRecord(node);
    const subs = rec?.subHeads;
    if (!Array.isArray(subs))
        return [];
    return subs
        .map(s => {
        const row = asRecord(s);
        return {
            name: String(row?.label ?? "").trim(),
            amount: Number(row?.amount) || 0,
        };
    })
        .filter(s => isPersonName(s.name));
}
function collectFromIncomeData(data, date) {
    const rec = asRecord(data);
    if (!rec)
        return [];
    const out = [];
    const teams = rec.teamSalaries;
    if (Array.isArray(teams)) {
        for (const t of teams) {
            const team = asRecord(t);
            const head = String(team?.team ?? "").trim() || "Team Salaries";
            for (const s of subLabels(t)) {
                out.push({ name: s.name, head, date, pf: 0 });
            }
        }
    }
    const pfHeads = rec.providentFundHeads;
    if (Array.isArray(pfHeads)) {
        for (const h of pfHeads) {
            const head = asRecord(h);
            const headLabel = String(head?.label ?? "").trim() || "Provident Fund";
            for (const s of subLabels(h)) {
                out.push({ name: s.name, head: headLabel, date, pf: s.amount });
            }
        }
    }
    return out;
}
async function loadMergedNamePairs() {
    const rows = await db_1.default.employeeNameMerge.findMany({
        where: { status: "merged" },
    });
    return rows
        .map(r => {
        const from = String(r.previousName || "").trim();
        const to = String(r.currentName || "").trim();
        if (!from || !to)
            return null;
        const fromKey = r.previousNameKey || (0, pfNameAlias_1.pfNormName)(from);
        const toKey = r.currentNameKey || (0, pfNameAlias_1.pfNormName)(to);
        if (!fromKey || !toKey || fromKey === toKey)
            return null;
        return { from, to, fromKey, toKey };
    })
        .filter((x) => !!x);
}
function resolveMergedName(name, pairs) {
    const byFrom = new Map(pairs.map(p => [p.fromKey, p]));
    let key = (0, pfNameAlias_1.pfNormName)(name);
    let display = name.trim();
    const seen = new Set();
    while (key && byFrom.has(key) && !seen.has(key)) {
        seen.add(key);
        const hit = byFrom.get(key);
        key = hit.toKey;
        display = hit.to;
    }
    return { key, name: display };
}
async function currentRosterNameKeys() {
    const keys = new Set();
    const users = await db_1.default.user.findMany({ select: { name: true } });
    for (const u of users) {
        const k = (0, pfNameAlias_1.pfNormName)(u.name);
        if (k)
            keys.add(k);
    }
    const staff = await db_1.default.staffEmployee.findMany({
        select: { name: true, userId: true },
    });
    const userIds = staff.map(s => s.userId).filter((id) => !!id);
    const linked = userIds.length > 0
        ? await db_1.default.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
        : [];
    const byId = new Map(linked.map(u => [u.id, u.name]));
    for (const s of staff) {
        const live = s.userId ? byId.get(s.userId) : null;
        const k = (0, pfNameAlias_1.pfNormName)(live || s.name || "");
        if (k)
            keys.add(k);
    }
    return keys;
}
async function pfTotalsByNameKey() {
    const recs = await db_1.default.accountsRecord.findMany({
        where: { page: "income_statement" },
        select: { data: true },
    });
    const totals = new Map();
    for (const rec of recs) {
        const data = asRecord(rec.data);
        const heads = data?.providentFundHeads;
        if (!Array.isArray(heads))
            continue;
        for (const h of heads) {
            for (const s of subLabels(h)) {
                const k = (0, pfNameAlias_1.pfNormName)(s.name);
                if (!k || !s.amount)
                    continue;
                totals.set(k, Math.round(((totals.get(k) ?? 0) + s.amount) * 100) / 100);
            }
        }
    }
    return totals;
}
async function collectLegacyNameMap() {
    const recs = await db_1.default.accountsRecord.findMany({
        where: {
            page: "income_statement",
            recordDate: { gte: exports.LEGACY_EMPLOYEE_FROM, lte: exports.LEGACY_EMPLOYEE_TO },
        },
        select: { recordDate: true, data: true },
    });
    const byKey = new Map();
    for (const rec of recs) {
        for (const hit of collectFromIncomeData(rec.data, rec.recordDate)) {
            const key = (0, pfNameAlias_1.pfNormName)(hit.name);
            if (!key)
                continue;
            const prev = byKey.get(key);
            if (!prev) {
                byKey.set(key, {
                    name: hit.name,
                    head: hit.head,
                    firstSeen: rec.recordDate,
                    lastSeen: rec.recordDate,
                });
                continue;
            }
            if (rec.recordDate < prev.firstSeen)
                prev.firstSeen = rec.recordDate;
            if (rec.recordDate > prev.lastSeen)
                prev.lastSeen = rec.recordDate;
            if (hit.name.length > prev.name.length)
                prev.name = hit.name;
            if (hit.head)
                prev.head = hit.head;
        }
    }
    return byKey;
}
/** Scan Mar–Jul income-statement names and upsert previous rows (does not un-merge). */
async function scanPreviousEmployees() {
    const byKey = await collectLegacyNameMap();
    const current = await currentRosterNameKeys();
    let upserted = 0;
    let skippedCurrent = 0;
    for (const [key, info] of byKey) {
        if (current.has(key)) {
            skippedCurrent += 1;
            continue;
        }
        const existing = await db_1.default.employeeNameMerge.findUnique({
            where: { previousNameKey: key },
        });
        if (existing) {
            await db_1.default.employeeNameMerge.update({
                where: { id: existing.id },
                data: {
                    previousName: existing.status === "merged" ? existing.previousName : info.name,
                    payrollHead: info.head,
                    firstSeen: info.firstSeen,
                    lastSeen: info.lastSeen,
                },
            });
        }
        else {
            await db_1.default.employeeNameMerge.create({
                data: {
                    previousName: info.name,
                    previousNameKey: key,
                    payrollHead: info.head,
                    firstSeen: info.firstSeen,
                    lastSeen: info.lastSeen,
                    status: "previous",
                },
            });
        }
        upserted += 1;
    }
    return { upserted, skippedCurrent };
}
function mapStoredRow(r, pfTotals, staffName) {
    const liveCurrent = (r.currentStaffId && staffName.get(r.currentStaffId)) || r.currentName || null;
    const fromKey = r.previousNameKey || (0, pfNameAlias_1.pfNormName)(r.previousName);
    const toKey = liveCurrent ? (0, pfNameAlias_1.pfNormName)(liveCurrent) : r.currentNameKey;
    return {
        id: r.id,
        previousName: r.previousName,
        previousNameKey: fromKey,
        currentName: liveCurrent,
        currentNameKey: toKey || null,
        currentStaffId: r.currentStaffId,
        currentUserId: r.currentUserId,
        payrollHead: r.payrollHead,
        firstSeen: r.firstSeen,
        lastSeen: r.lastSeen,
        status: r.status === "merged" ? "merged" : "previous",
        pfAllTime: pfTotals.get(fromKey) ?? 0,
        mergedAt: r.mergedAt ? r.mergedAt.toISOString() : null,
    };
}
async function listPreviousEmployeeRows() {
    const [stored, pfTotals, staff, legacy, current] = await Promise.all([
        db_1.default.employeeNameMerge.findMany({ orderBy: { previousName: "asc" } }),
        pfTotalsByNameKey(),
        db_1.default.staffEmployee.findMany({ select: { id: true, name: true, userId: true } }),
        collectLegacyNameMap(),
        currentRosterNameKeys(),
    ]);
    const staffUserIds = staff.map(s => s.userId).filter((id) => !!id);
    const users = staffUserIds.length > 0
        ? await db_1.default.user.findMany({
            where: { id: { in: staffUserIds } },
            select: { id: true, name: true },
        })
        : [];
    const userName = new Map(users.map(u => [u.id, u.name]));
    const staffName = new Map(staff.map(s => [s.id, (s.userId && userName.get(s.userId)) || s.name || ""]));
    const storedByKey = new Map(stored.map(r => [r.previousNameKey || (0, pfNameAlias_1.pfNormName)(r.previousName), r]));
    const out = [];
    const used = new Set();
    for (const r of stored) {
        if (r.status !== "merged")
            continue;
        const row = mapStoredRow(r, pfTotals, staffName);
        out.push(row);
        used.add(row.previousNameKey);
    }
    for (const [key, info] of legacy) {
        if (used.has(key) || current.has(key))
            continue;
        const storedRow = storedByKey.get(key);
        if (storedRow?.status === "merged")
            continue;
        used.add(key);
        if (storedRow) {
            out.push(mapStoredRow(storedRow, pfTotals, staffName));
            continue;
        }
        out.push({
            id: `live:${key}`,
            previousName: info.name,
            previousNameKey: key,
            currentName: null,
            currentNameKey: null,
            currentStaffId: null,
            currentUserId: null,
            payrollHead: info.head,
            firstSeen: info.firstSeen,
            lastSeen: info.lastSeen,
            status: "previous",
            pfAllTime: pfTotals.get(key) ?? 0,
            mergedAt: null,
        });
    }
    for (const r of stored) {
        if (r.status === "merged")
            continue;
        const key = r.previousNameKey || (0, pfNameAlias_1.pfNormName)(r.previousName);
        if (used.has(key) || current.has(key))
            continue;
        used.add(key);
        out.push(mapStoredRow(r, pfTotals, staffName));
    }
    out.sort((a, b) => {
        if (a.status !== b.status)
            return a.status === "merged" ? 1 : -1;
        return a.previousName.localeCompare(b.previousName);
    });
    return out;
}
async function mergePreviousEmployee(id, target) {
    const existing = await db_1.default.employeeNameMerge.findUnique({ where: { id } });
    if (!existing)
        return null;
    const currentName = target.currentName.trim();
    const toKey = (0, pfNameAlias_1.pfNormName)(currentName);
    if (!currentName || !toKey) {
        throw new Error("Current employee name is required.");
    }
    if (toKey === (existing.previousNameKey || (0, pfNameAlias_1.pfNormName)(existing.previousName))) {
        throw new Error("Pick a different (new) name to merge into.");
    }
    await db_1.default.employeeNameMerge.update({
        where: { id },
        data: {
            status: "merged",
            currentName,
            currentNameKey: toKey,
            currentStaffId: target.currentStaffId || null,
            currentUserId: target.currentUserId || null,
            mergedAt: new Date(),
        },
    });
    const list = await listPreviousEmployeeRows();
    return list.find(r => r.id === id) ?? null;
}
async function mergePreviousByName(previousName, target) {
    const name = previousName.trim();
    const key = (0, pfNameAlias_1.pfNormName)(name);
    if (!name || !key) {
        throw new Error("Select a previous name.");
    }
    let existing = await db_1.default.employeeNameMerge.findUnique({ where: { previousNameKey: key } });
    if (!existing) {
        const legacy = await collectLegacyNameMap();
        const info = legacy.get(key);
        existing = await db_1.default.employeeNameMerge.create({
            data: {
                previousName: info?.name || name,
                previousNameKey: key,
                payrollHead: info?.head || null,
                firstSeen: info?.firstSeen || null,
                lastSeen: info?.lastSeen || null,
                status: "previous",
            },
        });
    }
    return mergePreviousEmployee(existing.id, target);
}
async function unmergePreviousEmployee(id) {
    const existing = await db_1.default.employeeNameMerge.findUnique({ where: { id } });
    if (!existing)
        return null;
    await db_1.default.employeeNameMerge.update({
        where: { id },
        data: {
            status: "previous",
            currentName: null,
            currentNameKey: null,
            currentStaffId: null,
            currentUserId: null,
            mergedAt: null,
        },
    });
    const list = await listPreviousEmployeeRows();
    return list.find(r => r.id === id) ?? null;
}
