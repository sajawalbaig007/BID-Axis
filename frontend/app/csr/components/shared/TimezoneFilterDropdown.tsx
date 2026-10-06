"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Clock, X } from "lucide-react";
import { TIMEZONE_FILTER_OPTIONS, tzBadgeClass } from "../../constants/timezoneAbbr";

interface TimezoneFilterDropdownProps {
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
  fullWidth?: boolean;
}

export default function TimezoneFilterDropdown({ value, onChange, compact = false, fullWidth = false }: TimezoneFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = TIMEZONE_FILTER_OPTIONS.find(o => o.abbr === value);

  const select = (abbr: string) => {
    onChange(abbr);
    setOpen(false);
  };

  const clear = () => onChange("");

  return (
    <div className={`relative ${fullWidth ? "w-full min-w-0" : ""}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`px-3 sm:px-4 rounded-xl sm:rounded-2xl border flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium transition-colors ${fullWidth ? "h-10 sm:h-[42px] w-full min-w-0" : compact ? "h-10 sm:h-[42px] min-w-[120px] sm:min-w-[148px]" : "h-10 sm:h-[42px] min-w-[150px] sm:min-w-[190px]"} ${
          value
            ? "border-[#1B6FE8] bg-[#EAF2FE] text-[#1B6FE8]"
            : "border-gray-200 dark:border-crm-border bg-[#FAFAFA] dark:bg-crm-input text-gray-600 dark:text-crm-text-secondary hover:border-gray-300 dark:hover:border-crm-border"
        }`}
      >
        <Clock size={12} className={`shrink-0 sm:w-[14px] sm:h-[14px] ${value ? "text-[#1B6FE8]" : "text-gray-400"}`} />
        <span className="flex-1 text-left truncate text-[12px] sm:text-[13px]">
          {selected ? (compact ? selected.abbr : `${selected.abbr} · ${selected.label}`) : (compact ? "Phone TZ" : "Phone TZ (ET/CT/MT/PT)")}
        </span>
        {value ? (
          <span
            role="button"
            onClick={e => { e.stopPropagation(); clear(); }}
            className="ml-1 text-[#1B6FE8] hover:text-[#0E4FBE] shrink-0"
          >
            <X size={12} className="sm:w-[13px] sm:h-[13px]" />
          </span>
        ) : (
          <ChevronDown size={12} className="text-gray-400 shrink-0 sm:w-[13px] sm:h-[13px]" />
        )}
      </button>

      {open && (
        <div className={`bg-white dark:bg-crm-surface rounded-xl sm:rounded-2xl border border-gray-100 dark:border-crm-border overflow-hidden ${fullWidth ? "relative mt-1 w-full shadow-sm" : "absolute top-full mt-1 right-0 z-[80] w-[240px] sm:w-[270px] shadow-2xl"}`}>
          <div className="px-3 py-2 border-b border-gray-100 dark:border-crm-border bg-[#FAFAFB] dark:bg-crm-surface-raised">
            <p className="text-[10px] font-bold text-gray-400 dark:text-crm-text-muted uppercase tracking-wider">Phone area code → timezone</p>
          </div>
          <div className="py-1">
            {TIMEZONE_FILTER_OPTIONS.map(opt => (
              <button
                key={opt.abbr}
                type="button"
                onClick={() => select(opt.abbr)}
                className={`w-full text-left px-3 sm:px-4 py-2.5 flex items-start gap-2.5 transition-colors hover:bg-[#EAF2FE] dark:hover:bg-crm-brand-soft ${
                  value === opt.abbr ? "bg-[#EAF2FE] dark:bg-crm-brand-soft" : ""
                }`}
              >
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold border shrink-0 mt-0.5 ${tzBadgeClass(opt.abbr)}`}>
                  {opt.abbr}
                </span>
                <span className="min-w-0">
                  <span className={`block text-[12px] sm:text-[13px] font-semibold ${value === opt.abbr ? "text-[#1B6FE8]" : "text-[#0F172A] dark:text-crm-text"}`}>
                    {opt.label}
                  </span>
                  <span className="block text-[10px] text-gray-400 mt-0.5">{opt.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
