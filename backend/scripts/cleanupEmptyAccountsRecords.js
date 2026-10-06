/**
 * One-time cleanup: delete AccountsRecord rows that look like never-edited
 * auto-created empties (JSON equals current page defaults).
 *
 * Usage (from backend/):
 *   node scripts/cleanupEmptyAccountsRecords.js
 *   node scripts/cleanupEmptyAccountsRecords.js --dry-run
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

async function main() {
  // Lazy-require compiled defaults isn't available from plain node — compare
  // against "all numeric leaves are 0" heuristic for income/dashboard noise.
  const records = await prisma.accountsRecord.findMany({
    select: { id: true, page: true, recordDate: true, data: true, updatedAt: true, createdAt: true },
  });

  const toDelete = [];
  for (const rec of records) {
    const data = rec.data;
    if (!data || typeof data !== "object") continue;
    // Never-touched: createdAt ≈ updatedAt and JSON has no non-zero money fields
    const touchedGap = Math.abs(new Date(rec.updatedAt) - new Date(rec.createdAt));
    if (touchedGap > 2000) continue; // was saved/edited later
    if (hasNonZeroAmount(data)) continue;
    toDelete.push(rec);
  }

  console.log(`${dryRun ? "[dry-run] " : ""}Would delete ${toDelete.length} empty record(s) of ${records.length} total.`);
  for (const r of toDelete.slice(0, 30)) {
    console.log(`  - ${r.page} @ ${r.recordDate}`);
  }
  if (toDelete.length > 30) console.log(`  …and ${toDelete.length - 30} more`);

  if (!dryRun && toDelete.length) {
    const result = await prisma.accountsRecord.deleteMany({
      where: { id: { in: toDelete.map(r => r.id) } },
    });
    console.log(`Deleted ${result.count} record(s).`);
  }
}

function hasNonZeroAmount(node) {
  if (node == null) return false;
  if (typeof node === "number") return Number.isFinite(node) && Math.abs(node) > 0.0001;
  if (Array.isArray(node)) return node.some(hasNonZeroAmount);
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      // Skip FX / tax factor defaults (285, 0.89, etc.)
      if (/rate|factor|taxDeduction|commissionPct/i.test(k)) continue;
      if (
        /amount|total|salary|revenue|balance|debit|credit|basic|allowance|loan|pkr|usd|cad/i.test(k) &&
        typeof v === "number" &&
        Math.abs(v) > 0.0001
      ) {
        return true;
      }
      if (typeof v === "object" && hasNonZeroAmount(v)) return true;
    }
  }
  return false;
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
