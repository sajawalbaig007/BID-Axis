"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import API, { apiErrorMessage } from "@/lib/api";

type PersonCut = { name: string; department: string; day: number; month: number };
type Report = { date: string; month: string; through: string; people: PersonCut[] };

function pktToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function money(amount: number) {
  return `Rs ${Math.round(amount).toLocaleString("en-PK")}`;
}

export default function DailyLateCard() {
  const pathname = usePathname();
  const ceo = pathname.startsWith("/admin");
  const today = pktToday();
  const [date, setDate] = useState(today);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (day: string) => {
    setLoading(true);
    try {
      const res = await API.get("/attendance/late-daily", { params: { date: day } });
      setReport({
        date: res.data.date,
        month: res.data.month,
        through: res.data.through,
        people: res.data.people ?? [],
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not load daily deductions."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ceo) return;
    void load(date);
  }, [ceo, date, load]);

  if (!ceo) return null;

  const dayLabel = date === today ? "Current date" : date;
  const people = report?.people ?? [];

  return (
    <section className="rounded-[1.5rem] sm:rounded-[1.75rem] border border-gray-100/90 dark:border-crm-border bg-white dark:bg-crm-surface shadow-[0_10px_40px_-24px_rgba(15,23,42,0.35)] p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-bold text-[#0F172A] dark:text-white text-base sm:text-lg">Late time deduction</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            A day with no check-in deducts that day’s pay. A check-in follows the time ranges. Current date and the month so far fill in on their own.
            {report ? ` Month total runs through ${report.through}.` : ""}
          </p>
        </div>
        <label className="text-xs text-gray-500 dark:text-gray-400">
          Specific date
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block rounded-lg border border-gray-200 dark:border-crm-border bg-white dark:bg-[#0B1220] px-2 py-1.5 text-sm text-[#0F172A] dark:text-white"
          />
        </label>
      </div>

      {loading && people.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400 inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Loading deductions…
        </p>
      ) : people.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">No employees for this month.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <th className="py-2 pr-3 font-semibold">Employee</th>
                <th className="py-2 pr-3 font-semibold text-right">{dayLabel}</th>
                <th className="py-2 font-semibold text-right">So far this month</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={`${person.department}:${person.name}`} className="border-t border-gray-100 dark:border-crm-border">
                  <td className="py-2 pr-3">
                    <span className="font-semibold text-[#0F172A] dark:text-white">{person.name}</span>
                    <span className="ml-2 text-[11px] text-gray-400">{person.department}</span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums font-semibold text-[#1B6FE8]">{money(person.day)}</td>
                  <td className="py-2 text-right tabular-nums font-semibold text-[#0F172A] dark:text-white">{money(person.month)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
