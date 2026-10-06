"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";
import API, { apiErrorMessage } from "@/lib/api";
import toast from "react-hot-toast";
import { currency } from "../types";
import AccountsChartCard from "./AccountsChartCard";
import RechartsBox from "@/app/components/charts/RechartsBox";
import {
  INCOME_BUDGET_STORE_DATE,
  monthEnd,
  monthLabel,
  monthStart,
  normalizeBudgetData,
  payrollKeys,
  type BudgetPeriod,
  type IncomeBudgetData,
} from "../utils/incomeBudget";

type Props = {
  /** Default month (YYYY-MM), usually from Income Statement record date */
  defaultMonth: string;
  /** Bump to reload after budget modal save */
  refreshKey?: number;
  onOpenBudget?: () => void;
};

type CompareRow = {
  name: string;
  budget: number;
  actual: number;
  key: string;
};

function shortName(label: string, max = 18): string {
  const t = label.replace(/\s*\(incl\.[^)]*\)/gi, "").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export default function BudgetVsActualCharts({
  defaultMonth,
  refreshKey = 0,
  onOpenBudget,
}: Props) {
  const [month, setMonth] = useState(defaultMonth.slice(0, 7));
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [opexRows, setOpexRows] = useState<CompareRow[]>([]);
  const [hasBudget, setHasBudget] = useState(false);

  useEffect(() => {
    if (defaultMonth?.slice(0, 7)) setMonth(defaultMonth.slice(0, 7));
  }, [defaultMonth]);

  const load = useCallback(async (ym: string) => {
    if (!/^\d{4}-\d{2}$/.test(ym)) return;
    setLoading(true);
    try {
      const from = monthStart(ym);
      const to = monthEnd(ym);
      const [budgetRes, actualRes] = await Promise.all([
        API.get(`/accounts/income_budget/${INCOME_BUDGET_STORE_DATE}`),
        API.get(
          `/accounts/income-budget/actuals?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        ),
      ]);

      const store = normalizeBudgetData(budgetRes.data.data as IncomeBudgetData);
      const period: BudgetPeriod | undefined = (store.quarters ?? []).find(
        q => q.monthKeys?.includes(ym) || (q.fromDate <= from && q.toDate >= to),
      );

      const byMonth = (actualRes.data.byMonth ?? {}) as Record<
        string,
        Partial<Record<string, number>>
      >;
      const opexLines = (actualRes.data.opexLines ?? []) as {
        key: string;
        label: string;
        months?: Record<string, number>;
      }[];

      const actualMap: Record<string, number> = {};
      for (const [k, v] of Object.entries(byMonth[ym] ?? {})) {
        actualMap[k] = Number(v) || 0;
      }
      for (const o of opexLines) {
        actualMap[o.key] = Number(o.months?.[ym]) || Number(actualMap[o.key]) || 0;
      }

      setHasBudget(!!period);

      if (!period) {
        setRows([]);
        setOpexRows([]);
        return;
      }

      const pk = payrollKeys();
      const core: CompareRow[] = period.lines
        .filter(l => l.kind === "core")
        .map(l => ({
          key: String(l.key),
          name: shortName(l.label),
          budget: Math.max(0, Number(l.months?.[ym]) || 0),
          actual: Math.max(0, Number(actualMap[l.key]) || 0),
        }))
        .filter(r => r.budget > 0 || r.actual > 0);

      // Roll OPEX heads into one bar for main chart + detail chart for heads
      const opexLinesPeriod = period.lines.filter(
        l => l.kind === "opex_head" || String(l.key).startsWith("opex_head::"),
      );
      const opexBudget = opexLinesPeriod.reduce(
        (a, l) => a + (Number(l.months?.[ym]) || 0),
        0,
      );
      const opexActual = opexLinesPeriod.reduce(
        (a, l) => a + (Number(actualMap[l.key]) || 0),
        0,
      );
      // Also include actuals for opex keys not yet in saved budget
      const opexActualExtra = opexLines.reduce((a, o) => {
        if (opexLinesPeriod.some(l => l.key === o.key)) return a;
        return a + (Number(o.months?.[ym]) || 0);
      }, 0);

      const mainRows = [...core];
      if (opexBudget > 0 || opexActual + opexActualExtra > 0) {
        mainRows.push({
          key: "opex_total",
          name: "OPEX (all)",
          budget: opexBudget,
          actual: opexActual + opexActualExtra,
        });
      }

      const order = [
        "revenue",
        "sales",
        "sales_commission",
        "technical",
        "technical_overtime",
        "email_marketing",
        "administration",
        "executive",
        "other_payroll",
        "opex_total",
      ];
      mainRows.sort((a, b) => {
        const ai = order.indexOf(a.key);
        const bi = order.indexOf(b.key);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        if (pk.has(a.key) && !pk.has(b.key)) return -1;
        if (!pk.has(a.key) && pk.has(b.key)) return 1;
        return a.name.localeCompare(b.name);
      });

      const detailOpex: CompareRow[] = opexLinesPeriod
        .map(l => ({
          key: String(l.key),
          name: shortName(l.label, 22),
          budget: Math.max(0, Number(l.months?.[ym]) || 0),
          actual: Math.max(0, Number(actualMap[l.key]) || 0),
        }))
        .filter(r => r.budget > 0 || r.actual > 0)
        .sort((a, b) => b.actual + b.budget - (a.actual + a.budget))
        .slice(0, 12);

      setRows(mainRows);
      setOpexRows(detailOpex);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load budget vs actual."));
      setRows([]);
      setOpexRows([]);
      setHasBudget(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(month);
  }, [month, refreshKey, load]);

  const totals = useMemo(() => {
    const budget = rows.reduce((a, r) => a + (r.key === "revenue" ? 0 : r.budget), 0);
    const actual = rows.reduce((a, r) => a + (r.key === "revenue" ? 0 : r.actual), 0);
    const revB = rows.find(r => r.key === "revenue")?.budget ?? 0;
    const revA = rows.find(r => r.key === "revenue")?.actual ?? 0;
    return {
      budgetExpense: budget,
      actualExpense: actual,
      budgetRevenue: revB,
      actualRevenue: revA,
      variance: actual - budget,
    };
  }, [rows]);

  return (
    <section className="mt-5 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-violet-100 bg-violet-50/40 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700">
            Budget vs Actual
          </p>
          <p className="text-sm font-extrabold text-crm-text mt-0.5">
            Month-wise comparison · {monthLabel(month)}
          </p>
          <p className="text-[11px] text-crm-text-muted mt-0.5">
            Budget vs Income Statement actuals for the selected month.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[10px] font-bold uppercase tracking-wide text-crm-text-muted">
            Filter month
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="mt-1 h-10 block rounded-xl border border-crm-border bg-crm-input px-3 text-sm text-crm-text outline-none focus:border-violet-500"
            />
          </label>
          <button
            type="button"
            onClick={() => void load(month)}
            disabled={loading}
            className="h-10 px-3 rounded-xl border border-crm-border text-xs font-bold text-sky-700 hover:bg-sky-50 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Refresh
          </button>
          {onOpenBudget && (
            <button
              type="button"
              onClick={onOpenBudget}
              className="h-10 px-3 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700"
            >
              Edit budget
            </button>
          )}
        </div>
      </div>

      {!loading && !hasBudget && (
        <div className="rounded-2xl border border-dashed border-violet-200 dark:border-violet-500/40 bg-crm-surface px-4 py-8 text-center">
          <p className="text-sm font-semibold text-crm-text-secondary">
            No saved budget found for {monthLabel(month)}.
          </p>
          <p className="text-xs text-crm-text-faint mt-1">
            Save a 3-month period that includes this month in the Budget planner first.
          </p>
          {onOpenBudget && (
            <button
              type="button"
              onClick={onOpenBudget}
              className="mt-3 h-9 px-4 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700"
            >
              Open budget planner
            </button>
          )}
        </div>
      )}

      {(hasBudget || loading) && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { label: "Budget revenue", value: totals.budgetRevenue, cls: "text-violet-700" },
              { label: "Actual revenue", value: totals.actualRevenue, cls: "text-violet-900" },
              { label: "Budget expense*", value: totals.budgetExpense, cls: "text-sky-700" },
              { label: "Actual expense* (from IS)", value: totals.actualExpense, cls: "text-sky-900" },
            ].map(c => (
              <div key={c.label} className="rounded-xl border border-crm-border-subtle bg-crm-surface px-3 py-2.5 shadow-sm">
                <p className="text-[9px] font-bold uppercase tracking-wide text-crm-text-faint">{c.label}</p>
                <p className={`text-sm font-extrabold tabular-nums mt-0.5 ${c.cls}`}>
                  {loading ? "…" : currency(c.value)}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-crm-text-faint -mt-1">
            Budget expense = dummy / planned numbers in the planner (white boxes). Actual expense = Income Statement payroll + OPEX for this month — typing dummy data does not change it. Loans/PF excluded. Variance:{" "}
            <span
              className={`font-bold ${
                totals.variance > 0 ? "text-amber-700" : totals.variance < 0 ? "text-emerald-700" : "text-crm-text-muted"
              }`}
            >
              {loading ? "…" : currency(totals.variance)}
            </span>{" "}
            (actual − budget)
          </p>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <AccountsChartCard
              title="Budget vs Actual"
              subtitle={`${monthLabel(month)} · category comparison`}
              accent="#7C3AED"
              icon={<BarChart3 size={16} />}
            >
              {loading ? (
                <div className="h-[280px] flex items-center justify-center text-crm-text-faint text-sm gap-2">
                  <Loader2 size={16} className="animate-spin" /> Loading…
                </div>
              ) : (
                <RechartsBox height={280}>
                  <BarChart
                    data={rows.length ? rows : [{ key: "_", name: "—", budget: 0, actual: 0 }]}
                    barGap={4}
                    barCategoryGap="18%"
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 600 }} interval={0} angle={-20} textAnchor="end" height={56} />
                    <YAxis tick={{ fontSize: 10 }} width={56} />
                    <Tooltip formatter={v => currency(Number(v ?? 0))} />
                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                    <Bar dataKey="budget" name="Budget" fill="#7C3AED" radius={[6, 6, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="actual" name="Actual" fill="#0B84F3" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </RechartsBox>
              )}
            </AccountsChartCard>

            <AccountsChartCard
              title="OPEX heads"
              subtitle={`${monthLabel(month)} · category budget vs spent`}
              accent="#F59E0B"
              icon={<BarChart3 size={16} />}
            >
              {loading ? (
                <div className="h-[280px] flex items-center justify-center text-crm-text-faint text-sm gap-2">
                  <Loader2 size={16} className="animate-spin" /> Loading…
                </div>
              ) : opexRows.length === 0 ? (
                <div className="h-[280px] flex items-center justify-center text-crm-text-faint text-xs px-4 text-center">
                  No OPEX budget/actual heads for this month.
                </div>
              ) : (
                <RechartsBox height={280}>
                  <BarChart
                    data={opexRows}
                    layout="vertical"
                    margin={{ left: 8, right: 12 }}
                    barGap={3}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={100}
                      tick={{ fontSize: 9, fontWeight: 600 }}
                    />
                    <Tooltip formatter={v => currency(Number(v ?? 0))} />
                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                    <Bar dataKey="budget" name="Budget" fill="#D97706" radius={[0, 6, 6, 0]} maxBarSize={14} />
                    <Bar dataKey="actual" name="Actual" fill="#F59E0B" radius={[0, 6, 6, 0]} maxBarSize={14} />
                  </BarChart>
                </RechartsBox>
              )}
            </AccountsChartCard>
          </div>
        </>
      )}
    </section>
  );
}
