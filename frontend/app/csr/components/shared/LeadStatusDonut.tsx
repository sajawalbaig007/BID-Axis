"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { getStatusChartData, getStatusChartDataFromStats } from "../../constants/statusChart";
import { Lead } from "../../types/lead";
import type { CsrStats } from "../../hooks/useCsrTabPage";
import ChartPieSide from "./ChartPieSide";
import { useMounted } from "@/lib/useMounted";

const DONUT_SIZE = 208;
const DONUT_INNER = 72;
const DONUT_OUTER = 104;

interface LeadStatusDonutProps {
  leads?: Lead[];
  stats?: CsrStats | null;
  loading?: boolean;
}

export default function LeadStatusDonut({ leads, stats, loading }: LeadStatusDonutProps) {
  const data  = useMemo(() => {
    if (stats) return getStatusChartDataFromStats(stats);
    return getStatusChartData(leads ?? []);
  }, [leads, stats]);
  const sliceTotal = useMemo(() => data.reduce((sum, slice) => sum + slice.value, 0), [data]);
  const total = stats?.totalAssigned ?? sliceTotal;
  const mounted = useMounted();

  return (
    <div className="bg-white dark:bg-crm-surface rounded-2xl sm:rounded-[28px] p-4 sm:p-5 lg:p-6 shadow-sm border border-white dark:border-crm-border">
      <div>
        <h3 className="text-base sm:text-[18px] font-bold text-[#0F172A] dark:text-crm-text">Lead Status Distribution</h3>
        <p className="text-gray-500 dark:text-crm-text-muted mt-0.5 text-xs sm:text-[13px]">Breakdown of all your assigned leads.</p>
      </div>

      {loading ? (
        <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-6 mt-4 sm:mt-6">
          <div className="w-48 h-48 sm:w-52 sm:h-52 lg:w-64 lg:h-64 rounded-full bg-gray-100 animate-pulse mx-auto lg:mx-0 shrink-0" />
          <div className="flex-1 min-w-0 flex flex-col gap-3 sm:gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="w-44 h-44 sm:w-52 sm:h-52 lg:w-56 lg:h-56 rounded-full bg-gray-100 animate-pulse mx-auto lg:mx-0 shrink-0" />
        </div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          No leads to display yet.
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-6 mt-4 sm:mt-6">
          <div className="relative w-48 h-48 sm:w-52 sm:h-52 lg:w-64 lg:h-64 mx-auto lg:mx-0 shrink-0 flex items-center justify-center" style={{ minWidth: DONUT_SIZE, minHeight: DONUT_SIZE }}>
            {mounted && (
              <PieChart width={DONUT_SIZE} height={DONUT_SIZE}>
                <Tooltip
                  formatter={(value, name) => [`${value} Leads`, name]}
                  contentStyle={{ borderRadius: "14px", border: "1px solid #eee", boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}
                />
                <Pie
                  data={data}
                  cx={DONUT_SIZE / 2}
                  cy={DONUT_SIZE / 2}
                  innerRadius={DONUT_INNER}
                  outerRadius={DONUT_OUTER}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {data.map(slice => (
                    <Cell key={slice.name} fill={slice.color} stroke="transparent" />
                  ))}
                </Pie>
              </PieChart>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl sm:text-4xl font-bold text-[#0F172A] dark:text-crm-text">{total}</span>
              <span className="text-[11px] sm:text-xs text-gray-500 dark:text-crm-text-muted mt-1">Total Leads</span>
              {stats?.totalAssigned != null && stats.totalAssigned !== total && (
                <span className="text-[10px] text-gray-400 mt-0.5">{stats.totalAssigned} assigned</span>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-3 sm:gap-4 lg:px-6 lg:border-x lg:border-gray-100 dark:lg:border-crm-border">
            {data.map(slice => {
              const pct = total > 0 ? Math.round((slice.value / total) * 100) : 0;
              return (
                <div key={slice.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: slice.color }} />
                      <p className="text-xs sm:text-[13px] font-medium text-gray-600 dark:text-crm-text-secondary truncate">{slice.name}</p>
                    </div>
                    <p className="text-xs sm:text-[13px] shrink-0">
                      <span className="font-bold text-[#0F172A] dark:text-crm-text">{slice.value}</span>
                      <span className="text-gray-400 dark:text-crm-text-faint ml-1.5">{pct}%</span>
                    </p>
                  </div>
                  <div className="h-2 rounded-full bg-[#F1F2F6] dark:bg-crm-muted overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: slice.color }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="shrink-0 flex justify-center lg:justify-end">
            <ChartPieSide data={data} title="Status Pie Chart" />
          </div>
        </div>
      )}
    </div>
  );
}
