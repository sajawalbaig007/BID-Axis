"use client";

import { useMemo, type ReactElement, type ReactNode } from "react";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Percent, Star, TrendingUp, Users } from "lucide-react";
import RechartsBox from "@/app/components/charts/RechartsBox";
import UploadActionBento from "@/app/admin/components/uploads/UploadActionBento";

export type KpiChartRow = {
  name: string;
  fullName: string;
  projects_delivered: number;
  productivity: number;
  retained_clients: number;
  punctuality: number;
  team_query_mistakes: number;
  marks_out_of_10: number;
  rating_stars: number;
};

export type KpiDeliveredPoint = {
  label: string;
  count: number;
  pct: number;
};

const TIP = {
  borderRadius: 12,
  fontSize: 12,
  border: "1px solid var(--crm-border)",
  background: "var(--crm-surface)",
  color: "var(--crm-text)",
} as const;
const GRID = "var(--crm-border-subtle)";
const TICK = { fontSize: 10, fill: "var(--crm-text-muted)" } as const;
const DONUT = ["#1B6FE8", "#0B84F3", "#D97706", "#059669", "#7C3AED", "#38BDF8"];

function pctOf(part: number, whole: number) {
  if (!(whole > 0)) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function ChartCard({
  eyebrow,
  title,
  hint,
  children,
}: {
  eyebrow: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex-1 min-h-0 p-3 sm:p-4 flex flex-col">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{eyebrow}</p>
      <h3 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-crm-text">{title}</h3>
      {hint ? <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{hint}</p> : null}
      <div className="flex-1 min-h-[180px] mt-1">{children}</div>
    </div>
  );
}

type KpiChartsBentoProps = {
  rows: KpiChartRow[];
  periodLabel: string;
  deliveredTimeline: KpiDeliveredPoint[];
  toolbar?: ReactNode;
};

export default function KpiChartsBento({
  rows,
  periodLabel,
  deliveredTimeline,
  toolbar,
}: KpiChartsBentoProps): ReactElement {
  const totals = useMemo(() => {
    const n = Math.max(1, rows.length);
    const sum = (k: keyof KpiChartRow) =>
      rows.reduce((s, r) => s + (typeof r[k] === "number" ? Number(r[k]) : 0), 0);
    return {
      delivered: sum("projects_delivered"),
      retained: sum("retained_clients"),
      mistakes: sum("team_query_mistakes"),
      avgProd: Math.round(sum("productivity") / n),
      avgMarks: Math.round((sum("marks_out_of_10") / n) * 10) / 10,
      avgStars: Math.round((sum("rating_stars") / n) * 10) / 10,
      avgPunct: Math.round(sum("punctuality") / n),
    };
  }, [rows]);

  const barRows = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        deliveredPct: pctOf(r.projects_delivered, totals.delivered),
        retainedPct: pctOf(r.retained_clients, Math.max(r.projects_delivered, 1)),
      })),
    [rows, totals.delivered],
  );

  const donut = useMemo(() => {
    const mixTotal = totals.delivered + totals.retained + totals.mistakes;
    const data = [
      { name: "Delivered", value: totals.delivered, color: DONUT[0] },
      { name: "Retained", value: totals.retained, color: DONUT[1] },
      { name: "Mistakes", value: totals.mistakes, color: DONUT[2] },
    ]
      .filter((d) => d.value > 0)
      .map((d) => ({ ...d, pct: pctOf(d.value, mixTotal) }));
    return data.length ? data : [{ name: "No data", value: 1, color: "#E5E7EB", pct: 0 }];
  }, [totals]);

  const sharePie = useMemo(() => {
    const data = barRows
      .filter((r) => r.projects_delivered > 0)
      .map((r, i) => ({
        name: r.name,
        fullName: r.fullName,
        value: r.projects_delivered,
        pct: r.deliveredPct,
        color: DONUT[i % DONUT.length],
      }));
    return data.length ? data : [{ name: "No data", fullName: "No data", value: 1, pct: 0, color: "#E5E7EB" }];
  }, [barRows]);

  const radarData = useMemo(() => {
    const retainedRate = pctOf(totals.retained, Math.max(totals.delivered, 1));
    return [
      {
        metric: "Marks %",
        value: Math.min(100, (totals.avgMarks / 10) * 100),
        raw: `${totals.avgMarks || 0}/10`,
      },
      {
        metric: "Stars %",
        value: Math.min(100, (totals.avgStars / 5) * 100),
        raw: `${totals.avgStars || 0}/5`,
      },
      {
        metric: "Prod %",
        value: Math.min(100, totals.avgProd),
        raw: `${totals.avgProd}%`,
      },
      {
        metric: "Punct %",
        value: Math.min(100, totals.avgPunct),
        raw: `${totals.avgPunct}%`,
      },
      {
        metric: "Retain %",
        value: Math.min(100, retainedRate),
        raw: `${totals.retained} of ${totals.delivered} (${retainedRate}%)`,
      },
    ];
  }, [totals]);

  const maxMarks = Math.max(1, ...rows.map((r) => r.marks_out_of_10));
  const prodMax = Math.max(100, ...rows.map((r) => r.productivity), 0);

  const items = useMemo(
    () => [
      {
        id: "delivered",
        label: "Delivered",
        shortLabel: "Done",
        accent: "#1B6FE8",
        content: (
          <ChartCard
            eyebrow="Volume"
            title="Projects delivered"
            hint="Top: by estimator (count + share). Bottom: date-wise takeoffs."
          >
            {rows.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No data</p>
            ) : (
              <div className="h-full min-h-0 flex flex-col gap-2">
                <div className="flex-[1.15] min-h-[130px]">
                  <RechartsBox height="100%">
                    <BarChart data={barRows} barCategoryGap="22%">
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
                      <XAxis dataKey="name" tick={TICK} axisLine={false} tickLine={false} />
                      <YAxis
                        allowDecimals={false}
                        tick={TICK}
                        axisLine={false}
                        tickLine={false}
                        width={28}
                        label={{ value: "Count", angle: -90, position: "insideLeft", fontSize: 9, fill: "var(--crm-text-faint)" }}
                      />
                      <Tooltip
                        contentStyle={TIP}
                        labelFormatter={(_, p) => String(p?.[0]?.payload?.fullName ?? "")}
                        formatter={(v, _n, item) => {
                          const pct = Number(item?.payload?.deliveredPct ?? 0);
                          return [`${v} (${pct}% of team)`, "Delivered"];
                        }}
                      />
                      <Bar dataKey="projects_delivered" fill="#1B6FE8" radius={[8, 8, 0, 0]} maxBarSize={28}>
                        <LabelList
                          dataKey="deliveredPct"
                          position="top"
                          fontSize={9}
                          fill="var(--crm-text-muted)"
                          formatter={(v) => (Number(v) > 0 ? `${v}%` : "")}
                        />
                      </Bar>
                    </BarChart>
                  </RechartsBox>
                </div>
                <div className="flex-1 min-h-[110px] border-t border-dashed border-gray-100 pt-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
                    By date · count + % of period
                  </p>
                  {deliveredTimeline.length === 0 ? (
                    <p className="text-[11px] text-gray-400 text-center py-6">No date-wise deliveries yet</p>
                  ) : (
                    <RechartsBox height="100%">
                      <LineChart data={deliveredTimeline} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
                        <XAxis dataKey="label" tick={{ ...TICK, fontSize: 9 }} axisLine={false} tickLine={false} interval={0} />
                        <YAxis
                          allowDecimals={false}
                          tick={TICK}
                          axisLine={false}
                          tickLine={false}
                          width={28}
                        />
                        <Tooltip
                          contentStyle={TIP}
                          formatter={(v, _n, item) => {
                            const pct = Number(item?.payload?.pct ?? 0);
                            return [`${v} (${pct}% of period)`, "Delivered"];
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="count"
                          stroke="#F43F5E"
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: "#F43F5E", strokeWidth: 0 }}
                          activeDot={{ r: 6 }}
                        >
                          <LabelList
                            dataKey="pct"
                            position="top"
                            fontSize={8}
                            fill="var(--crm-text-muted)"
                            formatter={(v) => (Number(v) > 0 ? `${v}%` : "")}
                          />
                        </Line>
                      </LineChart>
                    </RechartsBox>
                  )}
                </div>
              </div>
            )}
          </ChartCard>
        ),
      },
      {
        id: "productivity",
        label: "Productivity",
        shortLabel: "Prod %",
        accent: "#0B84F3",
        content: (
          <ChartCard eyebrow="Efficiency" title="Productivity %">
            {rows.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No data</p>
            ) : (
              <RechartsBox height={180}>
                <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="kpiProdFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0B84F3" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0B84F3" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
                  <XAxis dataKey="name" tick={TICK} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={[0, prodMax]}
                    tick={TICK}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={TIP}
                    labelFormatter={(_, p) => String(p?.[0]?.payload?.fullName ?? "")}
                    formatter={(v) => [`${v}%`, "Productivity"]}
                  />
                  <Area type="monotone" dataKey="productivity" stroke="#0B84F3" strokeWidth={2} fill="url(#kpiProdFill)" />
                </AreaChart>
              </RechartsBox>
            )}
          </ChartCard>
        ),
      },
      {
        id: "radar",
        label: "Balance",
        shortLabel: "Radar",
        accent: "#7C3AED",
        content: (
          <ChartCard
            eyebrow="Shape"
            title="Evaluation radar"
            hint="0–100% on every axis — rounder shape means more even performance."
          >
            <RechartsBox height={190}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid stroke="var(--crm-border)" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "var(--crm-text-muted)" }} />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fontSize: 8, fill: "var(--crm-text-faint)" }}
                  tickFormatter={(v) => `${v}%`}
                  axisLine={false}
                />
                <Radar dataKey="value" stroke="#7C3AED" fill="#7C3AED" fillOpacity={0.28} />
                <Tooltip
                  contentStyle={TIP}
                  formatter={(_v, _n, item) => {
                    const raw = String(item?.payload?.raw ?? "");
                    const val = Number(item?.payload?.value ?? 0);
                    return [`${Math.round(val)}% · ${raw}`, "Score"];
                  }}
                />
              </RadarChart>
            </RechartsBox>
          </ChartCard>
        ),
      },
      {
        id: "mix",
        label: "Mix",
        shortLabel: "Donut",
        accent: "#D97706",
        content: (
          <ChartCard eyebrow="Share" title="Outcome mix · by estimator">
            <div className="h-full min-h-0 grid grid-cols-2 gap-1">
              <div className="min-w-0 flex flex-col">
                <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 text-center">Donut · mix</p>
                <div className="flex-1 min-h-[188px]">
                  <RechartsBox height={188}>
                    <PieChart>
                      <Pie
                        data={donut}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="52%"
                        innerRadius="38%"
                        outerRadius="90%"
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {donut.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={TIP}
                        formatter={(v, name, item) => {
                          const pct = Number(item?.payload?.pct ?? 0);
                          return [`${v} (${pct}%)`, String(name)];
                        }}
                      />
                    </PieChart>
                  </RechartsBox>
                </div>
                <div className="flex flex-wrap gap-1 justify-center">
                  {donut
                    .filter((d) => d.name !== "No data")
                    .map((d) => (
                      <span
                        key={d.name}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gray-50 text-[9px] font-semibold text-gray-600"
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: d.color }} />
                        {d.name} {d.value} · {d.pct}%
                      </span>
                    ))}
                </div>
              </div>
              <div className="min-w-0 flex flex-col">
                <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 text-center">Pie · estimators</p>
                <div className="flex-1 min-h-[188px]">
                  <RechartsBox height={188}>
                    <PieChart>
                      <Pie
                        data={sharePie}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="52%"
                        innerRadius={0}
                        outerRadius="90%"
                        paddingAngle={1}
                        strokeWidth={0}
                      >
                        {sharePie.map((d) => (
                          <Cell key={d.fullName} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={TIP}
                        labelFormatter={(_, p) => String(p?.[0]?.payload?.fullName ?? "")}
                        formatter={(v, _n, item) => {
                          const pct = Number(item?.payload?.pct ?? 0);
                          return [`${v} (${pct}%)`, "Delivered"];
                        }}
                      />
                    </PieChart>
                  </RechartsBox>
                </div>
                <div className="flex flex-wrap gap-1 justify-center max-h-10 overflow-hidden">
                  {sharePie
                    .filter((d) => d.name !== "No data")
                    .map((d) => (
                      <span
                        key={d.fullName}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gray-50 text-[9px] font-semibold text-gray-600"
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: d.color }} />
                        {d.name} {d.pct}%
                      </span>
                    ))}
                </div>
              </div>
            </div>
          </ChartCard>
        ),
      },
      {
        id: "pulse",
        label: "Pulse",
        shortLabel: "Pulse",
        accent: "#059669",
        content: (
          <div className="flex-1 min-h-0 flex flex-col gap-3 p-3 sm:p-4">
            <div className="rounded-[1.25rem] bg-[#38BDF8] text-white p-4 shadow-md shadow-sky-200/50 shrink-0">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">Snapshot · {periodLabel}</p>
                <Activity size={16} />
              </div>
              <p className="text-3xl font-bold mt-1 tabular-nums">{totals.avgMarks || "—"}</p>
              <p className="text-xs text-white/85">
                Avg marks / 10 · {pctOf(totals.avgMarks, 10)}%
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <span className="rounded-2xl bg-white/20 px-2 py-2 text-center">
                  <p className="text-base font-bold tabular-nums inline-flex items-center justify-center gap-0.5">
                    <TrendingUp size={12} /> {totals.avgProd}%
                  </p>
                  <p className="text-[9px] uppercase tracking-wide text-white/80">Prod</p>
                </span>
                <span className="rounded-2xl bg-white/20 px-2 py-2 text-center">
                  <p className="text-base font-bold tabular-nums inline-flex items-center justify-center gap-0.5">
                    <Star size={12} /> {totals.avgStars}
                  </p>
                  <p className="text-[9px] uppercase tracking-wide text-white/80">
                    Stars · {pctOf(totals.avgStars, 5)}%
                  </p>
                </span>
                <span className="rounded-2xl bg-white/20 px-2 py-2 text-center">
                  <p className="text-base font-bold tabular-nums inline-flex items-center justify-center gap-0.5">
                    <Users size={12} /> {totals.retained}
                  </p>
                  <p className="text-[9px] uppercase tracking-wide text-white/80">
                    Retain · {pctOf(totals.retained, Math.max(totals.delivered, 1))}%
                  </p>
                </span>
              </div>
            </div>
            <div className="rounded-[1.25rem] border border-gray-100 bg-white p-3 flex-1 min-h-0 flex flex-col">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2 inline-flex items-center gap-1 shrink-0">
                <Percent size={12} /> Marks split · /10 and %
              </p>
              {rows.length === 0 ? (
                <p className="text-xs text-gray-400">No estimators</p>
              ) : (
                <div className="space-y-2 max-h-36 overflow-y-scroll overscroll-contain pr-1 custom-kpi-scroll">
                  {rows.map((r) => (
                    <div key={r.fullName}>
                      <div className="flex items-center justify-between text-[11px] mb-1 gap-2">
                        <span className="font-semibold text-gray-700 truncate">{r.fullName}</span>
                        <span className="tabular-nums font-bold text-[#1B6FE8] shrink-0">
                          {r.marks_out_of_10 || "—"} · {pctOf(r.marks_out_of_10, 10)}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#1B6FE8] to-[#F43F5E]"
                          style={{ width: `${Math.max(6, (r.marks_out_of_10 / maxMarks) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ),
      },
    ],
    [rows, barRows, donut, sharePie, radarData, totals, periodLabel, maxMarks, prodMax, deliveredTimeline],
  );

  return (
    <UploadActionBento
      title="KPI graphs"
      subtitle=""
      replayLabel="Replay shuffle"
      toolbar={toolbar}
      items={items}
    />
  );
}
