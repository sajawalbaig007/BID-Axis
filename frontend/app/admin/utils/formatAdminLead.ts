/** Map API lead row → admin leads table Client shape */

import { estNowYmd, formatEstDate } from "@/lib/estTime";
import { buildNoteHistory } from "@/app/csr/utils/noteHistory";
import { collectLeadEmails } from "@/app/csr/utils/parseEmails";
import { collectLeadPhones } from "@/app/csr/utils/parsePhones";
import { adminLeadStatusLabel } from "./leadStatus";

export function formatAdminLead(lead: {
  id: string;
  name?: string;
  email?: string;
  ownerName?: string | null;
  phone?: string;
  company?: string;
  website?: string | null;
  clientCode?: string | null;
  projectCode?: string | null;
  interestedService?: string;
  comments?: string;
  followUpNotes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  important?: boolean;
  isOldClient?: boolean;
  nextSchedule?: string;
  nextTime?: string;
  timezone?: string;
  state?: string | null;
  uploadFile?: { companyName?: string };
  csr?: { name?: string; csrCode?: string | null };
  subContacts?: { id?: string; phone?: string | null; email?: string | null; name?: string; designation?: string | null }[];
  notes?: { id?: string; text: string; createdAt?: string; parentId?: string | null }[];
  latestNote?: { id: string; text: string; createdAt: string; parentId?: string | null } | null;
  _count?: { notes?: number };
  extraProjectCount?: number;
  extraProjects?: { code?: string; scope?: string }[];
}): {
  id: string;
  clientName: string;
  email: string;
  ownerName: string;
  contact: string;
  contactPhones: string[];
  emails: string[];
  company: string;
  website: string;
  parentCompany: string;
  scope: string;
  lastEmail: string;
  lastCall: string;
  lastComment: string;
  status: string;
  rawStatus: string;
  csr: string;
  csrCode?: string | null;
  clientCode: string | null;
  projectCode: string | null;
  nextFollowup: string;
  time: string;
  timezone: string;
  isOldClient: boolean;
  state: string;
  noteCount: number;
  noteHistory: { id: string; text: string; createdAt: string; parentId?: string | null; replies?: { id: string; text: string; createdAt: string; parentId?: string | null }[] }[];
  createdAt: string;
  extraProjectCount: number;
  extraProjects: { code: string; scope: string }[];
  subContacts: { id: string; name: string; designation?: string; phone?: string; email?: string }[];
} {
  const rawStatus = (lead.status || "pending").toLowerCase();
  const raw = lead.important && rawStatus !== "important" ? "important" : rawStatus;

  const displayName =
    lead.name?.trim() ||
    lead.company?.trim() ||
    lead.uploadFile?.companyName?.trim() ||
    "Unknown";

  const displayCompany =
    lead.company?.trim() || lead.uploadFile?.companyName?.trim() || "N/A";

  const nextFollowup = lead.nextSchedule || "";

  const { noteHistory, noteCount } = buildNoteHistory({
    notes: lead.notes,
    latestNote: lead.latestNote,
    comments: lead.comments,
    followUpNotes: lead.followUpNotes,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    noteCount: lead._count?.notes,
  });

  const latestFlat = noteHistory
    .flatMap((n) => [n, ...(n.replies ?? [])])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const latestNoteText = latestFlat?.text || lead.comments?.trim() || "";

  let createdLabel = "";
  if (lead.createdAt) {
    try {
      createdLabel = formatEstDate(lead.createdAt);
    } catch {
      createdLabel = lead.createdAt.split("T")[0] || "";
    }
  }

  const contactPhones = collectLeadPhones(lead.phone, lead.subContacts);
  const emails = collectLeadEmails(lead.email, lead.subContacts);
  const extraProjects = (lead.extraProjects ?? [])
    .map(p => ({
      code: String(p.code ?? "").trim(),
      scope: String(p.scope ?? "").trim(),
    }))
    .filter(p => p.code);
  const extraProjectCount = extraProjects.length > 0
    ? extraProjects.length
    : Math.max(0, lead.extraProjectCount ?? 0);

  return {
    id: lead.id,
    clientName: displayName,
    email: emails[0] || lead.email?.trim() || "N/A",
    ownerName: lead.ownerName?.trim() || "",
    contact: contactPhones[0] || lead.phone?.trim() || "N/A",
    contactPhones,
    emails,
    company: displayCompany,
    website: lead.website?.trim() || "",
    parentCompany: lead.uploadFile?.companyName || lead.company || "N/A",
    scope: lead.interestedService?.trim() || "N/A",
    lastEmail: "",
    lastCall: lead.updatedAt ? estNowYmd(new Date(lead.updatedAt)) : "",
    lastComment: latestNoteText || "No comments",
    rawStatus: raw,
    status: adminLeadStatusLabel(raw, nextFollowup),
    csr: lead.csr?.name || "Unassigned",
    csrCode: lead.csr?.csrCode ?? null,
    clientCode: lead.clientCode?.trim() || null,
    projectCode: lead.projectCode?.trim() || null,
    nextFollowup,
    time: lead.nextTime || "N/A",
    timezone: lead.timezone || "N/A",
    isOldClient: (lead.isOldClient ?? false) || extraProjectCount > 0,
    state: lead.state?.trim() || "",
    noteCount,
    noteHistory,
    createdAt: createdLabel,
    extraProjectCount,
    extraProjects,
    subContacts: (lead.subContacts ?? [])
      .filter(s => s.id && s.name)
      .map(s => ({
        id: String(s.id),
        name: String(s.name),
        designation: s.designation?.trim() || undefined,
        phone: s.phone?.trim() || undefined,
        email: s.email?.trim() || undefined,
      })),
  };
}
