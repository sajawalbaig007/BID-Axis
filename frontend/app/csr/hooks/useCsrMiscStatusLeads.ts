import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { fetchCsrTabLeadsCached } from "@/lib/csrTabApiCache";
import { BackendLead, Lead, mapBackendLead } from "../types/lead";
import { apiErrorMessage } from "@/lib/api";

const MISC_TAB_PAGE_SIZE = 200;

/** Leads for no-owner / not-in-service / in-house tabs — one page per tab (no full-dataset fetch). */
export function useCsrMiscStatusLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async (force = false) => {
    try {
      setLoading(true);
      const [noOwner, notInService, inHouse, notUseful] = await Promise.all([
        fetchCsrTabLeadsCached("noowner", 1, undefined, undefined, force, MISC_TAB_PAGE_SIZE),
        fetchCsrTabLeadsCached("notinservice", 1, undefined, undefined, force, MISC_TAB_PAGE_SIZE),
        fetchCsrTabLeadsCached("inhouse", 1, undefined, undefined, force, MISC_TAB_PAGE_SIZE),
        fetchCsrTabLeadsCached("notuseful", 1, undefined, undefined, force, 500),
      ]);
      const merged = [
        ...(noOwner.leads as BackendLead[]),
        ...(notInService.leads as BackendLead[]),
        ...(inHouse.leads as BackendLead[]),
        ...(notUseful.leads as BackendLead[]),
      ].map(mapBackendLead);
      setLeads(merged);
    } catch (err) {
      console.log(err);
      toast.error(apiErrorMessage(err, "Could not load follow-up leads. Please refresh."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void (async () => { await Promise.resolve(); refetch(); })(); }, [refetch]);

  return { leads, loading, refetch };
}
