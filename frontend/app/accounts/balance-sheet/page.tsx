"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, CartesianGrid, PieChart, Pie, Cell, Tooltip, XAxis, YAxis,
} from "recharts";
import { Scale, TrendingUp } from "lucide-react";
import AccountsSidebar from "../components/layout/Sidebar";
import { ACCOUNTS_MAIN_OFFSET } from "../components/layout/headerOffset";
import AccountsPageShell from "../components/AccountsPageShell";
import AccountsChartCard from "../components/AccountsChartCard";
import BalanceSheetTable, { sumItems } from "../components/BalanceSheetTable";
import RechartsBox from "@/app/components/charts/RechartsBox";
import { accountsShellProps } from "../utils/accountsShellProps";
import { useAccountsPage } from "../hooks/useAccountsPage";
import { useScrollToHash } from "../hooks/useScrollToHash";
import type { BalanceSheetData, BalanceLineItem } from "../types";
import { currency, newRowId, todayIso } from "../types";

function defaultData(): BalanceSheetData {
  return { assetSections: [], equityLiabilitySections: [] };
}

function sumSections(sections: BalanceSheetData["assetSections"], useInventoryFormula = false) {
  return sections.reduce((a, s) => a + sumItems(s.items, useInventoryFormula), 0);
}

export default function BalanceSheetPage() {
  const acc = useAccountsPage<BalanceSheetData>({ page: "balance_sheet", defaultData });
  useScrollToHash(!acc.loading);

  const { totalAssets, currentAssets, nonCurrentAssets, totalEquity, totalLiabilities, balanced } = useMemo(() => {
    const assetSections = acc.data.assetSections ?? [];
    const eqSections = acc.data.equityLiabilitySections ?? [];
    const nc = assetSections.find(s => s.title.toLowerCase().includes("non-current"))?.items ?? [];
    const cur = assetSections.find(s => s.title.toLowerCase() === "current assets")?.items ?? [];
    const nonCurrentAssets = sumItems(nc.length ? nc : assetSections[0]?.items ?? [], true);
    const currentAssets = sumItems(cur.length ? cur : assetSections[1]?.items ?? [], true);
    const totalAssets = sumSections(assetSections, true);
    const equity = eqSections.find(s => s.title.toLowerCase() === "equity")?.items ?? [];
    const totalEquity = sumItems(equity, false);
    const liabilities = eqSections.filter(s => s.title.toLowerCase() !== "equity");
    const totalLiabilities = sumSections(liabilities, false);
    const totalEL = totalEquity + totalLiabilities;
    return {
      totalAssets,
      currentAssets,
      nonCurrentAssets,
      totalEquity,
      totalLiabilities,
      balanced: totalAssets > 0 && Math.abs(totalAssets - totalEL) < 1,
    };
  }, [acc.data]);

  const updateItem = (
    side: "assetSections" | "equityLiabilitySections",
    sectionId: string,
    itemId: string,
    patch: Partial<BalanceLineItem>,
  ) => {
    acc.setData(prev => ({
      ...prev,
      [side]: prev[side].map(sec =>
        sec.id === sectionId
          ? { ...sec, items: sec.items.map(it => (it.id === itemId ? { ...it, ...patch } : it)) }
          : sec,
      ),
    }));
  };

  const assetMixData = [
    { name: "Non-Current", value: nonCurrentAssets },
    { name: "Current", value: currentAssets },
  ];

  return (
    <div className="flex min-h-screen accounts-page-bg">
      <AccountsSidebar />
      <main className={`flex-1 min-w-0 overflow-x-hidden ${ACCOUNTS_MAIN_OFFSET}`}>
        <AccountsPageShell
          {...accountsShellProps(acc)}
          title="Balance Sheet"
          subtitle="Assets: TOTAL = QTY × Unit price. Equity & Liabilities stay amount-only."
          inlineTitle
          hideFileActions
        >
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Total Assets", value: totalAssets, grad: "from-[#0B84F3] to-[#0369A1]" },
              { label: "Current Assets", value: currentAssets, grad: "from-[#12B76A] to-[#027A48]" },
              { label: "Total Liabilities", value: totalLiabilities, grad: "from-[#1B6FE8] to-[#0E4FBE]" },
              { label: "Total Equity", value: totalEquity, grad: "from-[#0D9488] to-[#0F766E]" },
            ].map(c => (
              <div key={c.label} className={`relative overflow-hidden rounded-2xl p-4 text-white shadow-lg bg-gradient-to-br ${c.grad}`}>
                <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/10" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">{c.label}</p>
                <p className="text-xl sm:text-2xl font-extrabold mt-1 tabular-nums">{currency(c.value)}</p>
              </div>
            ))}
          </section>

          {!balanced && totalAssets > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
              Assets ({currency(totalAssets)}) ≠ Equity + Liabilities ({currency(totalEquity + totalLiabilities)}) — review totals.
            </div>
          )}
          {balanced && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
              Balanced — Assets ({currency(totalAssets)}) = Equity + Liabilities ({currency(totalEquity + totalLiabilities)}).
            </div>
          )}

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-5">
            <AccountsChartCard
              title="Asset Composition"
              subtitle="Current vs non-current mix"
              accent="#0B84F3"
              icon={<Scale size={16} />}
            >
              <RechartsBox height={240}>
                <PieChart>
                  <Pie data={assetMixData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={88} paddingAngle={4} stroke="#fff" strokeWidth={2}>
                    <Cell fill="#0B84F3" />
                    <Cell fill="#12B76A" />
                  </Pie>
                  <Tooltip formatter={v => currency(Number(v ?? 0))} />
                </PieChart>
              </RechartsBox>
            </AccountsChartCard>
            <AccountsChartCard
              title="Assets vs Equity + Liabilities"
              subtitle="Balance check at a glance"
              accent="#1B6FE8"
              icon={<TrendingUp size={16} />}
            >
              <RechartsBox height={240}>
                <BarChart data={[
                  { name: "Assets", value: totalAssets, fill: "#0B84F3" },
                  { name: "Eq + Liab.", value: totalEquity + totalLiabilities, fill: "#1B6FE8" },
                ]} barSize={52}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 600 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={v => currency(Number(v ?? 0))} />
                  <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                    <Cell fill="#0B84F3" />
                    <Cell fill="#1B6FE8" />
                  </Bar>
                </BarChart>
              </RechartsBox>
            </AccountsChartCard>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-5">
            <div id="bs-assets" className="scroll-mt-[80px]">
            <BalanceSheetTable
              variant="assets"
              groupTitle="Assets"
              grandLabel="Total Assets"
              sections={acc.data.assetSections ?? []}
              onUpdateSectionTitle={(id, title) => acc.setData(prev => ({
                ...prev,
                assetSections: prev.assetSections.map(s => (s.id === id ? { ...s, title } : s)),
              }))}
              onUpdateItem={(sid, iid, patch) => updateItem("assetSections", sid, iid, patch)}
              onDeleteItem={(sid, iid) => acc.setData(prev => ({
                ...prev,
                assetSections: prev.assetSections.map(s => s.id === sid ? { ...s, items: s.items.filter(i => i.id !== iid) } : s),
              }))}
              onAddItem={sid => acc.setData(prev => ({
                ...prev,
                assetSections: prev.assetSections.map(s =>
                  s.id === sid
                    ? {
                        ...s,
                        items: [...s.items, {
                          id: newRowId("a"), label: "New Line", note: "", amount: 0, filledAt: todayIso(), subHeads: [], notes: [],
                        }],
                      }
                    : s,
                ),
              }))}
              onAddSection={() => acc.setData(prev => ({
                ...prev,
                assetSections: [...prev.assetSections, { id: newRowId("as"), title: "New Asset Section", items: [] }],
              }))}
            />
            </div>

            <div id="bs-equity" className="scroll-mt-[80px]">
            <BalanceSheetTable
              variant="liability"
              groupTitle="Equity & Liabilities"
              grandLabel="Total Equity & Liabilities"
              sections={acc.data.equityLiabilitySections ?? []}
              onUpdateSectionTitle={(id, title) => acc.setData(prev => ({
                ...prev,
                equityLiabilitySections: prev.equityLiabilitySections.map(s => (s.id === id ? { ...s, title } : s)),
              }))}
              onUpdateItem={(sid, iid, patch) => updateItem("equityLiabilitySections", sid, iid, patch)}
              onDeleteItem={(sid, iid) => acc.setData(prev => ({
                ...prev,
                equityLiabilitySections: prev.equityLiabilitySections.map(s => s.id === sid ? { ...s, items: s.items.filter(i => i.id !== iid) } : s),
              }))}
              onAddItem={sid => acc.setData(prev => ({
                ...prev,
                equityLiabilitySections: prev.equityLiabilitySections.map(s =>
                  s.id === sid
                    ? {
                        ...s,
                        items: [...s.items, {
                          id: newRowId("e"), label: "New Line", note: "", amount: 0, filledAt: todayIso(), subHeads: [], notes: [],
                        }],
                      }
                    : s,
                ),
              }))}
              onAddSection={() => acc.setData(prev => ({
                ...prev,
                equityLiabilitySections: [...prev.equityLiabilitySections, { id: newRowId("es"), title: "New Section", items: [] }],
              }))}
            />
            </div>
          </div>
        </AccountsPageShell>
      </main>
    </div>
  );
}
