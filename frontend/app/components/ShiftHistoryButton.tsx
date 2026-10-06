"use client";

import { useState } from "react";
import { History, X } from "lucide-react";
import toast from "react-hot-toast";
import API, { apiErrorMessage, officeProxy } from "@/lib/api";

type HistoryDay = {
  day: string;
  dayLabel: string;
  checkIn: string;
  checkOut: string | null;
  overnight: boolean;
  checkOutLabel: string | null;
  checkInLabel?: string | null;
};

export default function ShiftHistoryButton({
  url,
  params,
  compact = false,
  large = false,
  office = false,
}: {
  url: string;
  params?: Record<string, string>;
  compact?: boolean;
  large?: boolean;
  office?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState<HistoryDay[]>([]);

  const openHistory = async () => {
    setOpen(true);
    setLoading(true);
    try {
      const res = await API.get(url, { params, ...(office ? officeProxy : {}) });
      setDays((res.data.days ?? []) as HistoryDay[]);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not load history."));
      setDays([]);
    } finally {
      setLoading(false);
    }
  };

  const buttonClass = large
    ? "h-14 w-full px-4 rounded-2xl bg-[#0F172A] text-white text-base font-semibold inline-flex items-center justify-center gap-2 shadow-sm hover:bg-[#1e293b] touch-manipulation"
    : `inline-flex items-center gap-1 ${compact ? "h-9 px-2.5" : "h-10 px-3"} rounded-xl bg-[#0F172A] text-white text-[11px] sm:text-xs font-bold shadow-sm hover:bg-[#1e293b] shrink-0 touch-manipulation`;

  return (
    <>
      <button type="button" onClick={() => void openHistory()} className={buttonClass} title="First check-in and last check-out">
        <History size={large ? 18 : 14} />
        <span className={compact ? "hidden sm:inline" : ""}>History</span>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[80] bg-black/45 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white dark:bg-crm-surface w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-crm-border">
              <div>
                <h2 className="text-base font-bold text-[#0F172A] dark:text-crm-text">Check-in history</h2>
                <p className="text-[11px] text-gray-500 dark:text-crm-text-muted">First check-in and last check-out of each day</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-crm-muted flex items-center justify-center"
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-3">
              {loading ? (
                <p className="py-8 text-center text-sm text-gray-500">Loading…</p>
              ) : days.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">No check-in history yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-crm-border">
                  {days.map((day) => (
                    <li key={day.day} className="py-3">
                      <p className="text-sm font-bold text-[#0F172A] dark:text-crm-text">{day.dayLabel}</p>
                      <div className="mt-1.5 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-[#0F766E]">First check-in</p>
                          <p className="font-semibold tabular-nums text-[#0B1220] dark:text-crm-text">{day.checkIn}</p>
                          {day.checkInLabel ? (
                            <p className="text-[10px] font-bold uppercase tracking-wide text-[#0F766E]">
                              Next day · {day.checkInLabel}
                            </p>
                          ) : null}
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1B6FE8]">Last check-out</p>
                          <p className="font-semibold tabular-nums text-[#0B1220] dark:text-crm-text">
                            {day.checkOut ?? "Still in"}
                          </p>
                          {day.overnight && day.checkOutLabel ? (
                            <p className="text-[10px] font-bold uppercase tracking-wide text-[#1B6FE8]">
                              Next day · {day.checkOutLabel}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
