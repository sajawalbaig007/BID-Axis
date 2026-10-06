"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Bar,
  CartesianGrid, Tooltip, XAxis, YAxis,
} from "recharts";
import { useTheme } from "@/app/components/ThemeProvider";
import {
  addDaysToYmd,
  businessHourBucketKey,
  currentBusinessYmd,
  fmtMonthShortFromYmd,
  fmtShortDateFromYmd,
  fmtWeekDayFromYmd,
  getBusinessYmd,
  initBusinessHourBuckets,
  isSameBusinessDay,
} from "@/lib/businessCalendar";

export type ClientLead = {
  id?: string;
  name?: string;
  company?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  csr?: { name?: string };
};

type DataPoint = { label: string; calls: number };

type Props = {
  leads?: ClientLead[];
  series?: DataPoint[];
  range?: string;
};

function groupLeads(leads: ClientLead[], range: string): DataPoint[] {
  const now = new Date();
  const currentBiz = currentBusinessYmd(now);

  if (range === "today") {
    const buckets = initBusinessHourBuckets();
    leads.forEach(lead => {
      if (!lead.createdAt) return;
      const dt = new Date(lead.createdAt);
      if (!isSameBusinessDay(dt, now)) return;
      const key = businessHourBucketKey(dt);
      if (key in buckets) buckets[key]++;
    });
    return Object.entries(buckets).map(([label, calls]) => ({ label, calls }));
  }

  if (range === "week") {
    const buckets: Record<string, number> = {};
    const labels: Record<string, string> = {};
    for (let d = 6; d >= 0; d--) {
      const ymd = addDaysToYmd(currentBiz, -d);
      buckets[ymd] = 0;
      labels[ymd] = fmtWeekDayFromYmd(ymd);
    }
    leads.forEach(lead => {
      if (!lead.createdAt) return;
      const ymd = getBusinessYmd(new Date(lead.createdAt));
      if (ymd in buckets) buckets[ymd]++;
    });
    return Object.keys(buckets).map(k => ({ label: labels[k] ?? k, calls: buckets[k] ?? 0 }));
  }

  if (range === "month") {
    const buckets: Record<string, number> = {};
    const labels: Record<string, string> = {};
    for (let d = 28; d >= 0; d -= 7) {
      const ymd = addDaysToYmd(currentBiz, -d);
      buckets[ymd] = 0;
      labels[ymd] = fmtShortDateFromYmd(ymd);
    }
    const monthKeys = Object.keys(buckets);
    leads.forEach(lead => {
      if (!lead.createdAt) return;
      const bizYmd = getBusinessYmd(new Date(lead.createdAt));
      let chosen = monthKeys[0]!;
      for (const key of monthKeys) {
        if (key <= bizYmd) chosen = key;
      }
      if (chosen in buckets) buckets[chosen]++;
    });
    return Object.keys(buckets).map(k => ({ label: labels[k] ?? k, calls: buckets[k] ?? 0 }));
  }

  const buckets: Record<string, number> = {};
  const labels: Record<string, string> = {};
  const seen = new Set<string>();
  for (let d = 364; d >= 0; d -= 28) {
    const ymd = addDaysToYmd(currentBiz, -d);
    const month = fmtMonthShortFromYmd(ymd);
    if (seen.has(month)) continue;
    seen.add(month);
    buckets[ymd] = 0;
    labels[ymd] = month;
  }
  const yearKeys = Object.keys(buckets);
  leads.forEach(lead => {
    if (!lead.createdAt) return;
    const bizYmd = getBusinessYmd(new Date(lead.createdAt));
    const month = fmtMonthShortFromYmd(bizYmd);
    const key = yearKeys.find(k => fmtMonthShortFromYmd(k) === month);
    if (key && key in buckets) buckets[key]++;
  });
  return Object.keys(buckets).map(k => ({ label: labels[k] ?? k, calls: buckets[k] ?? 0 }));
}

export default function PerformanceChart({ leads = [], series, range = "week" }: Props) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const data = useMemo(() => {
    if (series && series.length > 0) return series;
    return groupLeads(leads, range);
  }, [series, leads, range]);

  const total = useMemo(() => data.reduce((s, d) => s + d.calls, 0), [data]);
  const peak = useMemo(() => data.reduce((m, d) => Math.max(m, d.calls), 0), [data]);
  const avg = data.length ? Math.round(total / data.length) : 0;

  const grid = isDark ? "#2A303C" : "#EEF1F6";
  const tick = isDark ? "#94A3B8" : "#9CA3AF";
  const tooltipBg = isDark ? "#1a1d24" : "#fff";
  const tooltipBorder = isDark ? "#2A303C" : "#eee";
  const tooltipColor = isDark ? "#E5E7EB" : "#111827";

  return (
    <div className="flex flex-col h-full min-h-[260px] sm:min-h-[320px]">
      <div className="flex flex-wrap gap-2 mb-3 shrink-0">
        <KpiChip label="Volume" value={total.toLocaleString()} />
        <KpiChip label="Avg / bucket" value={avg.toLocaleString()} />
        <KpiChip label="Peak" value={peak.toLocaleString()} />
      </div>
      <div className="flex-1 min-h-[220px] sm:min-h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="dashAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1B6FE8" stopOpacity={isDark ? 0.35 : 0.22} />
                <stop offset="100%" stopColor="#1B6FE8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={grid} strokeDasharray="3 6" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: tick, fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: tick, fontSize: 11 }}
              allowDecimals={false}
              width={36}
            />
            <Tooltip
              formatter={(value) => [`${value} calls`, "Activity"]}
              contentStyle={{
                borderRadius: "12px",
                border: `1px solid ${tooltipBorder}`,
                background: tooltipBg,
                color: tooltipColor,
                boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
                fontSize: 12,
              }}
            />
            <Bar
              dataKey="calls"
              fill="#1B6FE8"
              fillOpacity={isDark ? 0.45 : 0.28}
              radius={[5, 5, 0, 0]}
              maxBarSize={36}
              tooltipType="none"
            />
            <Area
              type="monotone"
              dataKey="calls"
              stroke="#1B6FE8"
              strokeWidth={2.5}
              fill="url(#dashAreaFill)"
              dot={false}
              activeDot={{ r: 5, fill: "#1B6FE8", stroke: isDark ? "#1a1d24" : "#fff", strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function KpiChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-crm-border bg-[#F8F9FC] dark:bg-crm-muted px-3 py-1.5 min-w-[88px]">
      <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-sm font-extrabold tabular-nums text-[#0F172A] dark:text-crm-text leading-tight">{value}</p>
    </div>
  );
}
