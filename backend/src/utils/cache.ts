interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

export function getCache<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache(key: string, data: unknown, ttlMs: number): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function invalidateCache(...keys: string[]): void {
  keys.forEach(k => store.delete(k));
}

export function invalidatePattern(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Throttle expensive pipeline heal — max once per CSR per 2 minutes */
export function shouldSkipThrottledHeal(csrId: string, ttlMs = 120_000): boolean {
  return getCache(`csr:heal-lock:${csrId}`) !== null;
}

export function markThrottledHeal(csrId: string, ttlMs = 120_000): void {
  setCache(`csr:heal-lock:${csrId}`, true, ttlMs);
}

/** Clear admin leads list + summary caches after any lead mutation */
export function flushAdminClientsCache(): void {
  invalidatePattern("admin:clients:");
}
