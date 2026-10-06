"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, FileInput, Search, X } from "lucide-react";

interface SourceSudoFilterDropdownProps {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  compact?: boolean;
  fullWidth?: boolean;
}

export default function SourceSudoFilterDropdown({
  value,
  options,
  onChange,
  compact = false,
  fullWidth = false,
}: SourceSudoFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.toLowerCase().includes(q));
  }, [options, search]);

  const select = (name: string) => {
    onChange(name);
    setOpen(false);
    setSearch("");
  };

  const clear = () => {
    onChange("");
    setSearch("");
  };

  return (
    <div className={`relative ${fullWidth ? "w-full min-w-0" : ""}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`h-10 sm:h-[42px] px-3 sm:px-4 rounded-xl sm:rounded-2xl border text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2 transition-colors ${fullWidth ? "w-full min-w-0" : compact ? "min-w-[110px] sm:min-w-[132px]" : "min-w-[130px] sm:min-w-[160px]"} ${
          value
            ? "border-[#1B6FE8] bg-[#EAF2FE] text-[#1B6FE8]"
            : "border-gray-200 dark:border-crm-border bg-[#FAFAFA] dark:bg-crm-input text-gray-600 dark:text-crm-text-secondary hover:border-gray-300 dark:hover:border-crm-border"
        }`}
      >
        <FileInput size={12} className="shrink-0 sm:w-[14px] sm:h-[14px]" />
        <span className={`truncate ${fullWidth ? "flex-1 text-left" : compact ? "max-w-[72px] sm:max-w-[96px]" : "max-w-[100px] sm:max-w-[120px]"}`}>
          {value || (compact ? "Source" : "Source (sudo)")}
        </span>
        {value ? (
          <span
            role="button"
            onClick={e => { e.stopPropagation(); clear(); }}
            className="ml-auto text-[#1B6FE8] hover:text-[#0E4FBE] shrink-0"
          >
            <X size={12} className="sm:w-[13px] sm:h-[13px]" />
          </span>
        ) : (
          <ChevronDown size={12} className="text-gray-400 shrink-0 ml-auto sm:w-[13px] sm:h-[13px]" />
        )}
      </button>

      {open && (
        <div className={`bg-white dark:bg-crm-surface rounded-xl sm:rounded-2xl border border-gray-100 dark:border-crm-border-subtle overflow-hidden ${fullWidth ? "relative mt-1 w-full shadow-sm" : "absolute top-full mt-1 right-0 z-[80] w-[240px] sm:w-[280px] shadow-2xl"}`}>
          <div className="px-3 py-2 border-b border-gray-100 dark:border-crm-border-subtle bg-[#FAFAFB] dark:bg-crm-muted">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Upload source sudo</p>
          </div>
          <div className="p-2 border-b border-gray-100 dark:border-crm-border-subtle">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search source…"
                className="w-full h-8 pl-8 pr-2 rounded-lg border border-gray-200 dark:border-crm-border bg-white dark:bg-crm-input text-xs outline-none focus:border-[#1B6FE8]"
              />
            </div>
          </div>
          <div className="max-h-[220px] overflow-y-auto py-1">
            {options.length === 0 ? (
              <p className="px-3 py-4 text-xs text-gray-400 text-center">No source sudo on your leads</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-4 text-xs text-gray-400 text-center">No match</p>
            ) : (
              filtered.map(name => (
                <button
                  key={name}
                  type="button"
                  onClick={() => select(name)}
                  className={`w-full text-left px-3 sm:px-4 py-2.5 text-[12px] sm:text-[13px] font-semibold transition-colors hover:bg-[#EAF2FE] truncate ${
                    value === name ? "bg-[#EAF2FE] text-[#1B6FE8]" : "text-[#0F172A] dark:text-crm-text"
                  }`}
                >
                  {name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
