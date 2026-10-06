import { useCallback, useEffect, useRef, useState } from "react";

import toast from "react-hot-toast";

import { apiErrorMessage } from "@/lib/api";

import {
  fetchCsrStatsCached,
  fetchCsrTabLeadsCached,
  fetchCsrTabLeadsBatchCached,
  fetchPotentialLeadsCached,
  CSR_TAB_PAGE_SIZE,
  CSR_FILTER_BATCH_SIZE,
} from "@/lib/csrTabApiCache";

import { BackendLead, Lead, mapBackendLead } from "../types/lead";
import { useOnCsrDataReset } from "./useOnCsrDataReset";



export type CsrStats = {

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



export type CsrTabKey =

  | "today" | "pending" | "important" | "schedule" | "interested" | "projectwon"

  | "notinterested" | "notpicked" | "noowner" | "notinservice" | "inhouse";



function monthStart(ym: string): string {

  return ym.length === 7 ? `${ym}-01` : ym;

}



function monthEnd(ym: string): string {

  if (ym.length !== 7) return ym;

  const [y, m] = ym.split("-").map(Number);

  const last = new Date(y, m, 0).getDate();

  return `${ym}-${String(last).padStart(2, "0")}`;

}



export function useCsrStats(from?: string, to?: string) {
  const [stats, setStats] = useState<CsrStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    try {
      if (!opts?.silent) setLoading(true);
      const fromDate = from ? monthStart(from) : undefined;
      const toDate   = to ? monthEnd(to) : undefined;
      const res = await fetchCsrStatsCached(opts?.force, fromDate, toDate);
      setStats(res.stats as CsrStats);
    } catch (err) {
      if (!opts?.silent) toast.error(apiErrorMessage(err, "Could not load stats."));
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void refetch(); }, [refetch]);
  useOnCsrDataReset(() => { void refetch({ force: true }); });

  return { stats, setStats, loading, refetch };
}

export function useCsrTabLeads(
  tab: CsrTabKey,
  page: number,
  from?: string,
  to?: string,
  batchMode = false,
) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const reqGen = useRef(0);
  const pageRef = useRef(page);
  pageRef.current = page;

  const refetch = useCallback(async (force = false) => {
    const gen = ++reqGen.current;
    try {
      setLoading(true);
      const fromDate = from ? monthStart(from) : undefined;
      const toDate   = to ? monthEnd(to) : undefined;
      const data = batchMode
        ? await fetchCsrTabLeadsBatchCached(tab, fromDate, toDate, force)
        : await fetchCsrTabLeadsCached(tab, pageRef.current, fromDate, toDate, force, CSR_TAB_PAGE_SIZE);
      if (gen !== reqGen.current) return;
      setLeads((data.leads as BackendLead[] ?? []).map(mapBackendLead));
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (err) {
      if (gen !== reqGen.current) return;
      toast.error(apiErrorMessage(err, "Could not load leads. Please refresh."));
      setLeads([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      if (gen === reqGen.current) setLoading(false);
    }
  }, [tab, from, to, batchMode]);

  const refetchKey = batchMode
    ? `${tab}|batch|${from ?? ""}|${to ?? ""}`
    : `${tab}|${page}|${from ?? ""}|${to ?? ""}`;

  useEffect(() => { void refetch(); }, [refetchKey, refetch]);
  useOnCsrDataReset(() => { void refetch(true); });

  return { leads, setLeads, total, totalPages, loading, refetch };
}



export function usePotentialLeads() {

  const [leads, setLeads] = useState<Lead[]>([]);

  const [loading, setLoading] = useState(true);



  const refetch = useCallback(async (force = false) => {

    try {

      setLoading(true);

      const res = await fetchPotentialLeadsCached(force);

      setLeads((res.leads as BackendLead[] ?? []).map(mapBackendLead));

    } catch (err) {

      toast.error(apiErrorMessage(err, "Could not load potential clients."));

    } finally {

      setLoading(false);

    }

  }, []);



  useEffect(() => { void refetch(); }, [refetch]);
  useOnCsrDataReset(() => { void refetch(true); });

  return { leads, setLeads, loading, refetch };

}

export { CSR_TAB_PAGE_SIZE, CSR_FILTER_BATCH_SIZE };

