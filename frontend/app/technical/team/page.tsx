"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FolderKanban,
  RefreshCw,
  Search,
  Timer,
  Users,
  Star,
} from "lucide-react";
import TechnicalPageShell from "../components/TechnicalPageShell";
import { STAFF_PAGE_PAD, BENTO_CARD } from "@/lib/staffPageLayout";
import CapsuleTabs from "@/app/components/CapsuleTabs";
import { formatDivisionSummary, formatElapsed } from "@/lib/technicalAssignments";
import {
  fetchPreviousMonthRatings,
  ratingByEstimatorId,
  starsDisplay,
  type EstimatorMonthRating,
} from "@/lib/estimatorPreviousMonthRating";
import {
  fetchTechnicalMonitoring,
  formatDeadline,
  formatLoggedHours,
  scoreTone,
  type TechnicalTeamMember,
  type TechnicalTeamProjectRow,
} from "@/lib/technicalMonitoring";

type TeamFilter = "all" | "busy" | "overdue" | "idle" | "live";
type TeamSort = "busy" | "overdue" | "name" | "score";

function liveSeconds(p: Pick<TechnicalTeamProjectRow, "loggedSeconds" | "timerStartedAt" | "timerRunning">, now: number) {
  if (!p.timerRunning || !p.timerStartedAt) return p.loggedSeconds;
  const started = new Date(p.timerStartedAt).getTime();
  if (!Number.isFinite(started)) return p.loggedSeconds;
  return p.loggedSeconds + Math.max(0, Math.floor((now - started) / 1000));
}

function utilizationPct(loggedSeconds: number, plannedHours: number) {
  if (plannedHours <= 0) return 0;
  return Math.min(100, Math.round((loggedSeconds / 3600 / plannedHours) * 100));
}

export default function TechnicalTeamPage() {
  const [team, setTeam] = useState<TechnicalTeamMember[]>([]);
  const [prevRatings, setPrevRatings] = useState<EstimatorMonthRating[]>([]);
  const [prevMonthLabel, setPrevMonthLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<TeamFilter>("all");
  const [sort, setSort] = useState<TeamSort>("busy");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [nowTick, setNowTick] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mon, ratingsRes] = await Promise.all([
        fetchTechnicalMonitoring(),
        fetchPreviousMonthRatings().catch(() => null),
      ]);
      setTeam(Array.isArray(mon.team) ? mon.team : []);
      setGeneratedAt(mon.generatedAt ?? null);
      if (ratingsRes?.success) {
        setPrevRatings(ratingsRes.ratings);
        setPrevMonthLabel(ratingsRes.monthLabel);
      } else {
        setPrevRatings([]);
        setPrevMonthLabel("");
      }
    } catch {
      setTeam([]);
      setPrevRatings([]);
      setGeneratedAt(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 20000);
    return () => window.clearInterval(poll);
  }, [load]);

  useEffect(() => {
    const tick = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const ratingMap = useMemo(() => ratingByEstimatorId(prevRatings), [prevRatings]);

  const summary = useMemo(() => {
    let pending = 0;
    let overdue = 0;
    let live = 0;
    let logged = 0;
    let assigned = 0;
    let completed = 0;
    for (const m of team) {
      pending += m.pending;
      overdue += m.overdue;
      live += m.timersRunning;
      logged += m.loggedSeconds;
      assigned += m.assigned;
      completed += m.completed;
    }
    return {
      estimators: team.length,
      pending,
      overdue,
      live,
      logged,
      assigned,
      completed,
      completionRate: assigned > 0 ? Math.round((completed / assigned) * 100) : 0,
    };
  }, [team]);

  const counts = useMemo(() => {
    return {
      all: team.length,
      busy: team.filter((m) => m.pending > 0).length,
      overdue: team.filter((m) => m.overdue > 0).length,
      idle: team.filter((m) => m.pending === 0).length,
      live: team.filter((m) => m.timersRunning > 0).length,
    };
  }, [team]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = team.filter((m) => {
      if (filter === "busy" && m.pending <= 0) return false;
      if (filter === "overdue" && m.overdue <= 0) return false;
      if (filter === "idle" && m.pending > 0) return false;
      if (filter === "live" && m.timersRunning <= 0) return false;
      if (!needle) return true;
      return (
        m.name.toLowerCase().includes(needle) ||
        m.code.toLowerCase().includes(needle) ||
        m.projects.some(
          (p) =>
            (p.projectCode ?? "").toLowerCase().includes(needle) ||
            (p.projectTitle ?? "").toLowerCase().includes(needle) ||
            (p.workDetail ?? "").toLowerCase().includes(needle),
        )
      );
    });

    rows.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "score") return b.score - a.score || a.name.localeCompare(b.name);
      if (sort === "overdue") return b.overdue - a.overdue || b.pending - a.pending || a.name.localeCompare(b.name);
      return b.pending - a.pending || b.overdue - a.overdue || a.name.localeCompare(b.name);
    });
    return rows;
  }, [team, filter, q, sort]);

  const summaryCards = [
    {
      label: "Estimators",
      value: String(summary.estimators),
      hint: `${counts.busy} busy · ${counts.idle} idle`,
      icon: Users,
      from: "from-[#0B84F3]",
      to: "to-[#0369A1]",
    },
    {
      label: "Open jobs",
      value: String(summary.pending),
      hint: `${summary.live} timer${summary.live === 1 ? "" : "s"} live`,
      icon: Clock3,
      from: "from-[#D97706]",
      to: "to-[#B45309]",
    },
    {
      label: "Overdue",
      value: String(summary.overdue),
      hint: "Past assignment deadlines",
      icon: AlertTriangle,
      from: "from-[#1B6FE8]",
      to: "to-[#0E4FBE]",
    },
    {
      label: "Completion",
      value: `${summary.completionRate}%`,
      hint: `${summary.completed}/${summary.assigned} · ${formatLoggedHours(summary.logged)} logged`,
      icon: CheckCircle2,
      from: "from-[#059669]",
      to: "to-[#047857]",
    },
  ];

  return (
    <TechnicalPageShell>
        <div className={STAFF_PAGE_PAD}>
          <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 text-[11px] font-semibold text-[#1B6FE8] mb-1">
                <Users size={13} />
                Live workload
              </div>
              <h1 className="text-xl sm:text-2xl md:text-[28px] font-bold text-crm-text tracking-tight">
                Team Monitoring
              </h1>
              <p className="text-xs sm:text-sm text-crm-text-muted mt-0.5">
                Estimator jobs, timers, deadlines + previous month KPI rating.
                {prevMonthLabel ? (
                  <span className="text-violet-600 font-medium"> · {prevMonthLabel}</span>
                ) : null}
                {generatedAt ? (
                  <span className="text-gray-400"> · Synced {new Date(generatedAt).toLocaleTimeString()}</span>
                ) : null}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <Link
                href="/technical/active-projects"
                className="h-10 sm:h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 inline-flex items-center justify-center gap-1.5 hover:border-[#1B6FE8]/40 hover:text-[#1B6FE8]"
              >
                <FolderKanban size={14} />
                Active Projects
              </Link>
              <Link
                href="/technical/kpi"
                className="h-10 sm:h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 inline-flex items-center justify-center hover:border-[#1B6FE8]/40 hover:text-[#1B6FE8]"
              >
                Open KPI
              </Link>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="h-10 sm:h-11 px-4 sm:px-5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 inline-flex items-center justify-center gap-2 hover:border-[#1B6FE8]/40 hover:text-[#1B6FE8] hover:bg-[#F4F8FF] disabled:opacity-60 shadow-sm"
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </header>

          <section className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
            {summaryCards.map((c) => (
              <div
                key={c.label}
                className={`bg-gradient-to-br ${c.from} ${c.to} rounded-xl sm:rounded-2xl p-3 sm:p-4 text-white shadow-md min-h-[96px] flex flex-col gap-1.5`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-white/75 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">
                    {c.label}
                  </span>
                  <span className="w-6 h-6 sm:w-7 sm:h-7 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                    <c.icon size={14} />
                  </span>
                </div>
                {loading && team.length === 0 ? (
                  <div className="h-7 w-14 bg-white/25 rounded-lg animate-pulse" />
                ) : (
                  <span className="text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums leading-none">
                    {c.value}
                  </span>
                )}
                <p className="text-[10px] sm:text-[11px] text-white/70 mt-auto">{c.hint}</p>
              </div>
            ))}
          </section>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CapsuleTabs
              tabs={[
                { key: "all", label: "All", count: counts.all },
                { key: "busy", label: "Busy", count: counts.busy },
                { key: "live", label: "Timer live", count: counts.live },
                { key: "overdue", label: "Overdue", count: counts.overdue },
                { key: "idle", label: "Idle", count: counts.idle },
              ]}
              activeKey={filter}
              onChange={(key) => setFilter(key)}
              accent="#1B6FE8"
            />
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as TeamSort)}
                className="h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 outline-none focus:border-[#1B6FE8]"
              >
                <option value="busy">Sort: Busiest</option>
                <option value="overdue">Sort: Overdue</option>
                <option value="score">Sort: Score</option>
                <option value="name">Sort: Name</option>
              </select>
              <div className="relative w-full sm:w-[280px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search estimator or project…"
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 bg-white text-sm text-[#0F172A] outline-none focus:border-[#1B6FE8] placeholder:text-gray-400"
                />
              </div>
            </div>
          </div>

          <section className="space-y-3">
            {loading && team.length === 0 ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
                  <div className="h-5 bg-gray-100 rounded w-1/3 mb-3" />
                  <div className="h-3 bg-gray-50 rounded w-2/3" />
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 px-4 py-14 text-center text-sm text-gray-400 font-medium">
                {team.length === 0
                  ? "No estimators found. Add users with role Estimator in Admin Users."
                  : "No estimators match this filter."}
              </div>
            ) : (
              filtered.map((m) => {
                const open = expanded[m.estimatorId] ?? false;
                const util = utilizationPct(m.loggedSeconds, m.plannedHours);
                const prev = ratingMap.get(m.estimatorId);

                return (
                  <article
                    key={m.estimatorId}
                    className={`${BENTO_CARD} overflow-hidden`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => ({ ...prev, [m.estimatorId]: !open }))
                      }
                      className="w-full text-left px-4 sm:px-5 py-4 flex flex-col gap-3 hover:bg-[#FFF8F9]/60 transition-colors"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-[#EAF2FE] text-[#1B6FE8] flex items-center justify-center font-bold text-xs shrink-0">
                            {m.name
                              .split(" ")
                              .map((w) => w[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-bold text-crm-text text-sm sm:text-base truncate">
                                {m.name}
                              </h3>
                              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                                {m.code}
                              </span>
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-lg text-[11px] font-bold tabular-nums ${scoreTone(m.score)}`}
                              >
                                Score {m.score}
                              </span>
                              {m.timersRunning > 0 ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg">
                                  <Timer size={11} /> {m.timersRunning} live
                                </span>
                              ) : null}
                              {m.overdue > 0 ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#1B6FE8] bg-[#EAF2FE] px-2 py-0.5 rounded-lg">
                                  <AlertTriangle size={11} /> {m.overdue} overdue
                                </span>
                              ) : null}
                              {prev?.marks ? (
                                <span className="text-[11px] font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-lg" title={prevMonthLabel ? `${prevMonthLabel} marks` : undefined}>
                                  {prev.marks}/10
                                </span>
                              ) : null}
                              {prev?.stars ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg" title={prevMonthLabel ? `${prevMonthLabel} rating` : undefined}>
                                  <Star size={10} className="fill-amber-400 text-amber-400" />
                                  {starsDisplay(prev.stars)}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-[11px] sm:text-xs text-gray-500 mt-1">
                              {m.assigned} assigned · {m.pending} pending · {m.completed} done ·{" "}
                              {formatLoggedHours(m.loggedSeconds)} logged
                              {m.plannedHours > 0 ? ` / ${m.plannedHours}h planned` : ""}
                            </p>
                            {prev?.remarks ? (
                              <p className="text-[11px] text-gray-500 mt-1 line-clamp-1">
                                {prevMonthLabel ? `${prevMonthLabel}: ` : ""}
                                {prev.remarks}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <ChevronDown
                          size={16}
                          className={`text-gray-400 transition-transform self-end sm:self-center shrink-0 ${open ? "rotate-180" : ""}`}
                        />
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="rounded-xl bg-[#FAFAFA] border border-gray-100 px-2.5 py-2">
                          <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">Pending</p>
                          <p className="text-sm font-extrabold tabular-nums text-amber-700">{m.pending}</p>
                        </div>
                        <div className="rounded-xl bg-[#FAFAFA] border border-gray-100 px-2.5 py-2">
                          <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">Done</p>
                          <p className="text-sm font-extrabold tabular-nums text-emerald-700">{m.completed}</p>
                        </div>
                        <div className="rounded-xl bg-[#FAFAFA] border border-gray-100 px-2.5 py-2">
                          <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">Completion</p>
                          <p className="text-sm font-extrabold tabular-nums text-[#0F172A]">{m.completionRate}%</p>
                        </div>
                        <div className="rounded-xl bg-[#FAFAFA] border border-gray-100 px-2.5 py-2">
                          <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">Hours used</p>
                          <p className="text-sm font-extrabold tabular-nums text-[#0F172A]">{util}%</p>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-semibold text-gray-500">
                          <span>Takeoff completion</span>
                          <span className="tabular-nums">{m.completionRate}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${Math.max(0, Math.min(100, m.completionRate))}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-semibold text-gray-500">
                          <span>Logged vs planned</span>
                          <span className="tabular-nums">{util}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-sky-500"
                            style={{ width: `${util}%` }}
                          />
                        </div>
                      </div>
                    </button>

                    {open ? (
                      <div className="border-t border-gray-100">
                        {m.projects.length === 0 ? (
                          <p className="px-4 py-6 text-sm text-gray-400 text-center">No projects assigned.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left min-w-[860px]">
                              <thead className="bg-[#FAFAFA] text-[11px] text-gray-500 uppercase tracking-wide">
                                <tr>
                                  <th className="px-4 py-2.5 font-semibold">Project</th>
                                  <th className="px-4 py-2.5 font-semibold">Deadline</th>
                                  <th className="px-4 py-2.5 font-semibold">Status</th>
                                  <th className="px-4 py-2.5 font-semibold">Hours</th>
                                  <th className="px-4 py-2.5 font-semibold">Timer</th>
                                  <th className="px-4 py-2.5 font-semibold">Scope / Div</th>
                                  <th className="px-4 py-2.5 font-semibold">Work detail</th>
                                </tr>
                              </thead>
                              <tbody>
                                {m.projects.map((p, idx) => {
                                  const elapsed = liveSeconds(p, nowTick);
                                  return (
                                    <tr
                                      key={`${m.estimatorId}-${p.leadId}-${idx}`}
                                      className={`border-t border-gray-50 ${p.overdue ? "bg-[#FFF8F9]" : ""}`}
                                    >
                                      <td className="px-4 py-3">
                                        <div className="text-xs font-semibold text-[#1B6FE8]">
                                          {p.projectCode || "—"}
                                        </div>
                                        <div className="text-sm font-semibold text-[#0F172A] truncate max-w-[220px]">
                                          {p.projectTitle || "Untitled"}
                                        </div>
                                        {p.projectPhase ? (
                                          <div className="text-[10px] text-gray-400 mt-0.5">{p.projectPhase}</div>
                                        ) : null}
                                      </td>
                                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                                        {formatDeadline(p.deadline)}
                                        {p.overdue ? (
                                          <span className="ml-1.5 text-[10px] font-bold text-[#1B6FE8]">OVERDUE</span>
                                        ) : null}
                                        {p.deadlineTiming ? (
                                          <span className="ml-1.5 text-[10px] font-bold uppercase text-amber-700">
                                            {p.deadlineTiming}
                                          </span>
                                        ) : null}
                                      </td>
                                      <td className="px-4 py-3">
                                        <span
                                          className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide ${
                                            p.takeoffDone
                                              ? "bg-emerald-50 text-emerald-700"
                                              : "bg-amber-50 text-amber-700"
                                          }`}
                                        >
                                          {p.takeoffDone ? "Done" : "Pending"}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 text-xs tabular-nums text-gray-700">
                                        {p.manHours ? `${p.manHours}h` : "—"}
                                      </td>
                                      <td className="px-4 py-3 text-xs tabular-nums text-gray-700 whitespace-nowrap">
                                        <span className={p.timerRunning ? "font-bold text-sky-700" : ""}>
                                          {formatElapsed(elapsed)}
                                        </span>
                                        {p.timerRunning ? (
                                          <span className="ml-1 text-[10px] font-bold text-sky-600">LIVE</span>
                                        ) : null}
                                      </td>
                                      <td className="px-4 py-3 text-xs text-gray-600 max-w-[160px]">
                                        <div className="truncate">{(p.scopes ?? []).join(", ") || "—"}</div>
                                        <div className="text-[10px] text-gray-400 truncate mt-0.5">
                                          {formatDivisionSummary(p.divisions)}
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px]">
                                        <div className="line-clamp-2">{p.workDetail?.trim() || "—"}</div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <div className="px-4 py-2.5 border-t border-gray-50 bg-[#FAFAFA] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <p className="text-[11px] text-gray-400">
                            {prevMonthLabel
                              ? `Previous month rating (${prevMonthLabel})`
                              : "Previous month KPI rating"}
                            {prev ? ` · ${prev.marks || "—"}/10` : ""}
                          </p>
                          <div className="flex items-center gap-3 justify-end">
                            <Link
                              href="/technical/kpi"
                              className="text-xs font-semibold text-gray-600 hover:text-[#1B6FE8] hover:underline"
                            >
                              Edit KPI →
                            </Link>
                            <Link
                              href="/technical/active-projects"
                              className="text-xs font-semibold text-[#1B6FE8] hover:underline"
                            >
                              Manage assignments →
                            </Link>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </section>
        </div>
    </TechnicalPageShell>
  );
}
