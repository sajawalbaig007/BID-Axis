"use client";

import { useRef, useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  UploadCloud, FileText, Trash2, CheckCircle2, Users,
  Database, FileSpreadsheet, FileImage, FileArchive, FileBadge,
  Loader2, X, Building2, ChevronDown, ChevronUp, RefreshCw, RotateCcw,
  PhoneCall, Star, Briefcase, Globe, Plus, History, AlertCircle, Pencil,
  Download, Search, ArrowLeftRight,
} from "lucide-react";

import { StaffSidebar } from "@/app/hooks/useStaffSidebar";
import DashboardNavbar  from "../components/layout/Navbar";
import UploadFilePreview, { type PreviewRow, type PreviewSummary } from "../components/uploads/UploadFilePreview";
import UploadActionBento from "../components/uploads/UploadActionBento";
import UploadAnalyticsBento from "../components/uploads/UploadAnalyticsBento";
import API, { apiErrorMessage } from "@/lib/api";
import { formatEstDate, formatEstDateTime } from "@/lib/estTime";
import { CSR_THEAD } from "@/app/csr/components/shared/csrTableStyles";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

/* ── Types ── */
type UploadFile = {
  id: number; name: string; size: string; type: string;
  progress: number; leads: number; distributed: boolean;
  status: "Uploading" | "Processing" | "Distributed";
  companyName: string;
};

type CSRDistribution = { name: string; leads: number };
type CSR = { id: string; name: string; email: string; isActive: boolean; csrCode?: string | null };

type SourceStats = {
  total: number; pending: number; important: number; interested: number;
  notPicked: number; projectWon: number; notInterested: number;
};

type UploadSourceRow = {
  id: string; name: string; sudoName: string | null; createdAt: string;
  uploadCount: number; lastUpload: string | null; stats: SourceStats;
};

type RowResult = {
  row: number;
  name: string;
  phone: string;
  email: string;
  company: string;
  interestedService?: string;
  status: "new" | "duplicate" | "updated" | "empty";
  reason: string;
};

type UploadSummary = {
  new: number;
  duplicate: number;
  updated: number;
  empty: number;
  total?: number;
};

type HistoryUpload = {
  id: string;
  fileName: string;
  totalLeads: number;
  linkedLeads: number;
  companyName: string | null;
  uploadCategory: string | null;
  source: { id: string; name: string; sudoName: string | null } | null;
  createdAt: string;
};

type UploadCategoryKey =
  | "all"
  | "call-data"
  | "new-client"
  | "old-client"
  | "interested"
  | "important"
  | "active-projects";

const HISTORY_CATEGORIES: { key: UploadCategoryKey; label: string; color: string }[] = [
  { key: "all",             label: "All",             color: "text-gray-700" },
  { key: "call-data",       label: "Call Data",       color: "text-[#0B84F3]" },
  { key: "new-client",      label: "New Client",      color: "text-[#15803D]" },
  { key: "old-client",      label: "Old Client",      color: "text-[#B45309]" },
  { key: "interested",      label: "Interested",      color: "text-[#D97706]" },
  { key: "important",       label: "Important",       color: "text-[#1B6FE8]" },
  { key: "active-projects", label: "Active Projects", color: "text-indigo-600" },
];

const CATEGORY_LABEL_MAP = Object.fromEntries(
  HISTORY_CATEGORIES.map(c => [c.key, c.label])
) as Record<UploadCategoryKey, string>;

type ModalStep = "category" | "reset" | "company" | "source" | "pane" | "csrs";
type TradeRow = { id: string; name: string };

const PRESET_COMPANIES = ["PS Estimating", "Devcon", "Other"];

const filterCsrsBySearch = (list: CSR[], query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.email.toLowerCase().includes(q) ||
    (c.csrCode?.toLowerCase().includes(q) ?? false)
  );
};

const sourceAdminLabel = (s: { name: string; sudoName?: string | null }) =>
  s.sudoName ? `${s.name} · ${s.sudoName}` : s.name;
const PREVIEW_PAGE_SIZE = 30;
const REASSIGN_PAGES = [
  { key: "important", label: "Important" },
  { key: "schedule", label: "Schedule Call" },
  { key: "interested", label: "Interested" },
  { key: "pending", label: "Pending / Today" },
  { key: "not_picked", label: "Not Picked" },
  { key: "not_interested", label: "Not Interested" },
  { key: "no_owner", label: "No Owner" },
  { key: "not_in_service", label: "Not In Service" },
  { key: "in_house", label: "In House" },
  { key: "close_client", label: "Close Client" },
] as const;
const REASSIGN_MATCH_DEST = new Set<string>(["pending", "no_owner", "not_in_service", "in_house"]);
const RESULT_FILTER_OPTIONS = [
  { key: "all" as const, label: "All" },
  { key: "new" as const, label: "New" },
  { key: "duplicate" as const, label: "Duplicate" },
  { key: "updated" as const, label: "Updated" },
  { key: "empty" as const, label: "Skipped" },
];

const STATUS_STYLE: Record<RowResult["status"], { bg: string; text: string; label: string }> = {
  new:       { bg: "bg-green-100",  text: "text-green-700",  label: "New" },
  duplicate: { bg: "bg-red-100",    text: "text-red-700",    label: "Duplicate" },
  updated:   { bg: "bg-blue-100",   text: "text-blue-700",   label: "Updated" },
  empty:     { bg: "bg-gray-100",   text: "text-gray-500",   label: "Skipped" },
};

/** Excel templates Admin should fill before each upload box */
const UPLOAD_TEMPLATES = {
  callData:   { href: "/upload-templates/CRM-Call-Data-Template.xlsx",           label: "Call Data",       cols: "Name, Company, Phone, Email, State, Sub Contacts, Search Trade, Trades" },
  newClient:  { href: "/upload-templates/CRM-New-Clients-Template.xlsx",         label: "New Clients",     cols: "+ Code, Project, Quotation, Service, Notes" },
  oldClient:  { href: "/upload-templates/CRM-Old-Clients-Template.xlsx",         label: "Old Clients",     cols: "+ Code, Project, Quotation, Service, Notes" },
  important:  { href: "/upload-templates/CRM-Important-Clients-Template.xlsx",   label: "Important",       cols: "Name, Company, Phone, Email, State, Notes" },
  interested: { href: "/upload-templates/CRM-Interested-Clients-Template.xlsx",  label: "Interested",      cols: "+ Interested Service, Notes" },
  active:     { href: "/upload-templates/CRM-Active-Projects-Template.xlsx",     label: "Active Projects", cols: "+ Code, Project Detail, Quotation, Notes" },
} as const;

function TemplateDownloadLink({
  href, label, cols, className = "",
}: { href: string; label: string; cols?: string; className?: string }) {
  return (
    <a
      href={href}
      download
      onClick={e => e.stopPropagation()}
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs sm:text-sm font-bold transition-colors hover:bg-white shadow-sm ${className}`}
      title={cols ? `Columns: ${cols}` : undefined}
    >
      <Download size={14} className="shrink-0" />
      {label}
    </a>
  );
}

const getFileIcon = (type: string) => {
  if (type.includes("sheet") || type.includes("excel") || type.includes("csv"))
    return <FileSpreadsheet size={22} className="text-green-600" />;
  if (type.includes("image"))
    return <FileImage size={22} className="text-blue-600" />;
  if (type.includes("zip") || type.includes("rar"))
    return <FileArchive size={22} className="text-yellow-600" />;
  return <FileBadge size={22} className="text-[#1B6FE8]" />;
};

export default function UploadPage() {
  const inputRef             = useRef<HTMLInputElement | null>(null);
  const inputRefImportant    = useRef<HTMLInputElement | null>(null);
  const inputRefInterested   = useRef<HTMLInputElement | null>(null);
  const inputRefActive       = useRef<HTMLInputElement | null>(null);

  const [dragging,            setDragging]            = useState(false);
  const [draggingImportant,   setDraggingImportant]   = useState(false);
  const [draggingInterested,  setDraggingInterested]  = useState(false);
  const [draggingActive,      setDraggingActive]      = useState(false);
  const [uploadMode,          setUploadMode]          = useState<"regular" | "important" | "interested" | "active">("regular");
  const [files,              setFiles]              = useState<UploadFile[]>([]);
  const [latestDistribution, setLatestDistribution] = useState<CSRDistribution[]>([]);
  const [latestTotalLeads,   setLatestTotalLeads]   = useState(0);

  const [showHistoryModal,   setShowHistoryModal]   = useState(false);
  const [uploadHistory,      setUploadHistory]      = useState<HistoryUpload[]>([]);
  const [historyCategory,    setHistoryCategory]    = useState<UploadCategoryKey>("all");
  const [historyCounts,      setHistoryCounts]      = useState<Record<string, number>>({});
  const [historyLoading,     setHistoryLoading]     = useState(false);
  const [deletingUploadId,   setDeletingUploadId]   = useState<string | null>(null);

  const [rowResults,         setRowResults]         = useState<RowResult[]>([]);
  const [uploadSummary,      setUploadSummary]      = useState<UploadSummary | null>(null);
  const [lastUploadName,     setLastUploadName]     = useState("");
  const [resultsFilter,      setResultsFilter]      = useState<"all" | RowResult["status"]>("all");
  const [resultsPage,        setResultsPage]        = useState(1);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [previewLoading,     setPreviewLoading]     = useState(false);
  const [previewLive,        setPreviewLive]        = useState(false);
  const [resultsExpanded,    setResultsExpanded]    = useState(true);
  const [sourcesManageOpen, setSourcesManageOpen]  = useState(false);
  const [sourceHistoryOpen, setSourceHistoryOpen]    = useState(false);
  const [latestDistributionOpen, setLatestDistributionOpen] = useState(false);

  const [showCSRModal,  setShowCSRModal]  = useState(false);
  const [selectedFile,  setSelectedFile]  = useState<File | null>(null);
  const [csrs,          setCsrs]          = useState<CSR[]>([]);
  const [selectedCSRs,  setSelectedCSRs]  = useState<string[]>([]);
  const [csrSearchQuery, setCsrSearchQuery] = useState("");

  /* Bulk reassign leads between CSRs (Uploads card) */
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignFromCsrId, setReassignFromCsrId] = useState("");
  const [reassignToCsrIds, setReassignToCsrIds] = useState<string[]>([]);
  const [reassignFromPage, setReassignFromPage] = useState<string>("important");
  const [reassignToPage, setReassignToPage] = useState<string>("important");
  const [reassignSubmitting, setReassignSubmitting] = useState(false);
  const [reassignSearch, setReassignSearch] = useState("");

  /* Download one CSR's full page data as a multi-sheet Excel */
  const [showCsrExportModal, setShowCsrExportModal] = useState(false);
  const [csrExportSearch, setCsrExportSearch] = useState("");
  const [csrExportingId, setCsrExportingId] = useState<string | null>(null);

  const [selectedCompany, setSelectedCompany] = useState("");
  const [customCompany,   setCustomCompany]   = useState("");
  const [modalStep, setModalStep] = useState<ModalStep>("category");
  const [resetMode, setResetMode] = useState<"keep" | "reset" | null>(null);

  const [selectedPane,     setSelectedPane]     = useState<"pending" | "lead">("pending");
  const [selectedLeadType, setSelectedLeadType] = useState<"new" | "old">("new");

  const [uploadSources,    setUploadSources]    = useState<UploadSourceRow[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [newSourceName,    setNewSourceName]    = useState("");
  const [newSourceSudoName, setNewSourceSudoName] = useState("");
  const [addingSource,     setAddingSource]     = useState(false);
  const [editingSourceId,  setEditingSourceId]  = useState<string | null>(null);
  const [editSourceName,   setEditSourceName]   = useState("");
  const [editSourceSudoName, setEditSourceSudoName] = useState("");
  const [savingSourceId,   setSavingSourceId]   = useState<string | null>(null);
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);
  const [assigningUploadId, setAssigningUploadId] = useState<string | null>(null);
  const [assignSourceId,   setAssignSourceId]   = useState("");
  const [assignNewSourceName, setAssignNewSourceName] = useState("");
  const [assignNewSourceSudoName, setAssignNewSourceSudoName] = useState("");
  const [savingAssignId,   setSavingAssignId]   = useState<string | null>(null);

  /* Trades */
  const [trades,          setTrades]          = useState<TradeRow[]>([]);
  const [newTradeName,    setNewTradeName]    = useState("");
  const [addingTrade,     setAddingTrade]     = useState(false);
  const [deletingTradeId, setDeletingTradeId] = useState<string | null>(null);
  const [tradesManageOpen, setTradesManageOpen] = useState(false);
  const [historySourceId,  setHistorySourceId]  = useState<string | "all">("all");
  const [sourceDetail,     setSourceDetail]     = useState<{
    stats: SourceStats;
    uploads: { id: string; fileName: string; totalLeads: number; createdAt: string }[];
  } | null>(null);

  const [filePreviewRows,    setFilePreviewRows]    = useState<PreviewRow[]>([]);
  const [filePreviewSummary, setFilePreviewSummary] = useState<PreviewSummary | null>(null);
  const [filePreviewLoading, setFilePreviewLoading] = useState(false);
  const [filePreviewSkipped, setFilePreviewSkipped] = useState(false);
  const [hideDupInPreview,     setHideDupInPreview]     = useState(true);
  const [previewFilter,        setPreviewFilter]        = useState<"all" | PreviewRow["status"]>("all");

  const fetchUploadSources = async () => {
    try {
      const res = await API.get("/admin/upload-sources");
      setUploadSources(res.data.sources ?? []);
    } catch { /* non-blocking */ }
  };

  const fetchSourceDetail = async (sourceId: string) => {
    try {
      const res = await API.get(`/admin/upload-sources/${sourceId}`);
      setSourceDetail({ stats: res.data.stats, uploads: res.data.uploads ?? [] });
    } catch { setSourceDetail(null); }
  };

  const fetchTrades = async () => {
    try {
      const res = await API.get("/admin/trades");
      setTrades(res.data.trades ?? []);
    } catch { /* non-blocking */ }
  };

  const addNewTrade = async () => {
    const name = newTradeName.trim();
    if (!name) { toast.error("Enter a trade name"); return; }
    setAddingTrade(true);
    try {
      await API.post("/admin/trades", { name });
      toast.success(`"${name}" added`);
      setNewTradeName("");
      await fetchTrades();
    } catch { toast.error("Failed to add trade"); }
    finally { setAddingTrade(false); }
  };

  const deleteTrade = async (id: string, name: string) => {
    if (!confirm(`Delete trade "${name}"?`)) return;
    setDeletingTradeId(id);
    try {
      await API.delete(`/admin/trades/${id}`);
      await fetchTrades();
    } catch { toast.error("Failed to delete trade"); }
    finally { setDeletingTradeId(null); }
  };

  const addNewSource = async () => {
    const name = newSourceName.trim();
    const sudoName = newSourceSudoName.trim();
    if (!name) { toast.error("Enter a source name"); return; }
    setAddingSource(true);
    try {
      const res = await API.post("/admin/upload-sources", { name, sudoName: sudoName || undefined });
      const src = res.data.source as { id: string; name: string };
      setSelectedSourceId(src.id);
      setNewSourceName("");
      setNewSourceSudoName("");
      toast.success(res.data.created ? `"${name}" added` : `"${name}" selected`);
      await fetchUploadSources();
    } catch {
      toast.error("Failed to add source");
    } finally {
      setAddingSource(false);
    }
  };

  const startEditSource = (src: UploadSourceRow) => {
    setEditingSourceId(src.id);
    setEditSourceName(src.name);
    setEditSourceSudoName(src.sudoName ?? "");
  };

  const cancelEditSource = () => {
    setEditingSourceId(null);
    setEditSourceName("");
    setEditSourceSudoName("");
  };

  const saveEditSource = async (id: string) => {
    const name = editSourceName.trim();
    if (!name) { toast.error("Source name required"); return; }
    setSavingSourceId(id);
    try {
      await API.patch(`/admin/upload-sources/${id}`, {
        name,
        sudoName: editSourceSudoName.trim() || null,
      });
      toast.success("Source updated");
      cancelEditSource();
      await fetchUploadSources();
    } catch {
      toast.error("Failed to update source");
    } finally {
      setSavingSourceId(null);
    }
  };

  const deleteSource = async (id: string, name: string) => {
    if (!confirm(`Delete source "${name}"?\n\nPast uploads will remain but lose their source link.`)) return;
    setDeletingSourceId(id);
    try {
      await API.delete(`/admin/upload-sources/${id}`);
      toast.success("Source deleted");
      if (historySourceId === id) {
        setHistorySourceId("all");
        setSourceDetail(null);
      }
      if (selectedSourceId === id) setSelectedSourceId("");
      await fetchUploadSources();
    } catch {
      toast.error("Failed to delete source");
    } finally {
      setDeletingSourceId(null);
    }
  };

  const cancelAssignSource = () => {
    setAssigningUploadId(null);
    setAssignSourceId("");
    setAssignNewSourceName("");
    setAssignNewSourceSudoName("");
  };

  const openAssignSource = (uploadId: string) => {
    setAssigningUploadId(uploadId);
    setAssignSourceId("");
    setAssignNewSourceName("");
    setAssignNewSourceSudoName("");
  };

  const saveAssignSource = async (uploadId: string) => {
    if (!assignSourceId && !assignNewSourceName.trim()) {
      toast.error("Select or create a source");
      return;
    }
    setSavingAssignId(uploadId);
    try {
      const body: Record<string, string> = assignSourceId
        ? { sourceId: assignSourceId }
        : {
            name: assignNewSourceName.trim(),
            ...(assignNewSourceSudoName.trim() ? { sudoName: assignNewSourceSudoName.trim() } : {}),
          };
      const res = await API.patch(`/uploads/${uploadId}/source`, body);
      const updated = res.data.upload as HistoryUpload;
      setUploadHistory(prev => prev.map(u => (u.id === uploadId ? { ...u, source: updated.source } : u)));
      toast.success("Source assigned");
      cancelAssignSource();
      void fetchUploadSources();
    } catch {
      toast.error("Failed to assign source");
    } finally {
      setSavingAssignId(null);
    }
  };

  const fetchCSRs = async () => {
    try {
      const res = await API.get("/admin/csrs");
      setCsrs(res.data.csrs);
    } catch { toast.error("Failed to fetch CSRs"); }
  };

  const openReassignModal = async () => {
    setReassignFromCsrId("");
    setReassignToCsrIds([]);
    setReassignFromPage("important");
    setReassignToPage("important");
    setReassignSearch("");
    setShowReassignModal(true);
    if (!csrs.length) await fetchCSRs();
  };

  const openCsrExportModal = async () => {
    setCsrExportSearch("");
    setShowCsrExportModal(true);
    if (!csrs.length) await fetchCSRs();
  };

  const filenameFromDisposition = (header: string | undefined, fallback: string) => {
    if (!header) return fallback;
    const star = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (star?.[1]) {
      try {
        return decodeURIComponent(star[1]);
      } catch {
        return star[1];
      }
    }
    const plain = header.match(/filename="?([^";]+)"?/i);
    return plain?.[1] ?? fallback;
  };

  const downloadCsrPagesExcel = async (csr: CSR) => {
    if (csrExportingId) return;
    setCsrExportingId(csr.id);
    try {
      const res = await API.get(`/admin/csrs/${csr.id}/data-export`, {
        responseType: "arraybuffer",
        timeout: 180_000,
      });
      const contentType =
        String(res.headers?.["content-type"] ?? "") ||
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      if (contentType.includes("application/json")) {
        toast.error("Download failed — server returned an error");
        return;
      }
      const blob = new Blob([res.data], { type: contentType });
      if (blob.size < 80) {
        toast.error("Download failed — empty file");
        return;
      }
      const fallback = `${(csr.csrCode ? `${csr.csrCode}-` : "")}${csr.name.replace(/\s+/g, "-")}-CSR-pages.xlsx`;
      const filename = filenameFromDisposition(
        String(res.headers?.["content-disposition"] ?? ""),
        fallback,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${csr.name} — Excel downloaded`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to download CSR data"));
    } finally {
      setCsrExportingId(null);
    }
  };

  const toggleReassignToCsr = (id: string) => {
    setReassignToCsrIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const submitReassignLeads = async () => {
    if (!reassignFromCsrId) {
      toast.error("Select source CSR");
      return;
    }
    if (!reassignFromPage) {
      toast.error("Select source page");
      return;
    }
    if (!reassignToCsrIds.length) {
      toast.error("Select at least one destination CSR");
      return;
    }
    if (!reassignToPage) {
      toast.error("Select destination page");
      return;
    }
    const samePage = reassignFromPage === reassignToPage;
    const dest = samePage
      ? reassignToCsrIds.filter((id) => id !== reassignFromCsrId)
      : reassignToCsrIds;
    if (!dest.length) {
      toast.error(
        samePage
          ? "Same page: pick a different destination CSR"
          : "Destination CSR must differ from source",
      );
      return;
    }
    if (reassignToPage === "schedule" && reassignFromPage !== "schedule") {
      toast.error("Schedule destination only works when source page is Schedule Call (meeting date required)");
      return;
    }
    const fromName = csrs.find((c) => c.id === reassignFromCsrId)?.name ?? "source";
    const fromLabel = REASSIGN_PAGES.find((p) => p.key === reassignFromPage)?.label ?? reassignFromPage;
    const toLabel = REASSIGN_PAGES.find((p) => p.key === reassignToPage)?.label ?? reassignToPage;
    if (
      !confirm(
        `Move ALL ${fromLabel} leads from ${fromName}\n→ ${dest.length} CSR(s) on page: ${toLabel}?\nEqual round-robin. Large queues (10k+) can take a few minutes.`,
      )
    ) {
      return;
    }
    setReassignSubmitting(true);
    try {
      const res = await API.post(
        "/admin/leads/reassign-bulk",
        {
          fromCsrId: reassignFromCsrId,
          toCsrIds: dest,
          fromPage: reassignFromPage,
          toPage: reassignToPage,
        },
        { timeout: 900_000 },
      );
      const moved = Number(res.data?.moved ?? 0);
      const dist = (res.data?.distribution ?? []) as { name: string; leads: number }[];
      const distLine = dist
        .filter((d) => d.leads > 0)
        .map((d) => `${d.name}: ${d.leads}`)
        .join(", ");
      toast.success(
        moved
          ? `Moved ${moved} (${fromLabel} → ${toLabel})${distLine ? ` · ${distLine}` : ""}`
          : "No matching leads to move",
      );
      setShowReassignModal(false);
    } catch (err: unknown) {
      const ax = err as {
        code?: string;
        message?: string;
        response?: { data?: { message?: string } };
      };
      const timedOut = ax.code === "ECONNABORTED" || /timeout/i.test(ax.message ?? "");
      toast.error(
        timedOut
          ? "Transfer is still running or timed out — wait and check CSR pages, then retry remaining leads."
          : (ax.response?.data?.message ?? "Reassign failed"),
      );
    } finally {
      setReassignSubmitting(false);
    }
  };

  const fetchUploadHistory = async (category?: UploadCategoryKey) => {
    const cat = category ?? historyCategory;
    setHistoryLoading(true);
    try {
      const res = await API.get("/uploads/history", {
        params: { category: cat },
        timeout: 60_000,
      });
      setUploadHistory(res.data.uploads ?? []);
      setHistoryCounts(res.data.counts ?? {});
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Failed to load upload history";
      toast.error(msg);
    } finally {
      setHistoryLoading(false);
    }
  };

  const deleteHistoryUpload = async (id: string, fileName: string) => {
    const linked = uploadHistory.find(u => u.id === id)?.linkedLeads ?? 0;
    if (!confirm(`Delete "${fileName}"?\n\n${linked} contact(s) will be permanently removed from the database and CSR dashboards.`)) return;
    setDeletingUploadId(id);
    try {
      const res = await API.delete(`/uploads/${id}`);
      toast.success(res.data.message ?? "Upload deleted from DB & CSR dashboards");
      void fetchUploadHistory(historyCategory);
      void fetchLatestUpload();
      void fetchUploadSources();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Failed to delete upload";
      toast.error(msg);
    } finally {
      setDeletingUploadId(null);
    }
  };

  const openHistoryModal = () => {
    setShowHistoryModal(true);
    void fetchUploadHistory(historyCategory);
    void fetchUploadSources();
  };

  const switchHistoryCategory = (cat: UploadCategoryKey) => {
    setHistoryCategory(cat);
    void fetchUploadHistory(cat);
  };

  const fetchLatestUpload = async () => {
    try {
      const res = await API.get("/uploads/latest");
      if (res.data.file) {
        setLatestDistribution(res.data.file.distribution);
        setLatestTotalLeads(res.data.file.totalLeads);
      }
    } catch (err) { console.log(err); }
  };

  useEffect(() => {
    const load = async () => { await fetchLatestUpload(); await fetchCSRs(); await fetchUploadSources(); await fetchTrades(); };
    load();
  }, []);

  const closeCSRModal = () => {
    setShowCSRModal(false);
    setCsrSearchQuery("");
    setFilePreviewRows([]);
    setFilePreviewSummary(null);
    setFilePreviewSkipped(false);
    setHideDupInPreview(true);
    setPreviewFilter("all");
    setFilePreviewLoading(false);
  };

  const goToCsrStep = () => {
    setFilePreviewSkipped(true);
    setFilePreviewRows([]);
    setFilePreviewSummary(null);
    setFilePreviewLoading(false);
    setModalStep("csrs");
  };

  const openCSRModal = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    setUploadMode("regular");
    setSelectedFile(selectedFiles[0]);
    setSelectedCompany("");
    setCustomCompany("");
    setResetMode(null);
    setSelectedPane("pending");
    setSelectedLeadType("new");
    setSelectedSourceId("");
    setModalStep("category");
    setSelectedCSRs(csrs.filter(c => c.isActive).map(c => c.id));
    setShowCSRModal(true);
  };

  const openImportantModal = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    setUploadMode("important");
    setSelectedFile(selectedFiles[0]);
    setSelectedCompany("");
    setCustomCompany("");
    setResetMode("keep");
    setSelectedPane("pending");
    setSelectedLeadType("old");
    setSelectedSourceId("");
    setModalStep("source");
    setSelectedCSRs(csrs.filter(c => c.isActive).map(c => c.id));
    setShowCSRModal(true);
  };

  const openInterestedModal = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    setUploadMode("interested");
    setSelectedFile(selectedFiles[0]);
    setSelectedCompany("");
    setCustomCompany("");
    setResetMode("keep");
    setSelectedPane("lead");
    setSelectedLeadType("new");
    setSelectedSourceId("");
    setModalStep("source");
    setSelectedCSRs(csrs.filter(c => c.isActive).map(c => c.id));
    setShowCSRModal(true);
  };

  const openActiveModal = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    setUploadMode("active");
    setSelectedFile(selectedFiles[0]);
    setSelectedCompany("");
    setCustomCompany("");
    setResetMode("keep");
    setSelectedPane("lead");
    setSelectedLeadType("old");
    setSelectedSourceId("");
    setModalStep("source");
    setSelectedCSRs(csrs.filter(c => c.isActive).map(c => c.id));
    setShowCSRModal(true);
  };

  const finalCompany = selectedCompany === "Other" ? customCompany : selectedCompany;

  const buildUploadFormData = () => {
    if (!selectedFile) return null;
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("selectedCSRs", JSON.stringify(selectedCSRs));
    formData.append("companyName", finalCompany.trim());
    formData.append("resetMode", resetMode ?? "keep");
    formData.append("initialStatuses", JSON.stringify(
      uploadMode === "important"  ? ["important"]    :
      uploadMode === "interested" ? ["interested"]   :
      uploadMode === "active"     ? ["Close Client"] :
      selectedPane === "lead"     ? ["Close Client"] :
      ["pending"]
    ));
    formData.append("leadType",
      uploadMode === "important"  ? "old"    :
      uploadMode === "interested" ? "new"    :
      uploadMode === "active"     ? "active" :
      selectedLeadType
    );
    if (selectedSourceId) formData.append("sourceId", selectedSourceId);
    return formData;
  };

  const handleFiles = async () => {
    if (!selectedFile) return;
    /* Company required only for regular Call Data uploads — special uploads (important/interested/active) and client sheets use Excel row company */
    const needsCompany = uploadMode === "regular" && selectedPane === "pending";
    if (needsCompany && !finalCompany.trim()) { toast.error("Please enter company name"); return; }
    if (selectedCSRs.length === 0) { toast.error("Select at least one CSR"); return; }

    const formData = buildUploadFormData();
    if (!formData) return;

    const fileMb = selectedFile.size / (1024 * 1024);
    if (fileMb > 100) {
      toast.error("File is over 100 MB. Split the sheet into smaller files and upload again.");
      return;
    }
    if (fileMb > 40) {
      toast("Large file — import may take several minutes. Keep this tab open.", { icon: "⏳", duration: 6_000 });
    }

    closeCSRModal();
    setResultsExpanded(true);
    setPreviewLoading(true);
    setPreviewLive(true);
    setRowResults([]);
    setUploadSummary(null);
    setLastUploadName(selectedFile.name);
    setResultsFilter("all");
    setResultsPage(1);

    const tempId = Date.now();

    setFiles(prev => [{
      id: tempId, name: selectedFile.name,
      size: `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`,
      type: selectedFile.type, progress: 0, leads: 0,
      distributed: false, status: "Uploading",
      companyName: finalCompany.trim(),
    }, ...prev]);

    let processingInterval: ReturnType<typeof setInterval> | null = null;

    /* Do not fire parallel /uploads/preview — that doubles DB work on large sheets.
       Upload response already returns rowResults + summary. */
    try {
      const res = await API.post("/uploads", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: fileMb > 15 ? 1_800_000 : 900_000,
        onUploadProgress: (event) => {
          if (!event.total) return;
          const pct = Math.min(50, Math.round((event.loaded / event.total) * 50));
          setFiles(prev => prev.map(f =>
            f.id === tempId ? { ...f, progress: pct, status: "Uploading" } : f
          ));
          if (event.loaded >= event.total && !processingInterval) {
            let processing = 50;
            const step = fileMb > 15 ? 0.35 : 1;
            const tickMs = fileMb > 15 ? 2000 : 350;
            setFiles(prev => prev.map(f =>
              f.id === tempId ? { ...f, progress: processing, status: "Processing" } : f
            ));
            processingInterval = setInterval(() => {
              processing = Math.min(92, processing + step);
              setFiles(prev => prev.map(f =>
                f.id === tempId ? { ...f, progress: Math.round(processing), status: "Processing" } : f
              ));
            }, tickMs);
          }
        },
      });

      if (processingInterval) clearInterval(processingInterval);
      setFiles(prev => prev.map(f =>
        f.id === tempId
          ? { ...f, progress: 100, leads: res.data.totalLeads, distributed: true, status: "Distributed" }
          : f
      ));

      const created = res.data.totalLeads as number;
      const results = (res.data.rowResults ?? []) as RowResult[];
      const summary = (res.data.summary ?? null) as UploadSummary | null;
      setRowResults(results);
      setUploadSummary(summary);
      setPreviewLive(false);
      setPreviewLoading(false);
      setLastUploadName(selectedFile.name);
      setResultsFilter("all");
      setResultsPage(1);

      if (created === 0 && (summary?.duplicate ?? 0) > 0) {
        toast.error("No new leads added — all rows were duplicates or already in database.");
      } else if (created === 0) {
        toast.error("No leads were added from this file.");
      } else {
        const dupMsg = summary?.duplicate ? ` · ${summary.duplicate} duplicate(s) skipped` : "";
        toast.success(`${created} leads uploaded & distributed${dupMsg}`);
      }
      void fetchLatestUpload();
      void fetchUploadSources();
    } catch (err: unknown) {
      if (processingInterval) clearInterval(processingInterval);
      setFiles(prev => prev.filter(f => f.id !== tempId));
      setPreviewLive(false);
      setPreviewLoading(false);
      const ax = err as { response?: { status?: number; data?: { message?: string } }; code?: string; message?: string };
      const status = ax?.response?.status;
      const serverMsg = ax?.response?.data?.message;
      if (status === 413) {
        toast.error(serverMsg || "File too large (max 100 MB). Split the sheet and retry.");
      } else if (ax?.code === "ECONNABORTED") {
        toast.error("Upload timed out. Split into smaller files (e.g. 10k–20k rows) and retry.");
      } else {
        toast.error(serverMsg || "Upload failed");
      }
    }
  };

  const removeFile = (id: number) => setFiles(prev => prev.filter(f => f.id !== id));

  const filteredResults = resultsFilter === "all"
    ? rowResults
    : rowResults.filter(r => r.status === resultsFilter);

  const previewTotalPages = Math.max(1, Math.ceil(filteredResults.length / PREVIEW_PAGE_SIZE));
  const safeResultsPage = Math.min(resultsPage, previewTotalPages);
  const paginatedResults = filteredResults.slice(
    (safeResultsPage - 1) * PREVIEW_PAGE_SIZE,
    safeResultsPage * PREVIEW_PAGE_SIZE,
  );
  const filterCount = (key: typeof resultsFilter) =>
    key === "all" ? rowResults.length : (uploadSummary?.[key] ?? rowResults.filter(r => r.status === key).length);
  const activeFilterLabel = RESULT_FILTER_OPTIONS.find(o => o.key === resultsFilter)?.label ?? "All";

  const sourceCompareChart = uploadSources.map(s => ({
    name: (() => {
      const label = sourceAdminLabel(s);
      return label.length > 10 ? `${label.slice(0, 10)}…` : label;
    })(),
    Pending: s.stats.pending,
    Interested: s.stats.interested,
    Important: s.stats.important,
    "Not Picked": s.stats.notPicked,
    Won: s.stats.projectWon,
  }));

  const selectedSourceStats = historySourceId === "all"
    ? null
    : uploadSources.find(s => s.id === historySourceId)?.stats ?? sourceDetail?.stats ?? null;

  const selectedSourceBreakdown = selectedSourceStats ? [
    { label: "Pending",      value: selectedSourceStats.pending,      color: "#0B84F3" },
    { label: "Interested",   value: selectedSourceStats.interested,   color: "#D97706" },
    { label: "Important",    value: selectedSourceStats.important,    color: "#1B6FE8" },
    { label: "Not Picked",   value: selectedSourceStats.notPicked,    color: "#B54708" },
    { label: "Project Won",  value: selectedSourceStats.projectWon, color: "#065F46" },
    { label: "Not Interested", value: selectedSourceStats.notInterested, color: "#94A3B8" },
  ] : [];

  return (
    <div className="flex min-h-screen bg-[#F5F6FA]">

      {/* ── REASSIGN LEADS MODAL ── */}
      {showReassignModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-xl lg:max-w-2xl shadow-2xl overflow-hidden max-h-[96vh] sm:max-h-[90vh] flex flex-col">
            <div className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <ArrowLeftRight size={18} className="text-violet-600 shrink-0" />
                  Reassign CSR Leads
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Pick source CSR + page, then destination CSR(s) + page.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReassignModal(false)}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-5">
              {/* FROM */}
              <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4 space-y-3">
                <p className="text-xs font-bold text-violet-700 uppercase tracking-wide">From (source)</p>
                <div>
                  <label className="text-xs font-semibold text-gray-500">CSR</label>
                  <select
                    value={reassignFromCsrId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setReassignFromCsrId(id);
                      if (reassignFromPage === reassignToPage) {
                        setReassignToCsrIds((prev) => prev.filter((x) => x !== id));
                      }
                    }}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
                  >
                    <option value="">Select source CSR…</option>
                    {csrs.filter((c) => c.isActive).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.csrCode ? ` (${c.csrCode})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500">Page to move</label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {REASSIGN_PAGES.map((p) => {
                      const on = reassignFromPage === p.key;
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => {
                            setReassignFromPage(p.key);
                            if (REASSIGN_MATCH_DEST.has(p.key)) {
                              setReassignToPage(p.key);
                              if (reassignFromCsrId) {
                                setReassignToCsrIds((prev) => prev.filter((x) => x !== reassignFromCsrId));
                              }
                            }
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                            on
                              ? "bg-violet-600 text-white border-violet-600"
                              : "bg-white text-gray-600 border-gray-200 hover:border-violet-300"
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  {reassignFromPage === "pending" && (
                    <p className="mt-1.5 text-[11px] text-violet-700">
                      {"Moves this CSR's Today / Pending call-data queue."}
                    </p>
                  )}
                  {(reassignFromPage === "no_owner" || reassignFromPage === "not_in_service" || reassignFromPage === "in_house") && (
                    <p className="mt-1.5 text-[11px] text-violet-700">
                      Moves this CSR follow-up queue (same tab on destination).
                    </p>
                  )}
                </div>
              </div>

              {/* TO */}
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">To (destination)</p>
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-emerald-700 hover:underline"
                    onClick={() => {
                      const all = csrs
                        .filter((c) => {
                          if (!c.isActive) return false;
                          if (reassignFromPage === reassignToPage && c.id === reassignFromCsrId) return false;
                          return true;
                        })
                        .map((c) => c.id);
                      setReassignToCsrIds(all);
                    }}
                  >
                    Select all CSRs
                  </button>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500">Land on page</label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {REASSIGN_PAGES.map((p) => {
                      const on = reassignToPage === p.key;
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setReassignToPage(p.key)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                            on
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300"
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  {reassignToPage === "pending" && (
                    <p className="mt-1.5 text-[11px] text-emerald-700">
                      {"Leads land on the destination CSR's Today / Pending page."}
                    </p>
                  )}
                  {(reassignToPage === "no_owner" || reassignToPage === "not_in_service" || reassignToPage === "in_house") && (
                    <p className="mt-1.5 text-[11px] text-emerald-700">
                      Leads land on the destination CSR follow-up tab.
                    </p>
                  )}
                  {reassignToPage === "schedule" && reassignFromPage !== "schedule" && (
                    <p className="mt-1.5 text-[11px] text-amber-700">
                      Schedule needs an existing meeting date — use Schedule Call as source, or pick another destination page.
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500">CSR(s) — equal distribute</label>
                  <div className="relative mt-1.5 mb-2">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={reassignSearch}
                      onChange={(e) => setReassignSearch(e.target.value)}
                      placeholder="Search CSR…"
                      className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-100 bg-white divide-y divide-gray-50">
                    {filterCsrsBySearch(
                      csrs.filter((c) => {
                        if (!c.isActive) return false;
                        if (reassignFromPage === reassignToPage && c.id === reassignFromCsrId) return false;
                        return true;
                      }),
                      reassignSearch,
                    ).map((c) => {
                      const checked = reassignToCsrIds.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-emerald-50/60 ${
                            checked ? "bg-emerald-50/80" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleReassignToCsr(c.id)}
                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-400"
                          />
                          <span className="text-sm font-medium text-gray-800 truncate">{c.name}</span>
                          {c.csrCode ? (
                            <span className="text-[11px] text-emerald-700 font-semibold ml-auto">{c.csrCode}</span>
                          ) : null}
                        </label>
                      );
                    })}
                    {filterCsrsBySearch(
                      csrs.filter((c) => c.isActive),
                      reassignSearch,
                    ).length === 0 && (
                      <p className="px-3 py-6 text-center text-sm text-gray-400">No CSRs found</p>
                    )}
                  </div>
                  {reassignToCsrIds.length > 1 && (
                    <p className="mt-1.5 text-[11px] text-gray-500">
                      {reassignToCsrIds.length} CSRs — leads split evenly (round-robin).
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="px-5 sm:px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReassignModal(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={reassignSubmitting}
                onClick={() => void submitReassignLeads()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-60"
              >
                {reassignSubmitting ? <Loader2 size={16} className="animate-spin" /> : <ArrowLeftRight size={16} />}
                {reassignSubmitting ? "Transferring…" : "Reassign leads"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CSR DATA EXCEL DOWNLOAD ── */}
      {showCsrExportModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-xl lg:max-w-2xl shadow-2xl overflow-hidden max-h-[96vh] sm:max-h-[90vh] flex flex-col">
            <div className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <FileSpreadsheet size={18} className="text-sky-600 shrink-0" />
                  Download CSR Pages
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  One Excel per CSR. Each CSR page/tab is a separate sheet (Today, Interested, Bin, Clients…).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCsrExportModal(false)}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={csrExportSearch}
                  onChange={(e) => setCsrExportSearch(e.target.value)}
                  placeholder="Search CSR…"
                  className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </div>
              <div className="rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                {filterCsrsBySearch(csrs, csrExportSearch).map((c) => {
                  const busy = csrExportingId === c.id;
                  const disabled = Boolean(csrExportingId);
                  return (
                    <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 bg-white">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {c.name}
                          {!c.isActive ? (
                            <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">Inactive</span>
                          ) : null}
                        </p>
                        <p className="text-[11px] text-gray-400 truncate">
                          {c.csrCode ? `${c.csrCode} · ` : ""}{c.email}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => void downloadCsrPagesExcel(c)}
                        className="inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60"
                      >
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        {busy ? "Preparing…" : "Download"}
                      </button>
                    </div>
                  );
                })}
                {filterCsrsBySearch(csrs, csrExportSearch).length === 0 && (
                  <p className="px-3 py-8 text-center text-sm text-gray-400">No CSRs found</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ── */}
      {showCSRModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-xl lg:max-w-2xl shadow-2xl overflow-hidden max-h-[96vh] sm:max-h-[90vh] flex flex-col">

            {/* Modal header */}
            <div className="flex items-start justify-between px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b border-gray-100 shrink-0">
              <div className="pr-3 min-w-0">
                <h2 className="text-lg sm:text-2xl font-semibold text-gray-800">
                  {modalStep === "category" ? "Upload Category"
                   : modalStep === "reset"   ? "Data Mode"
                   : modalStep === "company" ? "Select Company"
                   : modalStep === "source"  ? "Data Source"
                   : modalStep === "pane"    ? "Select CSR Pane"
                   : "Select CSRs"}
                </h2>
                <p className="text-xs sm:text-sm text-gray-400 mt-0.5 sm:mt-1">
                  {modalStep === "category" ? "Where should this file's data go?"
                   : modalStep === "reset"   ? "What should happen to existing call data?"
                   : modalStep === "company" ? "Which company does this data belong to?"
                   : modalStep === "source"  ? "Source name is admin-only. Sudo name is what CSRs see on leads."
                   : modalStep === "pane"    ? "Which section should these leads appear in?"
                   : "Choose which CSRs should receive leads."}
                </p>
              </div>
              <button
                onClick={closeCSRModal}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-all shrink-0"
              >
                <X size={15} className="sm:w-[18px] sm:h-[18px]" />
              </button>
            </div>

            {/* Step indicators — scrollable on very small screens */}
            {(() => {
              const steps: readonly ModalStep[] = uploadMode !== "regular"
                ? ["source", "csrs"]
                : selectedPane === "lead"
                  ? ["category", "source", "csrs"]
                  : ["category", "reset", "company", "source", "csrs"];
              const labels = uploadMode !== "regular"
                ? ["Source", "CSRs"]
                : selectedPane === "lead"
                  ? ["Category", "Source", "CSRs"]
                  : ["Category", "Data Mode", "Company", "Source", "CSRs"];
              const currentIdx = steps.indexOf(modalStep);
              return (
                <div className="flex items-center px-4 sm:px-6 pt-3 sm:pt-4 overflow-x-auto shrink-0">
                  <div className="flex items-center min-w-max w-full">
                    {steps.map((step, i) => {
                      const done   = i < currentIdx;
                      const active = i === currentIdx;
                      return (
                        <div key={step} className="flex items-center flex-1 last:flex-none">
                          <div className={`flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-semibold whitespace-nowrap ${
                            active ? "text-[#1B6FE8]" : done ? "text-[#027A48]" : "text-gray-400"
                          }`}>
                            <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-bold shrink-0 ${
                              active ? "bg-[#1B6FE8] text-white" : done ? "bg-[#ECFDF3] text-[#027A48]" : "bg-gray-100 text-gray-400"
                            }`}>
                              {done ? "✓" : i + 1}
                            </span>
                            {labels[i]}
                          </div>
                          {i < steps.length - 1 && (
                            <div className={`flex-1 h-0.5 mx-1.5 sm:mx-2 ${i < currentIdx ? "bg-[#027A48]" : "bg-gray-200"}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Modal body — scroll */}
            <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1">

              {/* STEP — Category (Call Data or Leads) */}
              {modalStep === "category" && (
                <div className="space-y-3 sm:space-y-4">
                  <p className="text-xs sm:text-sm text-gray-500 font-medium">What type of data are you uploading?</p>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    {([
                      { pane: "pending" as const, label: "Call Data", sub: "Today's daily call leads for CSRs", Icon: PhoneCall, border: "border-[#0B84F3]", bg: "bg-[#EAF5FF]", iconBg: "bg-[#0B84F3]", text: "text-[#0B84F3]" },
                      { pane: "lead"    as const, label: "Clients",     sub: "Previous clients & project history", Icon: Users,    border: "border-[#7A3FFD]", bg: "bg-[#F4ECFF]", iconBg: "bg-[#7A3FFD]", text: "text-[#7A3FFD]" },
                    ]).map(opt => {
                      const sel = selectedPane === opt.pane;
                      return (
                        <button
                          key={opt.pane}
                          onClick={() => setSelectedPane(opt.pane)}
                          className={`relative p-3 sm:p-5 rounded-2xl border-2 flex flex-col items-center gap-2 sm:gap-3 transition-all text-center ${
                            sel ? `${opt.border} ${opt.bg}` : "border-gray-100 bg-[#FAFAFA] hover:border-gray-300"
                          }`}
                        >
                          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center ${
                            sel ? `${opt.iconBg} text-white` : "bg-white shadow-sm"
                          }`}>
                            <opt.Icon size={18} className={`sm:w-[22px] sm:h-[22px] ${sel ? "text-white" : "text-gray-400"}`} />
                          </div>
                          <div>
                            <p className={`font-bold text-xs sm:text-sm ${sel ? opt.text : "text-gray-800"}`}>{opt.label}</p>
                            <p className="text-[10px] sm:text-[11px] text-gray-400 mt-0.5 leading-snug">{opt.sub}</p>
                          </div>
                          {sel && (
                            <span className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full ${opt.iconBg} flex items-center justify-center absolute top-2 right-2`}>
                              <CheckCircle2 size={10} className="text-white sm:w-3 sm:h-3" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {selectedPane === "pending" && (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#0B84F3]/20 bg-[#EAF5FF]/60 px-3 py-2.5">
                      <span className="text-[10px] sm:text-xs text-gray-500 font-medium">Format for Call Data (no Notes):</span>
                      <TemplateDownloadLink {...UPLOAD_TEMPLATES.callData} className="border-[#0B84F3]/30 text-[#0B84F3] bg-white" />
                    </div>
                  )}

                  {selectedPane === "lead" && (
                    <div className="border border-[#7A3FFD]/20 bg-[#FDFBFF] rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2 sm:space-y-3">
                      <p className="text-xs sm:text-sm font-semibold text-[#7A3FFD]">Upload as which client type?</p>
                      <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        {([
                          { value: "new" as const, label: "New Client",  sub: "First-time clients",         border: "border-[#15803D]", bg: "bg-[#F0FDF4]", text: "text-[#15803D]", dot: "bg-[#15803D]" },
                          { value: "old" as const, label: "Old Client",  sub: "Returning / repeat clients", border: "border-[#B45309]", bg: "bg-[#FFFBEB]", text: "text-[#B45309]", dot: "bg-[#B45309]" },
                        ]).map(opt => {
                          const sel = selectedLeadType === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => setSelectedLeadType(opt.value)}
                              className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 flex flex-col gap-1.5 sm:gap-2 transition-all text-left ${
                                sel ? `${opt.border} ${opt.bg}` : "border-gray-100 bg-white hover:border-gray-300"
                              }`}
                            >
                              <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${sel ? opt.dot : "bg-gray-200"}`} />
                              <p className={`font-bold text-xs sm:text-sm ${sel ? opt.text : "text-gray-700"}`}>{opt.label}</p>
                              <p className="text-[10px] sm:text-[11px] text-gray-400 leading-snug">{opt.sub}</p>
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-[10px] text-gray-400 font-medium">Download format:</span>
                        {selectedLeadType === "new" ? (
                          <TemplateDownloadLink {...UPLOAD_TEMPLATES.newClient} className="border-green-300 text-green-700 bg-white" />
                        ) : (
                          <TemplateDownloadLink {...UPLOAD_TEMPLATES.oldClient} className="border-amber-300 text-amber-700 bg-white" />
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      if (selectedPane === "lead") {
                        setResetMode("keep");
                        setModalStep("source");
                      } else {
                        setResetMode(null);
                        setModalStep("reset");
                      }
                    }}
                    className="w-full h-10 sm:h-12 rounded-xl sm:rounded-2xl bg-[#1B6FE8] text-white font-semibold text-sm hover:bg-[#a30f27] transition-all"
                  >
                    Next — {selectedPane === "lead" ? "Select Source" : "Select Data Mode"}
                  </button>
                </div>
              )}

              {/* STEP 0 — Keep or Reset */}
              {modalStep === "reset" && (
                <div className="space-y-3 sm:space-y-4">
                  <p className="text-xs sm:text-sm text-gray-500 font-medium">
                    What should happen to existing lead data?
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    {[
                      {
                        value: "keep" as const,
                        Icon: Database,
                        label: "Keep Existing",
                        sub: "New links added alongside existing data",
                        activeBorder: "border-[#027A48]", activeBg: "bg-[#ECFDF3]",
                        activeIcon: "bg-[#027A48]", activeText: "text-[#027A48]",
                      },
                      {
                        value: "reset" as const,
                        Icon: RefreshCw,
                        label: "Reset Data",
                        sub: "Old call data deleted, new links added",
                        activeBorder: "border-[#1B6FE8]", activeBg: "bg-[#EAF2FE]",
                        activeIcon: "bg-[#1B6FE8]", activeText: "text-[#1B6FE8]",
                      },
                    ].map(opt => {
                      const sel = resetMode === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setResetMode(opt.value)}
                          className={`p-3 sm:p-5 rounded-2xl border-2 flex flex-col items-center gap-2 sm:gap-3 transition-all text-left ${
                            sel ? `${opt.activeBorder} ${opt.activeBg}` : "border-gray-100 bg-[#FAFAFA] hover:border-gray-300"
                          }`}
                        >
                          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center ${
                            sel ? `${opt.activeIcon} text-white` : "bg-white shadow-sm text-gray-500"
                          }`}>
                            <opt.Icon size={18} className="sm:w-[22px] sm:h-[22px]" />
                          </div>
                          <div>
                            <h4 className={`font-bold text-xs sm:text-sm ${sel ? opt.activeText : "text-gray-800"}`}>
                              {opt.label}
                            </h4>
                            <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 sm:mt-1 leading-snug">{opt.sub}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {resetMode === "reset" && (
                    <div className="bg-[#FFF7E6] border border-[#F59E0B]/30 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-start gap-2 sm:gap-3">
                      <RotateCcw size={14} className="text-[#B45309] mt-0.5 shrink-0 sm:w-4 sm:h-4" />
                      <p className="text-xs sm:text-sm text-[#92400E]">
                        <strong>Note:</strong> Only call data (pending leads) will be deleted.
                        Important, interested, clients, and projects will stay untouched.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 sm:gap-3">
                    <button
                      onClick={() => setModalStep("category")}
                      className="flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition-all"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => { if (!resetMode) { toast.error("Please select an option"); return; } setModalStep("company"); }}
                      disabled={!resetMode}
                      className={`flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl font-semibold text-sm transition-all ${
                        resetMode ? "bg-[#1B6FE8] text-white hover:bg-[#a30f27]" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      Next — Select Company
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 1 — Company */}
              {modalStep === "company" && (
                <div className="space-y-3 sm:space-y-4">
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {PRESET_COMPANIES.map(company => {
                      const sel = selectedCompany === company;
                      return (
                        <button
                          key={company}
                          onClick={() => setSelectedCompany(company)}
                          className={`p-3 sm:p-4 rounded-2xl border-2 flex flex-col items-center gap-2 sm:gap-3 transition-all ${
                            sel ? "border-[#1B6FE8] bg-[#EAF2FE]" : "border-gray-100 bg-[#FAFAFA] hover:border-gray-300"
                          }`}
                        >
                          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center ${
                            sel ? "bg-[#1B6FE8] text-white" : "bg-white shadow-sm text-gray-500"
                          }`}>
                            <Building2 size={18} className="sm:w-[22px] sm:h-[22px]" />
                          </div>
                          <span className={`font-semibold text-xs sm:text-sm text-center ${sel ? "text-[#1B6FE8]" : "text-gray-700"}`}>
                            {company}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {selectedCompany === "Other" && (
                    <div>
                      <label className="text-xs sm:text-sm font-semibold text-gray-700 block mb-1.5 sm:mb-2">Company Name</label>
                      <input
                        type="text"
                        value={customCompany}
                        onChange={e => setCustomCompany(e.target.value)}
                        placeholder="Enter company name..."
                        className="w-full h-10 sm:h-12 rounded-xl sm:rounded-2xl border border-gray-200 px-3 sm:px-4 outline-none focus:border-[#1B6FE8] text-sm"
                      />
                    </div>
                  )}

                  {selectedFile && (
                    <div className="bg-[#FAFAFA] rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                        <FileSpreadsheet size={16} className="text-green-600 sm:w-[18px] sm:h-[18px]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#111827] text-xs sm:text-sm truncate">{selectedFile.name}</p>
                        <p className="text-gray-400 text-[10px] sm:text-xs">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 sm:gap-3">
                    <button
                      onClick={() => selectedPane === "lead" ? setModalStep("category") : setModalStep("reset")}
                      className="flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition-all"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => {
                        if (!finalCompany.trim()) { toast.error("Please select or enter a company name"); return; }
                        setModalStep("source");
                      }}
                      disabled={!selectedCompany || (selectedCompany === "Other" && !customCompany.trim())}
                      className={`flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl font-semibold text-sm transition-all ${
                        selectedCompany && (selectedCompany !== "Other" || customCompany.trim())
                          ? "bg-[#1B6FE8] text-white hover:bg-[#a30f27]"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      Next
                      <ChevronDown size={14} className="inline ml-1 rotate-[-90deg] sm:w-4 sm:h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP — Upload Source (admin only) */}
              {modalStep === "source" && (
                <div className="space-y-3 sm:space-y-4">
                  <p className="text-xs sm:text-sm text-gray-500 font-medium">
                    Select where this data came from. Sudo name is shown to CSRs; source name is admin-only.
                  </p>

                  {uploadSources.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No sources yet — add your first one below.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 max-h-48 overflow-y-auto">
                      {uploadSources.map(src => {
                        const sel = selectedSourceId === src.id;
                        return (
                          <button
                            key={src.id}
                            onClick={() => setSelectedSourceId(src.id)}
                            className={`p-3 rounded-xl border-2 text-left transition-all ${
                              sel ? "border-[#1B6FE8] bg-[#EAF2FE]" : "border-gray-100 bg-[#FAFAFA] hover:border-gray-300"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Globe size={14} className={sel ? "text-[#1B6FE8]" : "text-gray-400"} />
                              <p className={`font-bold text-xs sm:text-sm truncate ${sel ? "text-[#1B6FE8]" : "text-gray-800"}`}>
                                {src.name}
                              </p>
                            </div>
                            {src.sudoName && (
                              <p className="text-[10px] text-gray-500 truncate mb-0.5">CSR: {src.sudoName}</p>
                            )}
                            <p className="text-[10px] text-gray-400">{src.stats.total} leads · {src.uploadCount} uploads</p>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="border border-dashed border-gray-200 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2">
                    <p className="text-xs font-semibold text-gray-600">Add new source</p>
                    <input
                      type="text"
                      value={newSourceName}
                      onChange={e => setNewSourceName(e.target.value)}
                      placeholder="Source name (admin only)..."
                      className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-[#1B6FE8]"
                      onKeyDown={e => { if (e.key === "Enter") void addNewSource(); }}
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSourceSudoName}
                        onChange={e => setNewSourceSudoName(e.target.value)}
                        placeholder="Sudo name (shown to CSRs)..."
                        className="flex-1 h-10 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-[#1B6FE8]"
                        onKeyDown={e => { if (e.key === "Enter") void addNewSource(); }}
                      />
                      <button
                        onClick={() => void addNewSource()}
                        disabled={addingSource || !newSourceName.trim()}
                        className="h-10 px-4 rounded-xl bg-[#111827] text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5"
                      >
                        <Plus size={14} /> Add
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:gap-3">
                    <div className="flex gap-2 sm:gap-3">
                      <button
                        onClick={() => {
                          if (uploadMode !== "regular") { closeCSRModal(); return; }
                          setModalStep(selectedPane === "lead" ? "category" : "company");
                        }}
                        className="flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition-all"
                      >
                        Back
                      </button>
                      <button
                        onClick={() => {
                          setSelectedSourceId("");
                          goToCsrStep();
                        }}
                        className="h-10 sm:h-12 px-4 sm:px-5 rounded-xl sm:rounded-2xl border border-gray-200 text-gray-500 font-semibold text-sm hover:border-gray-300 hover:text-gray-700 transition-all"
                      >
                        Skip
                      </button>
                      <button
                        onClick={() => {
                          if (!selectedSourceId) { toast.error("Please select or add a source"); return; }
                          goToCsrStep();
                        }}
                        disabled={!selectedSourceId}
                        className={`flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl font-semibold text-sm transition-all ${
                          selectedSourceId ? "bg-[#1B6FE8] text-white hover:bg-[#a30f27]" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        }`}
                      >
                        Next — Select CSRs
                      </button>
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-gray-400 text-center">
                      Skip if you don&apos;t want to assign a source or sudo name for this upload.
                    </p>
                  </div>
                </div>
              )}

              {/* STEP 2 — Pane */}
              {modalStep === "pane" && (
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex items-center gap-2 bg-[#EAF2FE] text-[#1B6FE8] px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl w-fit text-xs sm:text-sm font-semibold">
                    <Building2 size={13} className="sm:w-[15px] sm:h-[15px]" />{finalCompany}
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    {([
                      { value: "pending" as const, label: "Call data",  sub: "Today Links (daily call list)",     Icon: PhoneCall, border: "border-[#0B84F3]", bg: "bg-[#EAF5FF]", iconBg: "bg-[#0B84F3]", text: "text-[#0B84F3]" },
                      { value: "lead"    as const, label: "Leads",  sub: "Previous clients & project history", Icon: Users,    border: "border-[#7A3FFD]", bg: "bg-[#F4ECFF]", iconBg: "bg-[#7A3FFD]", text: "text-[#7A3FFD]" },
                    ]).map(opt => {
                      const sel = selectedPane === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setSelectedPane(opt.value)}
                          className={`relative p-3 sm:p-5 rounded-2xl border-2 flex flex-col items-center gap-2 sm:gap-3 transition-all text-center ${
                            sel ? `${opt.border} ${opt.bg}` : "border-gray-100 bg-[#FAFAFA] hover:border-gray-300"
                          }`}
                        >
                          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center ${
                            sel ? `${opt.iconBg} text-white` : "bg-white shadow-sm"
                          }`}>
                            <opt.Icon size={18} className={`sm:w-[22px] sm:h-[22px] ${sel ? "text-white" : "text-gray-400"}`} />
                          </div>
                          <div>
                            <p className={`font-bold text-xs sm:text-sm ${sel ? opt.text : "text-gray-800"}`}>{opt.label}</p>
                            <p className="text-[10px] sm:text-[11px] text-gray-400 mt-0.5 sm:mt-1 leading-snug">{opt.sub}</p>
                          </div>
                          {sel && (
                            <span className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full ${opt.iconBg} flex items-center justify-center absolute top-2 right-2`}>
                              <CheckCircle2 size={10} className="text-white sm:w-3 sm:h-3" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {selectedPane === "lead" && (
                    <div className="border border-[#7A3FFD]/20 bg-[#FDFBFF] rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2 sm:space-y-3">
                      <p className="text-xs sm:text-sm font-semibold text-[#7A3FFD]">Upload as which client type?</p>
                      <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        {([
                          { value: "new" as const, label: "New Client",  sub: "First-time clients",        border: "border-[#15803D]", bg: "bg-[#F0FDF4]", text: "text-[#15803D]", dot: "bg-[#15803D]" },
                          { value: "old" as const, label: "Old Client",  sub: "Returning / repeat clients", border: "border-[#B45309]", bg: "bg-[#FFFBEB]", text: "text-[#B45309]", dot: "bg-[#B45309]" },
                        ]).map(opt => {
                          const sel = selectedLeadType === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => setSelectedLeadType(opt.value)}
                              className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 flex flex-col gap-1.5 sm:gap-2 transition-all text-left ${
                                sel ? `${opt.border} ${opt.bg}` : "border-gray-100 bg-white hover:border-gray-300"
                              }`}
                            >
                              <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${sel ? opt.dot : "bg-gray-200"}`} />
                              <p className={`font-bold text-xs sm:text-sm ${sel ? opt.text : "text-gray-700"}`}>{opt.label}</p>
                              <p className="text-[10px] sm:text-[11px] text-gray-400 leading-snug">{opt.sub}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 sm:gap-3">
                    <button
                      onClick={() => setModalStep("company")}
                      className="flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition-all"
                    >
                      Back
                    </button>
                    <button
                      onClick={goToCsrStep}
                      className="flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl bg-[#1B6FE8] text-white font-semibold text-sm hover:bg-[#a30f27] transition-all"
                    >
                      Next — CSRs
                      <ChevronDown size={14} className="inline ml-1 rotate-[-90deg] sm:w-4 sm:h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3 — CSRs */}
              {modalStep === "csrs" && (
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {finalCompany && (
                      <div className="flex items-center gap-1.5 sm:gap-2 bg-[#EAF2FE] text-[#1B6FE8] px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold">
                        <Building2 size={12} className="sm:w-[15px] sm:h-[15px]" />{finalCompany}
                      </div>
                    )}
                    {uploadMode === "important" ? (
                      <span className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-[10px] sm:text-xs font-semibold bg-amber-50 text-amber-700">
                        Important Clients
                      </span>
                    ) : uploadMode === "interested" ? (
                      <span className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-[10px] sm:text-xs font-semibold bg-emerald-50 text-emerald-700">
                        Interested Clients
                      </span>
                    ) : uploadMode === "active" ? (
                      <span className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-[10px] sm:text-xs font-semibold bg-indigo-50 text-indigo-700">
                        Active Projects
                      </span>
                    ) : selectedPane === "pending" ? (
                      <span className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-[10px] sm:text-xs font-semibold bg-[#EAF5FF] text-[#0B84F3]">
                        Call Data
                      </span>
                    ) : (
                      <span className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-[10px] sm:text-xs font-semibold bg-[#F4ECFF] text-[#7A3FFD]">
                        Leads — {selectedLeadType === "new" ? "New Client" : "Old Client"}
                      </span>
                    )}
                  </div>

                  <UploadFilePreview
                    fileName={selectedFile?.name}
                    rows={filePreviewRows}
                    summary={filePreviewSummary}
                    loading={filePreviewLoading}
                    skipped={filePreviewSkipped}
                    hideDuplicates={hideDupInPreview}
                    onToggleHideDuplicates={() => setHideDupInPreview(v => !v)}
                    filter={previewFilter}
                    onFilterChange={setPreviewFilter}
                    showInterestedService={uploadMode === "interested"}
                  />

                  {/* CSR search */}
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={csrSearchQuery}
                      onChange={e => setCsrSearchQuery(e.target.value)}
                      placeholder="Search CSR by name, code, or email..."
                      className="w-full h-10 sm:h-11 pl-9 pr-9 rounded-xl border border-gray-200 bg-[#FAFAFA] text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B6FE8]/20 focus:border-[#1B6FE8]/40"
                    />
                    {csrSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setCsrSearchQuery("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
                        aria-label="Clear search"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  {/* Select All / Deselect All */}
                  {(() => {
                    const activeCSRs = csrs.filter(c => c.isActive);
                    const filteredCsrs = filterCsrsBySearch(csrs, csrSearchQuery);
                    const filteredActiveCSRs = filteredCsrs.filter(c => c.isActive);
                    const filteredActiveIds = filteredActiveCSRs.map(c => c.id);
                    const allFilteredSelected =
                      filteredActiveIds.length > 0 &&
                      filteredActiveIds.every(id => selectedCSRs.includes(id));
                    return (
                      <div className="flex items-center justify-between pb-1">
                        <p className="text-[11px] sm:text-xs text-gray-400">
                          <span className="font-semibold text-gray-600">{selectedCSRs.length}</span> of {activeCSRs.length} selected
                          {csrSearchQuery.trim() && (
                            <span> · {filteredCsrs.length} shown</span>
                          )}
                        </p>
                        <button
                          onClick={() => {
                            if (allFilteredSelected) {
                              setSelectedCSRs(prev => prev.filter(id => !filteredActiveIds.includes(id)));
                            } else {
                              setSelectedCSRs(prev => [...new Set([...prev, ...filteredActiveIds])]);
                            }
                          }}
                          disabled={filteredActiveCSRs.length === 0}
                          className="text-[11px] sm:text-xs font-semibold text-[#1B6FE8] hover:underline disabled:text-gray-300 disabled:no-underline disabled:cursor-not-allowed"
                        >
                          {allFilteredSelected ? "Deselect All" : csrSearchQuery.trim() ? "Select Shown" : "Select All"}
                        </button>
                      </div>
                    );
                  })()}

                  <div className="space-y-2 sm:space-y-3 max-h-[240px] sm:max-h-[300px] overflow-y-auto">
                    {filterCsrsBySearch(csrs, csrSearchQuery).map(csr => {
                      const checked = selectedCSRs.includes(csr.id);
                      const toggle = () => {
                        if (!csr.isActive) return;
                        setSelectedCSRs(prev =>
                          checked ? prev.filter(id => id !== csr.id) : [...prev, csr.id]
                        );
                      };
                      return (
                        <div
                          key={csr.id}
                          onClick={toggle}
                          className={`border rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center justify-between transition-all select-none ${
                            csr.isActive ? "cursor-pointer hover:border-gray-300" : "cursor-not-allowed opacity-60"
                          } ${
                            checked ? "border-[#1B6FE8] bg-[#FFF6F8]" : "border-gray-200"
                          }`}
                        >
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 ${
                              csr.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"
                            }`}>
                              {csr.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                {csr.csrCode && (
                                  <span className="bg-[#1B6FE8]/10 text-[#1B6FE8] text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0">{csr.csrCode}</span>
                                )}
                                <h3 className="font-semibold text-gray-800 text-xs sm:text-sm truncate">{csr.name}</h3>
                              </div>
                              <p className="text-[10px] sm:text-xs text-gray-400 truncate">{csr.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                            <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium ${
                              csr.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            }`}>
                              {csr.isActive ? "Active" : "Inactive"}
                            </span>
                            <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                              checked
                                ? "bg-[#1B6FE8] border-[#1B6FE8]"
                                : "border-gray-300 bg-white"
                            }`}>
                              {checked && (
                                <svg viewBox="0 0 10 8" className="w-2.5 h-2 text-white fill-none stroke-current stroke-[2]">
                                  <polyline points="1,4 4,7 9,1" />
                                </svg>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {filterCsrsBySearch(csrs, csrSearchQuery).length === 0 && (
                      <p className="text-center text-sm text-gray-400 py-6">No CSRs match your search</p>
                    )}
                  </div>

                  <div className="flex gap-2 sm:gap-3">
                    <button
                      onClick={() => selectedPane === "lead" ? setModalStep("category") : setModalStep("source")}
                      className="flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition-all"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleFiles}
                      disabled={selectedCSRs.length === 0}
                      className={`flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl font-semibold text-xs sm:text-sm transition-all ${
                        selectedCSRs.length > 0
                          ? "bg-[#1B6FE8] text-white hover:bg-[#a30f27]"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      Upload & Distribute ({selectedCSRs.length})
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── UPLOAD HISTORY MODAL ── */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl lg:max-w-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-start justify-between px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-lg sm:text-2xl font-semibold text-gray-800 flex items-center gap-2">
                  <History size={20} className="text-[#1B6FE8]" /> Upload History
                </h2>
                <p className="text-xs sm:text-sm text-gray-400 mt-1">
                  Files grouped by type. Delete removes contacts from DB and CSR dashboards.
                </p>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-all shrink-0"
              >
                <X size={15} />
              </button>
            </div>

            <div className="px-4 sm:px-6 pt-3 border-b border-gray-100 shrink-0">
              <div className="flex flex-wrap gap-1.5 sm:gap-2 pb-3">
                {HISTORY_CATEGORIES.map(cat => {
                  const count = historyCounts[cat.key] ?? 0;
                  const active = historyCategory === cat.key;
                  return (
                    <button
                      key={cat.key}
                      onClick={() => switchHistoryCategory(cat.key)}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold transition-all ${
                        active
                          ? "bg-[#1B6FE8] text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {cat.label} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-4 sm:p-6">
              {historyLoading ? (
                <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
                  <Loader2 size={20} className="animate-spin" /> Loading history...
                </div>
              ) : uploadHistory.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <History size={36} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm">
                    {historyCategory === "all"
                      ? "No uploads yet"
                      : `No ${CATEGORY_LABEL_MAP[historyCategory]} uploads yet`}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {uploadHistory.map(u => (
                    <div key={u.id} className="flex flex-col gap-3 p-3 sm:p-4 rounded-2xl border border-gray-100 bg-[#FAFAFA] hover:bg-white transition-all">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-xl bg-[#EAF2FE] flex items-center justify-center shrink-0">
                            <FileSpreadsheet size={18} className="text-[#1B6FE8]" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-gray-800 truncate">{u.fileName}</p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px] text-gray-400">
                              {u.uploadCategory && (
                                <span className={`font-semibold ${HISTORY_CATEGORIES.find(c => c.key === u.uploadCategory)?.color ?? "text-gray-500"}`}>
                                  {CATEGORY_LABEL_MAP[u.uploadCategory as UploadCategoryKey] ?? u.uploadCategory}
                                </span>
                              )}
                              {u.source ? (
                                <span className="text-[#1B6FE8] font-medium">{sourceAdminLabel(u.source)}</span>
                              ) : (
                                <span className="text-amber-600 font-medium">No source</span>
                              )}
                              {u.companyName && <span>· {u.companyName}</span>}
                              <span>· {u.linkedLeads} contacts in DB</span>
                              <span>· {formatEstDateTime(u.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {assigningUploadId !== u.id && (
                            <button
                              onClick={() => openAssignSource(u.id)}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#EAF2FE] text-[#1B6FE8] hover:bg-[#FFE4E8] text-xs font-semibold transition-all"
                            >
                              {u.source ? "Change Source" : "Assign Source"}
                            </button>
                          )}
                          <button
                            onClick={() => void deleteHistoryUpload(u.id, u.fileName)}
                            disabled={deletingUploadId === u.id}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-100 text-red-600 hover:bg-red-200 text-xs font-semibold transition-all shrink-0 disabled:opacity-50"
                          >
                            {deletingUploadId === u.id
                              ? <Loader2 size={14} className="animate-spin" />
                              : <Trash2 size={14} />
                            }
                            Delete
                          </button>
                        </div>
                      </div>

                      {assigningUploadId === u.id && (
                        <div className="border border-[#1B6FE8]/20 bg-[#FFF6F8] rounded-xl p-3 sm:p-4 space-y-3">
                          <p className="text-xs font-semibold text-gray-600">
                            {u.source ? "Change source for this upload" : "Assign a source to this upload"}
                          </p>
                          {uploadSources.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {uploadSources.map(src => (
                                <button
                                  key={src.id}
                                  onClick={() => {
                                    setAssignSourceId(src.id);
                                    setAssignNewSourceName("");
                                    setAssignNewSourceSudoName("");
                                  }}
                                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                                    assignSourceId === src.id
                                      ? "bg-[#1B6FE8] text-white"
                                      : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
                                  }`}
                                >
                                  {sourceAdminLabel(src)}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={assignNewSourceName}
                              onChange={e => {
                                setAssignNewSourceName(e.target.value);
                                setAssignSourceId("");
                              }}
                              placeholder="Or new source name (admin)..."
                              className="h-9 rounded-xl border border-gray-200 px-3 text-xs outline-none focus:border-[#1B6FE8]"
                            />
                            <input
                              type="text"
                              value={assignNewSourceSudoName}
                              onChange={e => setAssignNewSourceSudoName(e.target.value)}
                              placeholder="Sudo name (CSR)..."
                              className="h-9 rounded-xl border border-gray-200 px-3 text-xs outline-none focus:border-[#1B6FE8]"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={cancelAssignSource}
                              className="flex-1 h-9 rounded-xl bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => void saveAssignSource(u.id)}
                              disabled={savingAssignId === u.id || (!assignSourceId && !assignNewSourceName.trim())}
                              className="flex-1 h-9 rounded-xl bg-[#1B6FE8] text-white text-xs font-semibold hover:bg-[#a30f27] disabled:opacity-40 flex items-center justify-center gap-1.5"
                            >
                              {savingAssignId === u.id ? <Loader2 size={14} className="animate-spin" /> : null}
                              Save
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <StaffSidebar />

      <main className="flex-1 min-w-0 p-3 sm:p-4 md:p-5 lg:p-6 xl:p-7 2xl:p-8 overflow-x-hidden mt-[var(--app-header-h,64px)]">
        <DashboardNavbar />

        {/* ── HEADER ── */}
        <div className="mb-5 sm:mb-7 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#1B6FE8]/80 mb-1">Admin · Data Hub</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight">
              Data Hub
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1 max-w-xl">
              Pick an action card, download the template, then drop your Excel / CSV. Leads auto-split across active CSRs.
            </p>
          </div>
          <button
            onClick={openHistoryModal}
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-2xl bg-[#1B6FE8] text-white font-semibold text-sm shadow-md shadow-[#1B6FE8]/25 hover:bg-[#a30f27] transition-all shrink-0"
          >
            <History size={16} />
            Upload History
          </button>
        </div>

        {/* ── STAT CARDS ── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-7">
          {[
            { label: "Uploaded Files",    value: files.length,                                    tint: "from-[#EAF2FE] to-white", ring: "border-[#F3C6CE]",  color: "text-[#1B6FE8]",  icon: <FileText size={20} /> },
            { label: "Distributed",       value: files.filter(f => f.status === "Distributed").length, tint: "from-emerald-50 to-white", ring: "border-emerald-100", color: "text-emerald-600",  icon: <CheckCircle2 size={20} /> },
            { label: "Total Leads",       value: latestTotalLeads,                                tint: "from-sky-50 to-white", ring: "border-sky-100", color: "text-sky-600",   icon: <Database size={20} /> },
            { label: "Active CSRs",       value: latestDistribution.length,                      tint: "from-amber-50 to-white", ring: "border-amber-100", color: "text-amber-600", icon: <Users size={20} /> },
          ].map((c, i) => (
            <div
              key={i}
              className={`rounded-2xl border bg-gradient-to-br ${c.tint} ${c.ring} p-3.5 sm:p-4 shadow-sm`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-400 truncate">{c.label}</p>
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#0F172A] mt-1 tabular-nums">{c.value}</h2>
                </div>
                <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white/80 ${c.color} flex items-center justify-center shrink-0 shadow-sm`}>
                  {c.icon}
                </div>
              </div>
            </div>
          ))}
        </div>

        <UploadAnalyticsBento
          sources={uploadSources}
          csrDistribution={latestDistribution}
          totalLeads={latestTotalLeads}
          filesCount={files.length}
          distributedCount={files.filter(f => f.status === "Distributed").length}
        />

        {/* ── UPLOAD BENTO (shuffle → expand) ── */}
        <div className="mb-5 sm:mb-7 rounded-[2rem] border border-gray-100/80 bg-white p-4 sm:p-6 shadow-sm">
          <UploadActionBento
            items={[
              {
                id: "leads",
                label: "New Leads",
                shortLabel: "Leads",
                accent: "#1B6FE8",
                span: "hero",
                content: (
                  <div className="p-4 sm:p-5 h-full flex flex-col bg-gradient-to-br from-[#EAF2FE] via-white to-white">
                    <div
                      onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragging(false); openCSRModal(e.dataTransfer.files); }}
                      className={`flex-1 border-2 border-dashed rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group flex flex-col justify-center ${
                        dragging ? "border-[#1B6FE8] bg-white" : "border-[#F3C6CE]/80 hover:border-[#1B6FE8] bg-white/70"
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center text-center px-1">
                        <div className="w-14 h-14 rounded-2xl bg-[#EAF2FE] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                          <UploadCloud size={28} className="text-[#1B6FE8]" />
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-[#0F172A] leading-snug">Upload New Leads</h3>
                        <p className="text-sm text-gray-500 mt-2 max-w-[280px] leading-snug">
                          Call Data (today) or Clients (New / Old). Download the matching template first.
                        </p>
                        <span className="mt-4 inline-flex bg-[#1B6FE8] text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm shadow-[#1B6FE8]/25">
                          Browse Files
                        </span>
                      </div>
                      <input ref={inputRef} type="file" hidden accept=".xlsx,.xls,.csv"
                        onChange={e => openCSRModal(e.target.files)} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-start gap-2">
                      <TemplateDownloadLink {...UPLOAD_TEMPLATES.callData} className="border-[#0B84F3]/30 text-[#0B84F3] bg-[#EAF5FF]" />
                      <TemplateDownloadLink {...UPLOAD_TEMPLATES.newClient} className="border-green-300 text-green-700 bg-green-50" />
                      <TemplateDownloadLink {...UPLOAD_TEMPLATES.oldClient} className="border-amber-300 text-amber-700 bg-amber-50" />
                    </div>
                  </div>
                ),
              },
              {
                id: "important",
                label: "Important",
                shortLabel: "VIP",
                accent: "#D97706",
                span: "wide",
                content: (
                  <div className="p-4 sm:p-5 h-full flex flex-col bg-gradient-to-br from-amber-50 via-white to-white">
                    <div
                      onClick={(e) => { e.stopPropagation(); inputRefImportant.current?.click(); }}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDraggingImportant(true); }}
                      onDragLeave={() => setDraggingImportant(false)}
                      onDrop={e => { e.preventDefault(); e.stopPropagation(); setDraggingImportant(false); openImportantModal(e.dataTransfer.files); }}
                      className={`flex-1 border-2 border-dashed rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group flex flex-col justify-center ${
                        draggingImportant ? "border-amber-500 bg-white" : "border-amber-200 hover:border-amber-400 bg-white/70"
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center text-center px-1">
                        <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                          <PhoneCall size={26} className="text-amber-600" />
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-[#0F172A] leading-snug">Previous Important Clients</h3>
                        <p className="text-sm text-gray-500 mt-2 max-w-[280px] leading-snug">
                          Known / VIP clients + Notes — status <span className="font-semibold text-amber-600">Important</span>.
                        </p>
                        <span className="mt-4 inline-flex bg-amber-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold">
                          Browse Files
                        </span>
                      </div>
                      <input ref={inputRefImportant} type="file" hidden accept=".xlsx,.xls,.csv"
                        onChange={e => openImportantModal(e.target.files)} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-start gap-2">
                      <TemplateDownloadLink {...UPLOAD_TEMPLATES.important} className="border-amber-300 text-amber-700 bg-amber-50" />
                    </div>
                  </div>
                ),
              },
              {
                id: "reassign",
                label: "Reassign",
                shortLabel: "Move",
                accent: "#7C3AED",
                span: "normal",
                content: (
                  <div className="p-4 sm:p-5 h-full flex flex-col bg-gradient-to-br from-violet-50 via-white to-white">
                    <div
                      onClick={(e) => { e.stopPropagation(); void openReassignModal(); }}
                      className="flex-1 border-2 border-dashed rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group flex flex-col justify-center border-violet-200 hover:border-violet-400 bg-white/70 hover:bg-white"
                    >
                      <div className="flex flex-col items-center justify-center text-center px-1">
                        <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                          <ArrowLeftRight size={26} className="text-violet-600" />
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-[#0F172A] leading-snug">Reassign CSR Leads</h3>
                        <p className="text-sm text-gray-500 mt-2 max-w-[280px] leading-snug">
                          From CSR + page → To CSR(s) + page, including Pending / Today. Multi-CSR = equal split.
                        </p>
                        <span className="mt-4 inline-flex bg-violet-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold">
                          Open Reassign
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-start gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3.5 py-2 text-xs sm:text-sm font-bold text-violet-700 shadow-sm">
                        Source &amp; destination · No Excel
                      </span>
                    </div>
                  </div>
                ),
              },
              {
                id: "csr-export",
                label: "CSR Excel",
                shortLabel: "Excel",
                accent: "#0284C7",
                span: "normal",
                content: (
                  <div className="p-4 sm:p-5 h-full flex flex-col bg-gradient-to-br from-sky-50 via-white to-white">
                    <div
                      onClick={(e) => { e.stopPropagation(); void openCsrExportModal(); }}
                      className="flex-1 border-2 border-dashed rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group flex flex-col justify-center border-sky-200 hover:border-sky-400 bg-white/70 hover:bg-white"
                    >
                      <div className="flex flex-col items-center justify-center text-center px-1">
                        <div className="w-14 h-14 rounded-2xl bg-sky-50 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                          <FileSpreadsheet size={26} className="text-sky-600" />
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-[#0F172A] leading-snug">Download CSR Data</h3>
                        <p className="text-sm text-gray-500 mt-2 max-w-[280px] leading-snug">
                          One file per CSR. Every page and sub-tab (Today, Interested, Clients, Bin…) as its own Excel sheet.
                        </p>
                        <span className="mt-4 inline-flex bg-sky-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold">
                          Choose CSR
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-start gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3.5 py-2 text-xs sm:text-sm font-bold text-sky-700 shadow-sm">
                        All pages · Single download
                      </span>
                    </div>
                  </div>
                ),
              },
              {
                id: "interested",
                label: "Interested",
                shortLabel: "Star",
                accent: "#059669",
                span: "normal",
                content: (
                  <div className="p-4 sm:p-5 h-full flex flex-col bg-gradient-to-br from-emerald-50 via-white to-white">
                    <div
                      onClick={(e) => { e.stopPropagation(); inputRefInterested.current?.click(); }}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDraggingInterested(true); }}
                      onDragLeave={() => setDraggingInterested(false)}
                      onDrop={e => { e.preventDefault(); e.stopPropagation(); setDraggingInterested(false); openInterestedModal(e.dataTransfer.files); }}
                      className={`flex-1 border-2 border-dashed rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group flex flex-col justify-center ${
                        draggingInterested ? "border-emerald-500 bg-white" : "border-emerald-200 hover:border-emerald-400 bg-white/70"
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center text-center px-1">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                          <Star size={26} className="text-emerald-600" />
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-[#0F172A] leading-snug">Interested Clients</h3>
                        <p className="text-sm text-gray-500 mt-2 max-w-[280px] leading-snug">
                          Interested Service + Notes — status <span className="font-semibold text-emerald-600">Interested</span>.
                        </p>
                        <span className="mt-4 inline-flex bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold">
                          Browse Files
                        </span>
                      </div>
                      <input ref={inputRefInterested} type="file" hidden accept=".xlsx,.xls,.csv"
                        onChange={e => openInterestedModal(e.target.files)} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-start gap-2">
                      <TemplateDownloadLink {...UPLOAD_TEMPLATES.interested} className="border-emerald-300 text-emerald-700 bg-emerald-50" />
                    </div>
                  </div>
                ),
              },
              {
                id: "active",
                label: "Active Projects",
                shortLabel: "Active",
                accent: "#4F46E5",
                span: "normal",
                content: (
                  <div className="p-4 sm:p-5 h-full flex flex-col bg-gradient-to-br from-indigo-50 via-white to-white">
                    <div
                      onClick={(e) => { e.stopPropagation(); inputRefActive.current?.click(); }}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDraggingActive(true); }}
                      onDragLeave={() => setDraggingActive(false)}
                      onDrop={e => { e.preventDefault(); e.stopPropagation(); setDraggingActive(false); openActiveModal(e.dataTransfer.files); }}
                      className={`flex-1 border-2 border-dashed rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group flex flex-col justify-center ${
                        draggingActive ? "border-indigo-500 bg-white" : "border-indigo-200 hover:border-indigo-400 bg-white/70"
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center text-center px-1">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                          <Briefcase size={26} className="text-indigo-600" />
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-[#0F172A] leading-snug">Active Projects</h3>
                        <p className="text-sm text-gray-500 mt-2 max-w-[280px] leading-snug">
                          Client Code + Project Detail + Quotation — ongoing projects.
                        </p>
                        <span className="mt-4 inline-flex bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold">
                          Browse Files
                        </span>
                      </div>
                      <input ref={inputRefActive} type="file" hidden accept=".xlsx,.xls,.csv"
                        onChange={e => openActiveModal(e.target.files)} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-start gap-2">
                      <TemplateDownloadLink {...UPLOAD_TEMPLATES.active} className="border-indigo-300 text-indigo-700 bg-indigo-50" />
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </div>

        {/* ── SOURCE HISTORY (admin only — CSRs never see this) ── */}
        <div className="bg-white rounded-2xl lg:rounded-3xl border border-gray-100 p-4 sm:p-5 lg:p-6 shadow-sm mb-4 sm:mb-6">
          <button
            type="button"
            onClick={() => setSourceHistoryOpen(v => !v)}
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <div>
              <h3 className="text-base sm:text-xl font-semibold text-gray-800 flex items-center gap-2">
                <Globe size={18} className="text-[#1B6FE8]" /> Source History & Analytics
              </h3>
              <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                Track performance by data source. Hidden from all CSR views.
              </p>
            </div>
            <ChevronDown
              size={20}
              className={`text-gray-400 shrink-0 transition-transform ${sourceHistoryOpen ? "rotate-180" : ""}`}
            />
          </button>

          {sourceHistoryOpen && (
          <>
          <div className="flex flex-wrap gap-2 mb-4 mt-4">
            <button
              onClick={() => {
                setHistorySourceId("all");
                setSourceDetail(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                historySourceId === "all" ? "bg-[#1B6FE8] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All Sources
            </button>
            {uploadSources.map(s => (
              <button
                key={s.id}
                onClick={() => {
                  setHistorySourceId(s.id);
                  void fetchSourceDetail(s.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  historySourceId === s.id ? "bg-[#1B6FE8] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {sourceAdminLabel(s)} ({s.stats.total})
              </button>
            ))}
          </div>

          {uploadSources.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Upload with a source to see analytics here.</p>
          ) : historySourceId === "all" ? (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceCompareChart} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Pending"    fill="#0B84F3" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Interested" fill="#D97706" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Important"  fill="#1B6FE8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Not Picked" fill="#B54708" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Won"        fill="#065F46" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {selectedSourceBreakdown.map(item => (
                  <div key={item.label} className="bg-[#FAFAFA] rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-400 font-medium">{item.label}</p>
                    <p className="text-xl font-bold mt-1" style={{ color: item.color }}>{item.value}</p>
                  </div>
                ))}
              </div>
              {sourceDetail && sourceDetail.uploads.length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold text-gray-500 mb-2">Upload history</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {sourceDetail.uploads.map(u => (
                      <div key={u.id} className="flex items-center justify-between text-xs bg-[#FAFAFA] rounded-xl px-3 py-2">
                        <span className="font-medium text-gray-700 truncate flex-1">{u.fileName}</span>
                        <span className="text-gray-400 shrink-0 ml-2">{u.totalLeads} leads</span>
                        <span className="text-gray-300 shrink-0 ml-2">{formatEstDate(u.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {uploadSources.length > 0 && (
            <div className="border-t border-gray-100 pt-4 mt-4">
              <button
                type="button"
                onClick={() => setSourcesManageOpen(v => !v)}
                className="w-full flex items-center justify-between mb-3 text-left"
              >
                <p className="text-xs font-semibold text-gray-500">Manage Sources (Sudo)</p>
                <ChevronDown size={16} className={`text-gray-400 transition-transform ${sourcesManageOpen ? "rotate-180" : ""}`} />
              </button>
              {sourcesManageOpen && (
              <div className="space-y-2">
                {uploadSources.map(src => (
                  <div key={src.id} className="bg-[#FAFAFA] rounded-xl px-3 py-2.5">
                    {editingSourceId === src.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={editSourceName}
                            onChange={e => setEditSourceName(e.target.value)}
                            placeholder="Source name (admin)..."
                            className="h-9 rounded-lg border border-gray-200 px-3 text-xs outline-none focus:border-[#1B6FE8]"
                          />
                          <input
                            type="text"
                            value={editSourceSudoName}
                            onChange={e => setEditSourceSudoName(e.target.value)}
                            placeholder="Sudo name (CSR)..."
                            className="h-9 rounded-lg border border-gray-200 px-3 text-xs outline-none focus:border-[#1B6FE8]"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={cancelEditSource}
                            className="flex-1 h-8 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => void saveEditSource(src.id)}
                            disabled={savingSourceId === src.id || !editSourceName.trim()}
                            className="flex-1 h-8 rounded-lg bg-[#1B6FE8] text-white text-xs font-semibold hover:bg-[#a30f27] disabled:opacity-40 flex items-center justify-center gap-1"
                          >
                            {savingSourceId === src.id ? <Loader2 size={12} className="animate-spin" /> : null}
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{sourceAdminLabel(src)}</p>
                          <p className="text-[10px] text-gray-400">{src.stats.total} leads · {src.uploadCount} uploads</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => startEditSource(src)}
                            className="w-8 h-8 rounded-lg bg-white border border-gray-200 text-gray-600 hover:border-gray-300 flex items-center justify-center"
                            title="Edit source"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => void deleteSource(src.id, src.name)}
                            disabled={deletingSourceId === src.id}
                            className="w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center disabled:opacity-50"
                            title="Delete source"
                          >
                            {deletingSourceId === src.id
                              ? <Loader2 size={14} className="animate-spin" />
                              : <Trash2 size={14} />
                            }
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              )}
            </div>
          )}

          {/* ── Trades Manage ── */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setTradesManageOpen(v => !v)}
                className="w-full flex items-center justify-between mb-3 text-left"
              >
                <p className="text-xs font-semibold text-gray-500">Manage Trades</p>
                <ChevronDown size={16} className={`text-gray-400 transition-transform ${tradesManageOpen ? "rotate-180" : ""}`} />
              </button>
              {tradesManageOpen && (
                <div className="space-y-2">
                  {trades.map(t => (
                    <div key={t.id} className="flex items-center justify-between bg-[#FAFAFA] rounded-xl px-3 py-2">
                      <span className="text-sm font-medium text-gray-800 flex items-center gap-2">
                        <Briefcase size={13} className="text-gray-400" /> {t.name}
                      </span>
                      <button
                        onClick={() => void deleteTrade(t.id, t.name)}
                        disabled={deletingTradeId === t.id}
                        className="w-7 h-7 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center disabled:opacity-50"
                      >
                        {deletingTradeId === t.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      value={newTradeName}
                      onChange={e => setNewTradeName(e.target.value)}
                      placeholder="Add trade (e.g. General Contractor)..."
                      className="flex-1 h-9 rounded-lg border border-gray-200 px-3 text-xs outline-none focus:border-[#1B6FE8]"
                      onKeyDown={e => { if (e.key === "Enter") void addNewTrade(); }}
                    />
                    <button
                      onClick={() => void addNewTrade()}
                      disabled={addingTrade || !newTradeName.trim()}
                      className="h-9 px-3 rounded-lg bg-[#111827] text-white text-xs font-semibold disabled:opacity-40 flex items-center gap-1"
                    >
                      {addingTrade ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
          )}
        </div>

        {/* ── LATEST DISTRIBUTION ── */}
        <div className="bg-white rounded-2xl lg:rounded-3xl border border-gray-100 p-4 sm:p-5 lg:p-6 shadow-sm mb-4 sm:mb-6">
          <button
            type="button"
            onClick={() => setLatestDistributionOpen(v => !v)}
            className="w-full flex items-center justify-between gap-3 text-left mb-3 sm:mb-5"
          >
            <div>
              <h3 className="text-base sm:text-xl font-semibold text-gray-800">Latest CSR Distribution</h3>
              <p className="text-xs sm:text-sm text-gray-400 mt-0.5 sm:mt-1">Latest uploaded leads distribution.</p>
            </div>
            <ChevronDown
              size={20}
              className={`text-gray-400 shrink-0 transition-transform ${latestDistributionOpen ? "rotate-180" : ""}`}
            />
          </button>
          {latestDistributionOpen && (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {latestDistribution.map((csr, i) => (
              <div key={i} className="bg-[#F8F9FC] border border-gray-100 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                <p className="text-xs sm:text-sm font-semibold text-gray-700 truncate">{csr.name}</p>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 sm:mt-1">Assigned Leads</p>
                <h4 className="text-xl sm:text-2xl font-bold text-[#1B6FE8] mt-1 sm:mt-2">{csr.leads}</h4>
              </div>
            ))}
          </div>
          )}
        </div>

        {/* ── FILES LISTs ── */}
        <div className="bg-white rounded-2xl lg:rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-4 sm:px-5 py-3 sm:py-4 lg:p-5 border-b border-gray-100">
            <h3 className="text-base sm:text-lg font-semibold text-gray-800">Uploaded Lead Sheets</h3>
          </div>

          {files.length === 0 && (
            <div className="p-10 sm:p-12 lg:p-14 text-center">
              <UploadCloud size={36} className="mx-auto text-[#1B6FE8] lg:w-[42px] lg:h-[42px]" />
              <p className="mt-3 sm:mt-4 text-gray-500 text-sm">No files uploaded yet</p>
            </div>
          )}

          <div className="divide-y divide-gray-100">
            {files.map(file => (
              <div key={file.id} className="p-4 sm:p-5">
                {/* File info + actions */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-5">
                  {/* Left: icon + name */}
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="w-11 h-11 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-xl sm:rounded-2xl bg-[#F8F9FC] flex items-center justify-center shrink-0">
                      {getFileIcon(file.type)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-gray-800 text-sm truncate">{file.name}</h4>
                      {file.companyName && (
                        <span className="inline-flex items-center gap-1 bg-[#EAF2FE] text-[#1B6FE8] px-2 sm:px-2.5 py-0.5 rounded-lg text-[10px] sm:text-[11px] font-semibold mt-0.5 sm:mt-1">
                          <Building2 size={9} className="sm:w-[11px] sm:h-[11px]" />{file.companyName}
                        </span>
                      )}
                      <p className="text-xs sm:text-sm text-gray-400 mt-0.5 sm:mt-1">
                        {file.size} · {file.leads} Leads
                      </p>
                    </div>
                  </div>

                  {/* Rights: status + deletes */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <span className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-[10px] sm:text-xs font-medium flex items-center gap-1.5 sm:gap-2 ${
                      file.status === "Distributed" ? "bg-green-100 text-green-700" :
                      file.status === "Processing"  ? "bg-blue-100 text-blue-700"  :
                      "bg-yellow-100 text-yellow-700"
                    }`}>
                      {file.status === "Uploading" || file.status === "Processing"
                        ? <Loader2 size={12} className="animate-spin sm:w-[14px] sm:h-[14px]" />
                        : <CheckCircle2 size={12} className="sm:w-[14px] sm:h-[14px]" />
                      }
                      {file.status}
                    </span>
                    <button
                      onClick={() => removeFile(file.id)}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center transition-all"
                    >
                      <Trash2 size={15} className="sm:w-[18px] sm:h-[18px]" />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 sm:mt-5">
                  <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                    <p className="text-[10px] sm:text-xs text-gray-400">Upload Progress</p>
                    <p className="text-[10px] sm:text-xs font-medium text-gray-600">{file.progress}%</p>
                  </div>
                  <div className="w-full h-1.5 sm:h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#1B6FE8] transition-all duration-300"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── UPLOAD RESULTS — per-contact duplicate check ── */}
        {(rowResults.length > 0 || previewLoading || previewLive) && (
          <div className="bg-white rounded-2xl lg:rounded-3xl border border-gray-100 overflow-hidden shadow-sm mt-4 sm:mt-6">
            <div
              className="px-4 sm:px-5 py-3 sm:py-4 lg:p-5 border-b border-gray-100 cursor-pointer select-none"
              onClick={() => setResultsExpanded(v => !v)}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  {resultsExpanded
                    ? <ChevronUp size={18} className="text-gray-400 shrink-0 mt-0.5" />
                    : <ChevronDown size={18} className="text-gray-400 shrink-0 mt-0.5" />
                  }
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2">
                      {previewLive ? "Uploading" : "Upload Results"} — {lastUploadName}
                      {previewLoading && <Loader2 size={16} className="animate-spin text-[#1B6FE8]" />}
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                      {previewLoading
                        ? "Processing file on server — large sheets can take several minutes."
                        : "Each row checked against the database before import."}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                  <div className="relative">
                    <button
                      onClick={() => setFilterDropdownOpen(v => !v)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition-all"
                    >
                      {activeFilterLabel} ({filterCount(resultsFilter)})
                      <ChevronDown size={14} className={`transition-transform ${filterDropdownOpen ? "rotate-180" : ""}`} />
                    </button>
                    {filterDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setFilterDropdownOpen(false)} />
                        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-[150px]">
                          {RESULT_FILTER_OPTIONS.map(opt => (
                            <button
                              key={opt.key}
                              onClick={() => {
                                setResultsFilter(opt.key);
                                setResultsPage(1);
                                setFilterDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-xs font-semibold hover:bg-gray-50 ${
                                resultsFilter === opt.key ? "text-[#1B6FE8]" : "text-gray-600"
                              }`}
                            >
                              {opt.label} ({filterCount(opt.key)})
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {!resultsExpanded && uploadSummary && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {RESULT_FILTER_OPTIONS.filter(o => o.key !== "all").map(opt => {
                    const count = filterCount(opt.key);
                    if (count === 0) return null;
                    const st = STATUS_STYLE[opt.key];
                    return (
                      <span
                        key={opt.key}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${st.bg} ${st.text}`}
                      >
                        {opt.label}: {count}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {resultsExpanded && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className={CSR_THEAD}>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                        <th className="px-4 py-3 font-semibold w-12">#</th>
                        <th className="px-4 py-3 font-semibold">Name</th>
                        <th className="px-4 py-3 font-semibold hidden sm:table-cell">Phone</th>
                        <th className="px-4 py-3 font-semibold hidden md:table-cell">Email</th>
                        <th className="px-4 py-3 font-semibold hidden lg:table-cell">Company</th>
                        <th className="px-4 py-3 font-semibold w-28">Status</th>
                        <th className="px-4 py-3 font-semibold hidden sm:table-cell">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {paginatedResults.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                            {previewLoading ? "Loading preview..." : "No rows match this filter."}
                          </td>
                        </tr>
                      ) : paginatedResults.map(row => {
                        const st = STATUS_STYLE[row.status];
                        return (
                          <tr key={row.row} className={`hover:bg-gray-50/80 ${row.status === "duplicate" ? "bg-red-50/40" : ""}`}>
                            <td className="px-4 py-2.5 text-gray-400 text-xs">{row.row}</td>
                            <td className="px-4 py-2.5 font-medium text-gray-800">{row.name}</td>
                            <td className="px-4 py-2.5 text-gray-600 hidden sm:table-cell">{row.phone}</td>
                            <td className="px-4 py-2.5 text-gray-600 hidden md:table-cell truncate max-w-[180px]">{row.email}</td>
                            <td className="px-4 py-2.5 text-gray-600 hidden lg:table-cell">{row.company}</td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${st.bg} ${st.text}`}>
                                {row.status === "duplicate" && <AlertCircle size={10} />}
                                {st.label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-500 hidden sm:table-cell">{row.reason}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {filteredResults.length > PREVIEW_PAGE_SIZE && (
                  <div className="px-4 sm:px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-400">
                      Showing {(safeResultsPage - 1) * PREVIEW_PAGE_SIZE + 1}–{Math.min(safeResultsPage * PREVIEW_PAGE_SIZE, filteredResults.length)} of {filteredResults.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setResultsPage(p => Math.max(1, p - 1))}
                        disabled={safeResultsPage <= 1}
                        className="px-3 py-1.5 rounded-lg bg-gray-100 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <span className="text-xs text-gray-500 font-medium">
                        {safeResultsPage} / {previewTotalPages}
                      </span>
                      <button
                        onClick={() => setResultsPage(p => Math.min(previewTotalPages, p + 1))}
                        disabled={safeResultsPage >= previewTotalPages}
                        className="px-3 py-1.5 rounded-lg bg-gray-100 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}

                {uploadSummary && uploadSummary.duplicate > 0 && !previewLive && (
                  <div className="px-4 sm:px-5 py-3 bg-[#FFF7ED] border-t border-[#FED7AA]/50 flex items-start gap-2">
                    <AlertCircle size={14} className="text-[#B45309] mt-0.5 shrink-0" />
                    <p className="text-xs text-[#92400E]">
                      <strong>{uploadSummary.duplicate} duplicate contact(s)</strong> were skipped — they already exist in the database (matched by phone or email). Only new contacts were added.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}