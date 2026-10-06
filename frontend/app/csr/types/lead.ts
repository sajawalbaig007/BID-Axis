import { NoteEntry, SubContact } from "../hooks/useLeadsData";
import { buildNoteHistory } from "../utils/noteHistory";

export interface BackendLead {
  id: string;
  name?: string;
  company?: string;
  phone?: string;
  email?: string;
  website?: string;
  status?: string;
  nextSchedule?: string;
  nextTime?: string;
  timezone?: string;
  followUpNotes?: string;
  interestedService?: string;
  interested_service?: string;
  service?: string;
  serviceInterested?: string;
  serviceName?: string;
  comments?: string;
  state?: string;
  hiddenOnMain?: boolean;
  important?: boolean;
  interested?: boolean;
  updatedAt?: string;
  uploadFile?: { companyName?: string; source?: { sudoName?: string | null } };
  notes?: { id: string; text?: string; createdAt?: string; parentId?: string | null }[];
  noteCount?: number;
  latestNote?: { id: string; text: string; createdAt: string; parentId?: string | null } | null;
  subContacts?: { id: string; name: string; designation?: string; phone?: string; email?: string; createdAt?: string; }[];
  createdAt?: string;
  trade?: string | null;
  subTrades?: string | null;
  tradeNotes?: string | null;
}

export type Lead = {
  id: string;
  client: string;
  company: string;
  rawCompany: string;
  phone: string;
  email: string;
  website: string;
  status: string;
  nextSchedule: string;
  nextTime: string;
  timezone: string;
  followUpNotes: string;
  interestedService: string;
  comments: string;
  state: string;
  hiddenOnMain: boolean;
  important: boolean;
  interested: boolean;
  sourceSudoName: string;
  ourCompanyName: string;
  statusUpdatedAt: string;
  noteCount: number;
  noteHistory: NoteEntry[];
  subContacts: SubContact[];
  trade: string;
  subTrades: string;
  tradeNotes: string;
};

export const mapBackendLead = (lead: BackendLead): Lead => {
  const { noteHistory, noteCount } = buildNoteHistory(lead);

  return {
    id:               lead.id,
    client:           lead.name                              ?? "Unknown",
    company:          lead.company                           ?? "N/A",
    rawCompany:       lead.company                           ?? "",
    ourCompanyName:   lead.uploadFile?.companyName           ?? "",
    phone:            lead.phone                             ?? "N/A",
    email:            lead.email                             ?? "N/A",
    website:          lead.website?.trim()                   ?? "",
    status:           lead.status                            ?? "pending",
    nextSchedule:     lead.nextSchedule                      ?? "",
    nextTime:         lead.nextTime                          ?? "",
    timezone:         lead.timezone                          ?? "",
    followUpNotes:    lead.followUpNotes                     ?? "",
    interestedService:
      lead.interestedService ??
      lead.interested_service ??
      lead.service ??
      lead.serviceInterested ??
      lead.serviceName ??
      "",
    comments:     lead.comments     ?? "",
    state:        lead.state        ?? "",
    hiddenOnMain: lead.hiddenOnMain ?? false,
    important:    lead.important    ?? false,
    interested:   lead.interested   ?? false,
    sourceSudoName: lead.uploadFile?.source?.sudoName?.trim() ?? "",
    trade:          lead.trade ?? "",
    subTrades:      lead.subTrades ?? "",
    tradeNotes:     lead.tradeNotes ?? "",
    statusUpdatedAt: lead.updatedAt ?? lead.createdAt ?? "",
    noteCount,
    noteHistory,
    subContacts: (lead.subContacts ?? []).map(s => ({
      id:          s.id,
      name:        s.name,
      designation: s.designation,
      phone:       s.phone,
      email:       s.email,
      createdAt:   s.createdAt,
    })),
  };
};

export const getPriority = (status: string): "High" | "Medium" =>
  status === "important" ? "High" : "Medium";
