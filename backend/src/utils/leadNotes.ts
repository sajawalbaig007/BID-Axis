import prisma from "../config/db";

/** Persist text in LeadNote table (skip exact duplicates on same lead). */
export async function ensureLeadNoteFromText(
  leadId: string,
  text: string | null | undefined,
  createdAt?: Date,
): Promise<void> {
  const trimmed = text?.trim();
  if (!trimmed) return;

  const existing = await prisma.leadNote.findFirst({
    where: { leadId, text: trimmed },
  });
  if (existing) return;

  await prisma.leadNote.create({
    data: {
      leadId,
      text: trimmed,
      ...(createdAt ? { createdAt } : {}),
    },
  });
}

/** After Excel upload — copy comments column into LeadNote rows. */
export async function seedLeadNotesFromCommentsForFile(uploadedFileId: string): Promise<number> {
  const leads = await prisma.lead.findMany({
    where:   { uploadedFileId },
    select:  { id: true, comments: true, createdAt: true },
  });

  const withComments = leads.filter(l => l.comments?.trim());
  if (withComments.length === 0) return 0;

  const existingKeys = new Set<string>();
  const ID_CHUNK = 500;

  for (let i = 0; i < withComments.length; i += ID_CHUNK) {
    const idChunk = withComments.slice(i, i + ID_CHUNK).map(l => l.id);
    const existing = await prisma.leadNote.findMany({
      where: { leadId: { in: idChunk } },
      select: { leadId: true, text: true },
    });
    for (const n of existing) existingKeys.add(`${n.leadId}::${n.text}`);
  }

  const toCreate = withComments
    .filter(l => !existingKeys.has(`${l.id}::${l.comments!.trim()}`))
    .map(l => ({
      leadId:    l.id,
      text:      l.comments!.trim(),
      createdAt: l.createdAt,
    }));

  if (toCreate.length === 0) return 0;

  const CHUNK = 500;
  for (let i = 0; i < toCreate.length; i += CHUNK) {
    await prisma.leadNote.createMany({ data: toCreate.slice(i, i + CHUNK) });
  }
  return toCreate.length;
}
