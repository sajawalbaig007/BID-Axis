"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Loader2, PiggyBank, RefreshCw, Save, Sparkles, X } from "lucide-react";
import toast from "react-hot-toast";
import API, { apiErrorMessage } from "@/lib/api";
import { currency } from "../types";
import AmountInput from "./AmountInput";
import {
  defaultPeriodFromToday,
  ensurePeriod,
  INCOME_BUDGET_STORE_DATE,
  isBudgetExpenseLine,
  lineTotal,
  mergeOpexHeadsIntoPeriod,
  monthLabel,
  normalizeBudgetData,
  payrollKeys,
  predictNextPeriodBudget,
  shiftPeriod,
  threeMonthWindowFromStart,
  type BudgetLineKey,
  type BudgetPeriod,
  type IncomeBudgetData,
  upsertPeriod,
} from "../utils/incomeBudget";

type Props = {
  open: boolean;
  onClose: () => void;
};

type ActualsPayload = {
  byMonth?: Record<string, Partial<Record<string, number>>>;
  opexLines?: {
    key: string;
    label: string;
    headLabel?: string;
    months?: Record<string, number>;
  }[];
  daysRecorded: number;
};

export default function IncomeBudgetModal({ open, onClose }: Props) {
  const initial = defaultPeriodFromToday();
  const [fromDate, setFromDate] = useState(initial.fromDate);
  const [toDate, setToDate] = useState(initial.toDate);
  const [store, setStore] = useState<IncomeBudgetData>({ quarters: [] });
  const [period, setPeriod] = useState<BudgetPeriod>(() =>
    ensurePeriod(null, initial.fromDate, initial.toDate),
  );
  const [byMonthActuals, setByMonthActuals] = useState<
    Record<string, Partial<Record<string, number>>>
  >({});
  const [daysRecorded, setDaysRecorded] = useState(0);
  const [growthPct, setGrowthPct] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingActuals, setLoadingActuals] = useState(false);

  const monthKeys = period.monthKeys;
  const prediction = useMemo(
    () => predictNextPeriodBudget(period, byMonthActuals, growthPct),
    [period, byMonthActuals, growthPct],
  );

  const applyThreeMonthsFrom = useCallback((startDateOrYm: string, data?: IncomeBudgetData) => {
    const win = threeMonthWindowFromStart(startDateOrYm);
    setFromDate(win.fromDate);
    setToDate(win.toDate);
    setPeriod(ensurePeriod(data ?? store, win.fromDate, win.toDate));
  }, [store]);

  const loadStore = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get(`/accounts/income_budget/${INCOME_BUDGET_STORE_DATE}`);
      const data = normalizeBudgetData(res.data.data);
      setStore(data);
      setPeriod(prev => ensurePeriod(data, prev.fromDate, prev.toDate));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load budgets."));
      setStore({ quarters: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActuals = useCallback(async (from: string, to: string) => {
    setLoadingActuals(true);
    try {
      const res = await API.get(
        `/accounts/income-budget/actuals?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      const body = res.data as ActualsPayload;
      const monthly: Record<string, Partial<Record<string, number>>> = { ...(body.byMonth ?? {}) };
      for (const opex of body.opexLines ?? []) {
        for (const [ym, amt] of Object.entries(opex.months ?? {})) {
          if (!monthly[ym]) monthly[ym] = {};
          monthly[ym]![opex.key] = amt;
        }
      }
      setByMonthActuals(monthly);
      setDaysRecorded(Number(body.daysRecorded) || 0);
      setPeriod(prev => mergeOpexHeadsIntoPeriod(prev, body.opexLines ?? []));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load Income Statement actuals."));
      setByMonthActuals({});
      setDaysRecorded(0);
    } finally {
      setLoadingActuals(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadStore();
  }, [open, loadStore]);

  useEffect(() => {
    if (!open) return;
    void loadActuals(fromDate, toDate);
  }, [open, fromDate, toDate, loadActuals]);

  const setMonthBudget = (key: BudgetLineKey, monthKey: string, value: number) => {
    setPeriod(prev => ({
      ...prev,
      lines: prev.lines.map(l =>
        l.key === key
          ? { ...l, months: { ...l.months, [monthKey]: Math.max(0, value) } }
          : l,
      ),
    }));
  };

  const fillFromActuals = () => {
    setPeriod(prev => ({
      ...prev,
      lines: prev.lines.map(l => {
        const months = { ...l.months };
        for (const mk of prev.monthKeys) {
          months[mk] = Math.max(0, Number(byMonthActuals[mk]?.[l.key]) || 0);
        }
        return { ...l, months };
      }),
    }));
    toast.success("Monthly budgets filled from Income Statement actuals.");
  };

  const copyFilledMonthToEmpty = () => {
    const keys = period.monthKeys;
    const filled = keys.find(mk =>
      period.lines.some(l => (Number(l.months[mk]) || 0) > 0),
    );
    const empty = keys.filter(mk =>
      period.lines.every(l => (Number(l.months[mk]) || 0) === 0),
    );
    if (!filled || empty.length === 0) {
      toast.error("Fill at least one month first. Empty months will get that budget.");
      return;
    }
    setPeriod(prev => ({
      ...prev,
      lines: prev.lines.map(l => {
        const months = { ...l.months };
        const src = Number(l.months[filled]) || 0;
        for (const mk of empty) months[mk] = src;
        return { ...l, months };
      }),
    }));
    toast.success(`Copied ${monthLabel(filled)} budget into ${empty.map(monthLabel).join(" + ")}.`);
  };

  const save = async () => {
    setSaving(true);
    try {
      const nextStore = upsertPeriod(store, {
        ...period,
        fromDate,
        toDate,
        monthKeys,
        id: `${fromDate.slice(0, 7)}_${toDate.slice(0, 7)}`,
      });
      await API.put(`/accounts/income_budget/${INCOME_BUDGET_STORE_DATE}`, { data: nextStore });
      setStore(nextStore);
      toast.success("Budget saved.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to save budget."));
    } finally {
      setSaving(false);
    }
  };

  const savePredictionAsNext = async () => {
    let nextPeriod = ensurePeriod(store, prediction.nextFrom, prediction.nextTo);
    nextPeriod = mergeOpexHeadsIntoPeriod(
      nextPeriod,
      prediction.rows
        .filter(r => r.kind === "opex_head")
        .map(r => ({ key: String(r.key), label: r.label })),
    );
    const withPred: BudgetPeriod = {
      ...nextPeriod,
      lines: nextPeriod.lines.map(l => {
        const row = prediction.rows.find(r => r.key === l.key);
        return { ...l, months: row?.months ?? l.months };
      }),
      notes: nextPeriod.notes || `Seeded from ${fromDate} → ${toDate} prediction`,
    };
    setSaving(true);
    try {
      const nextStore = upsertPeriod(store, withPred);
      await API.put(`/accounts/income_budget/${INCOME_BUDGET_STORE_DATE}`, { data: nextStore });
      setStore(nextStore);
      applyThreeMonthsFrom(prediction.nextFrom, nextStore);
      toast.success("Predicted budget saved for next 3 months.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to save next period."));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const pk = payrollKeys();
  const tableLines = period.lines;

  const monthExpenseBudget = (mk: string) =>
    tableLines
      .filter(isBudgetExpenseLine)
      .reduce((a, l) => a + (Number(l.months[mk]) || 0), 0);
  const monthExpenseActual = (mk: string) =>
    tableLines
      .filter(isBudgetExpenseLine)
      .reduce((a, l) => {
        // OT actual is already inside Technical Team (IS net).
        if (l.key === "technical_overtime") return a;
        return a + (Number(byMonthActuals[mk]?.[l.key]) || 0);
      }, 0);
  const monthRevenueBudget = (mk: string) =>
    Number(tableLines.find(l => l.key === "revenue")?.months[mk]) || 0;
  const monthProjectedNet = (mk: string) => monthRevenueBudget(mk) - monthExpenseBudget(mk);

  const sumBudgetKeys = (keys: Set<string>) =>
    period.lines.filter(l => keys.has(String(l.key))).reduce((a, l) => a + lineTotal(l), 0);
  const budgetPayroll = sumBudgetKeys(pk);
  const budgetOpex = period.lines
    .filter(l => l.kind === "opex_head")
    .reduce((a, l) => a + lineTotal(l), 0);
  const budgetRev = lineTotal(period.lines.find(l => l.key === "revenue") ?? {
    key: "revenue",
    label: "",
    kind: "core",
    months: {},
  });

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-6xl max-h-[94vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-crm-surface shadow-2xl border border-crm-border overflow-hidden">
        <header className="flex items-start justify-between gap-3 px-4 sm:px-5 py-4 border-b border-crm-border-subtle bg-gradient-to-r from-[#FFF6F8] to-white dark:from-rose-500/10 dark:to-crm-surface">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1B6FE8]/80 dark:text-rose-300 flex items-center gap-1.5">
              <PiggyBank size={12} /> 3-Month Budget
            </p>
            <h2 className="text-lg sm:text-xl font-extrabold text-crm-text mt-0.5">
              Income Statement Budget Planner
            </h2>
            <p className="text-[11px] text-crm-text-muted mt-1 leading-relaxed">
              One table for revenue, team salaries (plus sales commission and technical overtime), and OPEX heads.
              Sub-heads excluded · Loans / PF excluded.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl hover:bg-crm-muted inline-flex items-center justify-center text-crm-text-muted shrink-0"
          >
            <X size={18} />
          </button>
        </header>

        <div className="px-4 sm:px-5 py-3 border-b border-crm-border-subtle flex flex-wrap items-end gap-3 bg-crm-muted">
          <label className="text-[10px] font-bold uppercase tracking-wide text-crm-text-muted">
            From date (month 1 start)
            <input
              type="date"
              value={fromDate}
              onChange={e => applyThreeMonthsFrom(e.target.value)}
              className="mt-1 h-10 block rounded-xl border border-crm-border bg-crm-surface px-3 text-sm outline-none focus:border-[#1B6FE8]"
            />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wide text-crm-text-muted">
            To date (month 3 end · auto)
            <input
              type="date"
              value={toDate}
              readOnly
              className="mt-1 h-10 block rounded-xl border border-crm-border bg-crm-surface-muted px-3 text-sm text-crm-text-secondary cursor-default"
              title="Auto-set to end of the 3rd month from From date"
            />
          </label>
          <div className="flex flex-wrap gap-1.5 pb-1">
            {monthKeys.map((mk, i) => {
              const filled = tableLines.some(l => (Number(l.months[mk]) || 0) > 0);
              return (
                <span
                  key={mk}
                  className={`inline-flex items-center h-8 px-2.5 rounded-lg text-[11px] font-bold border ${
                    filled
                      ? "bg-violet-50 text-violet-800 border-violet-100"
                      : "bg-crm-muted text-crm-text-faint border-crm-border"
                  }`}
                >
                  M{i + 1}: {monthLabel(mk)}
                  {!filled ? " · empty" : ""}
                </span>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              const s = shiftPeriod(fromDate, toDate, -1);
              applyThreeMonthsFrom(s.fromDate);
            }}
            className="h-10 px-3 rounded-xl border border-crm-border text-xs font-bold text-crm-text-secondary hover:bg-crm-surface-raised"
          >
            ← Prev 3 mo
          </button>
          <button
            type="button"
            onClick={() => {
              const s = shiftPeriod(fromDate, toDate, 1);
              applyThreeMonthsFrom(s.fromDate);
            }}
            className="h-10 px-3 rounded-xl border border-crm-border text-xs font-bold text-crm-text-secondary hover:bg-crm-surface-raised"
          >
            Next 3 mo →
          </button>
          <button
            type="button"
            onClick={() => void loadActuals(fromDate, toDate)}
            disabled={loadingActuals}
            className="h-10 px-3 rounded-xl border border-crm-border text-xs font-bold text-sky-700 hover:bg-sky-50 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {loadingActuals ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Refresh actuals
          </button>
          <button
            type="button"
            onClick={fillFromActuals}
            disabled={loadingActuals || daysRecorded === 0}
            className="h-10 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
          >
            Fill from actuals
          </button>
          <button
            type="button"
            onClick={copyFilledMonthToEmpty}
            disabled={!monthKeys.some(mk => tableLines.some(l => (Number(l.months[mk]) || 0) > 0))}
            className="h-10 px-3 rounded-xl border border-violet-200 bg-violet-50 text-violet-800 text-xs font-bold hover:bg-violet-100 disabled:opacity-50 inline-flex items-center gap-1.5"
            title="Copy the month you already filled (August) into Sep / Oct if those are still 0"
          >
            <Copy size={13} />
            Copy filled month → empty
          </button>
          <span className="text-[10px] text-crm-text-faint font-medium ml-auto pb-2 text-right leading-snug">
            White boxes = your dummy <span className="font-bold text-crm-text-muted">budget</span>.
            Actual column = Income Statement (not those boxes).
            <br />
            {daysRecorded} IS day(s) · budget payroll {currency(budgetPayroll)} · budget OPEX {currency(budgetOpex)} · budget rev {currency(budgetRev)}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-5">
          {loading ? (
            <div className="py-16 text-center text-crm-text-faint text-sm inline-flex items-center gap-2 justify-center w-full">
              <Loader2 size={16} className="animate-spin" /> Loading budgets…
            </div>
          ) : (
            <>
              <section className="rounded-2xl border border-crm-border-subtle overflow-hidden shadow-sm">
                <div className="px-3 py-2.5 bg-[#FAFBFC] border-b border-crm-border-subtle">
                  <p className="text-xs font-extrabold text-crm-text">
                    Budget · {fromDate} → {toDate}
                  </p>
                  <p className="text-[10px] text-crm-text-faint mt-0.5">
                    Budget = numbers you type. Actual = saved Income Statement payroll + OPEX for that month (Loans/PF excluded). Dummy data does not change Actual.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[960px]">
                    <thead>
                      <tr className="border-b border-crm-border-subtle text-[10px] uppercase tracking-wide text-crm-text-faint">
                        <th className="px-3 py-2 text-left font-bold sticky left-0 bg-[#FAFBFC] z-10">Category</th>
                        {monthKeys.map(mk => {
                          const filled = tableLines.some(l => (Number(l.months[mk]) || 0) > 0);
                          return (
                            <th key={mk} className="px-2 py-2 text-center font-bold" colSpan={2}>
                              {monthLabel(mk)}
                              {!filled && (
                                <span className="block text-[9px] font-semibold normal-case tracking-normal text-crm-text-faint">
                                  No budget yet
                                </span>
                              )}
                            </th>
                          );
                        })}
                        <th className="px-3 py-2 text-right font-bold">Total budget</th>
                        <th className="px-3 py-2 text-right font-bold">Total actual</th>
                      </tr>
                      <tr className="border-b border-crm-border-subtle text-[9px] uppercase tracking-wide text-crm-text-faint bg-crm-surface">
                        <th className="px-3 py-1.5 sticky left-0 bg-crm-surface z-10" />
                        {monthKeys.map(mk => (
                          <Fragment key={`h-${mk}`}>
                            <th className="px-1 py-1 text-center font-bold">Budget</th>
                            <th className="px-1 py-1 text-center font-bold">Actual</th>
                          </Fragment>
                        ))}
                        <th />
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {tableLines.map(line => {
                        const actualTotal = monthKeys.reduce(
                          (s, mk) => s + (Number(byMonthActuals[mk]?.[line.key]) || 0),
                          0,
                        );
                        return (
                          <tr
                            key={line.key}
                            className={`border-b border-crm-border-subtle ${
                              line.kind === "opex_head" ? "bg-amber-50/20" : ""
                            } ${line.key === "revenue" ? "bg-violet-50/30" : ""}`}
                          >
                            <td className="px-3 py-2 font-semibold text-crm-text sticky left-0 bg-inherit z-10">
                              {line.label}
                              {(line.key === "sales" ||
                                line.key === "sales_commission" ||
                                line.key === "technical" ||
                                line.key === "technical_overtime") && (
                                <span className="block text-[10px] font-normal text-crm-text-faint">
                                  {line.key === "sales"
                                    ? "Salaries · Sales Team + Lead (excludes commission)"
                                    : line.key === "sales_commission"
                                      ? "Commission · Sales Team + Lead"
                                      : line.key === "technical"
                                        ? "Same as Income Statement team total (overtime included)"
                                        : "Overtime only · already inside the team actual above"}
                                </span>
                              )}
                              {line.kind === "opex_head" && (
                                <span className="ml-1 text-[9px] font-bold uppercase text-amber-600">OPEX</span>
                              )}
                            </td>
                            {monthKeys.map(mk => (
                              <Fragment key={`${line.key}-${mk}`}>
                                <td className="px-1.5 py-1.5 align-top">
                                  <AmountInput
                                    value={Number(line.months[mk]) || 0}
                                    onChange={n => setMonthBudget(line.key, mk, n)}
                                    className="h-8 w-[6.5rem] rounded-lg border border-crm-border bg-crm-surface px-1.5 text-xs tabular-nums text-right outline-none focus:border-[#1B6FE8]"
                                  />
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-xs text-crm-text-secondary align-middle">
                                  {currency(Number(byMonthActuals[mk]?.[line.key]) || 0)}
                                </td>
                              </Fragment>
                            ))}
                            <td className="px-3 py-2 text-right font-bold tabular-nums">{currency(lineTotal(line))}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-crm-text-secondary">{currency(actualTotal)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-rose-200 bg-rose-50/70">
                        <td className="px-3 py-2.5 font-black uppercase tracking-wide text-[#1B6FE8] sticky left-0 bg-rose-50/90 z-10 text-[11px]">
                          Total expense
                          <span className="block text-[9px] font-bold normal-case tracking-normal text-rose-700/80">
                            Budget you typed · Actual from IS
                          </span>
                        </td>
                        {monthKeys.map(mk => (
                          <Fragment key={`tb-${mk}`}>
                            <td className="px-1.5 py-2.5 text-right font-black tabular-nums text-[#1B6FE8] text-xs">
                              {currency(monthExpenseBudget(mk))}
                            </td>
                            <td className="px-1.5 py-2.5 text-right font-black tabular-nums text-sky-900 text-xs">
                              {currency(monthExpenseActual(mk))}
                            </td>
                          </Fragment>
                        ))}
                        <td className="px-3 py-2.5 text-right font-black tabular-nums text-[#1B6FE8]">
                          {currency(monthKeys.reduce((a, mk) => a + monthExpenseBudget(mk), 0))}
                        </td>
                        <td className="px-3 py-2.5 text-right font-black tabular-nums text-sky-900">
                          {currency(monthKeys.reduce((a, mk) => a + monthExpenseActual(mk), 0))}
                        </td>
                      </tr>
                      <tr className="bg-sky-50/80">
                        <td className="px-3 py-2.5 font-bold text-sky-900 sticky left-0 bg-sky-50/90 z-10 text-[11px]">
                          Revenue Target
                        </td>
                        {monthKeys.map(mk => (
                          <Fragment key={`rt-${mk}`}>
                            <td
                              colSpan={2}
                              className="px-2 py-2.5 text-right font-extrabold tabular-nums text-sky-800 text-sm"
                            >
                              {currency(monthRevenueBudget(mk))}
                            </td>
                          </Fragment>
                        ))}
                        <td className="px-3 py-2.5 text-right font-extrabold tabular-nums text-sky-800">
                          {currency(monthKeys.reduce((a, mk) => a + monthRevenueBudget(mk), 0))}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] font-bold text-sky-700/80 text-right">
                          Survival minimum
                        </td>
                      </tr>
                      <tr className="bg-emerald-50/80 border-b border-emerald-100">
                        <td className="px-3 py-2.5 font-black uppercase tracking-wide text-emerald-800 sticky left-0 bg-emerald-50/90 z-10 text-[11px]">
                          Projected Net
                        </td>
                        {monthKeys.map(mk => (
                          <Fragment key={`pn-${mk}`}>
                            <td
                              colSpan={2}
                              className={`px-2 py-2.5 text-right font-black tabular-nums text-sm ${
                                monthProjectedNet(mk) >= 0 ? "text-emerald-700" : "text-rose-600"
                              }`}
                            >
                              {currency(monthProjectedNet(mk))}
                            </td>
                          </Fragment>
                        ))}
                        <td
                          className={`px-3 py-2.5 text-right font-black tabular-nums ${
                            monthKeys.reduce((a, mk) => a + monthProjectedNet(mk), 0) >= 0
                              ? "text-emerald-700"
                              : "text-rose-600"
                          }`}
                        >
                          {currency(monthKeys.reduce((a, mk) => a + monthProjectedNet(mk), 0))}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] font-bold text-emerald-700/80 text-right">
                          If target achieved
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="px-3 py-3 border-t border-crm-border-subtle">
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-muted">
                    Notes
                    <textarea
                      value={period.notes ?? ""}
                      onChange={e => setPeriod(p => ({ ...p, notes: e.target.value }))}
                      rows={2}
                      className="mt-1 w-full rounded-xl border border-crm-border px-3 py-2 text-sm outline-none focus:border-[#1B6FE8] resize-none"
                      placeholder="Optional notes…"
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-violet-100 overflow-hidden shadow-sm bg-violet-50/20">
                <div className="px-3 py-2.5 bg-violet-50/80 border-b border-violet-100 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-extrabold text-violet-900 inline-flex items-center gap-1.5">
                      <Sparkles size={14} /> Predicted next 3 months
                    </p>
                    <p className="text-[10px] text-violet-700/80 mt-0.5">
                      {prediction.nextFrom} → {prediction.nextTo}
                    </p>
                  </div>
                  <label className="text-[10px] font-bold uppercase text-violet-700 inline-flex items-center gap-2">
                    Growth %
                    <input
                      type="number"
                      step="0.5"
                      value={growthPct}
                      onChange={e => setGrowthPct(Number(e.target.value) || 0)}
                      className="h-8 w-20 rounded-lg border border-violet-200 bg-crm-surface px-2 text-sm tabular-nums outline-none"
                    />
                  </label>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="border-b border-violet-100 text-[10px] uppercase tracking-wide text-violet-400">
                        <th className="px-3 py-2 text-left font-bold">Category</th>
                        {prediction.nextMonths.map(mk => (
                          <th key={mk} className="px-3 py-2 text-right font-bold">{monthLabel(mk)}</th>
                        ))}
                        <th className="px-3 py-2 text-right font-bold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prediction.rows.map(row => (
                        <tr key={row.key} className="border-b border-violet-50/80">
                          <td className="px-3 py-2 font-semibold text-crm-text">
                            {row.label}
                            {row.kind === "opex_head" && (
                              <span className="ml-1 text-[9px] font-bold uppercase text-amber-600">OPEX</span>
                            )}
                          </td>
                          {prediction.nextMonths.map(mk => (
                            <td key={mk} className="px-3 py-2 text-right tabular-nums text-violet-800 font-semibold">
                              {currency(Number(row.months[mk]) || 0)}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right tabular-nums font-extrabold text-violet-900">
                            {currency(row.predictedTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>

        <footer className="px-4 sm:px-5 py-3 border-t border-crm-border-subtle bg-crm-surface flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-xl border border-crm-border text-sm font-bold text-crm-text-secondary hover:bg-crm-surface-muted"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void savePredictionAsNext()}
            disabled={saving || loading}
            className="h-10 px-4 rounded-xl border border-violet-200 bg-violet-50 text-sm font-bold text-violet-800 hover:bg-violet-100 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Sparkles size={14} />
            Save prediction → next
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading}
            className="h-10 px-4 rounded-xl bg-[#1B6FE8] text-white text-sm font-bold hover:bg-[#9a0e26] disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save budget
          </button>
        </footer>
      </div>
    </div>
  );
}
