import { useCallback, useEffect, useState } from "react";
import { csrClientsApi, type ClientPipelineStats } from "@/lib/csrApiCache";
import { useOnCsrDataReset } from "./useOnCsrDataReset";
import toast from "react-hot-toast";
import { apiErrorMessage } from "@/lib/api";
import { buildNoteHistory } from "../utils/noteHistory";
import { parseProjectCodeSeq } from "@/lib/projectCodeSeq";

export interface SubContact {
  id: string;
  name: string;
  designation?: string;
  phone?: string;
  email?: string;
  createdAt?: string;
}

export interface NoteEntry {
  id: string;
  text: string;
  createdAt: string;
  /** Set when this row is a reply to another sticky on the same lead. */
  parentId?: string | null;
  /** Nested replies (oldest → newest) when this is a root sticky. */
  replies?: NoteEntry[];
  authorId?: string;
  authorRole?: string;
  authorName?: string;
}

export type ClientLead = {
  id: string;
  name: string;
  company: string;
  rawCompany: string;
  phone: string;
  email: string;
  website: string;
  state: string;
  status: string;
  interestedService: string;
  comments: string;
  projectBudget: string;
  paidAmount: string;
  isOldClient: boolean;
  important: boolean;
  interested: boolean;
  createdAt: string;
  clientCode: string | null;
  projectCode: string | null;
  projectScope: string;
  extraProjects: { code: string; scope: string }[];
  contacts: SubContact[];
  noteHistory: NoteEntry[];
};

type RawContact = { id?: string; name?: string; designation?: string; phone?: string; email?: string; };
type RawNote   = { id?: string; text?: string; createdAt?: string; parentId?: string | null };
export type RawClientLead = {
  id: string;
  name?: string; company?: string; phone?: string; email?: string; website?: string; state?: string;
  uploadFile?: { companyName?: string };
  status?: string; interestedService?: string; comments?: string;
  followUpNotes?: string | null;
  projectBudget?: string | null; paidAmount?: string | null;
  isOldClient?: boolean; createdAt?: string; updatedAt?: string;
  clientCode?: string | null; projectCode?: string | null; projectScope?: string | null;
  important?: boolean; interested?: boolean;
  contacts?: RawContact[];
  subContacts?: RawContact[];
  notes?: RawNote[];
};

function buildClientNoteHistory(l: RawClientLead): NoteEntry[] {
  return buildNoteHistory(l).noteHistory;
}

function extrasFromGroup(group: ClientLead[]): { code: string; scope: string }[] {
  const seen = new Set<string>();
  const extras: { code: string; scope: string }[] = [];
  for (const lead of group) {
    const raw = (lead.projectCode || lead.clientCode || "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    extras.push({
      code: raw,
      scope: (lead.projectScope || lead.interestedService || "").trim(),
    });
  }
  extras.sort((a, b) => {
    const sa = parseProjectCodeSeq(a.code)?.seq ?? 0;
    const sb = parseProjectCodeSeq(b.code)?.seq ?? 0;
    return sa - sb;
  });
  return extras;
}

function normalizeClientName(name?: string | null): string | null {
  const n = (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!n || n === "unknown" || n === "n/a" || n === "na" || n === "-" || n === "none") return null;
  return n;
}

function leadPhoneKey(phone?: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

function leadHasCode(lead: ClientLead): boolean {
  return !!(lead.clientCode || lead.projectCode || "").trim();
}

function pickRepresentative(group: ClientLead[]): ClientLead {
  const dated = [...group].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  return dated.find(leadHasCode) ?? dated[0]!;
}

/** Same phone, same client name, or same company when name is missing. */
function clusterWonClients(wonLeads: ClientLead[]): ClientLead[][] {
  const parent = wonLeads.map((_, i) => i);
  const find = (i: number): number => {
    if (parent[i] !== i) parent[i] = find(parent[i]!);
    return parent[i]!;
  };
  const union = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pa] = pb;
  };

  const byPhone = new Map<string, number>();
  const byName = new Map<string, number>();
  const byCompany = new Map<string, number>();

  wonLeads.forEach((lead, i) => {
    const phone = leadPhoneKey(lead.phone);
    if (phone) {
      const prev = byPhone.get(phone);
      if (prev !== undefined) union(prev, i);
      else byPhone.set(phone, i);
    }

    const name = normalizeClientName(lead.name);
    if (name) {
      const prev = byName.get(name);
      if (prev !== undefined) union(prev, i);
      else byName.set(name, i);
    } else {
      const co = lead.rawCompany?.trim().toLowerCase();
      if (co) {
        const prev = byCompany.get(co);
        if (prev !== undefined) union(prev, i);
        else byCompany.set(co, i);
      }
    }
  });

  const clusters = new Map<number, ClientLead[]>();
  wonLeads.forEach((lead, i) => {
    const root = find(i);
    const bucket = clusters.get(root);
    if (bucket) bucket.push(lead);
    else clusters.set(root, [lead]);
  });
  return [...clusters.values()];
}

/** Group key for same client across multiple won projects (name, phone, then company). */
export function clientIdentityKey(l: Pick<ClientLead, "id" | "name" | "phone" | "rawCompany">): string {
  const name = normalizeClientName(l.name);
  if (name) return `name:${name}`;
  const digits = leadPhoneKey(l.phone);
  if (digits) return `phone:${digits}`;
  const co = l.rawCompany?.trim().toLowerCase();
  if (co) return `company:${co}`;
  return `id:${l.id}`;
}

/** One row per client — 2+ won projects or isOldClient → Old tab. */
export function splitWonClientsByIdentity(wonLeads: ClientLead[]): {
  newLeads: ClientLead[];
  oldLeads: ClientLead[];
  repeatKeys: Set<string>;
} {
  const newLeads: ClientLead[] = [];
  const oldLeads: ClientLead[] = [];
  const repeatKeys = new Set<string>();
  const byDate = (a: ClientLead, b: ClientLead) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

  for (const group of clusterWonClients(wonLeads)) {
    group.sort(byDate);
    const key = clientIdentityKey(group[0]!);
    if (group.length >= 2) repeatKeys.add(key);
    const representative = pickRepresentative(group);
    const isOld = group.length >= 2 || group.some(l => l.isOldClient);
    const withExtras = { ...representative, extraProjects: extrasFromGroup(group) };
    if (isOld) oldLeads.push({ ...withExtras, isOldClient: true });
    else newLeads.push(withExtras);
  }

  newLeads.sort(byDate);
  oldLeads.sort(byDate);
  return { newLeads, oldLeads, repeatKeys };
}

export function mapClientLead(l: RawClientLead): ClientLead {
  const noteHistory = buildClientNoteHistory(l);

  return {
    id:                l.id,
    name:              l.name              ?? "Unknown",
    company:           l.uploadFile?.companyName ?? l.company ?? "N/A",
    rawCompany:        l.company           ?? "",
    phone:             l.phone             ?? "N/A",
    email:             l.email             ?? "",
    website:           l.website?.trim()   ?? "",
    state:             l.state             ?? "",
    status:            l.status            ?? "pending",
    interestedService: l.interestedService ?? "",
    comments:          l.comments          ?? "",
    projectBudget:     l.projectBudget     ?? "",
    paidAmount:        l.paidAmount        ?? "",
    isOldClient:       l.isOldClient       ?? false,
    important:         l.important         ?? false,
    interested:        l.interested        ?? false,
    createdAt:         l.createdAt         ?? "",
    clientCode:        l.clientCode        ?? null,
    projectCode:       l.projectCode       ?? null,
    projectScope:      l.projectScope      ?? "",
    extraProjects:     [],
    contacts: (l.subContacts ?? l.contacts ?? []).map((c: RawContact) => ({
      id:          c.id          ?? String(Math.random()),
      name:        c.name        ?? "",
      designation: c.designation ?? "",
      phone:       c.phone       ?? "",
      email:       c.email       ?? "",
    })),
    noteHistory,
  };
}

export type { ClientPipelineStats };

export function useLeadsData() {
  const [leads, setLeads] = useState<ClientLead[]>([]);
  const [stats, setStats] = useState<ClientPipelineStats>({
    importantCount: 0,
    interestedCount: 0,
    pendingCount: 0,
    totalAssigned: 0,
  });
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async (force = false) => {
    try {
      setLoading(true);
      const res = await csrClientsApi.get(force);
      setLeads((res.leads as RawClientLead[] ?? []).map((l) => mapClientLead(l)));
      if (res.stats) setStats(res.stats);
    } catch (err) {
      console.log(err);
      toast.error(apiErrorMessage(err, "Could not load clients. Please refresh."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void (async () => { await Promise.resolve(); refetch(); })(); }, [refetch]);
  useOnCsrDataReset(() => { void refetch(true); });

  return { leads, setLeads, stats, loading, refetch };
}
