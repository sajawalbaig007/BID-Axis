"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOT_PICKED_LIMIT = exports.NOT_INTERESTED_LIMIT = void 0;
exports.binReasonLabel = binReasonLabel;
exports.resolveDeleteBinReason = resolveDeleteBinReason;
exports.notInBinFilter = notInBinFilter;
exports.notHiddenOnMainFilter = notHiddenOnMainFilter;
exports.activeCsrLeadWhere = activeCsrLeadWhere;
exports.mainPipelineWhere = mainPipelineWhere;
exports.pendingLeadWhere = pendingLeadWhere;
exports.filterActiveLeads = filterActiveLeads;
exports.buildActiveRetryWhere = buildActiveRetryWhere;
exports.buildNotBinWhere = buildNotBinWhere;
exports.buildBinWhere = buildBinWhere;
exports.isBinLead = isBinLead;
exports.NOT_INTERESTED_LIMIT = 3;
exports.NOT_PICKED_LIMIT = 7;
function binReasonLabel(reason) {
    switch (reason) {
        case "limit-not-picked": return "Not Picked — limit reached";
        case "limit-not-interested": return "Not Interested — limit reached";
        case "deleted-important": return "Deleted (Important)";
        case "deleted-interested": return "Deleted (Interested)";
        case "deleted-pending": return "Deleted (Pending)";
        default: return reason ? `Deleted (${reason})` : "Bin";
    }
}
function resolveDeleteBinReason(status) {
    const s = (status ?? "").toLowerCase();
    if (s === "important")
        return "deleted-important";
    if (s === "interested")
        return "deleted-interested";
    if (s === "pending")
        return "deleted-pending";
    return "deleted-other";
}
/** Match leads not in bin — includes legacy MongoDB docs where inBin was never persisted */
function notInBinFilter() {
    return { NOT: { inBin: true } };
}
/** Visible on CSR main pipeline — includes legacy docs where hiddenOnMain was never persisted */
function notHiddenOnMainFilter() {
    return { NOT: { hiddenOnMain: true } };
}
/** Active leads for a CSR (not in bin) — same rules as legacy filterActiveLeads for inBin */
function activeCsrLeadWhere(csrId) {
    return {
        assignedTo: csrId,
        ...notInBinFilter(),
    };
}
/** Main dashboard pipeline — matches old frontend mainLeads (!hiddenOnMain) */
function mainPipelineWhere(csrId) {
    return {
        AND: [activeCsrLeadWhere(csrId), notHiddenOnMainFilter()],
    };
}
/** Today / Pending queue — pending status is enough; hiddenOnMain must not hide them */
function pendingLeadWhere(csrId) {
    return {
        ...activeCsrLeadWhere(csrId),
        status: { equals: "pending", mode: "insensitive" },
    };
}
/** Filter in memory when MongoDB docs lack persisted inBin (Prisma default is false). */
function filterActiveLeads(leads) {
    return leads.filter(l => !isBinLead(l));
}
/** Leads still being retried on Not Interested / Not Picked pages */
function buildActiveRetryWhere(csrId) {
    return {
        assignedTo: csrId,
        ...notInBinFilter(),
        OR: [
            {
                status: { equals: "Not Interested", mode: "insensitive" },
                notInterestedCount: { lt: exports.NOT_INTERESTED_LIMIT },
            },
            {
                status: { in: ["not picked", "not completed"], mode: "insensitive" },
                notPickedCount: { lt: exports.NOT_PICKED_LIMIT },
            },
        ],
    };
}
/** Leads that are not in bin (includes legacy docs without persisted inBin). */
function buildNotBinWhere(csrId) {
    return { NOT: buildBinWhere(csrId) };
}
/** CSR or admin bin — limit reached and manually deleted leads */
function buildBinWhere(csrId) {
    const where = {
        OR: [
            { inBin: true },
            {
                AND: [
                    { status: { in: ["not picked", "not completed"] } },
                    { notPickedCount: { gte: exports.NOT_PICKED_LIMIT } },
                ],
            },
            {
                AND: [
                    { status: "Not Interested" },
                    { notInterestedCount: { gte: exports.NOT_INTERESTED_LIMIT } },
                ],
            },
        ],
    };
    if (csrId)
        where.assignedTo = csrId;
    return where;
}
function isBinLead(lead) {
    if (lead.inBin)
        return true;
    const st = lead.status ?? "";
    if (["not picked", "not completed"].includes(st) && (lead.notPickedCount ?? 0) >= exports.NOT_PICKED_LIMIT)
        return true;
    if (st === "Not Interested" && (lead.notInterestedCount ?? 0) >= exports.NOT_INTERESTED_LIMIT)
        return true;
    return false;
}
