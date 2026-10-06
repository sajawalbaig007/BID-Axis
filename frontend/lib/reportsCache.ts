import API from "./api";

export type ReportsCsrRow = {
  id: string;
  csrId: string;
  name: string;
  csrCode?: string | null;
  totalLeads: number;
  completed: number;
  pending: number;
  important: number;
  interested: number;
  notCompleted: number;
  notInterested?: number;
  projectWon: number;
  inHouse?: number;
  noOwner?: number;
  notInService?: number;
  scheduleCall?: number;
};

export type ReportsData = {
  period: string;
  totalLeads: number;
  completed: number;
  pending: number;
  important: number;
  interested: number;
  notCompleted?: number;
  notInterested?: number;
  projectWon?: number;
  inHouse?: number;
  noOwner?: number;
  notInService?: number;
  scheduleCall?: number;
  csrPerformance: ReportsCsrRow[];
  timeChart: { label: string; leads: number; completed: number }[];
};

type CacheEntry = { data: ReportsData; at: number };

const cache = new Map<string, CacheEntry>();
let inflight: Promise<ReportsData> | null = null;
let inflightKey = "";
const TTL_MS = 300_000;

function cacheKey(period: string, fromDate?: string, toDate?: string) {
  return `${period}|${fromDate ?? ""}|${toDate ?? ""}|v4`;
}

export function invalidateReportsCache() {
  cache.clear();
  inflight = null;
  inflightKey = "";
}

export async function fetchReports(
  period: string,
  fromDate?: string,
  toDate?: string,
  force = false,
): Promise<ReportsData> {
  const key = cacheKey(period, fromDate, toDate);
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL_MS) {
    return hit.data;
  }
  if (inflight && inflightKey === key) return inflight;

  const url = fromDate && toDate
    ? `/reports?period=${encodeURIComponent(period)}&fromDate=${fromDate}&toDate=${toDate}`
    : `/reports?period=${period}`;

  inflightKey = key;
  inflight = API.get(url)
    .then(res => {
      const data = res.data as ReportsData;
      cache.set(key, { data, at: Date.now() });
      return data;
    })
    .finally(() => {
      inflight = null;
      inflightKey = "";
    });

  return inflight;
}
