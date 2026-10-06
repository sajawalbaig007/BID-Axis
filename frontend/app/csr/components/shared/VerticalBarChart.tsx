"use client";

import { useMemo } from "react";

export interface BarItem {
  label: string;
  value: number;
  color: string;
  subLabel?: string;
}

interface VerticalBarChartProps {
  title: string;
  subtitle: string;
  items: BarItem[];
  loading?: boolean;
  totalLabel?: string;
}

export default function VerticalBarChart({
  title, subtitle, items, loading, totalLabel,
}: VerticalBarChartProps) {
  const total  = useMemo(() => items.reduce((s, i) => s + i.value, 0), [items]);
  const maxVal = useMemo(() => Math.max(...items.map(i => i.value), 1), [items]);

  return (
    <div className="bg-white rounded-2xl sm:rounded-[28px] p-4 sm:p-5 lg:p-6 shadow-sm border border-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base sm:text-[18px] font-bold text-[#0F172A] truncate">{title}</h3>
          <p className="text-gray-500 mt-0.5 text-xs sm:text-[13px] leading-snug">{subtitle}</p>
        </div>
        {!loading && total > 0 && (
          <div className="shrink-0 text-right">
            <span className="text-2xl sm:text-3xl font-bold text-[#0F172A]">{total}</span>
            <p className="text-[10px] sm:text-[11px] text-gray-400 mt-0.5">{totalLabel ?? "Total"}</p>
          </div>
        )}
      </div>

      {loading ? (
        <div className="mt-5 sm:mt-7 flex items-end justify-around gap-2 sm:gap-3 h-28 sm:h-36">
          {[40, 65, 50, 80].map((h, i) => (
            <div
              key={i}
              className="flex-1 bg-gray-100 rounded-t-xl animate-pulse"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="flex items-center justify-center py-12 text-gray-400 text-sm mt-4">
          No data to display yet.
        </div>
      ) : (
        <>
          {/* Column bars */}
          <div className="mt-5 sm:mt-7 flex items-end gap-2 sm:gap-3 h-28 sm:h-36">
            {items.map(item => {
              const pct = maxVal > 0 ? (item.value / maxVal) * 100 : 0;
              return (
                <div key={item.label} className="flex-1 flex flex-col items-center justify-end gap-1">
                  {item.value > 0 && (
                    <span
                      className="text-[10px] sm:text-[11px] font-bold leading-none"
                      style={{ color: item.color }}
                    >
                      {item.value}
                    </span>
                  )}
                  <div
                    className="w-full rounded-t-lg sm:rounded-t-xl transition-all duration-700"
                    style={{
                      height: `${Math.max(pct, item.value > 0 ? 6 : 0)}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Labels row */}
          <div className="flex gap-2 sm:gap-3 mt-2">
            {items.map(item => (
              <div key={item.label} className="flex-1 text-center min-w-0">
                <p className="text-[9px] sm:text-[10px] font-semibold text-gray-600 leading-tight truncate">
                  {item.label}
                </p>
                {item.subLabel && (
                  <p className="text-[8px] sm:text-[9px] text-gray-400 mt-0.5 truncate">
                    {item.subLabel}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Legend + percentage row */}
          <div className="mt-3 sm:mt-4 pt-3 border-t border-[#F1F2F6] flex flex-wrap gap-x-3 sm:gap-x-4 gap-y-1.5">
            {items.map(item => {
              const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
              return (
                <div key={item.label} className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[10px] sm:text-[11px] text-gray-500">
                    {item.label}:{" "}
                    <b className="text-[#0F172A]">{item.value}</b>
                    <span className="text-gray-400 ml-1">({pct}%)</span>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
