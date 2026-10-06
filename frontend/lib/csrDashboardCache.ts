import API, { getTokenUserId } from "./api";

export type CsrDashboardLead = {
  id: string;
  name?: string;
  status?: string;
  nextSchedule?: string;
  nextTime?: string;
  timezone?: string;
};

export type CsrDashboardData = {
  success: boolean;
  totalLeads: number;
  leads: CsrDashboardLead[];
};

let cached: { userId: string; data: CsrDashboardData; at: number } | null = null;
let inflight: Promise<CsrDashboardData> | null = null;
const TTL_MS = 28_000;

export function invalidateCsrDashboardCache() {
  cached = null;
  inflight = null;
}

export async function getCsrDashboard(force = false): Promise<CsrDashboardData> {
  const userId = getTokenUserId() ?? "";
  if (!force && userId && cached?.userId === userId && Date.now() - cached.at < TTL_MS) {
    return cached.data;
  }
  if (inflight) return inflight;

  inflight = API.get("/csr/dashboard", { timeout: 120_000 })
    .then(res => {
      const data = res.data as CsrDashboardData;
      if (userId) cached = { userId, data, at: Date.now() };
      return data;
    })
    .finally(() => { inflight = null; });

  return inflight;
}
