import API, { getTokenUserId } from "./api";

type Entry<T> = { userId: string; data: T; at: number; gen: number };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
let cacheGeneration = 0;

const STATS_TTL_MS = 60_000;
const TAB_TTL_MS   = 45_000;
const POTENTIAL_TTL_MS = 45_000;
export const CSR_TAB_PAGE_SIZE = 30;
export const CSR_FILTER_BATCH_SIZE = 500;

function read<T>(key: string, ttlMs: number): T | null {
  const userId = getTokenUserId() ?? "";
  const hit = store.get(key);
  if (!hit || hit.userId !== userId || hit.gen !== cacheGeneration || Date.now() - hit.at >= ttlMs) {
    return null;
  }
  return hit.data as T;
}

function write<T>(key: string, data: T, genAtStart: number) {
  const userId = getTokenUserId() ?? "";
  if (!userId || genAtStart !== cacheGeneration) return;
  store.set(key, { userId, data, at: Date.now(), gen: cacheGeneration });
}

async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>, force = false): Promise<T> {
  if (!force) {
    const hit = read<T>(key, ttlMs);
    if (hit !== null) return hit;
  }

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const genAtStart = cacheGeneration;
  const p = fetcher()
    .then(data => {
      write(key, data, genAtStart);
      return data;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

export type CsrStatsPayload = {
  success: boolean;
  stats: {
    pendingCount: number;
    importantOnlyCount: number;
    scheduledCount: number;
    interestedCount: number;
    projectWonCount: number;
    notInterestedCount: number;
    notPickedCount: number;
    noOwnerCount: number;
    notInServiceCount: number;
    inHouseCount: number;
    totalAssigned: number;
    totalLeads: number;
  };
};

export type CsrTabLeadsPayload = {
  success: boolean;
  leads: unknown[];
  total: number;
  totalPages: number;
};

export async function fetchCsrStatsCached(
  force = false,
  from?: string,
  to?: string,
): Promise<CsrStatsPayload> {
  const key = `csr:stats:${from ?? ""}:${to ?? ""}`;
  return cached(key, STATS_TTL_MS, async () => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    const res = await API.get(`/csr/stats${qs ? `?${qs}` : ""}`, { timeout: 45_000 });
    return res.data as CsrStatsPayload;
  }, force);
}

export async function fetchCsrTabLeadsCached(
  tab: string,
  page: number,
  from?: string,
  to?: string,
  force = false,
  pageSize = CSR_TAB_PAGE_SIZE,
): Promise<CsrTabLeadsPayload> {
  const key = `csr:tab:${tab}:${page}:${pageSize}:${from ?? ""}:${to ?? ""}`;
  return cached(key, TAB_TTL_MS, async () => {
    const params = new URLSearchParams({ tab, page: String(page), pageSize: String(pageSize) });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await API.get(`/csr/tab-leads?${params}`, { timeout: 60_000 });
    return res.data as CsrTabLeadsPayload;
  }, force);
}

/** One request, max 500 rows — for filter batch mode (replaces multi-page parallel fetch) */
export async function fetchCsrTabLeadsBatchCached(
  tab: string,
  from?: string,
  to?: string,
  force = false,
  batchSize = CSR_FILTER_BATCH_SIZE,
): Promise<CsrTabLeadsPayload> {
  return fetchCsrTabLeadsCached(tab, 1, from, to, force, batchSize);
}

/** @deprecated Use fetchCsrTabLeadsBatchCached — kept for compatibility */
export async function fetchAllCsrTabLeadsCached(
  tab: string,
  from?: string,
  to?: string,
  force = false,
): Promise<CsrTabLeadsPayload> {
  return fetchCsrTabLeadsBatchCached(tab, from, to, force);
}

export async function fetchPotentialLeadsCached(force = false): Promise<{ success: boolean; leads: unknown[] }> {
  return cached("csr:potential", POTENTIAL_TTL_MS, async () => {
    const res = await API.get("/csr/potential-leads", { timeout: 45_000 });
    return res.data as { success: boolean; leads: unknown[] };
  }, force);
}

/** Light invalidation after lead mutations — stats + tab lists only */
export function invalidateCsrTabCaches() {
  cacheGeneration += 1;
  for (const key of store.keys()) {
    if (key.startsWith("csr:")) store.delete(key);
  }
  for (const key of inflight.keys()) {
    if (key.startsWith("csr:")) inflight.delete(key);
  }
}
