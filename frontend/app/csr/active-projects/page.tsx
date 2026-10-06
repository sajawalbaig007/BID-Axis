"use client";

import { useMemo, useState, useCallback } from "react";
import {
  FolderKanban, CalendarDays, DollarSign,
  Search, Filter, Phone, AlignLeft, Briefcase,
  X, FileText, Eye, Clock3, CheckCircle2,
  Plus, User2, Hash, StickyNote, Loader2,
} from "lucide-react";

import TopNavbar from "../components/navigation/TopNavbar";
import ServicePicker from "../components/shared/ServicePicker";
import StackedHorizontalBarChart, { StackedBarRow } from "../components/shared/StackedHorizontalBarChart";
import Pagination from "../components/shared/Pagination";
import { PROJECT_GRID_HEAD, CRM_GRID_HEAD_ROW, PROJECT_GRID_ROW, CSR_PAGE_MAIN, matchesLeadSearch } from "../components/shared/csrTableStyles";
import { PROJECT_TABLE_HEAD } from "@/app/components/projects/ProjectTableCells";
import PaymentStatusCircle from "../components/shared/PaymentStatusCircle";
import CommentCell from "../components/shared/CommentCell";
import EmailWithExtraCell from "../components/shared/EmailWithExtraCell";
import ClientSortControls from "../components/shared/ClientSortControls";
import { parseEmails } from "../utils/parseEmails";
import { sortClientRows, type ClientListSortBy, type SortDir } from "../utils/clientListSort";
import { sortByOldestNote } from "../utils/sortByOldestNote";
import {
  ClientDetailCell,
  FulfillmentCell,
  PaymentDetailCell,
  ProjectDetailCell,
  QuotedAmountCell,
} from "@/app/components/projects/ProjectTableCells";
import ProjectWorkbenchModal from "@/app/components/projects/ProjectWorkbenchModal";
import StateFilterDropdown from "../components/shared/StateFilterDropdown";
import PhoneAreaCodeFilterInput from "../components/shared/PhoneAreaCodeFilterInput";
import { matchesStateLocationFilter, matchesPhoneAreaCodeFilter } from "@/lib/stateLocationFilter";
import { useProjectsData, Project, parseBudget, isDeadlinePast } from "../hooks/useProjectsData";
import { NoteEntry } from "../hooks/useLeadsData";
import { useClientPhoneLookup } from "../hooks/useClientPhoneLookup";
import API from "@/lib/api";
import { consumeLeadDial, requireLeadDial } from "../components/dialer/dialUnlock";
import { ChangeDialerNumber, useZoomDialer } from "../components/dialer/ZoomDialerProvider";
import { estNowYmd } from "@/lib/estTime";

import { ProjectWorkbenchData, emptyWorkbench } from "@/lib/projectFields";

function csrToWorkbench(p: Project): ProjectWorkbenchData {
  return {
    id: p.id,
    name: p.client,
    company: p.company === "N/A" ? "" : p.company,
    phone: p.phone === "N/A" ? "" : p.phone,
    email: p.email,
    ownerName: p.ownerName,
    state: p.state === "N/A" ? "" : p.state,
    projectCode: p.projectCode || p.clientCode || "",
    projectTitle: p.projectTitle,
    projectScope: p.projectScope,
    interestedService: p.service === "N/A" ? "" : p.service,
    projectBudget: p.budget,
    projectDeadline: p.deadline === "N/A" ? "" : p.deadline.split("T")[0],
    deadlineTiming: "",
    projectPhase: p.projectPhase,
    takeoffDeadline: p.takeoffDeadline,
    pricingDeadline: p.pricingDeadline,
    qaDeadline: p.qaDeadline,
    projectPayments: p.projectPayments,
    csrName: "You",
    projectCreatedAt: p.createdAt ?? "",
  };
}

function projectAsRow(p: Project) {
  return {
    id: p.id,
    name: p.client,
    company: p.company,
    ownerName: p.ownerName,
    phone: p.phone,
    email: p.email,
    projectCode: p.projectCode,
    clientCode: p.clientCode,
    projectTitle: p.projectTitle,
    projectScope: p.projectScope,
    interestedService: p.service,
    projectBudget: p.budget,
    projectDeadline: p.deadline,
    projectPhase: p.projectPhase,
    projectPayments: p.projectPayments,
    state: p.state,
    timezone: p.timezone,
  };
}
const emptyForm = {
  clientName: "", clientCompany: "", clientPhone: "",
  projectCode: "", projectTitle: "", service: "", deadline: "", budget: "", notes: "",
};
const PAGE_SIZE = 30;

function projectDeadlineDate(deadline: string): string | null {
  if (!deadline || deadline === "N/A") return null;
  return deadline.split("T")[0];
}

function matchesDeadlineRange(deadline: string, from: string, to: string): boolean {
  if (!from && !to) return true;
  const d = projectDeadlineDate(deadline);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function DeadlineStatus({ deadline }: { deadline: string }) {
  if (!deadline) return null;
  const past = isDeadlinePast(deadline);
  return (
    <div className={`mt-1.5 flex items-center gap-1 text-[10px] font-semibold px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl ${
      past ? "bg-green-50 border border-green-200 text-green-700" : "bg-blue-50 border border-blue-200 text-blue-600"
    }`}>
      {past ? <><CheckCircle2 size={10} /> Status: Completed</> : <><Clock3 size={10} /> Status: In Progress</>}
    </div>
  );
}

export default function CSRProjectsPage() {
  const dialer = useZoomDialer();
  const { projects, setProjects, loading } = useProjectsData();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [search,       setSearch]       = useState("");
  const [stateFilter,  setStateFilter]  = useState("");
  const [phoneFilter,  setPhoneFilter]  = useState("");
  const [page,         setPage]         = useState(1);
  const [sortBy,       setSortBy]       = useState<ClientListSortBy>("oldestNote");
  const [sortDir,      setSortDir]      = useState<SortDir>("asc");

  const [viewingProject,  setViewingProject]  = useState<Project | null>(null);
  const [workbenchSaving, setWorkbenchSaving] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm,      setAddForm]      = useState(emptyForm);
  const [addSaving,    setAddSaving]    = useState(false);
  const [addError,     setAddError]     = useState("");

  const applyClientLookup = useCallback((client: { name: string; company: string; interestedService: string }) => {
    setAddForm(f => ({
      ...f,
      clientName:    client.name    || f.clientName,
      clientCompany: client.company || f.clientCompany,
      service:       f.service || client.interestedService || "",
    }));
  }, []);

  const { phoneLookupLoading, returningClient, resetLookup, onPhoneValueChange, onPhoneBlur, onPhonePaste } =
    useClientPhoneLookup(applyClientLookup);

  const resetAddModal = useCallback(() => {
    setShowAddModal(false);
    setAddForm(emptyForm);
    setAddError("");
    resetLookup();
  }, [resetLookup]);

  const openAddModal = useCallback(() => {
    setAddForm(emptyForm);
    setAddError("");
    resetLookup();
    setShowAddModal(true);
  }, [resetLookup]);

  /* ── Derived ── */
  const filteredProjects = useMemo(() => {
    const list = projects.filter(p => {
      const matchesDate   = matchesDeadlineRange(p.deadline, dateFrom, dateTo);
      const matchesState  = matchesStateLocationFilter(p.state, p.phone, stateFilter);
      const matchesPhone  = matchesPhoneAreaCodeFilter(p.phone, phoneFilter);
      const code = (p.clientCode || p.projectCode || "").toLowerCase();
      const matchesSearch = matchesLeadSearch(search, {
        name: p.client,
        company: p.company,
        phone: p.phone,
        email: p.email,
        service: p.service,
        state: p.state,
      }) || (!!search.trim() && (
        (p.projectTitle ?? "").toLowerCase().includes(search.toLowerCase().trim()) ||
        code.includes(search.toLowerCase().trim())
      ));
      return matchesDate && matchesState && matchesPhone && matchesSearch;
    });
    const mapped = list.map(p => ({
      ...p,
      clientCode: p.projectCode || p.clientCode || null,
    }));
    if (sortBy === "oldestNote") {
      const sorted = sortByOldestNote(mapped);
      return sortDir === "desc" ? sorted.reverse() : sorted;
    }
    return sortClientRows(mapped, sortBy, sortDir);
  }, [dateFrom, dateTo, search, stateFilter, phoneFilter, projects, sortBy, sortDir]);

  const totalPages     = Math.max(1, Math.ceil(filteredProjects.length / PAGE_SIZE));
  const paginated      = filteredProjects.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allTimeSales   = useMemo(() => projects.reduce((s, p) => s + p.budgetNum, 0), [projects]);
  const todayStr       = estNowYmd();
  const todaySales     = useMemo(() => projects.filter(p => p.closedAt === todayStr).reduce((s, p) => s + p.budgetNum, 0), [projects, todayStr]);
  const inProgressCnt  = useMemo(() => projects.filter(p => p.status === "In Progress").length, [projects]);
  const completedCnt   = useMemo(() => projects.filter(p => p.status === "Completed").length,   [projects]);

  const chartRows = useMemo<StackedBarRow[]>(() => [
    {
      label: "Project Status",
      segments: [
        { label: "Completed",  value: completedCnt,  color: "#15803D" },
        { label: "In Progress", value: inProgressCnt, color: "#F59E0B" },
      ],
    },
    {
      label: "Sales",
      segments: [
        { label: "Today",    value: todaySales,              color: "#1B6FE8" },
        { label: "Previous", value: allTimeSales - todaySales, color: "#94A3B8" },
      ],
    },
  ], [inProgressCnt, completedCnt, allTimeSales, todaySales]);

  const projectPieData = useMemo(() => [
    { name: "Completed",   value: completedCnt,  color: "#15803D" },
    { name: "In Progress", value: inProgressCnt, color: "#F59E0B" },
  ].filter(s => s.value > 0), [completedCnt, inProgressCnt]);

  /* ── Actions ── */
  const openDetail = (project: Project) => { setViewingProject(project); };

  const saveWorkbench = async (data: ProjectWorkbenchData) => {
    if (!viewingProject) return;
    setWorkbenchSaving(true);
    try {
      await API.put(`/csr/lead/${data.id}`, {
        name: data.name,
        company: data.company,
        phone: data.phone,
        email: data.email,
        ownerName: data.ownerName,
        state: data.state,
        projectCode: data.projectCode,
        projectTitle: data.projectTitle,
        projectScope: data.projectScope,
        interestedService: data.interestedService,
        projectBudget: data.projectBudget,
        projectDeadline: data.projectDeadline,
        projectPhase: data.projectPhase,
        takeoffDeadline: data.takeoffDeadline,
        pricingDeadline: data.pricingDeadline,
        qaDeadline: data.qaDeadline,
        projectPayments: data.projectPayments,
      });
      const updated: Project = {
        ...viewingProject,
        client: data.name,
        company: data.company || "N/A",
        phone: data.phone || "N/A",
        email: data.email,
        ownerName: data.ownerName,
        state: data.state || "N/A",
        projectCode: data.projectCode,
        projectTitle: data.projectTitle,
        projectScope: data.projectScope,
        service: data.interestedService || "N/A",
        budget: data.projectBudget,
        budgetNum: parseBudget(data.projectBudget),
        deadline: data.projectDeadline || "N/A",
        projectPhase: data.projectPhase,
        takeoffDeadline: data.takeoffDeadline,
        pricingDeadline: data.pricingDeadline,
        qaDeadline: data.qaDeadline,
        projectPayments: data.projectPayments,
        paidAmountNum: data.projectPayments.filter(p => p.isPaid).reduce((s, p) => s + parseBudget(p.amount), 0),
      };
      updated.paidPercent = updated.budgetNum > 0 ? (updated.paidAmountNum / updated.budgetNum) * 100 : 0;
      updated.paidAmount = String(updated.paidAmountNum);
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
      setViewingProject(updated);
    } catch (error) { console.log(error); }
    setWorkbenchSaving(false);
  };

  const markComplete = async (project: Project) => {
    if (!requireLeadDial(project.id)) return;
    try {
      await API.put(`/csr/lead/${project.id}`, { status: "completed" });
      consumeLeadDial(project.id);
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, status: "Completed" } : p));
      if (viewingProject?.id === project.id)
        setViewingProject(prev => prev ? { ...prev, status: "Completed" } : prev);
    } catch (error) { console.log(error); }
  };

  const addNote = async (id: string, text: string, parentId?: string) => {
    const res = await API.post(`/csr/lead/${id}/notes`, {
      text,
      ...(parentId ? { parentId } : {}),
    });
    const note: NoteEntry = res.data.note
      ? {
          id: res.data.note.id,
          text: res.data.note.text,
          createdAt: res.data.note.createdAt,
          parentId: res.data.note.parentId ?? parentId ?? null,
        }
      : { id: Date.now().toString(), text, createdAt: new Date().toISOString(), parentId: parentId || null };
    const merge = (hist: NoteEntry[] | undefined): NoteEntry[] => {
      const base = hist ?? [];
      if (parentId) {
        return base.map((n) =>
          n.id === parentId ? { ...n, replies: [...(n.replies ?? []), note] } : n,
        );
      }
      return [note, ...base];
    };
    setProjects(prev => prev.map(p =>
      p.id === id ? { ...p, noteHistory: merge(p.noteHistory) } : p
    ));
    if (viewingProject?.id === id)
      setViewingProject(prev => prev ? { ...prev, noteHistory: merge(prev.noteHistory) } : prev);
    return note;
  };

  const handleAddProject = async () => {
    const { clientName, projectTitle, service, deadline } = addForm;
    if (!clientName.trim())   { setAddError("Client name is required.");  return; }
    if (!projectTitle.trim()) { setAddError("Project title is required."); return; }
    if (!service)             { setAddError("Please select a service.");   return; }
    if (!deadline)            { setAddError("Deadline is required.");      return; }
    setAddSaving(true); setAddError("");
    try {
      const res = await API.post("/csr/project", {
        name:              addForm.clientName.trim(),
        company:           addForm.clientCompany.trim() || undefined,
        phone:             addForm.clientPhone.trim()   || undefined,
        projectTitle:      addForm.projectTitle.trim(),
        projectCode:       addForm.projectCode.trim()  || undefined,
        interestedService: addForm.service,
        projectDeadline:   addForm.deadline,
        projectBudget:     addForm.budget.trim()  || undefined,
        projectNotes:      addForm.notes.trim()   || undefined,
        status:            "Close Client",
      });
      const nl = res.data.lead;
      const autoCompleted = isDeadlinePast(addForm.deadline);
      const newProject: Project = {
        id:            String(nl?.id ?? Date.now()),
        projectCode:   addForm.projectCode.trim(),
        projectTitle:  addForm.projectTitle.trim(),
        client:        addForm.clientName.trim(),
        company:       addForm.clientCompany.trim() || "N/A",
        email:         "",
        ownerName:     "",
        status:        autoCompleted ? "Completed" : "In Progress",
        state:         "N/A",
        deadline:      addForm.deadline,
        budget:        addForm.budget.trim(),
        budgetNum:     parseBudget(addForm.budget),
        paidAmount:    "",
        paidAmountNum: 0,
        paidPercent:   0,
        projectPayments: [],
        projectScope:  "",
        projectPhase:  "not_started",
        takeoffDeadline: "",
        pricingDeadline: "",
        qaDeadline:    "",
        notes:         addForm.notes.trim(),
        service:       addForm.service,
        timezone:      "N/A",
        phone:         addForm.clientPhone.trim() || "N/A",
        closedAt:      estNowYmd(),
        clientCode:    null,
        noteHistory:   [],
      };
      setProjects(prev => [newProject, ...prev]);
      resetAddModal();
    } catch (error) {
      console.log(error);
      setAddError("Failed to save project. Please try again.");
    }
    setAddSaving(false);
  };

  return (
    <div className="min-h-screen bg-[#F5F6FA] dark:bg-crm-bg">
      <TopNavbar />
      <main className={CSR_PAGE_MAIN}>

        {/* ── HEADER ── */}
        <div className="mt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-[28px] lg:text-[34px] font-bold text-[#0F172A] leading-tight">Projects Dashboard</h1>
            <p className="text-gray-500 mt-1 sm:mt-2 text-xs sm:text-sm">Manage and track your won projects.</p>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center justify-center gap-2 h-10 sm:h-11 px-4 sm:px-5 rounded-xl sm:rounded-2xl bg-[#1B6FE8] text-white text-xs sm:text-sm font-semibold shadow-md shadow-red-200 hover:bg-[#a30f27] transition-colors shrink-0 w-full sm:w-auto"
          >
            <Plus size={14} className="sm:w-4 sm:h-4" />Add New Project
          </button>
        </div>

        {/* ── STATS CHART ── */}
        <div className="mt-4 sm:mt-7">
          <StackedHorizontalBarChart
            title="Pipeline by stage and type"
            subtitle="Project status breakdown and today's vs all-time sales."
            rows={chartRows}
            loading={loading}
            pieTitle="Project Status Pie Chart"
            pieData={projectPieData}
          />
        </div>

        {/* ── FILTERS — single row; scroll horizontally on narrow screens ── */}
        <div className="bg-white dark:bg-crm-surface rounded-2xl sm:rounded-[28px] shadow-sm p-3 sm:p-4 mt-4 sm:mt-7 border border-white dark:border-crm-border">
          <div className="grid w-full gap-2 grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)_minmax(0,0.9fr)_auto_minmax(0,1.1fr)_auto]">
            <div className="relative min-w-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search name, company, phone…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="w-full h-10 sm:h-11 rounded-xl border border-gray-200 dark:border-crm-border bg-[#FAFAFA] dark:bg-crm-input pl-9 pr-3 text-xs sm:text-sm outline-none focus:border-[#1B6FE8] dark:text-crm-text"
              />
            </div>
            <ClientSortControls
              className="min-w-0"
              sortBy={sortBy}
              sortDir={sortDir}
              onSortBy={v => { setSortBy(v); setPage(1); }}
              onSortDir={v => { setSortDir(v); setPage(1); }}
            />
            <StateFilterDropdown fullWidth value={stateFilter} onChange={v => { setStateFilter(v); setPage(1); }} />
            <PhoneAreaCodeFilterInput fullWidth value={phoneFilter} onChange={v => { setPhoneFilter(v); setPage(1); }} />
            <div className="hidden xl:flex items-center gap-1 text-[#1B6FE8] font-semibold text-[11px] whitespace-nowrap">
              <Filter size={12} />
              <span>Deadline</span>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <CalendarDays size={14} className="text-gray-400 shrink-0 sm:hidden" />
              <input
                type="date"
                value={dateFrom}
                title="Deadline from"
                onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                className="h-10 sm:h-11 flex-1 min-w-0 rounded-xl border border-gray-200 dark:border-crm-border px-2 sm:px-2.5 bg-[#FAFAFA] dark:bg-crm-input text-xs outline-none focus:border-[#1B6FE8] dark:text-crm-text"
              />
              <span className="text-[10px] text-gray-400 shrink-0">to</span>
              <input
                type="date"
                value={dateTo}
                title="Deadline to"
                onChange={e => { setDateTo(e.target.value); setPage(1); }}
                className="h-10 sm:h-11 flex-1 min-w-0 rounded-xl border border-gray-200 dark:border-crm-border px-2 sm:px-2.5 bg-[#FAFAFA] dark:bg-crm-input text-xs outline-none focus:border-[#1B6FE8] dark:text-crm-text"
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
                className="h-10 sm:h-11 px-3 rounded-xl border border-gray-200 bg-[#FAFAFA] text-xs text-gray-500 hover:text-[#1B6FE8] transition-all shrink-0 whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ── TABLE ── */}
        {loading ? (
          <div className="bg-white rounded-2xl sm:rounded-[30px] shadow-sm mt-4 sm:mt-7 p-4 sm:p-6 space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="animate-pulse flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-100 shrink-0" />
                <div className="flex-1 grid grid-cols-4 gap-3">
                  {[1,2,3,4].map(j => <div key={j} className="h-4 bg-gray-100 rounded" />)}
                </div>
              </div>
            ))}
          </div>
        ) : filteredProjects.length > 0 ? (
          <div className="bg-white rounded-2xl sm:rounded-[30px] shadow-sm mt-4 sm:mt-7 overflow-hidden border border-white">

            {/* ── MOBILE CARDS (< lg) ── */}
            <div className="lg:hidden divide-y divide-[#F3F3F3]">
              {paginated.map(project => (
                <div key={project.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#EAF2FE] text-[#1B6FE8] flex items-center justify-center shrink-0 font-bold text-sm">
                        {project.client.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#0F172A] truncate">{project.client}</p>
                        {project.company !== "N/A" ? (
                          <p className="text-xs text-gray-400 truncate">{project.company}</p>
                        ) : project.phone && project.phone !== "N/A" ? (
                          <span className="inline-flex items-center gap-1.5 min-w-0">
                            <button
                              type="button"
                              onClick={() => dialer?.open({
                                destination: project.phone,
                                leadId: project.id,
                                clientName: project.company || project.client,
                              })}
                              className="text-xs text-[#1B6FE8] font-medium truncate underline-offset-[3px] hover:underline cursor-pointer"
                            >
                              {project.phone}
                            </button>
                            <ChangeDialerNumber />
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => openDetail(project)}
                        className="w-8 h-8 rounded-xl bg-[#EAF5FF] text-[#0B84F3] flex items-center justify-center">
                        <Eye size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-gray-400 text-[10px]">Project</p>
                      <p className="font-semibold text-[#0F172A] truncate">{project.projectTitle || <span className="text-gray-400 font-normal">N/A</span>}</p>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        {project.deadline && project.deadline !== "N/A" && (
                          <span className={`text-[10px] font-medium ${isDeadlinePast(project.deadline) ? "text-red-500" : "text-gray-400"}`}>{project.deadline}</span>
                        )}
                        {project.status === "Completed" ? (
                          <span className="inline-flex items-center gap-0.5 bg-green-100 text-green-700 px-1.5 py-0.5 rounded-md text-[9px] font-semibold"><CheckCircle2 size={8} /> Completed</span>
                        ) : (
                          <span className="inline-block bg-[#FFF7E6] text-[#B54708] px-1.5 py-0.5 rounded-md text-[9px] font-semibold">In Progress</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div>
                        <p className="text-gray-400 text-[10px]">Payment</p>
                        <PaymentStatusCircle percent={project.paidPercent} size={32} strokeWidth={3} />
                      </div>
                      <div>
                        <p className="text-gray-400 text-[10px]">Quotation</p>
                        <p className="font-semibold text-[#0F172A]">{project.budgetNum > 0 ? `$${project.budgetNum.toLocaleString()}` : "N/A"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(project.clientCode || project.projectCode) && (
                      <span className="bg-[#1B6FE8]/10 text-[#1B6FE8] text-[10px] font-bold px-2 py-0.5 rounded-lg">{project.clientCode || project.projectCode}</span>
                    )}
                    {project.service && project.service !== "N/A" && (
                      <span className="bg-gray-100 text-gray-600 text-[10px] font-medium px-2 py-0.5 rounded-lg">{project.service}</span>
                    )}
                    {project.email && (
                      <EmailWithExtraCell
                        email={project.email}
                        allEmails={parseEmails(project.email)}
                        variant="pill"
                        className="px-2 py-0.5 text-[10px]"
                        emptyLabel=""
                        clientName={project.client}
                        company={project.company !== "N/A" ? project.company : undefined}
                      />
                    )}
                  </div>

                  <div className="pt-1">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <StickyNote size={9} />Bid Instruction
                    </p>
                    <CommentCell id={project.id} noteHistory={project.noteHistory} onAddNote={addNote} />
                  </div>
                </div>
              ))}
            </div>

            {/* ── DESKTOP TABLE (lg+) ── */}
            <div className="hidden lg:block overflow-x-auto">
              <div className="min-w-[1180px]">
                <div className={`grid gap-x-4 px-5 xl:px-6 py-3 xl:py-4 ${CRM_GRID_HEAD_ROW} ${PROJECT_GRID_HEAD}`}>
                  {["Client Detail", "Project Detail", "Quoted", "Payment Detail", "Client Deadline", "Bid Instruction", "Actions"].map(h => (
                    <span key={h} className={PROJECT_TABLE_HEAD}>{h}</span>
                  ))}
                </div>

                <div className="divide-y divide-[#F3F3F3]">
                  {paginated.map(project => (
                    <div
                      key={project.id}
                      className={`grid gap-x-4 px-5 xl:px-6 py-3 xl:py-4 items-start hover:bg-[#FAFAFA] transition-colors ${PROJECT_GRID_ROW}`}
                    >
                      <div className="min-w-0"><ClientDetailCell p={projectAsRow(project)} /></div>
                      <div className="min-w-0"><ProjectDetailCell p={projectAsRow(project)} /></div>
                      <div className="min-w-0"><QuotedAmountCell p={projectAsRow(project)} /></div>
                      <div className="min-w-0"><PaymentDetailCell p={projectAsRow(project)} /></div>
                      <div className="min-w-0"><FulfillmentCell p={projectAsRow(project)} /></div>
                      <div className="min-w-0 pt-0.5">
                        <CommentCell id={project.id} noteHistory={project.noteHistory} onAddNote={addNote} />
                      </div>
                      <div className="flex items-center gap-1.5 xl:gap-2 pt-0.5">
                        <button onClick={() => openDetail(project)}
                          className="w-8 h-8 xl:w-9 xl:h-9 rounded-xl bg-[#EAF5FF] text-[#0B84F3] flex items-center justify-center hover:opacity-80 transition-opacity">
                          <Eye size={13} className="xl:w-[15px] xl:h-[15px]" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-4 sm:px-6">
              <Pagination
                page={page}
                totalPages={totalPages}
                total={filteredProjects.length}
                pageSize={PAGE_SIZE}
                onPage={setPage}
              />
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl sm:rounded-[30px] shadow-sm p-10 sm:p-12 lg:p-16 mt-4 sm:mt-7 text-center">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-[#EAF2FE] text-[#1B6FE8] flex items-center justify-center mx-auto mb-4 sm:mb-5">
              <FolderKanban size={24} className="sm:w-7 sm:h-7" />
            </div>
            <h2 className="text-lg sm:text-[22px] font-bold text-[#0F172A]">No Projects Yet</h2>
            <p className="text-gray-500 mt-1.5 sm:mt-2 text-xs sm:text-sm">
              Projects appear when a client is marked &ldquo;Close Client&rdquo; — or add one manually.
            </p>
            <button
              onClick={openAddModal}
              className="mt-4 sm:mt-5 inline-flex items-center gap-2 h-10 sm:h-11 px-5 sm:px-6 rounded-xl sm:rounded-2xl bg-[#1B6FE8] text-white text-xs sm:text-sm font-semibold hover:bg-[#a30f27] transition-colors"
            >
              <Plus size={13} className="sm:w-[15px] sm:h-[15px]" />Add New Project
            </button>
          </div>
        )}

        {/* ══ ADD NEW PROJECT MODAL ══ */}
        {showAddModal && (
          <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div
              className="w-full sm:max-w-[540px] lg:max-w-[560px] bg-white rounded-t-[24px] sm:rounded-[28px] shadow-2xl flex flex-col overflow-hidden"
              style={{ maxHeight: "92vh" }}
            >
              <div className="relative bg-gradient-to-br from-[#1B6FE8] to-[#0E4FBE] px-4 sm:px-5 lg:px-6 pt-4 sm:pt-5 pb-4 sm:pb-5 shrink-0 overflow-hidden">
                <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
                <button onClick={resetAddModal}
                  className="absolute top-3 sm:top-4 right-3 sm:right-4 w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors z-10">
                  <X size={13} className="sm:w-[15px] sm:h-[15px]" />
                </button>
                <div className="flex items-center gap-2.5 sm:gap-3 pr-10">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                    <Plus size={18} className="text-white sm:w-[22px] sm:h-[22px]" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base lg:text-lg font-bold text-white">Add New Project</h2>
                    <p className="text-white/65 text-[10px] sm:text-xs mt-0.5">Manually add a project for any client</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain">
                <div className="px-4 sm:px-5 lg:px-6 py-4 sm:py-5 space-y-3 sm:space-y-5">
                  {addError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl">
                      {addError}
                    </div>
                  )}

                  <div className="bg-[#F8F9FC] rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-3 sm:space-y-4">
                    <div className="flex items-center gap-2">
                      <User2 size={12} className="text-[#1B6FE8] sm:w-[14px] sm:h-[14px]" />
                      <p className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Client Information</p>
                    </div>

                    <div>
                      <label className="text-[10px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 sm:mb-1.5 block">
                        Phone <span className="text-gray-300 normal-case font-normal">(enter first to auto-fill)</span>
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={addForm.clientPhone}
                          placeholder="+1 234 567 890"
                          onChange={e => {
                            const value = e.target.value;
                            setAddForm(f => ({ ...f, clientPhone: value }));
                            onPhoneValueChange(value);
                          }}
                          onBlur={e => onPhoneBlur(e.target.value)}
                          onPaste={onPhonePaste}
                          className="w-full h-10 sm:h-11 rounded-xl sm:rounded-2xl border-2 border-gray-200 bg-white px-3 sm:px-4 pr-9 sm:pr-10 text-sm outline-none focus:border-[#1B6FE8] transition-colors placeholder:text-gray-300"
                        />
                        {phoneLookupLoading && (
                          <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#1B6FE8] animate-spin" />
                        )}
                      </div>
                    </div>

                    {returningClient && (
                      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-[10px] sm:text-xs px-3 py-2 rounded-xl">
                        <User2 size={12} className="shrink-0" />
                        Returning client — name &amp; company auto-filled from previous record
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                      <div>
                        <label className="text-[10px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 sm:mb-1.5 block">
                          Client Name <span className="text-[#1B6FE8]">*</span>
                        </label>
                        <input type="text" value={addForm.clientName} placeholder="e.g. John Smith"
                          onChange={e => setAddForm(f => ({ ...f, clientName: e.target.value }))}
                          className="w-full h-10 sm:h-11 rounded-xl sm:rounded-2xl border-2 border-gray-200 bg-white px-3 sm:px-4 text-sm outline-none focus:border-[#1B6FE8] transition-colors placeholder:text-gray-300"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 sm:mb-1.5 block">Company Name</label>
                        <input type="text" value={addForm.clientCompany} placeholder="Company name"
                          onChange={e => setAddForm(f => ({ ...f, clientCompany: e.target.value }))}
                          className="w-full h-10 sm:h-11 rounded-xl sm:rounded-2xl border-2 border-gray-200 bg-white px-3 sm:px-4 text-sm outline-none focus:border-[#1B6FE8] transition-colors placeholder:text-gray-300"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 sm:mb-2">
                      <Hash size={10} className="text-[#1B6FE8] sm:w-2.75 sm:h-2.75" />
                      Project Code <span className="text-gray-300 normal-case">(optional)</span>
                    </label>
                    <input type="text" value={addForm.projectCode} placeholder="e.g. BIM-2024-001"
                      onChange={e => setAddForm(f => ({ ...f, projectCode: e.target.value }))}
                      className="w-full h-10 sm:h-11 rounded-xl sm:rounded-2xl border-2 border-gray-200 bg-[#FAFAFA] px-3 sm:px-4 text-sm outline-none focus:border-[#1B6FE8] focus:bg-white transition-colors placeholder:text-gray-300"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 sm:mb-2">
                      <FileText size={10} className="text-[#1B6FE8] sm:w-[11px] sm:h-[11px]" />
                      Project Title <span className="text-[#1B6FE8]">*</span>
                    </label>
                    <input type="text" value={addForm.projectTitle} placeholder="e.g. BIM Modeling Phase 1"
                      onChange={e => setAddForm(f => ({ ...f, projectTitle: e.target.value }))}
                      className="w-full h-10 sm:h-11 rounded-xl sm:rounded-2xl border-2 border-gray-200 bg-[#FAFAFA] px-3 sm:px-4 text-sm outline-none focus:border-[#1B6FE8] focus:bg-white transition-colors placeholder:text-gray-300"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 sm:mb-2">
                      <Briefcase size={10} className="text-[#1B6FE8] sm:w-[11px] sm:h-[11px]" />
                      Service Type <span className="text-[#1B6FE8]">*</span>
                    </label>
                    <ServicePicker value={addForm.service} onChange={v => setAddForm(f => ({ ...f, service: v }))} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <div>
                      <label className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 sm:mb-2">
                        <Clock3 size={10} className="text-[#1B6FE8] sm:w-[11px] sm:h-[11px]" />
                        Deadline <span className="text-[#1B6FE8]">*</span>
                      </label>
                      <input type="date" value={addForm.deadline}
                        onChange={e => setAddForm(f => ({ ...f, deadline: e.target.value }))}
                        className={`w-full h-10 sm:h-11 rounded-xl sm:rounded-2xl border-2 px-2 sm:px-3 text-xs sm:text-sm outline-none transition-colors ${
                          addForm.deadline && isDeadlinePast(addForm.deadline)
                            ? "border-green-400 bg-green-50 text-green-800"
                            : "border-gray-200 bg-[#FAFAFA] focus:border-[#1B6FE8] focus:bg-white"
                        }`}
                      />
                      {addForm.deadline && <DeadlineStatus deadline={addForm.deadline} />}
                    </div>
                    <div>
                      <label className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 sm:mb-2">
                        <DollarSign size={10} className="text-[#1B6FE8] sm:w-[11px] sm:h-[11px]" />Budget
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input type="text" placeholder="0.00" value={addForm.budget.replace(/^\$/, "")}
                          onChange={e => setAddForm(f => ({ ...f, budget: e.target.value }))}
                          className="w-full h-10 sm:h-11 rounded-xl sm:rounded-2xl border-2 border-gray-200 bg-[#FAFAFA] pl-6 sm:pl-7 pr-2 sm:pr-3 text-xs sm:text-sm outline-none focus:border-[#1B6FE8] focus:bg-white transition-colors placeholder:text-gray-300"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 sm:mb-2">
                      <AlignLeft size={10} className="text-[#1B6FE8] sm:w-[11px] sm:h-[11px]" />Bid Instruction
                    </label>
                    <textarea value={addForm.notes} placeholder="Bid Instruction notes..." rows={3}
                      onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                      className="w-full rounded-xl sm:rounded-2xl border-2 border-gray-200 bg-[#FAFAFA] px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm outline-none focus:border-[#1B6FE8] focus:bg-white transition-colors resize-none placeholder:text-gray-300"
                    />
                  </div>

                  <div className="flex gap-2 sm:gap-3 pb-1 sm:pb-2">
                    <button onClick={resetAddModal}
                      className="flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl bg-[#F5F6FA] text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-colors">
                      Cancel
                    </button>
                    <button onClick={handleAddProject} disabled={addSaving}
                      className={`flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all ${
                        !addSaving ? "bg-gradient-to-r from-[#1B6FE8] to-[#d4173a] shadow-md shadow-red-200" : "bg-gray-200 cursor-not-allowed text-gray-400"
                      }`}>
                      {addSaving
                        ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving...</>
                        : <><Plus size={14} />Add Project</>
                      }
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <ProjectWorkbenchModal
          open={!!viewingProject}
          onClose={() => setViewingProject(null)}
          initial={viewingProject ? csrToWorkbench(viewingProject) : emptyWorkbench()}
          mode="csr"
          saving={workbenchSaving}
          onSave={saveWorkbench}
          noteHistory={viewingProject?.noteHistory}
          onAddNote={async (text, parentId) => { if (viewingProject) await addNote(viewingProject.id, text, parentId); }}
        />

      </main>
    </div>
  );
}
