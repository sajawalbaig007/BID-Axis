"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureLeadNoteFromText = ensureLeadNoteFromText;
exports.seedLeadNotesFromCommentsForFile = seedLeadNotesFromCommentsForFile;
const db_1 = __importDefault(require("../config/db"));
/** Persist text in LeadNote table (skip exact duplicates on same lead). */
async function ensureLeadNoteFromText(leadId, text, createdAt) {
    const trimmed = text?.trim();
    if (!trimmed)
        return;
    const existing = await db_1.default.leadNote.findFirst({
        where: { leadId, text: trimmed },
    });
    if (existing)
        return;
    await db_1.default.leadNote.create({
        data: {
            leadId,
            text: trimmed,
            ...(createdAt ? { createdAt } : {}),
        },
    });
}
/** After Excel upload — copy comments column into LeadNote rows. */
async function seedLeadNotesFromCommentsForFile(uploadedFileId) {
    const leads = await db_1.default.lead.findMany({
        where: { uploadedFileId },
        select: { id: true, comments: true, createdAt: true },
    });
    const withComments = leads.filter(l => l.comments?.trim());
    if (withComments.length === 0)
        return 0;
    const existingKeys = new Set();
    const ID_CHUNK = 500;
    for (let i = 0; i < withComments.length; i += ID_CHUNK) {
        const idChunk = withComments.slice(i, i + ID_CHUNK).map(l => l.id);
        const existing = await db_1.default.leadNote.findMany({
            where: { leadId: { in: idChunk } },
            select: { leadId: true, text: true },
        });
        for (const n of existing)
            existingKeys.add(`${n.leadId}::${n.text}`);
    }
    const toCreate = withComments
        .filter(l => !existingKeys.has(`${l.id}::${l.comments.trim()}`))
        .map(l => ({
        leadId: l.id,
        text: l.comments.trim(),
        createdAt: l.createdAt,
    }));
    if (toCreate.length === 0)
        return 0;
    const CHUNK = 500;
    for (let i = 0; i < toCreate.length; i += CHUNK) {
        await db_1.default.leadNote.createMany({ data: toCreate.slice(i, i + CHUNK) });
    }
    return toCreate.length;
}
