"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPendingPipelineStatus = isPendingPipelineStatus;
exports.isWonClientStatus = isWonClientStatus;
exports.isWonClientUploadStatus = isWonClientUploadStatus;
exports.isWonProjectLead = isWonProjectLead;
exports.hasPriorWonClient = hasPriorWonClient;
exports.clearPendingDuplicatesForPhone = clearPendingDuplicatesForPhone;
exports.clearPendingDuplicatesForCompany = clearPendingDuplicatesForCompany;
exports.healPendingDuplicatesForCsr = healPendingDuplicatesForCsr;
exports.clientIdentityKey = clientIdentityKey;
exports.uploadCategoryOldFlag = uploadCategoryOldFlag;
exports.reconcileClientOldFlagsForCsr = reconcileClientOldFlagsForCsr;
exports.healPipelineLeaksForCsr = healPipelineLeaksForCsr;
exports.sortNotesNewestFirst = sortNotesNewestFirst;
const db_1 = __importDefault(require("../config/db"));
const leadPhoneLookup_1 = require("./leadPhoneLookup");
const deleteLeadsCascade_1 = require("./deleteLeadsCascade");
const projectLeads_1 = require("./projectLeads");
const binLeads_1 = require("./binLeads");
const phone_1 = require("./phone");
const leadNotes_1 = require("./leadNotes");
function isPendingPipelineStatus(status) {
    return (status ?? "").toLowerCase() === "pending";
}
function isWonClientStatus(status) {
    const s = (status ?? "").toLowerCase();
    return s === "close client" || s === "completed" || s === "closed";
}
function isWonClientUploadStatus(status) {
    return isWonClientStatus(status);
}
/** Won deal that counts as a real project (not a bare pipeline row). */
function isWonProjectLead(lead) {
    if (!isWonClientStatus(lead.status))
        return false;
    return !!(lead.projectTitle?.trim() ||
        lead.clientCode?.trim() ||
        lead.projectBudget?.trim() ||
        lead.projectDeadline?.trim());
}
/** Old client = this phone/company already had an active won project before (excluding current lead / bin). */
async function hasPriorWonClient(phone, company, excludeLeadId) {
    if (phone?.trim()) {
        const related = await (0, leadPhoneLookup_1.findLeadsByPhone)(phone);
        if (related.some(l => l.id !== excludeLeadId &&
            !l.inBin &&
            isWonClientStatus(l.status))) {
            return true;
        }
    }
    const companyTrim = company?.trim();
    if (companyTrim) {
        const previousWin = await db_1.default.lead.findFirst({
            where: {
                ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
                company: { equals: companyTrim, mode: "insensitive" },
                ...(0, binLeads_1.notInBinFilter)(),
                OR: [
                    { status: { equals: "Close Client", mode: "insensitive" } },
                    { status: { equals: "completed", mode: "insensitive" } },
                ],
            },
        });
        if (previousWin)
            return true;
    }
    return false;
}
async function migrateNotesBeforeDelete(pendingDupes, keepLeadId) {
    if (pendingDupes.length === 0)
        return;
    await db_1.default.leadNote.updateMany({
        where: { leadId: { in: pendingDupes.map(l => l.id) } },
        data: { leadId: keepLeadId },
    });
    const keepLead = await db_1.default.lead.findUnique({
        where: { id: keepLeadId },
        select: { comments: true, followUpNotes: true },
    });
    for (const dup of pendingDupes) {
        if (dup.comments?.trim()) {
            await (0, leadNotes_1.ensureLeadNoteFromText)(keepLeadId, dup.comments);
        }
        if (dup.comments?.trim() && !keepLead?.comments?.trim()) {
            await db_1.default.lead.update({ where: { id: keepLeadId }, data: { comments: dup.comments } });
        }
        if (dup.followUpNotes?.trim()) {
            await (0, leadNotes_1.ensureLeadNoteFromText)(keepLeadId, dup.followUpNotes);
        }
        if (dup.followUpNotes?.trim() && !keepLead?.followUpNotes?.trim()) {
            await db_1.default.lead.update({ where: { id: keepLeadId }, data: { followUpNotes: dup.followUpNotes } });
        }
    }
}
/** Remove duplicate pending call-data rows once the client is won / moved to clients. */
async function clearPendingDuplicatesForPhone(phone, csrId, keepLeadId) {
    if (!phone?.trim())
        return 0;
    const matches = await (0, leadPhoneLookup_1.findLeadsByPhone)(phone);
    const pendingDupes = matches.filter(l => l.id !== keepLeadId &&
        l.assignedTo === csrId &&
        isPendingPipelineStatus(l.status) &&
        !l.inBin);
    if (pendingDupes.length === 0)
        return 0;
    await migrateNotesBeforeDelete(pendingDupes, keepLeadId);
    return (0, deleteLeadsCascade_1.deleteLeadsCascade)(pendingDupes.map(l => l.id));
}
async function clearPendingDuplicatesForCompany(company, csrId, keepLeadId) {
    const companyTrim = company?.trim();
    if (!companyTrim)
        return 0;
    const pendingDupes = await db_1.default.lead.findMany({
        where: {
            id: { not: keepLeadId },
            assignedTo: csrId,
            company: { equals: companyTrim, mode: "insensitive" },
            status: { equals: "pending", mode: "insensitive" },
            ...(0, binLeads_1.notInBinFilter)(),
        },
        select: { id: true, comments: true, followUpNotes: true },
    });
    if (pendingDupes.length === 0)
        return 0;
    await migrateNotesBeforeDelete(pendingDupes, keepLeadId);
    return (0, deleteLeadsCascade_1.deleteLeadsCascade)(pendingDupes.map(l => l.id));
}
/** Drop stale pending call-data rows when the same phone/company already has a won client. */
async function healPendingDuplicatesForCsr(csrId) {
    const wonLeads = await db_1.default.lead.findMany({
        where: {
            assignedTo: csrId,
            ...(0, projectLeads_1.wonClientStatusWhere)(),
            ...(0, binLeads_1.notInBinFilter)(),
        },
        select: { id: true, phone: true, company: true },
    });
    let removed = 0;
    for (const lead of wonLeads) {
        if (lead.phone?.trim()) {
            removed += await clearPendingDuplicatesForPhone(lead.phone, csrId, lead.id);
        }
        if (lead.company?.trim()) {
            removed += await clearPendingDuplicatesForCompany(lead.company, csrId, lead.id);
        }
    }
    return removed;
}
/** Group won leads by phone (or company) for new vs old client tabs. */
function clientIdentityKey(lead) {
    const digits = (0, phone_1.normalizePhone)(lead.phone ?? "");
    if (digits.length >= 7)
        return `phone:${digits}`;
    const co = lead.company?.trim().toLowerCase();
    if (co)
        return `company:${co}`;
    return `id:${lead.id}`;
}
/** Upload category locks new vs old client tab — never overridden by auto-reconcile. */
function uploadCategoryOldFlag(category) {
    if (category === "new-client" || category === "interested" || category === "call-data") {
        return false;
    }
    if (category === "old-client" || category === "important" || category === "active-projects") {
        return true;
    }
    return undefined;
}
/** 2+ won deals = old client; explicit upload category + isOldClient also count. */
async function reconcileClientOldFlagsForCsr(csrId) {
    const wonLeads = await db_1.default.lead.findMany({
        where: {
            assignedTo: csrId,
            ...(0, projectLeads_1.wonClientStatusWhere)(),
            ...(0, binLeads_1.notInBinFilter)(),
        },
        select: {
            id: true,
            phone: true,
            company: true,
            isOldClient: true,
            uploadFile: { select: { uploadCategory: true } },
        },
    });
    const groups = new Map();
    for (const lead of wonLeads) {
        const key = clientIdentityKey(lead);
        if (!groups.has(key))
            groups.set(key, []);
        groups.get(key).push(lead);
    }
    for (const group of groups.values()) {
        const shouldBeOld = group.length >= 2 ||
            group.some(l => l.isOldClient) ||
            group.some(l => l.uploadFile?.uploadCategory === "old-client");
        for (const lead of group) {
            const locked = uploadCategoryOldFlag(lead.uploadFile?.uploadCategory);
            const next = group.length >= 2 ? true : locked !== undefined ? locked : shouldBeOld;
            if (lead.isOldClient !== next) {
                await db_1.default.lead.update({
                    where: { id: lead.id },
                    data: { isOldClient: next },
                });
            }
        }
    }
}
/** Won clients must never appear on call-data; run before list/stats queries. */
async function healPipelineLeaksForCsr(csrId) {
    await db_1.default.lead.updateMany({
        where: {
            assignedTo: csrId,
            ...(0, projectLeads_1.wonClientStatusWhere)(),
            NOT: { hiddenOnMain: true },
        },
        data: { hiddenOnMain: true },
    });
    await reconcileClientOldFlagsForCsr(csrId);
    return healPendingDuplicatesForCsr(csrId);
}
function sortNotesNewestFirst(notes) {
    return [...notes].sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
    });
}
