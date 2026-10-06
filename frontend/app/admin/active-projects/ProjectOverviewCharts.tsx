"use client";

import { Calendar, FolderKanban, Wallet } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

const PHASE_META: Record<string, { label: string; color: string }> = {
  not_started:       { label: "Not Started",          color: "#64748B" },
  takeoff_started:   { label: "Takeoff Started",      color: "#3B82F6" },
  takeoff_completed: { label: "Takeoff Completed",    color: "#6366F1" },
  pricing_phase:     { label: "Pricing Phase",        color: "#F59E0B" },
  pricing_with_qa:   { label: "Pricing · With QA",    color: "#EC4899" },
  pricing_without_qa:{ label: "Pricing · Without QA", color: "#F97316" },
  qa_phase:          { label: "QA Phase",             color: "#8B5CF6" },
  delivery_phase:    { label: "Delivery Phase",       color: "#10B981" },
};

const FALLBACK_COLORS = ["#1B6FE8", "#0B84F3", "#0F172A", "#14B8A6", "#E11D48"];

function titleCaseKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function phaseMeta(key: string, name?: string) {
  return PHASE_META[key] ?? {
    label: name && !name.includes("_") ? name : titleCaseKey(key),
    color: FALLBACK_COLORS[Math.abs(key.split("").reduce((n, c) => n + c.charCodeAt(0), 0)) % FALLBACK_COLORS.length],
  };
}

export type PhasePieItem = { name: string; value: number; key: string };
export type OverviewStats = { total: number; withBudget: number; thisMonth: number };

function pct(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export default function ProjectOverviewCharts({
  loading,
  stats,
  phasePieData,
}: {
  loading: boolean;
  stats: OverviewStats;
  phasePieData: PhasePieItem[];
}) {
  const phaseTotal = phasePieData.reduce((n, s) => n + s.value, 0);
  const monthShare = pct(stats.thisMonth, stats.total);
  const budgetShare = pct(stats.withBudget, stats.total);

  const kpis = [
    {
      label: "Total projects",
      value: stats.total,
      hint: "All CSR projects in the DB",
      icon: FolderKanban,
      wrap: "from-[#1B6FE8] to-[#8c0d22]",
      iconBg: "bg-white/10",
      iconColor: "text-white",
      valueCls: "text-white",
      hintCls: "text-white/55",
      bar: null as number | null,
      barColor: "#fff",
    },
    {
      label: "Added this month",
      value: stats.thisMonth,
      hint: `${monthShare}% of the current list`,
      icon: Calendar,
      wrap: "from-[#EFF6FF] to-white",
      iconBg: "bg-[#0B84F3]/10",
      iconColor: "text-[#0B84F3]",
      valueCls: "text-[#0B84F3]",
      hintCls: "text-slate-400",
      bar: monthShare,
      barColor: "#0B84F3",
    },
    {
      label: "With budget",
      value: stats.withBudget,
      hint: `${budgetShare}% have a quoted amount`,
      icon: Wallet,
      wrap: "from-[#ECFDF5] to-white",
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600",
      valueCls: "text-emerald-600",
      hintCls: "text-slate-400",
      bar: budgetShare,
      barColor: "#10B981",
    },
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-5 lg:gap-6 items-stretch">
      <div className="min-w-0 flex flex-col">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Overview</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-2.5 flex-1">
          {kpis.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${s.wrap} p-3.5 sm:p-4 h-full ${
                  s.wrap.includes("[#1B6FE8]") ? "border border-[#1B6FE8]/30" : "border border-slate-200/70"
                }`}
              >
                <div className="flex items-start gap-3 w-full">
                  <span className={`w-9 h-9 rounded-xl ${s.iconBg} ${s.iconColor} inline-flex items-center justify-center shrink-0`}>
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${s.hintCls}`}>{s.label}</p>
                    {loading ? (
                      <div className="mt-1 h-7 w-14 bg-white/20 rounded-md animate-pulse" />
                    ) : (
                      <p className={`text-2xl font-extrabold tabular-nums leading-tight ${s.valueCls}`}>{s.value}</p>
                    )}
                    <p className={`text-[11px] mt-0.5 ${s.hintCls}`}>{s.hint}</p>
                    {s.bar != null && (
                      <div className="mt-2 h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${s.bar}%`, backgroundColor: s.barColor }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="min-w-0 flex flex-col">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">By project phase</h2>
          {!loading && phaseTotal > 0 && (
            <p className="text-[11px] font-semibold text-slate-400 tabular-nums">{phaseTotal} in pipeline</p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-3 sm:p-4 flex-1 flex flex-col min-h-0">
          <div className="flex flex-col sm:flex-row items-center gap-4 flex-1 min-h-0">
            <div className="relative shrink-0 h-[220px] w-[220px] sm:h-[240px] sm:w-[240px]">
              {loading ? (
                <div className="h-full w-full rounded-full bg-slate-100 animate-pulse" />
              ) : phasePieData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-gray-400">
                  No project phase data
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie
                        data={phasePieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={68}
                        outerRadius={102}
                        paddingAngle={3}
                        stroke="#fff"
                        strokeWidth={3}
                      >
                        {phasePieData.map((entry) => (
                          <Cell key={entry.key} fill={phaseMeta(entry.key, entry.name).color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const item = payload[0];
                          const key = String((item.payload as PhasePieItem)?.key ?? "");
                          const meta = phaseMeta(key, String(item.name ?? ""));
                          const share = pct(Number(item.value) || 0, phaseTotal);
                          return (
                            <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-xs">
                              <p className="font-bold text-slate-800">{meta.label}</p>
                              <p className="font-extrabold mt-0.5 tabular-nums" style={{ color: meta.color }}>
                                {item.value} · {share}%
                              </p>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-2xl font-extrabold text-[#1B6FE8] tabular-nums leading-none">{phaseTotal}</p>
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400 mt-1">Phases</p>
                  </div>
                </>
              )}
            </div>
            <div className="flex-1 w-full min-w-0 self-stretch flex flex-col justify-center gap-1.5 overflow-y-auto pr-0.5">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 rounded-xl bg-white border border-slate-100 animate-pulse" />
                ))
              ) : phasePieData.length === 0 ? (
                <p className="text-xs text-gray-400">No phases to display</p>
              ) : (
                phasePieData.map((s) => {
                  const meta = phaseMeta(s.key, s.name);
                  const share = pct(s.value, phaseTotal);
                  return (
                    <div key={s.key} className="rounded-xl bg-white border border-slate-100 px-3 py-2.5 flex-1 min-h-[48px] flex flex-col justify-center">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                        <p className="flex-1 min-w-0 text-[12px] font-semibold text-slate-700 truncate">{meta.label}</p>
                        <span className="text-[11px] font-bold text-slate-400 tabular-nums">{share}%</span>
                        <span className="text-sm font-extrabold tabular-nums w-7 text-right" style={{ color: meta.color }}>
                          {s.value}
                        </span>
                      </div>
                      <div className="mt-1.5 ml-[22px] h-1 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: meta.color }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
