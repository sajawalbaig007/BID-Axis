"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FolderKanban, CheckCircle2, Clock3, AlertTriangle,
  ArrowRight, RefreshCw, Star, Trophy, MessageSquare,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis,
} from "recharts";
import EstimatorPageShell from "./components/EstimatorPageShell";
import TmRemarksPreview from "./components/TmRemarksPreview";
import RechartsBox from "@/app/components/charts/RechartsBox";
import UploadActionBento, { type UploadBentoItem } from "@/app/admin/components/uploads/UploadActionBento";
import { STAFF_PAGE_PAD } from "@/lib/staffPageLayout";
import { CSR_THEAD } from "@/app/csr/components/shared/csrTableStyles";
import { PROJECT_TABLE_HEAD } from "@/app/components/projects/ProjectTableCells";
import API from "@/lib/api";
import { peekAuthMe } from "@/lib/authMeCache";
import { fetchMyPreviousMonthRating, starsDisplay, type EstimatorMonthRating } from "@/lib/estimatorPreviousMonthRating";
import { chiefEstimatorRemarks, type TechnicalAssignment } from "@/lib/technicalAssignments";

type RecentRow = {
  id: string;
  projectTitle?: string | null;
  projectCode?: string | null;
  projectDeadline?: string | null;
  projectPhase?: string | null;
  technicalNotes?: string | null;
  myAssignment?: TechnicalAssignment;
};

type Stats = {
  total: number;
  pending: number;
  takeoffDone: number;
  overdue: number;
};

const CHART_TIP = {
  borderRadius: 12,
  fontSize: 12,
  border: "1px solid var(--crm-border)",
  background: "var(--crm-surface)",
  color: "var(--crm-text)",
} as const;

export default function EstimatorDashboardPage() {
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, takeoffDone: 0, overdue: 0 });
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [prevRating, setPrevRating] = useState<EstimatorMonthRating | null>(null);
  const [prevMonthLabel, setPrevMonthLabel] = useState("");
  const meId = peekAuthMe()?.id;

  const load = async () => {
    setLoading(true);
    try {
      const [dashRes, ratingRes] = await Promise.all([
        API.get("/estimator/dashboard"),
        fetchMyPreviousMonthRating().catch(() => null),
      ]);
      setStats(dashRes.data?.stats ?? { total: 0, pending: 0, takeoffDone: 0, overdue: 0 });
      setRecent(Array.isArray(dashRes.data?.recent) ? dashRes.data.recent : []);
      if (ratingRes?.success) {
        setPrevRating(ratingRes.rating);
        setPrevMonthLabel(ratingRes.monthLabel);
      } else {
        setPrevRating(null);
        setPrevMonthLabel("");
      }
    } catch {
      setStats({ total: 0, pending: 0, takeoffDone: 0, overdue: 0 });
      setRecent([]);
      setPrevRating(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const statusPie = useMemo(() => {
    const pendingOnTrack = Math.max(0, stats.pending - stats.overdue);
    return [
      { name: "Pending", value: pendingOnTrack, color: "#D97706" },
      { name: "Overdue", value: stats.overdue, color: "#1B6FE8" },
      { name: "Takeoff done", value: stats.takeoffDone, color: "#059669" },
    ].filter((d) => d.value > 0);
  }, [stats]);

  const workloadBar = useMemo(
    () =>
      [
        { name: "Assigned", count: stats.total, fill: "#7C3AED" },
        { name: "Pending", count: stats.pending, fill: "#D97706" },
        { name: "Done", count: stats.takeoffDone, fill: "#059669" },
        { name: "Overdue", count: stats.overdue, fill: "#1B6FE8" },
      ].filter((d) => d.count > 0),
    [stats],
  );

  const remarksFeed = useMemo(() => {
    return recent
      .map((p) => {
        const pack = chiefEstimatorRemarks({
          technicalNotes: p.technicalNotes,
          evaluationRemarks: p.myAssignment?.evaluationRemarks,
          currentUserId: meId,
        });
        if (!pack.evaluation && pack.notes.length === 0) return null;
        return { project: p, ...pack };
      })
      .filter(Boolean) as Array<{
        project: RecentRow;
        evaluation: string;
        notes: ReturnType<typeof chiefEstimatorRemarks>["notes"];
      }>;
  }, [recent, meId]);

  const denom = Math.max(1, stats.total);
  const cards = [
    { label: "Assigned", value: stats.total, icon: FolderKanban, from: "from-[#7C3AED]", to: "to-[#5B21B6]", bar: "100%" },
    { label: "Pending", value: stats.pending, icon: Clock3, from: "from-[#D97706]", to: "to-[#B45309]", bar: `${Math.round((stats.pending / denom) * 100)}%` },
    { label: "Takeoff Done", value: stats.takeoffDone, icon: CheckCircle2, from: "from-[#059669]", to: "to-[#047857]", bar: `${Math.round((stats.takeoffDone / denom) * 100)}%` },
    { label: "Overdue", value: stats.overdue, icon: AlertTriangle, from: "from-[#1B6FE8]", to: "to-[#0E4FBE]", bar: `${Math.round((stats.overdue / denom) * 100)}%` },
  ];

  const bentoItems: UploadBentoItem[] = useMemo(() => [
    {
      id: "mix",
      label: "Assignment mix",
      shortLabel: "Mix",
      accent: "#7C3AED",
      span: "wide",
      content: (
        <div className="p-4 sm:p-5 flex flex-col h-full min-h-0">
          <h2 className="font-bold text-crm-text text-sm sm:text-base">Assignment mix</h2>
          <p className="text-[11px] sm:text-xs text-crm-text-faint mt-0.5 mb-3">Pending · overdue · takeoff done</p>
          {loading ? (
            <div className="flex-1 bg-crm-border-subtle/40 rounded-2xl animate-pulse min-h-[180px]" />
          ) : statusPie.length === 0 ? (
            <p className="text-sm text-crm-text-faint text-center py-16">No assignments yet</p>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <RechartsBox height={180} className="sm:w-[180px] shrink-0">
                <PieChart>
                  <Pie
                    data={statusPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={68}
                    paddingAngle={3}
                    stroke="var(--crm-surface)"
                    strokeWidth={2}
                  >
                    {statusPie.map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={CHART_TIP} formatter={(value) => [`${value} projects`, ""]} />
                </PieChart>
              </RechartsBox>
              <div className="flex-1 w-full grid gap-2">
                {statusPie.map((s) => (
                  <div key={s.name} className="flex items-center gap-3 bg-[#FAFAFA] dark:bg-crm-muted rounded-xl px-3 py-2.5">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <p className="flex-1 text-xs sm:text-sm font-medium text-crm-text-secondary">{s.name}</p>
                    <span className="text-lg font-bold tabular-nums" style={{ color: s.color }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      id: "workload",
      label: "Workload",
      shortLabel: "Load",
      accent: "#0B84F3",
      content: (
        <div className="p-4 sm:p-5 flex flex-col h-full min-h-0">
          <h2 className="font-bold text-crm-text text-sm sm:text-base">Workload snapshot</h2>
          <p className="text-[11px] sm:text-xs text-crm-text-faint mt-0.5 mb-3">Your assigned pipeline at a glance</p>
          {loading ? (
            <div className="flex-1 bg-crm-border-subtle/40 rounded-2xl animate-pulse min-h-[180px]" />
          ) : workloadBar.length === 0 ? (
            <p className="text-sm text-crm-text-faint text-center py-16">No workload data yet</p>
          ) : (
            <RechartsBox height={200}>
              <BarChart data={workloadBar} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--crm-border-subtle)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--crm-text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--crm-text-muted)" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={CHART_TIP} cursor={{ fill: "rgba(124,58,237,0.06)" }} />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {workloadBar.map((d) => (
                    <Cell key={d.name} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </RechartsBox>
          )}
        </div>
      ),
    },
    {
      id: "rating",
      label: "Last month",
      shortLabel: "Stars",
      accent: "#D97706",
      content: (
        <div className="p-4 sm:p-5 flex flex-col h-full min-h-0">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={16} className="text-amber-500" />
            <div>
              <h2 className="font-bold text-crm-text text-sm">Your rating</h2>
              <p className="text-[11px] text-crm-text-faint">{prevMonthLabel || "Previous month"}</p>
            </div>
          </div>
          {loading ? (
            <div className="flex-1 bg-crm-border-subtle/40 rounded-2xl animate-pulse" />
          ) : !prevRating ? (
            <p className="text-sm text-crm-text-faint text-center py-10">No previous month rating yet.</p>
          ) : (
            <div className="rounded-2xl border border-amber-200/80 dark:border-amber-500/20 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-crm-surface p-4 flex-1">
              <div className="flex items-end gap-6">
                <div>
                  <p className="text-[10px] font-bold uppercase text-crm-text-faint">Marks</p>
                  <p className="text-3xl font-extrabold text-violet-700 tabular-nums leading-none mt-1">
                    {prevRating.marks || "—"}
                    <span className="text-sm text-crm-text-faint">/10</span>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-crm-text-faint">Stars</p>
                  <p className="text-lg text-amber-500 tracking-wide flex items-center gap-1 mt-1">
                    <Star size={14} className="fill-amber-400 text-amber-400" />
                    {starsDisplay(prevRating.stars)}
                  </p>
                </div>
              </div>
              {prevRating.remarks ? (
                <p className="text-xs text-crm-text-secondary mt-3 leading-relaxed line-clamp-4">{prevRating.remarks}</p>
              ) : null}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "recent",
      label: "Recent",
      shortLabel: "Live",
      accent: "#059669",
      span: "hero",
      content: (
        <div className="flex flex-col h-full min-h-0">
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-crm-border-subtle">
            <div>
              <h2 className="font-bold text-crm-text text-sm sm:text-base">Recent assignments</h2>
              <p className="text-[11px] text-crm-text-faint mt-0.5">Chief Estimator remarks sit next to each project</p>
            </div>
            <Link href="/estimator/my-projects" className="text-xs font-semibold text-[#7C3AED] hover:underline">
              View all
            </Link>
          </div>
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-left">
              <thead className={CSR_THEAD}>
                <tr>
                  <th className={`px-4 py-2.5 font-semibold ${PROJECT_TABLE_HEAD}`}>Code</th>
                  <th className={`px-4 py-2.5 font-semibold ${PROJECT_TABLE_HEAD}`}>Project</th>
                  <th className={`px-4 py-2.5 font-semibold ${PROJECT_TABLE_HEAD}`}>
                    <span className="inline-flex items-center gap-1"><MessageSquare size={11} /> TM remarks</span>
                  </th>
                  <th className={`px-4 py-2.5 font-semibold ${PROJECT_TABLE_HEAD}`}>Deadline</th>
                  <th className={`px-4 py-2.5 font-semibold ${PROJECT_TABLE_HEAD}`}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1, 2, 3, 4].map((i) => (
                    <tr key={i} className="border-t border-crm-border-subtle">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="h-4 bg-crm-muted rounded animate-pulse w-2/3" />
                      </td>
                    </tr>
                  ))
                ) : recent.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-crm-text-faint font-medium">
                      No assignments yet — technical will assign projects to you.
                    </td>
                  </tr>
                ) : (
                  recent.map((p) => (
                    <tr key={p.id} className="border-t border-crm-border-subtle hover:bg-violet-50/40 dark:hover:bg-violet-500/10 align-top">
                      <td className="px-4 py-3 text-xs font-semibold text-[#7C3AED] whitespace-nowrap">
                        {p.projectCode || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-crm-text max-w-[180px]">
                        <p className="truncate">{p.projectTitle || "Untitled"}</p>
                        {p.myAssignment?.manHours ? (
                          <p className="text-[10px] font-medium text-crm-text-faint mt-0.5">{p.myAssignment.manHours}h</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 min-w-[180px] max-w-[280px]">
                        <TmRemarksPreview
                          compact
                          technicalNotes={p.technicalNotes}
                          evaluationRemarks={p.myAssignment?.evaluationRemarks}
                          currentUserId={meId}
                        />
                      </td>
                      <td className="px-4 py-3 text-xs text-crm-text-secondary whitespace-nowrap">
                        {p.myAssignment?.deadline
                          ? new Date(p.myAssignment.deadline).toLocaleDateString()
                          : p.projectDeadline
                            ? new Date(p.projectDeadline).toLocaleDateString()
                            : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {p.myAssignment?.takeoffDone ? (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-500/15 px-2 py-0.5 rounded-lg">
                            DONE
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-500/15 px-2 py-0.5 rounded-lg">
                            PENDING
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      id: "remarks",
      label: "TM remarks",
      shortLabel: "Notes",
      accent: "#7C3AED",
      content: (
        <div className="p-4 sm:p-5 flex flex-col h-full min-h-0">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={16} className="text-[#7C3AED]" />
            <div>
              <h2 className="font-bold text-crm-text text-sm">Chief Estimator remarks</h2>
              <p className="text-[11px] text-crm-text-faint">Latest notes on your assignments</p>
            </div>
          </div>
          {loading ? (
            <div className="flex-1 bg-crm-border-subtle/40 rounded-2xl animate-pulse min-h-[140px]" />
          ) : remarksFeed.length === 0 ? (
            <p className="text-sm text-crm-text-faint text-center py-10">No remarks on recent projects yet.</p>
          ) : (
            <div className="space-y-2 overflow-auto flex-1 min-h-0 pr-0.5">
              {remarksFeed.slice(0, 4).map(({ project, evaluation, notes }) => (
                <Link
                  key={project.id}
                  href="/estimator/my-projects"
                  className="block rounded-xl border border-crm-border-subtle bg-[#FAFAFA] dark:bg-crm-muted px-3 py-2.5 hover:border-[#7C3AED]/35 transition-colors"
                >
                  <p className="text-[11px] font-bold text-[#7C3AED] truncate">
                    {project.projectCode || project.projectTitle || "Project"}
                  </p>
                  <p className="text-xs text-crm-text-secondary line-clamp-2 mt-0.5">
                    {evaluation || notes[0]?.text || "—"}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "go",
      label: "Open work",
      shortLabel: "Go",
      accent: "#0B84F3",
      content: (
        <div className="p-4 sm:p-5 h-full">
          <Link
            href="/estimator/my-projects"
            className="group h-full min-h-[140px] rounded-2xl p-4 border border-crm-border-subtle bg-[#FAFAFA] dark:bg-crm-muted hover:border-[#7C3AED]/35 hover:shadow-md transition-all flex flex-col"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-500/15 text-[#7C3AED] flex items-center justify-center">
                <FolderKanban size={18} />
              </div>
              <ArrowRight size={16} className="text-crm-text-faint group-hover:text-[#7C3AED] group-hover:translate-x-0.5 transition-all" />
            </div>
            <h3 className="mt-3 font-bold text-crm-text text-sm sm:text-base">My Projects</h3>
            <p className="text-[11px] sm:text-xs text-crm-text-faint mt-0.5 leading-relaxed">
              Timers, deadlines, takeoff, and Chief Estimator remarks on every row.
            </p>
          </Link>
        </div>
      ),
    },
  ], [loading, statusPie, workloadBar, prevRating, prevMonthLabel, recent, meId, remarksFeed]);

  return (
    <EstimatorPageShell>
      <div className={STAFF_PAGE_PAD}>
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-[28px] font-bold text-crm-text tracking-tight">
                Estimator Dashboard
              </h1>
            <p className="text-xs sm:text-sm text-crm-text-muted mt-0.5 sm:mt-1">
              Assigned work · takeoff · Chief Estimator remarks
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
            className="h-10 sm:h-11 px-4 sm:px-5 rounded-xl border border-crm-border bg-crm-surface text-sm font-semibold text-crm-text-secondary inline-flex items-center justify-center gap-2 hover:border-[#7C3AED]/40 hover:text-[#7C3AED] hover:bg-violet-50 dark:hover:bg-violet-500/10 disabled:opacity-60 shadow-sm w-full sm:w-auto shrink-0"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              {loading ? "Refreshing…" : "Refresh stats"}
            </button>
          </header>

          <section aria-label="Quick stats">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
            {cards.map((c) => (
                <div
                  key={c.label}
                  className={`bg-gradient-to-br ${c.from} ${c.to} rounded-xl sm:rounded-2xl p-3 sm:p-4 text-white shadow-md flex flex-col gap-2 sm:gap-2.5 min-h-[96px] sm:min-h-[108px]`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-white/75 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider leading-snug">
                      {c.label}
                    </span>
                    <span className="w-6 h-6 sm:w-7 sm:h-7 bg-white/20 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
                      <c.icon size={15} />
                    </span>
                  </div>
                  {loading ? (
                    <div className="h-7 sm:h-8 w-12 sm:w-14 bg-white/25 rounded-lg animate-pulse" />
                  ) : (
                    <span className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight leading-none tabular-nums">
                      {c.value.toLocaleString()}
                    </span>
                  )}
                  <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden mt-auto">
                    <div className="h-full bg-white/60 rounded-full" style={{ width: c.bar }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

        <UploadActionBento
          title="Overview board"
          subtitle="Tap a capsule to focus a tile — Chief Estimator remarks sit next to every project."
          replayLabel="Replay layout"
          items={bentoItems}
        />
              </div>
    </EstimatorPageShell>
  );
}
