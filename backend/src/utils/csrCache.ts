import { flushAdminClientsCache, invalidateCache, invalidatePattern } from "./cache";
import { flushReportCache } from "../controllers/report.controller";

/** Clear all server-side caches for one CSR after lead mutations or admin reset. */
export function invalidateCsrLeadCaches(csrId: string, ...extra: string[]): void {
  flushAdminClientsCache();
  flushReportCache();
  invalidateCache(
    `csr:dashboard:${csrId}`,
    `csr:stats:${csrId}`,
    `csr:potential:${csrId}`,
    `csr:leads:${csrId}`,
    `csr:clients:${csrId}`,
    `csr:projects:${csrId}`,
    `csr:not-interested:${csrId}`,
    `csr:bin:${csrId}`,
    "admin:bin",
    "admin:csrs",
    ...extra,
  );
  invalidatePattern(`csr:tab:${csrId}:`);
}
