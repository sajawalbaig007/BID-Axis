/** Shared Currency Payment Formula math (AH / SN / CHQ / HM). */

import type { CurrencyTabKey, DashboardCurrency, DashboardCurrencyTab } from "../types";

export const CURRENCY_TAB_DEFAULTS: Record<CurrencyTabKey, DashboardCurrencyTab> = {
  SN: {
    usdAmount: 0,
    cadAmount: 0,
    pkrAmount: 0,
    usdToPkrRate: 280,
    cadToPkrRate: 200,
    usdTaxFactor: 1,
    cadTaxFactor: 0.945,
  },
  AH: {
    usdAmount: 0,
    cadAmount: 0,
    pkrAmount: 0,
    usdToPkrRate: 280,
    cadToPkrRate: 200,
    usdTaxFactor: 0.89,
    cadTaxFactor: 0.89,
  },
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

export type CurrencyTabCalc = {
  usdAfterTax: number;
  cadAfterTax: number;
  usdInPkr: number;
  cadInPkr: number;
  pkrGross: number;
  pkrTax: number;
  pkrNet: number;
  total: number;
};

export function calcCurrencyTab(t: DashboardCurrencyTab): CurrencyTabCalc {
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

  const usdAfterTax = (Number(t.usdAmount) || 0) * (Number(t.usdTaxFactor) || 1);
  const cadAfterTax = (Number(t.cadAmount) || 0) * (Number(t.cadTaxFactor) || 1);
  const usdInPkr = usdAfterTax * (Number(t.usdToPkrRate) || 0);
  const cadInPkr = cadAfterTax * (Number(t.cadToPkrRate) || 0);
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

/** Migrate older single-block currency saves into SN/AH/CHQ/HM tabs. */
export function normalizeCurrency(raw: DashboardCurrency | undefined | null): DashboardCurrency {
  const base: DashboardCurrency = {
    tabs: {
      SN: { ...CURRENCY_TAB_DEFAULTS.SN },
      AH: { ...CURRENCY_TAB_DEFAULTS.AH },
      CHQ: { ...CURRENCY_TAB_DEFAULTS.CHQ },
      HM: { ...CURRENCY_TAB_DEFAULTS.HM },
    },
  };
  if (!raw) return base;

  const mergeFx = (key: "AH" | "SN", locked: Partial<DashboardCurrencyTab>) => ({
    ...CURRENCY_TAB_DEFAULTS[key],
    ...(raw.tabs?.[key] ?? {}),
    ...locked,
  });

  if (raw.tabs?.SN && raw.tabs?.AH) {
    return {
      tabs: {
        AH: mergeFx("AH", { usdTaxFactor: 0.89, cadTaxFactor: 0.89 }),
        SN: mergeFx("SN", { cadTaxFactor: 0.945 }),
        CHQ: {
          ...CURRENCY_TAB_DEFAULTS.CHQ,
          ...(raw.tabs.CHQ ?? {}),
          taxDeductionRate: 0.25,
          usdAmount: 0,
          cadAmount: 0,
        },
        HM: {
          ...CURRENCY_TAB_DEFAULTS.HM,
          ...(raw.tabs.HM ?? {}),
          taxDeductionRate: 0.01,
          usdAmount: 0,
          cadAmount: 0,
        },
      },
    };
  }

  return {
    tabs: {
      SN: {
        ...CURRENCY_TAB_DEFAULTS.SN,
        usdAmount: raw.usdAmount ?? CURRENCY_TAB_DEFAULTS.SN.usdAmount,
        cadAmount: raw.cadAmount ?? CURRENCY_TAB_DEFAULTS.SN.cadAmount,
        pkrAmount: raw.pkrAmount ?? CURRENCY_TAB_DEFAULTS.SN.pkrAmount,
        usdToPkrRate: raw.usdToPkrRate ?? CURRENCY_TAB_DEFAULTS.SN.usdToPkrRate,
        cadToPkrRate: raw.cadToPkrRate ?? CURRENCY_TAB_DEFAULTS.SN.cadToPkrRate,
      },
      AH: { ...CURRENCY_TAB_DEFAULTS.AH },
      CHQ: { ...CURRENCY_TAB_DEFAULTS.CHQ },
      HM: { ...CURRENCY_TAB_DEFAULTS.HM },
    },
  };
}

/** Merged net from all currency channels — used as Income Statement Total Revenue. */
export function currencyFormulaTotal(raw: DashboardCurrency | undefined | null): number {
  const tabs = normalizeCurrency(raw).tabs;
  return (
    calcCurrencyTab(tabs.AH).total +
    calcCurrencyTab(tabs.SN).total +
    calcCurrencyTab(tabs.CHQ).total +
    calcCurrencyTab(tabs.HM).total
  );
}
