"use client";

import { Database } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, Tooltip,
  CartesianGrid, YAxis, Legend, PieChart, Pie, Cell,
} from "recharts";

const STATUS_PIE_COLORS: Record<string, string> = {
  "Not Interested":     "#64748B",
  "Not Picked":         "#F59E0B",
  "No Owner Available": "#CA8A04",
  "Not In Service":     "#8B5CF6",
  "In House":           "#A855F7",
  "Pending":            "#3B82F6",
  "Important":          "#EF4444",
  "Schedule Call":      "#0EA5E9",
  "Interested":         "#F97316",
  "Close Client":       "#12B76A",
};

type ChartPoint = { day: string; calls: number; completed: number };
type PiePoint = { name: string; value: number };

export default function ReportCharts({
  chartData,
  statusPieData,
  chartPeriodLabel,
  pieSubtitle,
}: {
  chartData: ChartPoint[];
  statusPieData: PiePoint[];
  chartPeriodLabel: string;
  pieSubtitle: string;
}) {
  const barEmpty = chartData.length === 0 || chartData.every(d => d.calls === 0);
  const pieEmpty = statusPieData.length === 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
      <div className="min-w-0">
        <div className="mb-3 sm:mb-5">
          <h2 className="text-base sm:text-lg font-bold text-[#111827]">Overall Performance</h2>
          <p className="mt-0.5 text-xs sm:text-sm text-gray-400">{chartPeriodLabel}</p>
        </div>
        <div className="h-[220px] sm:h-[260px] lg:h-[280px] min-w-0">
          {barEmpty ? (
            <div className="h-full flex flex-col items-center justify-center">
              <Database size={32} className="text-gray-200 mb-2 sm:mb-3 sm:w-9 sm:h-9" />
              <p className="font-semibold text-gray-400 text-xs sm:text-sm">No data for this period</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  contentStyle={{ borderRadius: "12px", border: "1px solid #eee", fontSize: "12px" }}
                  formatter={(v, n) => [v, n === "calls" ? "Total Leads" : "Completed (status updates)"]}
                />
                <Legend formatter={v => v === "calls" ? "Total Leads" : "Completed (updates)"} wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="calls" fill="#1B6FE8" radius={[5, 5, 0, 0]} name="calls" />
                <Bar dataKey="completed" fill="#12B76A" radius={[5, 5, 0, 0]} name="completed" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-3 sm:mb-5">
          <h2 className="text-base sm:text-lg font-bold text-[#111827]">Status Distribution</h2>
          <p className="mt-0.5 text-xs sm:text-sm text-gray-400">{pieSubtitle}</p>
        </div>
        <div className="h-[220px] sm:h-[260px] lg:h-[280px] min-w-0">
          {pieEmpty ? (
            <div className="h-full flex flex-col items-center justify-center">
              <Database size={32} className="text-gray-200 mb-2 sm:mb-3 sm:w-9 sm:h-9" />
              <p className="font-semibold text-gray-400 text-xs sm:text-sm">No status data for this period</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie
                  data={statusPieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius="72%"
                  paddingAngle={2}
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {statusPieData.map(entry => (
                    <Cell key={entry.name} fill={STATUS_PIE_COLORS[entry.name] ?? "#1B6FE8"} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0];
                    return (
                      <div className="bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-md text-xs">
                        <p className="font-semibold text-gray-800">{item.name}</p>
                        <p className="text-[#1B6FE8] font-bold mt-0.5">Count: {item.value}</p>
                      </div>
                    );
                  }}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "11px", lineHeight: "1.6" }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
