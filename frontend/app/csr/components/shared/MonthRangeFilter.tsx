"use client";

import { CalendarDays, X } from "lucide-react";

interface MonthRangeFilterProps {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onClear?: () => void;
  className?: string;
}

export default function MonthRangeFilter({
  from, to, onFromChange, onToChange, onClear, className = "",
}: MonthRangeFilterProps) {
  const active = from || to;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 sm:gap-2 ${className}`}>
      <CalendarDays size={13} className="text-gray-400 shrink-0 hidden sm:block" />
      <input
        type="month"
        value={from}
        onChange={e => onFromChange(e.target.value)}
        title="From month"
        className={`h-9 sm:h-[40px] rounded-xl sm:rounded-2xl border px-2 sm:px-3 text-xs sm:text-[13px] outline-none transition-colors min-w-[120px] ${
          from ? "border-[#1B6FE8] bg-[#EAF2FE] text-[#1B6FE8]" : "border-gray-200 bg-[#FAFAFA] text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        }`}
      />
      <span className="text-gray-400 text-xs">to</span>
      <input
        type="month"
        value={to}
        onChange={e => onToChange(e.target.value)}
        title="To month"
        className={`h-9 sm:h-[40px] rounded-xl sm:rounded-2xl border px-2 sm:px-3 text-xs sm:text-[13px] outline-none transition-colors min-w-[120px] ${
          to ? "border-[#1B6FE8] bg-[#EAF2FE] text-[#1B6FE8]" : "border-gray-200 bg-[#FAFAFA] text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        }`}
      />
      {active && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="h-9 w-9 rounded-xl border border-gray-200 bg-[#FAFAFA] text-gray-500 hover:text-[#1B6FE8] flex items-center justify-center dark:border-gray-600 dark:bg-gray-800"
          title="Clear month filter"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
