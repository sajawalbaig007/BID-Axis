import { useCallback, useEffect, useState } from "react";
import { csrNotInterestedApi } from "@/lib/csrApiCache";
import { useOnCsrDataReset } from "./useOnCsrDataReset";
import { BackendLead, Lead, mapBackendLead } from "../types/lead";

/** Follow-up lead with retry counters */
export type NiLead = Lead & {
  notInterestedCount: number;
  notPickedCount: number;
};

type RawLead = BackendLead & {
  notInterestedCount?: number;
  notPickedCount?: number;
};

function mapNiLead(l: RawLead): NiLead {
  const base = mapBackendLead(l);
  return {
    ...base,
    notInterestedCount: l.notInterestedCount ?? 0,
    notPickedCount:     l.notPickedCount     ?? 0,
  };
}

export function useNotInterested() {
  const [leads, setLeads] = useState<NiLead[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async (force = false) => {
    try {
      setLoading(true);
      const res = await csrNotInterestedApi.get(force);
      setLeads((res.leads as RawLead[] ?? []).map(mapNiLead));
    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void (async () => { await Promise.resolve(); refetch(); })(); }, [refetch]);
  useOnCsrDataReset(() => { void refetch(true); });

  return { leads, setLeads, loading, refetch };
}
