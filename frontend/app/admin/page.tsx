"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { StaffSidebar } from "@/app/hooks/useStaffSidebar";
import { useStaffBase } from "@/app/hooks/useStaffBase";
import RecentActivity   from "./components/widgets/RecentActivity";
import TopPerformers    from "./components/widgets/TopPerformer";
import TopEstimatorsWidget from "./components/widgets/TopEstimatorsWidget";
import ActiveProjectsWidget from "./components/widgets/ActiveProjectsWidget";
import { getAdminSummary, isEmptyAdminSummary, peekAdminSummary, subscribeAdminSummaryStale, type AdminDashboardSummary } from "@/lib/adminSummaryCache";
import { apiErrorMessage } from "@/lib/api";
import toast from "react-hot-toast";
import {
  Users, PhoneCall, CheckCircle2, Clock3, Star,
  TrendingUp, Trophy, RefreshCw, Calculator, Ruler,
} from "lucide-react";
const PerformanceChart = dynamic(() => import("./components/charts/PerformanceChart"), {
  ssr: false,
  loading: () => <div className="h-full min-h-[260px] rounded-2xl bg-gray-100 dark:bg-crm-muted animate-pulse" />,
});

const OverviewChart = dynamic(() => import("./components/charts/OverviewChart"), {
  ssr: false,
  loading: () => <div className="h-full min-h-[280px] rounded-2xl bg-gray-100 dark:bg-crm-muted animate-pulse" />,
});

type QuickStats = {
  totalLeads:  number;
  completed:   number;
  closed:      number;
  todayCompletedCalls: number;
  pending:     number;
  important:   number;
  importantOnly?: number;
  interested:  number;
  projectWon:  number;
  onlineCSRs:  number;
  totalOnline: number;
};

function statsFromSummary(s: AdminDashboardSummary): QuickStats {
  return {
    totalLeads:  s.stats?.totalLeads  ?? 0,
    completed:   s.stats?.completed   ?? 0,
    closed:      s.stats?.closed      ?? 0,
    todayCompletedCalls: s.stats?.todayCompletedCalls ?? 0,
    pending:     s.stats?.pending     ?? 0,
    important:   s.stats?.important   ?? 0,
    importantOnly: s.stats?.importantOnly ?? s.stats?.important ?? 0,
    interested:  s.stats?.interested  ?? 0,
    projectWon:  s.stats?.projectWon  ?? 0,
    onlineCSRs:  s.stats?.onlineCSRs  ?? 0,
    totalOnline: s.stats?.totalOnline ?? 0,
  };
}

const BENTO =
  "rounded-[1.5rem] sm:rounded-[1.75rem] border border-gray-100/90 dark:border-crm-border bg-white dark:bg-crm-surface shadow-[0_10px_40px_-24px_rgba(15,23,42,0.35)]";

function sharePct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

export default function DashboardPage() {
  const router = useRouter();
  const staffBase = useStaffBase();
  const isAdminPortal = staffBase === "/admin";
  const [selectedRange, setSelectedRange] = useState("week");
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [overviewLoaded, setOverviewLoaded] = useState(false);
  const [loadingOverview, setLoadingOverview] = useState(false);

  const loadOverview = useCallback(async (force = false) => {
    setLoadingOverview(true);
    try {
      const s = await getAdminSummary(force);
      setSummary(s);
      setStats(statsFromSummary(s));
      setOverviewLoaded(true);
    } catch (err) {
      if (process.env.NODE_ENV === "development") console.error("[AdminDash]", err);
      toast.error(apiErrorMessage(err, "Failed to load dashboard stats."));
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    const cached = peekAdminSummary();
    const usable = cached && !isEmptyAdminSummary(cached);
    if (usable) {
      setSummary(cached);
      setStats(statsFromSummary(cached));
      setOverviewLoaded(true);
    }
    /* Always refetch — empty sessionStorage from a backend 502 used to stick as zeros. */
    void loadOverview(true);
  }, [loadOverview]);

  useEffect(() => {
    return subscribeAdminSummaryStale(() => {
      void loadOverview(true);
    });
  }, [loadOverview]);

  const chartSeries = useMemo(() => {
    const s = summary?.chartSeries;
    if (!s) return undefined;
    const key = selectedRange as keyof NonNullable<typeof s>;
    return s[key];
  }, [summary?.chartSeries, selectedRange]);

  const totalLeads = stats?.totalLeads ?? 0;
  const tiles = useMemo(() => {
    const t = stats?.totalLeads ?? 0;
    return [
      { label: "Total Leads", value: t, accent: "#1B6FE8", icon: <PhoneCall size={15} />, bar: 100 },
      { label: "Today Completed Calls", value: stats?.todayCompletedCalls ?? 0, accent: "#059669", icon: <CheckCircle2 size={15} />, bar: sharePct(stats?.todayCompletedCalls ?? 0, Math.max(t, 1)) },
      { label: "Pending", value: stats?.pending ?? 0, accent: "#D97706", icon: <Clock3 size={15} />, bar: sharePct(stats?.pending ?? 0, t) },
      { label: "Total Completed", value: stats?.completed ?? 0, accent: "#DC2626", icon: <CheckCircle2 size={15} />, bar: sharePct(stats?.completed ?? 0, t) },
      { label: "Interested", value: stats?.interested ?? 0, accent: "#2563EB", icon: <TrendingUp size={15} />, bar: sharePct(stats?.interested ?? 0, t), href: `${staffBase}/leads?tab=interested` },
      { label: "Close Client", value: stats?.projectWon ?? 0, accent: "#7C3AED", icon: <Trophy size={15} />, bar: sharePct(stats?.projectWon ?? 0, t), href: `${staffBase}/leads?tab=closed` },
      { label: "Important", value: stats?.importantOnly ?? stats?.important ?? 0, accent: "#0891B2", icon: <Star size={15} />, bar: sharePct(stats?.importantOnly ?? stats?.important ?? 0, t), href: `${staffBase}/leads?tab=important` },
      { label: "Users Online", value: stats?.totalOnline ?? 0, accent: "#4F46E5", icon: <Users size={15} />, bar: Math.min(100, (stats?.totalOnline ?? 0) * 8) },
    ];
  }, [stats, staffBase]);

  const pipeline = useMemo(() => {
    const stages = [
      { label: "Pending", value: stats?.pending ?? 0, color: "#D97706" },
      { label: "Interested", value: stats?.interested ?? 0, color: "#2563EB" },
      { label: "Important", value: stats?.importantOnly ?? stats?.important ?? 0, color: "#0891B2" },
      { label: "Won", value: stats?.projectWon ?? 0, color: "#7C3AED" },
      { label: "Completed", value: stats?.completed ?? 0, color: "#DC2626" },
    ];
    const max = Math.max(1, ...stages.map((s) => s.value));
    return { stages, max, total: totalLeads };
  }, [stats, totalLeads]);

  return (
    <div className="flex min-h-screen bg-[#EEF1F7] dark:bg-crm-bg-subtle">
      <StaffSidebar />

      <main className="flex-1 min-w-0 overflow-x-hidden mt-[var(--app-header-h,64px)]">
        <div className="w-full px-3 sm:px-5 lg:px-6 xl:px-8 2xl:px-10 py-4 sm:py-5 space-y-3.5 sm:space-y-4">

          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#1B6FE8]/80 mb-1">Admin · Overview</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-crm-text tracking-tight">
                Dashboard
              </h1>
              <p className="text-sm text-gray-500 dark:text-crm-text-muted mt-1">
                Pipeline overview · CSR activity · live presence
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
              {isAdminPortal && (
                <>
                  <a
                    href="/technical"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-11 px-4 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 text-sm font-semibold text-amber-900 dark:text-amber-200 inline-flex items-center justify-center gap-2 hover:border-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50 shadow-sm"
                  >
                    <Ruler size={15} />
                    Chief Estimator
                  </a>
                  <a
                    href="/accounts"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-11 px-4 rounded-2xl border border-sky-200 dark:border-sky-900/40 bg-sky-50 dark:bg-sky-950/30 text-sm font-semibold text-sky-900 dark:text-sky-200 inline-flex items-center justify-center gap-2 hover:border-sky-400 hover:bg-sky-100 dark:hover:bg-sky-950/50 shadow-sm"
                  >
                    <Calculator size={15} />
                    Accounts
                  </a>
                </>
              )}
              <button
                type="button"
                onClick={() => void loadOverview(true)}
                disabled={loadingOverview}
                className="h-11 px-5 rounded-2xl border border-gray-200 dark:border-crm-border bg-white dark:bg-crm-surface text-sm font-semibold text-gray-700 dark:text-crm-text-secondary inline-flex items-center justify-center gap-2 hover:border-[#1B6FE8]/40 hover:text-[#1B6FE8] hover:bg-[#F4F8FF] dark:hover:bg-crm-muted disabled:opacity-60 shadow-sm w-full sm:w-auto shrink-0"
              >
                <RefreshCw size={15} className={loadingOverview ? "animate-spin" : ""} />
                {loadingOverview ? "Refreshing…" : "Refresh stats"}
              </button>
            </div>
          </header>

          <section
            aria-label="Quick stats"
            className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5 sm:gap-3"
          >
            {tiles.map((tile) => {
              const inner = (
                <>
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
                  {loadingOverview ? (
                    <div className="h-8 w-16 bg-gray-100 dark:bg-crm-muted rounded-lg animate-pulse ml-1" />
                  ) : (
                    <span className="text-2xl sm:text-[1.75rem] font-extrabold tracking-tight leading-none tabular-nums text-[#0F172A] dark:text-crm-text pl-1">
                      {overviewLoaded ? tile.value.toLocaleString() : "—"}
                    </span>
                  )}
                  <div className="w-full h-1 rounded-full bg-gray-100 dark:bg-crm-muted overflow-hidden mt-auto ml-1">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(tile.bar, tile.bar > 0 ? 4 : 0)}%`, background: tile.accent }}
                    />
                  </div>
                </>
              );
              const cls = `${BENTO} relative p-3 sm:p-3.5 flex flex-col gap-2 min-h-[92px] h-full`;
              return tile.href ? (
                <button
                  key={tile.label}
                  type="button"
                  onClick={() => router.push(tile.href!)}
                  className={`${cls} text-left hover:border-[#1B6FE8]/30 active:scale-[0.99] transition-all cursor-pointer`}
                >
                  {inner}
                </button>
              ) : (
                <div key={tile.label} className={cls}>
                  {inner}
                </div>
              );
            })}
          </section>

          <section
            aria-label="Dashboard bento"
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 sm:gap-4"
          >
            <div className={`${BENTO} md:col-span-2 xl:col-span-8 p-4 sm:p-5 min-w-0 flex flex-col min-h-[380px] xl:min-h-[440px]`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-2 shrink-0">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Activity</p>
                  <h2 className="font-bold text-[#0F172A] dark:text-crm-text text-base sm:text-lg tracking-tight">Performance Overview</h2>
                  <p className="text-xs text-gray-500 dark:text-crm-text-muted mt-0.5">
                    CSR call volume · day resets 12:00 AM (EST)
                  </p>
                </div>
                {(overviewLoaded || loadingOverview) && (
                  <DateRangePicker selected={selectedRange} onChange={setSelectedRange} />
                )}
              </div>
              <div className="flex-1 min-h-[260px]">
                {overviewLoaded || loadingOverview ? (
                  <PerformanceChart series={chartSeries} range={selectedRange} />
                ) : (
                  <div className="h-full min-h-[260px] rounded-2xl bg-gray-100 dark:bg-crm-muted animate-pulse" />
                )}
              </div>
            </div>

            <div className={`${BENTO} md:col-span-1 xl:col-span-4 p-4 sm:p-5 min-w-0 flex flex-col min-h-[380px] xl:min-h-[440px]`}>
              {overviewLoaded || loadingOverview ? (
                <OverviewChart distribution={summary?.distribution} />
              ) : (
                <div className="h-full rounded-2xl bg-gray-100 dark:bg-crm-muted animate-pulse" />
              )}
            </div>

            <div className={`${BENTO} md:col-span-1 xl:col-span-4 p-4 sm:p-5 min-w-0 min-h-[280px]`}>
              {overviewLoaded || loadingOverview ? (
                <TopPerformers performers={summary?.performers} />
              ) : (
                <div className="h-full rounded-2xl bg-gray-100 dark:bg-crm-muted animate-pulse" />
              )}
            </div>

            <div className={`${BENTO} md:col-span-1 xl:col-span-4 p-4 sm:p-5 min-w-0 min-h-[280px]`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Conversion</p>
              <h3 className="font-bold text-[#0F172A] dark:text-crm-text mb-3">Pipeline funnel</h3>
              <div className="space-y-2.5">
                {pipeline.stages.map((s) => {
                  const pct = sharePct(s.value, pipeline.total);
                  const width = Math.max(s.value > 0 ? 10 : 0, Math.round((s.value / pipeline.max) * 100));
                  return (
                    <div key={s.label}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-600 dark:text-crm-text-secondary">{s.label}</span>
                        <span className="text-xs font-bold tabular-nums text-[#0F172A] dark:text-crm-text">
                          {s.value.toLocaleString()}
                          <span className="text-gray-400 font-semibold ml-1">{pct}%</span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 dark:bg-crm-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${width}%`, background: s.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`${BENTO} md:col-span-2 xl:col-span-4 p-4 sm:p-5 min-w-0 min-h-[280px]`}>
              {overviewLoaded || loadingOverview ? (
                <RecentActivity recent={summary?.recent} recentStatus={summary?.recentStatus} />
              ) : (
                <div className="h-full rounded-2xl bg-gray-100 dark:bg-crm-muted animate-pulse" />
              )}
            </div>

            <div className={`${BENTO} md:col-span-1 xl:col-span-5 p-4 sm:p-5 min-w-0 min-h-[260px]`}>
              <ActiveProjectsWidget enabled={overviewLoaded || loadingOverview} />
            </div>

            <div className={`${BENTO} md:col-span-1 xl:col-span-7 p-4 sm:p-5 min-w-0 min-h-[260px] bg-gradient-to-br from-amber-50/60 via-white to-sky-50/40 dark:from-amber-950/20 dark:via-crm-surface dark:to-sky-950/10`}>
              <TopEstimatorsWidget />
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}

const DateRangePicker = ({ selected, onChange }: { selected: string; onChange: (r: string) => void }) => (
  <div className="flex gap-1.5 overflow-x-auto max-w-full pb-0.5 shrink-0 -mx-0.5 px-0.5">
    {[
      { key: "today", label: "Today / Pending" },
      { key: "week", label: "Week" },
      { key: "month", label: "Month" },
      { key: "year", label: "Year" },
    ].map(r => (
      <button
        key={r.key}
        type="button"
        onClick={() => onChange(r.key)}
        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
          selected === r.key
            ? "bg-[#1B6FE8] text-white shadow-sm"
            : "bg-gray-100 dark:bg-crm-muted text-gray-600 dark:text-crm-text-secondary hover:bg-gray-200 dark:hover:bg-crm-surface-raised"
        }`}
      >
        {r.label}
      </button>
    ))}
  </div>
);
