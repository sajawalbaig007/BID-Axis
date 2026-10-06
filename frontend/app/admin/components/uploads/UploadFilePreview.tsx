"use client";

import { Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { CSR_THEAD } from "@/app/csr/components/shared/csrTableStyles";

export type PreviewRow = {
  row: number;
  name: string;
  phone: string;
  email: string;
  company: string;
  interestedService?: string;
  status: "new" | "duplicate" | "updated" | "empty";
  reason: string;
};

export type PreviewSummary = {
  new: number;
  duplicate: number;
  updated: number;
  empty: number;
  total?: number;
};

const STATUS_STYLE: Record<PreviewRow["status"], { bg: string; text: string; label: string }> = {
  new:       { bg: "bg-green-100",  text: "text-green-700",  label: "New" },
  duplicate: { bg: "bg-red-100",    text: "text-red-700",    label: "Duplicate" },
  updated:   { bg: "bg-blue-100",   text: "text-blue-700",   label: "Updated" },
  empty:     { bg: "bg-gray-100",   text: "text-gray-500",   label: "Skipped" },
};

type Props = {
  fileName?: string;
  rows: PreviewRow[];
  summary: PreviewSummary | null;
  loading: boolean;
  skipped?: boolean;
  hideDuplicates: boolean;
  onToggleHideDuplicates: () => void;
  filter: "all" | PreviewRow["status"];
  onFilterChange: (f: "all" | PreviewRow["status"]) => void;
  showInterestedService?: boolean;
};

export default function UploadFilePreview({
  fileName,
  rows,
  summary,
  loading,
  skipped = false,
  hideDuplicates,
  onToggleHideDuplicates,
  filter,
  onFilterChange,
  showInterestedService = false,
}: Props) {
  const showServiceCol =
    showInterestedService || rows.some(r => !!r.interestedService?.trim());
  const visibleRows = rows.filter(r => {
    if (hideDuplicates && r.status === "duplicate") return false;
    if (filter !== "all" && r.status !== filter) return false;
    return true;
  });

  const hiddenDupCount = hideDuplicates ? (summary?.duplicate ?? 0) : 0;
  const totalCount = summary?.total ?? rows.length;

  return (
    <div className="border border-gray-200 rounded-xl sm:rounded-2xl overflow-hidden bg-[#FAFAFA]">
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-200 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-semibold text-gray-800">File Preview</p>
            {fileName && (
              <p className="text-[10px] sm:text-xs text-gray-400 truncate">{fileName}</p>
            )}
          </div>
          {summary && (
            <button
              type="button"
              onClick={onToggleHideDuplicates}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-semibold transition-all shrink-0 ${
                hideDuplicates
                  ? "bg-red-100 text-red-700 hover:bg-red-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {hideDuplicates ? <EyeOff size={12} /> : <Eye size={12} />}
              {hideDuplicates ? "Duplicates hidden" : "Show all rows"}
            </button>
          )}
        </div>

        {summary && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {([
              { key: "all" as const,       count: totalCount,            label: "All" },
              { key: "new" as const,       count: summary.new,           label: "New" },
              { key: "duplicate" as const, count: summary.duplicate,     label: "Duplicate" },
              { key: "updated" as const,   count: summary.updated,       label: "Updated" },
              { key: "empty" as const,     count: summary.empty,         label: "Skipped" },
            ]).map(f => (
              <button
                key={f.key}
                type="button"
                onClick={() => onFilterChange(f.key)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all ${
                  filter === f.key
                    ? "bg-[#1B6FE8] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-gray-400 text-sm">
          <Loader2 size={16} className="animate-spin" /> Reading file…
        </div>
      ) : skipped ? (
        <div className="flex flex-col items-center justify-center gap-1.5 py-8 px-4 text-center">
          <AlertCircle size={18} className="text-amber-500" />
          <p className="text-xs sm:text-sm font-medium text-gray-700">Live preview off</p>
          <p className="text-[10px] sm:text-xs text-gray-400 max-w-sm">
            Select CSR(s) and upload — results show after the file finishes processing.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-6">Select a file to preview rows.</p>
      ) : (
        <div className="max-h-[200px] sm:max-h-[240px] overflow-auto">
          <table className="w-full text-xs">
            <thead className={CSR_THEAD}>
              <tr className="text-left text-[10px] uppercase tracking-wide text-crm-text-faint">
                <th className="px-3 py-2 font-semibold w-10">#</th>
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold hidden sm:table-cell">Phone</th>
                {showServiceCol && (
                  <th className="px-3 py-2 font-semibold hidden md:table-cell">Interested In</th>
                )}
                <th className="px-3 py-2 font-semibold w-24">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={showServiceCol ? 5 : 4} className="px-3 py-6 text-center text-gray-400">
                    {hideDuplicates && (summary?.duplicate ?? 0) > 0
                      ? "All visible rows are duplicates — toggle to show them."
                      : "No rows match this filter."}
                  </td>
                </tr>
              ) : (
                visibleRows.map(row => {
                  const st = STATUS_STYLE[row.status];
                  return (
                    <tr
                      key={row.row}
                      className={row.status === "duplicate" ? "bg-red-50/50" : "bg-white"}
                    >
                      <td className="px-3 py-1.5 text-gray-400">{row.row}</td>
                      <td className="px-3 py-1.5 font-medium text-gray-800 truncate max-w-[120px] sm:max-w-none">
                        {row.name}
                      </td>
                      <td className="px-3 py-1.5 text-gray-600 hidden sm:table-cell">{row.phone}</td>
                      {showServiceCol && (
                        <td className="px-3 py-1.5 text-gray-600 hidden md:table-cell truncate max-w-[120px]">
                          {row.interestedService?.trim() ? (
                            <span className="font-medium text-[#D97706]">{row.interestedService}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${st.bg} ${st.text}`}>
                          {row.status === "duplicate" && <AlertCircle size={9} />}
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {summary?.total && summary.total > rows.length && (
            <p className="px-3 py-2 text-[10px] text-gray-400 border-t border-gray-100 bg-white">
              Showing first {rows.length} of {summary.total} rows — full file will upload.
            </p>
          )}
        </div>
      )}

      {hiddenDupCount > 0 && !skipped && (
        <div className="px-3 py-2 bg-[#FFF7ED] border-t border-[#FED7AA]/50 flex items-start gap-1.5">
          <AlertCircle size={12} className="text-[#B45309] mt-0.5 shrink-0" />
          <p className="text-[10px] sm:text-xs text-[#92400E]">
            <strong>{hiddenDupCount} duplicate(s)</strong> hidden from preview — they will be skipped on upload.
          </p>
        </div>
      )}
    </div>
  );
}
