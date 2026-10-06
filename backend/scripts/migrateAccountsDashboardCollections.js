/**
 * Copy legacy Accounts* Mongo collections → accounts_dashboard_* then drop legacy.
 * Keeps Accounts Dashboard data isolated from Admin / CSR collections.
 *
 * Usage (from backend/):
 *   node scripts/migrateAccountsDashboardCollections.js
 *   node scripts/migrateAccountsDashboardCollections.js --dry-run
 *
 * Then restart backend after: npx prisma generate && npx prisma db push
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

const RENAMES = [
  { from: "AccountsRecord", to: "accounts_dashboard_records" },
  { from: "AccountsFileUpload", to: "accounts_dashboard_uploads" },
  { from: "AccountsMonthlyReport", to: "accounts_dashboard_monthly_reports" },
];

async function collectionNames() {
  const result = await prisma.$runCommandRaw({
    listCollections: 1,
    nameOnly: true,
  });
  const batch = (result && result.cursor && result.cursor.firstBatch) || [];
  return new Set(batch.map(c => c.name));
}

async function main() {
  console.log(
    `${dryRun ? "[dry-run] " : ""}Migrating Accounts Dashboard Mongo collections…\n`,
  );

  for (const { from, to } of RENAMES) {
    const names = await collectionNames();
    if (names.has(to) && !names.has(from)) {
      console.log(`✓ ok — ${to} already in use`);
      continue;
    }
    if (names.has(to) && names.has(from)) {
      console.log(`! both ${from} and ${to} exist — leave as-is (merge manually if needed)`);
      continue;
    }
    if (!names.has(from)) {
      console.log(`✓ skip — ${from} missing (fresh DB)`);
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] would copy ${from} → ${to} then drop ${from}`);
      continue;
    }

    await prisma.$runCommandRaw({
      aggregate: from,
      pipeline: [{ $match: {} }, { $out: to }],
      cursor: {},
    });
    console.log(`✓ copied ${from} → ${to}`);

    await prisma.$runCommandRaw({ drop: from });
    console.log(`✓ dropped legacy ${from}`);
  }

  console.log(
    "\nDone. New Cloudinary uploads use crm_accounts_dashboard/* (not crm_uploads / crm_reports).",
  );
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
