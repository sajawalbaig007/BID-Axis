"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.purgeCsrLeads = purgeCsrLeads;
const db_1 = __importDefault(require("../config/db"));
const csrResetPages_1 = require("./csrResetPages");
const BATCH_SIZE = 200;
async function deleteLeadBatch(ids) {
    if (ids.length === 0) {
        return { notesDeleted: 0, subContactsDeleted: 0, callLogsDeleted: 0 };
    }
    const [notes, subContacts, callLogs] = await Promise.all([
        db_1.default.leadNote.deleteMany({ where: { leadId: { in: ids } } }),
        db_1.default.subContact.deleteMany({ where: { leadId: { in: ids } } }),
        db_1.default.callLog.deleteMany({ where: { leadId: { in: ids } } }),
    ]);
    await db_1.default.lead.deleteMany({ where: { id: { in: ids } } });
    return {
        notesDeleted: notes.count,
        subContactsDeleted: subContacts.count,
        callLogsDeleted: callLogs.count,
    };
}
/** Permanently remove CSR lead data — batched to avoid timeouts and large $in queries. */
async function purgeCsrLeads(csrId, scopesInput) {
    const scopes = (0, csrResetPages_1.normalizeCsrResetScopes)(scopesInput);
    const where = (0, csrResetPages_1.buildCsrResetLeadWhere)(csrId, scopes);
    const resetAll = scopes.length >= csrResetPages_1.CSR_RESET_SCOPE_IDS.length;
    let leadsDeleted = 0;
    let notesDeleted = 0;
    let subContactsDeleted = 0;
    let callLogsDeleted = 0;
    let batches = 0;
    // Always fetch the next batch from the start — cursor pagination breaks after deletes.
    for (;;) {
        const batch = await db_1.default.lead.findMany({
            where,
            select: { id: true },
            take: BATCH_SIZE,
        });
        if (batch.length === 0)
            break;
        const ids = batch.map(l => l.id);
        const deleted = await deleteLeadBatch(ids);
        leadsDeleted += batch.length;
        notesDeleted += deleted.notesDeleted;
        subContactsDeleted += deleted.subContactsDeleted;
        callLogsDeleted += deleted.callLogsDeleted;
        batches += 1;
        if (batch.length < BATCH_SIZE)
            break;
    }
    if (resetAll) {
        const orphaned = await db_1.default.callLog.deleteMany({ where: { csrId } });
        callLogsDeleted += orphaned.count;
    }
    return {
        leadsDeleted,
        notesDeleted,
        subContactsDeleted,
        callLogsDeleted,
        pages: scopes,
        scopes,
        batches,
    };
}
