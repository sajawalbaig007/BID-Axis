"use client";

import { useMemo, useState, useCallback } from "react";
import {
  Users, UserPlus, Search, Filter, Phone, Briefcase,
  Clock3, Building2, AlignLeft, RefreshCw, Eye, Plus, X,
  Pencil, User2, Mail, MapPin, StickyNote, History,
  CheckCircle2, Trash2, Loader2, DollarSign, Link2, Layers,
} from "lucide-react";

import TopNavbar from "../components/navigation/TopNavbar";
import ServicePicker from "../components/shared/ServicePicker";
import StackedHorizontalBarChart, { StackedBarRow } from "../components/shared/StackedHorizontalBarChart";
import Pagination from "../components/shared/Pagination";
import { CLIENT_GRID_HEAD, CRM_GRID_HEAD_ROW, CLIENT_GRID_ROW, CSR_PAGE_MAIN, matchesLeadSearch } from "../components/shared/csrTableStyles";
import { PROJECT_TABLE_HEAD } from "@/app/components/projects/ProjectTableCells";

import { isWonClientStatus } from "../constants/leadStatuses";
import { useLeadsData, mapClientLead, ClientLead, SubContact, NoteEntry, type RawClientLead, splitWonClientsByIdentity } from "../hooks/useLeadsData";
import { useClientPhoneLookup } from "../hooks/useClientPhoneLookup";
import API from "@/lib/api";
import { formatEstDateTime } from "@/lib/estTime";
import CapsuleTabs from "@/app/components/CapsuleTabs";
import { invalidateAllCsrListCaches } from "@/lib/csrApiCache";
import PhoneWithTzCell from "../components/shared/PhoneWithTzCell";
import EmailWithExtraCell from "../components/shared/EmailWithExtraCell";
import ClientSortControls from "../components/shared/ClientSortControls";
import { collectLeadEmails } from "../utils/parseEmails";
import { collectLeadPhones } from "../utils/parsePhones";
import { sortClientRows, type ClientListSortBy, type SortDir } from "../utils/clientListSort";
import { sortByOldestNote } from "../utils/sortByOldestNote";
import { getCompanyTimezoneAbbr, tzBadgeClass } from "../constants/timezoneAbbr";
import toast, { Toaster } from "react-hot-toast";
import ClientHistoryModal from "@/app/components/clients/ClientHistoryModal";
import SubContactsCell from "@/app/components/clients/SubContactsCell";
import PaymentStatusCircle from "../components/shared/PaymentStatusCircle";
import ProjectWorkbenchModal from "@/app/components/projects/ProjectWorkbenchModal";
import CommentCell from "../components/shared/CommentCell";
import { NoteRichText } from "@/lib/noteRichText";
import { apiErrorMessage } from "@/lib/api";
import { formatQuotedAmount, parseMoney, emptyWorkbench, ProjectWorkbenchData } from "@/lib/projectFields";
import StateFilterDropdown from "../components/shared/StateFilterDropdown";
import PhoneAreaCodeFilterInput from "../components/shared/PhoneAreaCodeFilterInput";
import { matchesStateLocationFilter, matchesPhoneAreaCodeFilter } from "@/lib/stateLocationFilter";
import { websiteHref } from "../components/LeadDetailModal";
import ExtraProjectCodesPopup from "@/app/admin/leads/ExtraProjectCodesPopup";

function clientDisplayCode(lead: Pick<ClientLead, "clientCode" | "projectCode">): string | null {
  const code = (lead.clientCode || lead.projectCode || "").trim();
  return code || null;
}

/* ─── Constants ─────────────────────────────────────────── */
const EDIT_STATUSES = ["pending", "important", "interested", "Close Client", "completed"];
const STATUS_COLORS: Record<string, string> = {
  pending:          "bg-gray-100 text-gray-600",
  important:        "bg-amber-50 text-amber-700",
  interested:       "bg-green-50 text-green-700",
  "Not Interested": "bg-red-50 text-red-600",
  "not picked":     "bg-orange-50 text-orange-600",
  "not completed":  "bg-orange-50 text-orange-600",
  "Close Client":   "bg-blue-50 text-blue-700",
  completed:        "bg-emerald-50 text-emerald-700",
};
const PAGE_SIZE = 30;
const emptyAdd  = { name: "", phone: "", email: "", company: "", website: "", state: "", service: "", comments: "", quotation: "", upfront: "" };
const emptyContact = { name: "", designation: "", phone: "", email: "" };

/* ─── Helpers ────────────────────────────────────────────── */
function fmtFull(iso: string) {
  return formatEstDateTime(iso);
}

/* ─── Page ──────────────────────────────────────────────── */
export default function LeadsPage() {
  const { leads, setLeads, stats, loading, refetch } = useLeadsData();

  /* tabs / search / pagination */
  const [activeTab, setActiveTab] = useState<"all" | "new" | "old">("new");
  const [search,       setSearch]       = useState("");
  const [stateFilter,  setStateFilter]  = useState("");
  const [phoneFilter,  setPhoneFilter]  = useState("");
  const [page,      setPage]      = useState(1);
  const [sortBy,    setSortBy]    = useState<ClientListSortBy>("oldestNote");
  const [sortDir,   setSortDir]   = useState<SortDir>("asc");

  /* ── detail / edit modal ── */
  const [viewing,      setViewing]      = useState<ClientLead | null>(null);
  const [isEditing,    setIsEditing]    = useState(false);
  const [editName,     setEditName]     = useState("");
  const [editPhone,    setEditPhone]    = useState("");
  const [editEmail,    setEditEmail]    = useState("");
  const [editCompany,  setEditCompany]  = useState("");
  const [editWebsite,  setEditWebsite]  = useState("");
  const [editState,    setEditState]    = useState("");
  const [editService,  setEditService]  = useState("");
  const [editStatus,   setEditStatus]   = useState("");
  const [editComments, setEditComments] = useState("");
  const [editQuotation, setEditQuotation] = useState("");
  const [editUpfront,   setEditUpfront]   = useState("");
  const [saving,       setSaving]       = useState(false);

  /* ── add modal ── */
  const [showAdd,   setShowAdd]   = useState(false);
  const [addForm,   setAddForm]   = useState(emptyAdd);
  const [addSaving, setAddSaving] = useState(false);
  const [addError,  setAddError]  = useState("");

  const applyClientLookup = useCallback((client: { name: string; company: string; email: string; state: string; interestedService: string }) => {
    setAddForm(f => ({
      ...f,
      name:    client.name    || f.name,
      company: client.company || f.company,
      email:   client.email   || f.email,
      state:   client.state   || f.state,
      service: f.service || client.interestedService || "",
    }));
  }, []);

  const { phoneLookupLoading, returningClient, resetLookup, onPhoneValueChange, onPhoneBlur, onPhonePaste } =
    useClientPhoneLookup(applyClientLookup);

  const openAddModal = useCallback(() => {
    setAddForm(emptyAdd);
    setAddError("");
    resetLookup();
    setShowAdd(true);
  }, [resetLookup]);

  const closeAddModal = useCallback(() => {
    setShowAdd(false);
    setAddForm(emptyAdd);
    setAddError("");
    resetLookup();
  }, [resetLookup]);

  /* ── note history modal ── */
  const [noteLeadId, setNoteLeadId] = useState<string | null>(null);

  /* ── sub-contacts (inside detail modal) ── */
  const [showContactForm, setShowContactForm]   = useState(false);
  const [newContact,      setNewContact]        = useState(emptyContact);
  const [contactSaving,   setContactSaving]     = useState(false);
  const [removingContactId, setRemovingContactId] = useState<string | null>(null);
  const [historyLead, setHistoryLead] = useState<ClientLead | null>(null);
  const [addProjectFor, setAddProjectFor] = useState<ClientLead | null>(null);
  const [addProjectSaving, setAddProjectSaving] = useState(false);

  /* ─── Derived ──────────────────────────────────────────── */
  const wonLeads = useMemo(() => leads.filter(l => isWonClientStatus(l.status)), [leads]);
  const { newLeads, oldLeads } = useMemo(
    () => splitWonClientsByIdentity(wonLeads),
    [wonLeads],
  );
  const allClients = useMemo(
    () => [...newLeads, ...oldLeads].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
    [newLeads, oldLeads],
  );
  const baseList = activeTab === "all" ? allClients : activeTab === "new" ? newLeads : oldLeads;

  const importantCount  = stats.importantCount;
  const interestedCount = stats.interestedCount;
  const pendingCount    = stats.pendingCount;
  const filtered = useMemo(() => {
    const list = baseList.filter(l =>
      matchesStateLocationFilter(l.state, l.phone, stateFilter) &&
      matchesPhoneAreaCodeFilter(l.phone, phoneFilter) &&
      matchesLeadSearch(search, {
        name: l.name,
        company: [l.rawCompany, l.company].filter(Boolean).join(" "),
        phone: l.phone,
        email: l.email,
        service: l.interestedService,
        state: l.state,
      })
    );
    return sortBy === "oldestNote"
      ? (sortDir === "desc" ? sortByOldestNote(list).reverse() : sortByOldestNote(list))
      : sortClientRows(list, sortBy, sortDir);
  }, [baseList, search, stateFilter, phoneFilter, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* ─── Stacked chart data ───────────────────────────────── */
  const chartRows = useMemo<StackedBarRow[]>(() => [
    {
      label: "Won Clients",
      segments: [
        { label: "New (first-time)", value: newLeads.length, color: "#15803D" },
        { label: "Old (repeat)",     value: oldLeads.length, color: "#B45309" },
      ],
    },
    {
      label: "Active Pipeline",
      segments: [
        { label: "Important",  value: importantCount,  color: "#1B6FE8" },
        { label: "Interested", value: interestedCount, color: "#D97706" },
        { label: "Pending",    value: pendingCount,    color: "#94A3B8" },
      ],
    },
    {
      label: "All Assigned",
      segments: [{ label: "Total Leads", value: stats.totalAssigned, color: "#1D4ED8" }],
    },
  ], [newLeads, oldLeads, importantCount, interestedCount, pendingCount, stats.totalAssigned]);

  /* ─── Note helpers ─────────────────────────────────────── */
  /* unused getLatestNote removed — CommentCell shows +N */

  const noteHistoryLead = useMemo(
    () => leads.find(l => l.id === noteLeadId) ?? null,
    [leads, noteLeadId],
  );

  /* ─── Actions ──────────────────────────────────────────── */
  const openDetail = (lead: ClientLead) => {
    setViewing(lead); setIsEditing(false);
    setShowContactForm(false); setNewContact(emptyContact);
  };

  const startEdit = () => {
    if (!viewing) return;
    setEditName(viewing.name);
    setEditPhone(viewing.phone === "N/A" ? "" : viewing.phone);
    setEditEmail(viewing.email);
    setEditCompany(viewing.company === "N/A" ? "" : viewing.company);
    setEditWebsite(viewing.website || "");
    setEditState(viewing.state);
    setEditService(viewing.interestedService);
    setEditStatus(viewing.status);
    setEditComments(viewing.comments);
    setEditQuotation(viewing.projectBudget);
    setEditUpfront(viewing.paidAmount);
    setIsEditing(true);
  };

  const saveEdit = async () => {
    if (!viewing) return;
    setSaving(true);
    try {
      await API.put(`/csr/lead/${viewing.id}`, {
        name:              editName.trim()    || undefined,
        phone:             editPhone.trim()   || undefined,
        email:             editEmail.trim()   || undefined,
        company:           editCompany.trim() || undefined,
        website:           editWebsite.trim(),
        state:             editState.trim()   || undefined,
        interestedService: editService        || undefined,
        status:            editStatus         || undefined,
        comments:          editComments       || undefined,
        projectBudget:     editQuotation.trim() || undefined,
        paidAmount:        editUpfront.trim()   || undefined,
      });
      const updated: ClientLead = {
        ...viewing,
        name:              editName.trim()    || viewing.name,
        phone:             editPhone.trim()   || viewing.phone,
        email:             editEmail.trim(),
        company:           editCompany.trim() || viewing.company,
        website:           editWebsite.trim(),
        state:             editState.trim(),
        interestedService: editService,
        status:            editStatus,
        comments:          editComments,
        projectBudget:     editQuotation.trim(),
        paidAmount:        editUpfront.trim(),
      };
      setLeads(prev => prev.map(l => l.id === viewing.id ? updated : l));
      setViewing(updated);
      setIsEditing(false);
      toast.success("Lead updated");
    } catch { toast.error("Failed to save changes"); }
    setSaving(false);
  };

  /* ─── Add Lead ─────────────────────────────────────────── */
  const handleAdd = async () => {
    if (!addForm.name.trim()) { setAddError("Client name is required."); return; }
    setAddSaving(true); setAddError("");
    try {
      const res = await API.post("/csr/lead", {
        name:              addForm.name.trim()    || undefined,
        phone:             addForm.phone.trim()   || undefined,
        email:             addForm.email.trim()   || undefined,
        company:           addForm.company.trim() || undefined,
        website:           addForm.website.trim() || undefined,
        state:             addForm.state.trim()   || undefined,
        interestedService: addForm.service        || undefined,
        comments:          addForm.comments.trim() || undefined,
        projectBudget:     addForm.quotation.trim() || undefined,
        paidAmount:        addForm.upfront.trim()   || undefined,
        asWonClient:       true,
      });
      const promoted = !!res.data.promoted;

      invalidateAllCsrListCaches();
      closeAddModal();
      await refetch(true);
      toast.success(
        promoted || returningClient
          ? "Returning client added — moved to Old Clients"
          : "Client added to New Clients",
      );
    } catch (err) {
      setAddError(apiErrorMessage(err, "Failed to add lead. Please try again."));
    }
    setAddSaving(false);
  };

  /* ─── Notes ────────────────────────────────────────────── */
  const openNoteHistory = async (leadId: string) => {
    setNoteLeadId(leadId);
    try {
      const res = await API.get(`/csr/lead/${leadId}`);
      const raw = res.data.lead;
      if (!raw) return;
      const mapped = mapClientLead(raw as RawClientLead);
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, noteHistory: mapped.noteHistory } : l));
    } catch {
      /* keep preloaded notes */
    }
  };

  /* ─── Sub-contacts ─────────────────────────────────────── */
  const addContact = async () => {
    if (!viewing || !newContact.name.trim()) return;
    setContactSaving(true);
    try {
      const res = await API.post(`/csr/lead/${viewing.id}/subcontacts`, newContact);
      const saved: SubContact = res.data.subContact ?? {
        id: String(Date.now()),
        ...newContact,
      };
      const updated: ClientLead = { ...viewing, contacts: [...viewing.contacts, saved] };
      setLeads(prev => prev.map(l => l.id === viewing.id ? updated : l));
      setViewing(updated);
      setNewContact(emptyContact); setShowContactForm(false);
      toast.success("Contact added");
    } catch { toast.error("Failed to add contact"); }
    setContactSaving(false);
  };

  const removeContact = async (contactId: string) => {
    if (!viewing) return;
    setRemovingContactId(contactId);
    try {
      await API.delete(`/csr/lead/${viewing.id}/subcontacts/${contactId}`);
      const updated: ClientLead = { ...viewing, contacts: viewing.contacts.filter(c => c.id !== contactId) };
      setLeads(prev => prev.map(l => l.id === viewing.id ? updated : l));
      setViewing(updated);
    } catch { toast.error("Failed to remove contact"); }
    setRemovingContactId(null);
  };

  /* ─── JSX ──────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#F5F6FA] dark:bg-crm-bg">
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: "16px", fontSize: "14px" } }} />
      <TopNavbar />
      <main className={CSR_PAGE_MAIN}>

        {/* HEADER */}
        <div className="mt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-[28px] lg:text-[34px] font-bold text-[#0F172A] leading-tight">My Clients</h1>
            <p className="text-gray-500 mt-1 text-xs sm:text-sm">New = first-time · Old = repeat business.</p>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center justify-center gap-2 h-10 sm:h-11 px-4 sm:px-5 rounded-xl sm:rounded-2xl bg-[#1B6FE8] text-white text-xs sm:text-sm font-semibold shadow-md shadow-red-200 hover:bg-[#a30f27] transition-colors w-full sm:w-auto shrink-0"
          >
            <Plus size={14} />Add New Lead
          </button>
        </div>

        {/* STACKED CHART */}
        <div className="mt-4 sm:mt-7">
          <StackedHorizontalBarChart
            title="Pipeline value by stage and type"
            subtitle="Client distribution across won deals, active pipeline, and all assigned leads."
            rows={chartRows}
            loading={loading}
          />
        </div>

        {/* TABS */}
        <CapsuleTabs
          stretch
          className="mt-4 sm:mt-7"
          activeKey={activeTab}
          onChange={key => { setActiveTab(key); setPage(1); setSearch(""); }}
          tabs={[
            { key: "all", label: "All",         count: activeTab === "all" ? filtered.length : allClients.length, icon: Layers   },
            { key: "new", label: "New Clients", count: activeTab === "new" ? filtered.length : newLeads.length,   icon: UserPlus },
            { key: "old", label: "Old Clients", count: activeTab === "old" ? filtered.length : oldLeads.length,   icon: User2    },
          ]}
        />

        {/* TABLE CARD */}
        <div className="bg-white dark:bg-crm-surface rounded-2xl sm:rounded-[28px] border border-white dark:border-crm-border shadow-sm mt-4 sm:mt-7">
          {/* Card header */}
          <div className="px-4 sm:px-5 lg:px-6 py-3 sm:py-4 border-b border-[#F3F3F3]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-lg sm:text-[20px] font-bold text-[#0F172A]">
                  {activeTab === "all" ? "All Clients" : activeTab === "new" ? "New Clients" : "Old Clients"}
                </h3>
                <p className="text-gray-500 text-xs sm:text-sm mt-0.5">
                  {activeTab === "all"
                    ? "All won clients — new and returning."
                    : activeTab === "new"
                    ? "First-time clients — won deals."
                    : "Returning clients — repeat business."}
                </p>
              </div>
              <div className="grid w-full gap-2 grid-cols-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto_auto_auto]">
                <div className="relative min-w-0 col-span-2 sm:col-span-1">
                  <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    placeholder="Search name, company, phone…"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    className="w-full h-10 sm:h-[44px] rounded-xl sm:rounded-2xl border border-gray-200 dark:border-crm-border bg-[#FAFAFA] dark:bg-crm-input pl-9 pr-4 text-xs sm:text-sm outline-none focus:border-[#1B6FE8] transition-colors dark:text-crm-text"
                  />
                </div>
                <StateFilterDropdown fullWidth value={stateFilter} onChange={v => { setStateFilter(v); setPage(1); }} />
                <PhoneAreaCodeFilterInput fullWidth value={phoneFilter} onChange={v => { setPhoneFilter(v); setPage(1); }} />
                <ClientSortControls
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSortBy={v => { setSortBy(v); setPage(1); }}
                  onSortDir={v => { setSortDir(v); setPage(1); }}
                />
                <button onClick={() => void refetch()}
                  className="w-full sm:w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gray-100 dark:bg-crm-muted hover:bg-gray-200 dark:hover:bg-crm-surface-raised flex items-center justify-center transition-colors"
                  title="Refresh">
                  <RefreshCw size={13} className="text-gray-500" />
                </button>
                <div className="flex items-center justify-center gap-1.5 text-[#1B6FE8] text-xs sm:text-sm font-semibold whitespace-nowrap">
                  <Filter size={13} />
                  <span>{filtered.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Rows */}
          {loading ? (
            <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="animate-pulse flex items-center gap-3 sm:gap-4">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gray-100 shrink-0" />
                  <div className="flex-1 grid grid-cols-4 gap-3 sm:gap-4">
                    {[1,2,3,4].map(j => <div key={j} className="h-3.5 bg-gray-100 rounded" />)}
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <>
              <div className="overflow-x-auto">
              {/* Desktop header — min width so actions (3 buttons) never clip */}
              <div className={`hidden lg:grid gap-2 px-4 lg:px-5 py-2.5 w-full min-w-[1100px] ${CRM_GRID_HEAD_ROW} ${CLIENT_GRID_HEAD}`}>
                {["Code", "Client", "Company", "Phone", "Sub Contacts", "Email", "Service", "Notes", "Actions"].map(h => (
                  <span key={h} className={PROJECT_TABLE_HEAD}>{h}</span>
                ))}
              </div>

              <div className="divide-y divide-[#F3F3F3] w-full min-w-[1100px] lg:min-w-[1100px]">
                {paginated.map(lead => {
                  const displayName = lead.name;
                  /* Prefer clientCode from DB; fall back to projectCode only if client code missing */
                  const displayCode = (lead.clientCode?.trim() || lead.projectCode?.trim() || null);
                  const extraProjects = (lead.extraProjects ?? []).filter(
                    e => e.code.trim().toLowerCase() !== (displayCode ?? "").toLowerCase(),
                  );
                  const rowIsOld = lead.isOldClient;
                  const displaySub  = rowIsOld && lead.rawCompany && lead.rawCompany !== lead.name ? lead.rawCompany : null;
                  return (
                    <div
                      key={lead.id}
                      className={`grid gap-3 px-3 sm:px-4 lg:px-5 xl:px-6 py-3 sm:py-4 items-center hover:bg-[#FAFAFA] transition-colors grid-cols-[1fr_auto] ${CLIENT_GRID_ROW}`}
                    >
                      {/* Code column */}
                      <div className="hidden lg:flex items-center gap-1 min-w-0">
                        {displayCode
                          ? <span className="bg-[#1B6FE8]/10 text-[#1B6FE8] text-[10px] font-bold px-2 py-1 rounded-lg truncate">{displayCode}</span>
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                        <ExtraProjectCodesPopup extras={extraProjects} title="Previous projects" />
                      </div>

                      {/* Client */}
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 text-white ${rowIsOld ? "bg-amber-500" : "bg-[#15803D]"}`}>
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* show code badge inline on mobile */}
                            {displayCode && (
                              <span className="lg:hidden bg-[#1B6FE8]/10 text-[#1B6FE8] text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0">{displayCode}</span>
                            )}
                            <span className="lg:hidden">
                              <ExtraProjectCodesPopup extras={extraProjects} title="Previous projects" />
                            </span>
                            <p className="text-xs sm:text-sm font-semibold text-[#0F172A] truncate">{displayName}</p>
                            {(() => {
                              const tz = getCompanyTimezoneAbbr(lead);
                              return tz ? (
                                <span
                                  title={`Company location · ${lead.state || "state"}`}
                                  className={`inline-flex px-1.5 py-0.5 rounded-md text-[9px] font-bold border shrink-0 ${tzBadgeClass(tz)}`}
                                >
                                  {tz}
                                </span>
                              ) : null;
                            })()}
                          </div>
                          {displaySub && (
                            <p className="text-[10px] text-gray-400 truncate mt-0.5">{displaySub}</p>
                          )}
                          <span className={`inline-block text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-lg mt-0.5 ${rowIsOld ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                            {rowIsOld ? "Old Client" : "New Client"}
                          </span>
                        </div>
                      </div>

                      {/* Company */}
                      <p className="hidden lg:block text-xs lg:text-sm text-[#0F172A] truncate">{lead.company}</p>

                      {/* Phone — number + area-code TZ */}
                      <div className="hidden lg:flex items-center gap-1.5 min-w-0 overflow-visible">
                        {(() => {
                          const phones = collectLeadPhones(lead.phone, lead.contacts);
                          if (phones.length === 0) {
                            return <span className="text-gray-300 text-xs">—</span>;
                          }
                          return (
                            <PhoneWithTzCell
                              phone={phones[0]}
                              allPhones={phones}
                              variant="pill"
                              className="px-2 py-1 text-xs lg:text-sm"
                              dial={{ leadId: lead.id, clientName: lead.company || lead.name }}
                            />
                          );
                        })()}
                      </div>

                      <div className="hidden lg:block min-w-0">
                        <SubContactsCell contacts={lead.contacts} />
                      </div>

                      {/* Email */}
                      <div className="hidden lg:block min-w-0 overflow-visible">
                        <EmailWithExtraCell
                          email={lead.email}
                          allEmails={collectLeadEmails(lead.email, lead.contacts)}
                          variant="pill"
                          className="px-2 py-1 text-xs lg:text-sm"
                          clientName={lead.name}
                          company={lead.company !== "N/A" ? lead.company : undefined}
                        />
                      </div>

                      {/* Service */}
                      <p className={`hidden lg:block text-xs lg:text-sm truncate ${lead.interestedService ? "text-[#0F172A]" : "text-gray-300"}`}>
                        {lead.interestedService || "—"}
                      </p>

                      {/* Notes (+N sticky) */}
                      <div className="hidden lg:block">
                        <CommentCell
                          id={lead.id}
                          noteHistory={lead.noteHistory}
                          noteCount={lead.noteHistory?.length}
                          onAddNote={async (id, text, parentId) => {
                            const res = await API.post(`/csr/lead/${id}/notes`, {
                              text,
                              ...(parentId ? { parentId } : {}),
                            });
                            const saved: NoteEntry = res.data.note
                              ? {
                                  id: res.data.note.id,
                                  text: res.data.note.text,
                                  createdAt: res.data.note.createdAt,
                                  parentId: res.data.note.parentId ?? parentId ?? null,
                                }
                              : {
                                  id: String(Date.now()),
                                  text,
                                  createdAt: new Date().toISOString(),
                                  parentId: parentId || null,
                                };
                            setLeads((prev) =>
                              prev.map((l) => {
                                if (l.id !== id) return l;
                                const hist = l.noteHistory ?? [];
                                if (parentId) {
                                  return {
                                    ...l,
                                    noteHistory: hist.map((n) =>
                                      n.id === parentId
                                        ? { ...n, replies: [...(n.replies ?? []), saved] }
                                        : n,
                                    ),
                                  };
                                }
                                return {
                                  ...l,
                                  noteHistory: [saved, ...hist.filter((n) => n.id !== saved.id)],
                                };
                              }),
                            );
                            invalidateAllCsrListCaches();
                            return saved;
                          }}
                          onNoteUpdated={(leadId, noteId, text, createdAt) => {
                            const at = createdAt ?? new Date().toISOString();
                            setLeads((prev) =>
                              prev.map((l) => {
                                if (l.id !== leadId) return l;
                                const patchDeep = (notes: NoteEntry[]): NoteEntry[] =>
                                  notes.map((n) => {
                                    if (n.id === noteId) return { ...n, text, createdAt: at };
                                    if (n.replies?.length) return { ...n, replies: patchDeep(n.replies) };
                                    return n;
                                  });
                                const noteHistory = patchDeep(l.noteHistory ?? []).sort(
                                  (a, b) =>
                                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                                );
                                return { ...l, noteHistory };
                              }),
                            );
                          }}
                          onNoteDeleted={(leadId, noteId) => {
                            setLeads((prev) =>
                              prev.map((l) => {
                                if (l.id !== leadId) return l;
                                const strip = (notes: NoteEntry[]): NoteEntry[] =>
                                  notes
                                    .filter((n) => n.id !== noteId)
                                    .map((n) => ({
                                      ...n,
                                      replies: (n.replies ?? []).filter((r) => r.id !== noteId),
                                    }));
                                return { ...l, noteHistory: strip(l.noteHistory ?? []) };
                              }),
                            );
                          }}
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex justify-end lg:justify-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setAddProjectFor(lead)}
                          className="inline-flex items-center gap-1 h-8 sm:h-9 px-2 sm:px-2.5 rounded-xl bg-[#EAF2FE] text-[#1B6FE8] text-[10px] sm:text-[11px] font-bold hover:bg-[#FFE4E8] transition-colors shrink-0"
                          title="Add new project">
                          <Plus size={13} strokeWidth={2.5} />
                          <span className="hidden xl:inline">Project</span>
                        </button>
                        <button onClick={() => void openNoteHistory(lead.id)}
                          className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center hover:opacity-80 transition-opacity shrink-0"
                          title="Notes history">
                          <StickyNote size={13} />
                        </button>
                        <button
                          onClick={() => lead.phone && lead.phone !== "N/A"
                            ? setHistoryLead(lead)
                            : openDetail(lead)}
                          className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#EAF5FF] text-[#0B84F3] flex items-center justify-center hover:opacity-80 transition-opacity shrink-0"
                          title={rowIsOld ? "All projects history" : "Client history"}
                        >
                          <Eye size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>

              <div className="px-4 sm:px-6">
                <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
              </div>
            </>
          ) : (
            <div className="p-10 sm:p-12 lg:p-16 text-center">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#EFF6FF] text-[#1D4ED8] flex items-center justify-center mx-auto mb-4">
                <Users size={24} className="sm:w-7 sm:h-7" />
              </div>
              <h2 className="text-lg sm:text-[22px] font-bold text-[#0F172A]">No Clients Found</h2>
              <p className="text-gray-500 mt-1.5 text-xs sm:text-sm">
                {search ? "No clients match your search." : "No won leads yet."}
              </p>
            </div>
          )}
        </div>

        {/* ══ NOTE HISTORY MODAL (same CommentCell sticky as tables) ══ */}
        {noteLeadId && noteHistoryLead && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col p-4 sm:p-5" style={{ maxHeight: "86vh" }}>
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <History size={16} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-[#0F172A]">Sticky Notes</h2>
                    <p className="text-[11px] text-gray-400 truncate">{noteHistoryLead.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setNoteLeadId(null)}
                  className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="overflow-y-auto">
                <CommentCell
                  id={noteHistoryLead.id}
                  noteHistory={noteHistoryLead.noteHistory}
                  noteCount={noteHistoryLead.noteHistory.length}
                  onAddNote={async (id, text, parentId) => {
                    const res = await API.post(`/csr/lead/${id}/notes`, {
                      text,
                      ...(parentId ? { parentId } : {}),
                    });
                    const saved: NoteEntry = res.data.note
                      ? {
                          id: res.data.note.id,
                          text: res.data.note.text,
                          createdAt: res.data.note.createdAt,
                          parentId: res.data.note.parentId ?? parentId ?? null,
                        }
                      : {
                          id: String(Date.now()),
                          text,
                          createdAt: new Date().toISOString(),
                          parentId: parentId || null,
                        };
                    setLeads((prev) =>
                      prev.map((l) => {
                        if (l.id !== id) return l;
                        const hist = l.noteHistory ?? [];
                        if (parentId) {
                          return {
                            ...l,
                            noteHistory: hist.map((n) =>
                              n.id === parentId
                                ? { ...n, replies: [...(n.replies ?? []), saved] }
                                : n,
                            ),
                          };
                        }
                        return { ...l, noteHistory: [saved, ...hist.filter((n) => n.id !== saved.id)] };
                      }),
                    );
                    invalidateAllCsrListCaches();
                    return saved;
                  }}
                  onNoteUpdated={(leadId, noteId, text, createdAt) => {
                    const at = createdAt ?? new Date().toISOString();
                    setLeads((prev) =>
                      prev.map((l) => {
                        if (l.id !== leadId) return l;
                        const patchDeep = (notes: NoteEntry[]): NoteEntry[] =>
                          notes.map((n) => {
                            if (n.id === noteId) return { ...n, text, createdAt: at };
                            if (n.replies?.length) return { ...n, replies: patchDeep(n.replies) };
                            return n;
                          });
                        const noteHistory = patchDeep(l.noteHistory ?? []).sort(
                          (a, b) =>
                            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                        );
                        return { ...l, noteHistory };
                      }),
                    );
                  }}
                  onNoteDeleted={(leadId, noteId) => {
                    setLeads((prev) =>
                      prev.map((l) => {
                        if (l.id !== leadId) return l;
                        const strip = (notes: NoteEntry[]): NoteEntry[] =>
                          notes
                            .filter((n) => n.id !== noteId)
                            .map((n) => ({
                              ...n,
                              replies: (n.replies ?? []).filter((r) => r.id !== noteId),
                            }));
                        return { ...l, noteHistory: strip(l.noteHistory ?? []) };
                      }),
                    );
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ══ ADD NEW LEAD MODAL ══ */}
        {showAdd && (
          <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full sm:max-w-[520px] bg-white rounded-t-[24px] sm:rounded-[28px] shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: "92vh" }}>
              <div className="relative bg-gradient-to-br from-[#1B6FE8] to-[#0E4FBE] px-4 sm:px-5 pt-4 sm:pt-5 pb-4 sm:pb-5 shrink-0 overflow-hidden">
                <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
                <button onClick={closeAddModal}
                  className="absolute top-3 sm:top-4 right-3 sm:right-4 w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors z-10">
                  <X size={13} />
                </button>
                <div className="flex items-center gap-2.5 pr-10">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                    <Plus size={18} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-white">Add New Lead</h2>
                    <p className="text-white/65 text-[10px] sm:text-xs mt-0.5">Manually add a potential client</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain">
                <div className="px-4 sm:px-5 py-4 sm:py-5 space-y-3 sm:space-y-4">
                  {addError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2.5 rounded-xl">{addError}</div>
                  )}

                  {/* Contact Info */}
                  <div className="bg-[#F8F9FC] rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-3">
                    <p className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <User2 size={11} className="text-[#1B6FE8]" />Client Information
                    </p>

                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                        Phone <span className="text-gray-300 normal-case font-normal">(paste or type to auto-fill)</span>
                      </label>
                      <div className="relative">
                        <input
                          type="tel"
                          value={addForm.phone}
                          placeholder="Phone number"
                          autoComplete="tel"
                          onChange={e => {
                            const value = e.target.value;
                            setAddForm(f => ({ ...f, phone: value }));
                            onPhoneValueChange(value);
                          }}
                          onBlur={e => onPhoneBlur(e.target.value)}
                          onPaste={onPhonePaste}
                          className="w-full h-10 rounded-xl border-2 border-gray-200 bg-white px-3 pr-9 text-sm outline-none focus:border-[#1B6FE8] transition-colors placeholder:text-gray-300"
                        />
                        {phoneLookupLoading && (
                          <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#1B6FE8] animate-spin" />
                        )}
                      </div>
                    </div>

                    {returningClient && (
                      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-[10px] sm:text-xs px-3 py-2 rounded-xl">
                        <User2 size={12} className="shrink-0" />
                        Returning client — details auto-filled from previous record
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Client Name <span className="text-[#1B6FE8]">*</span></label>
                        <input type="text" value={addForm.name} placeholder="Client name"
                          onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                          className="w-full h-10 rounded-xl border-2 border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#1B6FE8] transition-colors placeholder:text-gray-300"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Company Name</label>
                        <input type="text" value={addForm.company} placeholder="Company name"
                          onChange={e => setAddForm(f => ({ ...f, company: e.target.value }))}
                          className="w-full h-10 rounded-xl border-2 border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#1B6FE8] transition-colors placeholder:text-gray-300"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Email Address</label>
                        <input type="email" value={addForm.email} placeholder="Email address"
                          autoComplete="email"
                          onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                          className="w-full h-10 rounded-xl border-2 border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#1B6FE8] transition-colors placeholder:text-gray-300"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">State</label>
                        <input type="text" value={addForm.state} placeholder="e.g. California"
                          onChange={e => setAddForm(f => ({ ...f, state: e.target.value }))}
                          className="w-full h-10 rounded-xl border-2 border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#1B6FE8] transition-colors placeholder:text-gray-300"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Website Link</label>
                      <input type="url" value={addForm.website} placeholder="https://example.com"
                        onChange={e => setAddForm(f => ({ ...f, website: e.target.value }))}
                        className="w-full h-10 rounded-xl border-2 border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#1B6FE8] transition-colors placeholder:text-gray-300"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                      <Briefcase size={10} className="text-[#1B6FE8]" />Service Interested In
                    </label>
                    <ServicePicker value={addForm.service} onChange={v => setAddForm(f => ({ ...f, service: f.service === v ? "" : v }))} />
                  </div>

                  <div className="bg-[#F8F9FC] rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-3">
                    <p className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <DollarSign size={11} className="text-[#1B6FE8]" />Quotation &amp; Upfront
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Quotation</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                          <input
                            type="text"
                            placeholder="0.00"
                            value={addForm.quotation.replace(/^\$/, "")}
                            onChange={e => setAddForm(f => ({ ...f, quotation: e.target.value.replace(/[^0-9.]/g, "") }))}
                            className="w-full h-10 rounded-xl border-2 border-gray-200 bg-white pl-6 pr-3 text-sm outline-none focus:border-[#1B6FE8] transition-colors placeholder:text-gray-300"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Upfront Amount</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                          <input
                            type="text"
                            placeholder="0.00"
                            value={addForm.upfront.replace(/^\$/, "")}
                            onChange={e => setAddForm(f => ({ ...f, upfront: e.target.value.replace(/[^0-9.]/g, "") }))}
                            className="w-full h-10 rounded-xl border-2 border-gray-200 bg-white pl-6 pr-3 text-sm outline-none focus:border-[#1B6FE8] transition-colors placeholder:text-gray-300"
                          />
                        </div>
                      </div>
                    </div>
                    {(parseMoney(addForm.quotation) > 0 || parseMoney(addForm.upfront) > 0) && (
                      <div className="flex items-center gap-2 sm:gap-3">
                        <PaymentStatusCircle
                          percent={parseMoney(addForm.quotation) > 0
                            ? (parseMoney(addForm.upfront) / parseMoney(addForm.quotation)) * 100
                            : 0}
                        />
                        <p className="text-[10px] sm:text-[11px] text-gray-500">
                          {parseMoney(addForm.quotation) > 0
                            ? `${Math.round((parseMoney(addForm.upfront) / parseMoney(addForm.quotation)) * 100)}% of ${formatQuotedAmount(addForm.quotation)} upfront`
                            : `Upfront: ${formatQuotedAmount(addForm.upfront)}`}
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                      <AlignLeft size={10} className="text-[#1B6FE8]" />Initial Note
                    </label>
                    <textarea value={addForm.comments} placeholder="Any initial notes..." rows={3}
                      onChange={e => setAddForm(f => ({ ...f, comments: e.target.value }))}
                      className="w-full rounded-xl border-2 border-gray-200 bg-[#FAFAFA] px-3 py-2.5 text-sm outline-none focus:border-[#1B6FE8] focus:bg-white transition-colors resize-none placeholder:text-gray-300"
                    />
                  </div>

                  <div className="flex gap-2 sm:gap-3 pb-1">
                    <button onClick={closeAddModal}
                      className="flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl bg-[#F5F6FA] text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-colors">
                      Cancel
                    </button>
                    <button onClick={handleAdd} disabled={addSaving}
                      className={`flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all ${
                        !addSaving ? "bg-gradient-to-r from-[#1B6FE8] to-[#d4173a] shadow-md shadow-red-200" : "bg-gray-200 cursor-not-allowed text-gray-400"
                      }`}>
                      {addSaving
                        ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving...</>
                        : <><Plus size={14} />Add Lead</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ DETAIL / EDIT MODAL ══ */}
        {viewing && (
          <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full sm:max-w-[560px] bg-white rounded-t-[24px] sm:rounded-[28px] shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: "92vh" }}>
              {/* Gradient header */}
              <div className="relative bg-gradient-to-br from-[#1B6FE8] to-[#0E4FBE] px-4 sm:px-5 pt-4 sm:pt-5 pb-4 sm:pb-5 shrink-0 overflow-hidden">
                <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
                <div className="absolute -bottom-8 -left-4 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />
                <button
                  onClick={() => { setViewing(null); setIsEditing(false); }}
                  className="absolute top-3 sm:top-4 right-3 sm:right-4 w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white z-10">
                  <X size={13} />
                </button>
                <div className="flex items-center gap-2.5 pr-10">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center font-bold text-white text-base sm:text-lg shrink-0 ${viewing.isOldClient ? "bg-amber-500/40" : "bg-white/20"}`}>
                    {viewing.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm sm:text-base lg:text-lg font-bold text-white truncate">
                      {isEditing ? "Edit Client" : viewing.name}
                    </h2>
                    <p className="text-white/65 text-[10px] sm:text-xs mt-0.5 truncate">{viewing.company}</p>
                  </div>
                </div>
                <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5">
                  {clientDisplayCode(viewing) && (
                    <span className="inline-flex items-center bg-white/20 text-white px-2 py-0.5 rounded-full text-[10px] font-bold">
                      {clientDisplayCode(viewing)}
                    </span>
                  )}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${viewing.isOldClient ? "bg-amber-400/25 text-amber-100" : "bg-green-500/25 text-green-100"}`}>
                    {viewing.isOldClient ? "Old Client" : "New Client"}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[viewing.status] ? "bg-white/15 text-white" : "bg-white/10 text-white/70"}`}>
                    {viewing.status}
                  </span>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto overscroll-contain">
                <div className="px-4 sm:px-5 py-4 sm:py-5 space-y-4 sm:space-y-5">

                  {/* ── VIEW MODE ── */}
                  {!isEditing && (
                    <>
                      <button onClick={startEdit}
                        className="w-full h-9 sm:h-10 rounded-xl border border-[#f5c5ce] bg-[#EAF2FE] text-[#1B6FE8] text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-[#fce8ec] transition-colors">
                        <Pencil size={12} /> Edit All Fields
                      </button>

                      {/* Info grid */}
                      <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        {[
                          { Icon: Phone,     label: "Phone",   value: viewing.phone                      },
                          { Icon: Mail,      label: "Email",   value: viewing.email   || "Not provided"  },
                          { Icon: Building2, label: "Company", value: viewing.company                    },
                          { Icon: MapPin,    label: "State",   value: viewing.state   || "Not provided"  },
                          { Icon: Link2,     label: "Website", value: viewing.website || "Not provided", href: viewing.website ? websiteHref(viewing.website) : undefined },
                          { Icon: Briefcase, label: "Service", value: viewing.interestedService || "N/A" },
                          { Icon: Clock3,    label: "Status",  value: viewing.status                     },
                          { Icon: DollarSign, label: "Quotation", value: formatQuotedAmount(viewing.projectBudget) },
                          { Icon: DollarSign, label: "Upfront",   value: formatQuotedAmount(viewing.paidAmount) },
                        ].map(({ Icon, label, value, href }) => (
                          <div key={label} className="bg-[#F8F9FC] rounded-xl p-3">
                            <div className="flex items-center gap-1 mb-1">
                              <Icon size={11} className="text-[#1B6FE8]" />
                              <p className="text-gray-400 text-[10px]">{label}</p>
                            </div>
                            {label === "Email" ? (
                              <EmailWithExtraCell
                                email={viewing.email || ""}
                                allEmails={collectLeadEmails(viewing.email, viewing.contacts)}
                                variant="plain"
                                className="font-semibold text-[12px] sm:text-[13px]"
                                emptyLabel="Not provided"
                                clientName={viewing.name}
                                company={viewing.company !== "N/A" ? viewing.company : undefined}
                              />
                            ) : href ? (
                              <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1B6FE8] text-[12px] sm:text-[13px] break-words hover:underline">
                                {value}
                              </a>
                            ) : (
                              <h4 className="font-semibold text-[#0F172A] text-[12px] sm:text-[13px] break-words">{value}</h4>
                            )}
                          </div>
                        ))}
                      </div>

                      {(parseMoney(viewing.projectBudget) > 0 || parseMoney(viewing.paidAmount) > 0) && (
                        <div className="flex items-center gap-3 bg-[#F8F9FC] rounded-xl p-3">
                          <PaymentStatusCircle
                            percent={parseMoney(viewing.projectBudget) > 0
                              ? (parseMoney(viewing.paidAmount) / parseMoney(viewing.projectBudget)) * 100
                              : 0}
                          />
                          <div className="min-w-0">
                            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Payment progress</p>
                            <p className="text-[12px] sm:text-[13px] font-semibold text-[#0F172A] mt-0.5">
                              {formatQuotedAmount(viewing.paidAmount)} of {formatQuotedAmount(viewing.projectBudget)} upfront
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Latest note */}
                      {viewing.noteHistory.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                          <div className="flex items-center gap-1 mb-1.5">
                            <StickyNote size={11} className="text-amber-600" />
                            <p className="text-amber-600 text-[10px] font-semibold">Latest Note</p>
                          </div>
                          <p className="text-[#0F172A] text-[12px] sm:text-[13px] leading-relaxed">
                            <NoteRichText text={viewing.noteHistory[0].text} />
                          </p>
                          <p className="text-amber-400 text-[10px] mt-1.5">{fmtFull(viewing.noteHistory[0].createdAt)}</p>
                        </div>
                      )}

                      {/* Sub-contacts */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Users size={11} className="text-[#1B6FE8]" />Sub-Contacts
                          </p>
                          <button
                            onClick={() => setShowContactForm(v => !v)}
                            className="h-7 px-2.5 rounded-lg bg-[#1B6FE8]/10 text-[#1B6FE8] text-[10px] font-semibold flex items-center gap-1 hover:bg-[#1B6FE8]/20 transition-colors"
                          >
                            <Plus size={10} />{showContactForm ? "Cancel" : "Add Contact"}
                          </button>
                        </div>

                        {/* Add contact form */}
                        {showContactForm && (
                          <div className="bg-[#F8F9FC] rounded-xl p-3 mb-2 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5 block">Name *</label>
                                <input type="text" value={newContact.name} placeholder="John Smith"
                                  onChange={e => setNewContact(c => ({ ...c, name: e.target.value }))}
                                  className="w-full h-8 rounded-lg border border-gray-200 bg-white px-2.5 text-xs outline-none focus:border-[#1B6FE8] transition-colors"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5 block">Designation</label>
                                <input type="text" value={newContact.designation} placeholder="Manager"
                                  onChange={e => setNewContact(c => ({ ...c, designation: e.target.value }))}
                                  className="w-full h-8 rounded-lg border border-gray-200 bg-white px-2.5 text-xs outline-none focus:border-[#1B6FE8] transition-colors"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5 block">Contact</label>
                                <input type="text" value={newContact.phone} placeholder="+1 234 567"
                                  onChange={e => setNewContact(c => ({ ...c, phone: e.target.value }))}
                                  className="w-full h-8 rounded-lg border border-gray-200 bg-white px-2.5 text-xs outline-none focus:border-[#1B6FE8] transition-colors"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5 block">Email</label>
                                <input type="email" value={newContact.email} placeholder="email@co.com"
                                  onChange={e => setNewContact(c => ({ ...c, email: e.target.value }))}
                                  className="w-full h-8 rounded-lg border border-gray-200 bg-white px-2.5 text-xs outline-none focus:border-[#1B6FE8] transition-colors"
                                />
                              </div>
                            </div>
                            <button
                              onClick={addContact}
                              disabled={contactSaving || !newContact.name.trim()}
                              className="w-full h-8 rounded-lg bg-[#1B6FE8] text-white text-xs font-semibold hover:bg-[#a30f27] disabled:bg-gray-100 disabled:text-gray-400 transition-colors"
                            >
                              {contactSaving ? "Saving…" : "Add Contact"}
                            </button>
                          </div>
                        )}

                        {/* Contacts list */}
                        {viewing.contacts.length > 0 ? (
                          <div className="space-y-1.5">
                            {viewing.contacts.map(c => (
                              <div key={c.id} className="flex items-center gap-2 bg-[#F8F9FC] rounded-xl px-3 py-2.5">
                                <div className="w-7 h-7 rounded-full bg-[#1B6FE8]/10 text-[#1B6FE8] flex items-center justify-center text-[10px] font-bold shrink-0">
                                  {c.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[12px] font-semibold text-[#0F172A] truncate">{c.name}</span>
                                    {c.designation && (
                                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">{c.designation}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    {c.phone && <span className="text-[10px] text-gray-500">{c.phone}</span>}
                                    {c.email && <span className="text-[10px] text-gray-500">{c.email}</span>}
                                  </div>
                                </div>
                                <button
                                  onClick={() => removeContact(c.id)}
                                  disabled={removingContactId === c.id}
                                  className="w-6 h-6 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 flex items-center justify-center shrink-0 transition-colors disabled:opacity-50"
                                >
                                  <Trash2 size={10} />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : !showContactForm ? (
                          <p className="text-[11px] text-gray-400 italic py-2">No sub-contacts yet. Click + to add one.</p>
                        ) : null}
                      </div>
                    </>
                  )}

                  {/* ── EDIT MODE ── */}
                  {isEditing && (
                    <>
                      {/* All editable fields */}
                      <div className="bg-[#F8F9FC] rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-3">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                          <User2 size={11} className="text-[#1B6FE8]" />Contact Information
                        </p>
                        <div className="grid grid-cols-2 gap-2 sm:gap-3">
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Client Name</label>
                            <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                              className="w-full h-10 rounded-xl border-2 border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#1B6FE8] transition-colors"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Company Name</label>
                            <input type="text" value={editCompany} onChange={e => setEditCompany(e.target.value)}
                              placeholder="Company name"
                              className="w-full h-10 rounded-xl border-2 border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#1B6FE8] transition-colors placeholder:text-gray-300"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:gap-3">
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Phone</label>
                            <input type="text" value={editPhone} onChange={e => setEditPhone(e.target.value)}
                              placeholder="+1 234 567 890"
                              className="w-full h-10 rounded-xl border-2 border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#1B6FE8] transition-colors placeholder:text-gray-300"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Email</label>
                            <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)}
                              placeholder="email@company.com"
                              className="w-full h-10 rounded-xl border-2 border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#1B6FE8] transition-colors placeholder:text-gray-300"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:gap-3">
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">State</label>
                            <input type="text" value={editState} onChange={e => setEditState(e.target.value)}
                              placeholder="e.g. California"
                              className="w-full h-10 rounded-xl border-2 border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#1B6FE8] transition-colors placeholder:text-gray-300"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Website Link</label>
                            <input type="url" value={editWebsite} onChange={e => setEditWebsite(e.target.value)}
                              placeholder="https://example.com"
                              className="w-full h-10 rounded-xl border-2 border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#1B6FE8] transition-colors placeholder:text-gray-300"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                          <Briefcase size={10} className="text-[#1B6FE8]" />Service Type
                        </label>
                        <ServicePicker value={editService} onChange={v => setEditService(s => s === v ? "" : v)} />
                      </div>

                      <div className="bg-[#F8F9FC] rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-3">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                          <DollarSign size={10} className="text-[#1B6FE8]" />Quotation &amp; Upfront
                        </p>
                        <div className="grid grid-cols-2 gap-2 sm:gap-3">
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Quotation</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                              <input
                                type="text"
                                value={editQuotation.replace(/^\$/, "")}
                                placeholder="0.00"
                                onChange={e => setEditQuotation(e.target.value.replace(/[^0-9.]/g, ""))}
                                className="w-full h-10 rounded-xl border-2 border-gray-200 bg-white pl-6 pr-3 text-sm outline-none focus:border-[#1B6FE8] transition-colors"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Upfront Amount</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                              <input
                                type="text"
                                value={editUpfront.replace(/^\$/, "")}
                                placeholder="0.00"
                                onChange={e => setEditUpfront(e.target.value.replace(/[^0-9.]/g, ""))}
                                className="w-full h-10 rounded-xl border-2 border-gray-200 bg-white pl-6 pr-3 text-sm outline-none focus:border-[#1B6FE8] transition-colors"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                          <Clock3 size={10} className="text-[#1B6FE8]" />Status
                        </label>
                        <div className="flex flex-wrap gap-1.5 sm:gap-2">
                          {EDIT_STATUSES.map(s => (
                            <button key={s} onClick={() => setEditStatus(s)}
                              className={`h-8 sm:h-9 px-3 sm:px-4 rounded-lg sm:rounded-xl text-[11px] sm:text-[12px] font-semibold transition-all border ${
                                editStatus === s
                                  ? "bg-[#1B6FE8] text-white border-[#1B6FE8]"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-[#1B6FE8]/40"
                              }`}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                          <AlignLeft size={10} className="text-[#1B6FE8]" />Comments
                        </label>
                        <textarea value={editComments} onChange={e => setEditComments(e.target.value)} rows={3}
                          placeholder="Add comments..."
                          className="w-full rounded-xl sm:rounded-2xl border-2 border-gray-200 bg-[#FAFAFA] px-3 sm:px-4 py-2.5 text-xs sm:text-sm outline-none focus:border-[#1B6FE8] focus:bg-white transition-colors resize-none placeholder:text-gray-300"
                        />
                      </div>

                      <div className="flex gap-2 sm:gap-3 pb-1">
                        <button onClick={() => setIsEditing(false)}
                          className="flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl bg-[#F5F6FA] text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-colors">
                          Cancel
                        </button>
                        <button onClick={saveEdit} disabled={saving}
                          className={`flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all ${
                            !saving ? "bg-gradient-to-r from-[#1B6FE8] to-[#d4173a] shadow-md shadow-red-200" : "bg-gray-200 cursor-not-allowed text-gray-400"
                          }`}>
                          {saving
                            ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving...</>
                            : <><CheckCircle2 size={14} />Save Changes</>}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {historyLead && historyLead.phone && historyLead.phone !== "N/A" && (
          <ClientHistoryModal
            phone={historyLead.phone}
            clientName={historyLead.name}
            sourceClientId={historyLead.id}
            sourceClient={historyLead}
            editable
            onClose={() => setHistoryLead(null)}
            onProjectSaved={() => { void refetch(); }}
            onAddProject={() => {
              setAddProjectFor(historyLead);
              setHistoryLead(null);
            }}
          />
        )}

        {addProjectFor && (
          <ProjectWorkbenchModal
            open
            createMode
            mode="csr"
            sourceClientId={addProjectFor.id}
            saving={addProjectSaving}
            initial={{
              ...emptyWorkbench(),
              name: addProjectFor.name,
              company: addProjectFor.company === "N/A" ? "" : addProjectFor.company,
              phone: addProjectFor.phone === "N/A" ? "" : addProjectFor.phone,
              email: addProjectFor.email,
              state: addProjectFor.state,
              interestedService: addProjectFor.interestedService,
              projectCode: "",
            }}
            onClose={() => setAddProjectFor(null)}
            onSave={async (data: ProjectWorkbenchData) => {
              setAddProjectSaving(true);
              try {
                await API.post("/csr/project", {
                  sourceClientId: addProjectFor.id,
                  name: data.name.trim(),
                  company: data.company.trim() || undefined,
                  phone: data.phone.trim() || undefined,
                  email: data.email.trim() || undefined,
                  state: data.state.trim() || undefined,
                  ownerName: data.ownerName.trim() || undefined,
                  projectTitle: data.projectTitle.trim(),
                  projectCode: data.projectCode.trim() || undefined,
                  projectScope: data.projectScope.trim() || undefined,
                  interestedService: data.interestedService,
                  projectDeadline: data.projectDeadline,
                  projectBudget: data.projectBudget.trim() || undefined,
                  projectNotes: data.projectNotes?.trim() || undefined,
                  status: "Close Client",
                });
                toast.success("Project added — now in Active Projects");
                setAddProjectFor(null);
                invalidateAllCsrListCaches();
                void refetch(true);
              } catch (err) {
                toast.error(apiErrorMessage(err, "Failed to add project"));
              } finally {
                setAddProjectSaving(false);
              }
            }}
          />
        )}
      </main>
    </div>
  );
}
