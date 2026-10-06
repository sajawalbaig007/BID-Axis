"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, MapPin, Search, X } from "lucide-react";
import { US_STATES, CA_PROVINCES } from "../../constants/locations";

interface StateFilterDropdownProps {
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
  fullWidth?: boolean;
}

type Country = "all" | "usa" | "canada";

export default function StateFilterDropdown({ value, onChange, compact = false, fullWidth = false }: StateFilterDropdownProps) {
  const [search,  setSearch]  = useState("");
  const [open,    setOpen]    = useState(false);
  const [country, setCountry] = useState<Country>("all");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredUSStates = useMemo(() => {
    if (country === "canada") return [];
    const q = search.toLowerCase();
    return !q ? US_STATES : US_STATES.filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q));
  }, [search, country]);

  const filteredCAProvinces = useMemo(() => {
    if (country === "usa") return [];
    const q = search.toLowerCase();
    return !q ? CA_PROVINCES : CA_PROVINCES.filter(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
  }, [search, country]);

  const select = (name: string) => { onChange(name); setOpen(false); setSearch(""); };
  const clear  = () => { onChange(""); setSearch(""); };

  const countryTabs: { key: Country; label: string; flag: string }[] = [
    { key: "all",    label: "All",    flag: "🌎" },
    { key: "usa",    label: "USA",    flag: "🇺🇸" },
    { key: "canada", label: "Canada", flag: "🇨🇦" },
  ];

  return (
    <div className={`relative ${fullWidth ? "w-full min-w-0" : ""}`} ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`px-3 sm:px-4 rounded-xl sm:rounded-2xl border flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium transition-colors ${fullWidth ? "h-10 sm:h-[42px] w-full min-w-0" : compact ? "h-10 sm:h-[42px] min-w-[140px] sm:min-w-[168px]" : "h-10 sm:h-[42px] min-w-[160px] sm:min-w-[200px]"} ${
          value
            ? "border-[#1B6FE8] bg-[#EAF2FE] text-[#1B6FE8]"
            : "border-gray-200 dark:border-crm-border bg-[#FAFAFA] dark:bg-crm-input text-gray-600 dark:text-crm-text-secondary hover:border-gray-300 dark:hover:border-crm-border"
        }`}
      >
        <MapPin size={12} className={`shrink-0 sm:w-[14px] sm:h-[14px] ${value ? "text-[#1B6FE8]" : "text-gray-400"}`} />
        <span className="flex-1 text-left truncate text-[12px] sm:text-[13px]">{value || (compact ? "State / Province" : "Filter by State / Province")}</span>
        {value ? (
          <span role="button" onClick={e => { e.stopPropagation(); clear(); }} className="ml-1 text-[#1B6FE8] hover:text-[#0E4FBE] shrink-0">
            <X size={12} className="sm:w-[13px] sm:h-[13px]" />
          </span>
        ) : (
          <ChevronDown size={12} className="text-gray-400 shrink-0 sm:w-[13px] sm:h-[13px]" />
        )}
      </button>

      {open && (
        <div className={`bg-white dark:bg-crm-surface rounded-xl sm:rounded-2xl border border-gray-100 dark:border-crm-border overflow-hidden ${fullWidth ? "relative mt-1 w-full shadow-sm" : "absolute top-full mt-1 right-0 z-[80] w-[260px] sm:w-[290px] shadow-2xl"}`}>

          {/* Country tabs */}
          <div className="flex gap-1 p-2 border-b border-gray-100 dark:border-crm-border bg-[#FAFAFB] dark:bg-crm-surface-raised">
            {countryTabs.map(tab => (
              <button key={tab.key}
                onClick={() => { setCountry(tab.key); setSearch(""); }}
                className={`flex-1 h-8 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all ${
                  country === tab.key
                    ? "bg-[#1B6FE8] text-white shadow-sm"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                <span>{tab.flag}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="p-2.5 sm:p-3 border-b border-gray-100">
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 sm:w-[13px] sm:h-[13px]" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={
                  country === "usa"    ? "Search US states…" :
                  country === "canada" ? "Search provinces…" :
                  "Search states / provinces…"
                }
                autoFocus
                className="w-full h-8 sm:h-9 rounded-lg sm:rounded-xl border border-gray-200 bg-[#FAFAFA] pl-7 sm:pl-8 pr-3 text-[12px] sm:text-[13px] outline-none focus:border-[#1B6FE8]"
              />
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto" style={{ maxHeight: "240px" }}>
            {filteredUSStates.length > 0 && (
              <>
                {country === "all" && (
                  <div className="sticky top-0 px-3 py-1.5 bg-[#F8F9FC] border-b border-gray-100">
                    <p className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider">🇺🇸 United States</p>
                  </div>
                )}
                {filteredUSStates.map(s => (
                  <button key={s.code}
                    onClick={() => select(s.name)}
                    className={`w-full text-left px-3 sm:px-4 py-2 text-[12px] sm:text-[13px] flex flex-col transition-colors hover:bg-[#EAF2FE] ${
                      value === s.name ? "bg-[#EAF2FE] text-[#1B6FE8] font-semibold" : "text-[#0F172A]"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{s.name}</span>
                      <span className="text-[10px] sm:text-[11px] text-gray-400 font-mono ml-2">{s.code}</span>
                    </div>
                  </button>
                ))}
              </>
            )}

            {filteredCAProvinces.length > 0 && (
              <>
                {country === "all" && (
                  <div className="sticky top-0 px-3 py-1.5 bg-[#F8F9FC] border-b border-t border-gray-100">
                    <p className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider">🇨🇦 Canada</p>
                  </div>
                )}
                {filteredCAProvinces.map(p => (
                  <button key={p.code}
                    onClick={() => select(p.name)}
                    className={`w-full text-left px-3 sm:px-4 py-2 text-[12px] sm:text-[13px] flex flex-col transition-colors hover:bg-[#EAF2FE] ${
                      value === p.name ? "bg-[#EAF2FE] text-[#1B6FE8] font-semibold" : "text-[#0F172A]"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{p.name}</span>
                      <span className="text-[10px] sm:text-[11px] text-gray-400 font-mono ml-2">{p.code}</span>
                    </div>
                  </button>
                ))}
              </>
            )}

            {filteredUSStates.length === 0 && filteredCAProvinces.length === 0 && (
              <div className="py-6 sm:py-8 text-center text-gray-400 text-xs sm:text-sm">No results found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
