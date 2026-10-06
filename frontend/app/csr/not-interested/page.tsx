"use client";

import { useMemo, useState, Fragment } from "react";
import {
  ThumbsDown, PhoneOff, Search,
  X, RefreshCw,
  ChevronDown, ChevronUp, Eye, Users,
  Check,
  History, UserX, Ban, Home, Layers, CircleOff,
} from "lucide-react";
import toast from "react-hot-toast";

import TopNavbar from "../components/navigation/TopNavbar";
import LeadDetailModal from "../components/LeadDetailModal";
import CommentCell from "../components/shared/CommentCell";
import ImportantCallModal from "../components/modals/ImportantCallModal";
import InterestedModal from "../components/modals/InterestedModal";
import ClientNameCell from "../components/shared/ClientNameCell";
import PhoneWithTzCell from "../components/shared/PhoneWithTzCell";
import { consumeLeadDial, DialGatedSelect, requireLeadDial } from "../components/dialer/dialUnlock";
import { collectLeadPhones } from "../utils/parsePhones";
import StackedHorizontalBarChart, { StackedBarRow } from "../components/shared/StackedHorizontalBarChart";
import TriesBar from "../components/shared/TriesBar";
import Pagination from "../components/shared/Pagination";
import { CsrColGroup, CSR_TABLE_CLASS, CSR_THEAD, CSR_TH, CSR_TD, CSR_TD_TOP, CSR_TD_POPOVER, COL_8_FOLLOWUP, CSR_TABLE_CARD, CSR_TABLE_WRAP, CSR_PAGE_MAIN, matchesLeadSearch } from "../components/shared/csrTableStyles";
import StateFilterDropdown from "../components/shared/StateFilterDropdown";
import PhoneAreaCodeFilterInput from "../components/shared/PhoneAreaCodeFilterInput";
import { matchesStateLocationFilter, matchesPhoneAreaCodeFilter } from "@/lib/stateLocationFilter";
import { bumpToFront } from "@/lib/bumpToFront";
import ProjectDetailsForm from "../components/shared/ProjectDetailsForm";
import EmailField from "../components/shared/EmailField";
import CapsuleTabs from "@/app/components/CapsuleTabs";

import { useNotInterested, NiLead } from "../hooks/useNotInterested";
import { useCsrMiscStatusLeads } from "../hooks/useCsrMiscStatusLeads";
import { useOpenLeadFromQuery } from "../hooks/useOpenLeadFromQuery";
import API from "@/lib/api";
import { invalidateAllCsrListCaches } from "@/lib/csrApiCache";
import { invalidateCsrTabCaches } from "@/lib/csrTabApiCache";
import StatusWithTimestamp from "../components/shared/StatusWithTimestamp";
import {
  STATUS_NO_OWNER,
  STATUS_NOT_IN_SERVICE,
  STATUS_IN_HOUSE,
  STATUS_NOT_USEFUL,
  isNotInterestedStatus,
  isNotPickedStatus,
  isNotUsefulStatus,
  statusDisplayLabel,
} from "../constants/leadStatuses";
import type { Lead } from "../types/lead";
import { uniqueLeadsByPhone } from "../utils/uniqueLeadsByPhone";
import { sortByOldestNote } from "../utils/sortByOldestNote";

const NOT_INTERESTED_LIMIT = 3;
const NOT_PICKED_LIMIT     = 7;
const PAGE_SIZE            = 30;

type FollowUpTab = "all" | "notinterested" | "notpicked" | "noowner" | "notinservice" | "inhouse" | "notuseful";

function leadToNiLead(l: Lead): NiLead {
  return {
    ...l,
    notInterestedCount: 0,
    notPickedCount: 0,
  };
}

function followUpRetryMeta(lead: Pick<NiLead, "status" | "notInterestedCount" | "notPickedCount">) {
  const isNi = isNotInterestedStatus(lead.status);
  const isNp = isNotPickedStatus(lead.status);
  if (isNi) {
    return { isRetry: true, tries: lead.notInterestedCount, limit: NOT_INTERESTED_LIMIT, countKey: "notInterestedCount" as const, retryStatus: "Not Interested" };
  }
  if (isNp) {
    return { isRetry: true, tries: lead.notPickedCount, limit: NOT_PICKED_LIMIT, countKey: "notPickedCount" as const, retryStatus: "not picked" };
  }
  return { isRetry: false, tries: 0, limit: 0, countKey: null, retryStatus: lead.status };
}

export default function NotInterestedPage() {
  const { leads, setLeads, loading, refetch } = useNotInterested();
  const { leads: dashboardLeads, loading: dashLoading, refetch: refetchMisc } = useCsrMiscStatusLeads();

  const [activeTab, setActiveTab] = useState<FollowUpTab>("notinterested");
  const [search,       setSearch]       = useState("");
  const [stateFilter,  setStateFilter]  = useState("");
  const [phoneFilter,  setPhoneFilter]  = useState("");
  const [page,      setPage]      = useState(1);

  const [expandedRow,  setExpandedRow]  = useState<string | null>(null);
  const [editingNote,  setEditingNote]  = useState<{ leadId: string; index: number; value: string } | null>(null);
  const [savingNote,   setSavingNote]   = useState(false);


  const [viewingLead, setViewingLead] = useState<NiLead | null>(null);

  useOpenLeadFromQuery(leads, setViewingLead, !loading);

  /* ── Manual CSR assign (when retry limit reached) ── */
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignLead,      setAssignLead]      = useState<NiLead | null>(null);
  const [csrList,         setCsrList]         = useState<{ id: string; name: string; csrCode: string | null }[]>([]);
  const [selectedCsrId,   setSelectedCsrId]   = useState("");
  const [isAssigning,     setIsAssigning]     = useState(false);

  const [statusLead,          setStatusLead]          = useState<NiLead | null>(null);
  const [pendingPipelineStatus, setPendingPipelineStatus] = useState<"important" | "schedule call">("important");
  const [showImportantModal,  setShowImportantModal]  = useState(false);
  const [showInterestedModal, setShowInterestedModal] = useState(false);
  const [showCloseModal,      setShowCloseModal]      = useState(false);
  const [scheduleDate,        setScheduleDate]        = useState("");
  const [scheduleTime,        setScheduleTime]        = useState("");
  const [selectedTimezone,    setSelectedTimezone]    = useState("America/New_York");
  const [selectedService,     setSelectedService]     = useState("");
  const [serviceSubtype,      setServiceSubtype]      = useState("");
  const [projectTitle,        setProjectTitle]        = useState("");
  const [projectDeadline,     setProjectDeadline]     = useState("");
  const [projectBudget,       setProjectBudget]       = useState("");
  const [projectNotes,        setProjectNotes]        = useState("");
  const [projectService,      setProjectService]      = useState("");
  const [projectCode,         setProjectCode]         = useState("");
  const [paidAmount,          setPaidAmount]          = useState("");
  const [email,               setEmail]               = useState("");

  /* ── Derived lists (unique-by-phone so pills match the table) ── */
  const notInterested = useMemo(() => uniqueLeadsByPhone(leads.filter(l => isNotInterestedStatus(l.status))), [leads]);
  const notPicked     = useMemo(() => uniqueLeadsByPhone(leads.filter(l => isNotPickedStatus(l.status))), [leads]);
  const noOwner       = useMemo(() => uniqueLeadsByPhone(dashboardLeads.filter(l => l.status === STATUS_NO_OWNER).map(leadToNiLead)), [dashboardLeads]);
  const notInService  = useMemo(() => uniqueLeadsByPhone(dashboardLeads.filter(l => l.status === STATUS_NOT_IN_SERVICE).map(leadToNiLead)), [dashboardLeads]);
  const inHouse       = useMemo(() => uniqueLeadsByPhone(dashboardLeads.filter(l => l.status === STATUS_IN_HOUSE).map(leadToNiLead)), [dashboardLeads]);
  const notUseful     = useMemo(() => uniqueLeadsByPhone(dashboardLeads.filter(l => isNotUsefulStatus(l.status)).map(leadToNiLead)), [dashboardLeads]);
  const allFollowUp   = useMemo(
    () => uniqueLeadsByPhone([...notInterested, ...notPicked, ...noOwner, ...notInService, ...inHouse, ...notUseful]),
    [notInterested, notPicked, noOwner, notInService, inHouse, notUseful],
  );

  const currentList = activeTab === "all" ? allFollowUp
    : activeTab === "notinterested" ? notInterested
    : activeTab === "notpicked" ? notPicked
    : activeTab === "noowner" ? noOwner
    : activeTab === "notinservice" ? notInService
    : activeTab === "notuseful" ? notUseful
    : inHouse;
  const pageLoading = activeTab === "all" ? (loading || dashLoading)
    : (activeTab === "notinterested" || activeTab === "notpicked") ? loading
    : dashLoading;

  const searchFiltered = useMemo(() => {
    const list = currentList.filter(l =>
      matchesLeadSearch(search, {
        name: l.client,
        company: l.company,
        phone: l.phone,
        service: l.interestedService,
        state: l.state,
      }) &&
      matchesStateLocationFilter(l.state, l.phone, stateFilter) &&
      matchesPhoneAreaCodeFilter(l.phone, phoneFilter)
    );
    return sortByOldestNote(list);
  }, [currentList, search, stateFilter, phoneFilter]);

  const totalPages = Math.max(1, Math.ceil(searchFiltered.length / PAGE_SIZE));
  const paginated  = searchFiltered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* ── Chart rows ── */
  const chartRows = useMemo<StackedBarRow[]>(() => {
    const nearNI = notInterested.filter(l => l.notInterestedCount >= NOT_INTERESTED_LIMIT - 1).length;
    const nearNP = notPicked.filter(l => l.notPickedCount     >= NOT_PICKED_LIMIT     - 1).length;
    return [
      {
        label: "Not Interested",
        segments: [
          { label: "Near Limit",  value: nearNI,                         color: "#EF4444" },
          { label: "Active NI",   value: notInterested.length - nearNI,  color: "#1B6FE8" },
        ],
      },
      {
        label: "Not Picked",
        segments: [
          { label: "Near Limit",  value: nearNP,                   color: "#F97316" },
          { label: "Safe NP",     value: notPicked.length - nearNP, color: "#15803D" },
        ],
      },
      {
        label: "Not useful",
        segments: [
          { label: "Not useful", value: notUseful.length, color: "#7C3AED" },
        ],
      },
    ];
  }, [notInterested, notPicked, notUseful]);

  /* ── Handlers ── */
  const bustCaches = () => {
    invalidateCsrTabCaches();
    invalidateAllCsrListCaches();
  };

  const handleRetry = async (lead: NiLead) => {
    const meta = followUpRetryMeta(lead);
    if (!meta.isRetry || !meta.countKey) return;
    if (!requireLeadDial(lead.id)) return;
    const newStatus = meta.retryStatus;
    try {
      const res = await API.put(`/csr/lead/${lead.id}`, { status: newStatus });
      consumeLeadDial(lead.id);
      bustCaches();
      if (res.data.needsManualAssign) {
        setCsrList(res.data.csrs ?? []);
        setAssignLead(lead);
        setSelectedCsrId("");
        setShowAssignModal(true);
        setLeads(prev => prev.filter(l => l.id !== lead.id));
      } else {
        const triesLeft    = res.data.triesLeft ?? 0;
        const updatedNotes = res.data.lead?.followUpNotes ?? lead.followUpNotes ?? "";
        toast.success(`Retried. ${triesLeft} attempt${triesLeft !== 1 ? "s" : ""} left.`);
        const key = meta.countKey;
        setLeads(prev => prev.map(l =>
          l.id === lead.id
            ? { ...l, [key]: (l[key] as number) + 1, followUpNotes: updatedNotes }
            : l
        ));
      }
    } catch (err) { console.log(err); }
  };

  const handleAssignToCSR = async () => {
    if (!assignLead || !selectedCsrId) return;
    setIsAssigning(true);
    try {
      await API.put(`/csr/lead/${assignLead.id}/assign`, { csrId: selectedCsrId });
      const csrName = csrList.find(c => c.id === selectedCsrId)?.name ?? "another CSR";
      toast.success(`Lead assigned to ${csrName}.`);
      setLeads(prev => prev.filter(l => l.id !== assignLead.id));
      setShowAssignModal(false);
      setAssignLead(null);
    } catch { toast.error("Failed to assign lead."); }
    finally { setIsAssigning(false); }
  };

  const handleSaveNote = async (lead: NiLead) => {
    if (!editingNote) return;
    setSavingNote(true);
    try {
      const lines   = (lead.followUpNotes ?? "").split("\n").filter(Boolean);
      lines[editingNote.index] = editingNote.value;
      const updated = lines.join("\n");
      await API.put(`/csr/lead/${lead.id}`, { followUpNotes: updated });
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, followUpNotes: updated } : l));
      setEditingNote(null);
    } catch { toast.error("Failed to save note."); }
    finally { setSavingNote(false); }
  };

  const handleUpdateStatus = async (lead: NiLead, status: string) => {
    if (status === "") return;
    if (!requireLeadDial(lead.id)) return;

    const sameStatus =
      (isNotInterestedStatus(status) && isNotInterestedStatus(lead.status)) ||
      (isNotPickedStatus(status) && isNotPickedStatus(lead.status)) ||
      (status === STATUS_NO_OWNER && lead.status === STATUS_NO_OWNER) ||
      (status === STATUS_NOT_IN_SERVICE && lead.status === STATUS_NOT_IN_SERVICE) ||
      (status === STATUS_IN_HOUSE && lead.status === STATUS_IN_HOUSE) ||
      (isNotUsefulStatus(status) && isNotUsefulStatus(lead.status));

    if (sameStatus && followUpRetryMeta(lead).isRetry) {
      await handleRetry(lead);
      return;
    }

    if (status === "important" || status === "schedule call") {
      setStatusLead(lead);
      setPendingPipelineStatus(status);
      setScheduleDate("");
      setScheduleTime("");
      setSelectedTimezone("America/New_York");
      setShowImportantModal(true);
      return;
    }
    if (status === "interested") {
      setStatusLead(lead); setSelectedService(""); setServiceSubtype(""); setShowInterestedModal(true); return;
    }
    if (status === "Close Client") {
      setStatusLead(lead); setProjectTitle(lead.client); setProjectDeadline("");
      setProjectBudget(""); setProjectNotes(""); setProjectService("");
      setProjectCode(""); setPaidAmount(""); setEmail(lead.email); setShowCloseModal(true); return;
    }
    try {
      const res = await API.put(`/csr/lead/${lead.id}`, { status });
      consumeLeadDial(lead.id);
      bustCaches();
      void refetch();
      void refetchMisc();
      const staysOnPage = activeTab === "all" && (
        isNotInterestedStatus(status) ||
        isNotPickedStatus(status) ||
        status === STATUS_NO_OWNER ||
        status === STATUS_NOT_IN_SERVICE ||
        status === STATUS_IN_HOUSE ||
        isNotUsefulStatus(status)
      );
      if (staysOnPage) {
        const updated = res.data?.lead;
        if (updated) {
          setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...updated, status } : l));
        }
        toast.success(`Status updated to "${statusDisplayLabel(status)}".`);
        return;
      }
      setLeads(prev => prev.filter(l => l.id !== lead.id));
      toast.success(`Status updated to "${statusDisplayLabel(status)}".`);
    } catch { toast.error("Failed to update status."); }
  };

  const saveImportant = async () => {
    if (!statusLead || !scheduleDate || !scheduleTime) return;
    if (!requireLeadDial(statusLead.id)) return;
    const nextStatus = pendingPipelineStatus;
    await API.put(`/csr/lead/${statusLead.id}`, {
      status: nextStatus, nextSchedule: scheduleDate,
      nextTime: scheduleTime, timezone: selectedTimezone,
    });
    consumeLeadDial(statusLead.id);
    bustCaches();
    setLeads(prev => prev.filter(l => l.id !== statusLead.id));
    setShowImportantModal(false);
    setPendingPipelineStatus("important");
    toast.success(nextStatus === "schedule call" ? "Moved to Schedule Call." : "Scheduled as Important Call.");
  };

  const saveInterested = async () => {
    if (!statusLead || !selectedService) return;
    if (!requireLeadDial(statusLead.id)) return;
    const sub = serviceSubtype.trim();
    const interestedService = sub ? `${selectedService}-${sub}` : selectedService;
    await API.put(`/csr/lead/${statusLead.id}`, { status: "interested", interestedService });
    consumeLeadDial(statusLead.id);
    bustCaches();
    setLeads(prev => prev.filter(l => l.id !== statusLead.id));
    setShowInterestedModal(false);
    setSelectedService("");
    setServiceSubtype("");
    toast.success("Marked as Interested.");
  };

  const saveCloseClient = async () => {
    if (!statusLead || !projectTitle || !projectDeadline || !projectService || !paidAmount) return;
    if (!requireLeadDial(statusLead.id)) return;
    await API.put(`/csr/lead/${statusLead.id}`, {
      status: "Close Client", projectTitle, projectDeadline, projectCode,
      projectBudget, projectNotes, interestedService: projectService, paidAmount,
      ...(email.trim() && email.trim().toLowerCase() !== "n/a" ? { email: email.trim() } : {}),
    });
    consumeLeadDial(statusLead.id);
    bustCaches();
    setLeads(prev => prev.filter(l => l.id !== statusLead.id));
    setShowCloseModal(false);
    toast.success("Client closed & moved to Projects.");
  };

  const addNote = async (id: string, text: string, parentId?: string) => {
    const res = await API.post(`/csr/lead/${id}/notes`, {
      text,
      ...(parentId ? { parentId } : {}),
    });
    const note = res.data.note
      ? {
          id: res.data.note.id,
          text: res.data.note.text,
          createdAt: res.data.note.createdAt,
          parentId: res.data.note.parentId ?? parentId ?? null,
        }
      : { id: Date.now().toString(), text, createdAt: new Date().toISOString(), parentId: parentId || null };
    setLeads(prev => bumpToFront(prev, id, (l) => {
      const hist = l.noteHistory ?? [];
      if (parentId) {
        return {
          ...l,
          noteCount: (l.noteCount ?? 0) + 1,
          noteHistory: hist.map((n) =>
            n.id === parentId ? { ...n, replies: [...(n.replies ?? []), note] } : n,
          ),
        };
      }
      return {
        ...l,
        noteCount: (l.noteCount ?? 0) + 1,
        noteHistory: [note, ...hist],
      };
    }));
    return note;
  };

  return (
    <div className="min-h-screen bg-[#F5F6FA] dark:bg-crm-bg">
      <TopNavbar />
      <main className={CSR_PAGE_MAIN}>

        {/* ── HEADER ── */}
        <div className="mt-1">
          <h1 className="text-2xl sm:text-[28px] lg:text-[34px] font-bold text-[#0F172A] leading-tight">
            Leads Follow-up
          </h1>
          <p className="text-gray-500 mt-1 sm:mt-2 text-xs sm:text-sm">
            Track Not Interested, Not useful, Not Picked, No Owner, Not In Service &amp; In House leads.
          </p>
        </div>

        {/* ── STATS CHART ── */}
        <div className="mt-4 sm:mt-7">
          <StackedHorizontalBarChart
            title="Pipeline by stage and try count"
            subtitle="Breakdown of not-interested and not-picked leads — near-limit segments highlighted."
            rows={chartRows}
            loading={loading}
          />
        </div>

        {/* ── TAB BUTTONS ── */}
        <CapsuleTabs
          stretch
          className="mt-4 sm:mt-7"
          activeKey={activeTab}
          onChange={key => { setActiveTab(key); setSearch(""); setPage(1); }}
          tabs={[
            { key: "all",           label: "All",            count: activeTab === "all"           ? searchFiltered.length : allFollowUp.length,     icon: Layers     },
            { key: "notinterested", label: "Not Interested", count: activeTab === "notinterested" ? searchFiltered.length : notInterested.length,  icon: ThumbsDown },
            { key: "notuseful",     label: "Not useful",     count: activeTab === "notuseful"     ? searchFiltered.length : notUseful.length,      icon: CircleOff  },
            { key: "notpicked",     label: "Not Picked",     count: activeTab === "notpicked"     ? searchFiltered.length : notPicked.length,      icon: PhoneOff   },
            { key: "noowner",       label: "No Owner",       count: activeTab === "noowner"       ? searchFiltered.length : noOwner.length,        icon: UserX      },
            { key: "notinservice",  label: "Not In Service", count: activeTab === "notinservice"  ? searchFiltered.length : notInService.length,   icon: Ban        },
            { key: "inhouse",       label: "In House",       count: activeTab === "inhouse"       ? searchFiltered.length : inHouse.length,        icon: Home       },
          ]}
        />

        {/* ── TABLE CARD ── */}
        <div className={CSR_TABLE_CARD}>
          {/* Card header */}
          <div className="p-4 sm:p-5 lg:p-6 border-b border-[#F3F3F3]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              <div>
                <h3 className="text-lg sm:text-[22px] font-bold text-[#0F172A]">
                  {activeTab === "all" ? "All Follow-up"
                    : activeTab === "notinterested" ? "Not Interested"
                    : activeTab === "notuseful" ? "Not useful"
                    : activeTab === "notpicked" ? "Not Picked"
                    : activeTab === "noowner" ? "No Owner Available"
                    : activeTab === "notinservice" ? "Not In Service"
                    : "In House"} Leads
                </h3>
                <p className="text-gray-500 text-xs sm:text-sm mt-0.5 sm:mt-1">
                  {activeTab === "all" ? (
                    <>All not-interested, not-picked, and other follow-up leads.</>
                  ) : activeTab === "notinterested" || activeTab === "notpicked" ? (
                    <>Auto-redistributed after <span className="font-semibold text-[#1B6FE8]">{activeTab === "notinterested" ? NOT_INTERESTED_LIMIT : NOT_PICKED_LIMIT} tries</span>.</>
                  ) : (
                    <>Leads marked from the main call dashboard.</>
                  )}
                </p>
              </div>
              <div className="grid w-full gap-2 grid-cols-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto_auto]">
                <div className="relative min-w-0 col-span-2 sm:col-span-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 sm:w-[14px] sm:h-[14px]" />
                  <input
                    type="text"
                    placeholder="Search name, phone, company..."
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    className="w-full h-9 sm:h-[40px] rounded-xl sm:rounded-2xl border border-gray-200 dark:border-crm-border bg-[#FAFAFA] dark:bg-crm-input pl-8 sm:pl-9 pr-3 text-xs sm:text-[13px] outline-none focus:border-[#1B6FE8] dark:text-crm-text"
                  />
                </div>
                <StateFilterDropdown fullWidth value={stateFilter} onChange={v => { setStateFilter(v); setPage(1); }} />
                <PhoneAreaCodeFilterInput fullWidth value={phoneFilter} onChange={v => { setPhoneFilter(v); setPage(1); }} />
                <button
                  onClick={() => void refetch()}
                  className="h-9 sm:h-[40px] w-full sm:w-10 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-crm-border bg-[#FAFAFA] dark:bg-crm-input flex items-center justify-center hover:border-[#1B6FE8] hover:text-[#1B6FE8] transition-colors text-gray-500"
                  title="Refresh"
                >
                  <RefreshCw size={13} className="sm:w-[15px] sm:h-[15px]" />
                </button>
                <div className={`text-[11px] sm:text-sm font-semibold px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl whitespace-nowrap inline-flex items-center justify-center ${
                  activeTab === "notpicked" ? "bg-[#FFF7E6] text-[#B54708]" : "bg-[#EAF2FE] text-[#1B6FE8]"
                }`}>
                  {searchFiltered.length} Leads
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className={CSR_TABLE_WRAP}>
            <table className={CSR_TABLE_CLASS}>
              <CsrColGroup widths={COL_8_FOLLOWUP} />
              <thead className={CSR_THEAD}>
                <tr>
                  <th className={CSR_TH}>Client Name</th>
                  <th className={CSR_TH}>Phone</th>
                  <th className={CSR_TH}>Notes</th>
                  <th className={CSR_TH}>Tries</th>
                  <th className={CSR_TH}>Status</th>
                  <th className={CSR_TH}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pageLoading ? (
                  [1,2,3,4].map(i => (
                    <tr key={i} className="border-b border-[#F7F7F7]">
                      {[1,2,3,4,5,6].map(j => (
                        <td key={j} className={CSR_TD}>
                          <div className="h-3.5 sm:h-4 bg-gray-100 rounded animate-pulse w-14 sm:w-20" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : searchFiltered.length > 0 ? paginated.map(lead => {
                  const retry       = followUpRetryMeta(lead);
                  const tries       = retry.tries;
                  const limit       = retry.limit;
                  const isRetryTab  = retry.isRetry;
                  const isNearLimit = isRetryTab && tries >= limit - 1;
                  const isAtLimit   = isRetryTab && tries >= limit;
                  const barColor    = isAtLimit
                    ? "bg-gray-300"
                    : isNearLimit
                    ? "bg-amber-400"
                    : isNotInterestedStatus(lead.status) ? "bg-[#1B6FE8]" : "bg-amber-500";

                  return (
                    <Fragment key={lead.id}>
                      <tr
                        className={`border-b border-[#F7F7F7] transition-all ${isAtLimit ? "opacity-60 bg-gray-50" : "hover:bg-[#FFF8F9]"}`}
                      >
                        {/* Client */}
                        <td className={CSR_TD_POPOVER}>
                          <ClientNameCell
                            lead={lead}
                            subtitle={statusDisplayLabel(lead.status)}
                          />
                        </td>

                        {/* Phone — number + area-code TZ */}
                        <td className={CSR_TD_POPOVER}>
                          {(() => {
                            const phones = collectLeadPhones(lead.phone, lead.subContacts);
                            return (
                              <PhoneWithTzCell
                                phone={phones[0] ?? lead.phone}
                                allPhones={phones}
                                variant="pill"
                                className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-[12px]"
                                dial={{ leadId: lead.id, clientName: lead.company || lead.client }}
                              />
                            );
                          })()}
                        </td>

                        {/* Sticky Note */}
                        <td className={CSR_TD_TOP}>
                          <CommentCell id={lead.id} noteHistory={lead.noteHistory} noteCount={lead.noteCount} onAddNote={addNote} />
                        </td>

                        {/* Tries bar */}
                        <td className={CSR_TD}>
                          {isRetryTab ? (
                            <TriesBar used={tries} limit={limit} color={barColor} />
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>

                        {/* Status badge */}
                        <td className={CSR_TD}>
                          {isRetryTab && isAtLimit ? (
                            <span className="block text-[9px] sm:text-[10px] font-semibold text-gray-500 truncate">Redistributed</span>
                          ) : (
                            <StatusWithTimestamp
                              status={lead.status}
                              statusUpdatedAt={lead.statusUpdatedAt}
                              badgeClassName={`px-2 py-1 rounded-lg text-[9px] sm:text-[10px] font-semibold w-fit ${
                                isNotInterestedStatus(lead.status) ? "bg-[#EAF2FE] text-[#1B6FE8]"
                                  : isNotPickedStatus(lead.status) ? "bg-[#FFF7ED] text-[#B54708]"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            />
                          )}
                        </td>

                        {/* Action */}
                        <td className={CSR_TD}>
                          <div className="flex flex-col gap-1 min-w-0 w-full">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setViewingLead(lead)}
                                title="View details"
                                className="h-7 w-7 rounded-lg bg-[#EAF5FF] text-[#0B84F3] flex items-center justify-center hover:opacity-80 shrink-0"
                              >
                                <Eye size={12} />
                              </button>
                              {isRetryTab && !isAtLimit && (
                                <button
                                  onClick={() => handleRetry(lead)}
                                  title="Retry"
                                  className="h-7 w-7 rounded-lg bg-[#F5F6FA] text-gray-700 flex items-center justify-center hover:bg-[#1B6FE8] hover:text-white shrink-0"
                                >
                                  <RefreshCw size={11} />
                                </button>
                              )}
                              {lead.followUpNotes && (
                                <button
                                  onClick={() => setExpandedRow(expandedRow === lead.id ? null : lead.id)}
                                  title="View history"
                                  className="h-7 w-7 rounded-lg bg-[#F5F6FA] text-gray-500 flex items-center justify-center shrink-0"
                                >
                                  {expandedRow === lead.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                </button>
                              )}
                            </div>
                            <DialGatedSelect
                              leadId={lead.id}
                              onPick={status => { void handleUpdateStatus(lead, status); }}
                              className="appearance-none h-7 w-full rounded-lg border border-gray-200 bg-white px-1.5 text-[9px] sm:text-[10px] font-semibold text-[#0F172A] outline-none"
                            >
                              <option value="">Update Status</option>
                              <option value="Not Interested">Not Interested</option>
                              <option value={STATUS_NOT_USEFUL}>Not useful</option>
                              <option value="not picked">Not Picked</option>
                              <option value={STATUS_NO_OWNER}>No Owner Available</option>
                              <option value={STATUS_NOT_IN_SERVICE}>Not In Service</option>
                              <option value={STATUS_IN_HOUSE}>In House</option>
                              <option value="pending">Pending</option>
                              <option value="important">Important</option>
                              <option value="schedule call">Schedule Call</option>
                              <option value="interested">Interested</option>
                              <option value="Close Client">Close Client</option>
                            </DialGatedSelect>
                          </div>
                        </td>
                      </tr>

                      {/* ── History row ── */}
                      {expandedRow === lead.id && lead.followUpNotes && (
                        <tr key={`${lead.id}-hist`} className="bg-[#F8FAFF]">
                          <td colSpan={6} className="px-4 sm:px-6 py-3 sm:py-4">
                            <div className="flex items-start gap-2 sm:gap-3">
                              <div className="mt-0.5 w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                <History size={12} className="sm:w-[14px] sm:h-[14px]" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] sm:text-[12px] font-semibold text-gray-500 mb-1.5 sm:mb-2 uppercase tracking-wide">Try History</p>
                                <div className="space-y-1.5 sm:space-y-2">
                                  {lead.followUpNotes.trim().split("\n").filter(Boolean).map((line, i) => {
                                    const isLimit        = line.includes("LIMIT REACHED");
                                    const isEditingThis  = editingNote?.leadId === lead.id && editingNote.index === i;
                                    const bracketEnd     = line.indexOf("]");
                                    const prefix         = bracketEnd !== -1 ? line.slice(0, bracketEnd + 1) : "";
                                    const rest           = bracketEnd !== -1 ? line.slice(bracketEnd + 1).trim() : line;

                                    return (
                                      <div key={i} className={`rounded-xl border text-[11px] sm:text-[12px] ${isLimit ? "bg-red-50 border-red-100" : "bg-white border-gray-100"}`}>
                                        {isEditingThis ? (
                                          <div className="p-2 space-y-1.5 sm:space-y-2">
                                            <p className="text-[10px] sm:text-[11px] font-mono text-gray-400 px-1">{prefix}</p>
                                            <textarea
                                              autoFocus
                                              rows={2}
                                              value={editingNote.value.slice(bracketEnd + 1).trim()}
                                              onChange={e => setEditingNote({ ...editingNote, value: `${prefix} ${e.target.value}` })}
                                              placeholder="Add your note here..."
                                              className="w-full rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-[11px] sm:text-[12px] text-gray-700 outline-none resize-none focus:border-blue-400"
                                            />
                                            <div className="flex gap-2 justify-end">
                                              <button onClick={() => setEditingNote(null)}
                                                className="px-2.5 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200 transition-all">
                                                Cancel
                                              </button>
                                              <button onClick={() => handleSaveNote(lead)} disabled={savingNote}
                                                className="px-2.5 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:opacity-50">
                                                {savingNote ? "Saving..." : "Save"}
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="flex items-start gap-2 px-2.5 sm:px-3 py-2">
                                            <span className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-bold shrink-0 mt-0.5 ${isLimit ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-500"}`}>
                                              {i + 1}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                              <span className={`font-mono text-[10px] sm:text-[11px] ${isLimit ? "text-red-600" : "text-gray-400"}`}>{prefix} </span>
                                              <span className={isLimit ? "text-red-700 font-medium" : "text-gray-700"}>{rest}</span>
                                            </div>
                                            <button
                                              onClick={() => setEditingNote({ leadId: lead.id, index: i, value: line })}
                                              className="shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-gray-50 text-gray-400 hover:bg-blue-50 hover:text-blue-500 flex items-center justify-center transition-all"
                                            >
                                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                              </svg>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                }) : (
                  <tr>
                    <td colSpan={6} className="py-16 sm:py-20 text-center">
                      {activeTab === "notpicked"
                        ? <PhoneOff   size={24} className="text-gray-200 mx-auto mb-2 sm:mb-3 sm:w-7 sm:h-7" />
                        : <ThumbsDown size={24} className="text-gray-200 mx-auto mb-2 sm:mb-3 sm:w-7 sm:h-7" />
                      }
                      <p className="text-gray-400 text-xs sm:text-sm">
                        {search ? "No leads match your search." : "No leads in this category."}
                      </p>
                      {search && (
                        <button onClick={() => setSearch("")} className="mt-2 sm:mt-3 text-[#1B6FE8] text-xs sm:text-sm font-semibold hover:underline">
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
              total={searchFiltered.length}
              pageSize={PAGE_SIZE}
              onPage={setPage}
            />
          </div>
        </div>

        {/* ══ IMPORTANT MODAL (shared) ══ */}
        {showImportantModal && (
          <ImportantCallModal
            date={scheduleDate}       onDateChange={setScheduleDate}
            time={scheduleTime}       onTimeChange={setScheduleTime}
            timezone={selectedTimezone} onTimezoneChange={setSelectedTimezone}
            onClose={() => setShowImportantModal(false)}
            onSave={saveImportant}
          />
        )}

        {/* ══ INTERESTED MODAL (shared) ══ */}
        {showInterestedModal && (
          <InterestedModal
            service={selectedService} onServiceChange={setSelectedService}
            serviceSubtype={serviceSubtype} onServiceSubtypeChange={setServiceSubtype}
            onClose={() => { setShowInterestedModal(false); setSelectedService(""); setServiceSubtype(""); }}
            onSave={saveInterested}
          />
        )}

        {/* ══ CLOSE CLIENT MODAL ══ */}
        {showCloseModal && statusLead && (
          <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div
              className="w-full sm:max-w-[520px] lg:max-w-[540px] bg-white rounded-t-[24px] sm:rounded-[28px] shadow-2xl flex flex-col overflow-hidden"
              style={{ maxHeight: "92vh" }}
            >
              <div className="relative bg-gradient-to-br from-[#1B6FE8] to-[#0E4FBE] px-4 sm:px-5 lg:px-6 pt-4 sm:pt-5 pb-4 sm:pb-5 shrink-0 overflow-hidden">
                <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
                <div className="absolute -bottom-8 -left-4 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />
                <button onClick={() => setShowCloseModal(false)}
                  className="absolute top-3 sm:top-4 right-3 sm:right-4 w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors z-10">
                  <X size={13} className="sm:w-[15px] sm:h-[15px]" />
                </button>
                <div className="flex items-center gap-2.5 sm:gap-3 pr-10">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white/20 flex items-center justify-center text-white text-base sm:text-xl font-bold shrink-0">
                    {statusLead.client.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm sm:text-base lg:text-lg font-bold text-white leading-tight">Close Client</h2>
                    <p className="text-white/65 text-[10px] sm:text-xs mt-0.5 truncate">
                      {statusLead.client}{statusLead.phone ? ` · ${statusLead.phone}` : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 bg-green-500/25 text-green-100 border border-green-400/30 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-semibold">
                    <Check size={9} className="sm:w-[10px] sm:h-[10px]" /> Fill in project details to confirm
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain">
                <div className="px-4 sm:px-5 lg:px-6 py-4 sm:py-5 space-y-3 sm:space-y-5">
                  {/* EMAIL */}
                  <EmailField email={email} onEmailChange={setEmail} />

                  <ProjectDetailsForm
                    projectCode={projectCode} onProjectCodeChange={setProjectCode}
                    title={projectTitle} onTitleChange={setProjectTitle}
                    service={projectService} onServiceChange={setProjectService}
                    deadline={projectDeadline} onDeadlineChange={setProjectDeadline}
                    budget={projectBudget} onBudgetChange={setProjectBudget}
                    paidAmount={paidAmount} onPaidAmountChange={setPaidAmount}
                    notes={projectNotes} onNotesChange={setProjectNotes}
                  />

                  <div className="flex gap-2 sm:gap-3 pb-1">
                    <button onClick={() => setShowCloseModal(false)} className="flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl bg-[#F5F6FA] text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={saveCloseClient}
                      disabled={!projectTitle || !projectDeadline || !projectService || !paidAmount}
                      className={`flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl font-semibold text-xs sm:text-sm text-white flex items-center justify-center gap-2 transition-all ${
                        projectTitle && projectDeadline && projectService && paidAmount
                          ? "bg-gradient-to-r from-[#1B6FE8] to-[#d4173a] shadow-md shadow-red-200"
                          : "bg-gray-200 cursor-not-allowed text-gray-400"
                      }`}
                    >
                      Confirm &amp; Move to Projects
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ ASSIGN CSR MODAL ══ */}
        {showAssignModal && assignLead && (
          <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-[32px] shadow-2xl overflow-hidden">
              <div className="bg-gradient-to-br from-[#1B6FE8] to-[#0E4FBE] px-5 sm:px-6 pt-5 pb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-white">Assign to CSR</h2>
                    <p className="text-white/70 text-xs sm:text-sm mt-0.5">
                      Limit reached for <span className="font-semibold text-white">{assignLead.client}</span>. Pick a CSR:
                    </p>
                  </div>
                  <button onClick={() => setShowAssignModal(false)}
                    className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white shrink-0">
                    <X size={15} />
                  </button>
                </div>
              </div>
              <div className="px-5 sm:px-6 py-4 space-y-2 max-h-64 overflow-y-auto">
                {csrList.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">No other active CSRs available.</p>
                ) : csrList.map(csr => (
                  <button
                    key={csr.id}
                    onClick={() => setSelectedCsrId(csr.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all text-left ${
                      selectedCsrId === csr.id ? "border-[#1B6FE8] bg-[#EAF2FE]" : "border-gray-100 bg-[#FAFAFA] hover:border-gray-200"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${selectedCsrId === csr.id ? "bg-[#1B6FE8]" : "bg-gray-400"}`}>
                      {csr.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className={`font-semibold text-sm truncate ${selectedCsrId === csr.id ? "text-[#1B6FE8]" : "text-[#0F172A]"}`}>{csr.name}</p>
                      {csr.csrCode && <p className="text-xs text-gray-400">{csr.csrCode}</p>}
                    </div>
                    {selectedCsrId === csr.id && (
                      <div className="ml-auto w-5 h-5 rounded-full bg-[#1B6FE8] flex items-center justify-center shrink-0">
                        <Check size={11} className="text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex gap-3 px-5 sm:px-6 pb-5 pt-2">
                <button onClick={() => setShowAssignModal(false)} className="flex-1 h-11 rounded-2xl bg-[#F5F6FA] text-gray-600 font-semibold text-sm">Cancel</button>
                <button
                  onClick={handleAssignToCSR}
                  disabled={!selectedCsrId || isAssigning}
                  className="flex-1 h-11 rounded-2xl bg-[#1B6FE8] text-white font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <Users size={14} />
                  {isAssigning ? "Assigning…" : "Assign Lead"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ LEAD DETAIL MODAL ══ */}
        {viewingLead && (
          <LeadDetailModal
            lead={{
              id:                viewingLead.id,
              name:              viewingLead.client,
              company:           viewingLead.company !== "N/A" ? viewingLead.company : undefined,
              rawCompany:        viewingLead.rawCompany || viewingLead.company,
              phone:             viewingLead.phone   !== "N/A" ? viewingLead.phone   : undefined,
              email:             viewingLead.email   !== "N/A" ? viewingLead.email   : undefined,
              website:           viewingLead.website || undefined,
              state:             viewingLead.state   || undefined,
              status:            viewingLead.status,
              interestedService: viewingLead.interestedService,
              followUpNotes:     viewingLead.followUpNotes,
              subContacts:       viewingLead.subContacts,
            }}
            onClose={() => setViewingLead(null)}
            onSaved={(id, updates) => {
              const merged: Partial<NiLead> = {};
              if (updates.name          !== undefined) merged.client = updates.name.trim()  || "Unknown";
              if (updates.company       !== undefined) merged.company = updates.company.trim() || "N/A";
              if (updates.phone         !== undefined) merged.phone  = updates.phone.trim() || "N/A";
              if (updates.email         !== undefined) merged.email  = updates.email.trim();
              if (updates.website       !== undefined) merged.website = updates.website.trim();
              if (updates.state         !== undefined) merged.state  = updates.state.trim();
              if (updates.followUpNotes !== undefined) merged.followUpNotes = updates.followUpNotes;
              setLeads(prev => prev.map(l => l.id === id ? { ...l, ...merged } : l));
              setViewingLead(prev => prev ? { ...prev, ...merged } : prev);
            }}
            onSubContactAdded={(id, sub) => {
              setLeads(prev => prev.map(l => l.id === id ? { ...l, subContacts: [...l.subContacts, sub] } : l));
            }}
            onSubContactDeleted={(id, subId) => {
              setLeads(prev => prev.map(l => l.id === id ? { ...l, subContacts: l.subContacts.filter(s => s.id !== subId) } : l));
            }}
          />
        )}
      </main>

    </div>
  );
}
