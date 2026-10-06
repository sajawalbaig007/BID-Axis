import prisma from "../config/db";
import {
  toPrismaAccountsPage,
  type AccountsPageKey,
} from "./accountsDefaults";

const CARRY_FORWARD_PAGES = new Set<AccountsPageKey>([
  "income_statement",
  "dashboard",
  "balance_sheet",
  "cash_flow",
  "total_assets",
  "sales_payroll",
  "technical_payroll",
]);

/** True when the JSON has a real money figure (not FX rates / empty defaults). */
export function hasMeaningfulAccountsData(data: unknown): boolean {
  return hasNonZeroAmount(data);
}

function hasNonZeroAmount(node: unknown): boolean {
  if (node == null) return false;
  if (typeof node === "number") return Number.isFinite(node) && Math.abs(node) > 0.0001;
  if (Array.isArray(node)) return node.some(hasNonZeroAmount);
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (/rate|factor|taxDeduction|commissionPct/i.test(k)) continue;
      if (
        typeof v === "number" &&
        /amount|total|salary|revenue|balance|debit|credit|basic|allowance|loan|pkr|usd|cad/i.test(k) &&
        Math.abs(v) > 0.0001
      ) {
        return true;
      }
      if (typeof v === "object" && hasNonZeroAmount(v)) return true;
    }
  }
  return false;
}

export function pickLatestMeaningful<T extends { recordDate: string; data: unknown }>(
  recs: T[],
): T | undefined {
  let latestEmpty: T | undefined;
  let latestMeaningful: T | undefined;
  for (const rec of recs) {
    if (hasMeaningfulAccountsData(rec.data)) {
      if (!latestMeaningful || rec.recordDate >= latestMeaningful.recordDate) {
        latestMeaningful = rec;
      }
    } else if (!latestEmpty || rec.recordDate >= latestEmpty.recordDate) {
      latestEmpty = rec;
    }
  }
  return latestMeaningful ?? latestEmpty;
}

/** One snapshot per calendar month — empty later days must not clobber real figures. */
export function pickLatestMeaningfulByMonth<T extends { recordDate: string; data: unknown }>(
  recs: T[],
): Map<string, T> {
  const byMonth = new Map<string, T[]>();
  for (const rec of recs) {
    const ym = rec.recordDate.slice(0, 7);
    const list = byMonth.get(ym);
    if (list) list.push(rec);
    else byMonth.set(ym, [rec]);
  }
  const out = new Map<string, T>();
  for (const [ym, list] of byMonth) {
    const picked = pickLatestMeaningful(list);
    if (picked) out.set(ym, picked);
  }
  return out;
}

/**
 * Load the row for `recordDate`, or the latest same-month row that actually has values.
 * Used so a new/empty day still shows September (etc.) expenses instead of zeros.
 */
export async function resolveAccountsSnapshot(page: AccountsPageKey, recordDate: string) {
  const prismaPage = toPrismaAccountsPage(page);
  const exact = await prisma.accountsRecord.findUnique({
    where: { page_recordDate: { page: prismaPage, recordDate } },
  });
  if (exact && hasMeaningfulAccountsData(exact.data)) {
    return { record: exact, copiedFrom: null as string | null };
  }
  if (!CARRY_FORWARD_PAGES.has(page) || !/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) {
    return { record: exact, copiedFrom: null as string | null };
  }
  const monthStart = `${recordDate.slice(0, 7)}-01`;
  const prev = await prisma.accountsRecord.findMany({
    where: {
      page: prismaPage,
      recordDate: { gte: monthStart, lt: recordDate },
    },
    orderBy: { recordDate: "desc" },
  });
  const found = prev.find(r => hasMeaningfulAccountsData(r.data));
  if (found) {
    return { record: found, copiedFrom: found.recordDate };
  }
  return { record: exact, copiedFrom: null as string | null };
}
