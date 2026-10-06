"use client";

import { useMemo, useCallback, useLayoutEffect, useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { PieChart as PieIcon, Users, Layers3, TrendingUp } from "lucide-react";
import toast from "react-hot-toast";
import API, { apiErrorMessage } from "@/lib/api";
import AccountsSidebar from "../components/layout/Sidebar";
import { ACCOUNTS_MAIN_OFFSET } from "../components/layout/headerOffset";
import AccountsPageShell from "../components/AccountsPageShell";
import AccountsChartCard, { CHART_COLORS } from "../components/AccountsChartCard";
import ExpandableHeadsTable, { type ExpandableHeadRow } from "../components/ExpandableHeadsTable";
import IncomeBudgetModal from "../components/IncomeBudgetModal";
import BudgetVsActualCharts from "../components/BudgetVsActualCharts";
import RechartsBox from "@/app/components/charts/RechartsBox";
import { accountsShellProps } from "../utils/accountsShellProps";
import { useAccountsPage } from "../hooks/useAccountsPage";
import { useScrollToHash } from "../hooks/useScrollToHash";
import type { DashboardData, IncomeStatementData, OpexRow, TeamSalaryRow } from "../types";
import { currency, lineAmount, todayIso } from "../types";
import {
  ensureIncomeStatementPeople,
  executiveCommissionBase,
  recomputeExecutiveTeam,
  seededIncomeStatementData,
} from "../utils/incomeStatementSeed";
import { recomputePayrollSubAmounts } from "../utils/payrollAmountSync";
import { pfDropKey, syncProvidentFundFromSalaries } from "../utils/payrollPfSync";
import { pfAliasMergeAllowed, pfCanonicalKey, pfHasLongerCanonical, type PfNameMerge } from "../utils/pfNameAlias";
import { syncLoanHeadsFromSalaries } from "../utils/payrollLoanHeadsSync";
import {
  clearPersonLoanFromTeamSalaries,
  deletePayrollLoanByName,
} from "../utils/payrollLoanSync";
import { normalizeSalesTeamSubs, isSalesTeamTitle, resolvePayrollKind } from "../utils/salesPayrollBridge";
import { normalizePeriodPreset, periodDateRange, currentMonthValue } from "../utils/accountsPeriodFilters";
import { currencyFormulaTotal } from "../utils/currencyFormula";
import { uploadAccountsProof } from "../utils/uploadAccountsProof";
import { useSalesPayrollCalcOpts } from "../hooks/useSalesPayrollCalcOpts";
import type { SalesPayrollCalcOpts } from "../utils/salesPayrollFormula";

function defaultData(): IncomeStatementData {
  return ensureIncomeStatementPeople(seededIncomeStatementData());
}

/** People seed + executive commission + PF + Loans auto-sync from Team Salaries. */
function normalizeIncomeStatement(
  raw: IncomeStatementData,
  totalRevenue: number,
  opts?: SalesPayrollCalcOpts,
  flags?: { skipPfSync?: boolean; nameMerges?: PfNameMerge[] },
): IncomeStatementData {
  const core = recomputeExecutiveTeam(
    recomputePayrollSubAmounts(
      ensureIncomeStatementPeople({
        ...raw,
        totalRevenue,
      }),
      opts,
    ),
  );
  const withPf = flags?.skipPfSync ? core : syncProvidentFundFromSalaries(core, flags?.nameMerges);
  return syncLoanHeadsFromSalaries(withPf);
}

function teamToHead(
  t: TeamSalaryRow,
  allTeams: TeamSalaryRow[] = [],
  opts?: SalesPayrollCalcOpts,
): ExpandableHeadRow {
  const salesPeers =
    resolvePayrollKind(t.team, t.subHeads) === "sales_lead"
      ? (allTeams.find(x => resolvePayrollKind(x.team, x.subHeads) === "sales")?.subHeads ?? [])
      : [];
  const subHeads = isSalesTeamTitle(t.team, t.subHeads)
    ? normalizeSalesTeamSubs(t.subHeads, t.team, salesPeers, opts)
    : (t.subHeads ?? []);
  return {
    id: t.id,
    title: t.team,
    amount: lineAmount({ subHeads }),
    filledAt: t.filledAt,
    subHeads,
    notes: t.notes ?? [],
  };
}
function opexToHead(o: OpexRow): ExpandableHeadRow {
  return {
    id: o.id,
    title: o.label,
    amount: o.amount,
    filledAt: o.filledAt,
    subHeads: o.subHeads ?? [],
    notes: o.notes ?? [],
  };
}

function headToTeam(h: ExpandableHeadRow): TeamSalaryRow {
  return {
    id: h.id,
    team: h.title,
    totalSalary: lineAmount(h),
    filledAt: h.filledAt,
    subHeads: h.subHeads ?? [],
    notes: h.notes ?? [],
  };
}

function headToOpex(h: ExpandableHeadRow): OpexRow {
  return {
    id: h.id,
    label: h.title,
    amount: lineAmount(h),
    filledAt: h.filledAt,
    subHeads: (h.subHeads ?? [])
      .filter(s => !String(s.id).startsWith("pf-all-"))
      .map(s => {
        const rest = { ...s };
        delete rest.periodAmount;
        delete rest.allTimeAmount;
        return rest;
      }),
    notes: h.notes ?? [],
  };
}

type PfBreakdownPerson = { name: string; period: number; allTime: number };
type PfBreakdown = Record<string, Record<string, PfBreakdownPerson>>;

function mergePfDisplayRows(
  heads: OpexRow[],
  byHead: PfBreakdown | null,
  nameMerges: PfNameMerge[] = [],
): ExpandableHeadRow[] {
  return (heads ?? []).map(h => {
    const bucket = byHead?.[h.label] ?? {};
    const hits = Object.values(bucket);
    const rawSubs = h.subHeads ?? [];
    const siblingLabels = rawSubs.map(s => s.label);
    const pool = [
      ...siblingLabels,
      ...hits.map(x => x.name),
    ];
    const canonicalSubs = rawSubs.filter(s => {
      if (pfHasLongerCanonical(s.label, siblingLabels)) return false;
      const canon = pfCanonicalKey(s.label, nameMerges);
      return !siblingLabels.some(other => {
        if (other === s.label) return false;
        if (pfCanonicalKey(other, nameMerges) !== canon) return false;
        return other.length >= s.label.length;
      });
    });
    const claimed = new Set<string>();
    const subs = canonicalSubs.map(s => {
      const fallback = Number(s.amount) || 0;
      let allTime = 0;
      for (const hit of hits) {
        const key = pfCanonicalKey(hit.name, nameMerges);
        if (!key || claimed.has(key)) continue;
        const exact = pfCanonicalKey(s.label, nameMerges) === key;
        const alias = pfAliasMergeAllowed(s.label, hit.name, pool);
        if (!exact && !alias) continue;
        allTime += Number(hit.allTime) || 0;
        claimed.add(key);
      }
      return {
        ...s,
        periodAmount: fallback,
        allTimeAmount: allTime || fallback,
      };
    });
    const periodAmount = subs.reduce((a, s) => a + (Number(s.amount) || 0), 0);
    const allTimeAmount = subs.reduce((a, s) => a + (Number(s.allTimeAmount) || 0), 0);
    return {
      ...opexToHead({ ...h, subHeads: subs, amount: periodAmount }),
      periodAmount,
      allTimeAmount,
    };
  });
}

export default function IncomeStatementPage() {
  // Daily basis — one record per calendar day, defaults to today
  const acc = useAccountsPage<IncomeStatementData>({
    page: "income_statement",
    defaultData,
    defaultPreset: "daily",
  });
  useScrollToHash(!acc.loading);
  const salesCalcOpts = useSalesPayrollCalcOpts(acc.recordDate);

  /** Total Revenue = Currency Formula; All Time rolls up every day through today. */
  const [currencyTotal, setCurrencyTotal] = useState(0);
  const [periodRollup, setPeriodRollup] = useState<{
    revenue: number;
    payroll: number;
    opex: number;
    loans: number;
    pf: number;
    expense: number;
    profit: number;
  } | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetChartKey, setBudgetChartKey] = useState(0);
  const [pfBreakdown, setPfBreakdown] = useState<PfBreakdown | null>(null);
  const [nameMerges, setNameMerges] = useState<PfNameMerge[]>([]);

  const pfPeriod = useMemo(() => {
    const mode = normalizePeriodPreset(acc.periodPreset);
    if (mode === "daily") {
      const day = acc.recordDate || todayIso();
      return { from: day, to: day, label: "This day" };
    }
    if (mode === "month") {
      const range = periodDateRange("month", { month: acc.filterMonth });
      return { from: range.from, to: range.to, label: "Per month" };
    }
    if (mode === "date_range") {
      return { from: acc.filterFrom, to: acc.filterTo, label: "This range" };
    }
    const range = periodDateRange("month", { month: currentMonthValue() });
    return { from: range.from, to: range.to, label: "Per month" };
  }, [acc.periodPreset, acc.recordDate, acc.filterMonth, acc.filterFrom, acc.filterTo]);

  useEffect(() => {
    let cancelled = false;
    const mode = normalizePeriodPreset(acc.periodPreset);
    if (mode === "all_time") {
      API.get(`/accounts/dashboard/summary?mode=all_time&to=${todayIso()}`, {
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      })
        .then(res => {
          if (cancelled) return;
          const s = res.data.summaries ?? {};
          setCurrencyTotal(Number(s.incomeTotalRevenue) || 0);
          setPeriodRollup({
            revenue: Number(s.incomeTotalRevenue) || 0,
            payroll: Number(s.incomePayroll) || 0,
            opex: Number(s.incomeOpex) || 0,
            loans: Number(s.incomeLoans) || 0,
            pf: Number(s.incomeProvidentFund) || 0,
            expense: Number(s.incomeTotalExpense) || 0,
            profit: Number(s.incomeNetProfit) || 0,
          });
        })
        .catch(() => {
          if (!cancelled) {
            setCurrencyTotal(0);
            setPeriodRollup(null);
          }
        });
      return () => {
        cancelled = true;
      };
    }

    API.get(`/accounts/dashboard/${acc.recordDate}`)
      .then(res => {
        if (cancelled) return;
        const dash = (res.data.data as DashboardData | undefined) ?? null;
        setCurrencyTotal(currencyFormulaTotal(dash?.currency));
      })
      .catch(() => {
        if (!cancelled) setCurrencyTotal(0);
      });
    return () => {
      cancelled = true;
    };
  }, [acc.recordDate, acc.periodPreset, acc.dirty, acc.saving]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (pfPeriod.from) params.set("from", pfPeriod.from);
    if (pfPeriod.to) params.set("to", pfPeriod.to);
    API.get(`/accounts/income-statement/pf-breakdown?${params}`)
      .then(res => {
        if (!cancelled) {
          setPfBreakdown(res.data.byHead ?? {});
          if (Array.isArray(res.data.nameMerges)) setNameMerges(res.data.nameMerges);
        }
      })
      .catch(() => {
        if (!cancelled) setPfBreakdown(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pfPeriod.from, pfPeriod.to, acc.saving, acc.dirty]);

  /** All-time rollup only applies in All Time preset — avoid sync clear in the effect above */
  const activeRollup =
    normalizePeriodPreset(acc.periodPreset) === "all_time" ? periodRollup : null;

  /** Always apply sales-team split + payroll migration + executive commission + PF sync */
  const data = useMemo(
    () => normalizeIncomeStatement(acc.data, currencyTotal, salesCalcOpts, { nameMerges }),
    [acc.data, currencyTotal, salesCalcOpts, nameMerges],
  );

  const pfRows = useMemo(
    () => mergePfDisplayRows(data.providentFundHeads ?? [], pfBreakdown, nameMerges),
    [data.providentFundHeads, pfBreakdown, nameMerges],
  );

  /** Net profit before executive salaries — commission base for Executive payroll */
  const execProfitBase = useMemo(() => executiveCommissionBase(data), [data]);

  useLayoutEffect(() => {
    if (acc.loading) return;
    const before = acc.data;
    const synced = normalizeIncomeStatement(before, currencyTotal, salesCalcOpts, { nameMerges });
    if (JSON.stringify(synced) === JSON.stringify(before)) return;
    acc.setData(() => synced);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when load/currency settles
  }, [acc.loading, acc.recordDate, currencyTotal, salesCalcOpts, nameMerges]);

  const uploadOpexProof = useCallback(async (file: File) => {
    try {
      return await uploadAccountsProof("income_statement", acc.recordDate, file);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Image upload failed."));
      throw err;
    }
  }, [acc.recordDate]);

  const payrollExpense = useMemo(
    () => activeRollup?.payroll ?? (data.teamSalaries ?? []).reduce((a, t) => a + lineAmount(t), 0),
    [data.teamSalaries, activeRollup],
  );
  const operatingExpense = useMemo(
    () => activeRollup?.opex ?? (data.opexHeads ?? []).reduce((a, o) => a + lineAmount(o), 0),
    [data.opexHeads, activeRollup],
  );
  const loanExpense = useMemo(
    () => activeRollup?.loans ?? (data.loanHeads ?? []).reduce((a, o) => a + lineAmount(o), 0),
    [data.loanHeads, activeRollup],
  );
  const pfExpense = useMemo(
    () => activeRollup?.pf ?? (data.providentFundHeads ?? []).reduce((a, o) => a + lineAmount(o), 0),
    [data.providentFundHeads, activeRollup],
  );
  // Total Expense = Team Salaries + OPEX only (PF/loan already sit inside net salaries — don't double-count)
  const totalExpense = activeRollup?.expense ?? payrollExpense + operatingExpense;
  const revenue = activeRollup?.revenue ?? currencyTotal;
  const netProfit = activeRollup?.profit ?? revenue - totalExpense;
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  const payrollChartData = (data.teamSalaries ?? []).map(t => ({
    name: t.team.replace(/ Salaries$/i, "").slice(0, 14),
    value: lineAmount(t),
  }));

  const expenseMix = [
    { name: "Team Salaries", value: payrollExpense, color: "#0B84F3" },
    { name: "OPEX", value: operatingExpense, color: "#F59E0B" },
  ].filter(d => d.value > 0);

  const stackCompare = [
    { name: "Revenue", amount: revenue, fill: "#0B84F3" },
    { name: "Expense", amount: totalExpense, fill: "#1B6FE8" },
    { name: "Profit", amount: netProfit, fill: "#12B76A" },
  ];

  const opexBars = (data.opexHeads ?? [])
    .map(o => ({ name: o.label.slice(0, 18), value: lineAmount(o) }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const tablesSummary = [
    { name: "Team Salaries", value: payrollExpense, fill: "#0B84F3" },
    { name: "OPEX", value: operatingExpense, fill: "#F59E0B" },
    { name: "Loans", value: loanExpense, fill: "#EA580C" },
    { name: "Provident Fund", value: pfExpense, fill: "#0D9488" },
  ].filter(d => d.value > 0);

  /** Apply a table change; persist right away when the table asks for it. */
  const commit = useCallback(
    (patch: Partial<IncomeStatementData>, opts?: { persist?: boolean }) => {
      // Revenue from Currency Formula; refresh executive commissions + PF from salaries
      // unless this patch is the PF table itself (edit/delete must not be overwritten).
      const next = normalizeIncomeStatement(
        {
          ...data,
          ...patch,
          totalRevenue: currencyTotal,
        },
        currencyTotal,
        salesCalcOpts,
        { skipPfSync: !!patch.providentFundHeads || !!patch.pfDroppedNames, nameMerges },
      );
      acc.setData(() => next);
      if (opts?.persist) void acc.save(next);
    },
    [data, acc, currencyTotal, salesCalcOpts, nameMerges],
  );

  return (
    <div className="flex min-h-screen accounts-page-bg">
      <AccountsSidebar />
      <main className={`flex-1 min-w-0 overflow-x-hidden ${ACCOUNTS_MAIN_OFFSET}`}>
        <AccountsPageShell
          {...accountsShellProps(acc)}
          title="Income Statement"
          subtitle="Daily record — pick a day, fill Team Salaries / OPEX. Loans & Provident Fund auto-fill from salary."
          inlineTitle
          hideFileActions
        >
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2.5 sm:gap-3">
            {[
              { label: "Total Revenue", value: revenue, cls: "from-[#6D28D9] to-[#4C1D95]", hint: activeRollup ? "All Time · sum" : "Currency Formula" },
              { label: "Team Salaries", value: payrollExpense, cls: "from-[#0B84F3] to-[#0369A1]", hint: activeRollup ? "All Time · sum" : "Payroll tables" },
              { label: "Operating Expense", value: operatingExpense, cls: "from-[#F59E0B] to-[#D97706]", hint: activeRollup ? "All Time · sum" : "OPEX table" },
              { label: "Total Expense", value: totalExpense, cls: "from-[#1B6FE8] to-[#0E4FBE]", hint: "Salaries + OPEX" },
              { label: "Net Profit", value: netProfit, cls: "from-[#12B76A] to-[#027A48]", hint: "Revenue − Expense" },
              { label: "Loans", value: loanExpense, cls: "from-[#EA580C] to-[#C2410C]", hint: "Pending only" },
              { label: "Provident Fund", value: pfExpense, cls: "from-[#0D9488] to-[#0F766E]", hint: "Auto from salaries" },
            ].map(c => (
              <div key={c.label} className={`bg-gradient-to-br ${c.cls} rounded-xl sm:rounded-2xl p-3 sm:p-4 text-white shadow-md min-w-0`}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/80 truncate">{c.label}</p>
                <p className="text-base sm:text-lg xl:text-xl font-extrabold mt-1 tabular-nums truncate">{currency(Number(c.value) || 0)}</p>
                <p className="text-[9px] text-white/55 font-medium mt-0.5 truncate">{c.hint}</p>
              </div>
            ))}
          </section>

          <BudgetVsActualCharts
            defaultMonth={(acc.recordDate || todayIso()).slice(0, 7)}
            refreshKey={budgetChartKey}
            onOpenBudget={() => setBudgetOpen(true)}
          />

          <section className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 mt-5">
            <AccountsChartCard
              title="Expense Mix"
              subtitle="Team Salaries + Operating Expense"
              accent="#1B6FE8"
              icon={<PieIcon size={16} />}
            >
              <RechartsBox height={240}>
                <PieChart>
                  <Pie
                    data={expenseMix.length ? expenseMix : [{ name: "Empty", value: 1, color: "#E2E8F0" }]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={3}
                    stroke="#fff"
                    strokeWidth={2}
                  >
                    {(expenseMix.length ? expenseMix : [{ color: "#E2E8F0" }]).map((d, i) => (
                      <Cell key={i} fill={d.color || CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={v => currency(Number(v ?? 0))} />
                </PieChart>
              </RechartsBox>
            </AccountsChartCard>

            <AccountsChartCard
              title="Team Salaries"
              subtitle="Payroll by team"
              accent="#0B84F3"
              icon={<Users size={16} />}
            >
              <RechartsBox height={240}>
                <BarChart data={payrollChartData.length ? payrollChartData : [{ name: "—", value: 0 }]} barSize={28}>
                  <defs>
                    <linearGradient id="payGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0B84F3" stopOpacity={1} />
                      <stop offset="100%" stopColor="#38BDF8" stopOpacity={0.75} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 600 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={v => currency(Number(v ?? 0))} />
                  <Bar dataKey="value" fill="url(#payGrad)" radius={[10, 10, 0, 0]} />
                </BarChart>
              </RechartsBox>
            </AccountsChartCard>

            <AccountsChartCard
              title="Revenue · Expense · Profit"
              subtitle="Saved revenue vs current expenses"
              accent="#12B76A"
              icon={<TrendingUp size={16} />}
              className="lg:col-span-2 xl:col-span-1"
            >
              <RechartsBox height={240}>
                <BarChart data={stackCompare} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 600 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={v => currency(Number(v ?? 0))} />
                  <Bar dataKey="amount" radius={[12, 12, 0, 0]}>
                    {stackCompare.map(item => (
                      <Cell key={item.name} fill={item.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </RechartsBox>
            </AccountsChartCard>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4">
            <AccountsChartCard
              title="All Tables Summary"
              subtitle="Team Salaries · OPEX (expense) · Loans/PF (info)"
              accent="#0B84F3"
              icon={<PieIcon size={16} />}
              className="lg:col-span-7"
            >
              <RechartsBox height={210}>
                <BarChart
                  data={tablesSummary.length ? tablesSummary : [{ name: "—", value: 0, fill: "#E2E8F0" }]}
                  barSize={36}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 600 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={v => currency(Number(v ?? 0))} />
                  <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                    {(tablesSummary.length ? tablesSummary : [{ fill: "#E2E8F0" }]).map((d, i) => (
                      <Cell key={i} fill={d.fill || CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </RechartsBox>
            </AccountsChartCard>

            <AccountsChartCard
              title="Top Operating Expenses"
              subtitle="Largest OPEX heads"
              accent="#F59E0B"
              icon={<Layers3 size={16} />}
              className="lg:col-span-5"
            >
              <RechartsBox height={210}>
                <BarChart
                  data={opexBars.length ? opexBars : [{ name: "—", value: 0 }]}
                  layout="vertical"
                  margin={{ left: 4, right: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 9 }} />
                  <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 9, fontWeight: 600 }} />
                  <Tooltip formatter={v => currency(Number(v ?? 0))} />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={14}>
                    {(opexBars.length ? opexBars : [{ name: "—" }]).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </RechartsBox>
            </AccountsChartCard>
          </section>

          <section className="mt-5 space-y-5">
            <div id="team-salaries" className="scroll-mt-[80px]">
            <ExpandableHeadsTable
              title="Team Salaries"
              accent="#0B84F3"
              addLabel="Add Team"
              salaryMode
              execProfitBase={execProfitBase}
              recordDate={acc.recordDate}
              salarySlipCompany="BEM"
              rows={(data.teamSalaries ?? []).map(t => teamToHead(t, data.teamSalaries ?? [], salesCalcOpts))}
              onChange={(rows, opts) => commit({ teamSalaries: rows.map(headToTeam) }, opts)}
              onPersist={() => void acc.save()}
              saving={acc.saving}
            />
            </div>

            <div id="opex" className="scroll-mt-[80px]">
            <ExpandableHeadsTable
              title="Operating Expenses"
              accent="#F59E0B"
              addLabel="Add OPEX"
              rows={(data.opexHeads ?? []).map(opexToHead)}
              onChange={(rows, opts) => commit({ opexHeads: rows.map(headToOpex) }, opts)}
              onPersist={() => void acc.save()}
              saving={acc.saving}
              recordDate={acc.recordDate}
              allowProofUpload
              onUploadProof={uploadOpexProof}
            />
            </div>

            <div id="loans" className="scroll-mt-[80px]">
            <ExpandableHeadsTable
              title="Loans"
              accent="#EA580C"
              addLabel="Add Loan Head"
              emptyLabel="Each team’s remaining total (Admin, Sales, Technical, Executive). Only people who still owe appear."
              rows={(data.loanHeads ?? []).map(opexToHead)}
              onChange={(rows, opts) => commit({ loanHeads: rows.map(headToOpex) }, opts)}
              onDeleteSubHead={({ sub, nextRows }) => {
                void deletePayrollLoanByName(sub.label);
                commit(
                  {
                    loanHeads: nextRows.map(headToOpex),
                    teamSalaries: clearPersonLoanFromTeamSalaries(data.teamSalaries, sub.label),
                  },
                  { persist: true },
                );
                return true;
              }}
              onPersist={() => void acc.save()}
              saving={acc.saving}
            />
            </div>

            <div id="provident-fund" className="scroll-mt-[80px]">
            <ExpandableHeadsTable
              title="Provident Fund"
              accent="#0D9488"
              addLabel="Add PF Head"
              emptyLabel="PF follows this day’s Team Salaries. Edit an amount to override 8% of basic. Delete a name to hide it."
              rows={pfRows}
              amountSplit={{
                periodLabel: pfPeriod.label,
                allTimeLabel: "All time",
              }}
              lockedHeadTitles={["Sales Team PF", "Administration PF", "Technical Team PF"]}
              onChange={(rows, opts) => {
                const heads = rows.map(headToOpex);
                const present = new Set(
                  heads.flatMap(h => (h.subHeads ?? []).map(s => pfDropKey(h.label, s.label).toLowerCase())),
                );
                const previously = (data.providentFundHeads ?? []).flatMap(h =>
                  (h.subHeads ?? []).map(s => pfDropKey(h.label, s.label).toLowerCase()),
                );
                const newlyGone = previously.filter(k => !present.has(k));
                const dropped = [...new Set([
                  ...(data.pfDroppedNames ?? []).filter(k => !present.has(k.toLowerCase())),
                  ...newlyGone,
                ])];
                commit({ providentFundHeads: heads, pfDroppedNames: dropped }, opts);
              }}
              onDeleteSubHead={({ parent, sub, nextRows }) => {
                const heads = nextRows.map(headToOpex);
                const key = pfDropKey(parent.title, sub.label);
                const dropped = [...new Set([...(data.pfDroppedNames ?? []), key])];
                commit({ providentFundHeads: heads, pfDroppedNames: dropped }, { persist: true });
                return true;
              }}
              onPersist={() => void acc.save()}
              saving={acc.saving}
            />
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-1 text-sm font-bold">
              <span className="text-crm-text-secondary">
                Total Expense (Salaries + OPEX): {currency(totalExpense)}
              </span>
              <span className="text-[#12B76A]">Net Profit ({netMargin.toFixed(2)}%): {currency(netProfit)}</span>
            </div>
          </section>
        </AccountsPageShell>
        <IncomeBudgetModal
          open={budgetOpen}
          onClose={() => {
            setBudgetOpen(false);
            setBudgetChartKey(k => k + 1);
          }}
        />
      </main>
    </div>
  );
}
