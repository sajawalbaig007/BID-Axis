"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, Tooltip, XAxis, YAxis,
} from "recharts";
import { Landmark, Wallet, Activity, PieChart as PieIcon, TrendingUp } from "lucide-react";
import AccountsSidebar from "../components/layout/Sidebar";
import { ACCOUNTS_MAIN_OFFSET } from "../components/layout/headerOffset";
import AccountsPageShell from "../components/AccountsPageShell";
import AccountsChartCard, { CHART_COLORS } from "../components/AccountsChartCard";
import CashFlowTable, { computedNet } from "../components/CashFlowTable";
import { bankColor, TABLE_VARIANT } from "../components/accountsTheme";
import RechartsBox from "@/app/components/charts/RechartsBox";
import { accountsShellProps } from "../utils/accountsShellProps";
import { useAccountsPage } from "../hooks/useAccountsPage";
import { useScrollToHash } from "../hooks/useScrollToHash";
import type { CashFlowData, CashFlowRow } from "../types";
import { currency, newRowId } from "../types";

function defaultData(): CashFlowData {
  return {
    bankHeads: ["AH Paypal", "SN Paypal", "CO. Habib Metro", "Qasim Habib Metro"],
    months: [],
  };
}

type ChannelKey = "AH" | "SN" | "QHM" | "HM";

const CHANNEL_CARDS: { key: ChannelKey; label: string; hint: string; grad: string }[] = [
  { key: "AH", label: "AH", hint: "Ahmed Hamza · received", grad: "from-[#E11D48] to-[#9F1239]" },
  { key: "SN", label: "SN", hint: "Sharjeel Nasir · received", grad: "from-[#0B84F3] to-[#0369A1]" },
  { key: "QHM", label: "Qasim Habib Metro", hint: "Qasim Habib Metro · received", grad: "from-[#F59E0B] to-[#B45309]" },
  { key: "HM", label: "Habib Metro", hint: "CO. Habib Metro · received", grad: "from-[#0D9488] to-[#0F766E]" },
];

function channelForBank(name: string): ChannelKey | null {
  const t = name.trim().toLowerCase();
  if (t.includes("qasim")) return "QHM";
  if (/\bah\b/.test(t) || t.includes("ahmed") || t.includes("ah paypal")) return "AH";
  if (/\bsn\b/.test(t) || t.includes("sharjeel")) return "SN";
  if (t.includes("habib") || t.includes("metro")) return "HM";
  return null;
}

export default function CashFlowStatementPage() {
  const acc = useAccountsPage<CashFlowData>({ page: "cash_flow", defaultData });
  useScrollToHash(!acc.loading);
  const theme = TABLE_VARIANT.cashflow;
  const bankHeads = acc.data.bankHeads ?? [];
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistSoon = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void acc.save(undefined, { silent: true });
    }, 450);
  }, [acc.save]);

  const persistNow = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    void acc.save();
  }, [acc.save]);

  const dirtyRef = useRef(acc.dirty);
  dirtyRef.current = acc.dirty;
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (dirtyRef.current) void acc.save(undefined, { silent: true });
  }, [acc.save]);

  const allRows = useMemo(
    () => (acc.data.months ?? []).flatMap(m => m.rows),
    [acc.data.months],
  );

  const totalNet = useMemo(() => allRows.reduce((a, r) => a + computedNet(r), 0), [allRows]);

  const channelReceived = useMemo(() => {
    const sums: Record<ChannelKey, number> = { AH: 0, SN: 0, QHM: 0, HM: 0 };
    for (const bank of bankHeads) {
      const ch = channelForBank(bank);
      if (!ch) continue;
      for (const r of allRows) {
        sums[ch] += Number(r.bankAmounts?.[bank]?.debit) || 0;
      }
    }
    return sums;
  }, [allRows, bankHeads]);

  const monthChart = useMemo(
    () => (acc.data.months ?? []).map(m => ({
      name: (m.month || "Section").slice(0, 12),
      net: m.rows.reduce((a, r) => a + computedNet(r), 0),
    })),
    [acc.data.months],
  );

  const bankChart = useMemo(() => {
    return bankHeads.map((bank, i) => {
      let debit = 0;
      let credit = 0;
      for (const r of allRows) {
        const b = r.bankAmounts?.[bank];
        debit += Number(b?.debit) || 0;
        credit += Number(b?.credit) || 0;
      }
      return {
        name: bank.length > 14 ? `${bank.slice(0, 12)}…` : bank,
        full: bank,
        net: debit - credit,
        debit,
        credit,
        color: bankColor(i),
      };
    }).filter(b => b.debit !== 0 || b.credit !== 0 || b.net !== 0);
  }, [allRows, bankHeads]);

  const updateRow = (monthId: string, rowId: string, patch: Partial<CashFlowRow>) => {
    acc.setData(prev => ({
      ...prev,
      months: prev.months.map(m =>
        m.id === monthId ? { ...m, rows: m.rows.map(r => (r.id === rowId ? { ...r, ...patch } : r)) } : m,
      ),
    }));
    persistSoon();
  };

  const updateBank = (monthId: string, rowId: string, bank: string, side: "debit" | "credit", val: number) => {
    acc.setData(prev => ({
      ...prev,
      months: prev.months.map(m =>
        m.id === monthId
          ? {
              ...m,
              rows: m.rows.map(r => {
                if (r.id !== rowId) return r;
                const bankAmounts = { ...r.bankAmounts };
                bankAmounts[bank] = { ...(bankAmounts[bank] ?? { debit: 0, credit: 0 }), [side]: val };
                return { ...r, bankAmounts };
              }),
            }
          : m,
      ),
    }));
    persistSoon();
  };

  const addMonth = () => {
    acc.setData(prev => ({
      ...prev,
      months: [
        ...prev.months,
        {
          id: newRowId("m"),
          month: "New Month",
          rows: [{
            id: newRowId("r"),
            date: acc.recordDate,
            description: "New entry",
            bankAmounts: Object.fromEntries(bankHeads.map(b => [b, { debit: 0, credit: 0 }])),
            netAmount: 0,
            notes: [],
          }],
        },
      ],
    }));
    persistNow();
  };

  return (
    <div className="flex min-h-screen accounts-page-bg">
      <AccountsSidebar />
      <main className={`flex-1 min-w-0 overflow-x-hidden ${ACCOUNTS_MAIN_OFFSET}`}>
        <AccountsPageShell
          {...accountsShellProps(acc)}
          title="Cash Flow Statement"
          subtitle="Tables are view-only — pencil opens edit popup for bank Dr/Cr & notes. Net auto-calculates from banks."
          inlineTitle
          hideFileActions
          headerActions={
            <button
              type="button"
              onClick={addMonth}
              className="h-10 px-3 rounded-xl bg-[#EAF2FE] text-[#1B6FE8] text-xs font-bold inline-flex items-center gap-1.5 hover:bg-[#FFE4E8] shrink-0"
            >
              <Landmark size={14} />
              Add Month Section
            </button>
          }
        >
          <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2.5">
            <div className={`rounded-xl p-3 text-white bg-gradient-to-br from-[#1B6FE8] to-[#0E4FBE] shadow-md min-w-0 ${theme.card}`}>
              <div className="flex items-center gap-1.5">
                <Wallet size={14} className="text-white/80 shrink-0" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/75 truncate">Net Cash Flow</p>
              </div>
              <p className="text-lg sm:text-xl font-extrabold tabular-nums mt-1 truncate">{currency(totalNet)}</p>
              <p className="text-[9px] text-white/60 font-medium mt-0.5 truncate">
                {allRows.length} entries · {acc.data.months?.length ?? 0} sections
              </p>
            </div>
            {CHANNEL_CARDS.map(c => (
              <div
                key={c.key}
                className={`rounded-xl p-3 text-white bg-gradient-to-br ${c.grad} shadow-md min-w-0`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/80 truncate">{c.label}</p>
                <p className="text-lg sm:text-xl font-extrabold tabular-nums mt-1 truncate">
                  PKR {currency(channelReceived[c.key])}
                </p>
                <p className="text-[9px] text-white/60 font-medium mt-0.5 truncate">{c.hint}</p>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-5">
            <AccountsChartCard
              title="Net by Section"
              subtitle="Cash movement across month sections"
              accent="#1B6FE8"
              icon={<Activity size={16} />}
            >
              <RechartsBox height={250}>
                <AreaChart data={monthChart.length ? monthChart : [{ name: "—", net: 0 }]}>
                  <defs>
                    <linearGradient id="cfArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1B6FE8" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#1B6FE8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 600 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={v => currency(Number(v ?? 0))} />
                  <Area type="monotone" dataKey="net" stroke="#1B6FE8" fill="url(#cfArea)" strokeWidth={2.5} />
                </AreaChart>
              </RechartsBox>
            </AccountsChartCard>

            <AccountsChartCard
              title="Bank Activity"
              subtitle="Volume share per bank"
              accent="#0B84F3"
              icon={<PieIcon size={16} />}
            >
              <RechartsBox height={250}>
                {bankChart.length > 0 ? (
                  <PieChart>
                    <Pie
                      data={bankChart.map(b => ({
                        name: b.name,
                        value: Math.abs(b.net) || Math.abs(b.debit) + Math.abs(b.credit) || 1,
                        color: b.color,
                      }))}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={88}
                      paddingAngle={3}
                      stroke="#fff"
                      strokeWidth={2}
                    >
                      {bankChart.map((b, i) => (
                        <Cell key={b.full} fill={b.color || CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={v => currency(Number(v ?? 0))} />
                  </PieChart>
                ) : (
                  <BarChart data={[{ name: "No activity", value: 0 }]}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Bar dataKey="value" fill="#E2E8F0" radius={[8, 8, 0, 0]} />
                  </BarChart>
                )}
              </RechartsBox>
            </AccountsChartCard>
          </section>

          {bankChart.length > 0 && (
            <section className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
              <AccountsChartCard
                title="Bank Debit vs Credit"
                subtitle="Side-by-side activity"
                accent="#12B76A"
                icon={<Wallet size={16} />}
              >
                <RechartsBox height={230}>
                  <BarChart data={bankChart} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 600 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={v => currency(Number(v ?? 0))} />
                    <Legend />
                    <Bar dataKey="debit" name="Debit" fill="#0B84F3" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="credit" name="Credit" fill="#1B6FE8" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </RechartsBox>
              </AccountsChartCard>
              <AccountsChartCard
                title="Bank Debit vs Credit"
                subtitle="Trend by bank"
                accent="#0B84F3"
                icon={<TrendingUp size={16} />}
              >
                <RechartsBox height={230}>
                  <LineChart data={bankChart}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 600 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={v => currency(Number(v ?? 0))} />
                    <Legend />
                    <Line type="monotone" dataKey="debit" name="Debit" stroke="#0B84F3" strokeWidth={2.5} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="credit" name="Credit" stroke="#1B6FE8" strokeWidth={2.5} dot={{ r: 4 }} />
                  </LineChart>
                </RechartsBox>
              </AccountsChartCard>
            </section>
          )}

          <div id="cash-tables" className="mt-5 scroll-mt-[80px]">
            <CashFlowTable
              months={acc.data.months ?? []}
              bankHeads={bankHeads}
              onUpdateMonthTitle={(id, title) => {
                acc.setData(prev => ({
                  ...prev,
                  months: prev.months.map(m => (m.id === id ? { ...m, month: title } : m)),
                }));
                persistNow();
              }}
              onRemoveMonth={id => {
                acc.setData(prev => ({ ...prev, months: prev.months.filter(m => m.id !== id) }));
                persistNow();
              }}
              onUpdateRow={updateRow}
              onUpdateBank={updateBank}
              onPersist={persistNow}
              onRemoveRow={(mid, rid) => {
                acc.setData(prev => ({
                  ...prev,
                  months: prev.months.map(m => m.id === mid ? { ...m, rows: m.rows.filter(r => r.id !== rid) } : m),
                }));
                persistNow();
              }}
              onAddRow={mid => {
                acc.setData(prev => ({
                  ...prev,
                  months: prev.months.map(m =>
                    m.id === mid
                      ? {
                          ...m,
                          rows: [...m.rows, {
                            id: newRowId("r"),
                            date: acc.recordDate,
                            description: "New entry",
                            bankAmounts: Object.fromEntries((prev.bankHeads ?? []).map(b => [b, { debit: 0, credit: 0 }])),
                            netAmount: 0,
                            notes: [],
                          }],
                        }
                      : m,
                  ),
                }));
                persistNow();
              }}
            />
          </div>
        </AccountsPageShell>
      </main>
    </div>
  );
}
