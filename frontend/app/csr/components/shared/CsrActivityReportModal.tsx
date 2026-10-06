"use client";

import { useEffect, useState } from "react";
import { X, Activity, CalendarDays, Loader2 } from "lucide-react";
import API from "@/lib/api";
import {
  formatNotificationStatus,
  statusBadgeColor,
} from "../../constants/notificationRoutes";
import { formatStatusTimestamp } from "@/lib/formatStatusTimestamp";
import { estNowYmd } from "@/lib/estTime";

type Period = "day" | "week" | "month";

type ReportData = {
  period: Period;
  date: string;
  rangeLabel: string;
  total: number;
  byStatus: Record<string, number>;
  entries?: { id: string; status: string; createdAt: string; leadName: string }[];
};

interface Props {
  open: boolean;
  onClose: () => void;
}

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: "day",   label: "Day"   },
  { key: "week",  label: "Week"  },
  { key: "month", label: "Month" },
];

export default function CsrActivityReportModal({ open, onClose }: Props) {
  const [period, setPeriod]     = useState<Period>("day");
  const [date, setDate]         = useState(() => estNowYmd());
  const [report, setReport]     = useState<ReportData | null>(null);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    (async () => {
      // Yield so setState is not synchronous inside the effect body (react-hooks/set-state-in-effect).
      await Promise.resolve();
      if (cancelled) return;

      setLoading(true);
      try {
        const res = await API.get("/csr/activity-report", { params: { period, date } });
        if (!cancelled) setReport(res.data);
      } catch {
        if (!cancelled) setReport(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, period, date]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[250] bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white dark:bg-[#1a1d24] rounded-2xl shadow-2xl w-full max-w-[420px] max-h-[min(92vh,760px)] my-auto flex flex-col overflow-hidden border border-gray-100 dark:border-gray-800">
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#EAF2FE] text-[#1B6FE8] flex items-center justify-center">
              <Activity size={17} />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-[#0F172A] dark:text-gray-100">My Activity Report</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Your status change counts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Outer scroller — whole report body on short viewports */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4">
          <div className="flex gap-1.5 p-1 bg-[#F3F4F6] dark:bg-gray-800/80 rounded-xl">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setPeriod(opt.key)}
                className={`flex-1 h-8 rounded-lg text-[12px] font-semibold transition-colors ${
                  period === opt.key
                    ? "bg-white dark:bg-gray-700 text-[#1B6FE8] shadow-sm"
                    : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              <CalendarDays size={12} />
              {period === "day" ? "Select date" : period === "week" ? "Week containing" : "Select month"}
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-[#FAFAFA] dark:bg-gray-900 text-sm outline-none focus:border-[#1B6FE8] dark:text-gray-100"
            />
          </div>

          {loading ? (
            <div className="py-10 flex flex-col items-center gap-2 text-gray-400">
              <Loader2 size={22} className="animate-spin" />
              <p className="text-[12px]">Loading report…</p>
            </div>
          ) : report ? (
            <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-[#F8FAFC] dark:bg-gray-900/60 p-4">
              <p className="text-[11px] text-gray-500 font-medium">{report.rangeLabel}</p>
              <p className="text-2xl font-bold text-[#0F172A] dark:text-gray-100 mt-1">
                {report.total}
                <span className="text-sm font-semibold text-gray-500 ml-1.5">
                  status change{report.total !== 1 ? "s" : ""}
                </span>
              </p>
              {report.total === 0 ? (
                <p className="text-[12px] text-gray-400 mt-3">No status updates in this period.</p>
              ) : (
                <>
                <div className="flex flex-wrap gap-2 mt-4">
                  {Object.entries(report.byStatus).map(([status, count]) => (
                    <div
                      key={status}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl ${statusBadgeColor(status)}`}
                    >
                      <span className="text-[11px] font-semibold">{formatNotificationStatus(status)}</span>
                      <span className="text-sm font-bold">{count}</span>
                    </div>
                  ))}
                </div>
                {report.entries && report.entries.length > 0 && (
                  /* Inner scroller — status entries list */
                  <div className="mt-4 max-h-[min(220px,32vh)] overflow-y-auto overscroll-contain space-y-1.5 border-t border-gray-100 dark:border-gray-800 pt-3 pr-1">
                    {report.total > report.entries.length && (
                      <p className="text-[10px] text-gray-400 mb-1">
                        Showing latest {report.entries.length} of {report.total}
                      </p>
                    )}
                    {report.entries.map(entry => (
                      <div key={entry.id} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-gray-600 dark:text-gray-300 truncate">
                          <span className="font-semibold text-gray-800 dark:text-gray-100">{entry.leadName}</span>
                          {" → "}
                          <span className={`font-semibold px-1.5 py-0.5 rounded ${statusBadgeColor(entry.status)}`}>
                            {formatNotificationStatus(entry.status)}
                          </span>
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono tabular-nums shrink-0">
                          {formatStatusTimestamp(entry.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                </>
              )}
            </div>
          ) : (
            <p className="text-center text-[12px] text-gray-400 py-6">Could not load report.</p>
          )}
        </div>
      </div>
    </div>
  );
}
