/**
 * Finish wipe: batch-delete remaining leads + uploads/reports + cloudinary.
 * Users are NEVER touched.
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { v2: cloudinary } = require("cloudinary");

const prisma = new PrismaClient();
const BATCH = 500;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const CLOUDINARY_FOLDERS = [
  "crm_uploads/call-data",
  "crm_uploads/new-clients",
  "crm_uploads/old-clients",
  "crm_uploads/active-projects",
  "crm_uploads",
  "crm_reports",
];

async function deleteCloudinaryFolder(folder) {
  let deleted = 0;
  for (const resource_type of ["raw", "image", "auto"]) {
    try {
      const result = await cloudinary.api.delete_resources_by_prefix(folder, {
        resource_type,
        invalidate: true,
      });
      deleted += Object.keys(result.deleted || {}).length;
    } catch (err) {
      const msg = err?.error?.message || err?.message || String(err);
      if (!/not found|empty/i.test(msg)) {
        console.warn(`  Cloudinary warn [${folder}/${resource_type}]:`, msg);
      }
    }
  }
  return deleted;
}

async function batchDeleteLeads() {
  let total = 0;
  for (;;) {
    const chunk = await prisma.lead.findMany({
      select: { id: true },
      take: BATCH,
    });
    if (chunk.length === 0) break;
    const ids = chunk.map(l => l.id);
    // safety: clear any leftover child rows for this chunk
    await prisma.leadNote.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.subContact.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.callLog.deleteMany({ where: { leadId: { in: ids } } });
    const res = await prisma.lead.deleteMany({ where: { id: { in: ids } } });
    total += res.count;
    console.log(`  leads deleted so far: ${total}`);
  }
  return total;
}

async function main() {
  console.log("Users (kept):", await prisma.user.count());
  console.log("Leads remaining:", await prisma.lead.count());

  console.log("\nBatch-deleting leads…");
  const n = await batchDeleteLeads();
  console.log(`Done leads: ${n}`);

  console.log("Clearing upload files…");
  console.log(" ", (await prisma.uploadFile.deleteMany({})).count);

  console.log("Clearing upload sources…");
  console.log(" ", (await prisma.uploadSource.deleteMany({})).count);

  console.log("Clearing reports…");
  console.log(" ", (await prisma.report.deleteMany({})).count);

  // leftover notes/logs safety
  await prisma.leadNote.deleteMany({});
  await prisma.subContact.deleteMany({});
  await prisma.callLog.deleteMany({});

  console.log("\nCloudinary folders…");
  for (const folder of CLOUDINARY_FOLDERS) {
    const d = await deleteCloudinaryFolder(folder);
    console.log(`  ${folder}: ${d}`);
  }

  console.log("\nFinal counts:", {
    users: await prisma.user.count(),
    leads: await prisma.lead.count(),
    notes: await prisma.leadNote.count(),
    callLogs: await prisma.callLog.count(),
    uploadFiles: await prisma.uploadFile.count(),
    uploadSources: await prisma.uploadSource.count(),
    reports: await prisma.report.count(),
  });
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
