import { useCallback, useEffect, useState } from "react";
import { csrBinApi } from "@/lib/csrApiCache";
import { useOnCsrDataReset } from "./useOnCsrDataReset";
import type { SubContact } from "./useLeadsData";

export type BinLead = {
  id: string;
  client: string;
  company: string;
  phone: string;
  state: string;
  status: string;
  source: string;
  notPickedCount: number;
  notInterestedCount: number;
  interestedService: string;
  binReason: string | null;
  binPreviousStatus: string | null;
  updatedAt: string;
  subContacts: SubContact[];
};

type RawLead = {
  id: string;
  name?: string;
  company?: string;
  uploadFile?: { companyName?: string; source?: { sudoName?: string } };
  phone?: string;
  state?: string;
  status?: string;
  notPickedCount?: number;
  notInterestedCount?: number;
  interestedService?: string;
  binReason?: string | null;
  binPreviousStatus?: string | null;
  updatedAt?: string;
  subContacts?: { id: string; name: string; designation?: string; phone?: string; email?: string; createdAt?: string; }[];
};

function mapBinLead(l: RawLead): BinLead {
  return {
    id:                 l.id,
    client:             l.name                    ?? "Unknown",
    company:            l.uploadFile?.companyName ?? l.company ?? "N/A",
    phone:              l.phone                   ?? "N/A",
    state:              l.state                   ?? "",
    status:             l.status                  ?? "",
    source:             l.uploadFile?.source?.sudoName ?? "—",
    notPickedCount:     l.notPickedCount           ?? 0,
    notInterestedCount: l.notInterestedCount       ?? 0,
    interestedService:  l.interestedService        ?? "",
    binReason:          l.binReason               ?? null,
    binPreviousStatus:  l.binPreviousStatus       ?? null,
    updatedAt:          l.updatedAt               ?? "",
    subContacts: (l.subContacts ?? []).map(s => ({
      id:          s.id,
      name:        s.name,
      designation: s.designation,
      phone:       s.phone,
      email:       s.email,
      createdAt:   s.createdAt,
    })),
  };
}

export function useBinData() {
  const [leads, setLeads] = useState<BinLead[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async (force = false) => {
    try {
      setLoading(true);
      const res = await csrBinApi.get(force);
      setLeads((res.leads as RawLead[] ?? []).map((l) => mapBinLead(l)));
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

export function binCategory(reason: string | null | undefined, status?: string | null, binPreviousStatus?: string | null): "notpicked" | "notinterested" | "deleted" | "inhouse" | "noowner" | "notinservice" | "notuseful" {
  if ((status || "").trim().toLowerCase() === "not useful") return "notuseful";
  const prev = (binPreviousStatus || status || "").toLowerCase();
  if (prev === "in house") return "inhouse";
  if (prev === "no owner available") return "noowner";
  if (prev === "not in service") return "notinservice";
  if (reason === "limit-not-picked" || reason === "deleted-pending" || reason === "deleted-other") return "notpicked";
  if (reason === "limit-not-interested") return "notinterested";
  if (reason?.startsWith("deleted-")) return "deleted";
  if (reason) return "deleted";
  return "notpicked";
}

export function binReasonLabel(reason: string | null | undefined): string {
  switch (reason) {
    case "limit-not-picked":      return "Not Picked — limit reached";
    case "limit-not-interested":  return "Not Interested — limit reached";
    case "deleted-important":     return "Deleted (Important)";
    case "deleted-interested":    return "Deleted (Interested)";
    case "deleted-pending":       return "Deleted (Pending)";
    default:                      return reason ? `Deleted (${reason})` : "Bin";
  }
}
