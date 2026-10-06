/**
 * Deduplicate ONLY pending / Today Leads (same phone last-10 digits).
 * Does NOT touch Close Client, interested, important, schedule, etc.
 *
 * Usage:
 *   node scripts/dedupe-leads-by-phone.js           # dry-run
 *   node scripts/dedupe-leads-by-phone.js --apply   # delete pending duplicates only
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function phoneKey(phone) {
  const digits = normalizePhone(phone);
  if (digits.length < 7) return "";
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function isPending(status) {
  return String(status || "").toLowerCase() === "pending";
}

function leadScore(lead) {
  let score = 0;
  if (lead.comments?.trim()) score += 3;
  if (lead.followUpNotes?.trim()) score += 3;
  if (lead.interestedService?.trim()) score += 2;
  if (lead.name?.trim()) score += 2;
  if (lead.company?.trim()) score += 2;
  if (lead.email?.trim()) score += 1;
  score += Math.min(lead._noteCount || 0, 20);
  // Prefer more recently updated
  score += Math.min(10, Math.floor(new Date(lead.updatedAt).getTime() / 1e11));
  return score;
}

function pickKeeper(leads) {
  return [...leads].sort((a, b) => {
    const d = leadScore(b) - leadScore(a);
    if (d !== 0) return d;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  })[0];
}

async function migrateNotes(dupIds, keepId) {
  if (!dupIds.length) return;
  await prisma.leadNote.updateMany({
    where: { leadId: { in: dupIds } },
    data: { leadId: keepId },
  });

  const keep = await prisma.lead.findUnique({
    where: { id: keepId },
    select: { comments: true, followUpNotes: true },
  });
  const dups = await prisma.lead.findMany({
    where: { id: { in: dupIds } },
    select: { id: true, comments: true, followUpNotes: true },
  });

  for (const dup of dups) {
    if (dup.comments?.trim() && !keep?.comments?.trim()) {
      await prisma.lead.update({ where: { id: keepId }, data: { comments: dup.comments } });
    }
    if (dup.followUpNotes?.trim() && !keep?.followUpNotes?.trim()) {
      await prisma.lead.update({ where: { id: keepId }, data: { followUpNotes: dup.followUpNotes } });
    }
    for (const text of [dup.comments, dup.followUpNotes]) {
      const t = text?.trim();
      if (!t) continue;
      const exists = await prisma.leadNote.findFirst({
        where: { leadId: keepId, text: t },
        select: { id: true },
      });
      if (!exists) {
        await prisma.leadNote.create({ data: { leadId: keepId, text: t } });
      }
    }
  }
}

async function deleteCascade(ids) {
  if (!ids.length) return 0;
  await Promise.all([
    prisma.leadNote.deleteMany({ where: { leadId: { in: ids } } }),
    prisma.subContact.deleteMany({ where: { leadId: { in: ids } } }),
    prisma.callLog.deleteMany({ where: { leadId: { in: ids } } }),
  ]);
  const { count } = await prisma.lead.deleteMany({ where: { id: { in: ids } } });
  return count;
}

async function main() {
  console.log(APPLY ? "MODE: APPLY (pending duplicates only)" : "MODE: DRY-RUN (pending only, no deletes)");

  const csrs = await prisma.user.findMany({
    where: { role: "csr" },
    select: { id: true, name: true, email: true },
  });
  const csrName = Object.fromEntries(csrs.map(c => [c.id, c.name || c.email || c.id]));

  // Today Leads + Pending tabs both use status=pending (not in bin)
  const leads = await prisma.lead.findMany({
    where: {
      inBin: false,
      status: { equals: "pending", mode: "insensitive" },
      phone: { not: null },
    },
    select: {
      id: true,
      name: true,
      company: true,
      phone: true,
      email: true,
      status: true,
      assignedTo: true,
      interestedService: true,
      comments: true,
      followUpNotes: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  console.log(`Pending/Today leads with phone: ${leads.length}`);

  const noteGroups = await prisma.leadNote.groupBy({
    by: ["leadId"],
    _count: { _all: true },
  });
  const noteCount = Object.fromEntries(noteGroups.map(n => [n.leadId, n._count._all]));

  const byPhone = new Map();
  for (const lead of leads) {
    if (!isPending(lead.status)) continue;
    const key = phoneKey(lead.phone);
    if (!key) continue;
    const list = byPhone.get(key) ?? [];
    list.push({ ...lead, _noteCount: noteCount[lead.id] || 0 });
    byPhone.set(key, list);
  }

  const dupGroups = [...byPhone.entries()].filter(([, list]) => list.length > 1);
  console.log(`Pending duplicate phone groups: ${dupGroups.length}`);

  let crossCsrGroups = 0;
  let sameCsrGroups = 0;
  let toDelete = 0;
  const samples = [];

  for (const [key, group] of dupGroups) {
    const csrIds = new Set(group.map(l => l.assignedTo));
    if (csrIds.size > 1) crossCsrGroups++;
    else sameCsrGroups++;

    const keep = pickKeeper(group);
    const remove = group.filter(l => l.id !== keep.id);
    toDelete += remove.length;

    if (samples.length < 20) {
      samples.push({
        phoneKey: key,
        keep: {
          name: keep.name,
          company: keep.company,
          csr: csrName[keep.assignedTo] || keep.assignedTo,
          score: leadScore(keep),
        },
        remove: remove.map(l => ({
          name: l.name,
          csr: csrName[l.assignedTo] || l.assignedTo,
          score: leadScore(l),
        })),
      });
    }
  }

  console.log(`\nSummary (PENDING / TODAY ONLY):`);
  console.log(`  Groups (same CSR):   ${sameCsrGroups}`);
  console.log(`  Groups (cross CSR):  ${crossCsrGroups}`);
  console.log(`  Would keep:          ${dupGroups.length}`);
  console.log(`  Would delete:        ${toDelete}`);
  console.log(`  Untouched:           Close Client / interested / important / schedule / etc.`);

  console.log(`\nSample groups (first ${samples.length}):`);
  for (const s of samples) {
    console.log(`  phone …${s.phoneKey}`);
    console.log(`    KEEP  ${s.keep.name || "—"} (${s.keep.company || "—"}) @ ${s.keep.csr}`);
    for (const r of s.remove) {
      console.log(`    DROP  ${r.name || "—"} @ ${r.csr}`);
    }
  }

  if (!APPLY) {
    console.log(`\nDry-run only. Re-run with --apply to delete pending duplicates.`);
    return;
  }

  let deleted = 0;
  let groupsDone = 0;
  for (const [, group] of dupGroups) {
    const keep = pickKeeper(group);
    const removeIds = group.filter(l => l.id !== keep.id).map(l => l.id);
    // Safety: only delete if still pending
    const stillPending = await prisma.lead.findMany({
      where: {
        id: { in: removeIds },
        status: { equals: "pending", mode: "insensitive" },
        inBin: false,
      },
      select: { id: true },
    });
    const safeIds = stillPending.map(l => l.id);
    if (!safeIds.length) continue;

    await migrateNotes(safeIds, keep.id);
    deleted += await deleteCascade(safeIds);
    groupsDone++;
    if (groupsDone % 100 === 0) {
      console.log(`  …processed ${groupsDone}/${dupGroups.length} groups, deleted ${deleted}`);
    }
  }

  console.log(`\nDone. Pending groups cleaned: ${groupsDone}. Pending leads deleted: ${deleted}.`);
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
