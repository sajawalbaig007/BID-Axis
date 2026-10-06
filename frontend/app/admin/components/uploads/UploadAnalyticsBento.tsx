"use client";

import { useMemo } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { Users, TrendingUp, Activity } from "lucide-react";
import RechartsBox from "@/app/components/charts/RechartsBox";

type SourceStats = {
  total: number;
  pending: number;
  important: number;
  interested: number;
  notPicked: number;
  projectWon: number;
  notInterested: number;
};

type SourceRow = {
  id: string;
  name: string;
  sudoName: string | null;
  stats: SourceStats;
};

type CsrDist = { name: string; leads: number };

type Props = {
  sources: SourceRow[];
  csrDistribution: CsrDist[];
  totalLeads: number;
  filesCount: number;
  distributedCount: number;
};

const DONUT_COLORS = ["#0B84F3", "#D97706", "#1B6FE8", "#B54708", "#10B981", "#94A3B8"];

function sourceLabel(s: SourceRow) {
  const label = s.sudoName ? `${s.name} · ${s.sudoName}` : s.name;
  return label.length > 12 ? `${label.slice(0, 12)}…` : label;
}

export default function UploadAnalyticsBento({
  sources,
  csrDistribution,
  totalLeads,
  filesCount,
  distributedCount,
}: Props) {
  const aggregated = useMemo(() => {
    const blank: SourceStats = {
      total: 0, pending: 0, important: 0, interested: 0,
      notPicked: 0, projectWon: 0, notInterested: 0,
    };
    for (const s of sources) {
      blank.total += s.stats.total;
      blank.pending += s.stats.pending;
      blank.important += s.stats.important;
      blank.interested += s.stats.interested;
      blank.notPicked += s.stats.notPicked;
      blank.projectWon += s.stats.projectWon;
      blank.notInterested += s.stats.notInterested;
    }
    return blank;
  }, [sources]);

  const donutData = useMemo(() => {
    const rows = [
      { name: "Pending", value: aggregated.pending, color: DONUT_COLORS[0] },
      { name: "Interested", value: aggregated.interested, color: DONUT_COLORS[1] },
      { name: "Important", value: aggregated.important, color: DONUT_COLORS[2] },
      { name: "Not picked", value: aggregated.notPicked, color: DONUT_COLORS[3] },
      { name: "Won", value: aggregated.projectWon, color: DONUT_COLORS[4] },
      { name: "Not interested", value: aggregated.notInterested, color: DONUT_COLORS[5] },
    ].filter((r) => r.value > 0);
    if (rows.length === 0) {
      return [{ name: "No data", value: 1, color: "#E5E7EB" }];
    }
    return rows;
  }, [aggregated]);

  const barData = useMemo(
    () =>
      sources.slice(0, 8).map((s) => ({
        name: sourceLabel(s),
        Pending: s.stats.pending,
        Interested: s.stats.interested,
        Important: s.stats.important,
        Won: s.stats.projectWon,
      })),
    [sources],
  );

  const maxCsr = Math.max(1, ...csrDistribution.map((c) => c.leads));

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 mb-5 sm:mb-7">
      {/* Donut */}
      <div className="md:col-span-4 rounded-[1.75rem] border border-gray-100 bg-white p-4 sm:p-5 shadow-sm relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-[#1B6FE8]/5 blur-2xl" />
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Lead mix</p>
            <h3 className="text-base font-bold text-[#0F172A]">Status donut</h3>
          </div>
          <Activity size={18} className="text-[#1B6FE8]" />
        </div>
        <RechartsBox height={200}>
          <PieChart>
            <Pie
              data={donutData}
              dataKey="value"
              nameKey="name"
              innerRadius={52}
              outerRadius={78}
              paddingAngle={3}
              strokeWidth={0}
            >
              {donutData.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 12, fontSize: 12, border: "1px solid #eee" }}
            />
          </PieChart>
        </RechartsBox>
        <div className="flex flex-wrap gap-1.5 justify-center mt-1">
          {donutData.filter((d) => d.name !== "No data").slice(0, 5).map((d) => (
            <span
              key={d.name}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-50 text-[10px] font-semibold text-gray-600"
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: d.color }} />
              {d.name}
            </span>
          ))}
        </div>
        <div className="mt-3 px-3 py-2 rounded-full bg-[#F8FAFC] border border-gray-100 flex items-center gap-2 text-[11px] font-semibold text-gray-600">
          <TrendingUp size={13} className="text-emerald-500" />
          {aggregated.total > 0
            ? `${aggregated.total.toLocaleString()} leads across ${sources.length} sources`
            : "Upload with a source to populate charts"}
        </div>
      </div>

      {/* Bar chart */}
      <div className="md:col-span-5 rounded-[1.75rem] border border-gray-100 bg-white p-4 sm:p-5 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">By source</p>
        <h3 className="text-base font-bold text-[#0F172A] mb-2">Pipeline bars</h3>
        {barData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">
            No source uploads yet
          </div>
        ) : (
          <RechartsBox height={210}>
            <BarChart data={barData} barGap={2} barCategoryGap="18%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="Pending" fill="#0B84F3" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Interested" fill="#D97706" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Important" fill="#1B6FE8" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Won" fill="#10B981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </RechartsBox>
        )}
      </div>

      {/* CSR distribution + mini KPIs */}
      <div className="md:col-span-3 flex flex-col gap-3 sm:gap-4">
        <div className="rounded-[1.75rem] bg-[#38BDF8] text-white p-4 sm:p-5 shadow-md shadow-sky-200/60 flex-1 min-h-[140px]">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">Pulse</p>
            <Users size={16} className="text-white/90" />
          </div>
          <p className="text-3xl font-bold mt-2 tabular-nums">{totalLeads}</p>
          <p className="text-xs text-white/85 mt-1">Total leads in latest batch</p>
          <div className="mt-4 flex gap-2">
            <span className="flex-1 rounded-2xl bg-white/20 backdrop-blur px-2.5 py-2 text-center">
              <p className="text-lg font-bold tabular-nums">{filesCount}</p>
              <p className="text-[9px] uppercase tracking-wide text-white/80">Files</p>
            </span>
            <span className="flex-1 rounded-2xl bg-white/20 backdrop-blur px-2.5 py-2 text-center">
              <p className="text-lg font-bold tabular-nums">{distributedCount}</p>
              <p className="text-[9px] uppercase tracking-wide text-white/80">Sent</p>
            </span>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-gray-100 bg-white p-4 shadow-sm flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">CSR split</p>
          <h3 className="text-sm font-bold text-[#0F172A] mb-3">Latest distribution</h3>
          {csrDistribution.length === 0 ? (
            <p className="text-xs text-gray-400">No distribution yet</p>
          ) : (
            <div className="space-y-2.5 max-h-40 overflow-y-auto pr-1">
              {csrDistribution.slice(0, 6).map((c) => (
                <div key={c.name}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-semibold text-gray-700 truncate max-w-[70%]">{c.name}</span>
                    <span className="tabular-nums font-bold text-[#1B6FE8]">{c.leads}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#1B6FE8] to-[#F43F5E] transition-all"
                      style={{ width: `${Math.max(8, (c.leads / maxCsr) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
