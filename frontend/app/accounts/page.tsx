"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  BarChart3,
  Boxes,
  Building2,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Eye,
  Layers3,
  PieChart as PieIcon,
  RefreshCw,
  Scale,
  Sigma,
  TrendingUp,
  Wallet,
  Waves,
  Receipt,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import API, { apiErrorMessage } from "@/lib/api";
import { getAccountsDashboardSummary } from "@/lib/accountsDashboardCache";
import { formatEstDateTime } from "@/lib/estTime";
import AccountsSidebar from "./components/layout/Sidebar";
import { ACCOUNTS_MAIN_OFFSET } from "./components/layout/headerOffset";
import AccountsPageShell from "./components/AccountsPageShell";
import AccountsChartCard from "./components/AccountsChartCard";
import CurrencyFormulaModal from "./components/CurrencyFormulaModal";
import FormulaBookModal from "./components/FormulaBookModal";
import RechartsBox from "@/app/components/charts/RechartsBox";
import { accountsShellProps } from "./utils/accountsShellProps";
import { useAccountsPage } from "./hooks/useAccountsPage";
import { useScrollToHash } from "./hooks/useScrollToHash";
import { normalizePeriodPreset } from "./utils/accountsPeriodFilters";
import type { CurrencyTabKey, DashboardCurrency, DashboardCurrencyTab, DashboardData, FormulasState } from "./types";
import { CURRENCY_TAB_LABELS, CURRENCY_TAB_SHORT, currency, isLocalPaymentTab, todayIso } from "./types";
import { BENTO_CARD } from "@/lib/staffPageLayout";
function fmtFx(n: number, ccy: "USD" | "CAD" | "PKR"): string {
  const prefix = ccy === "USD" ? "$" : ccy === "CAD" ? "CAD " : "PKR ";
  return `${prefix}${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function compactPkr(n: number): string {
  const a = Math.abs(Number(n) || 0);
  const sign = (Number(n) || 0) < 0 ? "-" : "";
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${sign}${(a / 1_000).toFixed(0)}k`;
  return `${sign}${Math.round(a)}`;
}

const TAB_DEFAULTS: Record<CurrencyTabKey, DashboardCurrencyTab> = {
  // Ahmed Hamza — USD/CAD × 0.89 → × FX (example USD rate 285)
  AH: {
    usdAmount: 0,
    cadAmount: 0,
    pkrAmount: 0,
    usdToPkrRate: 285,
    cadToPkrRate: 204,
    usdTaxFactor: 0.89,
    cadTaxFactor: 0.89,
  },
  // Sharjeel Nasir — CAD × 0.945 → × 196
  SN: {
    usdAmount: 0,
    cadAmount: 0,
    pkrAmount: 0,
    usdToPkrRate: 285,
    cadToPkrRate: 196,
    usdTaxFactor: 0.89,
    cadTaxFactor: 0.945,
  },
  // Cheque payment — 25% tax deduction on PKR gross
  CHQ: {
    usdAmount: 0,
    cadAmount: 0,
    pkrAmount: 0,
    usdToPkrRate: 1,
    cadToPkrRate: 1,
    usdTaxFactor: 1,
    cadTaxFactor: 1,
    taxDeductionRate: 0.25,
  },
  // Direct payment Habib Metro — 1% tax deduction on PKR gross
  HM: {
    usdAmount: 0,
    cadAmount: 0,
    pkrAmount: 0,
    usdToPkrRate: 1,
    cadToPkrRate: 1,
    usdTaxFactor: 1,
    cadTaxFactor: 1,
    taxDeductionRate: 0.01,
  },
};

function defaultData(): DashboardData {
  return {
    currency: {
      tabs: {
        SN: { ...TAB_DEFAULTS.SN },
        AH: { ...TAB_DEFAULTS.AH },
        CHQ: { ...TAB_DEFAULTS.CHQ },
        HM: { ...TAB_DEFAULTS.HM },
      },
    },
    formulas: { overrides: {}, custom: [] },
  };
}

/** Migrate older single-block currency saves into SN/AH/CHQ/HM tabs. */
function normalizeCurrency(raw: DashboardCurrency | undefined): DashboardCurrency {
  const base = defaultData().currency;
  if (!raw) return base;

  const mergeFx = (key: "AH" | "SN", locked: Partial<DashboardCurrencyTab>) => ({
    ...TAB_DEFAULTS[key],
    ...(raw.tabs?.[key] ?? {}),
    ...locked,
  });

  if (raw.tabs?.SN && raw.tabs?.AH) {
    return {
      tabs: {
        AH: mergeFx("AH", { usdTaxFactor: 0.89, cadTaxFactor: 0.89 }),
        SN: mergeFx("SN", { cadTaxFactor: 0.945 }),
        CHQ: {
          ...TAB_DEFAULTS.CHQ,
          ...(raw.tabs.CHQ ?? {}),
          taxDeductionRate: 0.25,
          usdAmount: 0,
          cadAmount: 0,
        },
        HM: {
          ...TAB_DEFAULTS.HM,
          ...(raw.tabs.HM ?? {}),
          taxDeductionRate: 0.01,
          usdAmount: 0,
          cadAmount: 0,
        },
      },
    };
  }

  // Legacy flat shape → put amounts on SN, keep others defaults
  return {
    tabs: {
      SN: {
        ...TAB_DEFAULTS.SN,
        usdAmount: raw.usdAmount ?? TAB_DEFAULTS.SN.usdAmount,
        cadAmount: raw.cadAmount ?? TAB_DEFAULTS.SN.cadAmount,
        pkrAmount: raw.pkrAmount ?? TAB_DEFAULTS.SN.pkrAmount,
        usdToPkrRate: raw.usdToPkrRate ?? TAB_DEFAULTS.SN.usdToPkrRate,
        cadToPkrRate: raw.cadToPkrRate ?? TAB_DEFAULTS.SN.cadToPkrRate,
      },
      AH: { ...TAB_DEFAULTS.AH },
      CHQ: { ...TAB_DEFAULTS.CHQ },
      HM: { ...TAB_DEFAULTS.HM },
    },
  };
}

type TabCalc = {
  usdAfterTax: number;
  cadAfterTax: number;
  usdInPkr: number;
  cadInPkr: number;
  pkrGross: number;
  pkrTax: number;
  pkrNet: number;
  total: number;
};

function calcTab(t: DashboardCurrencyTab): TabCalc {
  const rate = Number(t.taxDeductionRate);
  if (Number.isFinite(rate) && rate > 0) {
    const pkrGross = Number(t.pkrAmount) || 0;
    const pkrTax = pkrGross * rate;
    const pkrNet = pkrGross - pkrTax;
    return {
      usdAfterTax: 0,
      cadAfterTax: 0,
      usdInPkr: 0,
      cadInPkr: 0,
      pkrGross,
      pkrTax,
      pkrNet,
      total: pkrNet,
    };
  }

  const usdAfterTax = t.usdAmount * t.usdTaxFactor;
  const cadAfterTax = t.cadAmount * t.cadTaxFactor;
  const usdInPkr = usdAfterTax * t.usdToPkrRate;
  const cadInPkr = cadAfterTax * t.cadToPkrRate;
  const pkrNet = Number(t.pkrAmount) || 0;
  return {
    usdAfterTax,
    cadAfterTax,
    usdInPkr,
    cadInPkr,
    pkrGross: pkrNet,
    pkrTax: 0,
    pkrNet,
    total: usdInPkr + cadInPkr + pkrNet,
  };
}

type Summary = {
  currencyFormulaTotal?: number;
  balanceSheetTotalAssets?: number;
  balanceSheetTotalEquity?: number;
  balanceSheetTotalLiabilities?: number;
  balanceSheetEquityLiabilities?: number;
  balanceSheetDifference?: number;
  incomeTotalRevenue?: number;
  incomePayroll?: number;
  incomeOpex?: number;
  incomeLoans?: number;
  incomeProvidentFund?: number;
  incomeTotalExpense?: number;
  incomeNetProfit?: number;
  cashFlowNet?: number;
  totalAssetsRegister?: number;
};

type ChannelFxAmounts = { usdAmount: number; cadAmount: number; pkrAmount: number };
type ChannelFx = Record<"AH" | "SN" | "CHQ" | "HM", ChannelFxAmounts>;

type RateDraft = { AH: { usd: number; cad: number }; SN: { usd: number; cad: number } };

/** Keep Ahmed / Sharjeel FX rates; amounts stay on the record until payments overwrite them. */
function withSnapshotRates(local: DashboardCurrency, snap: DashboardCurrency | null): DashboardCurrency {
  if (!snap) return local;
  const next = normalizeCurrency(local);
  const saved = normalizeCurrency(snap);
  for (const key of ["AH", "SN"] as const) {
    next.tabs[key] = {
      ...next.tabs[key],
      usdToPkrRate: Number(saved.tabs[key].usdToPkrRate) || next.tabs[key].usdToPkrRate,
      cadToPkrRate: Number(saved.tabs[key].cadToPkrRate) || next.tabs[key].cadToPkrRate,
    };
  }
  return next;
}

/** Month collections × the rates on screen. Same math the Income Statement uses. */
function applyChannelAmounts(
  tab: DashboardCurrencyTab,
  key: CurrencyTabKey,
  fx: ChannelFxAmounts | undefined,
): DashboardCurrencyTab {
  if (!fx) return tab;
  if (key === "CHQ" || key === "HM") {
    const usdRate = Number(tab.usdToPkrRate) || 280;
    const cadRate = Number(tab.cadToPkrRate) || 200;
    return {
      ...tab,
      usdAmount: 0,
      cadAmount: 0,
      pkrAmount:
        (Number(fx.pkrAmount) || 0) +
        (Number(fx.usdAmount) || 0) * usdRate +
        (Number(fx.cadAmount) || 0) * cadRate,
    };
  }
  return {
    ...tab,
    usdAmount: Number(fx.usdAmount) || 0,
    cadAmount: Number(fx.cadAmount) || 0,
    pkrAmount: Number(fx.pkrAmount) || 0,
  };
}

type ViewTab = CurrencyTabKey | "ALL";

type LiveFxRates = {
  usdToPkr: number;
  cadToPkr: number;
  source: string;
  fetchedAt: string;
  usdSource?: string;
  cadSource?: string;
};

export default function AccountsDashboardPage() {
  const acc = useAccountsPage<DashboardData>({ page: "dashboard", defaultData });
  useScrollToHash(!acc.loading);
  const [summaries, setSummaries] = useState<Summary>({});
  const [channelFx, setChannelFx] = useState<ChannelFx | null>(null);
  const [formulaSnapshot, setFormulaSnapshot] = useState<DashboardCurrency | null>(null);
  const [rateDraft, setRateDraft] = useState<RateDraft | null>(null);
  const formulaSnapshotRef = useRef<DashboardCurrency | null>(null);
  const rateDraftRef = useRef<RateDraft | null>(null);
  formulaSnapshotRef.current = formulaSnapshot;
  rateDraftRef.current = rateDraft;
  const [viewTab, setViewTab] = useState<ViewTab>("AH");
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [formulaBookOpen, setFormulaBookOpen] = useState(false);
  const [fxExpanded, setFxExpanded] = useState(true);
  const [formulaExpanded, setFormulaExpanded] = useState(true);
  const [fxRates, setFxRates] = useState<LiveFxRates | null>(null);
  const [fxError, setFxError] = useState("");
  const [fxVersion, setFxVersion] = useState(0);
  const [fxLoadedVersion, setFxLoadedVersion] = useState(-1);
  const fxLoading = fxLoadedVersion !== fxVersion;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mode = normalizePeriodPreset(acc.periodPreset);
        const qs =
          mode === "all_time"
            ? `mode=all_time&to=${todayIso()}`
            : (mode === "month" || mode === "date_range") && acc.filterFrom && acc.filterTo
              ? `mode=range&from=${acc.filterFrom}&to=${acc.filterTo}`
              : `date=${acc.recordDate}`;
        const res = await getAccountsDashboardSummary(qs, true) as {
          summaries?: Summary;
          channelFx?: ChannelFx;
          dashboard?: { currency?: DashboardCurrency };
        };
        if (!cancelled) {
          setSummaries(res.summaries ?? {});
          const fx = res.channelFx;
          setChannelFx(fx?.AH && typeof fx.AH.usdAmount === "number" ? fx : null);
          setFormulaSnapshot(res.dashboard?.currency ? normalizeCurrency(res.dashboard.currency) : null);
        }
      } catch {
        if (!cancelled) {
          setSummaries({});
          setChannelFx(null);
          setFormulaSnapshot(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [acc.recordDate, acc.periodPreset, acc.filterFrom, acc.filterTo, acc.dirty, acc.saving]);

  const draftScope = `${acc.periodPreset}:${acc.filterMonth}`;
  const [draftScopeSeen, setDraftScopeSeen] = useState(draftScope);
  if (draftScopeSeen !== draftScope) {
    setDraftScopeSeen(draftScope);
    if (rateDraft) {
      rateDraftRef.current = null;
      setRateDraft(null);
    }
  } else if (rateDraft && formulaSnapshot && !acc.saving) {
    const snap = normalizeCurrency(formulaSnapshot);
    const same =
      snap.tabs.AH.usdToPkrRate === rateDraft.AH.usd &&
      snap.tabs.AH.cadToPkrRate === rateDraft.AH.cad &&
      snap.tabs.SN.usdToPkrRate === rateDraft.SN.usd &&
      snap.tabs.SN.cadToPkrRate === rateDraft.SN.cad;
    if (same) {
      rateDraftRef.current = null;
      setRateDraft(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    API.get("/accounts/fx-rates")
      .then(res => {
        if (cancelled) return;
        setFxRates({
          usdToPkr: Number(res.data.usdToPkr) || 0,
          cadToPkr: Number(res.data.cadToPkr) || 0,
          source: String(res.data.source ?? "market"),
          fetchedAt: String(res.data.fetchedAt ?? new Date().toISOString()),
          usdSource: res.data.usdSource,
          cadSource: res.data.cadSource,
        });
        setFxError("");
      })
      .catch(err => {
        if (cancelled) return;
        setFxRates(null);
        setFxError(apiErrorMessage(err, "Could not load live rates."));
      })
      .finally(() => {
        if (!cancelled) setFxLoadedVersion(fxVersion);
      });
    return () => {
      cancelled = true;
    };
  }, [fxVersion]);

  const periodMode = normalizePeriodPreset(acc.periodPreset);
  const isAllTime = periodMode === "all_time";
  const isMonth = periodMode === "month";
  const isDateRange = periodMode === "date_range";
  const usesPeriodSummary = isAllTime || isMonth || isDateRange;

  const storedCurrency = normalizeCurrency(acc.data.currency);
  const ratedCurrency = rateDraft
    ? withSnapshotRates(storedCurrency, null)
    : withSnapshotRates(storedCurrency, formulaSnapshot);
  const currencyData = normalizeCurrency(
    rateDraft
      ? {
          tabs: {
            ...ratedCurrency.tabs,
            AH: {
              ...ratedCurrency.tabs.AH,
              usdToPkrRate: rateDraft.AH.usd,
              cadToPkrRate: rateDraft.AH.cad,
            },
            SN: {
              ...ratedCurrency.tabs.SN,
              usdToPkrRate: rateDraft.SN.usd,
              cadToPkrRate: rateDraft.SN.cad,
            },
          },
        }
      : ratedCurrency,
  );
  const monthFx = isMonth ? channelFx : null;
  const sn = applyChannelAmounts(currencyData.tabs.SN, "SN", monthFx?.SN);
  const ah = applyChannelAmounts(currencyData.tabs.AH, "AH", monthFx?.AH);
  const chq = applyChannelAmounts(currencyData.tabs.CHQ, "CHQ", monthFx?.CHQ);
  const hm = applyChannelAmounts(currencyData.tabs.HM, "HM", monthFx?.HM);
  const snCalc = calcTab(sn);
  const ahCalc = calcTab(ah);
  const chqCalc = calcTab(chq);
  const hmCalc = calcTab(hm);

  const activeKey: CurrencyTabKey = viewTab === "ALL" ? "AH" : viewTab;
  const active = activeKey === "AH" ? ah : activeKey === "SN" ? sn : activeKey === "CHQ" ? chq : hm;
  const activeCalc = calcTab(active);

  const displayCalc = viewTab === "ALL"
    ? {
        usdAfterTax: snCalc.usdAfterTax + ahCalc.usdAfterTax,
        cadAfterTax: snCalc.cadAfterTax + ahCalc.cadAfterTax,
        usdInPkr: snCalc.usdInPkr + ahCalc.usdInPkr,
        cadInPkr: snCalc.cadInPkr + ahCalc.cadInPkr,
        pkrGross: snCalc.pkrGross + ahCalc.pkrGross + chqCalc.pkrGross + hmCalc.pkrGross,
        pkrTax: snCalc.pkrTax + ahCalc.pkrTax + chqCalc.pkrTax + hmCalc.pkrTax,
        pkrNet: snCalc.pkrNet + ahCalc.pkrNet + chqCalc.pkrNet + hmCalc.pkrNet,
        total: snCalc.total + ahCalc.total + chqCalc.total + hmCalc.total,
        pkrAmount: snCalc.pkrNet + ahCalc.pkrNet + chqCalc.pkrNet + hmCalc.pkrNet,
      }
    : { ...activeCalc, pkrAmount: activeCalc.pkrNet };

  const bsAssets = summaries.balanceSheetTotalAssets ?? 0;
  const bsEquityLiab = summaries.balanceSheetEquityLiabilities
    ?? ((summaries.balanceSheetTotalEquity ?? 0) + (summaries.balanceSheetTotalLiabilities ?? 0));
  const bsDiff = summaries.balanceSheetDifference ?? (bsAssets - bsEquityLiab);
  const bsBalanced = Math.abs(bsDiff) < 1 && bsAssets > 0;

  const combinedTotal = ahCalc.total + snCalc.total + chqCalc.total + hmCalc.total;

  const periodHint = isAllTime
    ? `All Time · through ${todayIso()}`
    : isMonth
      ? "This month · same as Income Statement"
      : isDateRange
        ? "This range · same as Income Statement"
        : `As of ${acc.recordDate || todayIso()}`;
  const serverRev = summaries.incomeTotalRevenue ?? 0;
  const currencyCardTotal = isMonth && channelFx
    ? combinedTotal
    : usesPeriodSummary
      ? serverRev
      : (summaries.incomeTotalRevenue ?? combinedTotal);
  const isRev = currencyCardTotal;
  const isExp = summaries.incomeTotalExpense ?? 0;
  const isProfit = (summaries.incomeNetProfit ?? 0) - serverRev + isRev;
  const netCashFlow = summaries.cashFlowNet ?? 0;
  const bsLiab = summaries.balanceSheetTotalLiabilities ?? 0;
  const bsEquity = summaries.balanceSheetTotalEquity ?? 0;
  const kpiCards = [
    { label: "Revenue", value: currencyCardTotal, color: "#6D28D9", hint: "Income Statement total revenue", href: "/accounts/income-statement", icon: <TrendingUp size={14} /> },
    { label: "Total expenses", value: isExp, color: "#1B6FE8", hint: "Payroll + OPEX", href: "/accounts/income-statement", icon: <Layers3 size={14} /> },
    { label: "Profit / Loss", value: isProfit, color: isProfit >= 0 ? "#027A48" : "#1B6FE8", hint: isProfit >= 0 ? "Net profit" : "Net loss", href: "/accounts/income-statement", icon: <TrendingUp size={14} /> },
    { label: "Net Balance", value: netCashFlow, color: "#0E4FBE", hint: "Cash Flow net amount", href: "/accounts/cash-flow-statement", icon: <Waves size={14} /> },
    { label: "Total Assets", value: bsAssets, color: "#0F766E", hint: "Balance Sheet · Total Assets", href: "/accounts/balance-sheet#bs-assets", icon: <Building2 size={14} /> },
    { label: "Total Liabilities", value: bsLiab, color: "#0369A1", hint: "Balance Sheet", href: "/accounts/balance-sheet", icon: <Scale size={14} /> },
    { label: "Total Equity", value: bsEquity, color: "#0D9488", hint: "Balance Sheet", href: "/accounts/balance-sheet", icon: <Wallet size={14} /> },
  ];

  const fxFor = (key: "AH" | "SN" | "CHQ" | "HM"): ChannelFxAmounts => {
    if (channelFx?.[key]) return channelFx[key];
    const tab = key === "AH" ? ah : key === "SN" ? sn : key === "CHQ" ? chq : hm;
    return {
      usdAmount: Number(tab.usdAmount) || 0,
      cadAmount: Number(tab.cadAmount) || 0,
      pkrAmount: Number(tab.pkrAmount) || 0,
    };
  };

  const channelChips = [
    { key: "AH" as const, label: "Ahmed Hamza", fx: fxFor("AH"), dot: "#1B6FE8" },
    { key: "SN" as const, label: "Sharjeel Nasir", fx: fxFor("SN"), dot: "#0B84F3" },
    { key: "CHQ" as const, label: "Cheque", fx: fxFor("CHQ"), dot: "#F59E0B" },
    { key: "HM" as const, label: "Habib Metro", fx: fxFor("HM"), dot: "#12B76A" },
  ];

  const paymentSplit = channelChips.map(c => ({
    name: c.key === "AH" ? "Ahmed" : c.key === "SN" ? "Sharjeel" : c.key === "CHQ" ? "Cheque" : "Habib",
    USD: c.fx.usdAmount,
    CAD: c.fx.cadAmount,
    PKR: c.fx.pkrAmount,
    amount: c.fx.usdAmount + c.fx.cadAmount + c.fx.pkrAmount,
    color: c.dot,
  }));
  const paymentSplitPie = paymentSplit.filter(r => r.amount > 0).concat(
    paymentSplit.every(r => r.amount <= 0) ? [{ name: "Empty", USD: 0, CAD: 0, PKR: 0, amount: 1, color: "#E2E8F0" }] : [],
  );

  const isPayroll = summaries.incomePayroll ?? 0;
  const isOpex = summaries.incomeOpex ?? 0;
  const isLoans = summaries.incomeLoans ?? 0;
  const isPf = summaries.incomeProvidentFund ?? 0;
  const profitMarginPct = isRev > 0 ? (isProfit / isRev) * 100 : 0;
  const marginClamped = Math.max(0, Math.min(100, Number.isFinite(profitMarginPct) ? Math.abs(profitMarginPct) : 0));

  const pnlComposed = [
    { name: "Revenue", amount: isRev, marker: isProfit },
    { name: "Expense", amount: isExp, marker: isProfit },
    { name: "Net Profit", amount: isProfit, marker: isProfit },
  ];

  const pnlHorizontal = [
    { name: "Revenue", value: isRev, fill: "#12B76A" },
    { name: "Payroll", value: isPayroll, fill: "#0B84F3" },
    { name: "OPEX", value: isOpex, fill: "#1B6FE8" },
    { name: "Loans", value: isLoans, fill: "#F59E0B" },
    { name: "PF", value: isPf, fill: "#0D9488" },
    { name: "Net Profit", value: isProfit, fill: isProfit >= 0 ? "#12B76A" : "#1B6FE8" },
  ];

  const expenseMix = [
    { name: "Payroll", value: Math.max(0, isPayroll), color: "#0B84F3" },
    { name: "OPEX", value: Math.max(0, isOpex), color: "#1B6FE8" },
    { name: "Loans", value: Math.max(0, isLoans), color: "#F59E0B" },
    { name: "PF", value: Math.max(0, isPf), color: "#0D9488" },
  ];

  const channelMixArea = [
    { name: "USD", Ahmed: ahCalc.usdInPkr, Sharjeel: snCalc.usdInPkr, Cheque: 0, Habib: 0 },
    { name: "CAD", Ahmed: ahCalc.cadInPkr, Sharjeel: snCalc.cadInPkr, Cheque: 0, Habib: 0 },
    { name: "Local PKR", Ahmed: ahCalc.pkrNet, Sharjeel: snCalc.pkrNet, Cheque: chqCalc.pkrNet, Habib: hmCalc.pkrNet },
  ];

  const marginGauge = [
    {
      name: "Margin",
      value: marginClamped,
      fill: profitMarginPct >= 0 ? "#12B76A" : "#1B6FE8",
    },
  ];

  const setTabField = (tab: CurrencyTabKey, key: keyof DashboardCurrencyTab, val: number) => {
    const stored = withSnapshotRates(
      normalizeCurrency(acc.data.currency),
      formulaSnapshotRef.current,
    );
    const draft = rateDraftRef.current;
    const seeded: DashboardCurrency = draft
      ? {
          tabs: {
            ...stored.tabs,
            AH: { ...stored.tabs.AH, usdToPkrRate: draft.AH.usd, cadToPkrRate: draft.AH.cad },
            SN: { ...stored.tabs.SN, usdToPkrRate: draft.SN.usd, cadToPkrRate: draft.SN.cad },
          },
        }
      : stored;
    const locked =
      tab === "CHQ"
        ? { taxDeductionRate: 0.25 as const }
        : tab === "HM"
          ? { taxDeductionRate: 0.01 as const }
          : tab === "AH"
            ? { usdTaxFactor: 0.89, cadTaxFactor: 0.89 }
            : tab === "SN"
              ? { cadTaxFactor: 0.945 }
              : {};
    const nextData: DashboardData = {
      ...acc.data,
      currency: {
        tabs: {
          ...seeded.tabs,
          [tab]: { ...seeded.tabs[tab], [key]: val, ...locked },
        },
      },
    };
    const nextDraft: RateDraft = {
      AH: {
        usd: nextData.currency.tabs.AH.usdToPkrRate,
        cad: nextData.currency.tabs.AH.cadToPkrRate,
      },
      SN: {
        usd: nextData.currency.tabs.SN.usdToPkrRate,
        cad: nextData.currency.tabs.SN.cadToPkrRate,
      },
    };
    rateDraftRef.current = nextDraft;
    setRateDraft(nextDraft);
    acc.setData(() => nextData);
    void acc.save(nextData, { silent: true });
  };

  /** Formula Book — edits save straight into the dashboard record */
  const formulasState: FormulasState = acc.data.formulas ?? {};
  const handleFormulasChange = (next: FormulasState) => {
    const nextData: DashboardData = { ...acc.data, formulas: next };
    acc.setData(() => nextData);
    void acc.save(nextData);
  };

  const formulaLiveNotes: Record<string, string> = {
    "fx-ah": `Current: USD rate ${ah.usdToPkrRate} · CAD rate ${ah.cadToPkrRate} · factor ${ah.usdTaxFactor}`,
    "fx-sn": `Current: CAD rate ${sn.cadToPkrRate} · factor ${sn.cadTaxFactor}`,
    "fx-chq": `Current gross: ${currency(chq.pkrAmount)} → net ${currency(chqCalc.pkrNet)}`,
    "fx-hm": `Current gross: ${currency(hm.pkrAmount)} → net ${currency(hmCalc.pkrNet)}`,
    "is-net-profit": `Current (${acc.recordDate}): ${currency(summaries.incomeNetProfit ?? 0)}`,
  };

  const formulaNote =
    viewTab === "AH"
      ? "Ahmed Hamza: USD/CAD × 0.89 = after tax → × international FX rate = PKR received."
      : viewTab === "SN"
        ? "Sharjeel Nasir (CAD): CAD × 0.945 = after tax → × exchange rate (record: 196) = PKR received."
        : viewTab === "CHQ"
          ? "Cheque payment: Gross PKR − 25% tax = net received."
          : viewTab === "HM"
            ? "Direct payment Habib Metro: Gross PKR − 1% tax = net received."
            : "Combined Ahmed + Sharjeel + Cheque + Habib Metro net totals.";

  return (
    <div className="flex min-h-screen accounts-page-bg">
      <AccountsSidebar />
      <main className={`flex-1 min-w-0 overflow-x-hidden ${ACCOUNTS_MAIN_OFFSET}`}>
        <AccountsPageShell
          {...accountsShellProps(acc)}
          title="Dashboard"
          subtitle="Live totals · filter by period · currency formula uses each month’s final rates."
          inlineTitle
          hideFileActions
          headerActions={
            <button
              type="button"
              onClick={() => setFormulaBookOpen(true)}
              className="h-10 px-4 rounded-xl bg-[#EAF2FE] border border-[#F3D7DC] text-xs font-bold text-[#1B6FE8] inline-flex items-center gap-2 hover:bg-[#FFE4E8] transition-colors shadow-sm"
              title="All Accounts formulas — by section, editable"
            >
              <Sigma size={15} />
              All Formulas
            </button>
          }
        >
          <section className="rounded-2xl border border-gray-100 dark:border-crm-border bg-crm-surface p-4 sm:p-5">
            <div className="flex flex-col lg:flex-row lg:items-end gap-4 lg:gap-8">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-crm-text-faint">Total Received</p>
                  <span className="text-[10px] font-semibold tabular-nums text-crm-text-muted bg-crm-muted px-2 py-0.5 rounded-full">
                    {isMonth
                      ? acc.filterMonth
                      : isDateRange && acc.filterFrom && acc.filterTo
                        ? `${acc.filterFrom} → ${acc.filterTo}`
                        : (acc.recordDate || todayIso())}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    bsBalanced ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  }`}>
                    {bsBalanced ? "BS balanced" : "BS not balanced"}
                  </span>
                </div>
                <p className="mt-1.5 text-3xl sm:text-4xl font-extrabold tabular-nums tracking-tight text-crm-text">
                  {currency(currencyCardTotal)}
                </p>
                <p className="mt-1 text-[11px] text-crm-text-faint font-medium">
                  Same as IS Total Revenue · Ahmed + Sharjeel + Cheque + Habib Metro
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:min-w-[420px]">
                {channelChips.map(c => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => { setViewTab(c.key); setFormulaOpen(false); }}
                    className="text-left rounded-xl border border-gray-100 bg-crm-muted/50 px-3 py-2 transition-colors"
                    title={`View ${c.label} formula`}
                    style={{ borderColor: `${c.dot}33` }}
                  >
                    <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: c.dot }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.dot }} />
                      {c.label}
                    </p>
                    <p className="mt-1 text-[11px] font-bold tabular-nums text-crm-text leading-snug">
                      {fmtFx(c.fx.usdAmount, "USD")}
                    </p>
                    <p className="text-[11px] font-bold tabular-nums text-crm-text leading-snug">
                      {fmtFx(c.fx.cadAmount, "CAD")}
                    </p>
                    {(c.key === "CHQ" || c.key === "HM" || c.fx.pkrAmount > 0) && (
                      <p className="text-[10px] font-semibold tabular-nums text-crm-text-muted leading-snug">
                        {fmtFx(c.fx.pkrAmount, "PKR")}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3 mt-4">
            {kpiCards.map(m => (
              <Link
                key={m.label}
                href={m.href}
                className="rounded-2xl border border-gray-100 dark:border-crm-border bg-crm-surface p-3.5 sm:p-4 hover:border-[#1B6FE8]/35 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-crm-text-faint leading-snug">{m.label}</p>
                  <span
                    className="shrink-0 w-6 h-6 rounded-lg inline-flex items-center justify-center text-white"
                    style={{ backgroundColor: m.color }}
                  >
                    {m.icon}
                  </span>
                </div>
                <p className="text-lg sm:text-xl font-extrabold mt-2 tabular-nums tracking-tight text-crm-text">{currency(m.value)}</p>
                <p className="text-[10px] text-crm-text-faint mt-1.5 font-medium leading-snug">{m.hint}</p>
              </Link>
            ))}
          </section>

          <section className="mt-5 w-full space-y-4">
            <div id="live-fx" className={`w-full ${BENTO_CARD} overflow-hidden scroll-mt-[80px]`}>
              <div className="px-4 sm:px-5 py-3 border-b border-crm-border-subtle bg-gradient-to-r from-[#EFF8FF] to-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setFxExpanded(v => !v)}
                  className="min-w-0 flex-1 text-left flex items-start gap-2"
                  aria-expanded={fxExpanded}
                >
                  <ChevronDown
                    size={16}
                    className={`mt-0.5 shrink-0 text-[#0B84F3] transition-transform ${fxExpanded ? "" : "-rotate-90"}`}
                  />
                  <div className="min-w-0">
                    <h2 className="font-extrabold text-[#0369A1] text-sm tracking-tight">Live FX Rates — USD & CAD → PKR</h2>
                    <p className="text-[11px] text-crm-text-faint mt-0.5">
                      Fetched from Google Finance · live USD and CAD to PKR for review against your formula
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  disabled={fxLoading}
                  onClick={() => setFxVersion(v => v + 1)}
                  className="h-9 px-3 rounded-xl bg-[#EAF5FF] border border-[#D6EBFF] text-[#0B84F3] text-[11px] font-bold inline-flex items-center gap-1.5 hover:bg-[#D6EBFF] disabled:opacity-50 shrink-0"
                  title="Fetch rates again"
                >
                  <RefreshCw size={13} className={fxLoading ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>

              {fxExpanded && (
              <div className="p-4 sm:p-5">
                {fxLoading && !fxRates ? (
                  <p className="text-xs text-crm-text-faint font-medium flex items-center gap-2">
                    <RefreshCw size={14} className="animate-spin text-[#0B84F3]" />
                    Loading live rates from Google…
                  </p>
                ) : fxError && !fxRates ? (
                  <p className="text-xs text-red-500 font-medium">{fxError}</p>
                ) : fxRates ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-[#D6EBFF] bg-[#F8FBFF] p-3.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#0369A1]">1 USD → PKR</p>
                        <p className="text-2xl font-extrabold tabular-nums text-crm-text mt-1">{fxRates.usdToPkr.toFixed(4)}</p>
                        <p className="text-[10px] text-crm-text-faint mt-1">{fxRates.usdSource ?? "Google Finance"}</p>
                        <p className="text-[10px] text-crm-text-muted mt-2">
                          Ahmed formula now: <span className="font-bold text-crm-text-secondary tabular-nums">{ah.usdToPkrRate}</span>
                          {Math.abs(ah.usdToPkrRate - fxRates.usdToPkr) > 0.01 && (
                            <span className="ml-1 text-[#1B6FE8] font-semibold">
                              (diff {(fxRates.usdToPkr - ah.usdToPkrRate).toFixed(2)})
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[#D6EBFF] bg-[#F8FBFF] p-3.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#0369A1]">1 CAD → PKR</p>
                        <p className="text-2xl font-extrabold tabular-nums text-crm-text mt-1">{fxRates.cadToPkr.toFixed(4)}</p>
                        <p className="text-[10px] text-crm-text-faint mt-1">{fxRates.cadSource ?? "Google Finance"}</p>
                        <p className="text-[10px] text-crm-text-muted mt-2">
                          Ahmed: <span className="font-bold text-crm-text-secondary tabular-nums">{ah.cadToPkrRate}</span>
                          {" · "}
                          Sharjeel: <span className="font-bold text-crm-text-secondary tabular-nums">{sn.cadToPkrRate}</span>
                        </p>
                      </div>
                    </div>

                    <p className="text-[10px] text-crm-text-faint text-right">
                      Source: {fxRates.source === "google" ? "Google Finance" : fxRates.source}
                      {" · "}
                      {formatEstDateTime(fxRates.fetchedAt)}
                    </p>
                  </div>
                ) : null}
              </div>
              )}
            </div>

            <div id="currency-formula" className={`w-full ${BENTO_CARD} overflow-hidden scroll-mt-[80px]`}>
              <div className="px-4 sm:px-5 py-3 border-b border-crm-border-subtle bg-gradient-to-r from-[#FFF8F9] to-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setFormulaExpanded(v => !v)}
                  className="min-w-0 flex-1 text-left flex items-start gap-2"
                  aria-expanded={formulaExpanded}
                >
                  <ChevronDown
                    size={16}
                    className={`mt-0.5 shrink-0 text-[#1B6FE8] transition-transform ${formulaExpanded ? "" : "-rotate-90"}`}
                  />
                  <div className="min-w-0">
                    <h2 className="font-extrabold text-crm-text text-sm tracking-tight">Currency Payment Formula</h2>
                    <p className="text-[11px] text-crm-text-faint mt-0.5">Collected from project payments (by month) · eye for rates · {acc.recordDate}</p>
                  </div>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  {viewTab !== "ALL" && (
                    <button
                      type="button"
                      onClick={() => setFormulaOpen(true)}
                      className="h-9 w-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 inline-flex items-center justify-center transition-colors"
                      title={`Edit ${viewTab} currency formula`}
                    >
                      <Eye size={16} />
                    </button>
                  )}
                  <div className="inline-flex rounded-xl border border-crm-border/80 bg-[#F4F5F8] p-0.5 overflow-x-auto max-w-[min(100vw-8rem,520px)]">
                    {(["AH", "SN", "CHQ", "HM", "ALL"] as const).map(tab => {
                      const selected = viewTab === tab;
                      return (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => {
                            setViewTab(tab);
                            setFormulaOpen(false);
                          }}
                          className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap ${
                            selected
                              ? "bg-[#1B6FE8] text-white shadow-md shadow-[#1B6FE8]/20"
                              : "text-crm-text-secondary hover:bg-crm-surface-raised"
                          }`}
                          title={CURRENCY_TAB_LABELS[tab]}
                        >
                          {CURRENCY_TAB_SHORT[tab]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {formulaExpanded && (
              <>
              <p className="px-4 sm:px-5 pt-2.5 text-[11px] text-crm-text-muted leading-snug">{formulaNote}</p>

              {viewTab === "ALL" ? (
                <div className="p-3 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([
                    { key: "AH" as const, label: "Ahmed Hamza", accent: "text-[#1B6FE8]", calc: ahCalc, note: "FX · 11% tax keep 0.89" },
                    { key: "SN" as const, label: "Sharjeel Nasir", accent: "text-[#0B84F3]", calc: snCalc, note: "CAD · tax 0.945" },
                    { key: "CHQ" as const, label: "Cheque Payment", accent: "text-[#D97706]", calc: chqCalc, note: "25% tax deduction" },
                    { key: "HM" as const, label: "Direct Habib Metro", accent: "text-[#12B76A]", calc: hmCalc, note: "1% tax deduction" },
                  ]).map(card => (
                    <div key={card.key} className="rounded-xl border border-crm-border-subtle bg-[#FAFBFC] p-3.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${card.accent}`}>{card.label}</p>
                        <button
                          type="button"
                          onClick={() => { setViewTab(card.key); setFormulaOpen(true); }}
                          className="h-7 w-7 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 inline-flex items-center justify-center"
                          title={`Edit ${card.label}`}
                        >
                          <Eye size={13} />
                        </button>
                      </div>
                      {isLocalPaymentTab(card.key) ? (
                        <>
                          <p className="text-xs text-crm-text-secondary">Gross: <span className="font-semibold text-crm-text tabular-nums">{currency(card.calc.pkrGross)}</span></p>
                          <p className="text-xs text-crm-text-secondary">Tax: <span className="font-semibold text-red-600 tabular-nums">{currency(card.calc.pkrTax)}</span></p>
                          <p className="text-sm font-extrabold text-crm-text mt-1.5 tabular-nums">Net: {currency(card.calc.total)}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-crm-text-secondary">USD → PKR: <span className="font-semibold text-crm-text tabular-nums">{currency(card.calc.usdInPkr)}</span></p>
                          <p className="text-xs text-crm-text-secondary">CAD → PKR: <span className="font-semibold text-crm-text tabular-nums">{currency(card.calc.cadInPkr)}</span></p>
                          <p className="text-sm font-extrabold text-crm-text mt-1.5 tabular-nums">Subtotal: {currency(card.calc.total)}</p>
                        </>
                      )}
                      <p className="text-[10px] text-crm-text-faint mt-1">{card.note}</p>
                    </div>
                  ))}
                </div>
              ) : isLocalPaymentTab(viewTab) ? (
                <div className="p-3 sm:p-5 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {([
                      ["Gross PKR", activeCalc.pkrGross],
                      [`Tax ${((active.taxDeductionRate ?? 0) * 100).toFixed(0)}%`, activeCalc.pkrTax],
                      ["Net received", activeCalc.pkrNet],
                      ["Keep factor", 1 - (active.taxDeductionRate ?? 0)],
                    ] as const).map(([label, val]) => (
                      <div key={String(label)} className="rounded-lg border border-crm-border-subtle bg-[#FAFBFC] px-2.5 py-2">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-crm-text-faint">{label}</p>
                        <p className="mt-0.5 text-sm font-semibold text-crm-text tabular-nums">{currency(val)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border border-dashed border-crm-border bg-[#F8FAFC] px-3 py-2.5 text-[10px] sm:text-[11px] text-crm-text-secondary font-mono leading-snug">
                    <p>
                      {currency(activeCalc.pkrGross)} − {((active.taxDeductionRate ?? 0) * 100).toFixed(0)}% tax ({currency(activeCalc.pkrTax)}) ={" "}
                      <span className="font-bold text-[#1B6FE8]">{currency(activeCalc.pkrNet)}</span>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 sm:p-5 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                    {([
                      ["USD Payment", active.usdAmount],
                      ["USD Tax", active.usdTaxFactor],
                      ["USD → PKR", active.usdToPkrRate],
                      ["CAD Payment", active.cadAmount],
                      ["CAD Tax", active.cadTaxFactor],
                      ["CAD → PKR", active.cadToPkrRate],
                      ["Direct PKR", active.pkrAmount],
                    ] as const).map(([label, val]) => (
                      <div
                        key={label}
                        className="rounded-lg border border-crm-border-subtle bg-[#FAFBFC] px-2.5 py-2"
                      >
                        <p className="text-[9px] font-bold uppercase tracking-wider text-crm-text-faint">{label}</p>
                        <p className="mt-0.5 text-sm font-semibold text-crm-text tabular-nums">{currency(val)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border border-dashed border-crm-border bg-[#F8FAFC] px-3 py-2.5 text-[10px] sm:text-[11px] text-crm-text-secondary space-y-0.5 font-mono leading-snug sm:flex sm:gap-8 sm:space-y-0">
                    <p>USD: {currency(active.usdAmount)} × {active.usdTaxFactor} × {active.usdToPkrRate} = <span className="font-bold text-crm-text">{currency(activeCalc.usdInPkr)}</span></p>
                    <p>CAD: {currency(active.cadAmount)} × {active.cadTaxFactor} × {active.cadToPkrRate} = <span className="font-bold text-crm-text">{currency(activeCalc.cadInPkr)}</span></p>
                  </div>
                </div>
              )}

              <div className="mx-3 sm:mx-5 mb-4 rounded-xl border border-[#F3D7DC] bg-gradient-to-br from-[#FFF6F8] to-white px-3 sm:px-4 py-2.5 text-xs text-crm-text-secondary grid grid-cols-2 sm:grid-cols-4 gap-2">
                {viewTab !== "ALL" && isLocalPaymentTab(viewTab) ? (
                  <>
                    <p><span className="font-bold text-crm-text block text-[9px] uppercase tracking-wide">Gross</span><span className="tabular-nums font-semibold">{currency(displayCalc.pkrGross)}</span></p>
                    <p><span className="font-bold text-crm-text block text-[9px] uppercase tracking-wide">Tax</span><span className="tabular-nums font-semibold text-red-600">{currency(displayCalc.pkrTax)}</span></p>
                    <p><span className="font-bold text-crm-text block text-[9px] uppercase tracking-wide">Net</span><span className="tabular-nums font-semibold">{currency(displayCalc.pkrNet)}</span></p>
                    <p><span className="font-extrabold text-[#1B6FE8] block text-[9px] uppercase tracking-wide">Total</span><span className="tabular-nums font-extrabold text-[#1B6FE8]">{currency(displayCalc.total)}</span></p>
                  </>
                ) : (
                  <>
                    <p><span className="font-bold text-crm-text block text-[9px] uppercase tracking-wide">USD PKR</span><span className="tabular-nums font-semibold">{currency(displayCalc.usdInPkr)}</span></p>
                    <p><span className="font-bold text-crm-text block text-[9px] uppercase tracking-wide">CAD PKR</span><span className="tabular-nums font-semibold">{currency(displayCalc.cadInPkr)}</span></p>
                    <p><span className="font-bold text-crm-text block text-[9px] uppercase tracking-wide">Local Net PKR</span><span className="tabular-nums font-semibold">{currency(displayCalc.pkrAmount)}</span></p>
                    <p><span className="font-extrabold text-[#1B6FE8] block text-[9px] uppercase tracking-wide">Total</span><span className="tabular-nums font-extrabold text-[#1B6FE8]">{currency(displayCalc.total)}</span></p>
                  </>
                )}
              </div>
              </>
              )}
            </div>

            <div className="w-full">
              <AccountsChartCard
                title="Payment Split"
                subtitle="Ahmed Hamza · Sharjeel Nasir · Cheque · Habib Metro · USD / CAD / PKR"
                accent="#1B6FE8"
                icon={<PieIcon size={16} />}
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 items-center">
                  <RechartsBox height={240}>
                    <PieChart>
                      <Pie
                        data={paymentSplitPie}
                        dataKey="amount"
                        nameKey="name"
                        innerRadius={52}
                        outerRadius={88}
                        paddingAngle={3}
                        stroke="#fff"
                        strokeWidth={2}
                      >
                        {paymentSplitPie.map(row => (
                          <Cell key={row.name} fill={row.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={v => currency(Number(v ?? 0))} />
                      <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                    </PieChart>
                  </RechartsBox>
                  <RechartsBox height={240}>
                    <BarChart data={paymentSplit} barSize={18} margin={{ left: -8, right: 8, top: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} />
                      <YAxis tick={{ fontSize: 9 }} width={44} tickFormatter={compactPkr} />
                      <Tooltip formatter={v => currency(Number(v ?? 0))} />
                      <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                      <Bar dataKey="USD" fill="#0B84F3" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="CAD" fill="#0D9488" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="PKR" fill="#1B6FE8" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </RechartsBox>
                </div>
              </AccountsChartCard>
            </div>

            <div className="flex items-center gap-2.5 px-0.5 pt-1">
              <span className="w-1 h-6 rounded-full bg-[#1B6FE8] shrink-0" />
              <h2 className="font-extrabold text-crm-text text-sm tracking-tight">Financial Insights</h2>
              <span className="text-[11px] text-crm-text-faint font-medium">{periodHint}</span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
              <AccountsChartCard
                title="P&L Overview"
                subtitle="Revenue · Expense · Net profit"
                accent="#12B76A"
                icon={<Activity size={16} />}
              >
                <RechartsBox height={230}>
                  <ComposedChart data={pnlComposed} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dashPnlArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1B6FE8" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#1B6FE8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} />
                    <YAxis tick={{ fontSize: 9 }} width={44} tickFormatter={compactPkr} />
                    <Tooltip formatter={v => currency(Number(v ?? 0))} />
                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                    <Bar dataKey="amount" name="Amount" radius={[8, 8, 0, 0]} maxBarSize={42}>
                      <Cell fill="#12B76A" />
                      <Cell fill="#1B6FE8" />
                      <Cell fill="#0B84F3" />
                    </Bar>
                    <Area
                      type="monotone"
                      dataKey="marker"
                      name="Net profit"
                      stroke="#1B6FE8"
                      strokeWidth={2}
                      fill="url(#dashPnlArea)"
                      dot={{ r: 4, fill: "#1B6FE8", stroke: "#fff", strokeWidth: 2 }}
                    />
                  </ComposedChart>
                </RechartsBox>
              </AccountsChartCard>

              <AccountsChartCard
                title="P&L Breakdown"
                subtitle="Income statement lines"
                accent="#0B84F3"
                icon={<BarChart3 size={16} />}
              >
                <RechartsBox height={230}>
                  <BarChart data={pnlHorizontal} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={compactPkr} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} width={78} />
                    <Tooltip formatter={v => currency(Number(v ?? 0))} />
                    <Bar dataKey="value" radius={[0, 8, 8, 0]} maxBarSize={18}>
                      {pnlHorizontal.map(row => (
                        <Cell key={row.name} fill={row.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </RechartsBox>
              </AccountsChartCard>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 w-full">
              <AccountsChartCard
                title="Expense Mix"
                subtitle="Payroll · OPEX · Loans · PF"
                accent="#1B6FE8"
                icon={<PieIcon size={16} />}
              >
                <RechartsBox height={220}>
                  <PieChart>
                    <Pie
                      data={
                        expenseMix.some(r => r.value > 0)
                          ? expenseMix.filter(r => r.value > 0)
                          : [{ name: "Empty", value: 1, color: "#E2E8F0" }]
                      }
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={3}
                      stroke="#fff"
                      strokeWidth={2}
                    >
                      {(expenseMix.some(r => r.value > 0) ? expenseMix.filter(r => r.value > 0) : [{ name: "Empty", color: "#E2E8F0" }]).map(row => (
                        <Cell key={row.name} fill={row.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={v => currency(Number(v ?? 0))} />
                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                  </PieChart>
                </RechartsBox>
              </AccountsChartCard>

              <AccountsChartCard
                title="Channel Mix"
                subtitle="USD · CAD · local PKR by payer"
                accent="#F59E0B"
                icon={<Activity size={16} />}
              >
                <RechartsBox height={220}>
                  <AreaChart data={channelMixArea} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} />
                    <YAxis tick={{ fontSize: 9 }} width={44} tickFormatter={compactPkr} />
                    <Tooltip formatter={v => currency(Number(v ?? 0))} />
                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                    <Area type="monotone" dataKey="Ahmed" stackId="ch" stroke="#1B6FE8" fill="#1B6FE8" fillOpacity={0.45} />
                    <Area type="monotone" dataKey="Sharjeel" stackId="ch" stroke="#0B84F3" fill="#0B84F3" fillOpacity={0.4} />
                    <Area type="monotone" dataKey="Cheque" stackId="ch" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.4} />
                    <Area type="monotone" dataKey="Habib" stackId="ch" stroke="#12B76A" fill="#12B76A" fillOpacity={0.4} />
                  </AreaChart>
                </RechartsBox>
              </AccountsChartCard>

              <AccountsChartCard
                title="Net Margin"
                subtitle="Profit as % of revenue"
                accent={profitMarginPct >= 0 ? "#12B76A" : "#1B6FE8"}
                icon={<TrendingUp size={16} />}
                className="md:col-span-2 xl:col-span-1"
              >
                <div className="relative">
                  <RechartsBox height={220}>
                    <RadialBarChart
                      data={marginGauge}
                      innerRadius="62%"
                      outerRadius="90%"
                      startAngle={90}
                      endAngle={-270}
                    >
                      <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                      <RadialBar
                        dataKey="value"
                        cornerRadius={12}
                        background={{ fill: "#F1F5F9" }}
                      />
                      <Tooltip formatter={v => `${Number(v ?? 0).toFixed(1)}%`} />
                    </RadialBarChart>
                  </RechartsBox>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p
                      className="text-2xl font-extrabold tabular-nums tracking-tight"
                      style={{ color: profitMarginPct >= 0 ? "#12B76A" : "#1B6FE8" }}
                    >
                      {Number.isFinite(profitMarginPct) ? `${profitMarginPct.toFixed(1)}%` : "—"}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-crm-text-faint mt-0.5">
                      {currency(isProfit)}
                    </p>
                  </div>
                </div>
              </AccountsChartCard>
            </div>
          </section>
        </AccountsPageShell>

        <CurrencyFormulaModal
          open={formulaOpen && viewTab !== "ALL"}
          tab={activeKey}
          value={active}
          onClose={() => setFormulaOpen(false)}
          onChange={(key, val) => setTabField(activeKey, key, val)}
        />

        <FormulaBookModal
          open={formulaBookOpen}
          onClose={() => setFormulaBookOpen(false)}
          value={formulasState}
          onChange={handleFormulasChange}
          liveNotes={formulaLiveNotes}
        />
      </main>
    </div>
  );
}
