"use client";

import { useEffect, useState } from "react";
import {
  X, Phone, Mail, Building2, Pencil, Check,
  Briefcase, CalendarDays, Globe, User2, MapPin, Plus, Trash2, Users, Link2, Hash, FileText,
} from "lucide-react";
import API, { apiErrorMessage } from "@/lib/api";
import toast from "react-hot-toast";
import { NoteEntry, SubContact } from "../hooks/useLeadsData";
import { parseInterestedServices } from "../utils/parseInterestedServices";
import { collectLeadEmails } from "../utils/parseEmails";
import EmailWithExtraCell from "./shared/EmailWithExtraCell";
import { ChangeDialerNumber, useZoomDialer } from "./dialer/ZoomDialerProvider";

export type DetailLead = {
  id: string;
  name: string;
  company?: string;
  rawCompany?: string;
  phone?: string;
  email?: string;
  website?: string;
  state?: string;
  status?: string;
  interestedService?: string;
  followUpNotes?: string;
  nextSchedule?: string;
  nextTime?: string;
  timezone?: string;
  noteHistory?: NoteEntry[];
  subContacts?: SubContact[];
  clientCode?: string | null;
  isOldClient?: boolean;
  csr?: string;
  csrCode?: string | null;
  createdAt?: string;
};

export type DetailLeadUpdates = Partial<{
  name: string;
  company: string;
  phone: string;
  email: string;
  website: string;
  state: string;
  followUpNotes: string;
  interestedService: string;
  clientCode: string;
  nextSchedule: string;
  nextTime: string;
  timezone: string;
  status: string;
  isOldClient: boolean;
}>;

interface LeadDetailModalProps {
  lead: DetailLead;
  onClose: () => void;
  onSaved?: (id: string, updates: DetailLeadUpdates) => void;
  onNoteAdded?: (id: string, note: NoteEntry) => void;
  onSubContactAdded?: (id: string, sub: SubContact) => void;
  onSubContactUpdated?: (id: string, sub: SubContact) => void;
  onSubContactDeleted?: (id: string, subId: string) => void;
  /** Use admin routes when opened from admin panel */
  apiPrefix?: "/csr" | "/admin";
  /** Open directly in the edit form (admin eye). */
  startInEditMode?: boolean;
}

const statusLabel = (s?: string) => {
  if (!s) return "—";
  if (s === "Not Interested" || s === "completed") return "Not Interested";
  if (s === "not picked" || s === "not completed") return "Not Picked";
  return s;
};

const statusBadgeClass = (s?: string) => {
  if (s === "important")    return "bg-pink-400/25 text-pink-100 border border-pink-300/30";
  if (s === "interested")   return "bg-amber-400/25 text-amber-100 border border-amber-300/30";
  if (s === "not picked" || s === "not completed") return "bg-orange-400/25 text-orange-100 border border-orange-300/30";
  if (s === "Not Interested" || s === "completed") return "bg-white/15 text-white/75 border border-white/20";
  if (s === "Close Client") return "bg-green-500/25 text-green-100 border border-green-400/30";
  return "bg-white/15 text-white/75 border border-white/20";
};

const ADMIN_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "important", label: "Important" },
  { value: "interested", label: "Interested" },
  { value: "Close Client", label: "Closed" },
  { value: "Not Interested", label: "Not Interested" },
  { value: "Not useful", label: "Not useful" },
  { value: "not picked", label: "Not Picked" },
  { value: "no owner available", label: "No Owner Available" },
  { value: "not in service", label: "Not In Service" },
  { value: "in house", label: "In House" },
];
const inputClass    = "w-full h-11 rounded-2xl border-2 border-gray-200 bg-[#FAFAFA] px-4 text-sm outline-none focus:border-[#1B6FE8] focus:bg-white transition-colors placeholder:text-gray-300";
const textareaClass = "w-full rounded-2xl border-2 border-gray-200 bg-[#FAFAFA] px-4 py-3 text-sm outline-none focus:border-[#1B6FE8] focus:bg-white transition-colors resize-none placeholder:text-gray-300";
const labelClass    = "text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5";

/* Parse "[timestamp] note text" lines into sticky-note entries */
const parseNotes = (raw?: string): { tag: string | null; text: string }[] => {
  if (!raw) return [];
  return raw.trim().split("\n").filter(Boolean).map(line => {
    const m = line.match(/^\[(.+?)\]\s*(.*)$/);
    return m ? { tag: m[1], text: m[2] } : { tag: null, text: line };
  });
};

/* US state → timezone (best-effort, primary timezone per state) */
const STATE_TIMEZONES: Record<string, { label: string; abbreviation: string }> = {
  "washington d c": { label: "Eastern Time",          abbreviation: "ET"   },
  "washington dc":  { label: "Eastern Time",          abbreviation: "ET"   },
  "district of columbia": { label: "Eastern Time",    abbreviation: "ET"   },
  "north carolina": { label: "Eastern Time",          abbreviation: "ET"   },
  "south carolina": { label: "Eastern Time",          abbreviation: "ET"   },
  "new hampshire":  { label: "Eastern Time",          abbreviation: "ET"   },
  "rhode island":   { label: "Eastern Time",          abbreviation: "ET"   },
  "west virginia":  { label: "Eastern Time",          abbreviation: "ET"   },
  "north dakota":   { label: "Central Time",          abbreviation: "CT"   },
  "south dakota":   { label: "Central Time",          abbreviation: "CT"   },
  "new jersey":     { label: "Eastern Time",          abbreviation: "ET"   },
  "new mexico":     { label: "Mountain Time",         abbreviation: "MT"   },
  "new york":       { label: "Eastern Time",          abbreviation: "ET"   },
  alabama:          { label: "Central Time",          abbreviation: "CT"   },
  alaska:           { label: "Alaska Time",           abbreviation: "AKT"  },
  arizona:          { label: "Mountain Time (no DST)",abbreviation: "MST"  },
  arkansas:         { label: "Central Time",          abbreviation: "CT"   },
  california:       { label: "Pacific Time",          abbreviation: "PT"   },
  colorado:         { label: "Mountain Time",         abbreviation: "MT"   },
  connecticut:      { label: "Eastern Time",          abbreviation: "ET"   },
  delaware:         { label: "Eastern Time",          abbreviation: "ET"   },
  florida:          { label: "Eastern Time",          abbreviation: "ET"   },
  georgia:          { label: "Eastern Time",          abbreviation: "ET"   },
  hawaii:           { label: "Hawaii Time",           abbreviation: "HST"  },
  idaho:            { label: "Mountain Time",         abbreviation: "MT"   },
  illinois:         { label: "Central Time",          abbreviation: "CT"   },
  indiana:          { label: "Eastern Time",          abbreviation: "ET"   },
  iowa:             { label: "Central Time",          abbreviation: "CT"   },
  kansas:           { label: "Central Time",          abbreviation: "CT"   },
  kentucky:         { label: "Eastern Time",          abbreviation: "ET"   },
  louisiana:        { label: "Central Time",          abbreviation: "CT"   },
  maine:            { label: "Eastern Time",          abbreviation: "ET"   },
  maryland:         { label: "Eastern Time",          abbreviation: "ET"   },
  massachusetts:    { label: "Eastern Time",          abbreviation: "ET"   },
  michigan:         { label: "Eastern Time",          abbreviation: "ET"   },
  minnesota:        { label: "Central Time",          abbreviation: "CT"   },
  mississippi:      { label: "Central Time",          abbreviation: "CT"   },
  missouri:         { label: "Central Time",          abbreviation: "CT"   },
  montana:          { label: "Mountain Time",         abbreviation: "MT"   },
  nebraska:         { label: "Central Time",          abbreviation: "CT"   },
  nevada:           { label: "Pacific Time",          abbreviation: "PT"   },
  ohio:             { label: "Eastern Time",          abbreviation: "ET"   },
  oklahoma:         { label: "Central Time",          abbreviation: "CT"   },
  oregon:           { label: "Pacific Time",          abbreviation: "PT"   },
  pennsylvania:     { label: "Eastern Time",          abbreviation: "ET"   },
  tennessee:        { label: "Central Time",          abbreviation: "CT"   },
  texas:            { label: "Central Time",          abbreviation: "CT"   },
  utah:             { label: "Mountain Time",         abbreviation: "MT"   },
  vermont:          { label: "Eastern Time",          abbreviation: "ET"   },
  virginia:         { label: "Eastern Time",          abbreviation: "ET"   },
  washington:       { label: "Pacific Time",          abbreviation: "PT"   },
  wisconsin:        { label: "Central Time",          abbreviation: "CT"   },
  wyoming:          { label: "Mountain Time",         abbreviation: "MT"   },
};

/* 2-letter state code → full state name (for "TX", "Dallas, TX", etc.) */
const STATE_ABBREVIATIONS: Record<string, string> = {
  al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california",
  co: "colorado", ct: "connecticut", de: "delaware", fl: "florida", ga: "georgia",
  hi: "hawaii", id: "idaho", il: "illinois", in: "indiana", ia: "iowa",
  ks: "kansas", ky: "kentucky", la: "louisiana", me: "maine", md: "maryland",
  ma: "massachusetts", mi: "michigan", mn: "minnesota", ms: "mississippi", mo: "missouri",
  mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire", nj: "new jersey",
  nm: "new mexico", ny: "new york", nc: "north carolina", nd: "north dakota", oh: "ohio",
  ok: "oklahoma", or: "oregon", pa: "pennsylvania", ri: "rhode island", sc: "south carolina",
  sd: "south dakota", tn: "tennessee", tx: "texas", ut: "utah", vt: "vermont",
  va: "virginia", wa: "washington", wv: "west virginia", wi: "wisconsin", wy: "wyoming",
  dc: "district of columbia",
};

const SORTED_STATE_NAMES = Object.keys(STATE_TIMEZONES).sort((a, b) => b.length - a.length);

/** Ensure website opens as a full URL in a new tab. */
export function websiteHref(url: string): string {
  const t = url.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

/* Derive a US timezone from a free-form location string (state name, abbreviation, "City, State", etc.) */
const getTimezoneForState = (state?: string): { label: string; abbreviation: string } | null => {
  if (!state) return null;
  const normalized = state.toLowerCase().replace(/[^a-z]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  for (const name of SORTED_STATE_NAMES) {
    if (normalized.includes(name)) return STATE_TIMEZONES[name];
  }

  for (const token of normalized.split(" ")) {
    const fullName = STATE_ABBREVIATIONS[token];
    if (fullName) return STATE_TIMEZONES[fullName];
  }

  return null;
};

export default function LeadDetailModal({ lead, onClose, onSaved, onNoteAdded, onSubContactAdded, onSubContactUpdated, onSubContactDeleted, apiPrefix = "/csr", startInEditMode = false }: LeadDetailModalProps) {
  const dialer = useZoomDialer();
  const [isEditing, setIsEditing] = useState(startInEditMode);
  const [name, setName] = useState(lead.name ?? "");
  const [company, setCompany] = useState(lead.company ?? lead.rawCompany ?? "");
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [website, setWebsite] = useState(lead.website ?? "");
  const [state, setState] = useState(lead.state ?? "");
  const [interestedService, setInterestedService] = useState(lead.interestedService ?? "");
  const [clientCode, setClientCode] = useState(lead.clientCode ?? "");
  const [nextSchedule, setNextSchedule] = useState(lead.nextSchedule ?? "");
  const [nextTime, setNextTime] = useState(lead.nextTime ?? "");
  const [timezone, setTimezone] = useState(lead.timezone ?? "");
  const [status, setStatus] = useState(lead.status ?? "pending");
  const [isOldClient, setIsOldClient] = useState(!!lead.isOldClient);
  const [noteText, setNoteText] = useState(lead.followUpNotes ?? "");
  const [saving, setSaving] = useState(false);
  const isAdmin = apiPrefix === "/admin";

  /* Sub-contacts — lazy-loaded on mount if not pre-populated */
  const [subs,       setSubs]       = useState<SubContact[]>(lead.subContacts ?? []);

  useEffect(() => {
    if ((lead.subContacts ?? []).length > 0) return; // already populated
    API.get(`${apiPrefix}/lead/${lead.id}`)
      .then(res => setSubs(res.data.lead?.subContacts ?? []))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);
  const [showSubForm,setShowSubForm] = useState(false);
  const [subName,    setSubName]    = useState("");
  const [subDesig,   setSubDesig]   = useState("");
  const [subPhone,   setSubPhone]   = useState("");
  const [subEmail,   setSubEmail]   = useState("");
  const [addingSub,  setAddingSub]  = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editSubName,  setEditSubName]  = useState("");
  const [editSubDesig, setEditSubDesig] = useState("");
  const [editSubPhone, setEditSubPhone] = useState("");
  const [editSubEmail, setEditSubEmail] = useState("");
  const [savingSubId,  setSavingSubId]  = useState<string | null>(null);

  const startEdit = () => {
    setName(lead.name ?? "");
    setCompany(lead.company ?? lead.rawCompany ?? "");
    setPhone(lead.phone ?? "");
    setEmail(lead.email ?? "");
    setWebsite(lead.website ?? "");
    setState(lead.state ?? "");
    setInterestedService(lead.interestedService ?? "");
    setClientCode(lead.clientCode ?? "");
    setNextSchedule(lead.nextSchedule ?? "");
    setNextTime(lead.nextTime && lead.nextTime !== "N/A" ? lead.nextTime : "");
    setTimezone(lead.timezone && lead.timezone !== "N/A" ? lead.timezone : "");
    setStatus(lead.status ?? "pending");
    setIsOldClient(!!lead.isOldClient);
    setNoteText(lead.followUpNotes ?? "");
    setIsEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const websiteTrim = website.trim();
      const scopeTrim = interestedService.trim();
      const codeTrim = clientCode.trim();
      const payload: Record<string, unknown> = {
        name, company, phone, email, website: websiteTrim, state, interestedService: scopeTrim,
      };
      if (isAdmin) {
        payload.clientCode = codeTrim || null;
        payload.nextSchedule = nextSchedule.trim() || null;
        payload.nextTime = nextTime.trim() || null;
        payload.timezone = timezone.trim() || null;
        payload.status = status;
        payload.isOldClient = isOldClient;
      }
      await API.put(`${apiPrefix}/lead/${lead.id}`, payload);
      const trimmedNote = noteText.trim();
      const prevNote = (lead.followUpNotes ?? "").trim();
      if (isAdmin && trimmedNote && trimmedNote !== prevNote) {
        const noteRes = await API.post(`${apiPrefix}/lead/${lead.id}/notes`, { text: trimmedNote });
        const note = noteRes.data?.note;
        onNoteAdded?.(lead.id, {
          id: String(note?.id ?? `tmp-${Date.now()}`),
          text: String(note?.text ?? trimmedNote),
          createdAt: String(note?.createdAt ?? new Date().toISOString()),
          parentId: note?.parentId ?? null,
        });
      }
      onSaved?.(lead.id, {
        name, company, phone, email, website: websiteTrim, state, interestedService: scopeTrim,
        followUpNotes: trimmedNote,
        ...(isAdmin
          ? {
              clientCode: codeTrim,
              nextSchedule: nextSchedule.trim(),
              nextTime: nextTime.trim(),
              timezone: timezone.trim(),
              status,
              isOldClient,
            }
          : {}),
      });
      setIsEditing(false);
      toast.success("Lead updated.");
    } catch (err) {
      const msg = apiErrorMessage(err, "Failed to update lead.");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const addSubContact = async () => {
    const nameVal = subName.trim() || "Additional contact";
    if (!subName.trim() && !subPhone.trim() && !subEmail.trim()) {
      toast.error("Enter a name, phone, or email.");
      return;
    }
    setAddingSub(true);
    try {
      const res = await API.post(`${apiPrefix}/lead/${lead.id}/subcontacts`, {
        name: nameVal, designation: subDesig.trim(), phone: subPhone.trim(), email: subEmail.trim(),
      });
      const sub: SubContact = res.data.subContact ?? { id: Date.now().toString(), name: nameVal, designation: subDesig.trim(), phone: subPhone.trim(), email: subEmail.trim() };
      setSubs(prev => [...prev, sub]);
      onSubContactAdded?.(lead.id, sub);
      setSubName(""); setSubDesig(""); setSubPhone(""); setSubEmail(""); setShowSubForm(false);
      toast.success("Sub-contact added.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to add sub-contact."));
    } finally { setAddingSub(false); }
  };

  const startEditSub = (sub: SubContact) => {
    setEditingSubId(sub.id);
    setEditSubName(sub.name);
    setEditSubDesig(sub.designation ?? "");
    setEditSubPhone(sub.phone ?? "");
    setEditSubEmail(sub.email ?? "");
    setShowSubForm(false);
  };

  const saveEditSub = async () => {
    if (!editingSubId || !editSubName.trim()) return;
    setSavingSubId(editingSubId);
    try {
      const res = await API.put(`${apiPrefix}/lead/${lead.id}/subcontacts/${editingSubId}`, {
        name: editSubName.trim(), designation: editSubDesig.trim(), phone: editSubPhone.trim(), email: editSubEmail.trim(),
      });
      const updated: SubContact = res.data.subContact ?? {
        id: editingSubId, name: editSubName.trim(), designation: editSubDesig.trim(), phone: editSubPhone.trim(), email: editSubEmail.trim(),
      };
      setSubs(prev => prev.map(s => s.id === editingSubId ? updated : s));
      onSubContactUpdated?.(lead.id, updated);
      setEditingSubId(null);
      toast.success("Sub-contact updated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to update sub-contact."));
    }
    finally { setSavingSubId(null); }
  };

  const deleteSubContact = async (subId: string) => {
    setDeletingId(subId);
    try {
      await API.delete(`${apiPrefix}/lead/${lead.id}/subcontacts/${subId}`);
      setSubs(prev => prev.filter(s => s.id !== subId));
      onSubContactDeleted?.(lead.id, subId);
      toast.success("Sub-contact removed.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to delete sub-contact."));
    }
    finally { setDeletingId(null); }
  };

  const title = lead.company || lead.name;
  const locationDisplay = lead.state || "N/A";
  const locationTimezone = getTimezoneForState(lead.state);

  const infoItems: { label: string; value: string; Icon: typeof Phone; href?: string }[] = [
    { label: "Client Code", value: lead.clientCode?.trim() || "N/A", Icon: Hash },
    { label: "Contact Person", value: lead.name, Icon: User2 },
    { label: "Company", value: lead.company || "N/A", Icon: Building2 },
    { label: "Phone", value: lead.phone || "N/A", Icon: Phone },
    { label: "Email", value: lead.email || "N/A", Icon: Mail },
    {
      label: "Website",
      value: lead.website?.trim() || "N/A",
      Icon: Link2,
      ...(lead.website?.trim() ? { href: websiteHref(lead.website) } : {}),
    },
    { label: "Location", value: locationDisplay, Icon: MapPin },
  ];

  if (lead.csr || lead.csrCode) {
    infoItems.push({
      label: "CSR",
      value: [lead.csrCode, lead.csr].filter(Boolean).join(" — ") || "Unassigned",
      Icon: Users,
    });
  }
  if (lead.createdAt) {
    infoItems.push({ label: "Created", value: lead.createdAt, Icon: CalendarDays });
  }

  if (lead.interestedService) {
    const services = parseInterestedServices(lead.interestedService);
    infoItems.push({
      label: "Interested In",
      value: services.length > 0 ? services.join(", ") : lead.interestedService,
      Icon: Briefcase,
    });
  } else {
    infoItems.push({ label: "Interested In", value: "N/A", Icon: Briefcase });
  }
  if (isAdmin) {
    infoItems.push({
      label: "Client Type",
      value: lead.isOldClient ? "Old Client" : "New Client",
      Icon: Users,
    });
  }
  if (lead.followUpNotes) {
    infoItems.push({ label: "Notes", value: lead.followUpNotes, Icon: FileText });
  }
  if (lead.nextSchedule) {
    infoItems.push({
      label: "Next Schedule",
      value: lead.nextTime ? `${lead.nextSchedule} · ${lead.nextTime}` : lead.nextSchedule,
      Icon: CalendarDays,
    });
  }
  if (lead.timezone) {
    infoItems.push({ label: "Timezone", value: lead.timezone, Icon: Globe });
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-[540px] bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: "92vh" }}>

        {/* HEADER */}
        <div className="relative bg-gradient-to-br from-[#1B6FE8] to-[#0E4FBE] px-5 sm:px-6 pt-5 pb-5 shrink-0 overflow-hidden">
          <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5 pointer-events-none"/>
          <div className="absolute -bottom-8 -left-4 w-24 h-24 rounded-full bg-white/5 pointer-events-none"/>
          <button onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors z-10">
            <X size={15}/>
          </button>
          <div className="flex items-center gap-3 pr-10">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-white text-xl font-bold shrink-0">
              {title.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white leading-tight truncate">{title}</h2>
              {lead.company && lead.company !== lead.name && (
                <p className="text-white/65 text-xs mt-0.5 truncate">{lead.name}</p>
              )}
              {locationTimezone && (
                <p className="text-white/55 text-[11px] mt-0.5 truncate flex items-center gap-1">
                  <Globe size={10}/> {locationTimezone.label} ({locationTimezone.abbreviation})
                </p>
              )}
            </div>
          </div>
          {lead.status && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${statusBadgeClass(lead.status)}`}>
                {statusLabel(lead.status)}
              </span>
            </div>
          )}
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-5 sm:px-6 py-5 space-y-5">

            {!isEditing ? (
              <>
                <button onClick={startEdit}
                  className="w-full h-11 rounded-2xl bg-[#EAF2FE] border border-[#f5c5ce] text-[#1B6FE8] text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-[#fce8ec] transition-colors">
                  <Pencil size={13}/> Edit Details
                </button>

                {/* INFO GRID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {infoItems.map(({ label, value, Icon, href }) => (
                    <div key={label} className="bg-[#F8F9FC] rounded-2xl p-3.5">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Icon size={12} className="text-[#1B6FE8]"/>
                        <p className="text-gray-400 text-[11px]">{label}</p>
                      </div>
                      {label === "Email" ? (
                        <EmailWithExtraCell
                          email={lead.email || ""}
                          allEmails={collectLeadEmails(lead.email, lead.subContacts)}
                          variant="plain"
                          className="text-[13px] font-semibold"
                          emptyLabel="N/A"
                          clientName={lead.name}
                          company={lead.company}
                        />
                      ) : label === "Phone" && dialer && value && value !== "N/A" ? (
                        <span className="inline-flex items-center gap-2 min-w-0 max-w-full">
                          <button
                            type="button"
                            onClick={() => dialer.open({
                              destination: value,
                              leadId: lead.id,
                              clientName: lead.company || lead.name,
                            })}
                            className="text-[#1B6FE8] text-[13px] font-semibold truncate text-left underline-offset-[3px] hover:underline cursor-pointer"
                          >
                            {value}
                          </button>
                          <ChangeDialerNumber className="text-[11px]" />
                        </span>
                      ) : href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#1B6FE8] text-[13px] font-semibold truncate block hover:underline"
                        >
                          {value}
                        </a>
                      ) : (
                        <p className="text-[#0F172A] text-[13px] font-semibold truncate">{value}</p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* CLIENT NAME + COMPANY */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`${labelClass} mb-2`}><User2 size={11} className="text-[#1B6FE8]"/>Client Name</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)}
                      placeholder="e.g. John Smith" className={inputClass}/>
                  </div>
                  <div>
                    <label className={`${labelClass} mb-2`}><Building2 size={11} className="text-[#1B6FE8]"/>Company Name</label>
                    <input type="text" value={company} onChange={e => setCompany(e.target.value)}
                      placeholder="Company name" className={inputClass}/>
                  </div>
                </div>

                {/* PHONE + EMAIL */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`${labelClass} mb-2`}><Phone size={18} className="text-[#1B6FE8]"/>Phone Number</label>
                    <input type="text" value={phone} onChange={e => setPhone(e.target.value)}
                      placeholder="+1 234 567 890" className={inputClass}/>
                  </div>
                  <div>
                    <label className={`${labelClass} mb-2`}><Mail size={11} className="text-[#1B6FE8]"/>Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="name@email.com" className={inputClass}/>
                  </div>
                </div>

                {/* LOCATION + WEBSITE */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`${labelClass} mb-2`}><MapPin size={11} className="text-[#1B6FE8]"/>Location</label>
                    <input type="text" value={state} onChange={e => setState(e.target.value)}
                      placeholder="e.g. Texas, USA" className={inputClass}/>
                  </div>
                  <div>
                    <label className={`${labelClass} mb-2`}><Link2 size={11} className="text-[#1B6FE8]"/>Website Link</label>
                    <input type="url" value={website} onChange={e => setWebsite(e.target.value)}
                      placeholder="https://example.com" className={inputClass}/>
                  </div>
                </div>

                <div>
                  <label className={`${labelClass} mb-2`}><Briefcase size={11} className="text-[#1B6FE8]"/>Scope / Interested In</label>
                  <textarea rows={2} value={interestedService} onChange={e => setInterestedService(e.target.value)}
                    placeholder="Scope of work" className={textareaClass}/>
                </div>

                {isAdmin && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={`${labelClass} mb-2`}><Hash size={11} className="text-[#1B6FE8]"/>Client Code</label>
                        <input type="text" value={clientCode} onChange={e => setClientCode(e.target.value)}
                          placeholder="e.g. 1097" className={inputClass}/>
                      </div>
                      <div>
                        <label className={`${labelClass} mb-2`}>Status</label>
                        <select value={status} onChange={e => setStatus(e.target.value)} className={inputClass}>
                          {ADMIN_STATUS_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                          {status && !ADMIN_STATUS_OPTIONS.some(o => o.value === status) && (
                            <option value={status}>{status}</option>
                          )}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className={`${labelClass} mb-2`}><CalendarDays size={11} className="text-[#1B6FE8]"/>Next Schedule</label>
                        <input type="date" value={nextSchedule} onChange={e => setNextSchedule(e.target.value)} className={inputClass}/>
                      </div>
                      <div>
                        <label className={`${labelClass} mb-2`}>Time</label>
                        <input type="text" value={nextTime} onChange={e => setNextTime(e.target.value)}
                          placeholder="e.g. 10:30 AM" className={inputClass}/>
                      </div>
                      <div>
                        <label className={`${labelClass} mb-2`}><Globe size={11} className="text-[#1B6FE8]"/>Timezone</label>
                        <input type="text" value={timezone} onChange={e => setTimezone(e.target.value)}
                          placeholder="ET / CT / PT" className={inputClass}/>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={isOldClient}
                        onChange={e => setIsOldClient(e.target.checked)}
                        className="rounded border-gray-300 text-[#1B6FE8] focus:ring-[#1B6FE8]"
                      />
                      Old Client
                    </label>
                    <div>
                      <label className={`${labelClass} mb-2`}><FileText size={11} className="text-[#1B6FE8]"/>Notes</label>
                      <textarea rows={3} value={noteText} onChange={e => setNoteText(e.target.value)}
                        placeholder="Add or update notes" className={textareaClass}/>
                      <p className="text-[10px] text-gray-400 mt-1">Saving a changed note adds it to the notes history.</p>
                    </div>
                    {(lead.csr || lead.csrCode || lead.createdAt) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-[#F8F9FC] rounded-2xl p-3.5">
                          <p className="text-gray-400 text-[11px] mb-1">CSR</p>
                          <p className="text-[#0F172A] text-[13px] font-semibold truncate">
                            {[lead.csrCode, lead.csr].filter(Boolean).join(" — ") || "Unassigned"}
                          </p>
                        </div>
                        {lead.createdAt && (
                          <div className="bg-[#F8F9FC] rounded-2xl p-3.5">
                            <p className="text-gray-400 text-[11px] mb-1">Created</p>
                            <p className="text-[#0F172A] text-[13px] font-semibold">{lead.createdAt}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* ACTIONS */}
                <div className="flex gap-3 pb-1">
                  <button onClick={() => setIsEditing(false)}
                    className="flex-1 h-12 rounded-2xl bg-[#F5F6FA] text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-colors">
                    Cancel
                  </button>
                  <button onClick={save} disabled={saving}
                    className={`flex-1 h-12 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all ${
                      !saving ? "bg-gradient-to-r from-[#1B6FE8] to-[#d4173a] shadow-md shadow-red-200" : "bg-gray-200 cursor-not-allowed text-gray-400"
                    }`}>
                    {saving ? (
                      <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>Saving...</>
                    ) : <><Check size={15}/>Save Changes</>}
                  </button>
                </div>
              </>
            )}

            {/* ══ SUB-CONTACTS ══ */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className={labelClass}><Users size={11} className="text-[#1B6FE8]"/>Sub Contacts</label>
                <button
                  type="button"
                  onClick={() => { setShowSubForm(v => !v); setSubName(""); setSubDesig(""); setSubPhone(""); setSubEmail(""); }}
                  className="h-8 px-3 rounded-full bg-[#EAF2FE] text-[#1B6FE8] text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-[#1B6FE8] hover:text-white transition-colors">
                  <Plus size={14}/>{showSubForm ? "Cancel" : "Add"}
                </button>
              </div>

              {showSubForm && (
                <div className="mb-3 bg-[#F8F9FC] rounded-2xl p-3 space-y-2">
                  <input
                    type="text" value={subName} onChange={e => setSubName(e.target.value)}
                    placeholder="Name (or leave blank)" className={inputClass}
                  />
                  <input
                    type="text" value={subDesig} onChange={e => setSubDesig(e.target.value)}
                    placeholder="Designation (e.g. Manager)" className={inputClass}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="tel" value={subPhone} onChange={e => setSubPhone(e.target.value)}
                      placeholder="Phone" className={inputClass} autoComplete="tel"
                    />
                    <input
                      type="email" value={subEmail} onChange={e => setSubEmail(e.target.value)}
                      placeholder="Email" className={inputClass} autoComplete="email"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowSubForm(false)}
                      className="flex-1 h-9 rounded-xl bg-white border border-gray-200 text-gray-600 text-xs font-semibold">
                      Cancel
                    </button>
                    <button onClick={addSubContact} disabled={addingSub || (!subName.trim() && !subPhone.trim() && !subEmail.trim())}
                      className="flex-1 h-9 rounded-xl bg-[#1B6FE8] text-white text-xs font-semibold disabled:opacity-50">
                      {addingSub ? "Adding…" : "Add Contact"}
                    </button>
                  </div>
                </div>
              )}

              {subs.length > 0 ? (
                <div className="space-y-2 max-h-[280px] overflow-y-auto">
                  {subs.map(sub => (
                    <div key={sub.id} className="bg-[#F8F9FC] rounded-2xl p-3 flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#1B6FE8] text-white flex items-center justify-center font-bold text-sm shrink-0">
                        {sub.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        {editingSubId === sub.id ? (
                          <div className="space-y-2">
                            <input type="text" value={editSubName} onChange={e => setEditSubName(e.target.value)} placeholder="Name *" className={inputClass} />
                            <input type="text" value={editSubDesig} onChange={e => setEditSubDesig(e.target.value)} placeholder="Designation" className={inputClass} />
                            <div className="grid grid-cols-2 gap-2">
                              <input type="tel" value={editSubPhone} onChange={e => setEditSubPhone(e.target.value)} placeholder="Phone" className={inputClass} autoComplete="tel" />
                              <input type="email" value={editSubEmail} onChange={e => setEditSubEmail(e.target.value)} placeholder="Email" className={inputClass} autoComplete="email" />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => setEditingSubId(null)} className="flex-1 h-8 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-600">Cancel</button>
                              <button onClick={saveEditSub} disabled={!editSubName.trim() || savingSubId === sub.id} className="flex-1 h-8 rounded-lg bg-[#1B6FE8] text-white text-xs font-semibold disabled:opacity-50">
                                {savingSubId === sub.id ? "Saving…" : "Save"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-[13px] font-semibold text-[#0F172A] truncate">{sub.name}</p>
                            {sub.designation && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{sub.designation}</p>}
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                              {sub.phone && (
                                dialer ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => dialer.open({
                                        destination: sub.phone ?? "",
                                        leadId: lead.id,
                                        clientName: sub.name || lead.company || lead.name,
                                      })}
                                      className="flex items-center gap-1 text-[11px] text-[#1B6FE8] font-medium underline-offset-[3px] hover:underline cursor-pointer"
                                    >
                                      <Phone size={16}/>{sub.phone}
                                    </button>
                                    <ChangeDialerNumber />
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-[11px] text-gray-500">
                                    <Phone size={16}/>{sub.phone}
                                  </span>
                                )
                              )}
                              {sub.email && (
                                <span className="flex items-center gap-1 text-[11px] text-gray-500">
                                  <Mail size={9}/>{sub.email}
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      {editingSubId !== sub.id && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            onClick={() => startEditSub(sub)}
                            className="w-7 h-7 rounded-lg bg-white border border-gray-200 text-gray-500 flex items-center justify-center hover:border-[#1B6FE8] hover:text-[#1B6FE8] transition-colors">
                            <Pencil size={11}/>
                          </button>
                          <button
                            onClick={() => deleteSubContact(sub.id)}
                            disabled={deletingId === sub.id}
                            className="w-7 h-7 rounded-lg bg-[#EAF2FE] text-[#1B6FE8] flex items-center justify-center hover:bg-[#1B6FE8] hover:text-white transition-colors disabled:opacity-40">
                            <Trash2 size={12}/>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                !showSubForm && <p className="text-gray-400 text-[13px]">No sub-contacts yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
