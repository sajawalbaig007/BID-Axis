"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import toast, { Toaster } from "react-hot-toast";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertTriangle, BarChart3, CheckCircle2, Clock3, Download, FileText,
  FolderKanban, GitBranch, Loader2, RefreshCw, Star, Target, Users,
} from "lucide-react";
import TechnicalPageShell from "../components/TechnicalPageShell";
import { STAFF_PAGE_PAD, BENTO_CARD } from "@/lib/staffPageLayout";
import RechartsBox from "@/app/components/charts/RechartsBox";
import { starsLabel } from "@/lib/estimatorKpiRecords";
import {
  currentReportMonth,
  downloadTechnicalWordReport,
  fetchTechnicalMonthlyReport,
  monthLabel,
  pipelineChartData,
  type TechnicalMonthlyReport,
} from "@/lib/technicalMonthlyReport";
import { formatLoggedHours, scoreTone } from "@/lib/technicalMonitoring";
import { peekAuthMe } from "@/lib/authMeCache";

const StaffAttendanceReport = dynamic(() => import("@/app/admin/reports/StaffAttendanceReport"), { ssr: false });
const CsrActivityReport = dynamic(() => import("@/app/admin/reports/CsrActivityReport"), {
  ssr: false,
  loading: () => (
    <div className="h-24 rounded-2xl bg-white dark:bg-crm-surface border border-gray-100 dark:border-crm-border animate-pulse" />
  ),
});

function kpiVal(report: TechnicalMonthlyReport, estimatorId: string, key: string): string {
  const row = report.kpiAuto.find((r) => r.estimatorId === estimatorId);
  return row?.fields.find((f) => f.fieldKey === key)?.value?.trim() ?? "";
}

export default function TechnicalReportsPage() {
  const bimDesk = peekAuthMe()?.role === "bim_manager";
  const [month, setMonth] = useState(currentReportMonth());
  const [report, setReport] = useState<TechnicalMonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTechnicalMonthlyReport(month);
      setReport(data);
    } catch {
      toast.error("Failed to load report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpi = report?.monitoring.kpi;
  const pipe = kpi?.pipeline;
  const sum = kpi?.summary;

  const pipelineData = useMemo(
    () => (kpi ? pipelineChartData(kpi) : []),
    [kpi],
  );

  const scoreChart = useMemo(
    () =>
      (kpi?.scoreboard ?? []).slice(0, 10).map((r) => ({
        name: r.name.split(" ")[0] ?? r.name,
        score: r.score,
        fullName: r.name,
      })),
    [kpi?.scoreboard],
  );

  const workloadPie = useMemo(() => {
    if (!sum) return [];
    return [
      { name: "Completed", value: sum.completedAssignments, fill: "#059669" },
      { name: "Pending", value: sum.pendingAssignments, fill: "#0B84F3" },
      { name: "Overdue", value: sum.overdueAssignments, fill: "#1B6FE8" },
    ].filter((d) => d.value > 0);
  }, [sum]);

  const kpiTable = useMemo(() => {
    if (!report) return [];
    return [...report.kpiAuto]
      .map((r) => ({
        id: r.estimatorId,
        name: r.name,
        code: r.code,
        marks: kpiVal(report, r.estimatorId, "marks_out_of_10"),
        stars: kpiVal(report, r.estimatorId, "rating_stars"),
        delivered: kpiVal(report, r.estimatorId, "projects_delivered"),
        retained: kpiVal(report, r.estimatorId, "retained_clients"),
        remarks: kpiVal(report, r.estimatorId, "final_remarks"),
        punctuality: kpiVal(report, r.estimatorId, "punctuality"),
      }))
      .filter((r) => r.marks || r.delivered || r.remarks)
      .sort((a, b) => Number(b.marks || 0) - Number(a.marks || 0));
  }, [report]);

  const saveWord = async () => {
    if (!report) return;
    setSaving(true);
    try {
      downloadTechnicalWordReport(report);
      toast.success("Word report downloaded");
    } catch {
      toast.error("Word export failed");
    } finally {
      setSaving(false);
    }
  };

  const summaryCards = [
    {
      label: "Pipeline",
      value: pipe ? String(pipe.total) : "—",
      hint: "Active projects",
      icon: FolderKanban,
      tone: "from-[#0B84F3] to-[#0369A1]",
    },
    {
      label: "Completion",
      value: sum ? `${sum.completionRate}%` : "—",
      hint: sum ? `${sum.completedAssignments} done` : "",
      icon: CheckCircle2,
      tone: "from-[#059669] to-[#047857]",
    },
    {
      label: "Overdue",
      value: sum ? String(sum.overdueAssignments) : "—",
      hint: "Assignments",
      icon: AlertTriangle,
      tone: "from-[#1B6FE8] to-[#0E4FBE]",
    },
    {
      label: "Revisions",
      value: report ? String(report.revisionsCount) : "—",
      hint: "In queue",
      icon: GitBranch,
      tone: "from-[#7C3AED] to-[#5B21B6]",
    },
    {
      label: "Logged",
      value: sum ? formatLoggedHours(sum.totalLoggedSeconds) : "—",
      hint: sum ? `${sum.plannedManHours}h planned` : "",
      icon: Clock3,
      tone: "from-[#D97706] to-[#B45309]",
    },
    {
      label: "Estimators",
      value: kpi ? String(kpi.scoreboard.length) : "—",
      hint: "With assignments",
      icon: Users,
      tone: "from-[#0F172A] to-[#334155]",
    },
  ];

  return (
    <TechnicalPageShell bgClass="bg-[#EEF1F7] dark:bg-crm-bg-subtle">
      <Toaster position="top-right" />

        <div className={STAFF_PAGE_PAD}>
          <header className={`relative overflow-hidden ${BENTO_CARD}`}>
            <div
              className="absolute inset-0 opacity-[0.55]"
              style={{
                background:
                  "radial-gradient(900px 240px at 0% 0%, rgba(184,17,45,0.12), transparent 55%), radial-gradient(700px 220px at 100% 0%, rgba(11,132,243,0.10), transparent 50%)",
              }}
            />
            <div className="relative px-4 sm:px-5 md:px-6 py-4 sm:py-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full bg-[#ECFDF5] text-[#15803D] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide mb-2">
                  <FileText size={12} />
                  Executive export
                </div>
                <h1 className="text-xl sm:text-2xl md:text-[28px] font-bold text-[#0F172A] dark:text-crm-text tracking-tight">
                  Technical Reports
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 mt-1 max-w-xl">
                  Full dashboard snapshot — pipeline, team workload, monthly KPI marks & ratings. Save to Word anytime.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
                <label className="flex items-center gap-2 h-10 sm:h-11 px-3 rounded-xl border border-gray-200 bg-white/90 text-sm font-semibold text-gray-700 shadow-sm">
                  <span className="text-[11px] text-gray-400 uppercase">KPI month</span>
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="outline-none bg-transparent text-sm font-semibold text-[#0F172A]"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={loading}
                  className="h-10 sm:h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 inline-flex items-center justify-center gap-2 hover:border-[#1B6FE8]/40 disabled:opacity-60 shadow-sm"
                >
                  <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => void saveWord()}
                  disabled={!report || saving || loading}
                  className="h-10 sm:h-11 px-4 sm:px-5 rounded-xl bg-[#15803D] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#166534] disabled:opacity-60 shadow-sm"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  Save to Word
                </button>
              </div>
            </div>
          </header>

          {bimDesk ? null : <StaffAttendanceReport scope="chief" />}
          <CsrActivityReport staffRole={bimDesk ? "bim" : "estimator"} allowEdit={false} defaultOpen />

          <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3">
            {summaryCards.map((c) => (
              <div
                key={c.label}
                className={`bg-gradient-to-br ${c.tone} rounded-xl sm:rounded-2xl p-3 sm:p-4 text-white shadow-md min-h-24 flex flex-col gap-1.5`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-white/75 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">
                    {c.label}
                  </span>
                  <span className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                    <c.icon size={14} />
                  </span>
                </div>
                <span className="text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums leading-none">
                  {loading && !report ? "…" : c.value}
                </span>
                <p className="text-[10px] sm:text-[11px] text-white/70 mt-auto">{c.hint}</p>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className={`${BENTO_CARD} p-4 sm:p-5`}>
              <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2 mb-1">
                <BarChart3 size={16} className="text-[#1B6FE8]" />
                Pipeline stages
              </h2>
              <p className="text-[11px] text-gray-400 mb-4">Live project distribution</p>
              <RechartsBox height={260}>
                <BarChart data={pipelineData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {pipelineData.map((e) => (
                      <Cell key={e.name} fill={e.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </RechartsBox>
            </div>

            <div className={`${BENTO_CARD} p-4 sm:p-5`}>
              <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2 mb-1">
                <Target size={16} className="text-[#1B6FE8]" />
                Assignment workload
              </h2>
              <p className="text-[11px] text-gray-400 mb-4">Completed vs pending vs overdue</p>
              <RechartsBox height={260}>
                <PieChart>
                  <Pie
                    data={workloadPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {workloadPie.map((e) => (
                      <Cell key={e.name} fill={e.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </RechartsBox>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className={`${BENTO_CARD} p-4 sm:p-5`}>
              <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2 mb-1">
                <Users size={16} className="text-[#1B6FE8]" />
                Estimator scoreboard
              </h2>
              <p className="text-[11px] text-gray-400 mb-4">Live performance score (0–100)</p>
              <RechartsBox height={280}>
                <BarChart data={scoreChart} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v, _n, p) => [`${v}`, (p?.payload as { fullName?: string })?.fullName ?? "Score"]} />
                  <Bar dataKey="score" fill="#1B6FE8" radius={[0, 6, 6, 0]} />
                </BarChart>
              </RechartsBox>
            </div>

            <div className={`${BENTO_CARD} p-4 sm:p-5`}>
              <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2 mb-1">
                <Star size={16} className="text-amber-500 fill-amber-400" />
                Monthly KPI marks — {monthLabel(month)}
              </h2>
              <p className="text-[11px] text-gray-400 mb-4">Auto marks & star ratings from KPI rules</p>
              <RechartsBox height={280}>
                <BarChart
                  data={kpiTable.slice(0, 10).map((r) => ({
                    name: r.name.split(" ")[0] ?? r.name,
                    marks: Number(r.marks) || 0,
                    fullName: r.name,
                  }))}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v, _n, p) => [`${v} / 10`, (p?.payload as { fullName?: string })?.fullName ?? "Marks"]} />
                  <Bar dataKey="marks" fill="#7C3AED" radius={[6, 6, 0, 0]} />
                </BarChart>
              </RechartsBox>
            </div>
          </div>

          <section className={`${BENTO_CARD} overflow-hidden`}>
            <div className="px-4 sm:px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-[#0F172A]">Monthly KPI ledger — {monthLabel(month)}</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">All fields auto-computed · editable on KPI Dashboard</p>
              </div>
              {report?.generatedAt ? (
                <p className="text-[10px] text-gray-400">
                  Live data as of {new Date(report.generatedAt).toLocaleString("en-GB")}
                </p>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead className="bg-[#F8FAFC] text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Estimator</th>
                    <th className="px-4 py-3 text-center">Delivered</th>
                    <th className="px-4 py-3 text-center">Retained</th>
                    <th className="px-4 py-3 text-center">Marks</th>
                    <th className="px-4 py-3 text-center">Rating</th>
                    <th className="px-4 py-3">Punctuality</th>
                    <th className="px-4 py-3">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    [1, 2, 3, 4].map((i) => (
                      <tr key={i}>
                        <td colSpan={7} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      </tr>
                    ))
                  ) : kpiTable.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                        No KPI data for {monthLabel(month)} — try another month or check assignments.
                      </td>
                    </tr>
                  ) : (
                    kpiTable.map((r) => {
                      const live = kpi?.scoreboard.find((s) => s.estimatorId === r.id);
                      return (
                        <tr key={r.id} className="hover:bg-[#FAFBFC]">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-sm text-[#0F172A]">{r.name}</div>
                            <div className="text-[10px] text-gray-400">{r.code}</div>
                            {live ? (
                              <span className={`inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${scoreTone(live.score)}`}>
                                Live {live.score}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-semibold tabular-nums">{r.delivered || "—"}</td>
                          <td className="px-4 py-3 text-center text-sm font-semibold tabular-nums">{r.retained || "—"}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center justify-center min-w-10 h-7 rounded-lg bg-violet-50 text-violet-700 text-sm font-bold tabular-nums">
                              {r.marks ? `${r.marks}/10` : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-amber-600 text-sm font-semibold">
                            {r.stars ? starsLabel(r.stars) : "—"}
                          </td>
                          <td className="px-4 py-3 text-[11px] text-gray-600 max-w-[140px]">{r.punctuality || "—"}</td>
                          <td className="px-4 py-3 text-[11px] text-gray-600 max-w-xs">{r.remarks || "—"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {kpi?.scoreboard.length ? (
            <section className={`${BENTO_CARD} overflow-hidden`}>
              <div className="px-4 sm:px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-bold text-[#0F172A]">Live team detail</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">Current assignment snapshot (included in Word export)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left">
                  <thead className="bg-[#F8FAFC] text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Estimator</th>
                      <th className="px-4 py-3 text-center">Assigned</th>
                      <th className="px-4 py-3 text-center">Done</th>
                      <th className="px-4 py-3 text-center">Pending</th>
                      <th className="px-4 py-3 text-center">Overdue</th>
                      <th className="px-4 py-3 text-center">Logged</th>
                      <th className="px-4 py-3 text-center">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {kpi.scoreboard.map((r) => (
                      <tr key={r.estimatorId} className="hover:bg-[#FAFBFC]">
                        <td className="px-4 py-3 font-semibold text-sm">{r.name}</td>
                        <td className="px-4 py-3 text-center text-sm tabular-nums">{r.assigned}</td>
                        <td className="px-4 py-3 text-center text-sm tabular-nums text-emerald-700">{r.completed}</td>
                        <td className="px-4 py-3 text-center text-sm tabular-nums">{r.pending}</td>
                        <td className="px-4 py-3 text-center text-sm tabular-nums text-[#1B6FE8]">{r.overdue}</td>
                        <td className="px-4 py-3 text-center text-sm tabular-nums">{formatLoggedHours(r.loggedSeconds)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-bold ${scoreTone(r.score)}`}>
                            {r.score}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
    </TechnicalPageShell>
  );
}
