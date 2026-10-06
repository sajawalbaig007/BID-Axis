import type { Prisma } from "@prisma/client";

/** Statuses that appear on CSR / admin Active Projects pages */
export const PROJECT_LEAD_STATUSES = ["Close Client", "completed", "close client"];

export function wonClientStatusWhere(): Prisma.LeadWhereInput {
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
export function buildProjectLeadWhere(csrId?: string): Prisma.LeadWhereInput {
  // NOTE: Do not use NOT:{ inBin:true } here — unset Mongo fields break Prisma filters.
  // Bin / deleted rows are excluded in isDisplayableProjectLead after fetch.
  const where: Prisma.LeadWhereInput = {
    status: { in: [...PROJECT_LEAD_STATUSES] },
    // Require a real project title — empty/null titles are not Project DB rows
    projectTitle: { not: null },
  };
  if (csrId) where.assignedTo = csrId;
  return where;
}

export function isDisplayableProjectLead(lead: {
  status?: string | null;
  projectTitle?: string | null;
  isOldClient?: boolean;
  clientCode?: string | null;
  inBin?: boolean | null;
}): boolean {
  if (lead.inBin === true) return false;
  const st = (lead.status ?? "").toLowerCase();
  if (st !== "close client" && st !== "completed") return false;
  // Must have a non-empty project title to appear in Project DB
  if (!lead.projectTitle?.trim()) return false;
  return true;
}
