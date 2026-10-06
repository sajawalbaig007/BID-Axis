import API from "./api";
import { invalidateReportsCache } from "./reportsCache";

export type ChartSeriesPoint = { label: string; calls: number };
export type ChartSeries = {
  today?: ChartSeriesPoint[];
  week?: ChartSeriesPoint[];
  month?: ChartSeriesPoint[];
  year?: ChartSeriesPoint[];
};

export type AdminDashboardSummary = {
  stats?: {
    totalLeads?: number;
    completed?: number;
    closed?: number;
    todayCompletedCalls?: number;
    pending?: number;
    important?: number;
    interested?: number;
    projectWon?: number;
    onlineCSRs?: number;
    totalOnline?: number;
    importantOnly?: number;
    scheduled?: number;
    other?: number;
  };
  tabCounts?: {
    all?: number;
    important?: number;
    schedule?: number;
    interested?: number;
    closed?: number;
  };
  distribution?: Record<string, number>;
  recent?: {
    id?: string;
    name?: string;
    status?: string;
    updatedAt?: string;
    csr?: { name?: string };
  }[];
  recentStatus?: {
    id?: string;
    csrName?: string;
    leadName?: string;
    status?: string;
    createdAt?: string;
  }[];
  /** @deprecated use chartSeries */
  chartLeads?: { createdAt: string }[];
  chartSeries?: ChartSeries;
  performers?: { name: string; resolved: number; total: number; rate: number }[];
};

export type AdminTabCounts = {
  all: number;
  important: number;
  schedule: number;
  interested: number;
  closed: number;
};

let cached: { data: AdminDashboardSummary; at: number } | null = null;
let tabCountsCached: { data: AdminTabCounts; at: number } | null = null;
let inflight: Promise<AdminDashboardSummary> | null = null;
let tabCountsInflight: Promise<AdminTabCounts> | null = null;
const TTL_MS = 120_000;
const TAB_COUNTS_TTL_MS = 60_000;
const STORAGE_KEY = "crm_admin_summary_v7";

function isAdminSummaryPayload(data: unknown): data is AdminDashboardSummary {
  if (!data || typeof data !== "object") return false;
  const d = data as AdminDashboardSummary & { success?: boolean };
  if (d.success === false) return false;
  return typeof d.stats === "object" && d.stats !== null;
}

export function isEmptyAdminSummary(data: AdminDashboardSummary | null | undefined): boolean {
  if (!data?.stats) return true;
  const s = data.stats;
  return (
    (s.totalLeads ?? 0) <= 0 &&
    (s.pending ?? 0) <= 0 &&
    (s.interested ?? 0) <= 0 &&
    (s.projectWon ?? 0) <= 0 &&
    (s.closed ?? 0) <= 0 &&
    (s.completed ?? 0) <= 0 &&
    (s.todayCompletedCalls ?? 0) <= 0
  );
}

function readStorage(): { data: AdminDashboardSummary; at: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: AdminDashboardSummary; at: number };
    if (!parsed?.data || !parsed?.at) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(entry: { data: AdminDashboardSummary; at: number }) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    /* quota */
  }
}

function clearStorage() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function hydrateFromStorage() {
  if (cached) return;
  const stored = readStorage();
  if (stored && isAdminSummaryPayload(stored.data)) cached = stored;
  else if (stored) clearStorage();
}

export function peekAdminSummary(): AdminDashboardSummary | null {
  hydrateFromStorage();
  return cached?.data ?? null;
}

export function invalidateAdminSummaryCache() {
  cached = null;
  tabCountsCached = null;
  clearStorage();
}

const STALE_BROADCAST_KEY = "crm_admin_summary_stale";

/** Clear cached dashboard stats and notify all admin tabs to refetch. */
export function broadcastAdminSummaryStale() {
  invalidateAdminSummaryCache();
  invalidateReportsCache();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("crm:admin-summary-stale"));
  try {
    localStorage.setItem(STALE_BROADCAST_KEY, String(Date.now()));
  } catch {
    /* quota */
  }
}

export function subscribeAdminSummaryStale(onStale: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onCustom = () => onStale();
  const onStorage = (e: StorageEvent) => {
    if (e.key === STALE_BROADCAST_KEY) onStale();
  };

  window.addEventListener("crm:admin-summary-stale", onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("crm:admin-summary-stale", onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

export async function getAdminSummary(force = false): Promise<AdminDashboardSummary> {
  hydrateFromStorage();
  if (!force && cached && isAdminSummaryPayload(cached.data) && Date.now() - cached.at < TTL_MS) {
    return cached.data;
  }
  if (inflight) return inflight;

  inflight = API.get("/admin/clients/summary", { timeout: 60_000 })
    .then(res => {
      const data = res.data as AdminDashboardSummary;
      if (!isAdminSummaryPayload(data)) {
        throw new Error("Invalid admin summary payload");
      }
      const entry = { data, at: Date.now() };
      cached = entry;
      /* Do not copy summary.tabCounts into the leads-page cache — dashboard
         summary used to poison Closed with raw document counts. */
      writeStorage(entry);
      return data;
    })
    .catch(err => {
      /* Keep last good snapshot; never persist a failed/empty payload. */
      if (cached && isAdminSummaryPayload(cached.data) && !isEmptyAdminSummary(cached.data)) {
        return cached.data;
      }
      throw err;
    })
    .finally(() => { inflight = null; });

  return inflight;
}

/** Lightweight tab counts — avoids full summary on leads page. */
export async function getAdminTabCounts(
  force = false,
  filters?: {
    search?: string;
    state?: string;
    phone?: string;
    areaCodes?: string[];
    scheduleDate?: string;
    csr?: string;
    csrId?: string;
  },
): Promise<AdminTabCounts> {
  const hasFilters = !!(
    filters?.search?.trim() ||
    filters?.state?.trim() ||
    filters?.phone?.trim() ||
    filters?.scheduleDate?.trim() ||
    (filters?.areaCodes?.length ?? 0) > 0 ||
    (filters?.csrId?.trim() && filters.csrId !== "all") ||
    (filters?.csr?.trim() && filters.csr !== "all")
  );

  if (!hasFilters && !force && tabCountsCached && Date.now() - tabCountsCached.at < TAB_COUNTS_TTL_MS) {
    return tabCountsCached.data;
  }

  const params: Record<string, string> = {};
  if (filters?.search?.trim()) params.search = filters.search.trim();
  if (filters?.state?.trim()) params.state = filters.state.trim();
  if (filters?.phone?.trim()) params.phone = filters.phone.trim();
  if (filters?.scheduleDate?.trim()) params.scheduleDate = filters.scheduleDate.trim();
  if (filters?.areaCodes?.length) params.areaCodes = filters.areaCodes.join(",");
  if (filters?.csrId?.trim() && filters.csrId !== "all") params.csrId = filters.csrId.trim();
  else if (filters?.csr?.trim() && filters.csr !== "all") params.csr = filters.csr.trim();

  if (hasFilters) {
    const res = await API.get("/admin/clients/tab-counts", { params });
    return res.data.tabCounts as AdminTabCounts;
  }

  if (!force && tabCountsInflight) return tabCountsInflight;

  tabCountsInflight = API.get("/admin/clients/tab-counts")
    .then(res => {
      const data = res.data.tabCounts as AdminTabCounts;
      tabCountsCached = { data, at: Date.now() };
      return data;
    })
    .finally(() => { tabCountsInflight = null; });

  return tabCountsInflight;
}
