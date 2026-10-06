"use client";

import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowDownRight, ArrowUpRight, CalendarDays, FileDown, Loader2,
  Sparkles, TrendingUp, Wallet, PieChart as PieIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import API, { apiErrorMessage } from "@/lib/api";
import { estCurrentMonthValue } from "@/lib/estTime";
import AccountsSidebar from "../components/layout/Sidebar";
import { ACCOUNTS_MAIN_OFFSET } from "../components/layout/headerOffset";
import AccountsChartCard from "../components/AccountsChartCard";
import RechartsBox from "@/app/components/charts/RechartsBox";
import { currency } from "../types";
import { useScrollToHash } from "../hooks/useScrollToHash";
import { STAFF_PAGE_PAD, BENTO_CARD } from "@/lib/staffPageLayout";
import {
  captureReportVisualPdf,
  restoreExportButtons,
  triggerLocalDownload,
} from "../utils/reportVisualExport";
import { useAccountsVisualPdf } from "../utils/useAccountsVisualPdf";

type CategoryGroup = {
  name: string;
  total: number;
  lines: { label: string; amount: number }[];
};

type SalaryFieldTable = {
  name: string;
  kind: string;
  total: number;
  filledAt?: string;
  columns: string[];
  rows: { employee: string; cells: (string | number)[] }[];
};

type OpexFieldTable = {
  name: string;
  amount: number;
  filledAt: string;
  notes: string;
  lines: { label: string; amount: number; filledAt: string; proofName: string }[];
};

type MonthlyReport = {
  month: string;
  sourceDate?: string | null;
  monthEnd?: string;
  mode?: string;
  totals: {
    revenue: number;
    payroll: number;
    opex: number;
    loans: number;
    pf: number;
    totalCost: number;
    netProfit: number;
  };
  revenueChannels?: {
    key: string;
    label: string;
    usd: number;
    cad: number;
    pkr: number;
    netPkr: number;
  }[];
  history: { month: string; revenue: number; cost: number; net: number; days?: number; lastDate?: string }[];
  salaryTeams: CategoryGroup[];
  salaryTables?: SalaryFieldTable[];
  opexHeads: CategoryGroup[];
  opexTables?: OpexFieldTable[];
  loanHeads: CategoryGroup[];
  loanTables?: OpexFieldTable[];
  pfHeads: CategoryGroup[];
  pfTables?: OpexFieldTable[];
  executives: {
    name: string;
    basic: number;
    commissionPct: number;
    commission: number;
    total: number;
    loanPositive: number;
    loanNegative: number;
    remarks: string;
  }[];
  cash: {
    banks: { bank: string; balance: number; debit?: number; credit?: number }[];
    sections?: { name: string; net: number }[];
    monthNet: number;
    closingNet: number;
    monthEntries?: number;
    asOf: string | null;
    ledger?: {
      section: string;
      date: string;
      description: string;
      banks: { bank: string; debit: number; credit: number }[];
      debit: number;
      credit: number;
      net: number;
    }[];
  };
  csr: {
    totalProjects: number;
    totals: {
      oldProjects: number;
      partialCount: number;
      newProjects: number;
      fixProjects: number;
      fixPay: number;
      oldComm: number;
      newComm: number;
      fixComm: number;
      totalCommission: number;
    };
    rows: {
      name: string;
      code: string;
      role: "sales" | "team_lead";
      roleLabel: string;
      assignedToLead: boolean;
      oldProjects: number;
      partialCount: number;
      newProjects: number;
      fixProjects: number;
      fixPay: number;
      projects: number;
      oldComm: number;
      newComm: number;
      fixComm: number;
      totalCommission: number;
      share: number;
      status?: string;
      note?: string;
      fixClients?: { clientName: string; projectPay: number; currency: string }[];
    }[];
  };
  daysRecorded: number;
  budgetCompare?: {
    hasBudget: boolean;
    rows: {
      key: string;
      name: string;
      kind: "core" | "opex_head";
      budget: number;
      actual: number;
      variance: number;
    }[];
    totals: {
      budgetRevenue: number;
      actualRevenue: number;
      budgetExpense: number;
      actualExpense: number;
      variance: number;
    };
  };
};

type SavedMonthlyReport = {
  id: string;
  month: string;
  fileName: string;
  fileUrl: string;
  sourceDate: string | null;
  createdAt: string;
  totals?: MonthlyReport["totals"] | null;
};

function currentMonthIso(): string {
  return estCurrentMonthValue();
}

function monthLabel(m: string): string {
  const [y, mm] = m.split("-").map(Number);
  if (!y || !mm) return m;
  return new Date(Date.UTC(y, mm - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function monthShort(m: string): string {
  const [y, mm] = m.split("-").map(Number);
  if (!y || !mm) return m;
  const name = new Date(Date.UTC(y, mm - 1, 1)).toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  return `${name} '${String(y).slice(2)}`;
}

function monthNameOnly(m: string): string {
  const [y, mm] = m.split("-").map(Number);
  if (!y || !mm) return m;
  return new Date(Date.UTC(y, mm - 1, 1)).toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

const pkr = (n: number) => `PKR ${currency(n)}`;
const signed = (n: number) => `${n >= 0 ? "+" : "—"}PKR ${currency(Math.abs(n))}`;
const NO_SCROLL = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function chartLabelValue(props: Record<string, unknown>): number | null {
  const candidates = [props.value, props.label];
  const payload = props.payload as Record<string, unknown> | undefined;
  const key = typeof props.dataKey === "string" ? props.dataKey : typeof props.name === "string" ? props.name : "";
  if (payload && key) candidates.push(payload[key]);
  for (const v of candidates) {
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function BarEndLabel(props: Record<string, unknown>) {
  const n = chartLabelValue(props);
  if (n == null) return null;
  const x = Number(props.x) || 0;
  const y = Number(props.y) || 0;
  const width = Number(props.width) || 0;
  const height = Number(props.height) || 0;
  const layout = props.layout === "vertical" ? "vertical" : "horizontal";
  const txt = currency(n);
  if (layout === "vertical") {
    const barW = Math.abs(width);
    const end = (width < 0 ? x + width : x) + barW;
    return (
      <text x={end + 5} y={y + height / 2} dominantBaseline="middle" fontSize={8} fontWeight={700} fill="#0B1220">
        {txt}
      </text>
    );
  }
  const up = n >= 0;
  return (
    <text x={x + width / 2} y={up ? y - 6 : y + height + 13} textAnchor="middle" fontSize={8} fontWeight={700} fill="#0B1220">
      {txt}
    </text>
  );
}

/** Auto commentary: streak + month-over-month movement. */
function buildInsights(report: MonthlyReport) {
  const idx = report.history.findIndex(h => h.month === report.month);
  const prev = idx > 0 ? report.history[idx - 1] : null;
  const net = report.totals.netProfit;

  let lossStreak = 0;
  for (let i = idx - 1; i >= 0; i--) {
    if (report.history[i].net < 0) lossStreak++;
    else break;
  }
  let profitStreak = 0;
  for (let i = idx - 1; i >= 0; i--) {
    if (report.history[i].net >= 0) profitStreak++;
    else break;
  }

  const profitNote =
    net >= 0
      ? lossStreak > 0
        ? `1st profit month after ${lossStreak} straight loss${lossStreak > 1 ? "es" : ""}`
        : "Profit month"
      : profitStreak > 0
        ? `Loss after ${profitStreak} profitable month${profitStreak > 1 ? "s" : ""}`
        : "Loss month";

  return {
    prev,
    profitNote,
    revenueVsPrev: prev ? report.totals.revenue - prev.revenue : null,
    costVsPrev: prev ? report.totals.totalCost - prev.cost : null,
    netVsPrev: prev ? net - prev.net : null,
  };
}

type CashChannel = "AH" | "SN" | "QHM" | "HM";

const PIE_COLORS: Record<CashChannel, string> = {
  AH: "#1B6FE8",
  SN: "#0B84F3",
  QHM: "#0B1220",
  HM: "#334155",
};

const PIE_LEGEND: { key: CashChannel; name: string }[] = [
  { key: "AH", name: "Ahmed Hamza" },
  { key: "SN", name: "Sharjeel Nasir" },
  { key: "QHM", name: "Qasim Habib Metro" },
  { key: "HM", name: "CO. Habib Metro" },
];

const CF_CARDS: { key: CashChannel; label: string; hint: string; bg: string }[] = [
  { key: "AH", label: "AH", hint: "Ahmed Hamza · received", bg: "bg-[#1B6FE8]" },
  { key: "SN", label: "SN", hint: "Sharjeel Nasir · received", bg: "bg-[#0B84F3]" },
  { key: "QHM", label: "Qasim Habib Metro", hint: "Qasim Habib Metro · received", bg: "bg-[#0B1220]" },
  { key: "HM", label: "Habib Metro", hint: "CO. Habib Metro · received", bg: "bg-[#334155]" },
];

function channelForBank(bank: string): CashChannel | null {
  const t = bank.trim().toLowerCase();
  if (t.includes("qasim") || t.includes("qhm")) return "QHM";
  if (/\bah\b/.test(t) || t.includes("ahmed") || t.includes("ah paypal")) return "AH";
  if (/\bsn\b/.test(t) || t.includes("sharjeel")) return "SN";
  if (t.includes("habib") || t.includes("metro")) return "HM";
  return null;
}

function cashChannelReceived(report: MonthlyReport): Record<CashChannel, number> {
  const sums: Record<CashChannel, number> = { AH: 0, SN: 0, QHM: 0, HM: 0 };
  for (const b of report.cash.banks ?? []) {
    const key = channelForBank(b.bank);
    if (!key) continue;
    sums[key] += Number(b.debit) || 0;
  }
  return sums;
}

function reportPieSlices(report: MonthlyReport): { name: CashChannel; value: number; color: string }[] {
  const sums = cashChannelReceived(report);
  return (["AH", "SN", "QHM", "HM"] as const).map(name => ({
    name,
    value: sums[name],
    color: PIE_COLORS[name],
  }));
}

/** Plain-language month position from the full report (KPIs, budget, cash, history). */
function buildPositionSummary(report: MonthlyReport): string[] {
  const label = monthLabel(report.month);
  const ins = buildInsights(report);
  const t = report.totals;
  const bc = report.budgetCompare;
  const hist3 = report.history.slice(-3);
  const hist6 = report.history;
  const sum = (rows: MonthlyReport["history"]) =>
    rows.reduce((a, h) => ({ revenue: a.revenue + h.revenue, cost: a.cost + h.cost, net: a.net + h.net }), {
      revenue: 0,
      cost: 0,
      net: 0,
    });
  const s3 = sum(hist3);
  const s6 = sum(hist6);
  const targetRev = bc?.totals.budgetRevenue ?? 0;
  const planExp = bc?.totals.budgetExpense ?? 0;
  const revVsTarget = targetRev > 0 ? t.revenue - targetRev : null;
  const expVsPlan = planExp > 0 ? t.totalCost - planExp : null;
  const topOver = [...(bc?.rows ?? [])]
    .filter(r => r.actual > 0 || r.budget > 0)
    .sort((a, b) => b.variance - a.variance)[0];
  const slices = reportPieSlices(report).filter(s => s.value > 0);
  const mixLead = [...slices].sort((a, b) => b.value - a.value)[0];
  const mixNames: Record<string, string> = {
    AH: "Ahmed Hamza",
    SN: "Sharjeel Nasir",
    HM: "CO. Habib Metro",
    QHM: "Qasim Habib Metro",
  };

  const p1 = [
    `${label} closed with ${t.netProfit >= 0 ? "a profit" : "a loss"} of ${signed(t.netProfit)} (${ins.profitNote.toLowerCase()}).`,
    `Actual revenue was ${pkr(t.revenue)}${
      revVsTarget != null
        ? ` against a target of ${pkr(targetRev)} (${revVsTarget >= 0 ? "ahead" : "short"} ${signed(revVsTarget)})`
        : ""
    }.`,
    `Total cost was ${pkr(t.totalCost)} (payroll ${pkr(t.payroll)} · OPEX ${pkr(t.opex)})${
      expVsPlan != null
        ? `, ${expVsPlan > 0 ? "over" : expVsPlan < 0 ? "under" : "on"} the expense plan by ${signed(expVsPlan)}`
        : ""
    }.`,
  ].join(" ");

  const p2 = [
    `Net cash stands at ${pkr(report.cash.closingNet)}${report.cash.asOf ? ` as of ${report.cash.asOf}` : ""}, with ${signed(report.cash.monthNet)} movement this month.`,
    mixLead
      ? ` Collections are led by ${mixNames[mixLead.name] ?? mixLead.name} (${pkr(mixLead.value)}).`
      : "",
    topOver && topOver.variance > 0
      ? ` Largest plan overrun is ${topOver.name} (${signed(topOver.variance)} over budget).`
      : topOver && topOver.variance < 0
        ? ` Spend is running under plan on ${topOver.name} (${signed(topOver.variance)}).`
        : "",
  ].join("");

  const p3 = `Last 3 months combined: ${pkr(s3.revenue)} revenue, ${pkr(s3.cost)} cost, net ${signed(s3.net)}. Last 6 months combined: ${pkr(s6.revenue)} revenue, ${pkr(s6.cost)} cost, net ${signed(s6.net)}.${
    ins.revenueVsPrev != null ? ` Versus the prior month, revenue moved ${signed(ins.revenueVsPrev)} and cost moved ${signed(ins.costVsPrev ?? 0)}.` : ""
  }`;

  return [p1, p2.trim(), p3];
}


/** Archive a downloaded file to Cloudinary (UI list is hidden). Non-blocking for the user. */
async function archiveReportFile(report: MonthlyReport, blob: Blob, fileName: string): Promise<SavedMonthlyReport | null> {
  const form = new FormData();
  form.append("file", blob, fileName);
  form.append("month", report.month);
  if (report.sourceDate) form.append("sourceDate", report.sourceDate);
  form.append("totals", JSON.stringify(report.totals));

  const res = await API.post("/accounts/reports/monthly/save", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60_000,
  });
  return (res.data.report as SavedMonthlyReport) ?? null;
}

/** MoM movement arrow – goodWhenUp: revenue up = green, cost up = red. */
function TrendArrow({ v, goodWhenUp }: { v: number | null; goodWhenUp: boolean }) {
  if (v == null) return <span className="text-[9px] text-crm-text-faint">–</span>;
  const up = v >= 0;
  const good = goodWhenUp ? up : !up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold ${good ? "text-[#0B84F3]" : "text-[#1B6FE8]"}`}>
      <Icon size={10} className="shrink-0" />
      {signed(v)}
    </span>
  );
}

function ReportBlock({
  children,
  className = "",
  skipExport = false,
}: {
  children: React.ReactNode;
  className?: string;
  skipExport?: boolean;
}) {
  return (
    <div data-report-block {...(skipExport ? { "data-export-skip": "" } : {})} className={className}>
      {children}
    </div>
  );
}

function SectionCard({
  title,
  children,
  asBlock = true,
  skipExport = false,
  variant = "card",
}: {
  title: string;
  children: React.ReactNode;
  asBlock?: boolean;
  skipExport?: boolean;
  variant?: "card" | "table";
}) {
  const shell =
    variant === "table"
      ? "rounded-xl border border-[#E2E8F0] bg-white overflow-hidden h-full"
      : `${BENTO_CARD} overflow-hidden h-full`;
  return (
    <div
      {...(asBlock ? { "data-report-block": "" } : {})}
      {...(skipExport ? { "data-export-skip": "" } : {})}
      className={shell}
    >
      <div className="px-4 sm:px-5 pt-4 pb-2">
        <h2 className="font-extrabold text-[#0B1220] dark:text-crm-text text-sm tracking-tight border-b-2 border-[#1B6FE8] pb-2">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function HistoryPerformanceHalf({
  title,
  rows,
  allHistory,
  currentMonth,
  chartId,
}: {
  title: string;
  rows: MonthlyReport["history"];
  allHistory: MonthlyReport["history"];
  currentMonth: string;
  chartId: string;
}) {
  const totals = rows.reduce(
    (a, h) => ({ revenue: a.revenue + h.revenue, cost: a.cost + h.cost, net: a.net + h.net }),
    { revenue: 0, cost: 0, net: 0 },
  );
  return (
    <div>
      <div className="px-4 sm:px-5 pt-3 pb-1">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-[#1B6FE8]">{title}</h3>
      </div>
      <div className={`overflow-x-auto ${NO_SCROLL}`}>
        <table className="w-full text-sm">
          <thead className="bg-[#0B1220]">
            <tr>
              <th className={`${thCls} text-left`}>Month</th>
              <th className={`${thCls} text-right`}>Revenue (PKR)</th>
              <th className={`${thCls} text-right`}>Total Cost (PKR)</th>
              <th className={`${thCls} text-right`}>Net P/L (PKR)</th>
              <th className={`${thCls} text-center w-24`}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-crm-text-faint text-xs">
                  No income statement records yet.
                </td>
              </tr>
            ) : (
              rows.map(h => {
                const idx = allHistory.findIndex(x => x.month === h.month);
                const prev = idx > 0 ? allHistory[idx - 1] : null;
                return (
                  <tr
                    key={h.month}
                    className={`border-b border-crm-border-subtle ${h.month === currentMonth ? "bg-[#FFF6F8]" : "bg-crm-surface"}`}
                  >
                    <td className={`${tdCls} font-bold text-crm-text`}>
                      {monthShort(h.month)}
                      {h.month === currentMonth && (
                        <span className="ml-2 text-[9px] font-bold text-[#1B6FE8] uppercase">This report</span>
                      )}
                    </td>
                    <td className={`${tdCls} text-right tabular-nums`}>
                      {currency(h.revenue)}
                      <div>
                        <TrendArrow v={prev ? h.revenue - prev.revenue : null} goodWhenUp />
                      </div>
                    </td>
                    <td className={`${tdCls} text-right tabular-nums`}>
                      {currency(h.cost)}
                      <div>
                        <TrendArrow v={prev ? h.cost - prev.cost : null} goodWhenUp={false} />
                      </div>
                    </td>
                    <td className={`${tdCls} text-right font-bold tabular-nums ${h.net >= 0 ? "text-[#0B84F3]" : "text-[#1B6FE8]"}`}>
                      {signed(h.net)}
                    </td>
                    <td className={`${tdCls} text-center`}>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          h.net >= 0 ? "bg-[#EFF6FF] text-[#0B84F3]" : "bg-[#EAF2FE] text-[#1B6FE8]"
                        }`}
                      >
                        {h.net >= 0 ? "Profit" : "Loss"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-crm-border bg-[#FAFBFC]">
                <td className="px-3 py-2.5 font-extrabold text-crm-text text-xs">TOTAL</td>
                <td className="px-3 py-2.5 text-right font-extrabold tabular-nums text-xs">{currency(totals.revenue)}</td>
                <td className="px-3 py-2.5 text-right font-extrabold tabular-nums text-xs">{currency(totals.cost)}</td>
                <td className={`px-3 py-2.5 text-right font-extrabold tabular-nums text-xs ${totals.net >= 0 ? "text-[#0B84F3]" : "text-[#1B6FE8]"}`}>
                  {signed(totals.net)}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      totals.net >= 0 ? "bg-[#EFF6FF] text-[#0B84F3]" : "bg-[#EAF2FE] text-[#1B6FE8]"
                    }`}
                  >
                    {totals.net >= 0 ? "Profit" : "Loss"}
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {rows.length > 0 && (
        <div className={`px-3 pb-3 pt-1 overflow-hidden ${NO_SCROLL}`} id={chartId}>
          <RechartsBox height={200} className="overflow-hidden">
            <BarChart
              data={rows.map(h => ({
                name: monthShort(h.month),
                profit: h.net > 0 ? h.net : null,
                loss: h.net < 0 ? h.net : null,
              }))}
              barSize={22}
              margin={{ top: 28, right: 12, left: 8, bottom: 22 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 600, fill: "#0B1220" }} />
              <YAxis tick={{ fontSize: 10, fill: "#64748B" }} width={52} />
              <ReferenceLine y={0} stroke="#0B1220" strokeWidth={1} />
              <Tooltip formatter={v => pkr(Number(v ?? 0))} />
              <Bar dataKey="profit" name="Profit" fill="#0B84F3" radius={[6, 6, 0, 0]} maxBarSize={28}>
                <LabelList dataKey="profit" position="top" content={props => <BarEndLabel {...props} layout="horizontal" />} />
              </Bar>
              <Bar dataKey="loss" name="Loss" fill="#1B6FE8" radius={[0, 0, 6, 6]} maxBarSize={28}>
                <LabelList dataKey="loss" position="bottom" content={props => <BarEndLabel {...props} layout="horizontal" />} />
              </Bar>
            </BarChart>
          </RechartsBox>
        </div>
      )}
    </div>
  );
}

function BudgetVsActualBars({
  data,
  label,
  chartId = "report-chart-budget",
}: {
  data: NonNullable<MonthlyReport["budgetCompare"]>;
  label: string;
  chartId?: string;
}) {
  if (data.rows.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-xs text-crm-text-faint">No budget / actual lines for this month.</p>
    );
  }
  const rowH = 36;
  return (
    <div className={`px-1 sm:px-2 min-w-0 h-full overflow-hidden ${NO_SCROLL}`} id={chartId}>
      <RechartsBox height={Math.max(260, data.rows.length * rowH + 44)} className="overflow-hidden">
        <BarChart
          data={data.rows.map(r => ({
            name: r.name.replace(/\s*\(incl\.[^)]*\)/gi, ""),
            Planned: r.budget,
            Actual: r.actual,
          }))}
          layout="vertical"
          barSize={10}
          barGap={2}
          barCategoryGap={10}
          margin={{ left: 8, right: 88, top: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
          <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => currency(Number(v))} />
          <YAxis
            type="category"
            dataKey="name"
            width={148}
            interval={0}
            tick={{ fontSize: 9, fontWeight: 600, fill: "#0B1220" }}
          />
          <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
          <Bar dataKey="Planned" fill="#0B1220" radius={[0, 6, 6, 0]} isAnimationActive={false}>
            <LabelList dataKey="Planned" content={props => <BarEndLabel {...props} layout="vertical" />} />
          </Bar>
          <Bar dataKey="Actual" fill="#0B84F3" radius={[0, 6, 6, 0]} isAnimationActive={false}>
            <LabelList dataKey="Actual" content={props => <BarEndLabel {...props} layout="vertical" />} />
          </Bar>
        </BarChart>
      </RechartsBox>
      <p className="text-[11px] text-crm-text-muted mt-1 px-2">
        Black = Planned. Blue = Actual – latest IS day for {label}.
      </p>
    </div>
  );
}

const thCls = "px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white";
const tdCls = "px-3 py-2 text-xs";

function formatSalaryCell(col: string, value: string | number) {
  if (typeof value === "string") return value;
  if (/%/.test(col)) return `${value}%`;
  return currency(value);
}

function SalaryFieldTableView({ table }: { table: SalaryFieldTable }) {
  return (
    <div className={`overflow-x-auto ${NO_SCROLL}`}>
      <table className="w-full text-sm min-w-200">
        <thead className="bg-[#0B1220]">
          <tr className="border-b border-crm-border/80">
            {table.columns.map((c, i) => (
              <th key={c} className={`${thCls} ${i === 0 ? "text-left" : "text-right"}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.length === 0 ? (
            <tr>
              <td colSpan={table.columns.length} className="px-3 py-6 text-center text-crm-text-faint text-xs">
                No employees on this Income Statement head.
              </td>
            </tr>
          ) : (
            table.rows.map(r => (
              <tr key={r.employee} className="border-b border-crm-border-subtle">
                {r.cells.map((c, i) => (
                  <td
                    key={`${r.employee}-${table.columns[i] ?? i}`}
                    className={`${tdCls} ${i === 0 ? "font-semibold text-crm-text" : "text-right tabular-nums"} ${i === r.cells.length - 1 ? "font-bold text-[#1B6FE8]" : ""}`}
                  >
                    {formatSalaryCell(table.columns[i] ?? "", c)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[#1B6FE8]/20 bg-[#1B6FE8]/5">
            <td className="px-3 py-2.5 font-extrabold text-crm-text text-xs">TOTAL</td>
            <td className="px-3 py-2.5 text-right font-extrabold tabular-nums text-[#1B6FE8] text-xs" colSpan={Math.max(table.columns.length - 1, 1)}>
              {currency(table.total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function OpexFieldTableView({ tables, total }: { tables: OpexFieldTable[]; total: number }) {
  return (
    <div className={`overflow-x-auto ${NO_SCROLL}`}>
      <table className="w-full text-sm min-w-160 border-collapse">
        <thead className="bg-[#0B1220]">
          <tr>
            <th className={`${thCls} text-left`}>Head</th>
            <th className={`${thCls} text-left`}>Individual</th>
            <th className={`${thCls} text-center`}>Filled date</th>
            <th className={`${thCls} text-left`}>Notes / Image</th>
            <th className={`${thCls} text-right`}>Amount (PKR)</th>
          </tr>
        </thead>
        <tbody>
          {tables.length === 0 ? (
            <tr><td colSpan={5} className="px-3 py-6 text-center text-crm-text-faint text-xs border border-[#E2E8F0]">No entries this month.</td></tr>
          ) : (
            tables.flatMap(h => [
              <tr key={h.name} className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <td className={`${tdCls} font-bold text-crm-text border border-[#E2E8F0]`}>{h.name}</td>
                <td className={`${tdCls} border border-[#E2E8F0]`} />
                <td className={`${tdCls} text-center text-crm-text-muted border border-[#E2E8F0]`}>{h.filledAt || "–"}</td>
                <td className={`${tdCls} text-crm-text-muted border border-[#E2E8F0]`}>{h.notes || "–"}</td>
                <td className={`${tdCls} text-right font-bold tabular-nums border border-[#E2E8F0]`}>{currency(h.amount)}</td>
              </tr>,
              ...h.lines.map(l => (
                <tr key={`${h.name}-${l.label}-${l.filledAt}`} className="border-b border-[#E2E8F0] bg-white">
                  <td className="border border-[#E2E8F0]" />
                  <td className="px-3 py-1.5 pl-6 text-[11px] text-crm-text border border-[#E2E8F0]">{l.label}</td>
                  <td className="px-3 py-1.5 text-center text-[11px] text-crm-text-muted border border-[#E2E8F0]">{l.filledAt || "–"}</td>
                  <td className="px-3 py-1.5 text-[11px] text-crm-text-muted border border-[#E2E8F0]">{l.proofName || "–"}</td>
                  <td className="px-3 py-1.5 text-right text-[11px] tabular-nums text-crm-text border border-[#E2E8F0]">{currency(l.amount)}</td>
                </tr>
              )),
            ])
          )}
        </tbody>
        <tfoot>
          <tr className="bg-[#EAF2FE]">
            <td className="px-3 py-2.5 font-extrabold text-crm-text text-xs border border-[#E2E8F0]" colSpan={4}>TOTAL</td>
            <td className="px-3 py-2.5 text-right font-extrabold tabular-nums text-[#1B6FE8] text-xs border border-[#E2E8F0]">{currency(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function BudgetComparePanel({
  data,
  label,
  showChart = true,
  showMinis = true,
}: {
  data: NonNullable<MonthlyReport["budgetCompare"]>;
  label: string;
  showChart?: boolean;
  showMinis?: boolean;
}) {
  return (
    <>
      {showMinis && (
      <div className="px-4 pb-3 grid grid-cols-2 xl:grid-cols-4 gap-2.5">
        {[
          { label: "Planned revenue", value: data.totals.budgetRevenue, note: "IS budget", cls: "text-[#0B1220]" },
          { label: "Actual revenue", value: data.totals.actualRevenue, note: "Collections", cls: "text-[#0B84F3]" },
          { label: "Planned expense", value: data.totals.budgetExpense, note: "Payroll + OPEX plan", cls: "text-[#0B1220]" },
          { label: "Actual expense", value: data.totals.actualExpense, note: `Vs plan ${signed(data.totals.variance)}`, cls: data.totals.variance > 0 ? "text-[#1B6FE8]" : "text-[#0B84F3]" },
        ].map(c => (
          <div key={c.label} className="rounded-xl border border-crm-border-subtle bg-[#FAFBFC] px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-crm-text-faint">{c.label}</p>
            <p className={`text-base font-extrabold tabular-nums mt-1 ${c.cls}`}>{pkr(c.value)}</p>
            <p className="text-[10px] text-crm-text-muted mt-0.5">{c.note}</p>
          </div>
        ))}
      </div>
      )}
      <div className={`overflow-x-auto ${NO_SCROLL}`}>
        <table className="w-full text-sm min-w-160">
          <thead className="bg-[#0B1220]">
            <tr>
              <th className={`${thCls} text-left`}>Head</th>
              <th className={`${thCls} text-right`}>Planned budget (PKR)</th>
              <th className={`${thCls} text-right`}>Actual spent (PKR)</th>
              <th className={`${thCls} text-right`}>Variance</th>
              <th className={`${thCls} text-center w-24`}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-crm-text-faint text-xs">
                  No budget / actual lines for this month.
                </td>
              </tr>
            ) : (
              data.rows.map(r => {
                const over = r.variance > 0;
                return (
                  <tr key={r.key} className="border-b border-crm-border-subtle">
                    <td className={`${tdCls} font-bold text-crm-text`}>{r.name}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{currency(r.budget)}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{currency(r.actual)}</td>
                    <td className={`${tdCls} text-right font-bold tabular-nums ${over ? "text-[#1B6FE8]" : "text-[#0B84F3]"}`}>
                      {signed(r.variance)}
                    </td>
                    <td className={`${tdCls} text-center`}>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        over ? "bg-[#EAF2FE] text-[#1B6FE8]" : r.variance < 0 ? "bg-[#EFF6FF] text-[#0B84F3]" : "bg-[#F8FAFC] text-[#0B1220]"
                      }`}>
                        {over ? "Over" : r.variance < 0 ? "Under" : "On plan"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {data.rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[#0B1220]/10 bg-[#F8FAFC]">
                <td className="px-3 py-2.5 font-extrabold text-crm-text text-xs">EXPENSE TOTAL</td>
                <td className="px-3 py-2.5 text-right font-extrabold tabular-nums text-xs">{currency(data.totals.budgetExpense)}</td>
                <td className="px-3 py-2.5 text-right font-extrabold tabular-nums text-xs">{currency(data.totals.actualExpense)}</td>
                <td className={`px-3 py-2.5 text-right font-extrabold tabular-nums text-xs ${data.totals.variance > 0 ? "text-[#1B6FE8]" : "text-[#0B84F3]"}`}>
                  {signed(data.totals.variance)}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    data.totals.variance > 0 ? "bg-[#EAF2FE] text-[#1B6FE8]" : "bg-[#EFF6FF] text-[#0B84F3]"
                  }`}>
                    {data.totals.variance > 0 ? "Over" : data.totals.variance < 0 ? "Under" : "On plan"}
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {showChart && <BudgetVsActualBars data={data} label={label} />}
    </>
  );
}

export default function AccountsReportsPage() {
  const [month, setMonth] = useState<string>(currentMonthIso());
  const [result, setResult] = useState<{ month: string; report: MonthlyReport | null } | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("month");
    if (m && /^\d{4}-\d{2}$/.test(m)) setMonth(m);
  }, []);

  // Loading is derived – true until the fetched result matches the selected month
  const loading = result?.month !== month;
  const report = result?.month === month ? result.report : null;
  useScrollToHash(!loading);

  useEffect(() => {
    restoreExportButtons();
  }, []);

  useEffect(() => {
    let cancelled = false;
    API.get(`/accounts/reports/monthly?month=${month}`)
      .then(res => {
        if (!cancelled) setResult({ month, report: res.data as MonthlyReport });
      })
      .catch(err => {
        if (!cancelled) {
          toast.error(apiErrorMessage(err, "Failed to load monthly report."));
          setResult({ month, report: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  const handleExport = async () => {
    if (!report) return;
    restoreExportButtons();
    setExporting(true);
    const toastId = "acct-report-pdf";
    try {
      const root = exportRootRef.current;
      if (!root) throw new Error("Report is not on screen.");
      toast.loading("Capturing this page for PDF…", { id: toastId });
      const blob = await captureReportVisualPdf(root, {
        footer: `BEM Solutions CRM · Accounts Report · ${monthLabel(report.month)}`,
        onProgress: (done, total) => {
          toast.loading(`Capturing report ${done}/${total}…`, { id: toastId });
        },
      });
      const fileName = `Accounts-Report-${report.month}.pdf`;
      triggerLocalDownload(blob, fileName);
      toast.success("PDF downloaded – same layout and charts as this page.", { id: toastId });

      void archiveReportFile(report, blob, fileName).catch(err => {
        console.warn(apiErrorMessage(err, "Cloud archive failed."));
      });
    } catch (err) {
      toast.error(
        apiErrorMessage(err, "PDF capture failed. Keep this report page open and try Save as PDF again."),
        { id: toastId },
      );
    } finally {
      restoreExportButtons();
      setExporting(false);
    }
  };

  const exportFnRef = useRef(handleExport);
  exportFnRef.current = handleExport;
  useAccountsVisualPdf({
    ready: !!report && !loading,
    rootRef: exportRootRef,
    fileName: `Accounts-Report-${month}.pdf`,
    footer: `BEM Solutions CRM · Accounts Report · ${monthLabel(month)}`,
    exportFn: () => exportFnRef.current(),
  });

  const ins = report ? buildInsights(report) : null;
  const label = monthLabel(month);

  const pieSlices = report ? reportPieSlices(report) : [];
  const pieHasData = pieSlices.some(s => s.value > 0);
  const positionSummary = report ? buildPositionSummary(report) : [];

  const received = report ? cashChannelReceived(report) : { AH: 0, SN: 0, QHM: 0, HM: 0 };

  const kpis = report
    ? [
        {
          label: "Targeted Revenue",
          value: pkr(report.budgetCompare?.totals.budgetRevenue ?? 0),
          note: report.budgetCompare?.hasBudget ? "Income Statement budget" : "No budget plan saved",
        },
        {
          label: "Actual Revenue",
          value: pkr(report.totals.revenue),
          note: ins?.revenueVsPrev != null ? `${signed(ins.revenueVsPrev)} vs prev month` : "Month collections",
        },
        {
          label: "Total cost",
          value: pkr(report.totals.totalCost),
          note:
            report.sourceDate
              ? `Matches IS Total Expense · ${report.sourceDate}`
              : ins?.costVsPrev != null
                ? `${signed(ins.costVsPrev)} vs prev month`
                : `Payroll ${pkr(report.totals.payroll)}`,
        },
        {
          label: "Profit / Loss",
          value: signed(report.totals.netProfit),
          note: ins?.profitNote ?? "",
        },
        {
          label: "Net balance",
          value: pkr(report.cash.closingNet),
          note: report.cash.asOf ? `As of ${report.cash.asOf}` : "Closing cash position",
        },
      ]
    : [];

  return (
    <div className="flex min-h-screen accounts-page-bg">
      <AccountsSidebar />
      <main className={`flex-1 min-w-0 overflow-x-hidden ${ACCOUNTS_MAIN_OFFSET}`}>
        <div
          id="monthly-report"
          ref={exportRootRef}
          className={`${STAFF_PAGE_PAD} scroll-mt-[80px]`}
        >
          <ReportBlock>
            <div className={`${BENTO_CARD} px-4 sm:px-5 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-end gap-3`}>
              <div className="min-w-0 flex-1">
                <h1 className="font-bold text-[#1B6FE8] text-xl sm:text-2xl tracking-tight leading-none">
                  Executive Summary
                </h1>
                <p className="text-[11px] sm:text-xs text-[#64748B] mt-2">
                  Accounts Team · {label}
                  {report?.daysRecorded != null ? ` · ${report.daysRecorded} day(s) recorded` : ""}
                  {report?.sourceDate ? ` · last ${report.sourceDate}` : ""} · BEM Solutions CRM
                </p>
              </div>
              <div data-export-hide className="flex items-center gap-2 shrink-0">
                <label className="inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-crm-border bg-[#F8FAFC] text-xs font-bold text-crm-text-secondary">
                  <CalendarDays size={14} className="text-[#1B6FE8]" />
                  <input
                    type="month"
                    value={month}
                    max={currentMonthIso()}
                    onChange={e => setMonth(e.target.value || currentMonthIso())}
                    className="bg-transparent outline-none text-sm font-semibold text-crm-text"
                  />
                </label>
                <button
                  type="button"
                  disabled={!report || loading || exporting}
                  onClick={() => void handleExport()}
                  className="h-10 px-4 rounded-xl bg-[#1B6FE8] text-white text-xs font-bold inline-flex items-center gap-2 hover:bg-[#9a0e26] disabled:opacity-50 transition-colors shadow-md shadow-[#1B6FE8]/25"
                  title="Download PDF – exact visual of this report page, including charts"
                >
                  {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
                  {exporting ? "Downloading…" : "Save as PDF"}
                </button>
              </div>
            </div>
          </ReportBlock>

          {loading ? (
            <div className="bg-crm-surface rounded-2xl border border-crm-border-subtle/90 py-24 flex flex-col items-center justify-center gap-3 text-crm-text-faint">
              <Loader2 size={28} className="animate-spin text-[#1B6FE8]" />
              <p className="text-sm font-semibold">Building {label} report…</p>
            </div>
          ) : !report ? (
            <div className="bg-crm-surface rounded-2xl border border-crm-border-subtle/90 py-24 text-center text-crm-text-faint text-sm">
              Report did not load – select a month or try again.
            </div>
          ) : (
            <>
              <ReportBlock>
              <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5">
                {kpis.map(k => (
                  <div key={k.label} className={`${BENTO_CARD} h-full p-3.5 sm:p-4`}>
                    <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#1B6FE8] leading-snug">{k.label}</p>
                    <p className="text-lg sm:text-xl font-extrabold mt-1.5 tabular-nums tracking-tight text-[#0B1220]">{k.value}</p>
                    <p className="text-[9px] sm:text-[10px] text-[#64748B] mt-1 font-medium leading-snug">{k.note}</p>
                  </div>
                ))}
              </section>
              </ReportBlock>

              <ReportBlock>
              <section
                data-pdf-pair
                className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 items-stretch min-w-0"
              >
                <AccountsChartCard
                  className="min-w-0 h-full"
                  title="Company Balance"
                  subtitle="Cash flow received – AH · SN · Qasim Habib Metro · Habib Metro"
                  accent="#1B6FE8"
                  icon={<PieIcon size={16} />}
                >
                  <div className="h-full min-h-[16rem] grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-center min-w-0">
                    <RechartsBox height={220} className="overflow-hidden">
                      <PieChart>
                        <Pie
                          data={pieHasData ? pieSlices : pieSlices.map(s => ({ ...s, value: 1 }))}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={52}
                          outerRadius={92}
                          paddingAngle={3}
                          isAnimationActive={false}
                          stroke="#fff"
                          strokeWidth={3}
                        >
                          {pieSlices.map(s => (
                            <Cell key={s.name} fill={s.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v, name) => [
                            pieHasData ? pkr(Number(v ?? 0)) : "No collections",
                            PIE_LEGEND.find(l => l.key === name)?.name ?? String(name ?? ""),
                          ]}
                        />
                      </PieChart>
                    </RechartsBox>
                    <ul className="flex flex-col justify-center gap-2.5 px-2 py-1">
                      {PIE_LEGEND.map(l => {
                        const slice = pieSlices.find(s => s.name === l.key);
                        return (
                          <li key={l.key} className="flex items-center gap-2 min-w-36">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[l.key] }} />
                            <div className="min-w-0">
                              <p className="text-[11px] font-extrabold text-crm-text leading-none">{l.key}</p>
                              <p className="text-[10px] text-crm-text-muted truncate">{l.name}</p>
                              <p className="text-[10px] font-bold tabular-nums text-crm-text">{pkr(slice?.value ?? 0)}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  {!pieHasData && (
                    <p className="px-3 text-[11px] text-crm-text-faint">No cash-flow received amounts for {label}.</p>
                  )}
                </AccountsChartCard>

                <AccountsChartCard
                  className="min-w-0 h-full"
                  title={`Budget plan vs actual – ${label}`}
                  subtitle="As of this month · black planned · blue actual"
                  accent="#0B84F3"
                  icon={<TrendingUp size={16} />}
                >
                  {report.budgetCompare && report.budgetCompare.hasBudget ? (
                    <BudgetVsActualBars data={report.budgetCompare} label={label} />
                  ) : (
                    <p className="px-3 py-8 text-xs text-crm-text-muted text-center">
                      No Income Statement budget plan is saved for this month. Set a plan in the budget planner on the
                      Income Statement page.
                    </p>
                  )}
                </AccountsChartCard>
              </section>
              </ReportBlock>

              <SectionCard title="Financial performance">
                <HistoryPerformanceHalf
                  title="Last 3 months"
                  rows={report.history.slice(-3)}
                  allHistory={report.history}
                  currentMonth={report.month}
                  chartId="report-chart-net3"
                />
                <div className="border-t-2 border-[#1B6FE8]/15">
                  <HistoryPerformanceHalf
                    title="Last 6 months"
                    rows={report.history}
                    allHistory={report.history}
                    currentMonth={report.month}
                    chartId="report-chart-net6"
                  />
                </div>
              </SectionCard>

              <ReportBlock>
              <section className={`${BENTO_CARD} p-4 sm:p-5`}>
                <div className="flex items-start gap-3">
                  <span
                    className={`w-9 h-9 rounded-xl inline-flex items-center justify-center text-white shrink-0 ${
                      report.totals.netProfit >= 0 ? "bg-[#0B84F3]" : "bg-[#1B6FE8]"
                    }`}
                  >
                    <Sparkles size={16} />
                  </span>
                  <div className="min-w-0 space-y-2">
                    <h2 className="font-extrabold text-crm-text text-sm tracking-tight">
                      Company position – {label}
                    </h2>
                    {positionSummary.map((p, i) => (
                      <p key={i} className="text-xs text-crm-text-secondary leading-relaxed">
                        {p}
                      </p>
                    ))}
                  </div>
                </div>
              </section>
              </ReportBlock>

              <SectionCard title="Revenue – currency channels">
                <div className={`overflow-x-auto ${NO_SCROLL}`}>
                  <table className="w-full text-sm min-w-140">
                    <thead className="bg-[#0B1220]">
                      <tr>
                        <th className={`${thCls} text-left`}>Channel</th>
                        <th className={`${thCls} text-right`}>USD</th>
                        <th className={`${thCls} text-right`}>CAD</th>
                        <th className={`${thCls} text-right`}>PKR</th>
                        <th className={`${thCls} text-right`}>Net PKR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(report.revenueChannels ?? []).length === 0 ? (
                        <tr><td colSpan={5} className="px-3 py-6 text-center text-crm-text-faint text-xs">No channel amounts this month.</td></tr>
                      ) : (
                        (report.revenueChannels ?? []).map(c => (
                          <tr key={c.key} className="border-b border-crm-border-subtle">
                            <td className={`${tdCls} font-bold text-crm-text`}>{c.label}</td>
                            <td className={`${tdCls} text-right tabular-nums`}>{currency(c.usd)}</td>
                            <td className={`${tdCls} text-right tabular-nums`}>{currency(c.cad)}</td>
                            <td className={`${tdCls} text-right tabular-nums`}>{currency(c.pkr)}</td>
                            <td className={`${tdCls} text-right tabular-nums font-bold`}>{currency(c.netPkr)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[#0B84F3]/20 bg-[#EFF6FF]">
                        <td className="px-3 py-2.5 font-extrabold text-crm-text text-xs">TOTAL REVENUE</td>
                        <td className="px-3 py-2.5 text-right font-extrabold tabular-nums text-xs">{currency((report.revenueChannels ?? []).reduce((a, c) => a + c.usd, 0))}</td>
                        <td className="px-3 py-2.5 text-right font-extrabold tabular-nums text-xs">{currency((report.revenueChannels ?? []).reduce((a, c) => a + c.cad, 0))}</td>
                        <td className="px-3 py-2.5 text-right font-extrabold tabular-nums text-xs">{currency((report.revenueChannels ?? []).reduce((a, c) => a + c.pkr, 0))}</td>
                        <td className="px-3 py-2.5 text-right font-extrabold tabular-nums text-xs text-[#0B84F3]">{currency(report.totals.revenue)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </SectionCard>

              <SectionCard title={`Budget plan vs actual – ${label}`}>
                {report.budgetCompare && report.budgetCompare.hasBudget ? (
                  <BudgetComparePanel data={report.budgetCompare} label={label} showChart={false} showMinis={false} />
                ) : (
                  <p className="px-4 pb-4 text-xs text-crm-text-muted">
                    No Income Statement budget plan is saved for this month. Set a plan in the budget planner on the
                    Income Statement page.
                  </p>
                )}
              </SectionCard>

              <SectionCard title={`Cash flow statement${report.cash.asOf ? ` – as of ${report.cash.asOf}` : ""}`}>
                <div className="p-4">
                  <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5">
                    <div className="rounded-2xl p-3.5 text-white bg-[#1B6FE8] min-w-0 h-full">
                      <div className="flex items-center gap-1.5">
                        <Wallet size={14} className="text-white/80 shrink-0" />
                        <p className="text-[10px] font-bold uppercase tracking-wider text-white/75 truncate">Net Cash Flow</p>
                      </div>
                      <p className="text-lg sm:text-xl font-extrabold tabular-nums mt-1 truncate">{currency(report.cash.monthNet)}</p>
                      <p className="text-[9px] text-white/60 font-medium mt-0.5 truncate">
                        {report.cash.monthEntries ?? 0} entries · {label}
                      </p>
                    </div>
                    {CF_CARDS.map(c => (
                      <div key={c.key} className={`rounded-2xl p-3.5 text-white ${c.bg} min-w-0 h-full`}>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-white/80 truncate">{c.label}</p>
                        <p className="text-lg sm:text-xl font-extrabold tabular-nums mt-1 truncate">PKR {currency(received[c.key])}</p>
                        <p className="text-[9px] text-white/60 font-medium mt-0.5 truncate">{c.hint}</p>
                      </div>
                    ))}
                  </section>
                </div>
              </SectionCard>

              <ReportBlock>
              <div data-pdf-pair className="grid grid-cols-1 xl:grid-cols-12 gap-3.5 items-stretch">
                <div className="xl:col-span-7">
                  <SectionCard title={`CSR team performance – ${label}`} asBlock={false}>
                    <div className={`overflow-x-auto ${NO_SCROLL}`}>
                      <table className="w-full text-sm min-w-140">
                        <thead className="bg-[#0B1220]">
                          <tr className="border-b border-crm-border/80">
                            <th className={`${thCls} text-left`}>CSR</th>
                            <th className={`${thCls} text-right`}>Projects — {monthNameOnly(report.month)}</th>
                            <th className={`${thCls} text-right`}>Share %</th>
                            <th className={`${thCls} text-center`}>Status</th>
                            <th className={`${thCls} text-left`}>Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.csr.rows.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-3 py-6 text-center text-crm-text-faint text-xs">
                                No sales / team-lead CSRs recorded this month.
                              </td>
                            </tr>
                          ) : (
                            report.csr.rows.map((r, i) => {
                              const status = r.status || (r.projects > 0 ? "Active" : "Below Expectation");
                              return (
                                <tr key={`${r.code}-${r.name}`} className={`border-b border-crm-border-subtle ${i % 2 === 0 ? "bg-[#EFF6FF]" : "bg-crm-surface"}`}>
                                  <td className={`${tdCls} font-semibold text-crm-text`}>{r.name}</td>
                                  <td className={`${tdCls} text-right tabular-nums font-bold`}>{r.projects}</td>
                                  <td className={`${tdCls} text-right tabular-nums`}>{r.share.toFixed(1)}%</td>
                                  <td className={`${tdCls} text-center`}>
                                    <span className={`text-[11px] font-bold ${
                                      status === "Top Performer"
                                        ? "text-[#0B84F3]"
                                        : status === "Below Expectation"
                                          ? "text-red-600"
                                          : "text-crm-text"
                                    }`}>
                                      {status}
                                    </span>
                                  </td>
                                  <td className={`${tdCls} text-crm-text-secondary`}>{r.note || "–"}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 bg-[#0B1220]">
                            <td className="px-3 py-2.5 font-extrabold text-white text-xs">TOTAL</td>
                            <td className="px-3 py-2.5 text-right font-extrabold tabular-nums text-white text-xs">{report.csr.totalProjects}</td>
                            <td className="px-3 py-2.5 text-right font-extrabold tabular-nums text-white text-xs">100%</td>
                            <td />
                            <td className="px-3 py-2.5 text-[10px] text-white/70">Closing rate tracking live from {monthNameOnly(report.month)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </SectionCard>
                </div>
                <div className="xl:col-span-5">
                  <SectionCard title="Projects by CSR" asBlock={false}>
                    <div className={`p-4 min-w-0 overflow-hidden ${NO_SCROLL}`}>
                      <RechartsBox height={Math.max(240, report.csr.rows.length * 40)} className="overflow-hidden">
                        <BarChart
                          data={report.csr.rows.map(r => ({ name: r.name, projects: r.projects }))}
                          layout="vertical"
                          margin={{ left: 8, right: 48, top: 4, bottom: 4 }}
                          barSize={14}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                          <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                          <YAxis type="category" dataKey="name" width={110} interval={0} tick={{ fontSize: 10, fontWeight: 600 }} />
                          <Tooltip />
                          <Bar dataKey="projects" name="Projects" fill="#0B84F3" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                            <LabelList dataKey="projects" position="right" content={props => <BarEndLabel {...props} layout="vertical" />} />
                          </Bar>
                        </BarChart>
                      </RechartsBox>
                    </div>
                  </SectionCard>
                </div>
              </div>
              </ReportBlock>

              {(report.salaryTables ?? []).length === 0 ? (
                <SectionCard title={`Team salaries (${pkr(report.totals.payroll)})`}>
                  <p className="px-4 py-6 text-center text-xs text-crm-text-faint">
                    No employees on the latest Income Statement for this month.
                  </p>
                </SectionCard>
              ) : (
                (report.salaryTables ?? []).map(t => (
                  <SectionCard key={t.name} title={`${t.name} (${pkr(t.total)})`}>
                    <SalaryFieldTableView table={t} />
                  </SectionCard>
                ))
              )}

              <SectionCard title={`Operating expenses (${pkr(report.totals.opex)})`}>
                <OpexFieldTableView tables={report.opexTables ?? []} total={report.totals.opex} />
              </SectionCard>

              <ReportBlock>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 items-stretch">
                <SectionCard title={`Loans (${pkr(report.totals.loans)})`} asBlock={false}>
                  <OpexFieldTableView tables={report.loanTables ?? []} total={report.totals.loans} />
                </SectionCard>
                <SectionCard title={`Provident fund (${pkr(report.totals.pf)})`} asBlock={false}>
                  <OpexFieldTableView tables={report.pfTables ?? []} total={report.totals.pf} />
                </SectionCard>
              </div>
              </ReportBlock>

              <ReportBlock>
              <p className="text-center text-[10px] text-[#94A3B8] pb-6">
                Auto-generated from CRM accounts daily records, cash flow & payroll · {label}
              </p>
              </ReportBlock>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
