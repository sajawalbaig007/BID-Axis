"use client";

import { useMemo, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  PhoneCall, CircleCheckBig, AlertTriangle,
  Clock3, Phone, Users, Bell, X, Eye, ChevronDown, CalendarDays,
  UserX, Ban, Home, Plus, Search,
} from "lucide-react";

import TopNavbar from "./components/navigation/TopNavbar";
import UsaTimezoneClocks from "./components/shared/UsaTimezoneClocks";
import LeadDetailModal from "./components/LeadDetailModal";
import StateFilterDropdown from "./components/shared/StateFilterDropdown";
import PhoneAreaCodeFilterInput from "./components/shared/PhoneAreaCodeFilterInput";
import TimezoneFilterDropdown from "./components/shared/TimezoneFilterDropdown";
import SourceSudoFilterDropdown from "./components/shared/SourceSudoFilterDropdown";
import TradeFilterDropdown from "./components/shared/TradeFilterDropdown";
import CommentCell from "./components/shared/CommentCell";
import { CsrColGroup, CSR_TABLE_CLASS, CSR_THEAD, CSR_TH, CSR_TD, CSR_TD_TOP, CSR_TD_POPOVER, COL_6_DASHBOARD, COL_7_DASHBOARD, CSR_PAGE_MAIN } from "./components/shared/csrTableStyles";
import InterestedServicesCell from "./components/shared/InterestedServicesCell";
import TradesCell from "./components/shared/TradesCell";
import { decomposeInterestedServices, formatInterestedServices } from "./utils/parseInterestedServices";
import ImportantCallModal from "./components/modals/ImportantCallModal";
import InterestedModal from "./components/modals/InterestedModal";
import ProjectWonModal from "./components/modals/ProjectWonModal";
import AddLeadModal from "./components/modals/AddLeadModal";
import MonthRangeFilter from "./components/shared/MonthRangeFilter";
import ClientNameCell from "./components/shared/ClientNameCell";
import PhoneWithTzCell from "./components/shared/PhoneWithTzCell";
import { DialGatedSelect } from "./components/dialer/dialUnlock";
import { collectLeadPhones } from "./utils/parsePhones";
import { useCsrStats, useCsrTabLeads, CSR_FILTER_BATCH_SIZE, type CsrTabKey } from "./hooks/useCsrTabPage";
import { invalidateCsrDashboardCache } from "@/lib/csrDashboardCache";
import API from "@/lib/api";
import { invalidateAllCsrListCaches } from "@/lib/csrApiCache";
import { useLeadActions } from "./hooks/useLeadActions";
import { useOpenLeadFromQuery } from "./hooks/useOpenLeadFromQuery";
import { matchesStateLocationFilter, matchesPhoneAreaCodeFilter } from "@/lib/stateLocationFilter";
import { PAGE_SIZE, TODAY_STR } from "./constants";
import { leadMatchesTimezoneFilter } from "./constants/timezoneAbbr";
import { MASTER_FORMAT_TRADES, canonicalTradeName, leadMatchesTradeFilter, leadTradeAndSubtradeNames } from "./constants/masterFormatTrades";
import { sortByOldestNote } from "./utils/sortByOldestNote";
import { Lead } from "./types/lead";
import type { NoteEntry } from "./hooks/useLeadsData";
import {
  STATUS_NO_OWNER,
  STATUS_NOT_IN_SERVICE,
  STATUS_IN_HOUSE,
  STATUS_NOT_USEFUL,
} from "./constants/leadStatuses";
import StatusWithTimestamp from "./components/shared/StatusWithTimestamp";

const LeadStatusDonut = dynamic(() => import("./components/shared/LeadStatusDonut"), {
  ssr: false,
  loading: () => <div className="h-[180px] rounded-2xl bg-gray-100 animate-pulse" />,
});

export default function CSRPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("today");
  const [page, setPage] = useState(1);
  const [monthFrom, setMonthFrom] = useState("");
  const [monthTo, setMonthTo]     = useState("");
  const [showAddLead, setShowAddLead] = useState(false);

  const [stateFilter, setStateFilter] = useState("");
  const [timezoneFilter, setTimezoneFilter] = useState("");
  const [phoneFilter, setPhoneFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [tradeFilter, setTradeFilter]   = useState("");
  const [tradeOptions, setTradeOptions] = useState<string[]>([]);
  const [searchQuery, setSearchQuery]   = useState("");
  const [dismissedNotification, setDismissedNotification] = useState(false);

  const hasTableFilters = !!(stateFilter || timezoneFilter || phoneFilter || sourceFilter || tradeFilter || searchQuery.trim());

  const tabKey = (activeTab === "today" ? "pending" : activeTab) as CsrTabKey;
  const { stats, loading: statsLoading, refetch: refetchStats } = useCsrStats(monthFrom || undefined, monthTo || undefined);
  const { leads, setLeads, total: tabTotal, totalPages: serverTotalPages, loading: tabLoading, refetch: refetchTab } =
    useCsrTabLeads(tabKey, page, monthFrom || undefined, monthTo || undefined, hasTableFilters);
  const loading = statsLoading || tabLoading;
  const refetch = () => { void refetchStats(); void refetchTab(true); };

  const { updateLead, addNote, onNoteUpdated, onNoteDeleted } = useLeadActions(setLeads);

  const [viewingLead, setViewingLead] = useState<Lead | null>(null);

  useOpenLeadFromQuery(leads, setViewingLead, !loading);

  const [showImportantModal,  setShowImportantModal]  = useState(false);
  const [selectedImportantId, setSelectedImportantId] = useState<string | null>(null);
  const [scheduleDate,        setScheduleDate]        = useState("");
  const [scheduleTime,        setScheduleTime]        = useState("");
  const [selectedTimezone,    setSelectedTimezone]    = useState("America/New_York");
  const [importantNote,       setImportantNote]       = useState("");

  const [showInterestedModal,  setShowInterestedModal]  = useState(false);
  const [selectedInterestedId, setSelectedInterestedId] = useState<string | null>(null);
  const [selectedServices,     setSelectedServices]     = useState<string[]>([]);
  const [serviceSubtypes,      setServiceSubtypes]      = useState<Record<string, string>>({});
  const [serviceModalVariant,  setServiceModalVariant]  = useState<"interested" | "important">("interested");

  const [scopeLead, setScopeLead] = useState<Lead | null>(null);
  const [scopeServices, setScopeServices] = useState<string[]>([]);
  const [scopeSubtypes, setScopeSubtypes] = useState<Record<string, string>>({});

  const [showProjectWonModal, setShowProjectWonModal] = useState(false);
  const [selectedProjectLead, setSelectedProjectLead] = useState<Lead | null>(null);
  const [projectTitle,    setProjectTitle]    = useState("");
  const [projectDeadline, setProjectDeadline] = useState("");
  const [projectBudget,   setProjectBudget]   = useState("");
  const [projectNotes,    setProjectNotes]    = useState("");
  const [projectService,  setProjectService]  = useState("");
  const [projectCode,     setProjectCode]     = useState("");
  const [paidAmount,      setPaidAmount]      = useState("");
  const [email,           setEmail]           = useState("");

  const statCounts = stats ?? {
    pendingCount: 0, importantOnlyCount: 0, scheduledCount: 0, interestedCount: 0,
    projectWonCount: 0, notInterestedCount: 0, notPickedCount: 0, noOwnerCount: 0,
    notInServiceCount: 0, inHouseCount: 0, totalAssigned: 0, totalLeads: 0,
  };

  const visibleLeads = useMemo(() => leads.filter(l => {
    const status = (l.status ?? "").toLowerCase();
    if (status === "close client" || status === "completed" || status === "closed") return false;
    if (!l.hiddenOnMain) return true;
    return status === "pending";
  }), [leads]);

  const tabFiltered = useMemo(() => {
    return visibleLeads.filter(item => {
      const matchesState = matchesStateLocationFilter(item.state, item.phone, stateFilter);
      const matchesPhone = matchesPhoneAreaCodeFilter(item.phone, phoneFilter);
      const matchesTimezone = leadMatchesTimezoneFilter(item, timezoneFilter);
      const matchesSource = sourceFilter
        ? (item.sourceSudoName?.trim().toLowerCase() === sourceFilter.toLowerCase())
        : true;
      const matchesTrade = leadMatchesTradeFilter(item.trade, item.subTrades, tradeFilter);
      const q = searchQuery.trim().toLowerCase();
      const digits = q.replace(/\D/g, "");
      const matchesSearch = !q || [
        item.client,
        item.company,
        item.rawCompany,
        item.phone,
      ].some(v => (v ?? "").toLowerCase().includes(q)) ||
        (digits.length >= 3 && (item.phone ?? "").replace(/\D/g, "").includes(digits));
      return matchesState && matchesPhone && matchesTimezone && matchesSource && matchesTrade && matchesSearch;
    });
  }, [visibleLeads, stateFilter, timezoneFilter, phoneFilter, sourceFilter, tradeFilter, searchQuery]);

  const tabSorted = useMemo(() => sortByOldestNote(tabFiltered), [tabFiltered]);

  const sourceSudoOptions = useMemo(() => {
    const names = new Set<string>();
    visibleLeads.forEach(l => {
      const s = l.sourceSudoName?.trim();
      if (s) names.add(s);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [visibleLeads]);

  const tradeFilterOptions = useMemo(() => {
    const seen = new Set(MASTER_FORMAT_TRADES.map(t => t.toLowerCase()));
    const extras: string[] = [];
    for (const name of tradeOptions) {
      const canon = canonicalTradeName(name);
      const key = canon.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      extras.push(canon);
    }
    for (const lead of visibleLeads) {
      for (const t of leadTradeAndSubtradeNames(lead.trade, lead.subTrades)) {
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        extras.push(t);
      }
    }
    extras.sort((a, b) => a.localeCompare(b));
    return [...MASTER_FORMAT_TRADES, ...extras];
  }, [tradeOptions, visibleLeads]);

  const paginated = hasTableFilters
    ? tabSorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : tabSorted;

  const displayTotalPages = hasTableFilters
    ? Math.max(1, Math.ceil(tabSorted.length / PAGE_SIZE))
    : serverTotalPages;

  const displayTotal = hasTableFilters ? tabSorted.length : tabTotal;

  const pillCount = (tab: string, stat: number) => {
    /* Close Client rows live on Clients — unique count, not project rows / empty Call Data table. */
    if (tab === "projectwon") return stat;
    const isActive = tab === "today"
      ? activeTab === "today" || activeTab === "pending"
      : activeTab === tab;
    if (isActive && !tabLoading) return displayTotal;
    return stat;
  };

  const showInterestedCol = activeTab === "important" || activeTab === "interested";
  const tableColWidths = showInterestedCol ? COL_7_DASHBOARD : COL_6_DASHBOARD;

  useEffect(() => {
    if (page > displayTotalPages) setPage(displayTotalPages);
  }, [page, displayTotalPages]);

  useEffect(() => {
    API.get("/csr/trades").then(res => {
      const names: string[] = (res.data.trades ?? []).map((t: { name: string }) => t.name);
      setTradeOptions(names);
    }).catch(() => {});
  }, []);

  /** Lead left this tab — remove from table immediately */
  const leaveTab = (id: string) => {
    setLeads(prev => prev.filter(l => l.id !== id));
    void refetchStats({ silent: true, force: true });
  };

  const updateStatus = async (id: string, status: string) => {
    if (!status) return;
    const lead = leads.find(i => i.id === id);
    if (!lead) return;

    if (status === "important") {
      const { services, subtypes } = decomposeInterestedServices(lead.interestedService);
      setSelectedImportantId(id);
      setSelectedServices(services);
      setServiceSubtypes(subtypes);
      setServiceModalVariant("important");
      setShowInterestedModal(true);
      return;
    }
    if (status === "schedule call") {
      setSelectedImportantId(id); setSelectedTimezone(lead.timezone || "America/New_York");
      setShowImportantModal(true); return;
    }
    if (status === "interested") {
      setSelectedInterestedId(id);
      setSelectedServices([]);
      setServiceSubtypes({});
      setServiceModalVariant("interested");
      setShowInterestedModal(true);
      return;
    }
    if (status === "Close Client") {
      setSelectedProjectLead(lead);
      setProjectTitle(lead.company !== "N/A" ? lead.company : lead.client);
      setProjectDeadline(""); setProjectBudget(""); setProjectNotes(""); setProjectService("");
      setProjectCode(""); setPaidAmount(""); setEmail(lead.email !== "N/A" ? lead.email : "");
      setShowProjectWonModal(true); return;
    }
    if (status === "Not Interested") {
      try {
        const res = await updateLead(id, { status });
        if (res?.redistributed) toast.success("Lead limit reached — reassigned to another CSR.");
        else leaveTab(id);
      } catch (err) { console.log(err); }
      return;
    }
    if (status === "not picked") {
      try {
        const res = await updateLead(id, { status });
        if (res?.redistributed) toast.success("Lead limit reached — reassigned to another CSR.");
        else leaveTab(id);
      } catch (err) { console.log(err); }
      return;
    }
    if (status === STATUS_NO_OWNER || status === STATUS_NOT_IN_SERVICE || status === STATUS_IN_HOUSE || status === STATUS_NOT_USEFUL) {
      try {
        await updateLead(id, { status });
        leaveTab(id);
      } catch (err) { console.log(err); }
      return;
    }
    try {
      const res = await updateLead(id, { status });
      if (res?.redistributed) toast.success("Lead limit reached — reassigned to another CSR.");
      else leaveTab(id);
    } catch (err) { console.log(err); }
  };

  const saveImportantCall = async () => {
    if (!scheduleDate || !scheduleTime || !selectedImportantId) return;
    try {
      await updateLead(selectedImportantId, {
        status: "important", nextSchedule: scheduleDate,
        nextTime: scheduleTime, timezone: selectedTimezone,
      });
      if (importantNote.trim()) await addNote(selectedImportantId, importantNote.trim());
      leaveTab(selectedImportantId);
    } catch (err) { console.log(err); }
    setShowImportantModal(false);
    setScheduleDate(""); setScheduleTime(""); setSelectedTimezone("America/New_York"); setImportantNote("");
  };

  const saveInterestedCall = async () => {
    if (selectedServices.length === 0) return;
    const interestedService = formatInterestedServices(selectedServices, serviceSubtypes);

    if (serviceModalVariant === "important" && selectedImportantId) {
      try {
        const res = await updateLead(selectedImportantId, {
          status: "important",
          interestedService,
          nextSchedule: "",
          nextTime: "",
        });
        if (res?.redistributed) toast.success("Lead limit reached — reassigned to another CSR.");
        else {
          toast.success("Marked as Important.");
          leaveTab(selectedImportantId);
        }
      } catch (err) { console.log(err); }
      setShowInterestedModal(false);
      setSelectedServices([]);
      setServiceSubtypes({});
      setSelectedImportantId(null);
      return;
    }

    if (!selectedInterestedId) return;
    try {
      await updateLead(selectedInterestedId, {
        status: "interested",
        interestedService,
      });
      leaveTab(selectedInterestedId);
      toast.success("Moved to Interested.");
    } catch (err) { console.log(err); }
    setShowInterestedModal(false);
    setSelectedServices([]);
    setServiceSubtypes({});
    setSelectedInterestedId(null);
  };

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
  };

  const saveScope = async () => {
    if (!scopeLead || scopeServices.length === 0) return;
    const interestedService = formatInterestedServices(scopeServices, scopeSubtypes);
    try {
      await updateLead(scopeLead.id, { interestedService });
      setLeads(prev => prev.map(l =>
        l.id === scopeLead.id ? { ...l, interestedService } : l
      ));
      closeScopeEditor();
      toast.success("Scope updated.");
    } catch (err) {
      console.log(err);
      toast.error("Could not update scope.");
    }
  };

  const saveProjectWon = async () => {
    if (!projectTitle || !projectDeadline || !paidAmount || !selectedProjectLead) return;
    try {
      await updateLead(selectedProjectLead.id, {
        status: "Close Client", projectTitle, projectDeadline, projectCode,
        projectBudget, projectNotes, interestedService: projectService, paidAmount,
        ...(email.trim() && email.trim().toLowerCase() !== "n/a" ? { email: email.trim() } : {}),
      });
      setShowProjectWonModal(false);
      router.push("/csr/active-projects");
    } catch (err) { console.log(err); }
  };

  const projectWonValid = projectTitle.trim() !== "" && projectDeadline !== "" && projectService !== "" && paidAmount.trim() !== "";

  return (
    <div className="min-h-screen bg-[#F5F6FA] dark:bg-crm-bg">
      <TopNavbar />
      <UsaTimezoneClocks />

      <main className={CSR_PAGE_MAIN}>

        {/* ── TODAY IMPORTANT NOTIFICATION ── */}
        {!dismissedNotification && statCounts.scheduledCount > 0 && (
          <div className="mt-3 sm:mt-5 bg-[#FFF7E6] dark:bg-amber-950/30 border border-[#F59E0B]/30 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-start gap-3 sm:gap-4 shadow-sm">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#F59E0B]/15 text-[#B45309] flex items-center justify-center shrink-0 mt-0.5">
              <Bell size={16} className="sm:w-5 sm:h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-[#92400E] dark:text-amber-200 text-[13px] sm:text-[15px]">
                You have {statCounts.scheduledCount} scheduled call{statCounts.scheduledCount > 1 ? "s" : ""} — check Potential Clients → Schedule
              </h4>
            </div>
            <button onClick={() => setDismissedNotification(true)}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-[#F59E0B]/10 text-[#B45309] flex items-center justify-center hover:bg-[#F59E0B]/20 transition-all shrink-0">
              <X size={13} className="sm:w-[15px] sm:h-[15px]" />
            </button>
          </div>
        )}

        {/* ── ANALYTICS ── */}
        <div className="mt-4 sm:mt-7">
          <LeadStatusDonut stats={stats} loading={statsLoading} />
        </div>

        {/* ── ADD LEAD + MONTH (below graph, right) ── */}
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 mt-3 sm:mt-4">
          <MonthRangeFilter
            from={monthFrom}
            to={monthTo}
            onFromChange={v => { setMonthFrom(v); setPage(1); }}
            onToChange={v => { setMonthTo(v); setPage(1); }}
            onClear={() => { setMonthFrom(""); setMonthTo(""); setPage(1); }}
          />
          <button
            type="button"
            onClick={() => setShowAddLead(true)}
            className="flex items-center gap-1.5 h-10 sm:h-[42px] px-4 sm:px-5 rounded-xl sm:rounded-2xl bg-[#1B6FE8] text-white text-xs sm:text-sm font-semibold hover:bg-[#a30f27] shrink-0 shadow-sm"
          >
            <Plus size={14} /> Add Lead
          </button>
        </div>

        {/* ── TABLE SECTION ── */}
        <div className="bg-white dark:bg-crm-surface rounded-2xl sm:rounded-[28px] p-4 sm:p-5 lg:p-6 shadow-sm mt-4 sm:mt-5 border border-gray-100 dark:border-crm-border crm-table-card overflow-visible">
          <div className="flex flex-col gap-3 sm:gap-4 overflow-visible">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg sm:text-[22px] font-bold text-[#0F172A] dark:text-gray-100">Client Calls</h3>
                <p className="text-gray-500 dark:text-gray-400 mt-0.5 text-xs sm:text-[13px]">Manage assigned client calls.</p>
              </div>
              <div className="bg-[#ECFDF3] text-[#027A48] px-3 py-1.5 rounded-xl text-[11px] sm:text-sm font-semibold flex items-center gap-1.5 shrink-0 whitespace-nowrap mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#12B76A]" />Live Tracking
              </div>
            </div>

            <div className="grid w-full items-start gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
              <div className="relative min-w-0 sm:col-span-2 lg:col-span-3 2xl:col-span-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                  placeholder="Search name, company, phone…"
                  className={`h-10 sm:h-[42px] w-full pl-8 pr-8 rounded-xl sm:rounded-2xl border text-xs sm:text-sm outline-none ${
                    searchQuery.trim()
                      ? "border-[#1B6FE8] bg-[#EAF2FE] text-[#1B6FE8]"
                      : "border-gray-200 dark:border-crm-border bg-[#FAFAFA] dark:bg-crm-input text-gray-600 dark:text-crm-text"
                  }`}
                />
                {searchQuery && (
                  <button type="button" onClick={() => { setSearchQuery(""); setPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#1B6FE8]">
                    <X size={12} />
                  </button>
                )}
              </div>
              <StateFilterDropdown compact fullWidth value={stateFilter} onChange={v => { setStateFilter(v); setPage(1); }} />
              <TimezoneFilterDropdown compact fullWidth value={timezoneFilter} onChange={v => { setTimezoneFilter(v); setPage(1); }} />
              <SourceSudoFilterDropdown compact fullWidth value={sourceFilter} options={sourceSudoOptions} onChange={v => { setSourceFilter(v); setPage(1); }} />
              <PhoneAreaCodeFilterInput fullWidth value={phoneFilter} onChange={v => { setPhoneFilter(v); setPage(1); }} />
              <TradeFilterDropdown
                compact
                fullWidth
                value={tradeFilter}
                options={tradeFilterOptions}
                onChange={v => { setTradeFilter(v); setPage(1); }}
              />
            </div>
            {hasTableFilters && tabTotal > CSR_FILTER_BATCH_SIZE && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                Filters search the most recent {CSR_FILTER_BATCH_SIZE} leads in this tab. Clear filters to browse all pages.
              </p>
            )}
          </div>

          {/* ── TABS ── */}
          <div className="mt-4 sm:mt-5 mb-4 sm:mb-7 space-y-3">
            {[
              {
                label: "Today's queue",
                tabs: [
                  { tab:"today",         label:"Today / Pending", short:"Today",    count: pillCount("today", statCounts.pendingCount),       icon:<PhoneCall      size={13}/>, active:"bg-[#1B6FE8] text-white shadow-md shadow-red-500/25 ring-1 ring-[#1B6FE8]/40",  inactive:"bg-zinc-200 text-zinc-800 dark:bg-zinc-500/25 dark:text-zinc-100 ring-1 ring-zinc-300/80 dark:ring-zinc-400/30"   },
                  { tab:"notpicked",     label:"Not Picked",     short:"Not Pick", count: pillCount("notpicked", statCounts.notPickedCount),     icon:<Clock3         size={13}/>, active:"bg-orange-500 text-white shadow-md shadow-orange-500/30",          inactive:"bg-orange-100 text-orange-700 dark:bg-orange-500/25 dark:text-orange-300 ring-1 ring-orange-300/70 dark:ring-orange-400/35"  },
                  { tab:"notinterested", label:"Not Interested", short:"Not Int.", count: pillCount("notinterested", statCounts.notInterestedCount), icon:<CircleCheckBig size={13}/>, active:"bg-slate-600 text-white shadow-md shadow-slate-500/25",            inactive:"bg-slate-200 text-slate-700 dark:bg-slate-500/30 dark:text-slate-200 ring-1 ring-slate-300/80 dark:ring-slate-400/35"  },
                ],
              },
              {
                label: "Follow-up & pipeline",
                tabs: [
                  { tab:"noowner",      label:"No Owner",     short:"No Owner", count: pillCount("noowner", statCounts.noOwnerCount),      icon:<UserX        size={13}/>, active:"bg-yellow-500 text-white shadow-md shadow-yellow-500/30", inactive:"bg-yellow-100 text-yellow-800 dark:bg-yellow-500/25 dark:text-yellow-300 ring-1 ring-yellow-300/70 dark:ring-yellow-400/35"   },
                  { tab:"notinservice", label:"Not In Svc",   short:"Not Svc",  count: pillCount("notinservice", statCounts.notInServiceCount), icon:<Ban          size={13}/>, active:"bg-violet-600 text-white shadow-md shadow-violet-500/30", inactive:"bg-violet-100 text-violet-700 dark:bg-violet-500/25 dark:text-violet-300 ring-1 ring-violet-300/70 dark:ring-violet-400/35" },
                  { tab:"inhouse",      label:"In House",     short:"In House", count: pillCount("inhouse", statCounts.inHouseCount),      icon:<Home         size={13}/>, active:"bg-teal-600 text-white shadow-md shadow-teal-500/30",    inactive:"bg-teal-100 text-teal-800 dark:bg-teal-500/25 dark:text-teal-300 ring-1 ring-teal-300/70 dark:ring-teal-400/35"   },
                  { tab:"important",    label:"Important",    short:"Important",count: pillCount("important", statCounts.importantOnlyCount),icon:<AlertTriangle size={13}/>, active:"bg-rose-600 text-white shadow-md shadow-rose-500/30",   inactive:"bg-rose-100 text-rose-700 dark:bg-rose-500/25 dark:text-rose-300 ring-1 ring-rose-300/70 dark:ring-rose-400/35"   },
                  { tab:"schedule",     label:"Schedule",     short:"Schedule", count: pillCount("schedule", statCounts.scheduledCount),    icon:<CalendarDays size={13}/>, active:"bg-sky-500 text-white shadow-md shadow-sky-500/30",     inactive:"bg-sky-100 text-sky-700 dark:bg-sky-500/25 dark:text-sky-300 ring-1 ring-sky-300/70 dark:ring-sky-400/35"   },
                  { tab:"interested",   label:"Interested",   short:"Interested",count: pillCount("interested", statCounts.interestedCount),  icon:<Users        size={13}/>, active:"bg-[#1B6FE8] text-white shadow-md shadow-red-500/30",   inactive:"bg-red-100 text-red-700 dark:bg-red-500/25 dark:text-red-300 ring-1 ring-red-300/70 dark:ring-red-400/35"   },
                  { tab:"projectwon",   label:"Close Client", short:"Closed",   count: pillCount("projectwon", statCounts.projectWonCount),   icon:<CircleCheckBig size={13}/>, active:"bg-emerald-600 text-white shadow-md shadow-emerald-500/30", inactive:"bg-emerald-100 text-emerald-800 dark:bg-emerald-500/25 dark:text-emerald-300 ring-1 ring-emerald-300/70 dark:ring-emerald-400/35"},
                ],
              },
            ].map(group => (
              <div key={group.label}>
                <p className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5 px-0.5">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {group.tabs.map(btn => {
                    const isActive =
                      btn.tab === "today"
                        ? activeTab === "today" || activeTab === "pending"
                        : activeTab === btn.tab;
                    return (
                      <button
                        key={btn.tab}
                        type="button"
                        onClick={() => {
                          setActiveTab(btn.tab === "today" ? "today" : btn.tab);
                          setPage(1);
                          setPhoneFilter("");
                        }}
                        className={`min-h-[40px] sm:min-h-[42px] flex-1 basis-[9.5rem] min-w-[7.25rem] max-w-full px-2 sm:px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 text-[11px] sm:text-[12px] font-semibold transition-all overflow-hidden ${
                          isActive ? btn.active : btn.inactive
                        }`}
                      >
                        <span className="shrink-0">{btn.icon}</span>
                        <span className="truncate min-w-0 hidden sm:inline">{btn.label}</span>
                        <span className="truncate min-w-0 sm:hidden">{btn.short}</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-bold shrink-0 ${
                          isActive ? "bg-white/25 text-white" : "bg-black/10 dark:bg-white/20"
                        }`}>{btn.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* ── TABLE ── */}
          <div className="overflow-x-hidden rounded-xl sm:rounded-2xl border border-gray-100 dark:border-crm-border">
            <table className={CSR_TABLE_CLASS}>
              <CsrColGroup widths={tableColWidths} />
              <thead className={CSR_THEAD}>
                <tr>
                  <th className={CSR_TH}>Client Name</th>
                  <th className={CSR_TH}>Trades</th>
                  <th className={CSR_TH}>Phone</th>
                  {showInterestedCol && <th className={CSR_TH}>Interested In</th>}
                  <th className={CSR_TH}>Status</th>
                  <th className={CSR_TH}>Notes</th>
                  <th className={CSR_TH}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1,2,3,4,5].map(i => (
                    <tr key={i} className="border-t border-gray-100">
                      {Array.from({ length: showInterestedCol ? 7 : 6 }).map((_, j) => (
                        <td key={j} className="py-4 sm:py-5 px-3 sm:px-5">
                          <div className="h-3.5 sm:h-4 bg-gray-100 rounded animate-pulse w-16 sm:w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : tabSorted.length > 0 ? paginated.map((currentLink, idx) => (
                  <tr key={currentLink.id} className="border-t border-gray-100 dark:border-crm-border bg-white dark:bg-crm-surface hover:bg-[#FAFAFA] dark:hover:bg-crm-surface-raised transition-colors">

                    <td className={CSR_TD_POPOVER}>
                      <ClientNameCell
                        lead={currentLink}
                        index={(page - 1) * PAGE_SIZE + idx + 1}
                        showIndex
                        showEye
                        onView={() => setViewingLead(currentLink)}
                      />
                    </td>

                    <td className={CSR_TD_POPOVER}>
                      <TradesCell
                        trade={currentLink.trade}
                        subTrades={currentLink.subTrades}
                        tradeNotes={currentLink.tradeNotes}
                        extraTrades={tradeFilterOptions}
                        onSave={async next => {
                          await updateLead(currentLink.id, next);
                        }}
                      />
                    </td>

                    {/* PHONE — number + area-code TZ (company TZ stays on name) */}
                    <td className={`${CSR_TD_POPOVER} text-[12px] sm:text-[14px] font-medium text-[#0F172A] dark:text-crm-text`}>
                      {(() => {
                        const phones = collectLeadPhones(currentLink.phone, currentLink.subContacts);
                        return (
                          <PhoneWithTzCell
                            phone={phones[0] ?? currentLink.phone}
                            allPhones={phones}
                            dial={{ leadId: currentLink.id, clientName: currentLink.company || currentLink.client }}
                          />
                        );
                      })()}
                    </td>

                    {showInterestedCol && (
                      <td className={CSR_TD}>
                        <InterestedServicesCell
                          interestedService={currentLink.interestedService}
                          onEdit={() => openScopeEditor(currentLink)}
                        />
                      </td>
                    )}

                    {/* STATUS */}
                    <td className={CSR_TD}>
                      {activeTab === "schedule" && currentLink.nextSchedule ? (
                        <div>
                          <div className="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-sm font-semibold w-fit whitespace-nowrap bg-[#EAF5FF] text-[#0B84F3]">
                            Scheduled
                          </div>
                          <p className="text-[10px] sm:text-[11px] text-gray-500 mt-1">
                            {currentLink.nextSchedule}{currentLink.nextTime ? ` · ${currentLink.nextTime}` : ""}
                          </p>
                        </div>
                      ) : (
                      <StatusWithTimestamp
                        status={currentLink.status}
                        statusUpdatedAt={currentLink.statusUpdatedAt}
                        showTimestamp={false}
                      />
                      )}
                    </td>

                    {/* NOTES */}
                    <td className={CSR_TD_TOP}>
                      <CommentCell
                        id={currentLink.id}
                        noteHistory={currentLink.noteHistory}
                        noteCount={currentLink.noteCount}
                        comment={currentLink.comments?.trim() || undefined}
                        onAddNote={addNote}
                        onNoteUpdated={onNoteUpdated}
                        onNoteDeleted={onNoteDeleted}
                      />
                    </td>

                    {/* ACTION */}
                    <td className={CSR_TD}>
                      <div className="relative w-full min-w-[160px]">
                        <DialGatedSelect
                          leadId={currentLink.id}
                          onPick={status => { void updateStatus(currentLink.id, status); }}
                          className="appearance-none h-10 sm:h-[46px] w-full rounded-xl sm:rounded-2xl border border-gray-200 dark:border-crm-border bg-white dark:bg-crm-input px-3 sm:px-4 pr-9 sm:pr-11 text-[12px] sm:text-[14px] font-semibold text-[#0F172A] dark:text-crm-text outline-none"
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
                        <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                          <ChevronDown size={14} className="sm:w-[18px] sm:h-[18px]" />
                        </div>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={showInterestedCol ? 7 : 6} className="py-14 sm:py-20 text-center">
                      <h2 className="text-lg sm:text-2xl font-bold text-[#0F172A]">No Data Found</h2>
                      <p className="text-gray-500 mt-2 sm:mt-3 text-xs sm:text-sm">
                        {stateFilter && timezoneFilter && sourceFilter
                          ? `No leads in "${stateFilter}" (${timezoneFilter}) from source "${sourceFilter}".`
                          : stateFilter && timezoneFilter
                          ? `No leads in "${stateFilter}" (${timezoneFilter}).`
                          : stateFilter && sourceFilter
                          ? `No leads in "${stateFilter}" from source "${sourceFilter}".`
                          : timezoneFilter && sourceFilter
                          ? `No leads with ${timezoneFilter} phone area code from source "${sourceFilter}".`
                          : sourceFilter
                          ? `No leads from source "${sourceFilter}".`
                          : stateFilter
                          ? `No leads in "${stateFilter}".`
                          : timezoneFilter
                          ? `No leads with ${timezoneFilter} phone area code.`
                          : phoneFilter
                          ? `No leads matching phone code "${phoneFilter}".`
                          : statCounts.totalLeads > 0 && tabSorted.length === 0
                          ? "Your leads are on other pages — try Not Interested, Potential Clients, or Clients."
                          : (activeTab === "today" || activeTab === "pending") && statCounts.totalLeads > 0
                          ? "No pending leads in Today's queue. Try another tab above."
                          : "No calls available in this category."}
                      </p>
                      {(stateFilter || timezoneFilter || phoneFilter || sourceFilter || tradeFilter || searchQuery) && (
                        <button
                          onClick={() => { setStateFilter(""); setTimezoneFilter(""); setPhoneFilter(""); setSourceFilter(""); setTradeFilter(""); setSearchQuery(""); setPage(1); }}
                          className="mt-3 sm:mt-4 h-9 sm:h-10 px-4 sm:px-5 rounded-xl sm:rounded-2xl bg-[#EAF2FE] text-[#1B6FE8] text-xs sm:text-sm font-semibold hover:bg-[#fce8ec] transition-colors"
                        >
                          Clear filters
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION */}
          <div className="flex items-center justify-between px-1 pt-4 mt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              {tabSorted.length === 0 ? "0" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, tabSorted.length)}`} of {displayTotal}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="w-9 h-9 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 flex items-center justify-center text-lg transition-all">‹</button>
              <span className="text-sm font-semibold text-gray-700 min-w-[60px] text-center">{page} / {displayTotalPages}</span>
              <button onClick={() => setPage(p => Math.min(displayTotalPages, p + 1))} disabled={page === displayTotalPages}
                className="w-9 h-9 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 flex items-center justify-center text-lg transition-all">›</button>
            </div>
          </div>
        </div>

        {/* ══ IMPORTANT MODAL ══ */}
        {showImportantModal && (
          <ImportantCallModal
            date={scheduleDate} onDateChange={setScheduleDate}
            time={scheduleTime} onTimeChange={setScheduleTime}
            timezone={selectedTimezone} onTimezoneChange={setSelectedTimezone}
            note={importantNote} onNoteChange={setImportantNote}
            onClose={() => { setShowImportantModal(false); setImportantNote(""); }}
            onSave={saveImportantCall}
          />
        )}

        {/* ══ INTERESTED MODAL ══ */}
        {showInterestedModal && (
          <InterestedModal
            variant={serviceModalVariant}
            services={selectedServices}
            onServicesChange={setSelectedServices}
            serviceSubtypes={serviceSubtypes}
            onServiceSubtypesChange={setServiceSubtypes}
            onClose={() => {
              setShowInterestedModal(false);
              setSelectedServices([]);
              setServiceSubtypes({});
              setSelectedInterestedId(null);
              setSelectedImportantId(null);
            }}
            onSave={saveInterestedCall}
          />
        )}

        {scopeLead && (
          <InterestedModal
            mode="edit"
            services={scopeServices}
            onServicesChange={setScopeServices}
            serviceSubtypes={scopeSubtypes}
            onServiceSubtypesChange={setScopeSubtypes}
            onClose={closeScopeEditor}
            onSave={() => void saveScope()}
          />
        )}

        <AddLeadModal
          open={showAddLead}
          onClose={() => setShowAddLead(false)}
          onAdded={() => { void refetch(); invalidateCsrDashboardCache(); invalidateAllCsrListCaches(); }}
        />

        {/* ══ CLOSE CLIENT MODAL ══ */}
        {showProjectWonModal && selectedProjectLead && (
          <ProjectWonModal
            lead={selectedProjectLead}
            email={email} onEmailChange={setEmail}
            projectCode={projectCode} onProjectCodeChange={setProjectCode}
            title={projectTitle} onTitleChange={setProjectTitle}
            service={projectService} onServiceChange={setProjectService}
            deadline={projectDeadline} onDeadlineChange={setProjectDeadline}
            budget={projectBudget} onBudgetChange={setProjectBudget}
            paidAmount={paidAmount} onPaidAmountChange={setPaidAmount}
            notes={projectNotes} onNotesChange={setProjectNotes}
            isValid={projectWonValid}
            onClose={() => setShowProjectWonModal(false)}
            onSave={saveProjectWon}
          />
        )}

        {/* ══ LEAD DETAIL MODAL ══ */}
        {viewingLead && (
          <LeadDetailModal
            lead={{
              id: viewingLead.id,
              name:    viewingLead.client,
              company: viewingLead.company !== "N/A" ? viewingLead.company : undefined,
              phone:   viewingLead.phone   !== "N/A" ? viewingLead.phone   : undefined,
              email:   viewingLead.email   !== "N/A" ? viewingLead.email   : undefined,
              website: viewingLead.website || undefined,
              state:   viewingLead.state   || undefined,
              status:  viewingLead.status,
              interestedService: viewingLead.interestedService,
              followUpNotes:     viewingLead.followUpNotes,
              nextSchedule:      viewingLead.nextSchedule || undefined,
              nextTime:          viewingLead.nextTime     || undefined,
              timezone:          viewingLead.timezone     || undefined,
              noteHistory:       viewingLead.noteHistory,
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
            onNoteAdded={(id, note) => {
              setLeads(prev => prev.map(i => i.id === id ? { ...i, noteHistory: [...i.noteHistory, note] } : i));
            }}
            onSubContactAdded={(id, sub) => {
              setLeads(prev => prev.map(i => i.id === id ? { ...i, subContacts: [...i.subContacts, sub] } : i));
            }}
            onSubContactDeleted={(id, subId) => {
              setLeads(prev => prev.map(i => i.id === id ? { ...i, subContacts: i.subContacts.filter(s => s.id !== subId) } : i));
            }}
          />
        )}
      </main>
    </div>
  );
}
