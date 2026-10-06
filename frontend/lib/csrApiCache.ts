import API, { getTokenUserId } from "./api";

type CacheEntry<T> = { userId: string; data: T; at: number; gen: number };

function createFetcher<T>(url: string, ttlMs: number, timeoutMs = 30_000) {
  let cached: CacheEntry<T> | null = null;
  let inflight: Promise<T> | null = null;
  let generation = 0;

  return {
    get(force = false): Promise<T> {
      const userId = getTokenUserId() ?? "";
      if (!force && userId && cached?.userId === userId && Date.now() - cached.at < ttlMs) {
        return Promise.resolve(cached.data);
      }
      if (inflight) return inflight;

      const genAtStart = generation;
      inflight = API.get(url, { timeout: timeoutMs })
        .then(res => {
          const data = res.data as T;
          /* Skip write if invalidate() ran while this request was in flight */
          if (genAtStart === generation && userId) {
            cached = { userId, data, at: Date.now(), gen: generation };
          }
          return data;
        })
        .finally(() => { inflight = null; });

      return inflight;
    },
    invalidate() {
      generation += 1;
      cached = null;
      inflight = null;
    },
  };
}

export const csrLeadsApi          = createFetcher<{ leads: unknown[] }>("/csr/leads", 28_000);
export const csrClientsApi        = createFetcher<{ leads: unknown[]; stats?: ClientPipelineStats }>("/csr/clients", 28_000);
export const csrNotInterestedApi  = createFetcher<{ leads: unknown[] }>("/csr/not-interested", 28_000);
export const csrProjectsApi       = createFetcher<{ leads: unknown[] }>("/csr/projects", 28_000);
export const csrBinApi            = createFetcher<{ leads: unknown[] }>("/csr/bin", 28_000);

export type ClientPipelineStats = {
  importantCount: number;
  interestedCount: number;
  pendingCount: number;
  totalAssigned: number;
};

export function invalidateAllCsrListCaches() {
  csrLeadsApi.invalidate();
  csrClientsApi.invalidate();
  csrNotInterestedApi.invalidate();
  csrProjectsApi.invalidate();
  csrBinApi.invalidate();
}
