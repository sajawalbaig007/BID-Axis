import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getCsrDashboard, invalidateCsrDashboardCache } from "@/lib/csrDashboardCache";
import { useOnCsrDataReset } from "./useOnCsrDataReset";
import { BackendLead, Lead, mapBackendLead } from "../types/lead";
import { apiErrorMessage } from "@/lib/api";

export function useCsrDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async (force = false) => {
    try {
      setLoading(true);
      if (force) invalidateCsrDashboardCache();
      const data = await getCsrDashboard(force);
      setLeads((data.leads ?? []).map((lead: BackendLead) => mapBackendLead(lead)));
    } catch (err) {
      console.log(err);
      toast.error(apiErrorMessage(err, "Could not load your leads. Please refresh the page."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void (async () => { await Promise.resolve(); refetch(); })(); }, [refetch]);
  useOnCsrDataReset(() => { void refetch(true); });

  return { leads, setLeads, loading, refetch };
}
