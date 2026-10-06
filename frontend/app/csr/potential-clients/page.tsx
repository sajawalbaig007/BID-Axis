"use client";

import { useMemo, useState } from "react";
import {
  PhoneCall, CalendarDays, CircleAlert, Eye, Pencil, Search, Plus, Layers,
} from "lucide-react";

import TopNavbar from "../components/navigation/TopNavbar";
import LeadDetailModal from "../components/LeadDetailModal";
import CommentCell from "../components/shared/CommentCell";
import StackedHorizontalBarChart, { StackedBarRow } from "../components/shared/StackedHorizontalBarChart";
import Pagination from "../components/shared/Pagination";
import { CsrColGroup, CSR_TABLE_CLASS, CSR_THEAD, CSR_TH, CSR_TD, CSR_TD_TOP, CSR_TD_POPOVER, COL_7_IMPORTANT_SUB, COL_9_SCHEDULE, COL_8_INTERESTED_SUB, CSR_TABLE_CARD, CSR_TABLE_WRAP, CSR_PAGE_MAIN, matchesLeadSearch } from "../components/shared/csrTableStyles";
import EditClientModal, { EditAction } from "../components/modals/EditClientModal";
import AddLeadModal from "../components/modals/AddLeadModal";
import { matchesStateLocationFilter, matchesPhoneAreaCodeFilter } from "@/lib/stateLocationFilter";
import StateFilterDropdown from "../components/shared/StateFilterDropdown";
import PhoneAreaCodeFilterInput from "../components/shared/PhoneAreaCodeFilterInput";
import MonthRangeFilter from "../components/shared/MonthRangeFilter";
import ClientNameCell from "../components/shared/ClientNameCell";
import PhoneWithTzCell from "../components/shared/PhoneWithTzCell";
import InterestedServicesCell from "../components/shared/InterestedServicesCell";
import InterestedModal from "../components/modals/InterestedModal";
import { clientCompany, ourCompany } from "../utils/leadFieldLabels";
import { sortByOldestNote } from "../utils/sortByOldestNote";
import ClientSortControls from "../components/shared/ClientSortControls";
import type { SortDir } from "../utils/clientListSort";
import { collectLeadPhones } from "../utils/parsePhones";
import { requireLeadDial } from "../components/dialer/dialUnlock";
import {
  decomposeInterestedServices,
  formatInterestedServices,
} from "../utils/parseInterestedServices";
import toast from "react-hot-toast";

import { useCsrStats, usePotentialLeads } from "../hooks/useCsrTabPage";
import { useLeadActions } from "../hooks/useLeadActions";
import { useOpenLeadFromQuery } from "../hooks/useOpenLeadFromQuery";
import { useQueryTab } from "../hooks/useQueryTab";
import { invalidateAllCsrListCaches } from "@/lib/csrApiCache";
import API from "@/lib/api";
import CapsuleTabs from "@/app/components/CapsuleTabs";
import { usTimezones } from "../constants/timezones";
import { PAGE_SIZE, TODAY_STR } from "../constants";
import { Lead } from "../types/lead";
import { isWonClientStatus } from "../constants/leadStatuses";
import {
  isImportantOnly,
  isScheduledCall,
  isInterestedLead,
  matchesPotentialTab,
  type PotentialTab,
} from "../utils/potentialClientBuckets";
import { uniqueLeadsByPhone } from "../utils/uniqueLeadsByPhone";

const POTENTIAL_TABS = ["all", "important", "schedule", "interested"] as const;

const getTzAbbr = (tzValue: string) => {
  const found = usTimezones.find(tz => tz.value === tzValue);
  return found ? found.abbreviation : (tzValue.split("/").pop() ?? tzValue);
};

function leadCurrentMoveStatus(lead: Lead): string {
  if (isInterestedLead(lead)) return "interested";
  if (isScheduledCall(lead)) return "schedule call";
  if (isImportantOnly(lead)) return "important";
  return (lead.status ?? "").toLowerCase();
}

function potentialRowMeta(lead: Lead): { subtitle: string; label: string; badge: string } {
  if (isScheduledCall(lead)) {
    return { subtitle: "Scheduled Call", label: "Schedule Call", badge: "bg-[#EAF5FF] text-[#0B84F3]" };
  }
  if (isInterestedLead(lead)) {
    return { subtitle: "Interested Lead", label: "Interested", badge: "bg-[#ECFDF5] text-[#065F46]" };
  }
  return { subtitle: "Important Lead", label: "Important", badge: "bg-[#EAF2FE] text-[#1B6FE8]" };
}

export default function ImportantCallsPage() {
  const { stats: serverStats, refetch: refetchStats } = useCsrStats();
  const { leads, setLeads, loading, refetch } = usePotentialLeads();
  const { updateLead, addNote, onNoteUpdated, onNoteDeleted } = useLeadActions(setLeads);

  const [activeTab, setActiveTab] = useState<PotentialTab>("important");
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDate,  setFilterDate]  = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [phoneFilter, setPhoneFilter] = useState("");
  const [monthFrom, setMonthFrom] = useState("");
  const [monthTo, setMonthTo] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingLead,   setEditingLead]   = useState<Lead | null>(null);
  const [editAction,    setEditAction]    = useState<EditAction>(null);

  const [viewingLead, setViewingLead] = useState<Lead | null>(null);
  const [showAddLead, setShowAddLead] = useState(false);

  useQueryTab(POTENTIAL_TABS, "important", setActiveTab, !loading);
  useOpenLeadFromQuery(leads, setViewingLead, !loading);

  const [scheduleDate,     setScheduleDate]     = useState("");
  const [scheduleTime,     setScheduleTime]     = useState("");
  const [selectedTimezone, setSelectedTimezone] = useState("America/New_York");
  const [projectCode,      setProjectCode]      = useState("");
  const [projectTitle,     setProjectTitle]     = useState("");
  const [projectDeadline,  setProjectDeadline]  = useState("");
  const [projectBudget,    setProjectBudget]    = useState("");
  const [paidAmount,       setPaidAmount]       = useState("");
  const [projectNotes,     setProjectNotes]     = useState("");
  const [projectService,   setProjectService]   = useState("");
  const [email,            setEmail]            = useState("");

  const [scopeLead, setScopeLead] = useState<Lead | null>(null);
  const [scopeServices, setScopeServices] = useState<string[]>([]);
  const [scopeSubtypes, setScopeSubtypes] = useState<Record<string, string>>({});
  const [pendingImportantId, setPendingImportantId] = useState<string | null>(null);

  /* ── Derived (unique-by-phone so pills match the table) ── */
  const uniqueImportant  = useMemo(() => uniqueLeadsByPhone(leads.filter(l => isImportantOnly(l))), [leads]);
  const uniqueScheduled  = useMemo(() => uniqueLeadsByPhone(leads.filter(l => isScheduledCall(l))), [leads]);
  const uniqueInterested = useMemo(() => uniqueLeadsByPhone(leads.filter(l => isInterestedLead(l))), [leads]);
  const uniqueAll        = useMemo(
    () => uniqueLeadsByPhone([...uniqueImportant, ...uniqueScheduled, ...uniqueInterested]),
    [uniqueImportant, uniqueScheduled, uniqueInterested],
  );

  const stats = useMemo(() => ({
    allCount:           uniqueAll.length,
    importantOnlyCount: uniqueImportant.length,
    scheduledCount:     uniqueScheduled.length,
    interestedCount:    uniqueInterested.length,
    projectWonCount:    serverStats?.projectWonCount    ?? leads.filter(l => isWonClientStatus(l.status)).length,
    callsTodayCount:    uniqueScheduled.filter(l => l.nextSchedule === TODAY_STR).length,
  }), [leads, serverStats, uniqueAll, uniqueImportant, uniqueScheduled, uniqueInterested]);

  const interestedWithService = useMemo(
    () => uniqueInterested.filter(l => l.interestedService).length,
    [uniqueInterested],
  );

  const chartRows = useMemo<StackedBarRow[]>(() => [
    {
      label: "Schedule Call",
      segments: [
        { label: "Today",  value: stats.callsTodayCount,                         color: "#1B6FE8" },
        { label: "Later",  value: stats.scheduledCount - stats.callsTodayCount, color: "#F59E0B" },
      ],
    },
    {
      label: "Important",
      segments: [
        { label: "Flagged", value: stats.importantOnlyCount, color: "#DC2626" },
      ],
    },
    {
      label: "Interested",
      segments: [
        { label: "With Service", value: interestedWithService,                        color: "#15803D" },
        { label: "No Service",   value: stats.interestedCount - interestedWithService, color: "#94A3B8" },
      ],
    },
    {
      label: "Close Client",
      segments: [
        { label: "Won Deals", value: stats.projectWonCount, color: "#1D4ED8" },
      ],
    },
  ], [stats, interestedWithService]);

  const filteredCalls = useMemo(() => {
    const inMonth = (iso: string) => {
      if (!monthFrom && !monthTo) return true;
      const d = iso.slice(0, 7);
      if (monthFrom && d < monthFrom) return false;
      if (monthTo && d > monthTo) return false;
      return true;
    };
    const source =
      activeTab === "all"        ? uniqueAll
      : activeTab === "important"  ? uniqueImportant
      : activeTab === "schedule"   ? uniqueScheduled
      : uniqueInterested;
    const list = source.filter(lead => {
        const matchesTab    = matchesPotentialTab(lead, activeTab);
        const matchesSearch = matchesLeadSearch(searchQuery, {
          name: lead.client,
          company: [clientCompany(lead), ourCompany(lead), lead.rawCompany].filter(Boolean).join(" "),
          phone: lead.phone,
          email: lead.email,
          service: lead.interestedService,
          state: lead.state,
        });
        const matchesState  = matchesStateLocationFilter(lead.state, lead.phone, stateFilter);
        const matchesPhone  = matchesPhoneAreaCodeFilter(lead.phone, phoneFilter);
        const matchesDate   = activeTab !== "schedule" || !filterDate || lead.nextSchedule === filterDate;
        const matchesMonth  = inMonth(lead.statusUpdatedAt || "");
        return matchesTab && matchesSearch && matchesState && matchesPhone && matchesDate && matchesMonth;
      });
    const sorted = sortByOldestNote(list);
    return sortDir === "desc" ? [...sorted].reverse() : sorted;
  }, [uniqueAll, uniqueImportant, uniqueScheduled, uniqueInterested, activeTab, searchQuery, filterDate, monthFrom, monthTo, stateFilter, phoneFilter, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredCalls.length / PAGE_SIZE));
  const paginated  = filteredCalls.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* ── Edit modal helpers ── */
  const openEditModal = (lead: Lead) => {
    setEditingLead(lead); setEditAction(null);
    setScheduleDate(""); setScheduleTime("");
    setSelectedTimezone(lead.timezone || "America/New_York");
    setProjectCode(""); setProjectTitle(lead.company !== "N/A" ? lead.company : lead.client);
    setProjectDeadline(""); setProjectBudget(""); setPaidAmount(""); setProjectNotes(""); setProjectService("");
    setEmail(lead.email !== "N/A" ? lead.email : "");
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false); setEditingLead(null); setEditAction(null);
    setScheduleDate(""); setScheduleTime("");
    setProjectCode(""); setProjectTitle(""); setProjectDeadline(""); setProjectBudget(""); setPaidAmount(""); setProjectNotes(""); setProjectService("");
    setEmail("");
  };

  const saveReschedule = async () => {
    if (!scheduleDate || !scheduleTime || !editingLead) return;
    try {
      await updateLead(editingLead.id, {
        status: "important",
        nextSchedule: scheduleDate,
        nextTime: scheduleTime,
        timezone: selectedTimezone,
        ...(email.trim() && email.trim().toLowerCase() !== "n/a" ? { email: email.trim() } : {}),
      });
      setLeads(prev => prev.filter(l => l.id !== editingLead.id));
      void refetchStats();
      void refetch();
      closeEditModal();
    } catch (err) { console.log(err); }
  };

  const saveProjectWon = async () => {
    if (!projectTitle || !projectDeadline || !projectService || !paidAmount || !editingLead) return;
    try {
      const id = editingLead.id;
      await updateLead(id, {
        status: "Close Client",
        projectCode,
        projectTitle,
        projectDeadline,
        projectBudget,
        paidAmount,
        projectNotes,
        interestedService: projectService,
        ...(email.trim() && email.trim().toLowerCase() !== "n/a" ? { email: email.trim() } : {}),
      });
      setLeads(prev => prev.filter(l => l.id !== id));
      void refetchStats();
      void refetch();
      closeEditModal();
    } catch (err) { console.log(err); }
  };

  const moveToBin = async () => {
    if (!editingLead) return;
    try {
      await API.put(`/csr/lead/${editingLead.id}`, { moveToBin: true });
      invalidateAllCsrListCaches();
      setLeads(prev => prev.filter(l => l.id !== editingLead.id));
      closeEditModal();
    } catch (err) { console.log(err); }
  };

  const projectWonValid = projectTitle.trim() !== "" && projectDeadline !== "" && projectService !== "" && paidAmount.trim() !== "";

  const openScopeEditor = (lead: Lead) => {
    const { services, subtypes } = decomposeInterestedServices(lead.interestedService);
    setScopeLead(lead);
    setScopeServices(services);
    setScopeSubtypes(subtypes);
  };

  const closeScopeEditor = () => {
    setScopeLead(null);
    setScopeServices([]);
    setScopeSubtypes({});
    setPendingImportantId(null);
  };

  const saveScope = async () => {
    if (!scopeLead || scopeServices.length === 0) return;
    const interestedService = formatInterestedServices(scopeServices, scopeSubtypes);
    try {
      if (pendingImportantId && scopeLead.id === pendingImportantId) {
        const stayingImportant = isImportantOnly(scopeLead);
        await updateLead(pendingImportantId, {
          status: "important",
          interestedService,
          nextSchedule: "",
          nextTime: "",
        });
        if (stayingImportant) {
          setLeads(prev => prev.map(l =>
            l.id === pendingImportantId ? { ...l, interestedService, status: "important" } : l
          ));
          toast.success("Updated as Important.");
        } else {
          setLeads(prev => prev.filter(l => l.id !== pendingImportantId));
          toast.success("Marked as Important.");
        }
        void refetchStats();
        void refetch();
      } else {
        await updateLead(scopeLead.id, { interestedService });
        setLeads(prev => prev.map(l =>
          l.id === scopeLead.id ? { ...l, interestedService } : l
        ));
        toast.success("Scope updated.");
      }
      closeScopeEditor();
    } catch (err) {
      console.log(err);
      toast.error("Could not update scope.");
    }
  };

  const movePipelineStatus = async (id: string, status: string) => {
    if (!status) return;
    if (!requireLeadDial(id)) return;
    const lead = leads.find(l => l.id === id);
    if (!lead) return;
    const sameBucket = leadCurrentMoveStatus(lead).toLowerCase() === status.toLowerCase();
    try {
      if (status === "schedule call") {
        openEditModal(lead);
        setEditAction("reschedule");
        return;
      }
      if (status === "Close Client") {
        openEditModal(lead);
        setEditAction("closeclient");
        return;
      }
      if (status === "interested") {
        await updateLead(id, { status: "interested", interestedService: lead.interestedService || "General" });
        if (sameBucket) {
          toast.success("Marked as Interested again.");
          void refetchStats();
          return;
        }
      } else if (status === "important") {
        closeEditModal();
        setPendingImportantId(id);
        openScopeEditor(lead);
        return;
      } else {
        await updateLead(id, { status });
        if (sameBucket) {
          toast.success(`Status updated to "${status}".`);
          void refetchStats();
          return;
        }
      }
      setLeads(prev => prev.filter(l => l.id !== id));
      void refetchStats();
      void refetch();
      closeEditModal();
      toast.success(`Moved to ${status}.`);
    } catch (err) { console.log(err); }
  };

  return (
    <div className="min-h-screen bg-[#F5F6FA] dark:bg-crm-bg">
      <TopNavbar />
      <main className={CSR_PAGE_MAIN}>

        {/* ── HEADER ── */}
        <div className="mt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-[28px] lg:text-[34px] font-bold text-[#0F172A] dark:text-gray-100 leading-tight">
              Potential Clients
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 sm:mt-2 text-xs sm:text-sm">
              Manage important, scheduled, and interested clients — sort notes ascending or descending.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MonthRangeFilter
              from={monthFrom}
              to={monthTo}
              onFromChange={v => { setMonthFrom(v); setPage(1); }}
              onToChange={v => { setMonthTo(v); setPage(1); }}
              onClear={() => { setMonthFrom(""); setMonthTo(""); setPage(1); }}
            />
            <button
              onClick={() => setShowAddLead(true)}
              className="flex items-center justify-center gap-2 h-10 sm:h-11 px-4 sm:px-5 rounded-xl sm:rounded-2xl bg-[#1B6FE8] text-white text-xs sm:text-sm font-semibold shadow-md shadow-red-200 hover:bg-[#a30f27] w-full sm:w-auto shrink-0"
            >
              <Plus size={16} /> Add Lead
            </button>
          </div>
        </div>

        {/* ── VERTICAL BAR CHART ── */}
        <div className="mt-4 sm:mt-7">
          <StackedHorizontalBarChart
            title="Pipeline by stage and type"
            subtitle="Schedule calls (today vs later), important-only clients, interested clients, and closed deals."
            rows={chartRows}
            loading={loading}
          />
        </div>

        {/* ── TAB BUTTONS ── */}
        <CapsuleTabs
          stretch
          className="mt-4 sm:mt-7"
          activeKey={activeTab}
          onChange={key => { setActiveTab(key as PotentialTab); setSearchQuery(""); setFilterDate(""); setPage(1); }}
          tabs={[
            { key: "all",        label: "All",                count: activeTab === "all"        ? filteredCalls.length : stats.allCount,           icon: Layers       },
            { key: "important",  label: "Important Calls",    count: activeTab === "important"  ? filteredCalls.length : stats.importantOnlyCount, icon: CircleAlert  },
            { key: "schedule",   label: "Schedule Call",      count: activeTab === "schedule"   ? filteredCalls.length : stats.scheduledCount,     icon: CalendarDays },
            { key: "interested", label: "Interested Clients", count: activeTab === "interested" ? filteredCalls.length : stats.interestedCount,    icon: PhoneCall    },
          ]}
        />

        <div className="grid w-full gap-2 grid-cols-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] mt-3 sm:mt-4">
          <StateFilterDropdown fullWidth value={stateFilter} onChange={v => { setStateFilter(v); setPage(1); }} />
          <PhoneAreaCodeFilterInput fullWidth value={phoneFilter} onChange={v => { setPhoneFilter(v); setPage(1); }} />
          <ClientSortControls
            sortBy="oldestNote"
            sortDir={sortDir}
            onSortBy={() => {}}
            onSortDir={v => { setSortDir(v); setPage(1); }}
            dirOnly
            dirLabel="Notes"
          />
        </div>

        {/* ══ ALL + IMPORTANT TABLE ══ */}
        {(activeTab === "all" || activeTab === "important") && (
          <div className={CSR_TABLE_CARD}>
            <div className="p-4 sm:p-5 lg:p-6 border-b border-[#F3F3F3]">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div>
                  <h3 className="text-lg sm:text-[22px] font-bold text-[#0F172A]">
                    {activeTab === "all" ? "All Potential Clients" : "Important Calls"}
                  </h3>
                  <p className="text-gray-500 text-xs sm:text-sm mt-0.5 sm:mt-1">
                    {activeTab === "all"
                      ? "Important, scheduled, and interested clients."
                      : "Clients marked important without a scheduled meeting."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[160px] sm:flex-none sm:w-[220px] lg:w-[260px]">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 sm:w-[14px] sm:h-[14px]" />
                    <input
                      type="text" placeholder="Search name, phone, company..."
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                      className="w-full h-9 sm:h-[40px] rounded-xl sm:rounded-2xl border border-gray-200 bg-[#FAFAFA] pl-8 sm:pl-9 pr-3 text-xs sm:text-[13px] outline-none focus:border-[#1B6FE8]"
                    />
                  </div>
                  <div className="bg-[#EAF2FE] text-[#1B6FE8] text-[11px] sm:text-sm font-semibold px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl whitespace-nowrap">
                    {filteredCalls.length} Leads
                  </div>
                </div>
              </div>
            </div>

            <div className={CSR_TABLE_WRAP}>
              <table className={CSR_TABLE_CLASS}>
                <CsrColGroup widths={COL_7_IMPORTANT_SUB} />
                <thead className={CSR_THEAD}>
                  <tr>
                    <th className={CSR_TH}>Client Name</th>
                    <th className={CSR_TH}>Phone</th>
                    <th className={CSR_TH}>Interested In</th>
                    <th className={CSR_TH}>Notes</th>
                    <th className={CSR_TH}>Status</th>
                    <th className={CSR_TH}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [1,2,3].map(i => (
                      <tr key={i} className="border-b border-[#F7F7F7]">
                        {[1,2,3,4,5,6].map(j => (
                          <td key={j} className={CSR_TD}>
                            <div className="h-3.5 sm:h-4 bg-gray-100 rounded animate-pulse w-16 sm:w-20" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filteredCalls.length > 0 ? paginated.map(lead => {
                    const meta = potentialRowMeta(lead);
                    return (
                    <tr key={lead.id} className="border-b border-[#F7F7F7] hover:bg-[#FFF8F9] transition-all">
                      <td className={CSR_TD_POPOVER}>
                        <ClientNameCell lead={lead} subtitle={meta.subtitle} />
                      </td>
                      <td className={CSR_TD_POPOVER}>
                        {(() => {
                          const phones = collectLeadPhones(lead.phone, lead.subContacts);
                          return (
                            <PhoneWithTzCell
                              phone={phones[0] ?? lead.phone}
                              allPhones={phones}
                              variant="pill"
                              dial={{ leadId: lead.id, clientName: lead.company || lead.client }}
                            />
                          );
                        })()}
                      </td>
                      <td className={CSR_TD}>
                        <InterestedServicesCell
                          interestedService={lead.interestedService}
                          onEdit={() => openScopeEditor(lead)}
                        />
                      </td>
                      <td className={CSR_TD_TOP}>
                        <CommentCell id={lead.id} noteHistory={lead.noteHistory} noteCount={lead.noteCount} comment={lead.comments?.trim() || undefined} onAddNote={addNote} onNoteUpdated={onNoteUpdated} onNoteDeleted={onNoteDeleted} />
                      </td>
                      <td className={CSR_TD}>
                        <span className={`px-2 py-1 rounded-xl text-[10px] sm:text-[11px] font-semibold whitespace-nowrap ${meta.badge}`}>{meta.label}</span>
                        {isScheduledCall(lead) && lead.nextSchedule ? (
                          <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                            {lead.nextSchedule === TODAY_STR ? "Today" : lead.nextSchedule}
                            {lead.nextTime ? ` · ${lead.nextTime}` : ""}
                          </p>
                        ) : null}
                      </td>
                      <td className={CSR_TD}>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <button onClick={() => setViewingLead(lead)} className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center shrink-0" title="View">
                            <Eye size={14} />
                          </button>
                          <button onClick={() => openEditModal(lead)} className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#1B6FE8] text-white hover:bg-[#a30f27] flex items-center justify-center shrink-0" title="Edit">
                            <Pencil size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={6} className="py-16 sm:py-20 text-center">
                        <Search size={24} className="text-gray-200 mx-auto mb-2 sm:mb-3 sm:w-7 sm:h-7" />
                        <p className="text-gray-400 text-xs sm:text-sm">
                          {activeTab === "all" ? "No potential clients found." : "No important clients found."}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <Pagination page={page} totalPages={totalPages} total={filteredCalls.length} pageSize={PAGE_SIZE} onPage={setPage} />
            </div>
          </div>
        )}

        {/* ══ SCHEDULE CALL TABLE ══ */}
        {activeTab === "schedule" && (
          <div className={CSR_TABLE_CARD}>
            <div className="p-4 sm:p-5 lg:p-6 border-b border-[#F3F3F3]">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div>
                  <h3 className="text-lg sm:text-[22px] font-bold text-[#0F172A]">Schedule Call</h3>
                  <p className="text-gray-500 text-xs sm:text-sm mt-0.5 sm:mt-1">Clients with scheduled follow-up meetings.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[160px] sm:flex-none sm:w-[220px] lg:w-[260px]">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 sm:w-[14px] sm:h-[14px]" />
                    <input
                      type="text" placeholder="Search name, phone, company..."
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                      className="w-full h-9 sm:h-[40px] rounded-xl sm:rounded-2xl border border-gray-200 bg-[#FAFAFA] pl-8 sm:pl-9 pr-3 text-xs sm:text-[13px] outline-none focus:border-[#1B6FE8]"
                    />
                  </div>
                  <input
                    type="date" value={filterDate}
                    onChange={e => { setFilterDate(e.target.value); setPage(1); }}
                    className="h-9 sm:h-[40px] rounded-xl sm:rounded-2xl border border-gray-200 bg-[#FAFAFA] px-2.5 sm:px-4 text-xs sm:text-[13px] outline-none focus:border-[#1B6FE8]"
                  />
                  {filterDate && (
                    <button onClick={() => setFilterDate("")}
                      className="h-9 sm:h-[40px] px-3 sm:px-4 rounded-xl sm:rounded-2xl border border-gray-200 bg-[#FAFAFA] text-xs sm:text-[13px] text-gray-500 hover:text-[#1B6FE8] transition-all">
                      Clear
                    </button>
                  )}
                  <div className="bg-[#EAF2FE] text-[#1B6FE8] text-[11px] sm:text-sm font-semibold px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl whitespace-nowrap">
                    {filteredCalls.length} Leads
                  </div>
                </div>
              </div>
            </div>

            <div className={CSR_TABLE_WRAP}>
              <table className={CSR_TABLE_CLASS}>
                <CsrColGroup widths={COL_9_SCHEDULE} />
                <thead className={CSR_THEAD}>
                  <tr>
                    {["Client Name","Phone","Schedule","Notes","Status","Action"].map(h => (
                      <th key={h} className={CSR_TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [1,2,3].map(i => (
                      <tr key={i} className="border-b border-[#F7F7F7]">
                        {[1,2,3,4,5,6].map(j => (
                          <td key={j} className={CSR_TD}>
                            <div className="h-3.5 sm:h-4 bg-gray-100 rounded animate-pulse w-16 sm:w-20" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filteredCalls.length > 0 ? paginated.map(lead => (
                    <tr key={lead.id} className="border-b border-[#F7F7F7] hover:bg-[#FFF8F9] transition-all">
                      <td className={CSR_TD_POPOVER}>
                        <ClientNameCell lead={lead} subtitle="Scheduled Call" />
                      </td>
                      <td className={CSR_TD_POPOVER}>
                        {(() => {
                          const phones = collectLeadPhones(lead.phone, lead.subContacts);
                          return (
                            <PhoneWithTzCell
                              phone={phones[0] ?? lead.phone}
                              allPhones={phones}
                              variant="pill"
                              dial={{ leadId: lead.id, clientName: lead.company || lead.client }}
                            />
                          );
                        })()}
                      </td>
                      <td className={CSR_TD}>
                        <div className="min-w-0">
                          {lead.nextSchedule ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] sm:text-[11px] font-semibold max-w-full ${
                              lead.nextSchedule === TODAY_STR ? "bg-[#EAF5FF] text-[#0B84F3]" : "bg-[#F5F6FA] text-gray-600"
                            }`}>
                              <CalendarDays size={11} className="shrink-0" />
                              <span className="truncate">{lead.nextSchedule === TODAY_STR ? "Today" : lead.nextSchedule}</span>
                            </span>
                          ) : <span className="text-gray-300 text-sm">—</span>}
                          <p className="text-[11px] sm:text-[12px] font-semibold text-[#0F172A] mt-0.5 truncate">
                            {lead.nextTime || "—"}
                            {lead.timezone ? (
                              <span className="text-[10px] font-normal text-gray-400 ml-1">{getTzAbbr(lead.timezone)}</span>
                            ) : null}
                          </p>
                        </div>
                      </td>
                      <td className={CSR_TD_TOP}>
                        <CommentCell id={lead.id} noteHistory={lead.noteHistory} noteCount={lead.noteCount} comment={lead.comments?.trim() || undefined} onAddNote={addNote} onNoteUpdated={onNoteUpdated} onNoteDeleted={onNoteDeleted} />
                      </td>
                      <td className={CSR_TD}>
                        <div className="px-2 py-1 rounded-xl text-[10px] sm:text-[11px] font-semibold w-fit whitespace-nowrap bg-[#EAF5FF] text-[#0B84F3]">
                          Schedule Call
                        </div>
                      </td>
                      <td className={CSR_TD}>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => setViewingLead(lead)}
                            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#EAF5FF] text-[#0B84F3] flex items-center justify-center hover:opacity-80 transition-opacity shrink-0"
                          >
                            <Eye size={13} className="sm:w-[15px] sm:h-[15px]" />
                          </button>
                          <button
                            onClick={() => openEditModal(lead)}
                            className="h-8 sm:h-9 px-2 sm:px-3 rounded-xl bg-[#EAF2FE] text-[#1B6FE8] text-xs font-semibold flex items-center gap-1 hover:bg-[#1B6FE8] hover:text-white transition-all whitespace-nowrap shrink-0"
                          >
                            <Pencil size={12} className="sm:w-[14px] sm:h-[14px]" />
                            <span className="hidden sm:inline">Edit</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="py-16 sm:py-20 text-center">
                        <Search size={24} className="text-gray-200 mx-auto mb-2 sm:mb-3 sm:w-7 sm:h-7" />
                        <p className="text-gray-400 text-xs sm:text-sm">No scheduled calls found.</p>
                        {(searchQuery || filterDate) && (
                          <button onClick={() => { setSearchQuery(""); setFilterDate(""); }}
                            className="mt-2 sm:mt-3 text-[#1B6FE8] text-xs sm:text-sm font-semibold hover:underline">
                            Clear filters
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <Pagination
                page={page}
                totalPages={totalPages}
                total={filteredCalls.length}
                pageSize={PAGE_SIZE}
                onPage={setPage}
              />
            </div>
          </div>
        )}

        {/* ══ INTERESTED TABLE ══ */}
        {activeTab === "interested" && (
          <div className={CSR_TABLE_CARD}>
            <div className="p-4 sm:p-5 lg:p-6 border-b border-[#F3F3F3]">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div>
                  <h3 className="text-lg sm:text-[22px] font-bold text-[#0F172A]">Interested Clients</h3>
                  <p className="text-gray-500 text-xs sm:text-sm mt-0.5 sm:mt-1">Clients who have shown interest in our services.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[160px] sm:flex-none sm:w-[220px] lg:w-[260px]">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 sm:w-[14px] sm:h-[14px]" />
                    <input
                      type="text"
                      placeholder="Search name, phone, company..."
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                      className="w-full h-9 sm:h-[40px] rounded-xl sm:rounded-2xl border border-gray-200 bg-[#FAFAFA] pl-8 sm:pl-9 pr-3 text-xs sm:text-[13px] outline-none focus:border-[#1B6FE8]"
                    />
                  </div>
                  {searchQuery && (
                    <button
                      onClick={() => { setSearchQuery(""); setPage(1); }}
                      className="h-9 sm:h-[40px] px-3 sm:px-4 rounded-xl sm:rounded-2xl border border-gray-200 bg-[#FAFAFA] text-xs sm:text-[13px] text-gray-500 hover:text-[#1B6FE8] transition-all"
                    >
                      Clear
                    </button>
                  )}
                  <div className="bg-[#EAF2FE] text-[#1B6FE8] text-[11px] sm:text-sm font-semibold px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl whitespace-nowrap">
                    {filteredCalls.length} Leads
                  </div>
                </div>
              </div>
            </div>

            <div className={CSR_TABLE_WRAP}>
              <table className={CSR_TABLE_CLASS}>
                <CsrColGroup widths={COL_8_INTERESTED_SUB} />
                <thead className={CSR_THEAD}>
                  <tr>
                    <th className={CSR_TH}>Client Name</th>
                    <th className={CSR_TH}>Phone</th>
                    <th className={CSR_TH}>Interested In</th>
                    <th className={CSR_TH}>Notes</th>
                    <th className={CSR_TH}>Status</th>
                    <th className={CSR_TH}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [1,2,3].map(i => (
                      <tr key={i} className="border-b border-[#F7F7F7]">
                        {[1,2,3,4,5,6].map(j => (
                          <td key={j} className={CSR_TD}>
                            <div className="h-3.5 sm:h-4 bg-gray-100 rounded animate-pulse w-16 sm:w-20" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filteredCalls.length > 0 ? paginated.map(lead => (
                    <tr key={lead.id} className="border-b border-[#F7F7F7] hover:bg-[#FFF8F9] transition-all">
                      <td className={CSR_TD_POPOVER}>
                        <ClientNameCell lead={lead} subtitle="Interested Lead" />
                      </td>
                      <td className={CSR_TD_POPOVER}>
                        {(() => {
                          const phones = collectLeadPhones(lead.phone, lead.subContacts);
                          return (
                            <PhoneWithTzCell
                              phone={phones[0] ?? lead.phone}
                              allPhones={phones}
                              variant="pill"
                              className="px-2 sm:px-3 py-1 sm:py-1.5"
                              dial={{ leadId: lead.id, clientName: lead.company || lead.client }}
                            />
                          );
                        })()}
                      </td>
                      <td className={CSR_TD}>
                        <InterestedServicesCell
                          interestedService={lead.interestedService}
                          onEdit={() => openScopeEditor(lead)}
                        />
                      </td>
                      <td className={CSR_TD_TOP}>
                        <CommentCell id={lead.id} noteHistory={lead.noteHistory} noteCount={lead.noteCount} comment={lead.comments?.trim() || undefined} onAddNote={addNote} onNoteUpdated={onNoteUpdated} onNoteDeleted={onNoteDeleted} />
                      </td>
                      <td className={CSR_TD}>
                        <div className="bg-[#EAF2FE] text-[#1B6FE8] px-2 py-1 rounded-xl text-[10px] sm:text-[11px] font-semibold w-fit whitespace-nowrap">
                          Interested
                        </div>
                      </td>
                      <td className={CSR_TD}>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => setViewingLead(lead)}
                            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#EAF5FF] text-[#0B84F3] flex items-center justify-center hover:opacity-80 transition-opacity shrink-0"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            onClick={() => openEditModal(lead)}
                            className="h-8 sm:h-9 px-2 sm:px-3 rounded-xl bg-[#EAF2FE] text-[#1B6FE8] text-xs font-semibold flex items-center gap-1 hover:bg-[#1B6FE8] hover:text-white transition-all whitespace-nowrap shrink-0"
                          >
                            <Pencil size={12} />
                            <span className="hidden sm:inline">Edit</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="py-16 sm:py-20 text-center text-gray-400 text-xs sm:text-sm">
                        {searchQuery ? "No leads match your search." : "No interested clients found."}
                        {searchQuery && (
                          <button onClick={() => setSearchQuery("")}
                            className="block mx-auto mt-2 text-[#1B6FE8] font-semibold hover:underline">
                            Clear search
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <Pagination
                page={page}
                totalPages={totalPages}
                total={filteredCalls.length}
                pageSize={PAGE_SIZE}
                onPage={setPage}
              />
            </div>
          </div>
        )}

        {/* ── EDIT INTERESTED SCOPE ── */}
        {scopeLead && (
          <InterestedModal
            mode={pendingImportantId ? "create" : "edit"}
            variant={pendingImportantId ? "important" : "interested"}
            services={scopeServices}
            onServicesChange={setScopeServices}
            serviceSubtypes={scopeSubtypes}
            onServiceSubtypesChange={setScopeSubtypes}
            onClose={closeScopeEditor}
            onSave={() => void saveScope()}
          />
        )}

        {/* ── EDIT MODAL ── */}
        {showEditModal && editingLead && (
          <EditClientModal
            client={editingLead.client}
            clientCompany={clientCompany(editingLead)}
            ourCompany={ourCompany(editingLead)}
            phone={editingLead.phone}
            company={editingLead.company}
            email={email} onEmailChange={setEmail}
            editAction={editAction}
            onSelectAction={setEditAction}
            onClose={closeEditModal}
            onMoveTo={s => void movePipelineStatus(editingLead.id, s)}
            currentMoveStatus={leadCurrentMoveStatus(editingLead)}
            scheduleDate={scheduleDate}    onScheduleDateChange={setScheduleDate}
            scheduleTime={scheduleTime}    onScheduleTimeChange={setScheduleTime}
            timezone={selectedTimezone}    onTimezoneChange={setSelectedTimezone}
            onSaveReschedule={saveReschedule}
            projectCode={projectCode}      onProjectCodeChange={setProjectCode}
            projectTitle={projectTitle}    onProjectTitleChange={setProjectTitle}
            projectService={projectService} onProjectServiceChange={setProjectService}
            projectDeadline={projectDeadline} onProjectDeadlineChange={setProjectDeadline}
            projectBudget={projectBudget}  onProjectBudgetChange={setProjectBudget}
            paidAmount={paidAmount}        onPaidAmountChange={setPaidAmount}
            projectNotes={projectNotes}    onProjectNotesChange={setProjectNotes}
            projectWonValid={projectWonValid}
            onSaveProjectWon={saveProjectWon}
            onDeleteClient={moveToBin}
          />
        )}

        {/* ── LEAD DETAIL MODAL ── */}
        {viewingLead && (
          <LeadDetailModal
            lead={{
              id:      viewingLead.id,
              name:    viewingLead.client,
              company: viewingLead.company !== "N/A" ? viewingLead.company : undefined,
              phone:   viewingLead.phone   !== "N/A" ? viewingLead.phone   : undefined,
              email:   viewingLead.email   !== "N/A" ? viewingLead.email   : undefined,
              website: viewingLead.website || undefined,
              state:   viewingLead.state   || undefined,
              status:  viewingLead.status,
              interestedService: viewingLead.interestedService,
              nextSchedule:      viewingLead.nextSchedule || undefined,
              nextTime:          viewingLead.nextTime     || undefined,
              timezone:          viewingLead.timezone     || undefined,
              subContacts:       viewingLead.subContacts,
              rawCompany:        viewingLead.rawCompany   || undefined,
            }}
            onClose={() => setViewingLead(null)}
            onSaved={(id, updates) => {
              const merged: Partial<Lead> = {};
              if (updates.name          !== undefined) merged.client = updates.name.trim()  || "Unknown";
              if (updates.company       !== undefined) merged.company = updates.company.trim() || "N/A";
              if (updates.phone         !== undefined) merged.phone  = updates.phone.trim() || "N/A";
              if (updates.email         !== undefined) merged.email  = updates.email.trim() || "N/A";
              if (updates.website       !== undefined) merged.website = updates.website.trim();
              if (updates.state         !== undefined) merged.state  = updates.state.trim();
              if (updates.followUpNotes !== undefined) merged.followUpNotes = updates.followUpNotes;
              setLeads(prev => prev.map(i => i.id === id ? { ...i, ...merged } : i));
              setViewingLead(prev => prev ? { ...prev, ...merged } : prev);
            }}
            onSubContactAdded={(id, sub) => {
              setLeads(prev => prev.map(i => i.id === id ? { ...i, subContacts: [...i.subContacts, sub] } : i));
            }}
            onSubContactDeleted={(id, subId) => {
              setLeads(prev => prev.map(i => i.id === id ? { ...i, subContacts: i.subContacts.filter(s => s.id !== subId) } : i));
            }}
            onSubContactUpdated={(id, sub) => {
              setLeads(prev => prev.map(i => i.id === id ? { ...i, subContacts: i.subContacts.map(s => s.id === sub.id ? sub : s) } : i));
            }}
          />
        )}

        <AddLeadModal
          open={showAddLead}
          onClose={() => setShowAddLead(false)}
          onAdded={() => { void refetch(); void refetchStats(); invalidateAllCsrListCaches(); }}
        />
      </main>
    </div>
  );
}
