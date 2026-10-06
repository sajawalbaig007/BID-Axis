"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeProjectsKeepClients = removeProjectsKeepClients;
exports.deleteLeadsCascade = deleteLeadsCascade;
exports.isRemovedFromProjectDb = isRemovedFromProjectDb;
exports.invalidateAllLeadCaches = invalidateAllLeadCaches;
const db_1 = __importDefault(require("../config/db"));
const csrCache_1 = require("./csrCache");
const cache_1 = require("./cache");
/** Project fields only — CSR client identity (isOldClient, clientCode, status, inBin) untouched. */
const PROJECT_DB_CLEAR = {
    projectTitle: null,
    projectCode: null,
    projectDeadline: null,
    projectBudget: null,
    projectNotes: null,
    projectScope: null,
    projectPhase: null,
    projectPayments: null,
    projectWorkStatus: "completed",
    projectSource: null,
    technicalAssignments: null,
    technicalNotes: null,
    technicalReceivedAt: null,
    pricingReceivedAt: null,
    deadlineTiming: null,
    hiddenOnTechnical: true,
    paidAmount: null,
    uploadedFileId: null,
};
/** Strip all Project-DB fields so the row can never reappear in Admin Project DB. */
async function stripProjectDbFields(ids) {
    await db_1.default.lead.updateMany({
        where: { id: { in: ids } },
        data: {
            ...PROJECT_DB_CLEAR,
            isOldClient: false,
            clientCode: null,
            inBin: true,
            binReason: "deleted-other",
            // Keep Close Client / completed out of "active project" derivation
            status: "completed",
        },
    });
}
/**
 * Admin Project DB delete: remove project fields only.
 * Keeps the lead as CSR Old/New Client (isOldClient, clientCode, Close Client status, not in bin).
 */
async function removeProjectsKeepClients(leadIds) {
    const ids = [...new Set(leadIds.map(String).filter(Boolean))];
    if (ids.length === 0)
        return 0;
    await db_1.default.lead.updateMany({
        where: { id: { in: ids } },
        data: { ...PROJECT_DB_CLEAR },
    });
    // Ensure won-client status so they stay on CSR Clients if they were a project
    const leads = await db_1.default.lead.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true },
    });
    for (const lead of leads) {
        const st = (lead.status ?? "").toLowerCase();
        if (st !== "close client" && st !== "completed" && st !== "closed") {
            await db_1.default.lead.update({
                where: { id: lead.id },
                data: { status: "Close Client" },
            });
        }
    }
    return ids.length;
}
/**
 * Permanently remove leads from Project DB.
 * 1) Strip project fields first (guarantees Project DB hide even if hard-delete fails)
 * 2) Delete child rows + lead document
 */
async function deleteLeadsCascade(leadIds) {
    const ids = [...new Set(leadIds.map(String).filter(Boolean))];
    if (ids.length === 0)
        return 0;
    // Step 1 — must leave Project DB immediately
    await stripProjectDbFields(ids);
    await Promise.all([
        db_1.default.leadNote.deleteMany({ where: { leadId: { in: ids } } }),
        db_1.default.subContact.deleteMany({ where: { leadId: { in: ids } } }),
        db_1.default.callLog.deleteMany({ where: { leadId: { in: ids } } }),
    ]);
    let deleted = 0;
    for (const id of ids) {
        try {
            await db_1.default.lead.delete({ where: { id } });
            deleted += 1;
        }
        catch {
            try {
                const res = await db_1.default.lead.deleteMany({ where: { id } });
                deleted += res.count;
            }
            catch (err) {
                console.error("[deleteLeadsCascade] hard delete failed for", id, err);
            }
        }
    }
    // If hard delete failed, strip again (in case concurrent write restored fields)
    const remaining = await db_1.default.lead.findMany({
        where: { id: { in: ids } },
        select: { id: true, projectTitle: true },
    });
    const stillProject = remaining.filter((l) => !!(l.projectTitle && String(l.projectTitle).trim()));
    if (stillProject.length > 0) {
        await stripProjectDbFields(stillProject.map((l) => l.id));
    }
    return deleted;
}
/** True when this id no longer qualifies as a Project DB row (client row may still exist). */
async function isRemovedFromProjectDb(leadId) {
    const lead = await db_1.default.lead.findFirst({
        where: { id: leadId },
        select: {
            id: true,
            projectTitle: true,
            inBin: true,
        },
    });
    if (!lead)
        return true; // hard-deleted
    if (lead.inBin === true)
        return true;
    if (lead.projectTitle && String(lead.projectTitle).trim())
        return false;
    return true;
}
/** Clear CSR + admin caches so dashboards reflect DB deletions immediately */
async function invalidateAllLeadCaches(csrIds) {
    const ids = csrIds?.length
        ? csrIds
        : (await db_1.default.user.findMany({ where: { role: "csr" }, select: { id: true } })).map((c) => c.id);
    for (const csrId of ids)
        (0, csrCache_1.invalidateCsrLeadCaches)(csrId);
    (0, cache_1.flushAdminClientsCache)();
    (0, cache_1.invalidatePattern)("admin:projects:");
    (0, cache_1.invalidatePattern)("admin:bin:");
    for (const csrId of ids) {
        (0, cache_1.invalidateCache)(`csr:projects:${csrId}`, `csr:leads:${csrId}`, `csr:clients:${csrId}`);
    }
}
