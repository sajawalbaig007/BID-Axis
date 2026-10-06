"use client";

import { Suspense, useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import API, { apiErrorMessage } from "@/lib/api";
import { getAdminTabCounts } from "@/lib/adminSummaryCache";
import { CsrColGroup, CSR_TABLE_CLASS, CSR_THEAD, CSR_TH, CSR_TD, CSR_TD_TOP_POPOVER, COL_6_ADMIN, COL_7_CLOSED, COL_7_SCHEDULE_ADMIN } from "@/app/csr/components/shared/csrTableStyles";
import { FilterableTh, textColumnMatch, useColumnFilters } from "@/app/components/table/columnFilters";
import CapsuleTabs, { type CapsuleTabItem } from "@/app/components/CapsuleTabs";
import toast, { Toaster } from "react-hot-toast";
import ExtraProjectCodesPopup from "./ExtraProjectCodesPopup";
import { collectLeadEmails } from "@/app/csr/utils/parseEmails";
import { collectLeadPhones } from "@/app/csr/utils/parsePhones";
import { formatAdminLead } from "../utils/formatAdminLead";
import { adminLeadStatusBadgeClass, adminLeadStatusLabel } from "../utils/leadStatus";

import {
  Search,
  Plus,
  Building2,
  MoreVertical,
  Eye,
  Trash2,
  HeartHandshake,
  BadgeCheck,
  Users,
  X,
  CircleAlert,
  CalendarDays,
  ArrowRightLeft,
  Check,
  Layers,
  ChevronUp,
  ChevronDown,
  FolderPlus,
} from "lucide-react";

/* ─── COMPONENTS ─── */
import { StaffSidebar } from "@/app/hooks/useStaffSidebar";
import { useStaffBase } from "@/app/hooks/useStaffBase";
import DashboardSidebar from "../components/layout/Sidebar";
import DashboardNavbar  from "../components/layout/Navbar";
import CommentCell from "../../csr/components/shared/CommentCell";
import EmailWithExtraCell from "../../csr/components/shared/EmailWithExtraCell";
import PhoneWithTzCell from "../../csr/components/shared/PhoneWithTzCell";
import type { NoteEntry } from "../../csr/hooks/useLeadsData";
import { bumpToFront } from "@/lib/bumpToFront";
import StateFilterDropdown from "../../csr/components/shared/StateFilterDropdown";
import PhoneAreaCodeFilterInput from "../../csr/components/shared/PhoneAreaCodeFilterInput";
import { STATE_AREA_CODES } from "@/app/csr/constants/locations";
import LeadDetailModal from "../../csr/components/LeadDetailModal";
import ProjectWorkbenchModal from "@/app/components/projects/ProjectWorkbenchModal";
import { emptyWorkbench, type ProjectWorkbenchData } from "@/lib/projectFields";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip } from "recharts";
import {
  canAdminReassign,
} from "@/app/csr/utils/potentialClientBuckets";

/* ─── TYPES ─── */
type Client = {
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
  noteHistory: NoteEntry[];
  createdAt: string;
  extraProjectCount: number;
  extraProjects: { code: string; scope: string }[];
  subContacts: { id: string; name: string; designation?: string; phone?: string; email?: string }[];
};

const PAGE_SIZE = 50;
type ClientView = "all" | "important" | "schedule" | "interested" | "closed";
type LeadSortField = "notes" | "clientCode";

function SortPair({
  field,
  sortBy,
  sortDir,
  onSort,
}: {
  field: LeadSortField;
  sortBy: LeadSortField;
  sortDir: "asc" | "desc";
  onSort: (field: LeadSortField, dir: "asc" | "desc") => void;
}) {
  const active = sortBy === field;
  return (
    <span className="inline-flex flex-col -my-0.5 shrink-0" title={`Sort by ${field === "clientCode" ? "client code" : "notes"}`}>
      <button
        type="button"
        aria-label={`${field === "clientCode" ? "Client code" : "Notes"} ascending`}
        onClick={e => { e.stopPropagation(); onSort(field, "asc"); }}
        className={`leading-none p-0 ${active && sortDir === "asc" ? "text-white" : "text-white/35 hover:text-white/80"}`}
      >
        <ChevronUp size={10} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        aria-label={`${field === "clientCode" ? "Client code" : "Notes"} descending`}
        onClick={e => { e.stopPropagation(); onSort(field, "desc"); }}
        className={`leading-none p-0 -mt-0.5 ${active && sortDir === "desc" ? "text-white" : "text-white/35 hover:text-white/80"}`}
      >
        <ChevronDown size={10} strokeWidth={2.5} />
      </button>
    </span>
  );
}

function clientField(value: string | null | undefined) {
  const text = (value ?? "").trim();
  return !text || text === "N/A" ? "" : text;
}

function isClientView(v: string | null): v is ClientView {
  return v === "all" || v === "important" || v === "schedule" || v === "interested" || v === "closed";
}

function LeadsPageFallback() {
  return (
    <div className="flex min-h-screen bg-[#F5F6FA] dark:bg-crm-bg">
      <DashboardSidebar />
      <main className="flex-1 p-6 mt-[var(--app-header-h,64px)]">
        <DashboardNavbar />
        <div className="flex items-center justify-center h-[50vh]">
          <div className="w-12 h-12 border-4 border-[#1B6FE8] border-t-transparent rounded-full animate-spin" />
        </div>
      </main>
    </div>
  );
}

export default function ClientsPage() {
  return (
    <Suspense fallback={<LeadsPageFallback />}>
      <ClientsPageContent />
    </Suspense>
  );
}

/* ─── STATES ─── */
function ClientsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const staffBase = useStaffBase();
  const urlTab = searchParams.get("tab");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [tableRefreshing, setTableRefreshing] = useState(false);
  const hasRowsRef = useRef(false);
  const [page,    setPage]    = useState(1);

  const [view, setView] = useState<ClientView>("important");
  const effectiveView: ClientView = isClientView(urlTab) ? urlTab : view;
  const [csrFilter, setCsrFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [phoneFilter, setPhoneFilter] = useState("");
  const [openMenu, setOpenMenu] = useState<number | null>(null);

  const [impSearch, setImpSearch] = useState("");
  const [impFilterDate, setImpFilterDate] = useState("");

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  
  /* ── Reassign to CSR ── */
  type ReassignCSR = { id: string; name: string; csrCode: string | null };
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignClient,    setReassignClient]    = useState<Client | null>(null);
  const [reassignCsrList,   setReassignCsrList]   = useState<ReassignCSR[]>([]);
  const [reassignTargetId,  setReassignTargetId]  = useState("");
  const [isReassigning,     setIsReassigning]     = useState(false);
  const [reassignCsrLoaded, setReassignCsrLoaded] = useState(false);
  const [addProjectClient, setAddProjectClient] = useState<Client | null>(null);
  const [addProjectSaving, setAddProjectSaving] = useState(false);
  const [projectCsrs, setProjectCsrs] = useState<ReassignCSR[]>([]);

  const openReassignModal = async (client: Client) => {
    setReassignClient(client);
    setReassignTargetId("");
    setShowReassignModal(true);
    try {
      const res = await API.get("/admin/csrs");
      setReassignCsrList(res.data.csrs ?? []);
      setReassignCsrLoaded(true);
    } catch { toast.error("Failed to load CSRs."); }
  };

  const openAddProject = (client: Client) => {
    setAddProjectClient(client);
    if (projectCsrs.length > 0) return;
    API.get("/admin/csrs")
      .then((res) => setProjectCsrs(res.data.csrs ?? []))
      .catch(() => {});
  };

  const saveProjectFromClient = async (data: ProjectWorkbenchData) => {
    if (!addProjectClient) return;
    setAddProjectSaving(true);
    try {
      await API.post("/admin/project", {
        sourceClientId: addProjectClient.id,
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
        deadlineTiming: data.deadlineTiming || undefined,
        projectBudget: data.projectBudget.trim() || undefined,
        projectNotes: data.projectNotes?.trim() || undefined,
        projectPhase: data.projectPhase,
        takeoffDeadline: data.takeoffDeadline || undefined,
        pricingDeadline: data.pricingDeadline || undefined,
        qaDeadline: data.qaDeadline || undefined,
        projectPayments: data.projectPayments,
        csrId: data.assignedTo || undefined,
        projectSource: data.projectSource?.trim() || undefined,
        status: "Close Client",
      });
      toast.success("Project added — now in Active Projects");
      setAddProjectClient(null);
      setRefreshToken((n) => n + 1);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to add project"));
    } finally {
      setAddProjectSaving(false);
    }
  };

  const confirmReassign = async () => {
    if (!reassignClient || !reassignTargetId) return;
    setIsReassigning(true);
    try {
      await API.put(`/admin/lead/${reassignClient.id}/reassign`, { csrId: reassignTargetId });
      const name = reassignCsrList.find(c => c.id === reassignTargetId)?.name ?? "another CSR";
      const code = reassignCsrList.find(c => c.id === reassignTargetId)?.csrCode ?? null;
      toast.success(`Lead reassigned to ${name}.`);
      setClients(prev => prev.map(c =>
        c.id === reassignClient.id ? { ...c, csr: name, csrCode: code } : c
      ));
      setShowReassignModal(false);
      setReassignClient(null);
      setRefreshToken(t => t + 1);
    } catch { toast.error("Failed to reassign lead."); }
    finally { setIsReassigning(false); }
  };

  const emptyClient: Client = {
    id: "",
    clientName: "",
    email: "",
    ownerName: "",
    contact: "",
    contactPhones: [],
    emails: [],
    company: "",
    website: "",
    parentCompany: "",
    scope: "",
    lastEmail: "",
    lastCall: "",
    lastComment: "",
    status: "Closed",
    rawStatus: "closed",
    csr: "",
    nextFollowup: "",
    time: "",
    timezone: "",
    isOldClient: false,
    extraProjectCount: 0,
    extraProjects: [],
    subContacts: [],
    state: "",
    clientCode: null,
    projectCode: null,
    noteCount: 0,
    noteHistory: [],
    createdAt: "",
  };

  const [newClient, setNewClient] = useState<Client>(emptyClient);
  const [addCsrId, setAddCsrId] = useState("");

  const [tabCounts, setTabCounts] = useState({
    all: 0, important: 0, schedule: 0, interested: 0, closed: 0,
  });
  const [totalRecords, setTotalRecords] = useState(0);
  const [recordsView, setRecordsView] = useState<ClientView | null>(null);
  const [csrOptions, setCsrOptions] = useState<{ id: string; name: string }[]>([]);
  const [searchDebounced, setSearchDebounced] = useState("");
  const [impSearchDebounced, setImpSearchDebounced] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [sortBy, setSortBy] = useState<"notes" | "clientCode">("notes");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const load = () => {
      API.get("/admin/csrs")
        .then(res => setCsrOptions(
          (res.data.csrs ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })),
        ))
        .catch(() => {});
    };
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => setImpSearchDebounced(impSearch), 400);
    return () => clearTimeout(t);
  }, [impSearch]);

  const activeSearchQ = effectiveView === "important" || effectiveView === "schedule"
    ? impSearchDebounced
    : searchDebounced;

  const filterAreaCodes = useMemo(() => {
    if (!stateFilter.trim()) return [] as string[];
    return STATE_AREA_CODES[stateFilter] ?? [];
  }, [stateFilter]);

  const scheduleDateForCounts =
    effectiveView === "schedule" && impFilterDate ? impFilterDate : undefined;

  // Refresh tab counts when search / location / CSR filters change (not on every tab click)
  useEffect(() => {
    let cancelled = false;
    const filters = {
      search: activeSearchQ.trim() || undefined,
      state: stateFilter.trim() || undefined,
      phone: phoneFilter.replace(/\D/g, "") || undefined,
      areaCodes: filterAreaCodes.length ? filterAreaCodes : undefined,
      scheduleDate: scheduleDateForCounts,
      csrId: csrFilter !== "all" ? csrFilter : undefined,
    };
    const hasFilters = !!(
      filters.search ||
      filters.state ||
      filters.phone ||
      filters.scheduleDate ||
      (filters.areaCodes?.length ?? 0) > 0 ||
      filters.csrId
    );

    void getAdminTabCounts(true, hasFilters ? filters : undefined)
      .then(tc => {
        if (!cancelled) setTabCounts(tc);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [
    activeSearchQ,
    stateFilter,
    phoneFilter,
    filterAreaCodes,
    scheduleDateForCounts,
    csrFilter,
    refreshToken,
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadClients = async () => {
      const keepTable = hasRowsRef.current;
      if (keepTable) setTableRefreshing(true);
      else setLoading(true);
      try {
        const params = new URLSearchParams({
          view: effectiveView,
          page: String(page),
          limit: String(PAGE_SIZE),
          sort: sortBy,
          dir: sortDir,
        });
        if (csrFilter !== "all") params.set("csrId", csrFilter);
        if (activeSearchQ.trim()) params.set("search", activeSearchQ.trim());
        if (effectiveView === "schedule" && impFilterDate) {
          params.set("scheduleDate", impFilterDate);
        }
        if (stateFilter.trim()) {
          params.set("state", stateFilter.trim());
          if (filterAreaCodes.length) params.set("areaCodes", filterAreaCodes.join(","));
        }
        const phoneDigits = phoneFilter.replace(/\D/g, "");
        if (phoneDigits) params.set("phone", phoneDigits);

        const res = await API.get(`/admin/clients?${params}`);
        if (cancelled) return;
        const seenIds = new Set<string>();
        const uniqueLeads = (res.data.leads ?? []).filter((l: { id: string }) => {
          if (seenIds.has(l.id)) return false;
          seenIds.add(l.id);
          return true;
        });
        setClients(uniqueLeads.map(formatAdminLead));
        setTotalRecords(res.data.total ?? 0);
        setRecordsView(effectiveView);
        hasRowsRef.current = uniqueLeads.length > 0;
      } catch {
        if (!cancelled) toast.error("Failed to fetch clients");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setTableRefreshing(false);
          setInitialLoad(false);
        }
      }
    };

    void loadClients();
    return () => { cancelled = true; };
  }, [
    effectiveView,
    page,
    csrFilter,
    activeSearchQ,
    impFilterDate,
    stateFilter,
    phoneFilter,
    filterAreaCodes,
    refreshToken,
    sortBy,
    sortDir,
  ]);

  const displayCount = recordsView === effectiveView ? totalRecords : tabCounts[effectiveView];
  const totalPagesClients = Math.max(1, Math.ceil(displayCount / PAGE_SIZE));

  const leadColPredicates = useMemo(() => ({
    client:  (c: ReturnType<typeof formatAdminLead>, v: string) =>
      textColumnMatch(c.clientName, v) ||
      textColumnMatch(c.email, v) ||
      textColumnMatch(c.contact, v) ||
      textColumnMatch(c.company, v) ||
      textColumnMatch(c.createdAt, v),
    scope:   (c: ReturnType<typeof formatAdminLead>, v: string) => textColumnMatch(c.scope, v),
    csr:     (c: ReturnType<typeof formatAdminLead>, v: string) => textColumnMatch(c.csr, v),
    status:  (c: ReturnType<typeof formatAdminLead>, v: string) => textColumnMatch(c.status, v),
    schedule:(c: ReturnType<typeof formatAdminLead>, v: string) => textColumnMatch(c.nextFollowup, v),
    time:    (c: ReturnType<typeof formatAdminLead>, v: string) => textColumnMatch(c.time, v),
    type:    (c: ReturnType<typeof formatAdminLead>, v: string) => textColumnMatch(c.rawStatus, v),
  }), []);

  const { filters: leadColFilters, setFilter: setLeadColFilter, filtered: colFilteredClients, hasActiveFilters } =
    useColumnFilters(
      // State / phone already applied server-side — keep light client pass for consistency
      useMemo(() => clients, [clients]),
      leadColPredicates,
    );

  // Pill counts use the same unique-client total as the table heading.
  const filteredTabCounts = useMemo(() => {
    const counts = { ...tabCounts };
    if (!loading && recordsView === effectiveView) counts[effectiveView] = totalRecords;
    return counts;
  }, [tabCounts, effectiveView, totalRecords, loading, recordsView]);

  const locationFiltersActive = !!(stateFilter.trim() || phoneFilter.trim() || activeSearchQ.trim());

  const visibleTabs = useMemo<CapsuleTabItem<ClientView>[]>(() => {
    const all: CapsuleTabItem<ClientView>[] = [
      { key: "all", label: "All", count: filteredTabCounts.all, icon: Layers },
      { key: "important", label: "Important", count: filteredTabCounts.important, icon: CircleAlert },
      { key: "schedule", label: "Schedule Call", count: filteredTabCounts.schedule, icon: CalendarDays },
      { key: "interested", label: "Interested", count: filteredTabCounts.interested, icon: HeartHandshake },
      { key: "closed", label: "Closed", count: filteredTabCounts.closed, icon: BadgeCheck },
    ];
    if (!(hasActiveFilters || locationFiltersActive)) return all;
    return all.filter(t => t.key === "all" || (t.count ?? 0) > 0);
  }, [filteredTabCounts, hasActiveFilters, locationFiltersActive]);

  const paginatedClients  = colFilteredClients;
  const filteredClients     = colFilteredClients;

  const isScheduleView = effectiveView === "schedule";
  const isClosedView   = effectiveView === "closed";
  const tableMinWidth  = isScheduleView || isClosedView ? "1200px" : "1100px";
  const tableColWidths = isScheduleView ? COL_7_SCHEDULE_ADMIN : isClosedView ? COL_7_CLOSED : COL_6_ADMIN;

  const tableTitle =
    effectiveView === "all"        ? "All Clients"
    : effectiveView === "interested" ? "Interested Clients"
    : effectiveView === "closed"   ? "Closed Clients"
    : effectiveView === "important"? "Important Clients"
    : effectiveView === "schedule" ? "Schedule Call"
    : "All Clients";

  const tableHeaders = isScheduleView
    ? ["Client", "Next Schedule", "Time", "CSR", "Status", "Notes", ""]
    : isClosedView
    ? ["Client", "Type", "Scope", "CSR", "Status", "Notes", ""]
    : ["Client", "Scope", "CSR", "Status", "Notes", ""];

  const headerFilterKey: Record<string, string> = {
    Client: "client", Scope: "scope",
    CSR: "csr", Status: "status", "Next Schedule": "schedule", Time: "time", Type: "type",
  };

  const applyLeadSort = (field: LeadSortField, dir: "asc" | "desc") => {
    setSortBy(field);
    setSortDir(dir);
    if (page !== 1) setPage(1);
  };

  const handleSaveClient = async () => {
    if (!newClient.clientName || !newClient.email || !newClient.company) {
      toast.error("Please fill all required fields.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newClient.email)) {
      toast.error("Please enter valid email.");
      return;
    }
    if (isEditing) {
      setClients((prev) =>
        prev.map((c) => (c.id === newClient.id ? newClient : c))
      );
      toast.success("Client updated successfully.");
    } else {
      try {
        const uiStatus = (newClient.status || "Closed").trim().toLowerCase();
        const status =
          uiStatus === "interested" ? "interested" :
          uiStatus === "important" ? "important" :
          "Close Client";
        const matchedCsr = addCsrId || csrOptions.find(
          c => c.name.trim().toLowerCase() === newClient.csr.trim().toLowerCase(),
        )?.id;
        const res = await API.post("/admin/lead", {
          name:    newClient.clientName.trim(),
          email:   newClient.email.trim(),
          phone:   newClient.contact.trim() || undefined,
          company: newClient.company.trim(),
          status,
          csrId: matchedCsr || undefined,
          interestedService: newClient.scope.trim() || undefined,
          comments: newClient.lastComment.trim() || undefined,
        });
        const created = formatAdminLead(res.data.lead);
        setClients((prev) => [created, ...prev]);
        toast.success("Client added successfully.");
        setPage(1);
        setSearch("");
        setSearchDebounced("");
        if (status === "Close Client") {
          setView("closed");
          router.replace(`${staffBase}/leads?tab=closed`);
        } else if (status === "interested") {
          setView("interested");
          router.replace(`${staffBase}/leads?tab=interested`);
        }
        setRefreshToken(t => t + 1);
      } catch (err) {
        toast.error(apiErrorMessage(err, "Failed to add client."));
        return;
      }
    }
    setShowAddModal(false);
    setIsEditing(false);
    setNewClient(emptyClient);
    setAddCsrId("");
  };

  const handleDeleteClient = async () => {
    if (!clientToDelete || deleting) return;
    setDeleting(true);
    try {
      await API.delete(`/admin/lead/${clientToDelete}`);
      setClients((prev) => prev.filter((c) => c.id !== clientToDelete));
      toast.success("Client deleted successfully.");
      setRefreshToken(t => t + 1);
      setShowDeleteModal(false);
      setClientToDelete(null);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to delete client."));
    } finally {
      setDeleting(false);
    }
  };

  if (initialLoad) {
    return (
      <div className="flex min-h-screen bg-[#F5F6FA] dark:bg-crm-bg">
        <StaffSidebar />
        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden mt-[var(--app-header-h,64px)]">
          <DashboardNavbar />
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-[#1B6FE8] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-500">Loading clients...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F5F6FA] dark:bg-crm-bg">
      <Toaster position="top-right" reverseOrder={false} />
      <StaffSidebar />

      {/* ─── MAIN CONTENT ─── */}
      {/* mt-[72px] for mobile/tablet navbar, lg:mt-0 when sidebar is shown */}
      <main className="flex-1 min-w-0 p-3 sm:p-4 md:p-5 lg:p-6 xl:p-7 2xl:p-8 overflow-x-hidden mt-[var(--app-header-h,64px)]">
        <DashboardNavbar />

        {/* ─── PAGE HEADER ─── */}
        <div className="mb-5 space-y-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-11 h-11 rounded-2xl bg-[#1B6FE8] text-white inline-flex items-center justify-center shrink-0 shadow-sm">
              <HeartHandshake size={18} />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#0F172A] dark:text-crm-text">
                Client Management
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 dark:text-crm-text-muted mt-0.5">
                Manage clients, conversations, and company records.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-3 items-stretch">
            <div className="rounded-2xl border border-slate-200/80 dark:border-crm-border bg-white dark:bg-crm-surface p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] h-full flex items-center justify-center min-h-[188px]">
              <div className="relative w-[180px] h-[180px] sm:w-[200px] sm:h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Important",  value: filteredTabCounts.important  || 0.001 },
                        { name: "Schedule",   value: filteredTabCounts.schedule   || 0.001 },
                        { name: "Interested", value: filteredTabCounts.interested || 0.001 },
                        { name: "Closed",     value: filteredTabCounts.closed     || 0.001 },
                      ]}
                      cx="50%" cy="50%" innerRadius={58} outerRadius={86}
                      paddingAngle={3} dataKey="value"
                    >
                      <Cell fill="#1B6FE8"/>
                      <Cell fill="#0B84F3"/>
                      <Cell fill="#027A48"/>
                      <Cell fill="#065F46"/>
                    </Pie>
                    <RTooltip
                      contentStyle={{ borderRadius:"12px", border:"1px solid #eee", fontSize:"12px" }}
                      formatter={(_, n) => {
                        const total = filteredTabCounts.important + filteredTabCounts.schedule + filteredTabCounts.interested + filteredTabCounts.closed;
                        const val = total === 0 ? 0
                          : n === "Important"  ? filteredTabCounts.important
                          : n === "Schedule"   ? filteredTabCounts.schedule
                          : n === "Interested" ? filteredTabCounts.interested
                          : filteredTabCounts.closed;
                        return [val, String(n)];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] dark:text-crm-text tabular-nums">
                    {filteredTabCounts.important + filteredTabCounts.schedule + filteredTabCounts.interested + filteredTabCounts.closed}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pipeline</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label:"Important",      value: filteredTabCounts.important,  sub:"flagged only",        tone:"red" },
                { label:"Schedule Call",  value: filteredTabCounts.schedule,   sub:"meetings scheduled", tone:"blue" },
                { label:"Interested",     value: filteredTabCounts.interested, sub:"service interest",   tone:"green" },
                { label:"Closed",         value: filteredTabCounts.closed,     sub:"closed deals",       tone:"teal" },
              ].map(s => (
                <div
                  key={s.label}
                  className={`rounded-2xl p-3 sm:p-4 h-full border ${
                    s.tone === "red"
                      ? "bg-gradient-to-br from-[#1B6FE8] to-[#8c0d22] border-[#1B6FE8]/40"
                      : s.tone === "blue"
                        ? "border-sky-100 dark:border-sky-500/20 bg-gradient-to-br from-sky-50 to-white dark:from-sky-950/30 dark:to-crm-surface"
                        : s.tone === "green"
                          ? "border-emerald-100 dark:border-emerald-500/20 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-crm-surface"
                          : "border-teal-100 dark:border-teal-500/20 bg-gradient-to-br from-teal-50 to-white dark:from-teal-950/30 dark:to-crm-surface"
                  }`}
                >
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${s.tone === "red" ? "text-white/60" : "text-slate-400"}`}>{s.label}</p>
                  <p className={`text-2xl sm:text-3xl font-extrabold mt-1 tabular-nums ${s.tone === "red" ? "text-white" : "text-[#0F172A] dark:text-crm-text"}`}>{s.value}</p>
                  <p className={`text-[10px] mt-0.5 ${s.tone === "red" ? "text-white/55" : "text-slate-400"}`}>{s.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── TAB BAR ─── */}
        <div className="mb-4 grid w-full gap-2 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px] items-center">
            <CapsuleTabs
              stretch
              tabs={visibleTabs}
              activeKey={effectiveView as ClientView}
              onChange={key => {
                if (key !== effectiveView) {
                  setLoading(true);
                  setRecordsView(null);
                  hasRowsRef.current = false;
                }
                setView(key);
                setPage(1);
                router.replace(`${staffBase}/leads?tab=${key}`);
              }}
            />

            <div className="relative min-w-0">
              <Users size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select
                value={csrFilter}
                onChange={(e) => {
                  setCsrFilter(e.target.value);
                  setPage(1);
                  setLoading(true);
                  setRecordsView(null);
                  hasRowsRef.current = false;
                }}
                className="h-11 w-full appearance-none border border-gray-200 dark:border-crm-border rounded-xl pl-10 pr-3 text-xs sm:text-sm outline-none focus:border-[#1B6FE8] bg-white dark:bg-crm-input text-gray-700 dark:text-crm-text font-medium"
              >
                <option value="all">All CSR</option>
                {csrOptions.map((csr) => (
                  <option key={csr.id} value={csr.id}>
                    {csr.name}
                  </option>
                ))}
              </select>
            </div>
        </div>

        {/* ─── TABLE VIEWS (all tabs — row layout) ─── */}
        <>
            {/* Search + filters */}
            <div className="mb-4 rounded-2xl border border-slate-200/80 dark:border-crm-border bg-white dark:bg-crm-surface p-3 shadow-sm">
              <div className={`grid w-full gap-2 ${effectiveView === "schedule" ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"}`}>
                <div className="relative min-w-0">
                  <Search
                    size={15}
                    className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    placeholder={effectiveView === "important" || effectiveView === "schedule" ? "Search name, phone, company..." : "Search clients..."}
                    value={effectiveView === "important" || effectiveView === "schedule" ? impSearch : search}
                    onChange={(e) => {
                      if (effectiveView === "important" || effectiveView === "schedule") setImpSearch(e.target.value);
                      else setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="w-full h-11 bg-white dark:bg-crm-input border border-gray-200 dark:border-crm-border rounded-xl pl-10 sm:pl-11 pr-4 text-sm outline-none focus:border-[#1B6FE8] dark:text-crm-text"
                  />
                </div>
                <StateFilterDropdown fullWidth value={stateFilter} onChange={v => { setStateFilter(v); setPage(1); }} />
                <PhoneAreaCodeFilterInput fullWidth value={phoneFilter} onChange={v => { setPhoneFilter(v); setPage(1); }} />
                {effectiveView === "schedule" && (
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="date"
                      value={impFilterDate}
                      onChange={(e) => { setImpFilterDate(e.target.value); setPage(1); }}
                      className="h-11 flex-1 min-w-0 rounded-xl border border-gray-200 dark:border-crm-border px-3 bg-white dark:bg-crm-input text-sm outline-none focus:border-[#1B6FE8] dark:text-crm-text"
                    />
                    {impFilterDate && (
                      <button
                        onClick={() => { setImpFilterDate(""); setPage(1); }}
                        className="h-11 px-3 rounded-xl border border-gray-200 dark:border-crm-border text-sm text-gray-500 hover:text-[#1B6FE8] shrink-0"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}

              <button
                onClick={() => {
                  setShowAddModal(true);
                  setIsEditing(false);
                  setNewClient(emptyClient);
                  setAddCsrId("");
                }}
                className="h-11 w-full xl:w-auto px-5 rounded-xl bg-[#1B6FE8] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#a30f27]"
              >
                <Plus size={15} />
                Add Client
              </button>
              </div>
            </div>

            {/* ─── TABLE ─── */}
            <div className="bg-white dark:bg-crm-surface border border-slate-200/80 dark:border-crm-border rounded-2xl sm:rounded-[28px] overflow-hidden shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-crm-border">
                <h3 className="font-semibold text-gray-800 dark:text-crm-text text-sm sm:text-base">{tableTitle}</h3>
                <p className="text-[11px] sm:text-xs text-gray-400 dark:text-crm-text-muted mt-0.5">
                  {displayCount} records
                  {tableRefreshing ? " · updating…" : ""}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className={CSR_TABLE_CLASS} style={{ minWidth: tableMinWidth }}>
                  <CsrColGroup widths={tableColWidths} />
                  <thead className={CSR_THEAD}>
                    <tr>
                      {tableHeaders.map((h, i) => {
                        const fKey = headerFilterKey[h];
                        const thCls = `${CSR_TH} ${i === tableHeaders.length - 1 ? "text-right" : ""}`;
                        const sortExtra =
                          h === "Client" ? (
                            <SortPair field="clientCode" sortBy={sortBy} sortDir={sortDir} onSort={applyLeadSort} />
                          ) : h === "Notes" ? (
                            <SortPair field="notes" sortBy={sortBy} sortDir={sortDir} onSort={applyLeadSort} />
                          ) : undefined;
                        if (h === "Notes") {
                          return (
                            <th key={h} className={thCls}>
                              <span className="flex items-center gap-1">
                                Notes
                                {sortExtra}
                              </span>
                            </th>
                          );
                        }
                        if (fKey) {
                          return (
                            <FilterableTh
                              key={h}
                              title={h}
                              filter={leadColFilters[fKey] ?? ""}
                              onFilter={v => setLeadColFilter(fKey, v)}
                              className={thCls}
                              placeholder={`${h}…`}
                              headerExtra={sortExtra}
                            />
                          );
                        }
                        return <th key={h} className={thCls}>{h}</th>;
                      })}
                    </tr>
                  </thead>

                  <tbody>
                    {loading ? (
                      [1, 2, 3, 4, 5].map(i => (
                        <tr key={i} className="border-b border-gray-100">
                          {tableHeaders.map((_, j) => (
                            <td key={j} className="py-4 px-3 sm:px-4">
                              <div className="h-3.5 bg-gray-100 rounded animate-pulse w-20 sm:w-28" />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : filteredClients.length === 0 ? (
                      <tr>
                        <td colSpan={tableHeaders.length} className="px-6 py-16 sm:py-20 text-center">
                          <div className="flex flex-col items-center justify-center">
                            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#F8ECEF] flex items-center justify-center mb-3 sm:mb-4">
                              <Building2 size={28} className="text-[#1B6FE8] sm:w-8 sm:h-8" />
                            </div>
                            <h3 className="text-base sm:text-lg font-semibold text-gray-700">
                              No Clients Found
                            </h3>
                            <p className="text-xs sm:text-sm text-gray-400 mt-1 sm:mt-2">
                              Try adding a new client or changing your search.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedClients.map((client, i) => (
                        <tr
                          key={client.id}
                          className="border-b border-gray-100 hover:bg-[#FAFAFB] transition-colors"
                        >
                          {/* Client: name + company / email / contact / created */}
                          <td className={CSR_TD_TOP_POPOVER}>
                            {(() => {
                              const emails =
                                client.emails?.length > 0
                                  ? client.emails
                                  : client.email && client.email !== "N/A"
                                    ? [client.email]
                                    : [];
                              const phones =
                                client.contactPhones?.length > 0
                                  ? client.contactPhones
                                  : client.contact && client.contact !== "N/A"
                                    ? [client.contact]
                                    : [];
                              const company =
                                client.company && client.company !== "N/A" ? client.company.trim() : "";
                              return (
                                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                  <div className="w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-full bg-[#F8ECEF] flex items-center justify-center text-[#1B6FE8] font-semibold shrink-0 text-xs sm:text-sm">
                                    {client.clientName.charAt(0)}
                                  </div>
                                  <div className="min-w-0 flex-1 overflow-visible">
                                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                      {(client.clientCode || client.projectCode) && (
                                        <span className="bg-[#1B6FE8]/10 text-[#1B6FE8] text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0">
                                          {client.clientCode || client.projectCode}
                                        </span>
                                      )}
                                      <ExtraProjectCodesPopup extras={client.extraProjects} />
                                      <h3 className="text-[13px] sm:text-sm font-semibold text-[#0F172A] dark:text-gray-100 leading-tight truncate">
                                        {client.clientName}
                                      </h3>
                                    </div>
                                    <div className="flex flex-col gap-0.5 mt-1 min-w-0 overflow-visible">
                                      {company ? (
                                        <p className="text-[10px] sm:text-[11px] text-gray-500 truncate">
                                          <span className="text-gray-400">Co:</span> {company}
                                        </p>
                                      ) : null}
                                      {emails.length > 0 ? (
                                        <div className="flex items-center gap-1 min-w-0 max-w-full overflow-visible">
                                          <span className="text-[10px] sm:text-[11px] text-gray-400 shrink-0">Email:</span>
                                          <EmailWithExtraCell
                                            email={emails[0]}
                                            allEmails={emails}
                                            variant="plain"
                                            className="text-[10px] sm:text-[11px] text-gray-500"
                                            emptyLabel=""
                                            clientName={client.clientName}
                                            company={company || undefined}
                                          />
                                        </div>
                                      ) : null}
                                      {phones.length > 0 ? (
                                        <div className="flex items-center gap-1 min-w-0 max-w-full overflow-visible">
                                          <span className="text-[10px] sm:text-[11px] text-gray-400 shrink-0">Contact:</span>
                                          <PhoneWithTzCell
                                            phone={phones[0]}
                                            allPhones={phones}
                                            variant="plain"
                                            className="text-[10px] sm:text-[11px] text-gray-500"
                                            dial={{ leadId: client.id, clientName: client.clientName || company }}
                                          />
                                        </div>
                                      ) : null}
                                      {client.createdAt ? (
                                        <p className="text-[10px] sm:text-[11px] text-gray-500 truncate">
                                          <span className="text-gray-400">Created:</span> {client.createdAt}
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </td>

                          {isClosedView && (
                            <td className={CSR_TD}>
                              <span className={`px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-semibold whitespace-nowrap ${
                                client.isOldClient
                                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              }`}>
                                {client.isOldClient ? "Old Client" : "New Client"}
                              </span>
                            </td>
                          )}

                          {!isScheduleView && (
                            <td className={`${CSR_TD} text-xs sm:text-sm text-gray-600`}>
                              <span className="truncate block">{client.scope}</span>
                            </td>
                          )}

                          {isScheduleView && (
                            <>
                              <td className={CSR_TD}>
                                <div className="inline-flex items-center gap-1.5 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-[#FAFAFA]">
                                  <CalendarDays size={12} className="text-[#1B6FE8] shrink-0" />
                                  {client.nextFollowup || "—"}
                                </div>
                              </td>
                              <td className={CSR_TD}>
                                <p className="text-xs sm:text-sm font-semibold text-[#0F172A]">{client.time !== "N/A" ? client.time : "—"}</p>
                                {client.timezone !== "N/A" && (
                                  <p className="text-[10px] text-gray-400 mt-0.5">{client.timezone}</p>
                                )}
                              </td>
                            </>
                          )}

                          <td className={`${CSR_TD} min-w-0 overflow-hidden`}>
                            {client.csrCode ? (
                              <span
                                className="inline-flex bg-[#1B6FE8]/10 text-[#1B6FE8] text-[10px] sm:text-[11px] font-bold px-1.5 py-0.5 rounded-md tabular-nums"
                                title={client.csr ? `${client.csrCode} — ${client.csr}` : client.csrCode}
                              >
                                {client.csrCode}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>

                          {/* Status badge */}
                          <td className={`${CSR_TD} min-w-0 overflow-hidden`}>
                            <span
                              className={`inline-flex max-w-full px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-medium truncate ${adminLeadStatusBadgeClass(client.rawStatus, client.nextFollowup)}`}
                              title={adminLeadStatusLabel(client.rawStatus, client.nextFollowup)}
                            >
                              {adminLeadStatusLabel(client.rawStatus, client.nextFollowup)}
                            </span>
                          </td>

                          {/* Notes */}
                          <td className={`${CSR_TD} min-w-0 overflow-hidden`}>
                            <CommentCell
                              id={client.id}
                              apiRole="admin"
                              noteHistory={client.noteHistory}
                              noteCount={client.noteCount}
                              comment={client.lastComment === "No comments" ? "" : client.lastComment}
                              onAddNote={async (id, text, parentId) => {
                                const res = await API.post(`/admin/lead/${id}/notes`, {
                                  text,
                                  ...(parentId ? { parentId } : {}),
                                });
                                const note = res.data?.note;
                                const entry: NoteEntry = {
                                  id: String(note?.id ?? `tmp-${Date.now()}`),
                                  text: String(note?.text ?? text),
                                  createdAt: String(note?.createdAt ?? new Date().toISOString()),
                                  parentId: note?.parentId ?? parentId ?? null,
                                };
                                setClients((prev) =>
                                  bumpToFront(prev, id, (c) => {
                                    const hist = c.noteHistory ?? [];
                                    if (parentId) {
                                      return {
                                        ...c,
                                        noteHistory: hist.map((n) =>
                                          n.id === parentId
                                            ? { ...n, replies: [...(n.replies ?? []), entry] }
                                            : n,
                                        ),
                                        noteCount: (c.noteCount ?? hist.length) + 1,
                                      };
                                    }
                                    return {
                                      ...c,
                                      lastComment: entry.text,
                                      noteHistory: [entry, ...hist],
                                      noteCount: (c.noteCount ?? hist.length) + 1,
                                    };
                                  }),
                                );
                                if (page !== 1) setPage(1);
                                return entry;
                              }}
                              onNoteUpdated={(leadId, noteId, text, createdAt) => {
                                const at = createdAt ?? new Date().toISOString();
                                setClients((prev) =>
                                  bumpToFront(prev, leadId, (c) => {
                                    const patchDeep = (notes: NoteEntry[]): NoteEntry[] =>
                                      notes.map((n) => {
                                        if (n.id === noteId) return { ...n, text, createdAt: at };
                                        if (n.replies?.length) {
                                          return { ...n, replies: patchDeep(n.replies) };
                                        }
                                        return n;
                                      });
                                    const noteHistory = patchDeep([...(c.noteHistory ?? [])]).sort(
                                      (a, b) =>
                                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                                    );
                                    return {
                                      ...c,
                                      noteHistory,
                                      lastComment: noteHistory[0]?.text ?? c.lastComment,
                                    };
                                  }),
                                );
                                if (page !== 1) setPage(1);
                              }}
                              onNoteDeleted={(leadId, noteId) => {
                                setClients(prev => prev.map(c => {
                                  if (c.id !== leadId) return c;
                                  const strip = (notes: NoteEntry[]): NoteEntry[] =>
                                    notes
                                      .filter((n) => n.id !== noteId)
                                      .map((n) => ({
                                        ...n,
                                        replies: (n.replies ?? []).filter((r) => r.id !== noteId),
                                      }));
                                  const noteHistory = strip(c.noteHistory ?? []);
                                  const deep =
                                    noteHistory.reduce(
                                      (s, n) => s + 1 + (n.replies?.length ?? 0),
                                      0,
                                    );
                                  return {
                                    ...c,
                                    noteHistory,
                                    noteCount: deep,
                                    lastComment: noteHistory[0]?.text ?? "No comments",
                                  };
                                }));
                              }}
                              onSave={async (id, text) => {
                                await API.patch(`/admin/lead/${id}/note`, { comments: text });
                                setClients(prev => prev.map(c => c.id === id ? { ...c, lastComment: text || "No comments" } : c));
                              }}
                            />
                          </td>

                          {/* Actions */}
                          <td className={CSR_TD}>
                            {/* Desktop: icon row (md+) */}
                            <div className="hidden md:flex items-center justify-end gap-1.5 lg:gap-2">
                              <button
                                onClick={() => setSelectedClient(client)}
                                className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all"
                                title="View details"
                              >
                                <Eye size={13} className="lg:w-[15px] lg:h-[15px]" />
                              </button>
                              <button
                                onClick={() => {
                                  setClientToDelete(client.id);
                                  setShowDeleteModal(true);
                                }}
                                className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center transition-all"
                                title="Delete"
                              >
                                <Trash2 size={13} className="lg:w-[15px] lg:h-[15px]" />
                              </button>
                              {canAdminReassign(client) && (
                                <button
                                  onClick={() => void openReassignModal(client)}
                                  className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-blue-100 text-blue-600 hover:bg-blue-200 flex items-center justify-center transition-all"
                                  title="Reassign to CSR"
                                >
                                  <ArrowRightLeft size={13} className="lg:w-[15px] lg:h-[15px]" />
                                </button>
                              )}
                              <button
                                onClick={() => openAddProject(client)}
                                className="h-8 lg:h-9 px-2.5 rounded-xl bg-[#EAF2FE] text-[#1B6FE8] hover:bg-[#1B6FE8] hover:text-white flex items-center gap-1 text-[11px] font-semibold whitespace-nowrap transition-all"
                                title="Add project"
                              >
                                <FolderPlus size={13} />
                                Add project
                              </button>
                            </div>
                            {/* Mobile: three-dot dropdown */}
                            <div className="relative md:hidden flex justify-end">
                              <button
                                onClick={() =>
                                  setOpenMenu(openMenu === i ? null : i)
                                }
                                className="w-8 h-8 rounded-xl border border-gray-200 flex items-center justify-center bg-white"
                              >
                                <MoreVertical size={16} />
                              </button>

                              {openMenu === i && (
                                <div className="absolute right-0 top-10 w-44 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 overflow-hidden">
                                  <button
                                    onClick={() => {
                                      setSelectedClient(client);
                                      setOpenMenu(null);
                                    }}
                                    className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                                  >
                                    <Eye size={14} /> View
                                  </button>
                                  <button
                                    onClick={() => {
                                      setClientToDelete(client.id);
                                      setShowDeleteModal(true);
                                      setOpenMenu(null);
                                    }}
                                    className="w-full px-4 py-3 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                                  >
                                    <Trash2 size={14} /> Delete
                                  </button>
                                  {canAdminReassign(client) && (
                                    <button
                                      onClick={() => {
                                        void openReassignModal(client);
                                        setOpenMenu(null);
                                      }}
                                      className="w-full px-4 py-3 text-left text-sm hover:bg-blue-50 text-blue-600 flex items-center gap-2"
                                    >
                                      <ArrowRightLeft size={14} /> Reassign CSR
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      openAddProject(client);
                                      setOpenMenu(null);
                                    }}
                                    className="w-full px-4 py-3 text-left text-sm hover:bg-[#EAF2FE] text-[#1B6FE8] flex items-center gap-2"
                                  >
                                    <FolderPlus size={14} /> Add project
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {totalPagesClients > 1 && (
                <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-t border-gray-100">
                  <p className="text-xs text-gray-400">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, displayCount)} of {displayCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="w-9 h-9 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 flex items-center justify-center text-lg transition-all">‹</button>
                    <span className="text-sm font-semibold text-gray-700 min-w-[60px] text-center">{page} / {totalPagesClients}</span>
                    <button onClick={() => setPage(p => Math.min(totalPagesClients, p + 1))} disabled={page === totalPagesClients}
                      className="w-9 h-9 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 flex items-center justify-center text-lg transition-all">›</button>
                  </div>
                </div>
              )}
            </div>
        </>

        {/* ─── MODALS ─── */}

        {/* View Client — CSR-style detail modal */}
        {selectedClient && (
          <LeadDetailModal
            apiPrefix="/admin"
            startInEditMode
            lead={{
              id: selectedClient.id,
              name:    selectedClient.clientName,
              company: selectedClient.company !== "N/A" ? selectedClient.company : undefined,
              phone:   selectedClient.contact !== "N/A" ? selectedClient.contact : undefined,
              email:   selectedClient.email !== "N/A" ? selectedClient.email : undefined,
              website: selectedClient.website || undefined,
              state:   selectedClient.state || undefined,
              status:  selectedClient.rawStatus,
              interestedService: selectedClient.scope !== "N/A" ? selectedClient.scope : undefined,
              followUpNotes: selectedClient.lastComment !== "No comments" ? selectedClient.lastComment : undefined,
              nextSchedule: selectedClient.nextFollowup || undefined,
              nextTime:     selectedClient.time !== "N/A" ? selectedClient.time : undefined,
              timezone:     selectedClient.timezone !== "N/A" ? selectedClient.timezone : undefined,
              subContacts:  selectedClient.subContacts,
              clientCode:   selectedClient.clientCode,
              isOldClient:  selectedClient.isOldClient,
              csr:          selectedClient.csr,
              csrCode:      selectedClient.csrCode,
              createdAt:    selectedClient.createdAt,
            }}
            onClose={() => setSelectedClient(null)}
            onSaved={(id, updates) => {
              const patch = (c: Client): Client => {
                if (c.id !== id) return c;
                const nextFollowup = updates.nextSchedule !== undefined
                  ? (updates.nextSchedule.trim() || "")
                  : c.nextFollowup;
                const rawStatus = updates.status ?? c.rawStatus;
                return {
                  ...c,
                  clientName: updates.name?.trim() || c.clientName,
                  company:    updates.company?.trim() || c.company,
                  contact:    updates.phone?.trim() || c.contact,
                  email:      updates.email?.trim() || c.email,
                  website:    updates.website !== undefined ? updates.website.trim() : c.website,
                  state:      updates.state !== undefined ? updates.state.trim() : c.state,
                  scope:      updates.interestedService !== undefined
                    ? (updates.interestedService.trim() || "N/A")
                    : c.scope,
                  clientCode: updates.clientCode !== undefined
                    ? (updates.clientCode.trim() || null)
                    : c.clientCode,
                  isOldClient: updates.isOldClient ?? c.isOldClient,
                  rawStatus,
                  status: adminLeadStatusLabel(rawStatus, nextFollowup),
                  nextFollowup,
                  time: updates.nextTime !== undefined
                    ? (updates.nextTime.trim() || "N/A")
                    : c.time,
                  timezone: updates.timezone !== undefined
                    ? (updates.timezone.trim() || "N/A")
                    : c.timezone,
                  lastComment: updates.followUpNotes !== undefined
                    ? (updates.followUpNotes.trim() || c.lastComment)
                    : c.lastComment,
                };
              };
              setClients(prev => prev.map(patch));
              setSelectedClient(prev => (prev && prev.id === id ? patch(prev) : prev));
              setRefreshToken(t => t + 1);
            }}
            onNoteAdded={(id, note) => {
              setClients((prev) =>
                bumpToFront(prev, id, (c) => {
                  const hist = c.noteHistory ?? [];
                  return {
                    ...c,
                    lastComment: note.text,
                    noteHistory: [note, ...hist],
                    noteCount: (c.noteCount ?? hist.length) + 1,
                  };
                }),
              );
              setSelectedClient(prev => {
                if (!prev || prev.id !== id) return prev;
                const hist = prev.noteHistory ?? [];
                return {
                  ...prev,
                  lastComment: note.text,
                  noteHistory: [note, ...hist],
                  noteCount: (prev.noteCount ?? hist.length) + 1,
                };
              });
            }}
            onSubContactAdded={(id, sub) => {
              const patch = (c: Client): Client => {
                const subContacts = [...(c.subContacts ?? []), sub];
                return {
                  ...c,
                  subContacts,
                  contactPhones: collectLeadPhones(c.contact === "N/A" ? "" : c.contact, subContacts),
                  emails: collectLeadEmails(c.email === "N/A" ? "" : c.email, subContacts),
                };
              };
              setClients(prev => prev.map(c => c.id === id ? patch(c) : c));
              setSelectedClient(prev => prev && prev.id === id ? patch(prev) : prev);
            }}
            onSubContactUpdated={(id, sub) => {
              const patch = (c: Client): Client => {
                const subContacts = (c.subContacts ?? []).map(s => s.id === sub.id ? sub : s);
                return {
                  ...c,
                  subContacts,
                  contactPhones: collectLeadPhones(c.contact === "N/A" ? "" : c.contact, subContacts),
                  emails: collectLeadEmails(c.email === "N/A" ? "" : c.email, subContacts),
                };
              };
              setClients(prev => prev.map(c => c.id === id ? patch(c) : c));
              setSelectedClient(prev => prev && prev.id === id ? patch(prev) : prev);
            }}
            onSubContactDeleted={(id, subId) => {
              const patch = (c: Client): Client => {
                const subContacts = (c.subContacts ?? []).filter(s => s.id !== subId);
                return {
                  ...c,
                  subContacts,
                  contactPhones: collectLeadPhones(c.contact === "N/A" ? "" : c.contact, subContacts),
                  emails: collectLeadEmails(c.email === "N/A" ? "" : c.email, subContacts),
                };
              };
              setClients(prev => prev.map(c => c.id === id ? patch(c) : c));
              setSelectedClient(prev => prev && prev.id === id ? patch(prev) : prev);
            }}
          />
        )}

        {/* Delete Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 sm:p-6">
              <h2 className="text-lg sm:text-2xl font-semibold text-gray-800">
                Delete Client
              </h2>
              <p className="text-xs sm:text-sm text-gray-400 mt-0.5 sm:mt-1">
                This action cannot be undone.
              </p>
              <div className="bg-red-50 border border-red-100 rounded-xl sm:rounded-2xl p-3 sm:p-4 mt-3 sm:mt-4">
                <p className="text-xs sm:text-sm text-red-600">
                  Are you sure you want to delete this client permanently?
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 sm:gap-3 mt-4 sm:mt-6">
                <button
                  onClick={() => {
                    if (deleting) return;
                    setShowDeleteModal(false);
                    setClientToDelete(null);
                  }}
                  disabled={deleting}
                  className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm transition-all disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleDeleteClient()}
                  disabled={deleting}
                  className="px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-red-600 text-white text-sm hover:bg-red-700 transition-all disabled:opacity-60"
                >
                  {deleting ? "Deleting…" : "Delete Client"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add / Edit Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-xl lg:max-w-3xl rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <div>
                  <h2 className="text-lg sm:text-2xl font-semibold text-gray-800">
                    {isEditing ? "Edit Client" : "Add New Client"}
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-400 mt-0.5 sm:mt-1">
                    Create and manage client records.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                >
                  <X size={16} className="sm:w-[18px] sm:h-[18px]" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="text-xs sm:text-sm text-gray-500 mb-1.5 sm:mb-2 block">
                    Client Name <span className="text-[#1B6FE8]">*</span>
                  </label>
                  <input
                    type="text"
                    value={newClient.clientName}
                    placeholder="Client name"
                    onChange={(e) => setNewClient({ ...newClient, clientName: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm outline-none focus:border-[#1B6FE8]"
                  />
                </div>
                <div>
                  <label className="text-xs sm:text-sm text-gray-500 mb-1.5 sm:mb-2 block">
                    Company Name <span className="text-[#1B6FE8]">*</span>
                  </label>
                  <input
                    type="text"
                    value={newClient.company}
                    placeholder="Company name"
                    onChange={(e) =>
                      setNewClient({
                        ...newClient,
                        company: e.target.value,
                        parentCompany: e.target.value,
                      })
                    }
                    className="w-full border border-gray-200 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm outline-none focus:border-[#1B6FE8]"
                  />
                </div>

                {[
                  { label: "Email Address", key: "email", type: "email", placeholder: "Email address", req: true },
                  { label: "Contact Number", key: "contact", type: "tel", placeholder: "Phone number", req: false },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="text-xs sm:text-sm text-gray-500 mb-1.5 sm:mb-2 block">
                      {f.label}{" "}
                      {f.req && <span className="text-[#1B6FE8]">*</span>}
                    </label>
                    <input
                      type={f.type}
                      value={(newClient as unknown as Record<string, string>)[f.key]}
                      placeholder={f.placeholder}
                      onChange={(e) =>
                        setNewClient({ ...newClient, [f.key]: e.target.value })
                      }
                      className="w-full border border-gray-200 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm outline-none focus:border-[#1B6FE8]"
                    />
                  </div>
                ))}

                <div>
                  <label className="text-xs sm:text-sm text-gray-500 mb-1.5 sm:mb-2 block">CSR</label>
                  <select
                    value={addCsrId}
                    onChange={e => {
                      const id = e.target.value;
                      setAddCsrId(id);
                      const name = csrOptions.find(c => c.id === id)?.name ?? "";
                      setNewClient({ ...newClient, csr: name });
                    }}
                    className="w-full border border-gray-200 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm outline-none focus:border-[#1B6FE8] bg-white"
                  >
                    <option value="">Unassigned</option>
                    {csrOptions.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs sm:text-sm text-gray-500 mb-1.5 sm:mb-2 block">Status</label>
                  <select
                    value={newClient.status}
                    onChange={(e) =>
                      setNewClient({ ...newClient, status: e.target.value as Client["status"] })
                    }
                    className="w-full border border-gray-200 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm outline-none focus:border-[#1B6FE8] bg-white"
                  >
                    {["Closed", "Interested", "Important"].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs sm:text-sm text-gray-500 mb-1.5 sm:mb-2 block">Scope of Work</label>
                  <textarea
                    rows={3}
                    value={newClient.scope}
                    placeholder="Write project scope..."
                    onChange={(e) => setNewClient({ ...newClient, scope: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm outline-none resize-none focus:border-[#1B6FE8]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs sm:text-sm text-gray-500 mb-1.5 sm:mb-2 block">Last Call Comments</label>
                  <textarea
                    rows={3}
                    value={newClient.lastComment}
                    placeholder="Write discussion notes..."
                    onChange={(e) => setNewClient({ ...newClient, lastComment: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm outline-none resize-none focus:border-[#1B6FE8]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 sm:gap-3 mt-4 sm:mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveClient}
                  className="px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-[#1B6FE8] text-white text-sm hover:bg-[#a30f27] transition-all"
                >
                  {isEditing ? "Update Client" : "Save Client"}
                </button>
              </div>
            </div>
          </div>
        )}
      {/* ══ REASSIGN CSR MODAL ══ */}
      {showReassignModal && reassignClient && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[100] p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-[32px] shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-br from-[#1B6FE8] to-[#0E4FBE] px-5 sm:px-6 pt-5 pb-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white">Reassign Lead</h2>
                  <p className="text-white/70 text-xs sm:text-sm mt-0.5">
                    Reassigning <span className="font-semibold text-white">{reassignClient.clientName}</span>
                  </p>
                </div>
                <button onClick={() => setShowReassignModal(false)}
                  className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white shrink-0">
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="px-5 sm:px-6 py-4 space-y-2 max-h-64 overflow-y-auto">
              {!reassignCsrLoaded ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-[#1B6FE8] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : reassignCsrList.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No CSRs available.</p>
              ) : reassignCsrList.map(csr => (
                <button key={csr.id} onClick={() => setReassignTargetId(csr.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all text-left ${
                    reassignTargetId === csr.id ? "border-[#1B6FE8] bg-[#EAF2FE]" : "border-gray-100 bg-[#FAFAFA] hover:border-gray-200"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${
                    reassignTargetId === csr.id ? "bg-[#1B6FE8]" : "bg-gray-400"
                  }`}>
                    {csr.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className={`font-semibold text-sm truncate ${reassignTargetId === csr.id ? "text-[#1B6FE8]" : "text-[#0F172A]"}`}>
                      {csr.name}
                    </p>
                    {csr.csrCode && <p className="text-xs text-gray-400">{csr.csrCode}</p>}
                  </div>
                  {reassignTargetId === csr.id && (
                    <div className="ml-auto w-5 h-5 rounded-full bg-[#1B6FE8] flex items-center justify-center shrink-0">
                      <Check size={11} className="text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-3 px-5 sm:px-6 pb-5 pt-2">
              <button onClick={() => setShowReassignModal(false)}
                className="flex-1 h-11 rounded-2xl bg-[#F5F6FA] text-gray-600 font-semibold text-sm">
                Cancel
              </button>
              <button onClick={confirmReassign} disabled={!reassignTargetId || isReassigning}
                className="flex-1 h-11 rounded-2xl bg-[#1B6FE8] text-white font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                <ArrowRightLeft size={14} />
                {isReassigning ? "Reassigning…" : "Reassign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {addProjectClient && (
        <ProjectWorkbenchModal
          open
          createMode
          mode="admin"
          sourceClientId={addProjectClient.id}
          csrs={projectCsrs}
          saving={addProjectSaving}
          initial={{
            ...emptyWorkbench(),
            name: clientField(addProjectClient.clientName),
            company: clientField(addProjectClient.company),
            phone: clientField(addProjectClient.contact),
            email: clientField(addProjectClient.email),
            ownerName: clientField(addProjectClient.ownerName),
            state: clientField(addProjectClient.state),
            interestedService: clientField(addProjectClient.scope),
            projectCode: "",
          }}
          onClose={() => setAddProjectClient(null)}
          onSave={saveProjectFromClient}
        />
      )}

      </main>
    </div>
  );
}