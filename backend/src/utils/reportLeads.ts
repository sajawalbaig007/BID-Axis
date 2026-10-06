import type { Prisma } from "@prisma/client";
import prisma from "../config/db";

const REPORT_LEAD_SELECT = {
  id: true,
  status: true,
  important: true,
  interested: true,
  assignedTo: true,
  createdAt: true,
  updatedAt: true,
  csr: { select: { name: true, csrCode: true } },
} satisfies Prisma.LeadSelect;

export type ReportLeadRow = Prisma.LeadGetPayload<{ select: typeof REPORT_LEAD_SELECT }>;

const BATCH_SIZE = 2500;

/** Same rows as a single findMany — loads in batches to reduce memory spikes on large datasets. */
export async function fetchReportLeads(where: Prisma.LeadWhereInput): Promise<ReportLeadRow[]> {
  const rows: ReportLeadRow[] = [];
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.lead.findMany({
      where,
      select: REPORT_LEAD_SELECT,
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    rows.push(...batch);
    if (batch.length < BATCH_SIZE) break;
    cursor = batch[batch.length - 1]!.id;
  }

  return rows;
}
