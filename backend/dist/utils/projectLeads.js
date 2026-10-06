"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROJECT_LEAD_STATUSES = void 0;
exports.wonClientStatusWhere = wonClientStatusWhere;
exports.buildProjectLeadWhere = buildProjectLeadWhere;
exports.isDisplayableProjectLead = isDisplayableProjectLead;
/** Statuses that appear on CSR / admin Active Projects pages */
exports.PROJECT_LEAD_STATUSES = ["Close Client", "completed", "close client"];
function wonClientStatusWhere() {
    return {
        status: {
            in: [
                "Close Client", "close client", "CLOSE CLIENT", "Close client",
                "completed", "Completed", "COMPLETED",
                "closed", "Closed", "CLOSED",
            ],
        },
    };
}
/** DB filter for Project DB / Technical Active Projects (matches isDisplayableProjectLead). */
function buildProjectLeadWhere(csrId) {
    // NOTE: Do not use NOT:{ inBin:true } here — unset Mongo fields break Prisma filters.
    // Bin / deleted rows are excluded in isDisplayableProjectLead after fetch.
    const where = {
        status: { in: [...exports.PROJECT_LEAD_STATUSES] },
        // Require a real project title — empty/null titles are not Project DB rows
        projectTitle: { not: null },
    };
    if (csrId)
        where.assignedTo = csrId;
    return where;
}
function isDisplayableProjectLead(lead) {
    if (lead.inBin === true)
        return false;
    const st = (lead.status ?? "").toLowerCase();
    if (st !== "close client" && st !== "completed")
        return false;
    // Must have a non-empty project title to appear in Project DB
    if (!lead.projectTitle?.trim())
        return false;
    return true;
}
