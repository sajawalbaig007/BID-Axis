"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import toast from "react-hot-toast";
import DashboardNavbar  from "../components/layout/Navbar";
import { StaffSidebar } from "@/app/hooks/useStaffSidebar";
import { fetchReports, type ReportsData } from "@/lib/reportsCache";
import API, { apiErrorMessage } from "@/lib/api";

import {
  PhoneCall, ShoppingCart, Clock3, FileBarChart2,
  TrendingUp, Database, AlertTriangle, ChevronDown, Users, ClipboardList,
} from "lucide-react";

const ReportCharts = dynamic(() => import("./ReportCharts"), {
  ssr: false,
  loading: () => <div className="h-[280px] rounded-xl bg-gray-100 animate-pulse" />,
});

const CsrActivityReport = dynamic(() => import("./CsrActivityReport"), {
  ssr: false,
  loading: () => <div className="h-48 rounded-xl bg-gray-100 animate-pulse" />,
});

const StaffAttendanceReport = dynamic(() => import("./StaffAttendanceReport"), {
  ssr: false,
  loading: () => <div className="h-48 rounded-xl bg-gray-100 animate-pulse" />,
});


type ReportResponse = ReportsData;
type CsrActualStats = {
  totalLeads: number;
  completed: number;
  pending: number;
  important: number;
  interested: number;
  projectWon: number;
};

const BENTO =
  "rounded-[1.5rem] sm:rounded-[1.75rem] border border-gray-100/90 dark:border-crm-border bg-white dark:bg-crm-surface shadow-[0_10px_40px_-24px_rgba(15,23,42,0.35)]";

/* ── Main Page ── */
export default function ReportsPage() {
  const pathname = usePathname();
  const reportsBase = pathname.startsWith("/manager") ? "/manager/reports" : "/admin/reports";
  const [reportData,    setReportData]    = useState<ReportResponse | null>(null);
  const [activePeriod,  setActivePeriod]  = useState<"today" | "week" | "month" | "all">("week");
  const [loadingReport, setLoadingReport] = useState(false);
  const [fromDate,      setFromDate]      = useState("");
  const [toDate,        setToDate]        = useState("");
  const [selectedCSRId, setSelectedCSRId] = useState<string>("all");
  const [dropdownOpen,  setDropdownOpen]  = useState(false);
  const [csrPerfOpen,   setCsrPerfOpen]   = useState(true);
  const [csrActualStats, setCsrActualStats] = useState<CsrActualStats | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const loadReports = useCallback(async (
    period: string = "week",
    customFrom?: string,
    customTo?: string,
    force = false,
  ) => {
    try {
      setLoadingReport(true);
      const data = await fetchReports(period, customFrom, customTo, force);
      setReportData(data);
    } catch (err) {
      console.error(err);
      toast.error(apiErrorMessage(err, "Failed to load reports."));
    } finally {
      setLoadingReport(false);
    }
  }, []);

  useEffect(() => {
    void loadReports("week");
  }, [loadReports]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedCSRId || selectedCSRId === "all") {
      setCsrActualStats(null);
      return;
    }

    const loadCsrActualStats = async () => {
      try {
        const res = await API.get(`/admin/csr-history/${selectedCSRId}`);
        if (cancelled) return;
        setCsrActualStats(res.data?.stats ?? null);
      } catch {
        if (!cancelled) setCsrActualStats(null);
      }
    };

    void loadCsrActualStats();
    return () => {
      cancelled = true;
    };
  }, [selectedCSRId]);

  const csrList     = useMemo(() => reportData?.csrPerformance ?? [], [reportData]);
  const selectedCSR = csrList.find(c => c.id === selectedCSRId) ?? null;

  const stats = selectedCSR
    ? {
        // Total = all leads currently assigned to this CSR (not period-filtered)
        totalLeads:     selectedCSR.totalLeads ?? csrActualStats?.totalLeads ?? 0,
        completed:      selectedCSR.completed ?? csrActualStats?.completed ?? 0,
        important:      selectedCSR.important ?? csrActualStats?.important ?? 0,
        interested:     selectedCSR.interested ?? csrActualStats?.interested ?? 0,
        notCompleted:   selectedCSR.notCompleted ?? 0,
        notInterested:  selectedCSR.notInterested ?? 0,
        projectWon:     selectedCSR.projectWon ?? csrActualStats?.projectWon ?? 0,
        inHouse:        selectedCSR.inHouse ?? 0,
        noOwner:        selectedCSR.noOwner ?? 0,
        notInService:   selectedCSR.notInService ?? 0,
        scheduleCall:   selectedCSR.scheduleCall ?? 0,
      }
    : {
        totalLeads:     reportData?.totalLeads     ?? 0,
        completed:      reportData?.completed      ?? 0,
        important:      reportData?.important      ?? 0,
        interested:     reportData?.interested     ?? 0,
        notCompleted:   reportData?.notCompleted   ?? 0,
        notInterested:  reportData?.notInterested  ?? 0,
        projectWon:     reportData?.projectWon     ?? 0,
        inHouse:        reportData?.inHouse        ?? 0,
        noOwner:        reportData?.noOwner        ?? 0,
        notInService:   reportData?.notInService   ?? 0,
        scheduleCall:   reportData?.scheduleCall   ?? 0,
      };

  /** Same options as CSR "Update Status" dropdown */
  const statusPieData = useMemo(() => {
    const slices = [
      { name: "Not Interested",     value: stats.notInterested },
      { name: "Not Picked",         value: stats.notCompleted },
      { name: "No Owner Available", value: stats.noOwner },
      { name: "Not In Service",     value: stats.notInService },
      { name: "In House",           value: stats.inHouse },
      { name: "Important",          value: stats.important },
      { name: "Schedule Call",      value: stats.scheduleCall },
      { name: "Interested",         value: stats.interested },
      { name: "Close Client",       value: stats.projectWon },
    ];
    return slices.filter(s => s.value > 0);
  }, [stats]);

  const chartData = useMemo(() => {
    if (selectedCSR) {
      return [{ day: selectedCSR.name, calls: stats.totalLeads, completed: stats.completed }];
    }
    if (activePeriod !== "all" && reportData?.timeChart?.length) {
      return reportData.timeChart.map(t => ({ day: t.label, calls: t.leads, completed: t.completed }));
    }
    return csrList.map(c => ({ day: c.name, calls: c.totalLeads, completed: c.completed }));
  }, [selectedCSR, activePeriod, reportData, csrList, stats.totalLeads, stats.completed]);

  const chartPeriodLabel =
    activePeriod === "all"    ? "All leads" :
    activePeriod === "today"  ? "Today's breakdown by hour" :
    activePeriod === "week"   ? "Last 7 days" :
    activePeriod === "month"  ? "Last 30 days" :
    fromDate && toDate        ? `${fromDate} → ${toDate}` : "All time";

  const dropdownLabel = selectedCSR ? selectedCSR.name : "All CSRs";
  const displayCsrRows = selectedCSR
    ? [{
        ...selectedCSR,
        totalLeads: stats.totalLeads,
        completed: stats.completed,
        important: stats.important,
        interested: stats.interested,
        notCompleted: stats.notCompleted,
        notInterested: stats.notInterested,
        projectWon: stats.projectWon,
        inHouse: stats.inHouse,
        noOwner: stats.noOwner,
        notInService: stats.notInService,
        scheduleCall: stats.scheduleCall,
      }]
    : csrList;

  return (
    <div className="flex min-h-screen bg-[#EEF1F7] dark:bg-crm-bg-subtle">
      <StaffSidebar />

      <main className="flex-1 min-w-0 overflow-x-hidden mt-[var(--app-header-h,64px)]">
        <DashboardNavbar />
        <div className="w-full px-3 sm:px-5 lg:px-6 xl:px-8 2xl:px-10 py-4 sm:py-5 space-y-3.5 sm:space-y-4">

          <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#1B6FE8]/80 mb-1">Admin · Analytics</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-crm-text tracking-tight">Reports</h1>
              <p className="text-sm text-gray-500 dark:text-crm-text-muted mt-1">
                CSR performance, status mix, and shift tracking
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="h-11 flex-1 min-w-[130px] sm:flex-none rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#1B6FE8]"
              />
              <span className="text-gray-400 text-sm hidden sm:inline">→</span>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="h-11 flex-1 min-w-[130px] sm:flex-none rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#1B6FE8]"
              />
              <button
                onClick={() => {
                  if (!fromDate || !toDate) return;
                  setActivePeriod("all");
                  loadReports("all", fromDate, toDate, true);
                }}
                disabled={!fromDate || !toDate}
                className={`h-11 px-4 rounded-2xl text-sm font-semibold transition-all whitespace-nowrap ${
                  fromDate && toDate
                    ? "bg-[#1B6FE8] text-white shadow-sm"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                Filter
              </button>
              <button
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                  setActivePeriod("all");
                  loadReports("all", undefined, undefined, true);
                }}
                className="h-11 px-4 rounded-2xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50 whitespace-nowrap"
              >
                Reset
              </button>
            </div>
          </header>

          <div className="flex flex-wrap gap-2">
            {reportsBase.startsWith("/admin") ? (
              <Link href={`${reportsBase}/hours`} className="inline-flex items-center gap-2 h-11 px-3 rounded-2xl border border-gray-200 bg-white text-sm font-semibold text-[#0F172A] dark:bg-crm-surface dark:text-white dark:border-crm-border">
                <Clock3 size={16} /> Shift time and deductions
              </Link>
            ) : null}
            <Link href={`${reportsBase}/requests`} className="inline-flex items-center gap-2 h-11 px-3 rounded-2xl border border-gray-200 bg-white text-sm font-semibold text-[#0F172A] dark:bg-crm-surface dark:text-white dark:border-crm-border">
              <ClipboardList size={16} /> Employee requests
            </Link>
          </div>

          <section className={`${BENTO} p-3 sm:p-4`}>
            <div className="flex flex-wrap items-center gap-2">
              {([
                { key: "all",   label: "All Time" },
                { key: "today", label: "Today"   },
                { key: "week",  label: "7 Days"  },
                { key: "month", label: "30 Days" },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => {
                    setActivePeriod(key);
                    setFromDate("");
                    setToDate("");
                    loadReports(key);
                  }}
                  className={`h-10 px-4 rounded-2xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                    activePeriod === key && !fromDate
                      ? "bg-[#1B6FE8] text-white shadow-sm"
                      : "border border-gray-200 text-gray-600 hover:bg-gray-50 bg-white"
                  }`}
                >
                  {loadingReport && activePeriod === key ? "Loading..." : label}
                </button>
              ))}

              <div className="relative z-[60] ml-auto" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="h-10 px-4 rounded-2xl border border-gray-200 bg-white text-xs sm:text-sm font-semibold text-gray-700 flex items-center gap-2 min-w-[160px] hover:bg-gray-50"
                >
                  <Users size={14} className="text-[#1B6FE8]" />
                  <span className="truncate">{dropdownLabel}</span>
                  <ChevronDown size={14} className={`ml-auto text-gray-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 top-12 z-[70] bg-white border border-gray-100 rounded-2xl shadow-2xl overflow-hidden min-w-[220px] max-h-72 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => { setSelectedCSRId("all"); setDropdownOpen(false); }}
                      className={`w-full text-left px-4 py-3 text-sm font-semibold flex items-center gap-2 hover:bg-[#EAF2FE] ${
                        selectedCSRId === "all" ? "text-[#1B6FE8] bg-[#EAF2FE]" : "text-gray-700"
                      }`}
                    >
                      All CSRs
                    </button>
                    {csrList.map(csr => (
                      <button
                        key={csr.id}
                        type="button"
                        onClick={() => { setSelectedCSRId(csr.id); setDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-3 text-sm font-semibold flex items-center gap-2 hover:bg-[#EAF2FE] border-t border-gray-50 ${
                          selectedCSRId === csr.id ? "text-[#1B6FE8] bg-[#EAF2FE]" : "text-gray-700"
                        }`}
                      >
                        {csr.csrCode && (
                          <span className="bg-[#1B6FE8]/10 text-[#1B6FE8] text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0">{csr.csrCode}</span>
                        )}
                        <span className="truncate">{csr.name}</span>
                        <span className="ml-auto text-[10px] text-gray-400 shrink-0">{csr.totalLeads}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {loadingReport && (
                <div className="w-4 h-4 border-2 border-[#1B6FE8] border-t-transparent rounded-full animate-spin" />
              )}
            </div>
          </section>

          <section aria-label="Report stats" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3">
            {[
              { label: "Total Leads", value: stats.totalLeads, accent: "#1B6FE8", icon: <PhoneCall size={15} /> },
              { label: "Completed", value: stats.completed, accent: "#059669", icon: <ShoppingCart size={15} /> },
              { label: "Important", value: stats.important, accent: "#D97706", icon: <AlertTriangle size={15} /> },
              { label: "Interested", value: stats.interested, accent: "#2563EB", icon: <TrendingUp size={15} /> },
              { label: "Schedule Call", value: stats.scheduleCall, accent: "#0891B2", icon: <Clock3 size={15} /> },
              { label: "Close Client", value: stats.projectWon, accent: "#7C3AED", icon: <FileBarChart2 size={15} /> },
            ].map(tile => {
              const bar = stats.totalLeads > 0 ? Math.min(100, Math.round((tile.value / stats.totalLeads) * 100)) : (tile.label === "Total Leads" ? 100 : 0);
              return (
              <div
                key={tile.label}
                className={`${BENTO} relative p-3 sm:p-3.5 flex flex-col gap-2 min-h-[92px] h-full dark:bg-crm-surface`}
              >
                <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full" style={{ background: tile.accent }} />
                <div className="flex items-start justify-between gap-2 pl-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-crm-text-muted leading-snug line-clamp-2">
                    {tile.label}
                  </span>
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white"
                    style={{ background: tile.accent }}
                  >
                    {tile.icon}
                  </span>
                </div>
                {loadingReport ? (
                  <div className="h-8 w-14 bg-gray-100 dark:bg-crm-muted rounded-lg animate-pulse ml-1" />
                ) : (
                  <span className="text-2xl sm:text-[1.75rem] font-extrabold tracking-tight leading-none tabular-nums text-[#0F172A] dark:text-crm-text pl-1">
                    {tile.value.toLocaleString()}
                  </span>
                )}
                <div className="w-full h-1 rounded-full bg-gray-100 dark:bg-crm-muted overflow-hidden mt-auto ml-1">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(bar, bar > 0 ? 4 : 0)}%`, background: tile.accent }}
                  />
                </div>
              </div>
              );
            })}
          </section>

          <section
            aria-label="Reports bento"
            className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4"
          >
            <div className={`md:col-span-8 ${BENTO} p-4 sm:p-5 min-w-0`}>
              <ReportCharts
                chartData={chartData}
                statusPieData={statusPieData}
                chartPeriodLabel={selectedCSR ? `${selectedCSR.name} · ${chartPeriodLabel}` : chartPeriodLabel}
                pieSubtitle={`${selectedCSR ? selectedCSR.name : "All CSRs"} — status mix`}
              />
            </div>

            <div className={`md:col-span-4 ${BENTO} p-4 sm:p-5 min-w-0`}>
              <h2 className="font-bold text-[#0F172A] text-base sm:text-lg tracking-tight">
                {selectedCSR ? selectedCSR.name : "Quick Insights"}
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5 mb-4">
                {activePeriod === "all"   ? "All time" :
                 activePeriod === "today" ? "Today" :
                 activePeriod === "week"  ? "Last 7 days" :
                 activePeriod === "month" ? "Last 30 days" : "Custom range"}
              </p>
              {loadingReport ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-12 bg-gray-100 rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : stats.totalLeads === 0 && stats.completed === 0 ? (
                <div className="flex flex-col items-center justify-center h-40">
                  <Database size={28} className="text-gray-200 mb-2" />
                  <p className="text-sm text-gray-400">No data</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-0.5">
                  {[
                    { label: "Not Interested", val: stats.notInterested, color: "text-slate-700", bg: "bg-slate-50" },
                    { label: "Not Picked", val: stats.notCompleted, color: "text-amber-700", bg: "bg-amber-50" },
                    { label: "No Owner", val: stats.noOwner, color: "text-yellow-800", bg: "bg-yellow-50" },
                    { label: "Not In Service", val: stats.notInService, color: "text-violet-700", bg: "bg-violet-50" },
                    { label: "In House", val: stats.inHouse, color: "text-purple-700", bg: "bg-purple-50" },
                    { label: "Important", val: stats.important, color: "text-red-700", bg: "bg-red-50" },
                    { label: "Schedule Call", val: stats.scheduleCall, color: "text-sky-700", bg: "bg-sky-50" },
                    { label: "Interested", val: stats.interested, color: "text-orange-700", bg: "bg-orange-50" },
                    { label: "Close Client", val: stats.projectWon, color: "text-emerald-700", bg: "bg-emerald-50" },
                  ].map(s => (
                    <div key={s.label} className={`flex items-center justify-between gap-3 rounded-2xl ${s.bg} px-3 py-2.5`}>
                      <span className="text-xs font-semibold text-gray-600">{s.label}</span>
                      <span className={`text-base font-extrabold tabular-nums ${s.color}`}>{s.val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`md:col-span-12 ${BENTO} p-4 sm:p-5 min-w-0`}>
              <h2 className="font-bold text-[#0F172A] text-base sm:text-lg tracking-tight">Lead Status Breakdown</h2>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5 mb-4">
                {selectedCSR ? selectedCSR.name : "All CSRs"} · {chartPeriodLabel}
              </p>
              {!loadingReport && stats.totalLeads > 0 ? (
                <>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
                    {[
                      { val: stats.notInterested, bg: "bg-slate-500" },
                      { val: stats.notCompleted,  bg: "bg-amber-500" },
                      { val: stats.noOwner,       bg: "bg-yellow-600" },
                      { val: stats.notInService,  bg: "bg-violet-500" },
                      { val: stats.inHouse,       bg: "bg-purple-500" },
                      { val: stats.important,     bg: "bg-red-500" },
                      { val: stats.scheduleCall,  bg: "bg-sky-500" },
                      { val: stats.interested,    bg: "bg-orange-500" },
                      { val: stats.projectWon,    bg: "bg-emerald-500" },
                    ].map((b, i) => (
                      <div key={i} className={`${b.bg} h-full`} style={{ width: `${(b.val / stats.totalLeads) * 100}%` }}/>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
                    {[
                      { label: "Completed (updates)", val: stats.completed,     dot: "bg-green-500" },
                      { label: "Not Interested",     val: stats.notInterested,  dot: "bg-slate-500" },
                      { label: "Not Picked",         val: stats.notCompleted,   dot: "bg-amber-500" },
                      { label: "No Owner",           val: stats.noOwner,        dot: "bg-yellow-600" },
                      { label: "Not In Service",     val: stats.notInService,   dot: "bg-violet-500" },
                      { label: "In House",           val: stats.inHouse,        dot: "bg-purple-500" },
                      { label: "Important",          val: stats.important,      dot: "bg-red-500" },
                      { label: "Schedule Call",      val: stats.scheduleCall,   dot: "bg-sky-500" },
                      { label: "Interested",         val: stats.interested,     dot: "bg-orange-500" },
                      { label: "Close Client",       val: stats.projectWon,     dot: "bg-emerald-500" },
                    ].map(b => (
                      <span key={b.label} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                        <span className={`w-2.5 h-2.5 rounded-full ${b.dot}`}/>
                        {b.label} <strong className="text-[#0F172A] tabular-nums">{b.val}</strong>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400">{loadingReport ? "Loading…" : "No status mix for this period."}</p>
              )}
            </div>

            <div className="md:col-span-12 min-w-0">
              <CsrActivityReport />
            </div>
            <div className="md:col-span-12 min-w-0">
              <CsrActivityReport staffRole="estimator" />
            </div>
            <div className="md:col-span-12 min-w-0">
              <CsrActivityReport staffRole="bim" />
            </div>
            <div className="md:col-span-12 min-w-0">
              <StaffAttendanceReport />
            </div>

            <div className={`md:col-span-12 ${BENTO} p-4 sm:p-5 min-w-0`}>
              <button
                type="button"
                onClick={() => setCsrPerfOpen(v => !v)}
                className="w-full flex items-center justify-between gap-3"
              >
                <div className="text-left min-w-0">
                  <h2 className="font-bold text-[#0F172A] text-base sm:text-lg tracking-tight">
                    {selectedCSR ? `${selectedCSR.name} — Detail` : "All CSRs Performance"}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">Status counts per CSR for the selected period</p>
                </div>
                <ChevronDown size={18} className={`text-gray-400 shrink-0 transition-transform ${csrPerfOpen ? "rotate-180" : ""}`} />
              </button>

              {csrPerfOpen && (
                <div className="overflow-x-auto mt-4">
                  <table className="w-full" style={{ minWidth: "1100px" }}>
                    <thead>
                      <tr className="border-b border-gray-100 text-left bg-[#FAFAFB]">
                        {[
                          "CSR", "Total", "Completed",
                          "Not Interested", "Not Picked", "No Owner", "Not In Service", "In House",
                          "Important", "Schedule Call", "Interested", "Close Client",
                        ].map(h => (
                          <th key={h} className="px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loadingReport ? (
                        [1, 2, 3].map(i => (
                          <tr key={i} className="border-b border-gray-50">
                            {Array.from({ length: 12 }).map((_, j) => (
                              <td key={j} className="px-3 py-4">
                                <div className="h-4 w-10 bg-gray-100 rounded animate-pulse" />
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : displayCsrRows.map(csr => (
                        <tr key={csr.id} className="border-b border-gray-50 hover:bg-[#FAFAFB]">
                          <td className="px-3 py-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold shrink-0">
                                {csr.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-semibold text-sm text-[#0F172A] whitespace-nowrap">{csr.name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-4"><span className="text-sm font-bold text-[#0F172A] tabular-nums">{csr.totalLeads}</span></td>
                          <td className="px-3 py-4"><span className="text-sm font-semibold text-green-600 tabular-nums">{csr.completed}</span></td>
                          <td className="px-3 py-4"><span className="text-sm font-semibold text-slate-600 tabular-nums">{csr.notInterested ?? 0}</span></td>
                          <td className="px-3 py-4"><span className="text-sm font-semibold text-amber-600 tabular-nums">{csr.notCompleted ?? 0}</span></td>
                          <td className="px-3 py-4"><span className="text-sm font-semibold text-yellow-700 tabular-nums">{csr.noOwner ?? 0}</span></td>
                          <td className="px-3 py-4"><span className="text-sm font-semibold text-violet-600 tabular-nums">{csr.notInService ?? 0}</span></td>
                          <td className="px-3 py-4"><span className="text-sm font-semibold text-purple-600 tabular-nums">{csr.inHouse ?? 0}</span></td>
                          <td className="px-3 py-4"><span className="text-sm font-semibold text-red-600 tabular-nums">{csr.important}</span></td>
                          <td className="px-3 py-4"><span className="text-sm font-semibold text-sky-600 tabular-nums">{csr.scheduleCall ?? 0}</span></td>
                          <td className="px-3 py-4"><span className="text-sm font-semibold text-orange-600 tabular-nums">{csr.interested ?? 0}</span></td>
                          <td className="px-3 py-4"><span className="text-sm font-semibold text-emerald-600 tabular-nums">{csr.projectWon ?? 0}</span></td>
                        </tr>
                      ))}
                      {!loadingReport && csrList.length === 0 && (
                        <tr>
                          <td colSpan={12} className="py-16 text-center text-gray-400 text-sm">
                            No data for this period
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
