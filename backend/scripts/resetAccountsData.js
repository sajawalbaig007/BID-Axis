/**
 * One-off cleanup: delete all saved AccountsRecord rows (all accounts pages).
 * Records are recreated with clean zeroed defaults the next time a page loads.
 * File uploads are NOT touched.
 *
 * Run: node scripts/resetAccountsData.js
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const before = await prisma.accountsRecord.groupBy({
    by: ["page"],
    _count: { _all: true },
  });
  console.log("Records per page before reset:");
  for (const row of before) {
    console.log(`  ${row.page}: ${row._count._all}`);
  }

  const result = await prisma.accountsRecord.deleteMany({});
  console.log(`\nDeleted ${result.count} accounts records. All pages will start fresh with zeroed values.`);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
