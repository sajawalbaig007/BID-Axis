"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN_LEAD_LIST_SELECT = exports.uniqueLeadsByPhone = void 0;
exports.isImportantStatusWhere = isImportantStatusWhere;
exports.isInterestedStatusWhere = isInterestedStatusWhere;
exports.isPendingStatusWhere = isPendingStatusWhere;
exports.leadHasMeetingDate = leadHasMeetingDate;
exports.importantOnlyWhere = importantOnlyWhere;
exports.scheduledCallWhere = scheduledCallWhere;
exports.closedClientStatusWhere = closedClientStatusWhere;
exports.adminAssignedPendingWhere = adminAssignedPendingWhere;
exports.allAdminClientViewsWhere = allAdminClientViewsWhere;
exports.adminClientBucket = adminClientBucket;
exports.clientCodeFamilyKey = clientCodeFamilyKey;
exports.adminLeadIdentityKey = adminLeadIdentityKey;
exports.dedupeAdminLeads = dedupeAdminLeads;
exports.uniqueLeadsByClientIdentity = uniqueLeadsByClientIdentity;
exports.uniqueClosedLeadsByClientCode = uniqueClosedLeadsByClientCode;
exports.buildAdminClientViewWhere = buildAdminClientViewWhere;
exports.buildAdminClientListWhere = buildAdminClientListWhere;
const projectLeads_1 = require("./projectLeads");
const binLeads_1 = require("./binLeads");
const nextProjectCode_1 = require("./nextProjectCode");
/**
 * Status is the source of truth for page routing.
 * Do not OR with boolean flags alone — stale important/interested flags
 * were putting leads on the wrong CSR pages after status changes.
 */
/** Index-friendly equality — `mode: "insensitive"` cannot use Mongo status indexes. */
function statusIn(values) {
    const variants = new Set();
    for (const v of values) {
        const t = v.trim();
        if (!t)
            continue;
        variants.add(t);
        variants.add(t.toLowerCase());
        variants.add(t.toUpperCase());
        const titled = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
        variants.add(titled);
    }
    return { status: { in: [...variants] } };
}
function isImportantStatusWhere() {
    return statusIn(["important"]);
}
function isInterestedStatusWhere() {
    return statusIn(["interested"]);
}
function isPendingStatusWhere() {
    return statusIn(["pending"]);
}
function leadHasMeetingDate(nextSchedule) {
    return !!(nextSchedule && String(nextSchedule).trim());
}
function noScheduleWhere() {
    return {
        OR: [
            { nextSchedule: { isSet: false } },
            { nextSchedule: null },
            { nextSchedule: "" },
        ],
    };
}
function hasScheduleWhere() {
    return {
        AND: [
            { nextSchedule: { isSet: true } },
            { NOT: { nextSchedule: "" } },
        ],
    };
}
/** Important flag only — no scheduled meeting date (matches CSR isImportantOnly) */
function importantOnlyWhere() {
    return {
        AND: [isImportantStatusWhere(), noScheduleWhere()],
    };
}
/** Important + meeting scheduled (matches CSR isScheduledCall) */
function scheduledCallWhere() {
    return {
        AND: [isImportantStatusWhere(), hasScheduleWhere()],
    };
}
/** Won / closed clients not in bin — includes admin-created closed records. */
function closedClientStatusWhere() {
    return {
        AND: [
            (0, projectLeads_1.wonClientStatusWhere)(),
            (0, binLeads_1.notInBinFilter)(),
        ],
    };
}
/** Admin/manager manual adds left on pending — must still appear on All / search. */
function adminAssignedPendingWhere() {
    return {
        AND: [
            statusIn(["pending", "active"]),
            (0, binLeads_1.notInBinFilter)(),
            { csr: { is: { role: { in: ["admin", "manager", "technical_manager"] } } } },
        ],
    };
}
/** Important + Schedule + Interested + Closed + admin-added pending (Admin Leads "All" pill). */
function allAdminClientViewsWhere() {
    return {
        OR: [
            importantOnlyWhere(),
            scheduledCallWhere(),
            isInterestedStatusWhere(),
            closedClientStatusWhere(),
            adminAssignedPendingWhere(),
        ],
    };
}
function adminClientBucket(status, nextSchedule) {
    const s = (status ?? "").toLowerCase();
    const hasSchedule = leadHasMeetingDate(nextSchedule);
    if (s === "important")
        return hasSchedule ? "schedule" : "important";
    if (s === "interested")
        return "interested";
    if (s === "close client" || s === "completed" || s === "closed")
        return "closed";
    return null;
}
function leadCodeRaw(lead) {
    return (lead.clientCode || lead.projectCode || "").trim();
}
function leadSeq(lead) {
    return (0, nextProjectCode_1.parseProjectCodeSeq)(leadCodeRaw(lead))?.seq ?? 0;
}
function pickLatestRepresentative(group) {
    return [...group].sort((a, b) => {
        const seqDiff = leadSeq(b) - leadSeq(a);
        if (seqDiff !== 0)
            return seqDiff;
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return tb - ta;
    })[0];
}
/** `CODE-01` / `code-02` → family key from the part before `-`. */
function clientCodeFamilyKey(clientCode, projectCode) {
    const raw = (clientCode ?? "").trim() || (projectCode ?? "").trim();
    if (!raw)
        return null;
    const parsed = (0, nextProjectCode_1.parseProjectCodeSeq)(raw);
    const base = (parsed?.base ?? raw).trim();
    return base ? `code:${base.toLowerCase()}` : null;
}
function adminLeadIdentityKey(lead, preferClientCode) {
    if (preferClientCode) {
        const codeKey = clientCodeFamilyKey(lead.clientCode, lead.projectCode);
        if (codeKey)
            return codeKey;
    }
    const digits = (lead.phone ?? "").replace(/\D/g, "");
    if (digits.length >= 7)
        return `phone:${digits}`;
    const email = (lead.email ?? "").trim().toLowerCase();
    if (email)
        return `email:${email}`;
    const co = (lead.company ?? "").trim().toLowerCase();
    if (co)
        return `company:${co}`;
    return `id:${lead.id}`;
}
function dedupeAdminLeads(leads, preferClientCode = false) {
    const groups = new Map();
    for (const lead of leads) {
        const key = adminLeadIdentityKey(lead, preferClientCode);
        const group = groups.get(key);
        if (group)
            group.push(lead);
        else
            groups.set(key, [lead]);
    }
    const unique = [];
    const extraProjectCountById = new Map();
    const extraProjectsById = new Map();
    for (const group of groups.values()) {
        const representative = pickLatestRepresentative(group);
        unique.push(representative);
        const seen = new Set();
        const extras = [];
        const repRaw = leadCodeRaw(representative).toLowerCase();
        for (const lead of group) {
            if (lead.id === representative.id)
                continue;
            const raw = leadCodeRaw(lead);
            if (!raw)
                continue;
            const key = raw.toLowerCase();
            if (seen.has(key) || key === repRaw)
                continue;
            seen.add(key);
            extras.push({
                code: raw,
                scope: (lead.interestedService ?? "").trim(),
            });
        }
        extras.sort((a, b) => {
            const sa = (0, nextProjectCode_1.parseProjectCodeSeq)(a.code)?.seq ?? 0;
            const sb = (0, nextProjectCode_1.parseProjectCodeSeq)(b.code)?.seq ?? 0;
            return sb - sa;
        });
        extraProjectsById.set(representative.id, extras);
        extraProjectCountById.set(representative.id, extras.length);
    }
    return { unique, extraProjectCountById, extraProjectsById };
}
/** Same uniqueness as CSR Clients: one row per phone, else company, else id. */
function uniqueLeadsByClientIdentity(leads) {
    return dedupeAdminLeads(leads, false).unique;
}
/** Closed / old clients: one row per client-code prefix (`CODE` in `CODE-01`). */
function uniqueClosedLeadsByClientCode(leads) {
    return dedupeAdminLeads(leads, true).unique;
}
/** @deprecated alias — use uniqueLeadsByClientIdentity */
exports.uniqueLeadsByPhone = uniqueLeadsByClientIdentity;
function buildAdminClientViewWhere(view) {
    switch (view) {
        case "important": return importantOnlyWhere();
        case "schedule": return scheduledCallWhere();
        case "interested": return isInterestedStatusWhere();
        case "closed": return closedClientStatusWhere();
        case "all": return allAdminClientViewsWhere();
        default: return allAdminClientViewsWhere();
    }
}
function buildAdminClientListWhere(view, csrName, search, scheduleDate, extras) {
    const parts = [
        view === "important_status" ? isImportantStatusWhere() : buildAdminClientViewWhere(view),
    ];
    const csrId = extras?.csrId?.trim();
    if (csrId && csrId !== "all") {
        parts.push({ assignedTo: csrId });
    }
    else if (csrName && csrName !== "all") {
        parts.push({ csr: { is: { name: csrName } } });
    }
    if (scheduleDate && view === "schedule") {
        parts.push({ nextSchedule: scheduleDate });
    }
    const q = search?.trim();
    if (q) {
        const contains = { contains: q, mode: "insensitive" };
        parts.push({
            OR: [
                { name: contains },
                { company: contains },
                { phone: contains },
                { email: contains },
                { ownerName: contains },
                { projectTitle: contains },
                { projectCode: contains },
                { clientCode: contains },
                { interestedService: contains },
                { status: contains },
                { comments: contains },
                { projectNotes: contains },
                { state: contains },
                { csr: { is: { name: contains } } },
                { csr: { is: { csrCode: contains } } },
            ],
        });
    }
    const phonePrefix = extras?.phonePrefix?.replace(/\D/g, "") ?? "";
    if (phonePrefix) {
        parts.push({ phone: { contains: phonePrefix } });
    }
    const state = extras?.state?.trim() ?? "";
    const areaCodes = (extras?.areaCodes ?? []).map(c => c.replace(/\D/g, "")).filter(c => c.length >= 3);
    if (state) {
        const stateOr = [
            { state: { contains: state, mode: "insensitive" } },
        ];
        for (const code of areaCodes.slice(0, 40)) {
            stateOr.push({ phone: { contains: code } });
        }
        parts.push({ OR: stateOr });
    }
    return parts.length === 1 ? parts[0] : { AND: parts };
}
exports.ADMIN_LEAD_LIST_SELECT = {
    id: true,
    name: true,
    company: true,
    phone: true,
    email: true,
    website: true,
    state: true,
    status: true,
    important: true,
    interested: true,
    isOldClient: true,
    clientCode: true,
    projectCode: true,
    interestedService: true,
    comments: true,
    followUpNotes: true,
    nextSchedule: true,
    nextTime: true,
    timezone: true,
    createdAt: true,
    updatedAt: true,
    csr: { select: { id: true, name: true, csrCode: true } },
    uploadFile: { select: { companyName: true } },
    subContacts: {
        select: { id: true, phone: true, email: true, name: true, designation: true },
    },
    _count: { select: { notes: true } },
    notes: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, text: true, createdAt: true, parentId: true },
    },
};
