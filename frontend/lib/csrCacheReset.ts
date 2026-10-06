import { invalidateAllCsrListCaches } from "./csrApiCache";
import { invalidateCsrDashboardCache } from "./csrDashboardCache";
import { invalidateCsrTabCaches } from "./csrTabApiCache";

export const CSR_DATA_RESET_EVENT = "csr-data-reset";

export function invalidateAllCsrCaches(): void {
  invalidateCsrDashboardCache();
  invalidateAllCsrListCaches();
  invalidateCsrTabCaches();
}

export function dispatchCsrDataReset(): void {
  if (typeof window === "undefined") return;
  invalidateAllCsrCaches();
  window.dispatchEvent(new Event(CSR_DATA_RESET_EVENT));
}
