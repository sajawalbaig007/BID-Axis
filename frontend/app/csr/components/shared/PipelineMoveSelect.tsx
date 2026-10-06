"use client";

import { ChevronDown } from "lucide-react";

const OPTIONS = [
  { value: "important",      label: "Important" },
  { value: "schedule call",  label: "Schedule Call" },
  { value: "interested",     label: "Interested" },
  { value: "pending",        label: "Pending" },
  { value: "Close Client",   label: "Close Client" },
] as const;

interface PipelineMoveSelectProps {
  onMove: (status: string) => void;
  /** Hide current tab status (e.g. Interested can't pick Interested again) */
  exclude?: string[];
  className?: string;
}

export default function PipelineMoveSelect({
  onMove,
  exclude = [],
  className = "",
}: PipelineMoveSelectProps) {
  const excluded = new Set(exclude.map(s => s.toLowerCase().trim()));
  const visible = OPTIONS.filter(o => !excluded.has(o.value.toLowerCase()));

  return (
    <div className={`relative min-w-[130px] w-full ${className}`}>
      <select
        defaultValue=""
        onChange={e => {
          if (e.target.value) onMove(e.target.value);
          e.target.value = "";
        }}
        className="appearance-none h-9 w-full rounded-xl border border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-600 px-3 pr-8 text-[11px] font-semibold text-[#0F172A] dark:text-gray-100 outline-none"
      >
        <option value="">Update Status</option>
        {visible.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
    </div>
  );
}
