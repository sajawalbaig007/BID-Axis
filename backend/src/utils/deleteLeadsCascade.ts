import prisma from "../config/db";
import { invalidateCsrLeadCaches } from "./csrCache";
import { invalidatePattern, flushAdminClientsCache, invalidateCache } from "./cache";

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
} as const;

/** Strip all Project-DB fields so the row can never reappear in Admin Project DB. */
async function stripProjectDbFields(ids: string[]): Promise<void> {
  await prisma.lead.updateMany({
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
export async function removeProjectsKeepClients(leadIds: string[]): Promise<number> {
  const ids = [...new Set(leadIds.map(String).filter(Boolean))];
  if (ids.length === 0) return 0;

  await prisma.lead.updateMany({
    where: { id: { in: ids } },
    data: { ...PROJECT_DB_CLEAR },
  });

  // Ensure won-client status so they stay on CSR Clients if they were a project
  const leads = await prisma.lead.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true },
  });
  for (const lead of leads) {
    const st = (lead.status ?? "").toLowerCase();
    if (st !== "close client" && st !== "completed" && st !== "closed") {
      await prisma.lead.update({
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
export async function deleteLeadsCascade(leadIds: string[]): Promise<number> {
  const ids = [...new Set(leadIds.map(String).filter(Boolean))];
  if (ids.length === 0) return 0;

  // Step 1 — must leave Project DB immediately
  await stripProjectDbFields(ids);

  await Promise.all([
    prisma.leadNote.deleteMany({ where: { leadId: { in: ids } } }),
    prisma.subContact.deleteMany({ where: { leadId: { in: ids } } }),
    prisma.callLog.deleteMany({ where: { leadId: { in: ids } } }),
  ]);

  let deleted = 0;
  for (const id of ids) {
    try {
      await prisma.lead.delete({ where: { id } });
      deleted += 1;
    } catch {
      try {
        const res = await prisma.lead.deleteMany({ where: { id } });
        deleted += res.count;
      } catch (err) {
        console.error("[deleteLeadsCascade] hard delete failed for", id, err);
      }
    }
  }

  // If hard delete failed, strip again (in case concurrent write restored fields)
  const remaining = await prisma.lead.findMany({
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
export async function isRemovedFromProjectDb(leadId: string): Promise<boolean> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId },
    select: {
      id: true,
      projectTitle: true,
      inBin: true,
    },
  });
  if (!lead) return true; // hard-deleted
  if (lead.inBin === true) return true;
  if (lead.projectTitle && String(lead.projectTitle).trim()) return false;
  return true;
}

/** Clear CSR + admin caches so dashboards reflect DB deletions immediately */
export async function invalidateAllLeadCaches(csrIds?: string[]): Promise<void> {
  const ids = csrIds?.length
    ? csrIds
    : (await prisma.user.findMany({ where: { role: "csr" }, select: { id: true } })).map((c) => c.id);

  for (const csrId of ids) invalidateCsrLeadCaches(csrId);
  flushAdminClientsCache();
  invalidatePattern("admin:projects:");
  invalidatePattern("admin:bin:");
  for (const csrId of ids) {
    invalidateCache(`csr:projects:${csrId}`, `csr:leads:${csrId}`, `csr:clients:${csrId}`);
  }
}
