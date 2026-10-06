"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, Star } from "lucide-react";
import { useStaffBase } from "@/app/hooks/useStaffBase";
import {
  fetchPreviousMonthRatings,
  starsDisplay,
  topPerformers,
  type EstimatorMonthRating,
} from "@/lib/estimatorPreviousMonthRating";

/** Compact Top 5 estimators under Admin Performance chart. */
export default function TopEstimatorsWidget() {
  const staffBase = useStaffBase();
  const [top5, setTop5] = useState<EstimatorMonthRating[]>([]);
  const [monthLabel, setMonthLabel] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPreviousMonthRatings()
      .then((res) => {
        if (cancelled) return;
        if (res?.success) {
          setTop5(topPerformers(res.ratings, 5));
          setMonthLabel(res.monthLabel);
        } else {
          setTop5([]);
          setMonthLabel("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTop5([]);
          setMonthLabel("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="min-w-0">
          <h3 className="text-sm sm:text-base font-bold text-gray-800 dark:text-crm-text flex items-center gap-1.5">
            <Trophy size={16} className="text-amber-500 shrink-0" />
            Top 5 Estimators
          </h3>
          <p className="text-xs text-gray-400 mt-0.5 truncate">
            {monthLabel ? `${monthLabel} rating` : "Previous month KPI"}
          </p>
        </div>
        <Link
          href="/technical/kpi"
          className="text-xs font-semibold text-[#1B6FE8] hover:underline shrink-0"
        >
          KPI
        </Link>
      </div>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : top5.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">No estimator ratings yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {top5.map((e, idx) => (
            <div
              key={e.estimatorId}
              className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 min-w-0 ${
                idx === 0
                  ? "border-amber-200 bg-gradient-to-br from-amber-50 to-white"
                  : "border-gray-100 bg-[#FAFBFC]"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 ${
                    idx === 0 ? "bg-amber-500 text-white" : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#0F172A] truncate">{e.name}</p>
                  <p className="text-[11px] text-amber-600 flex items-center gap-0.5 mt-0.5">
                    <Star size={10} className="fill-amber-400 text-amber-400" />
                    {starsDisplay(e.stars)}
                  </p>
                </div>
              </div>
              <span className="text-sm font-bold text-violet-700 tabular-nums shrink-0">
                {e.marks ? `${e.marks}/10` : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
      {/* staffBase kept for future deep-links */}
      <span className="sr-only">{staffBase}</span>
    </div>
  );
}
