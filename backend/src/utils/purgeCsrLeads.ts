import type { Prisma } from "@prisma/client";
import prisma from "../config/db";
import {
  buildCsrResetLeadWhere,
  CSR_RESET_SCOPE_IDS,
  normalizeCsrResetScopes,
  type CsrResetScopeId,
} from "./csrResetPages";

const BATCH_SIZE = 200;

export type PurgeCsrResult = {
  leadsDeleted: number;
  notesDeleted: number;
  subContactsDeleted: number;
  callLogsDeleted: number;
  pages: CsrResetScopeId[];
  scopes: CsrResetScopeId[];
  batches: number;
};

async function deleteLeadBatch(ids: string[]) {
  if (ids.length === 0) {
    return { notesDeleted: 0, subContactsDeleted: 0, callLogsDeleted: 0 };
  }

  const [notes, subContacts, callLogs] = await Promise.all([
    prisma.leadNote.deleteMany({ where: { leadId: { in: ids } } }),
    prisma.subContact.deleteMany({ where: { leadId: { in: ids } } }),
    prisma.callLog.deleteMany({ where: { leadId: { in: ids } } }),
  ]);

  await prisma.lead.deleteMany({ where: { id: { in: ids } } });

  return {
    notesDeleted: notes.count,
    subContactsDeleted: subContacts.count,
    callLogsDeleted: callLogs.count,
  };
}

/** Permanently remove CSR lead data — batched to avoid timeouts and large $in queries. */
export async function purgeCsrLeads(
  csrId: string,
  scopesInput?: string[],
): Promise<PurgeCsrResult> {
  const scopes = normalizeCsrResetScopes(scopesInput);
  const where: Prisma.LeadWhereInput = buildCsrResetLeadWhere(csrId, scopes);
  const resetAll = scopes.length >= CSR_RESET_SCOPE_IDS.length;

  let leadsDeleted = 0;
  let notesDeleted = 0;
  let subContactsDeleted = 0;
  let callLogsDeleted = 0;
  let batches = 0;

  // Always fetch the next batch from the start — cursor pagination breaks after deletes.
  for (;;) {
    const batch = await prisma.lead.findMany({
      where,
      select: { id: true },
      take: BATCH_SIZE,
    });

    if (batch.length === 0) break;

    const ids = batch.map(l => l.id);
    const deleted = await deleteLeadBatch(ids);

    leadsDeleted += batch.length;
    notesDeleted += deleted.notesDeleted;
    subContactsDeleted += deleted.subContactsDeleted;
    callLogsDeleted += deleted.callLogsDeleted;
    batches += 1;

    if (batch.length < BATCH_SIZE) break;
  }

  if (resetAll) {
    const orphaned = await prisma.callLog.deleteMany({ where: { csrId } });
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
