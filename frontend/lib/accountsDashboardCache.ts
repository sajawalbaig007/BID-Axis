import API from "./api";

/** In-memory TTL cache for the Accounts home KPI summary only — other pages stay live DB reads. */
const TTL_MS = 30_000;

const cache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export function invalidateAccountsDashboardCache() {
  cache.clear();
  inflight.clear();
}

export async function getAccountsDashboardSummary(qs: string, force = false): Promise<unknown> {
  const key = qs || "default";
  if (!force) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  }
  const pending = inflight.get(key);
  if (pending) return pending;

  const req = API.get(`/accounts/dashboard/summary?${qs}`)
    .then(res => {
      cache.set(key, { at: Date.now(), data: res.data });
      return res.data;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, req);
  return req;
}
