"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast, { Toaster } from "react-hot-toast";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  Download,
  FileText,
  Hammer,
  LogIn,
  MessageSquareWarning,
  Pencil,
  Percent,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Timer,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import TechnicalPageShell from "../components/TechnicalPageShell";
import { STAFF_PAGE_PAD, BENTO_CARD } from "@/lib/staffPageLayout";
import EstimatorKpiEntryModal from "../components/EstimatorKpiEntryModal";
import KpiChartsBento, { type KpiChartRow, type KpiDeliveredPoint } from "../components/KpiChartsBento";
import {
  ESTIMATOR_KPI_FIELD_KEYS,
  ESTIMATOR_KPI_FIELD_META,
  createEstimatorKpiRecord,
  currentMonthValue,
  deleteEstimatorKpiRecord,
  fetchEstimatorKpiAuto,
  fetchEstimatorKpiRecords,
  formatKpiTimestamp,
  seedEstimatorKpiAuto,
  starsLabel,
  updateEstimatorKpiRecord,
  type EstimatorKpiAutoField,
  type EstimatorKpiAutoRow,
  type EstimatorKpiFieldKey,
  type EstimatorKpiRecord,
  type EstimatorKpiRosterItem,
} from "@/lib/estimatorKpiRecords";
import {
  downloadEstimatorKpiReport,
  kpiReportPeriodLabel,
  type KpiReportPeriod,
} from "@/lib/estimatorKpiReport";
import {
  fetchTechnicalMonitoring,
  formatLoggedHours,
  type TechnicalTeamMember,
} from "@/lib/technicalMonitoring";

type EditorState = {
  mode: "create" | "edit";
  estimatorId: string;
  estimatorName: string;
  fieldKey: EstimatorKpiFieldKey;
  record?: EstimatorKpiRecord | null;
  /** Prefill create modal from auto suggestion */
  draftValue?: string;
  draftNote?: string;
};

const FIELD_ICONS: Record<EstimatorKpiFieldKey, LucideIcon> = {
  projects_delivered: CheckCircle2,
  productivity: Timer,
  project_time_spent: ClipboardList,
  checkin_checkout: LogIn,
  retained_clients: Users,
  punctuality: Clock3,
  team_query_mistakes: MessageSquareWarning,
  trades_history: Hammer,
  final_remarks: FileText,
  marks_out_of_10: Percent,
  rating_stars: Star,
};
/** Find the latest record for a given field key */
function latestByField(records: EstimatorKpiRecord[], fieldKey: string) {
  return [...records]
    .filter((r) => r.fieldKey === fieldKey)
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())[0] ?? null;
}

const KPI_CHART_FIELDS: { key: Exclude<keyof KpiChartRow, "name" | "fullName">; label: string }[] = [
  { key: "projects_delivered", label: "Projects delivered" },
  { key: "productivity", label: "Productivity %" },
  { key: "retained_clients", label: "Retained clients" },
  { key: "punctuality", label: "Punctuality %" },
  { key: "team_query_mistakes", label: "Query mistakes" },
  { key: "marks_out_of_10", label: "Marks / 10" },
  { key: "rating_stars", label: "Rating / 5" },
];

const FIELD_BENTO_SPAN: Record<EstimatorKpiFieldKey, string> = {
  projects_delivered: "md:col-span-6",
  productivity: "md:col-span-6",
  project_time_spent: "md:col-span-8",
  checkin_checkout: "md:col-span-4",
  retained_clients: "md:col-span-4",
  punctuality: "md:col-span-4",
  team_query_mistakes: "md:col-span-4 md:row-span-2 min-h-[320px]",
  trades_history: "md:col-span-8",
  final_remarks: "md:col-span-12",
  marks_out_of_10: "md:col-span-6",
  rating_stars: "md:col-span-6",
};

type PeriodMode = "month" | "all" | "range";

function kpiNumeric(raw: string | undefined | null): number {
  if (!raw) return 0;
  const m = String(raw).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

export default function TechnicalKpiPage() {
  const [month, setMonth] = useState(currentMonthValue());
  const [estimators, setEstimators] = useState<EstimatorKpiRosterItem[]>([]);
  const [records, setRecords] = useState<EstimatorKpiRecord[]>([]);
  const [autoRows, setAutoRows] = useState<EstimatorKpiAutoRow[]>([]);
  const [teamLive, setTeamLive] = useState<TechnicalTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seedingId, setSeedingId] = useState<string | null>(null);
  /** Accordion: only one estimator open at a time */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [search, setSearch] = useState("");
  const [chartEstimatorId, setChartEstimatorId] = useState<string>("all");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [reportEstimatorId, setReportEstimatorId] = useState<string>("all");

  const reportPeriod: KpiReportPeriod = useMemo(() => {
    if (periodMode === "all") return { mode: "all" };
    if (periodMode === "range") return { mode: "range", from: rangeFrom, to: rangeTo };
    return { mode: "month", month };
  }, [periodMode, month, rangeFrom, rangeTo]);

  const load = useCallback(async () => {
    if (periodMode === "range" && (!rangeFrom || !rangeTo)) return;
    setLoading(true);
    try {
      const kpiOpts =
        periodMode === "all"
          ? {}
          : periodMode === "range"
            ? { from: rangeFrom, to: rangeTo }
            : { month };
      const [kpiRes, autoRes, monRes] = await Promise.all([
        fetchEstimatorKpiRecords(kpiOpts),
        periodMode === "month" ? fetchEstimatorKpiAuto(month).catch(() => null) : Promise.resolve(null),
        fetchTechnicalMonitoring().catch(() => null),
      ]);
      if (!kpiRes?.success) {
        throw new Error("KPI API returned unsuccessful");
      }
      setEstimators(Array.isArray(kpiRes.estimators) ? kpiRes.estimators : []);
      setRecords(Array.isArray(kpiRes.records) ? kpiRes.records : []);
      setAutoRows(periodMode === "month" && Array.isArray(autoRes?.estimators) ? autoRes!.estimators : []);
      setTeamLive(Array.isArray(monRes?.team) ? monRes!.team : []);
    } catch (err: unknown) {
      setEstimators([]);
      setRecords([]);
      setAutoRows([]);
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err as Error)?.message ||
        "Failed to load KPI records";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [month, periodMode, rangeFrom, rangeTo]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const liveByEstimator = useMemo(() => {
    const map = new Map<string, TechnicalTeamMember>();
    for (const m of teamLive) map.set(m.estimatorId, m);
    return map;
  }, [teamLive]);

  const recordsByEstimator = useMemo(() => {
    const map = new Map<string, EstimatorKpiRecord[]>();
    for (const r of records) {
      const list = map.get(r.estimatorId) ?? [];
      list.push(r);
      map.set(r.estimatorId, list);
    }
    return map;
  }, [records]);

  const allRoster = useMemo(() => {
    const byId = new Map<string, EstimatorKpiRosterItem>();
    for (const e of estimators) byId.set(e.id, e);
    for (const r of records) {
      if (!byId.has(r.estimatorId)) {
        byId.set(r.estimatorId, {
          id: r.estimatorId,
          name: r.estimatorName,
          code: "—",
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [estimators, records]);

  const roster = useMemo(() => {
    const scoped =
      chartEstimatorId === "all" ? allRoster : allRoster.filter((e) => e.id === chartEstimatorId);
    const needle = search.trim().toLowerCase();
    return scoped.filter(
      (e) => !needle || e.name.toLowerCase().includes(needle) || e.code.toLowerCase().includes(needle),
    );
  }, [allRoster, search, chartEstimatorId]);

  const monthStats = useMemo(() => {
    const withEntries = new Set(records.map((r) => r.estimatorId)).size;
    const rated = records.filter((r) => r.fieldKey === "rating_stars").length;
    const marked = records.filter((r) => r.fieldKey === "marks_out_of_10").length;
    return {
      estimators: estimators.length || roster.length,
      entries: records.length,
      withEntries,
      rated,
      marked,
    };
  }, [records, estimators.length, roster.length]);

  const autoByEstimator = useMemo(() => {
    const map = new Map<string, Map<EstimatorKpiFieldKey, EstimatorKpiAutoField>>();
    for (const row of autoRows) {
      const fields = new Map<EstimatorKpiFieldKey, EstimatorKpiAutoField>();
      for (const f of row.fields) fields.set(f.fieldKey, f);
      map.set(row.estimatorId, fields);
    }
    return map;
  }, [autoRows]);

  const chartRows = useMemo(() => {
    const pickValue = (estimatorId: string, key: EstimatorKpiFieldKey) => {
      const saved = latestByField(recordsByEstimator.get(estimatorId) ?? [], key);
      if (saved?.value) return kpiNumeric(saved.value);
      const auto = autoByEstimator.get(estimatorId)?.get(key)?.value;
      return kpiNumeric(auto);
    };
    const list =
      chartEstimatorId === "all"
        ? allRoster
        : allRoster.filter((e) => e.id === chartEstimatorId);
    return list.map((e): KpiChartRow => {
      const row: KpiChartRow = {
        name: e.name.split(" ")[0] || e.name,
        fullName: e.name,
        projects_delivered: 0,
        productivity: 0,
        retained_clients: 0,
        punctuality: 0,
        team_query_mistakes: 0,
        marks_out_of_10: 0,
        rating_stars: 0,
      };
      for (const f of KPI_CHART_FIELDS) row[f.key] = pickValue(e.id, f.key);
      return row;
    });
  }, [allRoster, recordsByEstimator, autoByEstimator, chartEstimatorId]);

  const deliveredTimeline = useMemo((): KpiDeliveredPoint[] => {
    const merged = new Map<string, number>();
    const fromAuto = autoRows
      .filter((r) => chartEstimatorId === "all" || r.estimatorId === chartEstimatorId)
      .flatMap((r) => r.deliveredByDate ?? []);
    if (fromAuto.length > 0) {
      for (const p of fromAuto) merged.set(p.date, (merged.get(p.date) ?? 0) + p.count);
    } else {
      const bucket = periodMode === "all" ? "month" : "day";
      for (const r of records) {
        if (r.fieldKey !== "projects_delivered") continue;
        if (chartEstimatorId !== "all" && r.estimatorId !== chartEstimatorId) continue;
        const d = new Date(r.recordedAt);
        if (Number.isNaN(d.getTime())) continue;
        const key =
          bucket === "month"
            ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
            : d.toISOString().slice(0, 10);
        merged.set(key, (merged.get(key) ?? 0) + Math.max(0, kpiNumeric(r.value)));
      }
    }
    const points = [...merged.entries()].sort(([a], [b]) => a.localeCompare(b));
    const total = points.reduce((s, [, c]) => s + c, 0);
    return points.map(([date, count]) => {
      const isMonth = date.length === 7;
      const label = isMonth
        ? new Date(`${date}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
        : new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      return { label, count, pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 };
    });
  }, [autoRows, records, chartEstimatorId, periodMode]);

  const downloadReport = () => {
    if (periodMode === "range" && (!rangeFrom || !rangeTo)) {
      toast.error("Pick from and to dates for a range report.");
      return;
    }
    downloadEstimatorKpiReport({
      period: reportPeriod,
      estimators: allRoster,
      records,
      estimatorFilterId: reportEstimatorId === "all" ? undefined : reportEstimatorId,
    });
    toast.success("Report downloaded");
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const openCreate = (
    estimator: EstimatorKpiRosterItem,
    fieldKey: EstimatorKpiFieldKey,
    draft?: { value?: string; note?: string },
  ) => {
    setEditor({
      mode: "create",
      estimatorId: estimator.id,
      estimatorName: estimator.name,
      fieldKey,
      record: null,
      draftValue: draft?.value,
      draftNote: draft?.note,
    });
  };

  const openEdit = (estimator: EstimatorKpiRosterItem, fieldKey: EstimatorKpiFieldKey, record: EstimatorKpiRecord) => {
    setEditor({
      mode: "edit",
      estimatorId: estimator.id,
      estimatorName: estimator.name,
      fieldKey,
      record,
    });
  };

  const applyAutoField = async (
    estimator: EstimatorKpiRosterItem,
    fieldKey: EstimatorKpiFieldKey,
    auto: EstimatorKpiAutoField,
  ) => {
    if (!auto.value.trim()) return;
    setSaving(true);
    try {
      const res = await createEstimatorKpiRecord({
        estimatorId: estimator.id,
        estimatorName: estimator.name,
        fieldKey,
        value: auto.value,
        note: auto.note || "Auto-filled",
        recordedAt: new Date().toISOString(),
      });
      if (!res.success) throw new Error(res.message || "Create failed");
      toast.success("Auto value saved (editable)");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auto-fill failed");
    } finally {
      setSaving(false);
    }
  };

  const seedEmptyForEstimator = async (estimatorId: string) => {
    setSeedingId(estimatorId);
    try {
      const res = await seedEstimatorKpiAuto({
        month,
        estimatorId,
        onlyEmpty: true,
      });
      toast.success(res.created > 0 ? `Auto-filled ${res.created} field(s)` : "Nothing new to fill");
      await load();
    } catch {
      toast.error("Auto-fill failed");
    } finally {
      setSeedingId(null);
    }
  };

  const handleSave = async (payload: { value: string; note: string; recordedAt: string }) => {
    if (!editor) return;
    setSaving(true);
    try {
      if (editor.mode === "create") {
        const res = await createEstimatorKpiRecord({
          estimatorId: editor.estimatorId,
          estimatorName: editor.estimatorName,
          fieldKey: editor.fieldKey,
          value: payload.value,
          note: payload.note,
          recordedAt: payload.recordedAt,
        });
        if (!res.success) throw new Error(res.message || "Create failed");
        toast.success("Entry added");
      } else if (editor.record?.id) {
        const res = await updateEstimatorKpiRecord(editor.record.id, {
          value: payload.value,
          note: payload.note,
          recordedAt: payload.recordedAt,
        });
        if (!res.success) throw new Error(res.message || "Update failed");
        toast.success("Entry updated");
      }
      setEditor(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this KPI entry?")) return;
    try {
      await deleteEstimatorKpiRecord(id);
      toast.success("Entry deleted");
      await load();
    } catch {
      toast.error("Delete failed");
    }
  };

  const displayValue = (fieldKey: EstimatorKpiFieldKey, value: string) => {
    if (fieldKey === "rating_stars") return starsLabel(value);
    if (fieldKey === "marks_out_of_10") return `${value} / 10`;
    if (fieldKey === "productivity") {
      const n = String(value).replace(/%/g, "").trim();
      return n ? `${n}%` : value;
    }
    return value;
  };

  const liveHintFor = (estimatorId: string) => {
    const live = liveByEstimator.get(estimatorId);
    if (!live) return null;
    return `${formatLoggedHours(live.loggedSeconds)} logged · ${live.completed}/${live.assigned} done`;
  };

  const summaryCards = [
    {
      label: "Estimators",
      value: String(monthStats.estimators),
      hint: `${monthStats.withEntries} with entries`,
      icon: Users,
      tone: "from-[#0B84F3] to-[#0369A1]",
    },
    {
      label: "Month entries",
      value: String(monthStats.entries),
      hint: kpiReportPeriodLabel(reportPeriod),
      icon: ClipboardList,
      tone: "from-[#1B6FE8] to-[#0E4FBE]",
    },
    {
      label: "Marks logged",
      value: String(monthStats.marked),
      hint: "Out of 10 scores",
      icon: Percent,
      tone: "from-[#059669] to-[#047857]",
    },
    {
      label: "Star ratings",
      value: String(monthStats.rated),
      hint: "Out of 5 stars",
      icon: Star,
      tone: "from-[#D97706] to-[#B45309]",
    },
  ];

  return (
    <TechnicalPageShell bgClass="bg-[#EEF1F7] dark:bg-crm-bg-subtle">
      <Toaster position="top-right" />
        <div className={STAFF_PAGE_PAD}>
          {/* Hero header */}
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
                <div className="inline-flex items-center gap-2 rounded-full bg-[#EAF2FE] text-[#1B6FE8] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide mb-2">
                  <BarChart3 size={12} />
                  Estimator evaluation
                </div>
                <h1 className="text-xl sm:text-2xl md:text-[28px] font-bold text-[#0F172A] dark:text-crm-text tracking-tight">
                  KPI Dashboard
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 mt-1 max-w-xl">
                  Timers, check-in/out & delivery stats auto-fill — save them as editable entries, then export a report for one estimator or all.
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full lg:w-auto">
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { key: "month" as const, label: "Month" },
                    { key: "all" as const, label: "All time" },
                    { key: "range" as const, label: "From → To" },
                  ]).map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => {
                        setPeriodMode(p.key);
                        setExpandedId(null);
                      }}
                      className={`h-9 px-3 rounded-full text-[11px] font-bold border ${
                        periodMode === p.key
                          ? "bg-[#1B6FE8] text-white border-[#1B6FE8]"
                          : "bg-white text-gray-600 border-gray-200 hover:border-[#1B6FE8]/40"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  {periodMode === "month" ? (
                    <label className="flex items-center gap-2 h-10 sm:h-11 px-3 rounded-xl border border-gray-200 bg-white/90 text-sm font-semibold text-gray-700 shadow-sm">
                      <span className="text-[11px] text-gray-400 uppercase">Month</span>
                      <input
                        type="month"
                        value={month}
                        onChange={(e) => {
                          setMonth(e.target.value);
                          setExpandedId(null);
                        }}
                        className="outline-none bg-transparent text-sm font-semibold text-[#0F172A]"
                      />
                    </label>
                  ) : periodMode === "range" ? (
                    <>
                      <input
                        type="date"
                        value={rangeFrom}
                        onChange={(e) => setRangeFrom(e.target.value)}
                        className="h-10 sm:h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-[#0F172A] outline-none"
                      />
                      <input
                        type="date"
                        value={rangeTo}
                        onChange={(e) => setRangeTo(e.target.value)}
                        className="h-10 sm:h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-[#0F172A] outline-none"
                      />
                    </>
                  ) : (
                    <span className="h-10 sm:h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-500 inline-flex items-center">
                      All saved entries
                    </span>
                  )}
                  <select
                    value={reportEstimatorId}
                    onChange={(e) => setReportEstimatorId(e.target.value)}
                    className="h-10 sm:h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-[#0F172A] outline-none"
                    title="Report estimator"
                  >
                    <option value="all">Report: all estimators</option>
                    {allRoster.map((e) => (
                      <option key={e.id} value={e.id}>
                        Report: {e.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={downloadReport}
                    className="h-10 sm:h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 inline-flex items-center justify-center gap-2 hover:border-[#1B6FE8]/40 hover:text-[#1B6FE8] shadow-sm"
                  >
                    <Download size={15} />
                    Report
                  </button>
                  <Link
                    href="/technical/team"
                    className="h-10 sm:h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 inline-flex items-center justify-center hover:border-[#1B6FE8]/40 hover:text-[#1B6FE8] shadow-sm"
                  >
                    Open Team
                  </Link>
                  <button
                    type="button"
                    onClick={() => void load()}
                    disabled={loading}
                    className="h-10 sm:h-11 px-4 sm:px-5 rounded-xl bg-[#1B6FE8] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#a30f27] disabled:opacity-60 shadow-sm"
                  >
                    <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                    {loading ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
              </div>
            </div>
          </header>

          {/* Summary */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
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
                  {loading && records.length === 0 ? "…" : c.value}
                </span>
                <p className="text-[10px] sm:text-[11px] text-white/70 mt-auto">{c.hint}</p>
              </div>
            ))}
          </section>

          <section>
            <KpiChartsBento
              rows={chartRows}
              periodLabel={kpiReportPeriodLabel(reportPeriod)}
              deliveredTimeline={deliveredTimeline}
              toolbar={
                <select
                  value={chartEstimatorId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setChartEstimatorId(id);
                    if (id !== "all") setExpandedId(id);
                  }}
                  className="h-10 rounded-full border border-gray-200 bg-white px-3 text-sm font-semibold text-[#0F172A] outline-none min-w-[11rem] sm:w-56"
                >
                  <option value="all">All estimators</option>
                  {allRoster.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              }
            />
          </section>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
            <p className="text-xs text-gray-500 font-medium">
              {chartEstimatorId === "all"
                ? "Tap a card to open fields · previous card auto-collapses"
                : "Showing KPI fields for the selected estimator"}
            </p>
            {chartEstimatorId === "all" ? (
              <div className="relative w-full sm:w-72">
                <Users size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search estimator…"
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 bg-white text-sm text-[#0F172A] outline-none focus:border-[#1B6FE8] placeholder:text-gray-400 shadow-sm"
                />
              </div>
            ) : null}
          </div>

          <section className="space-y-3">
            {loading && roster.length === 0 ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse shadow-sm">
                  <div className="h-5 bg-gray-100 rounded w-1/3 mb-3" />
                  <div className="h-3 bg-gray-50 rounded w-2/3" />
                </div>
              ))
            ) : roster.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 px-4 py-14 text-center text-sm text-gray-400 font-medium">
                No estimators found. Add users with role Estimator in Admin Users.
              </div>
            ) : (
              roster.map((est) => {
                const open = expandedId === est.id;
                const live = liveByEstimator.get(est.id);
                const allRecords = recordsByEstimator.get(est.id) ?? [];
                const latestMarks = latestByField(allRecords, "marks_out_of_10");
                const latestStars = latestByField(allRecords, "rating_stars");
                const filledFields = ESTIMATOR_KPI_FIELD_KEYS.filter((k) =>
                  allRecords.some((r) => r.fieldKey === k),
                ).length;
                const fillPct = Math.round((filledFields / ESTIMATOR_KPI_FIELD_KEYS.length) * 100);

                return (
                  <article
                    key={est.id}
                    className={`rounded-2xl sm:rounded-3xl border shadow-sm overflow-hidden transition-all ${
                      open
                        ? "bg-white border-[#1B6FE8]/35 ring-1 ring-[#1B6FE8]/15 shadow-md"
                        : "bg-white border-gray-100 hover:border-[#1B6FE8]/20"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpand(est.id)}
                      className="w-full text-left px-4 sm:px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-xs shrink-0 shadow-sm ${
                            open
                              ? "bg-[#1B6FE8] text-white"
                              : "bg-gradient-to-br from-[#EAF2FE] to-[#FFE4E8] text-[#1B6FE8]"
                          }`}
                        >
                          {est.name
                            .split(" ")
                            .map((w) => w[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-[#0F172A] text-sm sm:text-base">{est.name}</h3>
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 px-2 py-0.5 rounded-md">
                              {est.code}
                            </span>
                            {latestMarks ? (
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg">
                                {latestMarks.value}/10
                              </span>
                            ) : null}
                            {latestStars ? (
                              <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg">
                                {starsLabel(latestStars.value)}
                              </span>
                            ) : null}
                            {live && live.overdue > 0 ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#1B6FE8] bg-[#EAF2FE] px-2 py-0.5 rounded-lg">
                                <AlertTriangle size={11} /> {live.overdue} overdue
                              </span>
                            ) : null}
                          </div>
                          <p className="text-[11px] sm:text-xs text-gray-500 mt-1">
                            {allRecords.length} entr{allRecords.length === 1 ? "y" : "ies"} · {filledFields}/
                            {ESTIMATOR_KPI_FIELD_KEYS.length} fields filled
                            {live ? (
                              <>
                                {" "}
                                · <Timer size={11} className="inline -mt-0.5" />{" "}
                                {formatLoggedHours(live.loggedSeconds)} track · {live.pending} pending
                              </>
                            ) : null}
                          </p>
                          <div className="mt-2 max-w-xs">
                            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[#1B6FE8]"
                                style={{ width: `${fillPct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div
                        className={`self-end sm:self-center w-9 h-9 rounded-xl border inline-flex items-center justify-center transition-colors ${
                          open
                            ? "bg-[#1B6FE8] border-[#1B6FE8] text-white"
                            : "bg-gray-50 border-gray-200 text-gray-500"
                        }`}
                      >
                        <ChevronDown
                          size={16}
                          className={`transition-transform ${open ? "rotate-180" : ""}`}
                        />
                      </div>
                    </button>

                    {open ? (
                      <div className="px-3 sm:px-5 pb-4 sm:pb-5">
                        <div className="rounded-2xl border border-gray-200 bg-[#F7F8FC] shadow-inner overflow-hidden">
                          <div className="px-3 sm:px-4 py-2.5 border-b border-gray-200/80 bg-white/80 flex items-center justify-between gap-2 sticky top-0 z-[1]">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                              KPI fields · auto + editable
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void seedEmptyForEstimator(est.id);
                                }}
                                disabled={seedingId === est.id}
                                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-violet-50 text-[#7C3AED] border border-violet-100 text-[11px] font-semibold hover:bg-violet-100 disabled:opacity-60"
                              >
                                <Sparkles size={12} />
                                {seedingId === est.id ? "Filling…" : "Auto-fill empty"}
                              </button>
                              <span className="text-[10px] font-semibold text-[#1B6FE8] bg-[#EAF2FE] px-2 py-0.5 rounded-md">
                                {kpiReportPeriodLabel(reportPeriod)}
                              </span>
                            </div>
                          </div>

                          <div className="max-h-[min(58vh,520px)] overflow-y-auto overscroll-contain p-3 sm:p-4 space-y-3 custom-kpi-scroll">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                              {ESTIMATOR_KPI_FIELD_KEYS.map((fieldKey) => {
                                const meta = ESTIMATOR_KPI_FIELD_META[fieldKey];
                                const Icon = FIELD_ICONS[fieldKey];
                                const fieldRecords = allRecords
                                  .filter((r) => r.fieldKey === fieldKey)
                                  .sort(
                                    (a, b) =>
                                      new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
                                  );
                                const hasEntries = fieldRecords.length > 0;
                                const auto = autoByEstimator.get(est.id)?.get(fieldKey) ?? null;
                                const showAuto = Boolean(auto?.auto && auto.value.trim());

                                return (
                                  <div
                                    key={fieldKey}
                                    className={`rounded-[1.5rem] border overflow-hidden bg-white shadow-sm flex flex-col h-full ${FIELD_BENTO_SPAN[fieldKey]} ${
                                      hasEntries ? "border-emerald-100" : "border-gray-200"
                                    }`}
                                  >
                                    <div className="px-3 py-2.5 flex items-start justify-between gap-2 bg-gradient-to-r from-white to-[#FAFBFC]">
                                      <div className="flex items-start gap-2.5 min-w-0">
                                        <div
                                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                            hasEntries
                                              ? "bg-emerald-50 text-emerald-700"
                                              : showAuto
                                                ? "bg-violet-50 text-[#7C3AED]"
                                                : "bg-[#EAF2FE] text-[#1B6FE8]"
                                          }`}
                                        >
                                          <Icon size={14} />
                                        </div>
                                        <div className="min-w-0">
                                          <h4 className="text-[13px] font-bold text-[#0F172A] leading-tight inline-flex items-center gap-1.5 flex-wrap">
                                            {meta.label}
                                            {showAuto ? (
                                              <span className="text-[9px] font-bold uppercase tracking-wide text-[#7C3AED] bg-violet-50 px-1.5 py-0.5 rounded">
                                                Auto
                                              </span>
                                            ) : null}
                                          </h4>
                                          {fieldKey === "productivity" && live ? (
                                            <p className="text-[10px] text-sky-700 mt-0.5">
                                              Track {formatLoggedHours(live.loggedSeconds)} · planned{" "}
                                              {live.plannedHours || 0}h
                                            </p>
                                          ) : meta.hint ? (
                                            <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">
                                              {meta.hint}
                                            </p>
                                          ) : null}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {showAuto && !hasEntries ? (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              void applyAutoField(est, fieldKey, auto!);
                                            }}
                                            disabled={saving}
                                            className="inline-flex items-center gap-1 h-8 px-2 rounded-lg bg-violet-50 text-[#7C3AED] border border-violet-100 text-[11px] font-semibold hover:bg-violet-100 disabled:opacity-60"
                                            title="Save auto value as editable entry"
                                          >
                                            <Sparkles size={12} />
                                            Use
                                          </button>
                                        ) : null}
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openCreate(
                                              est,
                                              fieldKey,
                                              showAuto
                                                ? { value: auto!.value, note: auto!.note }
                                                : undefined,
                                            );
                                          }}
                                          className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-[#1B6FE8] text-white text-[11px] font-semibold hover:bg-[#a30f27] shadow-sm"
                                        >
                                          <Plus size={13} />
                                          Add
                                        </button>
                                      </div>
                                    </div>

                                    {showAuto ? (
                                      <div className="px-3 py-2 border-t border-violet-50 bg-violet-50/40">
                                        <p className="text-[10px] font-bold uppercase tracking-wide text-[#7C3AED] mb-1">
                                          Live auto suggestion
                                        </p>
                                        <pre className="text-[11px] text-[#0F172A] whitespace-pre-wrap break-words font-sans leading-relaxed max-h-28 overflow-y-auto">
                                          {auto!.value}
                                        </pre>
                                      </div>
                                    ) : null}

                                    {fieldRecords.length === 0 ? (
                                      <div className="px-3 py-3 border-t border-dashed border-gray-100 flex-1 flex items-center justify-center min-h-[72px]">
                                        <p className="text-[11px] text-gray-400 text-center">
                                          {showAuto
                                            ? "Not saved yet — tap Use or Add (prefilled) to keep an editable row"
                                            : "Empty — tap Add to log with timestamp"}
                                        </p>
                                      </div>
                                    ) : (
                                      <ul className="divide-y divide-gray-50 border-t border-gray-50 flex-1">
                                        {fieldRecords.map((rec) => (
                                          <li
                                            key={rec.id}
                                            className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 hover:bg-[#FFF8F9]/70"
                                          >
                                            <div className="min-w-0">
                                              <div className="text-sm font-semibold text-[#0F172A] whitespace-pre-wrap break-words">
                                                {fieldKey === "rating_stars" ? (
                                                  <span className="inline-flex items-center gap-1.5 text-amber-600">
                                                    <Star size={14} className="fill-amber-400 text-amber-400" />
                                                    {displayValue(fieldKey, rec.value)}
                                                  </span>
                                                ) : (
                                                  displayValue(fieldKey, rec.value)
                                                )}
                                              </div>
                                              {rec.note ? (
                                                <p className="text-[11px] text-gray-500 mt-0.5">{rec.note}</p>
                                              ) : null}
                                              <p className="text-[10px] text-gray-400 mt-1 font-medium inline-flex items-center gap-1">
                                                <Clock3 size={10} />
                                                {formatKpiTimestamp(rec.recordedAt)}
                                                {rec.createdByName ? ` · ${rec.createdByName}` : ""}
                                              </p>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openEdit(est, fieldKey, rec);
                                                }}
                                                className="h-8 w-8 rounded-lg border border-gray-200 text-gray-600 inline-flex items-center justify-center hover:border-[#1B6FE8]/40 hover:text-[#1B6FE8] bg-white"
                                                title="Edit"
                                              >
                                                <Pencil size={13} />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  void handleDelete(rec.id);
                                                }}
                                                className="h-8 w-8 rounded-lg border border-gray-200 text-gray-600 inline-flex items-center justify-center hover:border-[#1B6FE8]/40 hover:text-[#1B6FE8] hover:bg-[#EAF2FE] bg-white"
                                                title="Delete"
                                              >
                                                <Trash2 size={13} />
                                              </button>
                                            </div>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
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

      {editor ? (
        <EstimatorKpiEntryModal
          open
          mode={editor.mode}
          fieldKey={editor.fieldKey}
          estimatorName={editor.estimatorName}
          initial={editor.record}
          draftValue={editor.draftValue}
          draftNote={editor.draftNote}
          liveHoursHint={
            editor.fieldKey === "productivity" || editor.fieldKey === "project_time_spent"
              ? liveHintFor(editor.estimatorId)
              : null
          }
          saving={saving}
          onClose={() => setEditor(null)}
          onSubmit={(payload) => void handleSave(payload)}
        />
      ) : null}

      <style jsx global>{`
        .custom-kpi-scroll {
          scrollbar-width: thin;
          scrollbar-color: #c4c9d4 transparent;
        }
        .custom-kpi-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .custom-kpi-scroll::-webkit-scrollbar-thumb {
          background: #c4c9d4;
          border-radius: 999px;
        }
        .custom-kpi-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>
    </TechnicalPageShell>
  );
}
