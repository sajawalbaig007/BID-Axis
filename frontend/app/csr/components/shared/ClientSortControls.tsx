"use client";

import { ArrowDownAZ, ArrowUpAZ } from "lucide-react";
import type { ClientListSortBy, SortDir } from "../../utils/clientListSort";

interface ClientSortControlsProps {
  sortBy: ClientListSortBy;
  sortDir: SortDir;
  onSortBy: (v: ClientListSortBy) => void;
  onSortDir: (v: SortDir) => void;
  /** Hide the field dropdown — Asc/Desc only (e.g. Active Projects locked to code). */
  dirOnly?: boolean;
  /** Label used in dirOnly button title (default Code). */
  dirLabel?: string;
  className?: string;
}

export default function ClientSortControls({
  sortBy,
  sortDir,
  onSortBy,
  onSortDir,
  dirOnly = false,
  dirLabel = "Code",
  className = "",
}: ClientSortControlsProps) {
  return (
    <div className={`flex items-center gap-2 flex-nowrap ${className}`}>
      {!dirOnly && (
        <select
          value={sortBy}
          onChange={e => onSortBy(e.target.value as ClientListSortBy)}
          className="h-10 sm:h-11 rounded-xl border border-gray-200 bg-[#FAFAFA] px-2.5 sm:px-3 text-xs sm:text-sm outline-none focus:border-[#1B6FE8] text-[#0F172A] font-medium shrink-0"
          title="Sort by"
        >
          <option value="oldestNote">Oldest note</option>
          <option value="clientCode">Client Code</option>
          <option value="name">Name</option>
        </select>
      )}
      <button
        type="button"
        onClick={() => onSortDir(sortDir === "asc" ? "desc" : "asc")}
        className="h-10 sm:h-11 px-2.5 sm:px-3 rounded-xl border border-gray-200 bg-[#FAFAFA] text-xs sm:text-sm font-semibold text-[#1B6FE8] hover:bg-[#F4F8FF] transition-colors inline-flex items-center gap-1.5 shrink-0"
        title={
          dirOnly
            ? sortDir === "asc"
              ? `${dirLabel} ascending — click for descending`
              : `${dirLabel} descending — click for ascending`
            : sortDir === "asc"
              ? "Ascending — click for descending"
              : "Descending — click for ascending"
        }
      >
        {sortDir === "asc" ? <ArrowUpAZ size={14} /> : <ArrowDownAZ size={14} />}
        <span className="hidden sm:inline">{sortDir === "asc" ? "Asc" : "Desc"}</span>
      </button>
    </div>
  );
}
