"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useTheme } from "@/app/components/ThemeProvider";
import type { ClientLead } from "./PerformanceChart";

type Props = {
  leads?: ClientLead[];
  distribution?: Record<string, number>;
};

type Slice = { name: string; value: number; color: string };

const COLORS = ["#1B6FE8", "#F97316", "#14B8A6", "#6366F1", "#10B981", "#8B5CF6", "#EC4899", "#64748B"];

export default function OverviewChart({ leads = [], distribution }: Props) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const data = useMemo<Slice[]>(() => {
    if (distribution) {
      return Object.entries(distribution)
        .filter(([, v]) => v > 0)
        .map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }));
    }
    const counts: Record<string, number> = {
      Pending: 0, Important: 0, Interested: 0, "Close Client": 0, Closed: 0,
    };
    leads.forEach(l => {
      const s = l.status ?? "";
      if (s === "pending")          counts["Pending"]++;
      else if (s === "important")   counts["Important"]++;
      else if (s === "interested")  counts["Interested"]++;
      else if (s === "Close Client") counts["Close Client"]++;
      else if (["closed","completed","not completed","Not Interested","not picked"].includes(s))
        counts["Closed"]++;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }));
  }, [leads, distribution]);

  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  const tooltipBg = isDark ? "#1a1d24" : "#fff";
  const tooltipBorder = isDark ? "#2A303C" : "#eee";

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Pipeline</p>
        <h2 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-crm-text tracking-tight">Lead Overview</h2>
        <p className="text-xs text-gray-500 dark:text-crm-text-muted mt-0.5">Status mix · share of pipeline</p>
      </div>

      <div className="relative w-full max-w-[240px] mx-auto aspect-square my-2 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              formatter={(value, name) => [`${Number(value).toLocaleString()} leads`, name]}
              contentStyle={{
                borderRadius: "12px",
                border: `1px solid ${tooltipBorder}`,
                background: tooltipBg,
                fontSize: 12,
              }}
            />
            <Pie
              data={data.length ? data : [{ name: "Empty", value: 1, color: isDark ? "#2A303C" : "#E5E7EB" }]}
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={data.length > 1 ? 3 : 0}
              dataKey="value"
              stroke="transparent"
            >
              {(data.length ? data : [{ color: isDark ? "#2A303C" : "#E5E7EB" }]).map((item, i) => (
                <Cell key={i} fill={item.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total</p>
          <p className="text-2xl font-extrabold tabular-nums text-[#0F172A] dark:text-crm-text leading-none">
            {total.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="space-y-2 mt-auto min-h-0 overflow-auto">
        {data.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No pipeline data yet</p>
        ) : (
          data.map((item) => {
            const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
            return (
              <div key={item.name} className="min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <p className="text-xs font-semibold text-gray-600 dark:text-crm-text-secondary truncate">{item.name}</p>
                  </div>
                  <p className="text-xs font-bold tabular-nums text-[#0F172A] dark:text-crm-text shrink-0">
                    {item.value.toLocaleString()}
                    <span className="text-gray-400 font-semibold ml-1">{pct}%</span>
                  </p>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-crm-muted overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%`, backgroundColor: item.color }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
