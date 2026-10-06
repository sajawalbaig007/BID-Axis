"use client";

import { useMemo } from "react";
import { Trophy, TrendingUp, Star } from "lucide-react";
import type { ClientLead } from "../charts/PerformanceChart";

type Props = {
  leads?: ClientLead[];
  performers?: Performer[];
};

type Performer = { name: string; resolved: number; total: number; rate: number };

const rankStyle = (i: number) => {
  if (i === 0) return "bg-gradient-to-r from-amber-400 to-amber-500";
  if (i === 1) return "bg-gradient-to-r from-gray-400 to-gray-500";
  if (i === 2) return "bg-gradient-to-r from-amber-600 to-amber-700";
  return "bg-gradient-to-r from-blue-400 to-blue-500";
};

function formatRate(rate: number): string {
  if (rate === 0) return "0%";
  if (rate < 1) return `${rate.toFixed(2)}%`;
  return `${Number.isInteger(rate) ? rate : rate.toFixed(1)}%`;
}

export default function TopPerformers({ leads = [], performers: performersProp }: Props) {
  const performers = useMemo<Performer[]>(() => {
    if (performersProp?.length) return performersProp;
    const map: Record<string, { resolved: number; total: number }> = {};
    leads.forEach(l => {
      const name = l.csr?.name ?? "Unassigned";
      if (!map[name]) map[name] = { resolved: 0, total: 0 };
      map[name].total++;
      if (["Close Client", "interested", "important"].includes(l.status ?? ""))
        map[name].resolved++;
    });
    return Object.entries(map)
      .map(([name, { resolved, total }]) => ({
        name, resolved, total,
        rate: total > 0 ? Math.round((resolved / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.resolved - a.resolved)
      .slice(0, 5);
  }, [leads, performersProp]);

  const maxResolved = Math.max(1, ...performers.map((p) => p.resolved));

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex justify-between items-center mb-3 shrink-0">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">CSR ranking</p>
          <h3 className="font-bold text-[#0F172A] dark:text-crm-text">Top Performers</h3>
        </div>
        <Trophy size={18} className="text-amber-500"/>
      </div>

      <div className="space-y-2.5 flex-1 min-h-0">
        {performers.length === 0
          ? <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
          : performers.map((p, i) => (
            <div key={p.name} className="rounded-xl px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-crm-muted transition-all">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0 ${rankStyle(i)}`}>
                    {i + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-800 dark:text-crm-text truncate">{p.name}</p>
                    <p className="text-[10px] text-gray-400">{p.resolved} resolved · {p.total.toLocaleString()} total</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-right shrink-0">
                  <p className="text-sm font-bold text-emerald-600 tabular-nums">{formatRate(p.rate)}</p>
                  {p.rate >= 50
                    ? <TrendingUp size={13} className="text-emerald-500"/>
                    : <Star       size={13} className="text-gray-400"/>
                  }
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-crm-muted overflow-hidden ml-9">
                <div
                  className="h-full rounded-full bg-[#1B6FE8]"
                  style={{ width: `${Math.max(6, Math.round((p.resolved / maxResolved) * 100))}%` }}
                />
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}
